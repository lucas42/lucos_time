import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { parseRdf, buildCacheFromQuads } from '../eolas-cache.js';
import { getCurrentItems } from '../temporal-matcher.js';

const EOLAS_URL = process.env.EOLAS_URL;
const KEY_LUCOS_EOLAS = process.env.KEY_LUCOS_EOLAS;
const canRunSmoke = EOLAS_URL && KEY_LUCOS_EOLAS;

describe('Smoke test against real eolas data', { skip: !canRunSmoke && 'EOLAS_URL and KEY_LUCOS_EOLAS not set' }, () => {
	let rdfText;
	let quads;
	let cacheItems;

	before(async () => {
		const response = await fetch(`${EOLAS_URL}/metadata/all/data/`, {
			headers: {
				'User-Agent': 'lucos_time-smoke-test',
				'Authorization': `Key ${KEY_LUCOS_EOLAS}`,
				'Accept': 'text/turtle',
			},
			signal: AbortSignal.timeout(30000),
		});
		assert.equal(response.ok, true, `Eolas returned HTTP ${response.status}`);
		rdfText = await response.text();
		quads = await parseRdf(rdfText);
		cacheItems = buildCacheFromQuads(quads);
	});

	it('should parse RDF into a non-trivial number of quads', () => {
		assert.ok(quads.length > 10, `Expected many quads, got ${quads.length}`);
	});

	it('should find at least 7 days of the week', () => {
		assert.ok(cacheItems.daysOfWeek.length >= 7,
			`Expected >= 7 days, got ${cacheItems.daysOfWeek.length}`);
	});

	it('should find at least 12 months', () => {
		assert.ok(cacheItems.months.length >= 12,
			`Expected >= 12 months, got ${cacheItems.months.length}`);
	});

	it('should find at least one calendar', () => {
		assert.ok(cacheItems.calendars.size >= 1,
			`Expected >= 1 calendar, got ${cacheItems.calendars.size}`);
	});

	it('should find at least one festival', () => {
		assert.ok(cacheItems.festivals.length >= 1,
			`Expected >= 1 festival, got ${cacheItems.festivals.length}`);
	});

	it('should produce valid current items for today', () => {
		const result = getCurrentItems(cacheItems);
		assert.ok(result.items.length >= 1, 'Expected at least one current item (day of week)');
		const dayItem = result.items.find(i => i.type === 'DayOfWeek');
		assert.ok(dayItem, 'Expected a DayOfWeek in current items');
		const monthItem = result.items.find(i => i.type === 'Month');
		assert.ok(monthItem, 'Expected a Month in current items');
	});
});
