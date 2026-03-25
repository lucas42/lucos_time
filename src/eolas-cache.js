import { Parser } from 'n3';

const EOLAS_URL = process.env.EOLAS_URL || 'https://eolas.l42.eu';
const KEY_LUCOS_TIME = process.env.KEY_LUCOS_TIME;
const REFRESH_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

const EOLAS_NS = 'https://eolas.l42.eu/ontology/';
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const RDFS_LABEL = 'http://www.w3.org/2000/01/rdf-schema#label';
const COMMEMORATES = 'http://www.wikidata.org/prop/direct/P547';

const TYPE_URIS = {
	DayOfWeek: `${EOLAS_NS}DayOfWeek`,
	Month: `${EOLAS_NS}Month`,
	Festival: `${EOLAS_NS}Festival`,
	HistoricalEvent: `${EOLAS_NS}HistoricalEvent`,
	Calendar: `${EOLAS_NS}Calendar`,
};

const PREDICATES = {
	order: `${EOLAS_NS}order`,
	orderInCalendar: `${EOLAS_NS}order_in_calendar`,
	calendar: `${EOLAS_NS}calendar`,
	month: `${EOLAS_NS}month`,
	dayOfMonth: `${EOLAS_NS}day_of_month`,
	commemorates: COMMEMORATES,
};

let cache = {
	items: new Map(),
	lastRefreshed: null,
	error: null,
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
		commemoratesMap: new Map(),
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
				order: parseInt(entity.properties[PREDICATES.order], 10),
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
			const monthUri = entity.properties[PREDICATES.month];
			const dayOfMonth = entity.properties[PREDICATES.dayOfMonth]
				? parseInt(entity.properties[PREDICATES.dayOfMonth], 10)
				: null;
			const commemoratesUri = entity.properties[PREDICATES.commemorates] || null;

			items.festivals.push({
				uri,
				name: entity.name,
				type: 'Festival',
				monthUri,
				dayOfMonth,
				commemoratesUri,
			});

			if (commemoratesUri) {
				if (!items.commemoratesMap.has(uri)) {
					items.commemoratesMap.set(uri, []);
				}
				items.commemoratesMap.get(uri).push(commemoratesUri);
			}
		} else if (entity.types.includes(TYPE_URIS.HistoricalEvent)) {
			items.historicalEvents.set(uri, {
				uri,
				name: entity.name,
				type: 'HistoricalEvent',
			});
		}
	}

	// Also collect commemorates from quads where a festival has multiple commemorates relationships
	// (the properties map only stores the last one)
	return items;
}

function buildCacheFromQuads(quads) {
	const entities = extractEntities(quads);

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
	};
	if (KEY_LUCOS_TIME) {
		headers['Authorization'] = 'Basic ' + Buffer.from(`lucos_time:${KEY_LUCOS_TIME}`).toString('base64');
	}

	const response = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
	if (!response.ok) {
		throw new Error(`Eolas returned HTTP ${response.status}`);
	}
	const rdfText = await response.text();
	const quads = await parseRdf(rdfText);
	return buildCacheFromQuads(quads);
}

export async function refreshCache() {
	try {
		const items = await fetchFromEolas();
		cache = {
			items,
			lastRefreshed: new Date(),
			error: null,
		};
	} catch (error) {
		cache.error = error.message;
		// If we've never loaded successfully, keep empty items
		if (!cache.lastRefreshed) {
			cache.items = buildCacheFromQuads([]);
		}
	}
}

export function getCache() {
	return cache;
}

export function getCacheStatus() {
	return {
		populated: cache.lastRefreshed !== null,
		lastRefreshed: cache.lastRefreshed ? cache.lastRefreshed.toISOString() : null,
		error: cache.error,
	};
}

let refreshInterval = null;

export async function startCache() {
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
export { buildCacheFromQuads, parseRdf, PREDICATES, TYPE_URIS, EOLAS_NS, RDF_TYPE, RDFS_LABEL };
