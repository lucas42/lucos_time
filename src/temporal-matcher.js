import { Temporal } from '@js-temporal/polyfill';

const TIME_ZONE = 'Europe/London';

// Calendars whose temporal_id is populated in eolas are evaluated automatically.
// No hardcoded calendar-name → Temporal ID mapping needed here.

// Suppress repeated polyfill warnings: emit at most once per (calendar, UTC day).
// Resets automatically when the UTC date rolls over (checked against `now` on each call).
let _polyfillWarnedSet = new Set();
let _polyfillWarnDate = '';

// For each calendar in the cache with a temporal_id, we compute the current
// ZonedDateTime in that calendar system and match months by temporalMonthCode.
//
// Month matching: compare zdt.monthCode against month.temporalMonthCode.
// monthCode is stable across leap/non-leap years (unlike .month, which shifts
// in Hebrew leap years when Adar II is inserted before Nisan).
//
// Day-of-week matching: zdt.dayOfWeek is 1=Monday…7=Sunday (ISO 8601),
// which matches eolas's DayOfWeek.order field directly.

export function getCurrentItems(cacheItems, now) {
	if (!now) now = new Date();

	const instant = Temporal.Instant.fromEpochMilliseconds(now.getTime());
	// Base ZonedDateTime in London timezone with ISO calendar (used for dayOfWeek)
	const zdtLondon = instant.toZonedDateTimeISO(TIME_ZONE);

	const items = [];
	const seenUris = new Set();
	const currentFestivalUris = [];

	function addItem(item) {
		if (seenUris.has(item.uri)) return;
		seenUris.add(item.uri);
		items.push({ uri: item.uri, name: item.name, type: item.type });
	}

	// Match DayOfWeek — dayOfWeek is 1=Monday…7=Sunday in both Temporal and eolas
	for (const dow of cacheItems.daysOfWeek) {
		if (dow.order === zdtLondon.dayOfWeek) {
			addItem(dow);
		}
	}

	// Build a month lookup map for FestivalPeriod matching
	const monthByUri = new Map(cacheItems.months.map(m => [m.uri, m]));

	// For each calendar with a Temporal ID, compute the current date and match months/festivals
	const currentMonthUris = new Set();
	// monthDayMap: monthUri → day-of-month in that calendar (for fallback festival day matching)
	const monthDayMap = new Map();
	// zdtByCalendar: calUri → zdt (for FestivalPeriod date-range matching)
	const zdtByCalendar = new Map();
	const evaluatedCalendarNames = [];

	for (const [calUri, cal] of cacheItems.calendars) {
		if (!cal.temporalId) continue; // skip calendars without a Temporal ID

		// Eagerly probe monthCode and day so any polyfill bug throws here, not inside the inner loop.
		// If a calendar throws, log it and skip rather than crashing the whole request.
		let zdt;
		try {
			zdt = zdtLondon.withCalendar(cal.temporalId);
			void zdt.monthCode;
			void zdt.day;
		} catch (e) {
			const todayUtc = now.toISOString().slice(0, 10);
			if (_polyfillWarnDate !== todayUtc) {
				_polyfillWarnDate = todayUtc;
				_polyfillWarnedSet = new Set();
			}
			if (!_polyfillWarnedSet.has(cal.temporalId)) {
				_polyfillWarnedSet.add(cal.temporalId);
				console.error(`Skipping calendar ${cal.name} (${cal.temporalId}):`, e.message);
			}
			continue;
		}
		evaluatedCalendarNames.push(cal.name);
		zdtByCalendar.set(calUri, zdt);

		for (const month of cacheItems.months) {
			if (month.calendarUri !== calUri) continue;
			if (!month.temporalMonthCode) continue;
			if (month.temporalMonthCode !== zdt.monthCode) continue;

			addItem(month);
			currentMonthUris.add(month.uri);
			monthDayMap.set(month.uri, zdt.day);
		}
	}

	// Check whether a single FestivalPeriod is current given the computed calendar states.
	// Duration semantics (from lucos_eolas):
	//   - startDay null:                    whole month matches
	//   - startDay set, durationDays null:  one day
	//   - startDay set, durationDays set:   durationDays consecutive days starting from startDay
	// Cross-month and cross-year boundaries are handled by Temporal.PlainDate.add({ days }).
	function isFestivalPeriodCurrent(period) {
		const { startMonthUri, startDay, durationDays } = period;
		if (!startMonthUri) return false;

		const month = monthByUri.get(startMonthUri);
		if (!month || !month.calendarUri || !month.temporalMonthCode) return false;

		const zdt = zdtByCalendar.get(month.calendarUri);
		if (!zdt) return false;

		// startDay null → match entire month
		if (startDay === null) {
			return zdt.monthCode === month.temporalMonthCode;
		}

		// startDay set → compute date range
		const today = zdt.toPlainDate();
		const calId = zdt.calendarId;

		// Try current year first, then year-1 to handle cross-year-boundary periods
		// (e.g. a period that started late last year and is still ongoing this year).
		for (const year of [today.year, today.year - 1]) {
			try {
				const startDate = Temporal.PlainDate.from({
					calendar: calId,
					year,
					monthCode: month.temporalMonthCode,
					day: startDay,
				});
				// durationDays null or 1 → single day; otherwise span durationDays consecutive days
				const spanDays = (durationDays !== null && durationDays > 1) ? durationDays - 1 : 0;
				const endDate = spanDays > 0 ? startDate.add({ days: spanDays }) : startDate;

				if (Temporal.PlainDate.compare(today, startDate) >= 0 &&
					Temporal.PlainDate.compare(today, endDate) <= 0) {
					return true;
				}
			} catch {
				// Invalid date for this calendar (e.g. a start_day that doesn't exist in a leap year);
				// skip and try the next year.
			}
		}
		return false;
	}

	// Match Festivals — additive: current if day_of_month/month matches OR any FestivalPeriod matches.
	// day_of_month/month models the festival's defining day and is always checked.
	// FestivalPeriods model additional thematic windows and are checked independently.
	// Both paths are checked regardless of whether periods exist.
	for (const festival of cacheItems.festivals) {
		const dayMonthCurrent = !!(festival.monthUri &&
			currentMonthUris.has(festival.monthUri) &&
			(festival.dayOfMonth === null || festival.dayOfMonth === monthDayMap.get(festival.monthUri)));

		const periodsCurrent = (cacheItems.festivalPeriods?.get(festival.uri) ?? []).some(isFestivalPeriodCurrent);

		if (dayMonthCurrent || periodsCurrent) {
			addItem(festival);
			currentFestivalUris.push(festival.uri);
		}
	}

	// Match HistoricalEvents transitively via commemorates
	for (const festivalUri of currentFestivalUris) {
		const commemorated = cacheItems.commemoratesMap.get(festivalUri) || [];
		for (const eventUri of commemorated) {
			const event = cacheItems.historicalEvents.get(eventUri);
			if (event) {
				addItem(event);
			}
		}
	}

	return {
		items,
		evaluated_calendars: evaluatedCalendarNames,
		timezone: TIME_ZONE,
		as_of: now.toISOString(),
	};
}
