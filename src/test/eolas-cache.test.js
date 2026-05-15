import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { buildCacheFromJson, verboseErrorMessage, refreshCache, getCache, getCacheStatus, startCache, stopCache, _resetStartedAt, _resetCache, _getNextRefreshIntervalMs, STARTUP_GRACE_PERIOD_MS, STALE_THRESHOLD_MS, RETRY_INTERVAL_MS, REFRESH_INTERVAL_MS } from '../eolas-cache.js';

const CALENDAR_URI = 'https://example.com/metadata/calendar/1/';
const MONTH_3_URI = 'https://example.com/metadata/month/3/';
const MONTH_12_URI = 'https://example.com/metadata/month/12/';
const FESTIVAL_1_URI = 'https://example.com/metadata/festival/1/';
const FESTIVAL_2_URI = 'https://example.com/metadata/festival/2/';
const FESTIVAL_PERIOD_1_URI = 'https://example.com/metadata/festivalperiod/1/';
const HIST_EVENT_1_URI = 'https://example.com/metadata/historicalevent/1/';

const SAMPLE_DAYS_OF_WEEK = [
	{ id: 1, uri: 'https://example.com/metadata/dayofweek/1/', name: 'Monday', order: 1 },
	{ id: 7, uri: 'https://example.com/metadata/dayofweek/7/', name: 'Sunday', order: 7 },
];

const SAMPLE_CALENDARS = [
	{ id: 1, uri: CALENDAR_URI, name: 'Gregorian' },
];

const SAMPLE_MONTHS = [
	{
		id: 3, uri: MONTH_3_URI, name: 'March', order_in_calendar: 3,
		calendar: { id: 1, uri: CALENDAR_URI, name: 'Gregorian' },
	},
	{
		id: 12, uri: MONTH_12_URI, name: 'December', order_in_calendar: 12,
		calendar: { id: 1, uri: CALENDAR_URI, name: 'Gregorian' },
	},
];

const SAMPLE_FESTIVALS = [
	{
		id: 1, uri: FESTIVAL_1_URI, name: 'Christmas Day',
		day_of_month: 25,
		month: { id: 12, uri: MONTH_12_URI, name: 'December' },
		commemorates: { id: 1, uri: HIST_EVENT_1_URI, name: 'The Nativity of Jesus Christ' },
	},
	{
		id: 2, uri: FESTIVAL_2_URI, name: 'March Month Festival',
		day_of_month: null,
		month: { id: 3, uri: MONTH_3_URI, name: 'March' },
		commemorates: null,
	},
];

const SAMPLE_HISTORICAL_EVENTS = [
	{ id: 1, uri: HIST_EVENT_1_URI, name: 'The Nativity of Jesus Christ', start_year: null, end_year: null },
];

const SAMPLE_FESTIVAL_PERIODS = [
	{
		id: 1, uri: FESTIVAL_PERIOD_1_URI, name: 'Christmas Day',
		festival: { id: 1, uri: FESTIVAL_1_URI, name: 'Christmas Day' },
		start_day: 25,
		start_month: { id: 12, uri: MONTH_12_URI, name: 'December' },
		duration_days: 1,
	},
];

// Mock fetch that returns sample JSON for each eolas type endpoint
function makeMockFetch({ daysOfWeek = SAMPLE_DAYS_OF_WEEK, calendars = SAMPLE_CALENDARS, months = SAMPLE_MONTHS, festivals = SAMPLE_FESTIVALS, historicalEvents = SAMPLE_HISTORICAL_EVENTS, festivalPeriods = SAMPLE_FESTIVAL_PERIODS } = {}) {
	return async (url, opts) => {
		if (url.includes('/metadata/dayofweek/list/')) return { ok: true, json: async () => daysOfWeek };
		if (url.includes('/metadata/calendar/list/')) return { ok: true, json: async () => calendars };
		if (url.includes('/metadata/month/list/')) return { ok: true, json: async () => months };
		if (url.includes('/metadata/festival/list/')) return { ok: true, json: async () => festivals };
		if (url.includes('/metadata/historicalevent/list/')) return { ok: true, json: async () => historicalEvents };
		if (url.includes('/metadata/festivalperiod/list/')) return { ok: true, json: async () => festivalPeriods };
		// Schedule tracker or other
		return { ok: true };
	};
}

describe('buildCacheFromJson', () => {
	it('should extract DaysOfWeek from JSON data', () => {
		const cache = buildCacheFromJson(SAMPLE_DAYS_OF_WEEK, [], [], [], []);
		assert.equal(cache.daysOfWeek.length, 2);
		const monday = cache.daysOfWeek.find(d => d.name === 'Monday');
		assert.ok(monday);
		assert.equal(monday.order, 1);
		assert.equal(monday.type, 'DayOfWeek');
		assert.equal(monday.uri, 'https://example.com/metadata/dayofweek/1/');
	});

	it('should extract Calendars into a Map keyed by URI', () => {
		const cache = buildCacheFromJson([], SAMPLE_CALENDARS, [], [], []);
		assert.equal(cache.calendars.size, 1);
		const cal = cache.calendars.get(CALENDAR_URI);
		assert.ok(cal);
		assert.equal(cal.name, 'Gregorian');
	});

	it('should extract Months with calendarUri from nested FK dict', () => {
		const cache = buildCacheFromJson([], [], SAMPLE_MONTHS, [], []);
		assert.equal(cache.months.length, 2);
		const march = cache.months.find(m => m.name === 'March');
		assert.ok(march);
		assert.equal(march.orderInCalendar, 3);
		assert.equal(march.calendarUri, CALENDAR_URI);
		assert.equal(march.type, 'Month');
	});

	it('should extract Festivals with monthUri and dayOfMonth from nested FK dict', () => {
		const cache = buildCacheFromJson([], [], [], SAMPLE_FESTIVALS, []);
		assert.equal(cache.festivals.length, 2);
		const christmas = cache.festivals.find(f => f.name === 'Christmas Day');
		assert.ok(christmas);
		assert.equal(christmas.dayOfMonth, 25);
		assert.equal(christmas.monthUri, MONTH_12_URI);
		assert.equal(christmas.type, 'Festival');
	});

	it('should set dayOfMonth to null when day_of_month is null', () => {
		const cache = buildCacheFromJson([], [], [], SAMPLE_FESTIVALS, []);
		const marchFest = cache.festivals.find(f => f.name === 'March Month Festival');
		assert.ok(marchFest);
		assert.equal(marchFest.dayOfMonth, null);
	});

	it('should set monthUri to null when month FK is null', () => {
		const noMonthFestival = [
			{ id: 3, uri: 'https://example.com/metadata/festival/3/', name: 'No Month Festival', day_of_month: null, month: null, commemorates: null },
		];
		const cache = buildCacheFromJson([], [], [], noMonthFestival, []);
		assert.equal(cache.festivals[0].monthUri, null);
	});

	it('should extract HistoricalEvents into a Map keyed by URI', () => {
		const cache = buildCacheFromJson([], [], [], [], SAMPLE_HISTORICAL_EVENTS);
		assert.equal(cache.historicalEvents.size, 1);
		const nativity = cache.historicalEvents.get(HIST_EVENT_1_URI);
		assert.ok(nativity);
		assert.equal(nativity.name, 'The Nativity of Jesus Christ');
		assert.equal(nativity.type, 'HistoricalEvent');
	});

	it('should build commemoratesMap from festivals with a commemorates FK', () => {
		const cache = buildCacheFromJson([], [], [], SAMPLE_FESTIVALS, []);
		const commemorated = cache.commemoratesMap.get(FESTIVAL_1_URI);
		assert.ok(commemorated);
		assert.equal(commemorated.length, 1);
		assert.equal(commemorated[0], HIST_EVENT_1_URI);
	});

	it('should not add an entry to commemoratesMap for festivals with null commemorates', () => {
		const cache = buildCacheFromJson([], [], [], SAMPLE_FESTIVALS, []);
		assert.equal(cache.commemoratesMap.has(FESTIVAL_2_URI), false);
	});

	it('should handle empty arrays for all types', () => {
		const cache = buildCacheFromJson([], [], [], [], []);
		assert.equal(cache.daysOfWeek.length, 0);
		assert.equal(cache.months.length, 0);
		assert.equal(cache.calendars.size, 0);
		assert.equal(cache.festivals.length, 0);
		assert.equal(cache.historicalEvents.size, 0);
		assert.equal(cache.commemoratesMap.size, 0);
		assert.equal(cache.festivalPeriods.size, 0);
	});

	it('should build festivalPeriods map keyed by festival URI', () => {
		const cache = buildCacheFromJson([], [], [], [], [], SAMPLE_FESTIVAL_PERIODS);
		assert.equal(cache.festivalPeriods.size, 1);
		const periods = cache.festivalPeriods.get(FESTIVAL_1_URI);
		assert.ok(periods, 'Expected periods for festival 1');
		assert.equal(periods.length, 1);
		assert.equal(periods[0].startMonthUri, MONTH_12_URI);
		assert.equal(periods[0].startDay, 25);
		assert.equal(periods[0].durationDays, 1);
	});

	it('should group multiple periods under the same festival URI', () => {
		const multiPeriods = [
			{
				id: 1, uri: FESTIVAL_PERIOD_1_URI, name: 'Christmas Day',
				festival: { id: 1, uri: FESTIVAL_1_URI, name: 'Christmas Day' },
				start_day: 25, start_month: { id: 12, uri: MONTH_12_URI, name: 'December' }, duration_days: 1,
			},
			{
				id: 2, uri: 'https://example.com/metadata/festivalperiod/2/', name: 'Christmas Music',
				festival: { id: 1, uri: FESTIVAL_1_URI, name: 'Christmas Day' },
				start_day: 1, start_month: { id: 12, uri: MONTH_12_URI, name: 'December' }, duration_days: 31,
			},
		];
		const cache = buildCacheFromJson([], [], [], [], [], multiPeriods);
		const periods = cache.festivalPeriods.get(FESTIVAL_1_URI);
		assert.ok(periods);
		assert.equal(periods.length, 2);
	});

	it('should handle festival periods with null start_month (startMonthUri becomes null)', () => {
		const noMonthPeriod = [
			{
				id: 3, uri: 'https://example.com/metadata/festivalperiod/3/', name: 'No Month Period',
				festival: { id: 2, uri: FESTIVAL_2_URI, name: 'March Month Festival' },
				start_day: null, start_month: null, duration_days: null,
			},
		];
		const cache = buildCacheFromJson([], [], [], [], [], noMonthPeriod);
		const periods = cache.festivalPeriods.get(FESTIVAL_2_URI);
		assert.ok(periods);
		assert.equal(periods[0].startMonthUri, null);
		assert.equal(periods[0].startDay, null);
		assert.equal(periods[0].durationDays, null);
	});

	it('should return empty festivalPeriods map when no periods are provided', () => {
		const cache = buildCacheFromJson([], [], [], [], [], []);
		assert.equal(cache.festivalPeriods.size, 0);
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
		const originalFetch = globalThis.fetch;
		globalThis.fetch = makeMockFetch();
		process.env.EOLAS_URL = 'http://eolas.example';
		process.env.KEY_LUCOS_EOLAS = 'test-key';
		await refreshCache();
		globalThis.fetch = originalFetch;

		const status = getCacheStatus();
		assert.equal(status.populated, true);
		assert.equal(status.stale, false);
	});

	it('stale is true when lastRefreshed is older than STALE_THRESHOLD_MS', async () => {
		const originalFetch = globalThis.fetch;
		const originalDateNow = Date.now;

		// First: do a real refresh to populate the cache
		globalThis.fetch = makeMockFetch();
		process.env.EOLAS_URL = 'http://eolas.example';
		process.env.KEY_LUCOS_EOLAS = 'test-key';
		await refreshCache();
		globalThis.fetch = originalFetch;

		// Then: simulate that Date.now() is well past the stale threshold
		const cache = getCache();
		Date.now = () => cache.lastRefreshed.getTime() + STALE_THRESHOLD_MS + 1000;
		const status = getCacheStatus();
		Date.now = originalDateNow;

		assert.equal(status.populated, true);
		assert.equal(status.stale, true);
	});

	it('stale debug message is included when cache is stale', async () => {
		const originalFetch = globalThis.fetch;
		globalThis.fetch = makeMockFetch();
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

	it('issues parallel requests to all six eolas type endpoints', async () => {
		process.env.EOLAS_URL = 'http://eolas.example';
		process.env.KEY_LUCOS_EOLAS = 'test-key';

		const urls = [];
		globalThis.fetch = async (url, opts) => {
			urls.push(url);
			return { ok: true, json: async () => [] };
		};

		await refreshCache();

		assert.ok(urls.some(u => u.includes('/metadata/dayofweek/list/')), 'Expected dayofweek request');
		assert.ok(urls.some(u => u.includes('/metadata/calendar/list/')), 'Expected calendar request');
		assert.ok(urls.some(u => u.includes('/metadata/month/list/')), 'Expected month request');
		assert.ok(urls.some(u => u.includes('/metadata/festival/list/')), 'Expected festival request');
		assert.ok(urls.some(u => u.includes('/metadata/historicalevent/list/')), 'Expected historicalevent request');
		assert.ok(urls.some(u => u.includes('/metadata/festivalperiod/list/')), 'Expected festivalperiod request');
	});

	it('sends Authorization header in the Key scheme to all eolas endpoints', async () => {
		process.env.EOLAS_URL = 'http://eolas.example';
		process.env.KEY_LUCOS_EOLAS = 'secret-key';

		const headers = [];
		globalThis.fetch = async (url, opts) => {
			if (url.includes('/metadata/') && url.includes('/list/')) {
				headers.push(opts.headers);
			}
			return { ok: true, json: async () => [] };
		};

		await refreshCache();

		// Six endpoints — one header object per request
		assert.equal(headers.length, 6, 'Expected one header set per eolas endpoint');
		for (const h of headers) {
			assert.ok(h['Authorization'], 'Authorization header should be present');
			assert.ok(h['Authorization'].startsWith('Key '), `Expected "Key ..." header, got: ${h['Authorization']}`);
		}
	});

	it('populates the cache with data from all six endpoints', async () => {
		process.env.EOLAS_URL = 'http://eolas.example';
		process.env.KEY_LUCOS_EOLAS = 'test-key';
		globalThis.fetch = makeMockFetch();

		await refreshCache();

		const cache = getCache();
		assert.equal(cache.items.daysOfWeek.length, 2);
		assert.equal(cache.items.calendars.size, 1);
		assert.equal(cache.items.months.length, 2);
		assert.equal(cache.items.festivals.length, 2);
		assert.equal(cache.items.historicalEvents.size, 1);
		assert.equal(cache.items.commemoratesMap.size, 1);
		assert.equal(cache.items.festivalPeriods.size, 1);
	});

	it('logs to schedule tracker on success', async () => {
		process.env.EOLAS_URL = 'http://eolas.example';
		process.env.KEY_LUCOS_EOLAS = 'test-key';
		process.env.SCHEDULE_TRACKER_ENDPOINT = 'http://tracker.example/v2/report-status';
		process.env.SYSTEM = 'lucos_time';

		const calls = [];
		globalThis.fetch = async (url, opts) => {
			calls.push({ url, opts });
			if (url.includes('/metadata/') && url.includes('/list/')) {
				return { ok: true, json: async () => [] };
			}
			// Schedule tracker call
			return { ok: true };
		};

		await refreshCache();

		const trackerCall = calls.find(c => c.url.includes('report-status'));
		assert.ok(trackerCall, 'Expected a call to schedule tracker');
		// Regression guard: SCHEDULE_TRACKER_ENDPOINT already contains /v2/report-status,
		// so the URL must not be doubled.
		assert.equal(trackerCall.url, 'http://tracker.example/v2/report-status', 'URL must not double the /v2/report-status path');
		// ADR-0001: User-Agent must be set to the SYSTEM env var value.
		assert.equal(trackerCall.opts.headers['User-Agent'], 'lucos_time', 'User-Agent must be set per ADR-0001');
		const body = JSON.parse(trackerCall.opts.body);
		assert.equal(body.status, 'success');
		assert.equal(body.system, 'lucos_time');
		assert.equal(body.job_name, 'eolas-cache');
		assert.equal(body.frequency, 3600);
	});

	it('logs error to schedule tracker on fetch failure', async () => {
		process.env.EOLAS_URL = 'http://eolas.example';
		process.env.KEY_LUCOS_EOLAS = 'test-key';
		process.env.SCHEDULE_TRACKER_ENDPOINT = 'http://tracker.example/v2/report-status';
		process.env.SYSTEM = 'lucos_time';

		const calls = [];
		globalThis.fetch = async (url, opts) => {
			calls.push({ url, opts });
			if (url.includes('/metadata/dayofweek/list/')) {
				const cause = new Error('Connection refused');
				throw new Error('fetch failed', { cause });
			}
			if (url.includes('/metadata/') && url.includes('/list/')) {
				return { ok: true, json: async () => [] };
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

	it('logs error when any eolas endpoint returns a non-ok status', async () => {
		process.env.EOLAS_URL = 'http://eolas.example';
		process.env.KEY_LUCOS_EOLAS = 'test-key';
		process.env.SCHEDULE_TRACKER_ENDPOINT = 'http://tracker.example/v2/report-status';

		const calls = [];
		globalThis.fetch = async (url, opts) => {
			calls.push({ url, opts });
			if (url.includes('/metadata/festival/list/')) {
				return { ok: false, status: 403 };
			}
			if (url.includes('/metadata/') && url.includes('/list/')) {
				return { ok: true, json: async () => [] };
			}
			return { ok: true };
		};

		await refreshCache();

		const trackerCall = calls.find(c => c.url.includes('report-status'));
		assert.ok(trackerCall, 'Expected a call to schedule tracker on failure');
		const body = JSON.parse(trackerCall.opts.body);
		assert.equal(body.status, 'error');
		assert.ok(body.message.includes('403'), `Expected HTTP 403 in message, got: ${body.message}`);
	});

	it('skips schedule tracker when SCHEDULE_TRACKER_ENDPOINT is not set', async () => {
		process.env.EOLAS_URL = 'http://eolas.example';
		process.env.KEY_LUCOS_EOLAS = 'test-key';
		delete process.env.SCHEDULE_TRACKER_ENDPOINT;

		const calls = [];
		globalThis.fetch = async (url, opts) => {
			calls.push({ url });
			if (url.includes('/metadata/') && url.includes('/list/')) {
				return { ok: true, json: async () => [] };
			}
			return { ok: true };
		};

		await refreshCache();

		const trackerCall = calls.find(c => c.url.includes('report-status'));
		assert.ok(!trackerCall, 'Expected no schedule tracker call when endpoint not configured');
	});
});

describe('retry interval selection', () => {
	let originalFetch;
	let originalEnv;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
		originalEnv = { ...process.env };
		process.env.EOLAS_URL = 'http://eolas.example';
		process.env.KEY_LUCOS_EOLAS = 'test-key';
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		process.env = originalEnv;
	});

	it('RETRY_INTERVAL_MS is shorter than REFRESH_INTERVAL_MS', () => {
		assert.ok(RETRY_INTERVAL_MS < REFRESH_INTERVAL_MS,
			'Retry interval must be shorter than normal refresh interval for self-healing to work');
	});

	// _getNextRefreshIntervalMs is tested via refreshCache rather than startCache because
	// EOLAS_URL is captured at module load time (as undefined in tests), so the guard in
	// startCache always throws. Calling refreshCache directly exercises the same cache state.

	it('returns RETRY_INTERVAL_MS when cache has never been successfully populated (startup failure)', async () => {
		// Reset to initial empty state (previous tests may have populated lastRefreshed)
		_resetCache();
		// Make fetch fail so lastRefreshed stays null
		globalThis.fetch = async () => { throw new Error('Connection refused'); };
		await refreshCache();
		assert.equal(getCache().lastRefreshed, null, 'Cache should still be empty after failed fetch');
		assert.equal(_getNextRefreshIntervalMs(), RETRY_INTERVAL_MS,
			'Should use short retry interval when cache is empty');
	});

	it('returns REFRESH_INTERVAL_MS when cache has been successfully populated', async () => {
		globalThis.fetch = makeMockFetch();
		await refreshCache();
		assert.notEqual(getCache().lastRefreshed, null, 'Cache should be populated after successful fetch');
		assert.equal(_getNextRefreshIntervalMs(), REFRESH_INTERVAL_MS,
			'Should use normal interval once cache is populated');
	});
});
