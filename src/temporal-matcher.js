import { Temporal } from '@js-temporal/polyfill';

const TIME_ZONE = 'Europe/London';

// Calendars whose temporal_id is populated in eolas are evaluated automatically.
// No hardcoded calendar-name → Temporal ID mapping needed here.

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

	// For each calendar with a Temporal ID, compute the current date and match months/festivals
	const currentMonthUris = new Set();
	// monthDayMap: monthUri → day-of-month in that calendar (for festival day matching)
	const monthDayMap = new Map();
	const evaluatedCalendarNames = [];

	for (const [calUri, cal] of cacheItems.calendars) {
		if (!cal.temporalId) continue; // skip calendars without a Temporal ID

		const zdt = zdtLondon.withCalendar(cal.temporalId);
		evaluatedCalendarNames.push(cal.name);

		for (const month of cacheItems.months) {
			if (month.calendarUri !== calUri) continue;
			if (!month.temporalMonthCode) continue;
			if (month.temporalMonthCode !== zdt.monthCode) continue;

			addItem(month);
			currentMonthUris.add(month.uri);
			monthDayMap.set(month.uri, zdt.day);
		}
	}

	// Match Festivals against the current months
	for (const festival of cacheItems.festivals) {
		if (!festival.monthUri) continue;
		if (!currentMonthUris.has(festival.monthUri)) continue;

		const calDay = monthDayMap.get(festival.monthUri);
		if (festival.dayOfMonth !== null && festival.dayOfMonth !== calDay) continue;

		addItem(festival);
		currentFestivalUris.push(festival.uri);
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
