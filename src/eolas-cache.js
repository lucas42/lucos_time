const EOLAS_URL = process.env.EOLAS_URL;
const KEY_LUCOS_EOLAS = process.env.KEY_LUCOS_EOLAS;
const REFRESH_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const STARTUP_GRACE_PERIOD_MS = 60 * 1000; // 1 minute
const STALE_THRESHOLD_MS = 3 * 60 * 60 * 1000; // 3 hours (3× refresh interval)

function buildCacheFromJson(daysOfWeekData, calendarsData, monthsData, festivalsData, historicalEventsData) {
	const daysOfWeek = daysOfWeekData.map(d => ({
		uri: d.uri,
		name: d.name,
		type: 'DayOfWeek',
		order: d.order,
	}));

	const calendars = new Map(calendarsData.map(c => [c.uri, {
		uri: c.uri,
		name: c.name,
	}]));

	const months = monthsData.map(m => ({
		uri: m.uri,
		name: m.name,
		type: 'Month',
		orderInCalendar: m.order_in_calendar,
		calendarUri: m.calendar ? m.calendar.uri : null,
	}));

	const festivals = festivalsData.map(f => ({
		uri: f.uri,
		name: f.name,
		type: 'Festival',
		monthUri: f.month ? f.month.uri : null,
		dayOfMonth: f.day_of_month !== null && f.day_of_month !== undefined ? f.day_of_month : null,
	}));

	const historicalEvents = new Map(historicalEventsData.map(e => [e.uri, {
		uri: e.uri,
		name: e.name,
		type: 'HistoricalEvent',
	}]));

	// Build commemoratesMap from festivals.
	// commemorates is a single FK (not M2M), so each entry is an array of 0 or 1 URIs.
	const commemoratesMap = new Map();
	for (const f of festivalsData) {
		if (f.commemorates) {
			commemoratesMap.set(f.uri, [f.commemorates.uri]);
		}
	}

	return { daysOfWeek, months, calendars, festivals, historicalEvents, commemoratesMap };
}

async function fetchTypeFromEolas(type, headers) {
	const url = `${EOLAS_URL}/metadata/${type}/list/`;
	const response = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
	if (!response.ok) {
		throw new Error(`Eolas returned HTTP ${response.status} for /${type}`);
	}
	return response.json();
}

async function fetchFromEolas() {
	const headers = {
		'User-Agent': 'lucos_time',
		'Authorization': `Key ${KEY_LUCOS_EOLAS}`,
		'Accept': 'application/json',
	};

	const [daysOfWeekData, calendarsData, monthsData, festivalsData, historicalEventsData] = await Promise.all([
		fetchTypeFromEolas('dayofweek', headers),
		fetchTypeFromEolas('calendar', headers),
		fetchTypeFromEolas('month', headers),
		fetchTypeFromEolas('festival', headers),
		fetchTypeFromEolas('historicalevent', headers),
	]);

	return buildCacheFromJson(daysOfWeekData, calendarsData, monthsData, festivalsData, historicalEventsData);
}

let cache = {
	items: buildCacheFromJson([], [], [], [], []),
	lastRefreshed: null,
	error: null,
};

let startedAt = Date.now();

async function reportToScheduleTracker(success, message) {
	const endpoint = process.env.SCHEDULE_TRACKER_ENDPOINT;
	if (!endpoint) return;
	const payload = {
		system: process.env.SYSTEM || 'lucos_time',
		frequency: REFRESH_INTERVAL_MS / 1000,
		status: success ? 'success' : 'error',
		...(message && { message }),
	};
	try {
		const response = await fetch(`${endpoint}/report-status`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload),
			signal: AbortSignal.timeout(5000),
		});
		if (!response.ok) console.warn(`Schedule tracker returned HTTP ${response.status}`);
	} catch (err) {
		console.warn('Failed to update schedule tracker:', err.message);
	}
}

function verboseErrorMessage(error) {
	if (error.cause && error.cause.message) {
		return `${error.message}: ${error.cause.message}`;
	}
	return error.message;
}

export async function refreshCache() {
	try {
		const items = await fetchFromEolas();
		cache = {
			items,
			lastRefreshed: new Date(),
			error: null,
		};
		console.log('Eolas cache refreshed successfully');
		await reportToScheduleTracker(true);
	} catch (error) {
		const detail = verboseErrorMessage(error);
		cache.error = detail;
		console.error('Eolas cache refresh failed:', detail);
		await reportToScheduleTracker(false, detail);
	}
}

export function getCache() {
	return cache;
}

export function getCacheStatus() {
	const now = Date.now();
	const startingUp = !cache.lastRefreshed && (now - startedAt < STARTUP_GRACE_PERIOD_MS);
	const stale = cache.lastRefreshed !== null && (now - cache.lastRefreshed.getTime() > STALE_THRESHOLD_MS);
	return {
		populated: cache.lastRefreshed !== null,
		lastRefreshed: cache.lastRefreshed ? cache.lastRefreshed.toISOString() : null,
		error: cache.error,
		startingUp,
		stale,
	};
}

// For testing only — resets the startup timestamp
export function _resetStartedAt(timestamp = Date.now()) {
	startedAt = timestamp;
}

let refreshInterval = null;

export async function startCache() {
	if (!EOLAS_URL) throw new Error("'EOLAS_URL' environment variable not set");
	if (!KEY_LUCOS_EOLAS) throw new Error("'KEY_LUCOS_EOLAS' environment variable not set");
	await refreshCache();
	refreshInterval = setInterval(refreshCache, REFRESH_INTERVAL_MS);
}

export function stopCache() {
	if (refreshInterval) {
		clearInterval(refreshInterval);
		refreshInterval = null;
	}
}

// Exported for testing
export { buildCacheFromJson, verboseErrorMessage, STARTUP_GRACE_PERIOD_MS, STALE_THRESHOLD_MS };
