import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { buildCacheFromQuads, parseRdf, verboseErrorMessage, refreshCache, getCache, getCacheStatus, _resetStartedAt, PREDICATES, TYPE_URIS, EOLAS_NS, TIME_NS, RDF_TYPE, RDFS_LABEL, STARTUP_GRACE_PERIOD_MS, STALE_THRESHOLD_MS } from '../eolas-cache.js';

const SAMPLE_TURTLE = `
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix eolas: <https://eolas.l42.eu/ontology/> .
@prefix time: <http://www.w3.org/2006/time#> .
@prefix wdt: <http://www.wikidata.org/prop/direct/> .

<https://example.com/calendar/1/>
    rdf:type eolas:Calendar ;
    rdfs:label "Gregorian" .

<https://example.com/dayofweek/1/>
    rdf:type time:DayOfWeek ;
    rdfs:label "Monday" ;
    eolas:orderInWeek 1 .

<https://example.com/dayofweek/7/>
    rdf:type time:DayOfWeek ;
    rdfs:label "Sunday" ;
    eolas:orderInWeek 7 .

<https://example.com/month/3/>
    rdf:type time:MonthOfYear ;
    rdfs:label "March" ;
    eolas:orderInCalendar 3 ;
    eolas:calendar <https://example.com/calendar/1/> .

<https://example.com/month/12/>
    rdf:type time:MonthOfYear ;
    rdfs:label "December" ;
    eolas:orderInCalendar 12 ;
    eolas:calendar <https://example.com/calendar/1/> .

<https://example.com/festival/1/>
    rdf:type eolas:Festival ;
    rdfs:label "Christmas Day" ;
    eolas:festivalStartsOn [
        time:day 25 ;
        time:MonthOfYear <https://example.com/month/12/>
    ] ;
    wdt:P547 <https://example.com/historicalevent/1/> .

<https://example.com/festival/2/>
    rdf:type eolas:Festival ;
    rdfs:label "March Month Festival" ;
    eolas:festivalStartsOn [
        time:MonthOfYear <https://example.com/month/3/>
    ] .

<https://example.com/historicalevent/1/>
    rdf:type eolas:HistoricalEvent ;
    rdfs:label "The Nativity of Jesus Christ" .
`;

describe('parseRdf', () => {
	it('should parse valid Turtle RDF into quads', async () => {
		const quads = await parseRdf(SAMPLE_TURTLE);
		assert.ok(quads.length > 0);
	});

	it('should reject invalid RDF', async () => {
		await assert.rejects(() => parseRdf('this is not valid rdf {{{'));
	});
});

describe('buildCacheFromQuads', () => {
	it('should extract DaysOfWeek from parsed RDF', async () => {
		const quads = await parseRdf(SAMPLE_TURTLE);
		const cache = buildCacheFromQuads(quads);
		assert.equal(cache.daysOfWeek.length, 2);
		const monday = cache.daysOfWeek.find(d => d.name === 'Monday');
		assert.ok(monday);
		assert.equal(monday.order, 1);
		assert.equal(monday.type, 'DayOfWeek');
	});

	it('should extract Gregorian calendar', async () => {
		const quads = await parseRdf(SAMPLE_TURTLE);
		const cache = buildCacheFromQuads(quads);
		assert.equal(cache.calendars.size, 1);
		const cal = cache.calendars.get('https://example.com/calendar/1/');
		assert.ok(cal);
		assert.equal(cal.name, 'Gregorian');
	});

	it('should extract Months with calendar URIs', async () => {
		const quads = await parseRdf(SAMPLE_TURTLE);
		const cache = buildCacheFromQuads(quads);
		assert.equal(cache.months.length, 2);
		const march = cache.months.find(m => m.name === 'March');
		assert.ok(march);
		assert.equal(march.orderInCalendar, 3);
		assert.equal(march.calendarUri, 'https://example.com/calendar/1/');
	});

	it('should extract Festivals with month and day_of_month', async () => {
		const quads = await parseRdf(SAMPLE_TURTLE);
		const cache = buildCacheFromQuads(quads);
		assert.equal(cache.festivals.length, 2);
		const christmas = cache.festivals.find(f => f.name === 'Christmas Day');
		assert.ok(christmas);
		assert.equal(christmas.dayOfMonth, 25);
		assert.equal(christmas.monthUri, 'https://example.com/month/12/');
	});

	it('should extract Festivals without day_of_month as null', async () => {
		const quads = await parseRdf(SAMPLE_TURTLE);
		const cache = buildCacheFromQuads(quads);
		const marchFest = cache.festivals.find(f => f.name === 'March Month Festival');
		assert.ok(marchFest);
		assert.equal(marchFest.dayOfMonth, null);
	});

	it('should extract HistoricalEvents', async () => {
		const quads = await parseRdf(SAMPLE_TURTLE);
		const cache = buildCacheFromQuads(quads);
		assert.equal(cache.historicalEvents.size, 1);
		const nativity = cache.historicalEvents.get('https://example.com/historicalevent/1/');
		assert.ok(nativity);
		assert.equal(nativity.name, 'The Nativity of Jesus Christ');
	});

	it('should build commemorates map from Festival to HistoricalEvent', async () => {
		const quads = await parseRdf(SAMPLE_TURTLE);
		const cache = buildCacheFromQuads(quads);
		const commemorated = cache.commemoratesMap.get('https://example.com/festival/1/');
		assert.ok(commemorated);
		assert.equal(commemorated.length, 1);
		assert.equal(commemorated[0], 'https://example.com/historicalevent/1/');
	});

	it('should handle empty quads', () => {
		const cache = buildCacheFromQuads([]);
		assert.equal(cache.daysOfWeek.length, 0);
		assert.equal(cache.months.length, 0);
		assert.equal(cache.calendars.size, 0);
		assert.equal(cache.festivals.length, 0);
		assert.equal(cache.historicalEvents.size, 0);
	});
});

describe('verboseErrorMessage', () => {
	it('returns the message when there is no cause', () => {
		const err = new Error('fetch failed');
		assert.equal(verboseErrorMessage(err), 'fetch failed');
	});

	it('appends cause.message when a cause is present', () => {
		const cause = new Error('Connection refused');
		const err = new Error('fetch failed', { cause });
		assert.equal(verboseErrorMessage(err), 'fetch failed: Connection refused');
	});

	it('falls back to message alone when cause has no message', () => {
		const err = new Error('something went wrong');
		err.cause = {};
		assert.equal(verboseErrorMessage(err), 'something went wrong');
	});
});

describe('getCacheStatus', () => {
	beforeEach(() => {
		// Simulate startup is over so tests don't depend on real wall-clock timing
		_resetStartedAt(Date.now() - STARTUP_GRACE_PERIOD_MS - 1000);
	});

	it('startingUp is true when cache is unpopulated and within grace period', () => {
		_resetStartedAt(Date.now()); // just started
		const status = getCacheStatus();
		// Only startingUp if cache is still unpopulated (lastRefreshed === null)
		// We can't force cache state from outside, but we can verify the flag logic:
		// If populated, startingUp must be false regardless of timing
		if (!status.populated) {
			assert.equal(status.startingUp, true);
		} else {
			assert.equal(status.startingUp, false);
		}
	});

	it('startingUp is false after grace period has elapsed', () => {
		_resetStartedAt(Date.now() - STARTUP_GRACE_PERIOD_MS - 1000);
		const status = getCacheStatus();
		assert.equal(status.startingUp, false);
	});

	it('stale is false when lastRefreshed is recent', async () => {
		// Trigger a successful refresh so lastRefreshed is set
		const originalFetch = globalThis.fetch;
		globalThis.fetch = async (url) => {
			if (url.includes('/metadata/all/data/')) return { ok: true, text: async () => '' };
			return { ok: true };
		};
		process.env.EOLAS_URL = 'http://eolas.example';
		process.env.KEY_LUCOS_EOLAS = 'test-key';
		await refreshCache();
		globalThis.fetch = originalFetch;

		const status = getCacheStatus();
		assert.equal(status.populated, true);
		assert.equal(status.stale, false);
	});

	it('stale is true when lastRefreshed is older than STALE_THRESHOLD_MS', async () => {
		// Trigger a refresh, then wind back lastRefreshed via another refresh call with a mocked old date
		const originalFetch = globalThis.fetch;
		const originalDateNow = Date.now;

		// First: do a real refresh to populate the cache
		globalThis.fetch = async (url) => {
			if (url.includes('/metadata/all/data/')) return { ok: true, text: async () => '' };
			return { ok: true };
		};
		process.env.EOLAS_URL = 'http://eolas.example';
		process.env.KEY_LUCOS_EOLAS = 'test-key';
		await refreshCache();
		globalThis.fetch = originalFetch;

		// Then: simulate that Date.now() is well past the stale threshold
		const cache = getCache();
		const staleTime = cache.lastRefreshed.getTime() - STALE_THRESHOLD_MS - 1000;
		// Temporarily override Date.now so getCacheStatus sees the cache as stale
		Date.now = () => cache.lastRefreshed.getTime() + STALE_THRESHOLD_MS + 1000;
		const status = getCacheStatus();
		Date.now = originalDateNow;

		assert.equal(status.populated, true);
		assert.equal(status.stale, true);
	});

	it('stale debug message is included when cache is stale', async () => {
		const originalFetch = globalThis.fetch;
		globalThis.fetch = async (url) => {
			if (url.includes('/metadata/all/data/')) return { ok: true, text: async () => '' };
			return { ok: true };
		};
		process.env.EOLAS_URL = 'http://eolas.example';
		process.env.KEY_LUCOS_EOLAS = 'test-key';
		await refreshCache();
		globalThis.fetch = originalFetch;

		const cache = getCache();
		const originalDateNow = Date.now;
		Date.now = () => cache.lastRefreshed.getTime() + STALE_THRESHOLD_MS + 1000;
		const status = getCacheStatus();
		Date.now = originalDateNow;

		assert.equal(status.stale, true);
		// The lastRefreshed string should be present for the server to include in debug
		assert.ok(status.lastRefreshed);
	});
});

describe('refreshCache', () => {
	let originalFetch;
	let originalEnv;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
		originalEnv = { ...process.env };
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		process.env = originalEnv;
	});

	it('logs to schedule tracker on success', async () => {
		process.env.EOLAS_URL = 'http://eolas.example';
		process.env.KEY_LUCOS_EOLAS = 'test-key';
		process.env.SCHEDULE_TRACKER_ENDPOINT = 'http://tracker.example';
		process.env.SYSTEM = 'lucos_time';

		const calls = [];
		globalThis.fetch = async (url, opts) => {
			calls.push({ url, opts });
			if (url.includes('/metadata/all/data/')) {
				// Return minimal valid Turtle so parsing succeeds
				return {
					ok: true,
					text: async () => '',
				};
			}
			// Schedule tracker call
			return { ok: true };
		};

		await refreshCache();

		const trackerCall = calls.find(c => c.url.includes('report-status'));
		assert.ok(trackerCall, 'Expected a call to schedule tracker');
		const body = JSON.parse(trackerCall.opts.body);
		assert.equal(body.status, 'success');
		assert.equal(body.system, 'lucos_time');
		assert.equal(body.frequency, 3600);
	});

	it('logs error to schedule tracker on fetch failure', async () => {
		process.env.EOLAS_URL = 'http://eolas.example';
		process.env.KEY_LUCOS_EOLAS = 'test-key';
		process.env.SCHEDULE_TRACKER_ENDPOINT = 'http://tracker.example';
		process.env.SYSTEM = 'lucos_time';

		const calls = [];
		globalThis.fetch = async (url, opts) => {
			calls.push({ url, opts });
			if (url.includes('/metadata/all/data/')) {
				const cause = new Error('Connection refused');
				throw new Error('fetch failed', { cause });
			}
			return { ok: true };
		};

		await refreshCache();

		const trackerCall = calls.find(c => c.url.includes('report-status'));
		assert.ok(trackerCall, 'Expected a call to schedule tracker on failure');
		const body = JSON.parse(trackerCall.opts.body);
		assert.equal(body.status, 'error');
		assert.ok(body.message.includes('Connection refused'), `Expected cause in message, got: ${body.message}`);
	});

	it('skips schedule tracker when SCHEDULE_TRACKER_ENDPOINT is not set', async () => {
		process.env.EOLAS_URL = 'http://eolas.example';
		process.env.KEY_LUCOS_EOLAS = 'test-key';
		delete process.env.SCHEDULE_TRACKER_ENDPOINT;

		const calls = [];
		globalThis.fetch = async (url, opts) => {
			calls.push({ url });
			if (url.includes('/metadata/all/data/')) {
				return { ok: true, text: async () => '' };
			}
			return { ok: true };
		};

		await refreshCache();

		const trackerCall = calls.find(c => c.url.includes('report-status'));
		assert.ok(!trackerCall, 'Expected no schedule tracker call when endpoint not configured');
	});
});
