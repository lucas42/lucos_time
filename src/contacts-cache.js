const CONTACTS_URL = process.env.LUCOS_CONTACTS_URL;
const KEY_LUCOS_CONTACTS = process.env.KEY_LUCOS_CONTACTS;
const REFRESH_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

let cache = {
	events: [],
	lastRefreshed: null,
	error: null,
};

async function fetchFromContacts() {
	const response = await fetch(`${CONTACTS_URL}/events/today`, {
		headers: {
			'User-Agent': process.env.SYSTEM || 'lucos_time',
			'Authorization': `Key ${KEY_LUCOS_CONTACTS}`,
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

export function getContactsCacheStatus() {
	return {
		populated: cache.lastRefreshed !== null,
		lastRefreshed: cache.lastRefreshed ? cache.lastRefreshed.toISOString() : null,
		error: cache.error,
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
}

// Exported for testing
export { REFRESH_INTERVAL_MS };
