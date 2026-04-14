import { Parser } from 'n3';

const EOLAS_URL = process.env.EOLAS_URL;
const KEY_LUCOS_EOLAS = process.env.KEY_LUCOS_EOLAS;
const REFRESH_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const STARTUP_GRACE_PERIOD_MS = 60 * 1000; // 1 minute
const STALE_THRESHOLD_MS = 3 * 60 * 60 * 1000; // 3 hours (3× refresh interval)

const EOLAS_NS = 'https://eolas.l42.eu/ontology/';
const TIME_NS = 'http://www.w3.org/2006/time#';
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const RDFS_LABEL = 'http://www.w3.org/2000/01/rdf-schema#label';
const COMMEMORATES = 'http://www.wikidata.org/prop/direct/P547';

const TYPE_URIS = {
	DayOfWeek: `${TIME_NS}DayOfWeek`,
	Month: `${TIME_NS}MonthOfYear`,
	Festival: `${EOLAS_NS}Festival`,
	HistoricalEvent: `${EOLAS_NS}HistoricalEvent`,
	Calendar: `${EOLAS_NS}Calendar`,
};

const PREDICATES = {
	orderInWeek: `${EOLAS_NS}orderInWeek`,
	orderInCalendar: `${EOLAS_NS}orderInCalendar`,
	calendar: `${EOLAS_NS}calendar`,
	festivalStartsOn: `${EOLAS_NS}festivalStartsOn`,
	timeDay: `${TIME_NS}day`,
	timeMonthOfYear: `${TIME_NS}MonthOfYear`,
	commemorates: COMMEMORATES,
};

function parseRdf(rdfText) {
	return new Promise((resolve, reject) => {
		const quads = [];
		const parser = new Parser();
		parser.parse(rdfText, (error, quad) => {
			if (error) return reject(error);
			if (quad) quads.push(quad);
			else resolve(quads);
		});
	});
}

function extractValue(term) {
	if (!term) return null;
	return term.value;
}

function extractEntities(quads) {
	const entities = new Map();

	for (const quad of quads) {
		const subject = quad.subject.value;
		if (!entities.has(subject)) {
			entities.set(subject, { uri: subject, properties: {} });
		}
		const entity = entities.get(subject);
		const predicate = quad.predicate.value;
		const value = extractValue(quad.object);

		if (predicate === RDF_TYPE) {
			if (!entity.types) entity.types = [];
			entity.types.push(value);
		} else if (predicate === RDFS_LABEL) {
			entity.name = value;
		} else {
			entity.properties[predicate] = value;
		}
	}

	return entities;
}

function buildCache(entities) {
	const items = {
		daysOfWeek: [],
		months: [],
		calendars: new Map(),
		festivals: [],
		historicalEvents: new Map(),
	};

	// First pass: identify calendars
	for (const [uri, entity] of entities) {
		if (entity.types && entity.types.includes(TYPE_URIS.Calendar)) {
			items.calendars.set(uri, {
				uri,
				name: entity.name,
			});
		}
	}

	// Second pass: categorise temporal entities
	for (const [uri, entity] of entities) {
		if (!entity.types) continue;

		if (entity.types.includes(TYPE_URIS.DayOfWeek)) {
			items.daysOfWeek.push({
				uri,
				name: entity.name,
				type: 'DayOfWeek',
				order: parseInt(entity.properties[PREDICATES.orderInWeek], 10),
			});
		} else if (entity.types.includes(TYPE_URIS.Month)) {
			const calendarUri = entity.properties[PREDICATES.calendar];
			items.months.push({
				uri,
				name: entity.name,
				type: 'Month',
				orderInCalendar: parseInt(entity.properties[PREDICATES.orderInCalendar], 10),
				calendarUri,
			});
		} else if (entity.types.includes(TYPE_URIS.Festival)) {
			items.festivals.push({
				uri,
				name: entity.name,
				type: 'Festival',
				monthUri: entity.festivalMonthUri || null,
				dayOfMonth: entity.festivalDayOfMonth !== undefined ? entity.festivalDayOfMonth : null,
			});
		} else if (entity.types.includes(TYPE_URIS.HistoricalEvent)) {
			items.historicalEvents.set(uri, {
				uri,
				name: entity.name,
				type: 'HistoricalEvent',
			});
		}
	}

	return items;
}

function buildCacheFromQuads(quads) {
	const entities = extractEntities(quads);

	// Resolve festival start-date blank nodes:
	// eolas serialises as: <festival> festivalStartsOn _:b . _:b time:day N . _:b time:MonthOfYear <month> .
	// We need to flatten this into monthUri/dayOfMonth on the festival entity.
	const startDayBnodes = new Map(); // bnode id → { day, monthUri }
	const festivalToBnode = new Map(); // festival uri → bnode id

	for (const quad of quads) {
		const pred = quad.predicate.value;
		if (pred === PREDICATES.festivalStartsOn) {
			festivalToBnode.set(quad.subject.value, quad.object.value);
		} else if (pred === PREDICATES.timeDay) {
			const bnode = quad.subject.value;
			if (!startDayBnodes.has(bnode)) startDayBnodes.set(bnode, {});
			startDayBnodes.get(bnode).day = quad.object.value;
		} else if (pred === PREDICATES.timeMonthOfYear) {
			const bnode = quad.subject.value;
			if (!startDayBnodes.has(bnode)) startDayBnodes.set(bnode, {});
			startDayBnodes.get(bnode).monthUri = quad.object.value;
		}
	}

	// Attach resolved start-date fields to festival entities
	for (const [festivalUri, bnodeId] of festivalToBnode) {
		const entity = entities.get(festivalUri);
		const startDay = startDayBnodes.get(bnodeId);
		if (entity && startDay) {
			entity.festivalMonthUri = startDay.monthUri || null;
			entity.festivalDayOfMonth = startDay.day ? parseInt(startDay.day, 10) : null;
		}
	}

	// Handle multiple commemorates relationships per festival
	const commemoratesMap = new Map();
	for (const quad of quads) {
		if (quad.predicate.value === PREDICATES.commemorates) {
			const festivalUri = quad.subject.value;
			if (!commemoratesMap.has(festivalUri)) {
				commemoratesMap.set(festivalUri, []);
			}
			commemoratesMap.get(festivalUri).push(quad.object.value);
		}
	}

	const items = buildCache(entities);
	items.commemoratesMap = commemoratesMap;
	return items;
}

async function fetchFromEolas() {
	const url = `${EOLAS_URL}/metadata/all/data/`;
	const headers = {
		'User-Agent': 'lucos_time',
		'Authorization': `Key ${KEY_LUCOS_EOLAS}`,
		'Accept': 'text/turtle',
	};

	const response = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
	if (!response.ok) {
		throw new Error(`Eolas returned HTTP ${response.status}`);
	}
	const rdfText = await response.text();
	const quads = await parseRdf(rdfText);
	return buildCacheFromQuads(quads);
}

let cache = {
	items: buildCacheFromQuads([]),
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
export { buildCacheFromQuads, parseRdf, verboseErrorMessage, PREDICATES, TYPE_URIS, EOLAS_NS, TIME_NS, RDF_TYPE, RDFS_LABEL, STARTUP_GRACE_PERIOD_MS, STALE_THRESHOLD_MS };
