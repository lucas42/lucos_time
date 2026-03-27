const GREGORIAN_NAMES = ['gregorian'];

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

export function getCurrentItems(cacheItems, now) {
	if (!now) now = new Date();

	// Use London timezone for all calculations
	const londonOptions = { timeZone: 'Europe/London' };
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

	// Match Gregorian Festivals
	const currentFestivalUris = [];
	for (const festival of cacheItems.festivals) {
		if (!festival.monthUri) continue;
		if (!currentGregorianMonthUris.has(festival.monthUri)) continue;

		// If day_of_month is set, must match exactly
		if (festival.dayOfMonth !== null && festival.dayOfMonth !== londonDay) continue;

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
		evaluated_calendars: ['Gregorian'],
		timezone: 'Europe/London',
		as_of: now.toISOString(),
	};
}
