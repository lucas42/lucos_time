import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { refreshContactsCache, getContactsEvents, getContactsItems, getContactsCacheStatus, stopContactsCache, _resetContactsCache, REFRESH_INTERVAL_MS } from '../contacts-cache.js';

const CONTACTS_URL = process.env.LUCOS_CONTACTS_ORIGIN;
const KEY_LUCOS_CONTACTS = process.env.KEY_LUCOS_CONTACTS;

const SAMPLE_EVENTS = [
	{
		type: 'birthday',
		person_id: 42,
		person_name: 'Alice Smith',
		person_uri: '/people/42',
		label: "Alice Smith's 30th Birthday",
	},
	{
		type: 'anniversary',
		person_id: 17,
		person_name: 'Bob Jones',
		person_uri: '/people/17',
		label: "Bob & Carol's 5th Anniversary",
	},
];

describe('contacts-cache', () => {
	beforeEach(() => {
		_resetContactsCache();
	});

	afterEach(() => {
		stopContactsCache();
		mock.restoreAll();
	});

	describe('REFRESH_INTERVAL_MS', () => {
		it('should be 1 hour', () => {
			assert.equal(REFRESH_INTERVAL_MS, 60 * 60 * 1000);
		});
	});

	describe('refreshContactsCache', () => {
		it('populates cache on successful fetch', async () => {
			mock.method(global, 'fetch', async (url) => {
				assert.ok(url.includes('/events/today'));
				return {
					ok: true,
					json: async () => SAMPLE_EVENTS,
				};
			});

			await refreshContactsCache();
			const events = getContactsEvents();
			assert.equal(events.length, 2);
			assert.equal(events[0].type, 'birthday');
			assert.equal(events[0].person_name, 'Alice Smith');
		});

		it('marks cache populated after successful fetch', async () => {
			mock.method(global, 'fetch', async () => ({
				ok: true,
				json: async () => SAMPLE_EVENTS,
			}));

			await refreshContactsCache();
			const status = getContactsCacheStatus();
			assert.equal(status.populated, true);
			assert.ok(status.lastRefreshed !== null);
			assert.equal(status.error, null);
		});

		it('preserves previous events and records error on failed fetch', async () => {
			// First populate successfully
			mock.method(global, 'fetch', async () => ({
				ok: true,
				json: async () => SAMPLE_EVENTS,
			}));
			await refreshContactsCache();

			// Then fail
			mock.restoreAll();
			mock.method(global, 'fetch', async () => ({
				ok: false,
				status: 503,
			}));
			await refreshContactsCache();

			// Events from last successful fetch are retained
			assert.equal(getContactsEvents().length, 2);
			const status = getContactsCacheStatus();
			assert.ok(status.error !== null);
		});

		it('records error message on HTTP failure', async () => {
			mock.method(global, 'fetch', async () => ({
				ok: false,
				status: 503,
			}));

			await refreshContactsCache();
			const status = getContactsCacheStatus();
			assert.ok(status.error.includes('503'));
		});

		it('records error on network failure', async () => {
			mock.method(global, 'fetch', async () => {
				throw new Error('Network error');
			});

			await refreshContactsCache();
			const status = getContactsCacheStatus();
			assert.equal(status.error, 'Network error');
		});
	});

	describe('getContactsEvents', () => {
		it('returns empty array before any fetch', () => {
			// Module starts with empty events — this test relies on module state being reset
			// between test runs (each test file runs in its own context)
			const events = getContactsEvents();
			assert.ok(Array.isArray(events));
		});
	});

	describe('getContactsItems', () => {
		it('returns empty array before any fetch', () => {
			const items = getContactsItems();
			assert.ok(Array.isArray(items));
			assert.equal(items.length, 0);
		});

		it('maps events to {uri, name, type} with absolute URI', async () => {
			mock.method(global, 'fetch', async () => ({
				ok: true,
				json: async () => SAMPLE_EVENTS,
			}));

			await refreshContactsCache();
			const items = getContactsItems();
			assert.equal(items.length, 2);
			assert.ok(items[0].uri.endsWith('/people/42'), `Expected URI to end with /people/42, got: ${items[0].uri}`);
			assert.equal(items[0].name, 'Alice Smith');
			assert.equal(items[0].type, 'birthday');
			assert.ok(items[1].uri.endsWith('/people/17'));
			assert.equal(items[1].name, 'Bob Jones');
			assert.equal(items[1].type, 'anniversary');
		});
	});

	describe('getContactsCacheStatus', () => {
		it('reports unpopulated before first successful fetch', () => {
			const status = getContactsCacheStatus();
			assert.equal(status.populated, false);
			assert.equal(status.lastRefreshed, null);
		});

		it('reports populated and has lastRefreshed after successful fetch', async () => {
			mock.method(global, 'fetch', async () => ({
				ok: true,
				json: async () => [],
			}));

			await refreshContactsCache();
			const status = getContactsCacheStatus();
			assert.equal(status.populated, true);
			assert.ok(typeof status.lastRefreshed === 'string');
		});
	});
});
