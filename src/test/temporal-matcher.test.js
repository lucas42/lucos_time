import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getCurrentItems } from '../temporal-matcher.js';

function makeCache({
	daysOfWeek = [],
	months = [],
	calendars = new Map(),
	festivals = [],
	historicalEvents = new Map(),
	commemoratesMap = new Map(),
} = {}) {
	return { daysOfWeek, months, calendars, festivals, historicalEvents, commemoratesMap };
}

const GREGORIAN_CAL_URI = 'https://example.com/calendar/1/';

function gregorianCalendars() {
	return new Map([[GREGORIAN_CAL_URI, { uri: GREGORIAN_CAL_URI, name: 'Gregorian' }]]);
}

describe('getCurrentItems', () => {
	describe('DayOfWeek matching', () => {
		const allDays = [
			{ uri: 'day/1', name: 'Monday', type: 'DayOfWeek', order: 1 },
			{ uri: 'day/2', name: 'Tuesday', type: 'DayOfWeek', order: 2 },
			{ uri: 'day/3', name: 'Wednesday', type: 'DayOfWeek', order: 3 },
			{ uri: 'day/4', name: 'Thursday', type: 'DayOfWeek', order: 4 },
			{ uri: 'day/5', name: 'Friday', type: 'DayOfWeek', order: 5 },
			{ uri: 'day/6', name: 'Saturday', type: 'DayOfWeek', order: 6 },
			{ uri: 'day/7', name: 'Sunday', type: 'DayOfWeek', order: 7 },
		];

		it('should match Monday (eolas order=1) for a Monday in London', () => {
			// 2026-03-23 is a Monday
			const monday = new Date('2026-03-23T12:00:00Z');
			const cache = makeCache({ daysOfWeek: allDays });
			const result = getCurrentItems(cache, monday);
			const dayItems = result.items.filter(i => i.type === 'DayOfWeek');
			assert.equal(dayItems.length, 1);
			assert.equal(dayItems[0].name, 'Monday');
			assert.equal(dayItems[0].uri, 'day/1');
		});

		it('should match Sunday (eolas order=7) for a Sunday', () => {
			// 2026-03-22 is a Sunday
			const sunday = new Date('2026-03-22T12:00:00Z');
			const cache = makeCache({ daysOfWeek: allDays });
			const result = getCurrentItems(cache, sunday);
			const dayItems = result.items.filter(i => i.type === 'DayOfWeek');
			assert.equal(dayItems.length, 1);
			assert.equal(dayItems[0].name, 'Sunday');
			assert.equal(dayItems[0].uri, 'day/7');
		});

		it('should match Wednesday for a Wednesday', () => {
			// 2026-03-25 is a Wednesday
			const wednesday = new Date('2026-03-25T12:00:00Z');
			const cache = makeCache({ daysOfWeek: allDays });
			const result = getCurrentItems(cache, wednesday);
			const dayItems = result.items.filter(i => i.type === 'DayOfWeek');
			assert.equal(dayItems.length, 1);
			assert.equal(dayItems[0].name, 'Wednesday');
		});
	});

	describe('Gregorian Month matching', () => {
		const months = [
			{ uri: 'month/1', name: 'January', type: 'Month', orderInCalendar: 1, calendarUri: GREGORIAN_CAL_URI },
			{ uri: 'month/3', name: 'March', type: 'Month', orderInCalendar: 3, calendarUri: GREGORIAN_CAL_URI },
			{ uri: 'month/12', name: 'December', type: 'Month', orderInCalendar: 12, calendarUri: GREGORIAN_CAL_URI },
		];

		it('should match March in March', () => {
			const march = new Date('2026-03-15T12:00:00Z');
			const cache = makeCache({ months, calendars: gregorianCalendars() });
			const result = getCurrentItems(cache, march);
			const monthItems = result.items.filter(i => i.type === 'Month');
			assert.equal(monthItems.length, 1);
			assert.equal(monthItems[0].name, 'March');
		});

		it('should match December in December', () => {
			const december = new Date('2026-12-25T12:00:00Z');
			const cache = makeCache({ months, calendars: gregorianCalendars() });
			const result = getCurrentItems(cache, december);
			const monthItems = result.items.filter(i => i.type === 'Month');
			assert.equal(monthItems.length, 1);
			assert.equal(monthItems[0].name, 'December');
		});

		it('should not match non-Gregorian months', () => {
			const nonGregorianUri = 'https://example.com/calendar/2/';
			const nonGregorianMonth = {
				uri: 'month/chinese/1', name: 'First Month', type: 'Month',
				orderInCalendar: 3, calendarUri: nonGregorianUri,
			};
			const calendars = new Map([
				[GREGORIAN_CAL_URI, { uri: GREGORIAN_CAL_URI, name: 'Gregorian' }],
				[nonGregorianUri, { uri: nonGregorianUri, name: 'Chinese' }],
			]);
			const march = new Date('2026-03-15T12:00:00Z');
			const cache = makeCache({ months: [...months, nonGregorianMonth], calendars });
			const result = getCurrentItems(cache, march);
			const monthItems = result.items.filter(i => i.type === 'Month');
			assert.equal(monthItems.length, 1);
			assert.equal(monthItems[0].name, 'March');
		});
	});

	describe('Festival matching', () => {
		const marchUri = 'month/3';
		const decemberUri = 'month/12';
		const months = [
			{ uri: marchUri, name: 'March', type: 'Month', orderInCalendar: 3, calendarUri: GREGORIAN_CAL_URI },
			{ uri: decemberUri, name: 'December', type: 'Month', orderInCalendar: 12, calendarUri: GREGORIAN_CAL_URI },
		];

		it('should match a festival with matching month and no day_of_month (whole month)', () => {
			const festivals = [
				{ uri: 'fest/1', name: 'March Festival', type: 'Festival', monthUri: marchUri, dayOfMonth: null, commemoratesUri: null },
			];
			const march = new Date('2026-03-15T12:00:00Z');
			const cache = makeCache({ months, calendars: gregorianCalendars(), festivals });
			const result = getCurrentItems(cache, march);
			const festItems = result.items.filter(i => i.type === 'Festival');
			assert.equal(festItems.length, 1);
			assert.equal(festItems[0].name, 'March Festival');
		});

		it('should match a festival with matching month and exact day', () => {
			const festivals = [
				{ uri: 'fest/2', name: 'Ides of March', type: 'Festival', monthUri: marchUri, dayOfMonth: 15, commemoratesUri: null },
			];
			const march15 = new Date('2026-03-15T12:00:00Z');
			const cache = makeCache({ months, calendars: gregorianCalendars(), festivals });
			const result = getCurrentItems(cache, march15);
			const festItems = result.items.filter(i => i.type === 'Festival');
			assert.equal(festItems.length, 1);
		});

		it('should not match a festival when day_of_month does not match', () => {
			const festivals = [
				{ uri: 'fest/2', name: 'Ides of March', type: 'Festival', monthUri: marchUri, dayOfMonth: 15, commemoratesUri: null },
			];
			const march16 = new Date('2026-03-16T12:00:00Z');
			const cache = makeCache({ months, calendars: gregorianCalendars(), festivals });
			const result = getCurrentItems(cache, march16);
			const festItems = result.items.filter(i => i.type === 'Festival');
			assert.equal(festItems.length, 0);
		});

		it('should not match a festival in a different month', () => {
			const festivals = [
				{ uri: 'fest/3', name: 'Christmas Day', type: 'Festival', monthUri: decemberUri, dayOfMonth: 25, commemoratesUri: null },
			];
			const march = new Date('2026-03-25T12:00:00Z');
			const cache = makeCache({ months, calendars: gregorianCalendars(), festivals });
			const result = getCurrentItems(cache, march);
			const festItems = result.items.filter(i => i.type === 'Festival');
			assert.equal(festItems.length, 0);
		});
	});

	describe('HistoricalEvent transitive matching via commemorates', () => {
		const decemberUri = 'month/12';
		const months = [
			{ uri: decemberUri, name: 'December', type: 'Month', orderInCalendar: 12, calendarUri: GREGORIAN_CAL_URI },
		];

		it('should include HistoricalEvents commemorated by a current Festival', () => {
			const eventUri = 'event/1';
			const festivals = [
				{ uri: 'fest/christmas', name: 'Christmas Day', type: 'Festival', monthUri: decemberUri, dayOfMonth: 25 },
			];
			const historicalEvents = new Map([
				[eventUri, { uri: eventUri, name: 'The Nativity of Jesus Christ', type: 'HistoricalEvent' }],
			]);
			const commemoratesMap = new Map([
				['fest/christmas', [eventUri]],
			]);
			const dec25 = new Date('2026-12-25T12:00:00Z');
			const cache = makeCache({ months, calendars: gregorianCalendars(), festivals, historicalEvents, commemoratesMap });
			const result = getCurrentItems(cache, dec25);
			const eventItems = result.items.filter(i => i.type === 'HistoricalEvent');
			assert.equal(eventItems.length, 1);
			assert.equal(eventItems[0].name, 'The Nativity of Jesus Christ');
		});

		it('should not include HistoricalEvents when the Festival is not current', () => {
			const eventUri = 'event/1';
			const festivals = [
				{ uri: 'fest/christmas', name: 'Christmas Day', type: 'Festival', monthUri: decemberUri, dayOfMonth: 25 },
			];
			const historicalEvents = new Map([
				[eventUri, { uri: eventUri, name: 'The Nativity of Jesus Christ', type: 'HistoricalEvent' }],
			]);
			const commemoratesMap = new Map([
				['fest/christmas', [eventUri]],
			]);
			const march = new Date('2026-03-15T12:00:00Z');
			const cache = makeCache({ months, calendars: gregorianCalendars(), festivals, historicalEvents, commemoratesMap });
			const result = getCurrentItems(cache, march);
			const eventItems = result.items.filter(i => i.type === 'HistoricalEvent');
			assert.equal(eventItems.length, 0);
		});

		it('should deduplicate HistoricalEvents commemorated by multiple Festivals', () => {
			const eventUri = 'event/1';
			const festivals = [
				{ uri: 'fest/a', name: 'Festival A', type: 'Festival', monthUri: decemberUri, dayOfMonth: null },
				{ uri: 'fest/b', name: 'Festival B', type: 'Festival', monthUri: decemberUri, dayOfMonth: null },
			];
			const historicalEvents = new Map([
				[eventUri, { uri: eventUri, name: 'Shared Event', type: 'HistoricalEvent' }],
			]);
			const commemoratesMap = new Map([
				['fest/a', [eventUri]],
				['fest/b', [eventUri]],
			]);
			const dec = new Date('2026-12-15T12:00:00Z');
			const cache = makeCache({ months, calendars: gregorianCalendars(), festivals, historicalEvents, commemoratesMap });
			const result = getCurrentItems(cache, dec);
			const eventItems = result.items.filter(i => i.type === 'HistoricalEvent');
			assert.equal(eventItems.length, 1);
		});
	});

	describe('Response shape', () => {
		it('should include evaluated_calendars, timezone, and as_of', () => {
			const now = new Date('2026-03-25T12:00:00Z');
			const cache = makeCache();
			const result = getCurrentItems(cache, now);
			assert.deepEqual(result.evaluated_calendars, ['Gregorian']);
			assert.equal(result.timezone, 'Europe/London');
			assert.equal(result.as_of, now.toISOString());
		});

		it('should return empty items for empty cache', () => {
			const now = new Date('2026-03-25T12:00:00Z');
			const cache = makeCache();
			const result = getCurrentItems(cache, now);
			assert.deepEqual(result.items, []);
		});
	});

	// ─── Non-Gregorian calendar tests ────────────────────────────────────────

	const HEBREW_CAL_URI = 'https://example.com/calendar/hebrew/';
	const CHINESE_CAL_URI = 'https://example.com/calendar/chinese/';
	const HIJRI_CAL_URI = 'https://example.com/calendar/hijri/';
	const HINDU_CAL_URI = 'https://example.com/calendar/hindu/';

	function hebrewCalendars() {
		return new Map([
			[GREGORIAN_CAL_URI, { uri: GREGORIAN_CAL_URI, name: 'Gregorian' }],
			[HEBREW_CAL_URI, { uri: HEBREW_CAL_URI, name: 'Hebrew' }],
		]);
	}

	function chineseCalendars() {
		return new Map([
			[GREGORIAN_CAL_URI, { uri: GREGORIAN_CAL_URI, name: 'Gregorian' }],
			[CHINESE_CAL_URI, { uri: CHINESE_CAL_URI, name: 'Chinese' }],
		]);
	}

	describe('Hebrew calendar month matching', () => {
		// On 2026-12-01T12:00:00Z London time, the Hebrew date is 21 Kislev 5787.
		// In eolas Nisan-first ordering, Kislev = orderInCalendar 9.
		const kislevDate = new Date('2026-12-01T12:00:00Z');

		it('should match Kislev (eolas order 9) in December', () => {
			const kislevUri = 'month/hebrew/kislev';
			const months = [
				{ uri: kislevUri, name: 'Kislev', type: 'Month', orderInCalendar: 9, calendarUri: HEBREW_CAL_URI },
			];
			const cache = makeCache({ months, calendars: hebrewCalendars() });
			const result = getCurrentItems(cache, kislevDate);
			const monthItems = result.items.filter(i => i.type === 'Month');
			assert.equal(monthItems.length, 1);
			assert.equal(monthItems[0].name, 'Kislev');
		});

		it('should not match a Hebrew month with wrong orderInCalendar', () => {
			const nisanUri = 'month/hebrew/nisan';
			const months = [
				// Nisan is orderInCalendar 1; December is Kislev (9), so no match.
				{ uri: nisanUri, name: 'Nisan', type: 'Month', orderInCalendar: 1, calendarUri: HEBREW_CAL_URI },
			];
			const cache = makeCache({ months, calendars: hebrewCalendars() });
			const result = getCurrentItems(cache, kislevDate);
			const monthItems = result.items.filter(i => i.type === 'Month');
			assert.equal(monthItems.length, 0);
		});

		it('should match a festival with a day-of-month in Hebrew calendar (Kislev 25 = Hanukkah)', () => {
			// 2026-12-05T12:00:00Z is Kislev 25 in the Hebrew calendar.
			const kislev25Date = new Date('2026-12-05T12:00:00Z');
			const kislevUri = 'month/hebrew/kislev';
			const months = [
				{ uri: kislevUri, name: 'Kislev', type: 'Month', orderInCalendar: 9, calendarUri: HEBREW_CAL_URI },
			];
			const festivals = [
				{ uri: 'fest/hanukkah', name: 'Hanukkah', type: 'Festival', monthUri: kislevUri, dayOfMonth: 25 },
			];
			const cache = makeCache({ months, calendars: hebrewCalendars(), festivals });
			const result = getCurrentItems(cache, kislev25Date);
			const festItems = result.items.filter(i => i.type === 'Festival');
			assert.equal(festItems.length, 1);
			assert.equal(festItems[0].name, 'Hanukkah');
		});

		it('should not match Hanukkah on Kislev 24 (day before)', () => {
			// 2026-12-04T12:00:00Z is Kislev 24.
			const kislev24Date = new Date('2026-12-04T12:00:00Z');
			const kislevUri = 'month/hebrew/kislev';
			const months = [
				{ uri: kislevUri, name: 'Kislev', type: 'Month', orderInCalendar: 9, calendarUri: HEBREW_CAL_URI },
			];
			const festivals = [
				{ uri: 'fest/hanukkah', name: 'Hanukkah', type: 'Festival', monthUri: kislevUri, dayOfMonth: 25 },
			];
			const cache = makeCache({ months, calendars: hebrewCalendars(), festivals });
			const result = getCurrentItems(cache, kislev24Date);
			const festItems = result.items.filter(i => i.type === 'Festival');
			assert.equal(festItems.length, 0);
		});

		it('should include Hanukkah in evaluated_calendars', () => {
			const cache = makeCache({ calendars: hebrewCalendars() });
			const result = getCurrentItems(cache, kislevDate);
			assert.ok(result.evaluated_calendars.includes('Hebrew'), 'Hebrew should be in evaluated_calendars');
			assert.ok(result.evaluated_calendars.includes('Gregorian'), 'Gregorian should always be present');
		});
	});

	describe('Chinese calendar month matching', () => {
		// 2026-02-17T12:00:00Z is Chinese New Year 2026 — month 1, day 1 (Zhēngyuè).
		const chineseNewYear = new Date('2026-02-17T12:00:00Z');

		it('should match Chinese month 1 (Zhēngyuè) on Chinese New Year', () => {
			const zhengyueUri = 'month/chinese/1';
			const months = [
				{ uri: zhengyueUri, name: 'Zhēngyuè', type: 'Month', orderInCalendar: 1, calendarUri: CHINESE_CAL_URI },
			];
			const cache = makeCache({ months, calendars: chineseCalendars() });
			const result = getCurrentItems(cache, chineseNewYear);
			const monthItems = result.items.filter(i => i.type === 'Month');
			assert.equal(monthItems.length, 1);
			assert.equal(monthItems[0].name, 'Zhēngyuè');
		});

		it('should not match Chinese month 1 in May (month 3 in 2026)', () => {
			// 2026-05-01 is Chinese month 3; month 1 should not match.
			const mayDate = new Date('2026-05-01T12:00:00Z');
			const zhengyueUri = 'month/chinese/1';
			const months = [
				{ uri: zhengyueUri, name: 'Zhēngyuè', type: 'Month', orderInCalendar: 1, calendarUri: CHINESE_CAL_URI },
			];
			const cache = makeCache({ months, calendars: chineseCalendars() });
			const result = getCurrentItems(cache, mayDate);
			const monthItems = result.items.filter(i => i.type === 'Month');
			assert.equal(monthItems.length, 0);
		});

		it('should include Chinese in evaluated_calendars', () => {
			const cache = makeCache({ calendars: chineseCalendars() });
			const result = getCurrentItems(cache, chineseNewYear);
			assert.ok(result.evaluated_calendars.includes('Chinese'));
		});
	});

	describe('Multiple non-Gregorian calendars in cache', () => {
		it('should evaluate all recognised non-Gregorian calendars', () => {
			const allCalendars = new Map([
				[GREGORIAN_CAL_URI, { uri: GREGORIAN_CAL_URI, name: 'Gregorian' }],
				[HEBREW_CAL_URI, { uri: HEBREW_CAL_URI, name: 'Hebrew' }],
				[CHINESE_CAL_URI, { uri: CHINESE_CAL_URI, name: 'Chinese' }],
				[HIJRI_CAL_URI, { uri: HIJRI_CAL_URI, name: 'Hijri' }],
				[HINDU_CAL_URI, { uri: HINDU_CAL_URI, name: 'Hindu' }],
			]);
			const cache = makeCache({ calendars: allCalendars });
			const result = getCurrentItems(cache, new Date('2026-05-01T12:00:00Z'));
			assert.ok(result.evaluated_calendars.includes('Gregorian'));
			assert.ok(result.evaluated_calendars.includes('Hebrew'));
			assert.ok(result.evaluated_calendars.includes('Chinese'));
			assert.ok(result.evaluated_calendars.includes('Hijri'));
			assert.ok(result.evaluated_calendars.includes('Hindu'));
		});

		it('should not duplicate an item that falls in both Gregorian and non-Gregorian months', () => {
			// An unlikely case where a single item URI appears in both Gregorian and non-Gregorian
			// month lists — addItem's seenUris dedup should prevent duplicates.
			const sharedFestUri = 'fest/shared';
			const marchUri = 'month/greg/march';
			const kislevUri = 'month/heb/kislev';
			// 2026-12-01: London Gregorian=December, Hebrew=Kislev
			const dec1 = new Date('2026-12-01T12:00:00Z');
			const decUri = 'month/greg/december';
			const months = [
				{ uri: decUri, name: 'December', type: 'Month', orderInCalendar: 12, calendarUri: GREGORIAN_CAL_URI },
				{ uri: kislevUri, name: 'Kislev', type: 'Month', orderInCalendar: 9, calendarUri: HEBREW_CAL_URI },
			];
			// Festival linked to Kislev (non-Gregorian)
			const festivals = [
				{ uri: sharedFestUri, name: 'Shared', type: 'Festival', monthUri: kislevUri, dayOfMonth: null },
			];
			const allCalendars = new Map([
				[GREGORIAN_CAL_URI, { uri: GREGORIAN_CAL_URI, name: 'Gregorian' }],
				[HEBREW_CAL_URI, { uri: HEBREW_CAL_URI, name: 'Hebrew' }],
			]);
			const cache = makeCache({ months, calendars: allCalendars, festivals });
			const result = getCurrentItems(cache, dec1);
			const festItems = result.items.filter(i => i.type === 'Festival');
			assert.equal(festItems.length, 1);
		});
	});

	describe('London timezone handling', () => {
		it('should use London date when UTC date differs (BST)', () => {
			// 2026-03-29 at 23:30 UTC = 2026-03-30 00:30 BST (clocks spring forward on 29 March)
			// Actually, BST starts last Sunday in March. In 2026 that's March 29.
			// At 23:30 UTC on March 29, London is already March 30 00:30 BST.
			const lateBst = new Date('2026-03-29T23:30:00Z');
			const marchUri = 'month/3';
			const aprilUri = 'month/4';
			const months = [
				{ uri: marchUri, name: 'March', type: 'Month', orderInCalendar: 3, calendarUri: GREGORIAN_CAL_URI },
				{ uri: aprilUri, name: 'April', type: 'Month', orderInCalendar: 4, calendarUri: GREGORIAN_CAL_URI },
			];
			const cache = makeCache({ months, calendars: gregorianCalendars() });
			const result = getCurrentItems(cache, lateBst);
			const monthItems = result.items.filter(i => i.type === 'Month');
			assert.equal(monthItems.length, 1);
			// In London at this time, it's March 30, still March
			assert.equal(monthItems[0].name, 'March');
		});
	});
});
