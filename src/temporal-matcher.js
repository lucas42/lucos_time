import { Temporal } from '@js-temporal/polyfill';

const GREGORIAN_NAMES = ['gregorian'];
const TIME_ZONE = 'Europe/London';

// Maps eolas calendar name (case-insensitive) to the Temporal calendar identifier.
// Gregorian is handled separately via Intl.DateTimeFormat (not listed here).
const EOLAS_CAL_NAME_TO_TEMPORAL_ID = {
	'hebrew': 'hebrew',
	'hijri': 'islamic',
	'chinese': 'chinese',
	'hindu': 'indian',
};

// Hebrew monthCode (Tishrei-first, stable across leap/non-leap years)
// → eolas orderInCalendar (Nisan-first / religious ordering used by eolas)
//
// Temporal uses Tishrei-first: M01=Tishrei, M02=Cheshvan, M03=Kislev, ...
// Eolas uses Nisan-first:      Nisan=1, Iyar=2, ..., Tishrei=7, Kislev=9, ...
//
// monthCode is stable: M07 is always Nisan regardless of whether the year has
// 12 or 13 months (unlike .month which shifts by 1 in leap years).
const HEBREW_MONTH_CODE_TO_EOLAS_ORDER = {
	'M01': 7,   // Tishrei
	'M02': 8,   // Cheshvan
	'M03': 9,   // Kislev
	'M04': 10,  // Tevet
	'M05': 11,  // Shevat
	'M06': 12,  // Adar (non-leap) / Adar I (leap)
	'M06L': 13, // Adar II (leap years only)
	'M07': 1,   // Nisan
	'M08': 2,   // Iyar
	'M09': 3,   // Sivan
	'M10': 4,   // Tammuz
	'M11': 5,   // Av
	'M12': 6,   // Elul
};

function isGregorianCalendar(calendarName) {
	if (!calendarName) return false;
	return GREGORIAN_NAMES.includes(calendarName.toLowerCase());
}

function findGregorianCalendarUri(calendars) {
	for (const [uri, cal] of calendars) {
		if (isGregorianCalendar(cal.name)) {
			return uri;
		}
	}
	return null;
}

// Given a Temporal ZonedDateTime in a non-Gregorian calendar, return the month
// number as stored in eolas (orderInCalendar). Returns null if unrecognised.
function getEolasMonthNumber(zdt, calendarName) {
	if (calendarName.toLowerCase() === 'hebrew') {
		return HEBREW_MONTH_CODE_TO_EOLAS_ORDER[zdt.monthCode] ?? null;
	}
	// For Islamic, Chinese, and Hindu calendars, Temporal's .month matches
	// eolas's orderInCalendar directly.
	return zdt.month;
}

export function getCurrentItems(cacheItems, now) {
	if (!now) now = new Date();

	// Use London timezone for all Gregorian calculations
	const londonOptions = { timeZone: TIME_ZONE };
	const londonDateStr = now.toLocaleDateString('en-GB', {
		...londonOptions,
		year: 'numeric',
		month: 'numeric',
		day: 'numeric',
	});
	const [dayStr, monthStr, yearStr] = londonDateStr.split('/');
	const londonDay = parseInt(dayStr, 10);
	const londonMonth = parseInt(monthStr, 10);

	// Get London day of week (JS: 0=Sunday, Eolas: 1=Monday..7=Sunday)
	const londonWeekdayStr = now.toLocaleDateString('en-GB', {
		...londonOptions,
		weekday: 'long',
	});
	const jsWeekday = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
		.indexOf(londonWeekdayStr);
	const eolasDay = jsWeekday === 0 ? 7 : jsWeekday;

	const items = [];
	const seenUris = new Set();

	function addItem(item) {
		if (seenUris.has(item.uri)) return;
		seenUris.add(item.uri);
		items.push({ uri: item.uri, name: item.name, type: item.type });
	}

	// Match DayOfWeek
	for (const dow of cacheItems.daysOfWeek) {
		if (dow.order === eolasDay) {
			addItem(dow);
		}
	}

	// Find Gregorian calendar URI
	const gregorianUri = findGregorianCalendarUri(cacheItems.calendars);

	// Match Gregorian Months
	const currentGregorianMonthUris = new Set();
	if (gregorianUri) {
		for (const month of cacheItems.months) {
			if (month.calendarUri === gregorianUri && month.orderInCalendar === londonMonth) {
				addItem(month);
				currentGregorianMonthUris.add(month.uri);
			}
		}
	}

	// Non-Gregorian calendar matching using the Temporal polyfill
	// monthDayMap: monthUri → current day of month in that calendar
	const currentNonGregorianMonthUris = new Set();
	const monthDayMap = new Map();
	const evaluatedNonGregorianCalendars = [];

	const instant = Temporal.Instant.fromEpochMilliseconds(now.getTime());
	const zdtISO = instant.toZonedDateTimeISO(TIME_ZONE);

	for (const [calUri, cal] of cacheItems.calendars) {
		const temporalId = EOLAS_CAL_NAME_TO_TEMPORAL_ID[cal.name?.toLowerCase()];
		if (!temporalId) continue; // skip Gregorian and unrecognised calendars

		const zdt = zdtISO.withCalendar(temporalId);
		const eolasMonth = getEolasMonthNumber(zdt, cal.name);
		if (eolasMonth === null) continue;

		evaluatedNonGregorianCalendars.push(cal.name);

		const currentDay = zdt.day;
		for (const month of cacheItems.months) {
			if (month.calendarUri !== calUri) continue;
			if (month.orderInCalendar !== eolasMonth) continue;
			addItem(month);
			currentNonGregorianMonthUris.add(month.uri);
			monthDayMap.set(month.uri, currentDay);
		}
	}

	// Match Festivals (Gregorian and non-Gregorian)
	const currentFestivalUris = [];
	for (const festival of cacheItems.festivals) {
		if (!festival.monthUri) continue;

		if (currentGregorianMonthUris.has(festival.monthUri)) {
			if (festival.dayOfMonth !== null && festival.dayOfMonth !== londonDay) continue;
			addItem(festival);
			currentFestivalUris.push(festival.uri);
		} else if (currentNonGregorianMonthUris.has(festival.monthUri)) {
			const calDay = monthDayMap.get(festival.monthUri);
			if (festival.dayOfMonth !== null && festival.dayOfMonth !== calDay) continue;
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
		evaluated_calendars: ['Gregorian', ...evaluatedNonGregorianCalendars],
		timezone: TIME_ZONE,
		as_of: now.toISOString(),
	};
}
