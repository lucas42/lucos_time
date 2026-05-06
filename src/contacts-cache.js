const CONTACTS_URL = process.env.LUCOS_CONTACTS_URL;
const KEY_LUCOS_CONTACTS = process.env.KEY_LUCOS_CONTACTS;
const REFRESH_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const STARTUP_GRACE_PERIOD_MS = 60 * 1000; // 1 minute
const STALE_THRESHOLD_MS = 3 * 60 * 60 * 1000; // 3 hours (3× refresh interval)

let cache = {
	events: [],
	lastRefreshed: null,
	error: null,
};

let startedAt = Date.now();

async function fetchFromContacts() {
	const response = await fetch(`${CONTACTS_URL}/events/today`, {
		headers: {
			'User-Agent': process.env.SYSTEM || 'lucos_time',
			'Authorization': `Bearer ${KEY_LUCOS_CONTACTS}`,
			'Accept': 'application/json',
		},
		signal: AbortSignal.timeout(30000),
	});
	if (!response.ok) {
		throw new Error(`Contacts returned HTTP ${response.status} for /events/today`);
	}
	return response.json();
}

export async function refreshContactsCache() {
	try {
		const events = await fetchFromContacts();
		cache = { events, lastRefreshed: new Date(), error: null };
		console.log('Contacts cache refreshed successfully');
	} catch (error) {
		cache.error = error.message;
		console.error('Contacts cache refresh failed:', error.message);
	}
}

export function getContactsEvents() {
	return cache.events;
}

export function getContactsItems() {
	return cache.events.map(event => ({
		uri: `${CONTACTS_URL}${event.person_uri}`,
		name: event.person_name,
		type: event.type,
	}));
}

export function getContactsCacheStatus() {
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

let refreshInterval = null;

function scheduleNextRefresh() {
	refreshInterval = setTimeout(async () => {
		await refreshContactsCache();
		scheduleNextRefresh();
	}, REFRESH_INTERVAL_MS);
}

export async function startContactsCache() {
	if (!CONTACTS_URL) throw new Error("'LUCOS_CONTACTS_URL' environment variable not set");
	if (!KEY_LUCOS_CONTACTS) throw new Error("'KEY_LUCOS_CONTACTS' environment variable not set");
	await refreshContactsCache();
	scheduleNextRefresh();
}

export function stopContactsCache() {
	if (refreshInterval) {
		clearTimeout(refreshInterval);
		refreshInterval = null;
	}
}

// For testing only — resets the cache to its initial (unpopulated) state
export function _resetContactsCache() {
	cache = { events: [], lastRefreshed: null, error: null };
	startedAt = Date.now();
}

// Exported for testing
export { REFRESH_INTERVAL_MS };
