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
	festivalPeriods = new Map(),
} = {}) {
	return { daysOfWeek, months, calendars, festivals, historicalEvents, commemoratesMap, festivalPeriods };
}

const GREGORIAN_CAL_URI = 'https://example.com/calendar/1/';
const HEBREW_CAL_URI = 'https://example.com/calendar/hebrew/';
const CHINESE_CAL_URI = 'https://example.com/calendar/chinese/';
const HIJRI_CAL_URI = 'https://example.com/calendar/hijri/';
const HINDU_CAL_URI = 'https://example.com/calendar/hindu/';

function gregorianCalendars() {
	return new Map([[GREGORIAN_CAL_URI, { uri: GREGORIAN_CAL_URI, name: 'Gregorian', temporalId: 'gregory' }]]);
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
			{ uri: 'month/1', name: 'January', type: 'Month', orderInCalendar: 1, calendarUri: GREGORIAN_CAL_URI, temporalMonthCode: 'M01' },
			{ uri: 'month/3', name: 'March', type: 'Month', orderInCalendar: 3, calendarUri: GREGORIAN_CAL_URI, temporalMonthCode: 'M03' },
			{ uri: 'month/12', name: 'December', type: 'Month', orderInCalendar: 12, calendarUri: GREGORIAN_CAL_URI, temporalMonthCode: 'M12' },
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

		it('should not match months with no temporalMonthCode', () => {
			// A month with no temporalMonthCode should never match (graceful skip)
			const nonGregorianUri = 'https://example.com/calendar/2/';
			const noCodeMonth = {
				uri: 'month/chinese/1', name: 'First Month', type: 'Month',
				orderInCalendar: 3, calendarUri: nonGregorianUri, temporalMonthCode: null,
			};
			const calendars = new Map([
				[GREGORIAN_CAL_URI, { uri: GREGORIAN_CAL_URI, name: 'Gregorian', temporalId: 'gregory' }],
				[nonGregorianUri, { uri: nonGregorianUri, name: 'Chinese', temporalId: 'chinese' }],
			]);
			const march = new Date('2026-03-15T12:00:00Z');
			const cache = makeCache({ months: [...months, noCodeMonth], calendars });
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
			{ uri: marchUri, name: 'March', type: 'Month', orderInCalendar: 3, calendarUri: GREGORIAN_CAL_URI, temporalMonthCode: 'M03' },
			{ uri: decemberUri, name: 'December', type: 'Month', orderInCalendar: 12, calendarUri: GREGORIAN_CAL_URI, temporalMonthCode: 'M12' },
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
			{ uri: decemberUri, name: 'December', type: 'Month', orderInCalendar: 12, calendarUri: GREGORIAN_CAL_URI, temporalMonthCode: 'M12' },
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
		it('should include evaluated_calendars (from calendars with temporalId), timezone, and as_of', () => {
			const now = new Date('2026-03-25T12:00:00Z');
			// Cache with Gregorian calendar (temporalId='gregory')
			const cache = makeCache({ calendars: gregorianCalendars() });
			const result = getCurrentItems(cache, now);
			assert.deepEqual(result.evaluated_calendars, ['Gregorian']);
			assert.equal(result.timezone, 'Europe/London');
			assert.equal(result.as_of, now.toISOString());
		});

		it('should return empty evaluated_calendars when no calendars in cache', () => {
			const now = new Date('2026-03-25T12:00:00Z');
			const cache = makeCache(); // no calendars
			const result = getCurrentItems(cache, now);
			assert.deepEqual(result.evaluated_calendars, []);
		});

		it('should return empty items for empty cache', () => {
			const now = new Date('2026-03-25T12:00:00Z');
			const cache = makeCache();
			const result = getCurrentItems(cache, now);
			assert.deepEqual(result.items, []);
		});
	});

	// ─── Non-Gregorian calendar tests ────────────────────────────────────────

	describe('Hebrew calendar month matching', () => {
		// On 2026-12-01T12:00:00Z London time, the Hebrew date is 21 Kislev 5787.
		// Kislev = Temporal monthCode M03 (Tishrei-first).
		const kislevDate = new Date('2026-12-01T12:00:00Z');
		const hebrewCalendars = () => new Map([
			[GREGORIAN_CAL_URI, { uri: GREGORIAN_CAL_URI, name: 'Gregorian', temporalId: 'gregory' }],
			[HEBREW_CAL_URI, { uri: HEBREW_CAL_URI, name: 'Hebrew', temporalId: 'hebrew' }],
		]);

		it('should match Kislev (monthCode M03) in December', () => {
			const kislevUri = 'month/hebrew/kislev';
			const months = [
				{ uri: kislevUri, name: 'Kislev', type: 'Month', orderInCalendar: 9, calendarUri: HEBREW_CAL_URI, temporalMonthCode: 'M03' },
			];
			const cache = makeCache({ months, calendars: hebrewCalendars() });
			const result = getCurrentItems(cache, kislevDate);
			const monthItems = result.items.filter(i => i.type === 'Month');
			assert.equal(monthItems.length, 1);
			assert.equal(monthItems[0].name, 'Kislev');
		});

		it('should not match Nisan (monthCode M07) in December (Kislev season)', () => {
			const nisanUri = 'month/hebrew/nisan';
			const months = [
				// Nisan is M07; December is M03 (Kislev), so no match.
				{ uri: nisanUri, name: 'Nisan', type: 'Month', orderInCalendar: 1, calendarUri: HEBREW_CAL_URI, temporalMonthCode: 'M07' },
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
				{ uri: kislevUri, name: 'Kislev', type: 'Month', orderInCalendar: 9, calendarUri: HEBREW_CAL_URI, temporalMonthCode: 'M03' },
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
				{ uri: kislevUri, name: 'Kislev', type: 'Month', orderInCalendar: 9, calendarUri: HEBREW_CAL_URI, temporalMonthCode: 'M03' },
			];
			const festivals = [
				{ uri: 'fest/hanukkah', name: 'Hanukkah', type: 'Festival', monthUri: kislevUri, dayOfMonth: 25 },
			];
			const cache = makeCache({ months, calendars: hebrewCalendars(), festivals });
			const result = getCurrentItems(cache, kislev24Date);
			const festItems = result.items.filter(i => i.type === 'Festival');
			assert.equal(festItems.length, 0);
		});

		it('should include Hebrew in evaluated_calendars', () => {
			const cache = makeCache({ calendars: hebrewCalendars() });
			const result = getCurrentItems(cache, kislevDate);
			assert.ok(result.evaluated_calendars.includes('Hebrew'), 'Hebrew should be in evaluated_calendars');
			assert.ok(result.evaluated_calendars.includes('Gregorian'), 'Gregorian should also be present');
		});
	});

	describe('Chinese calendar month matching', () => {
		// 2026-02-17T12:00:00Z is Chinese New Year 2026 — month 1, day 1 (Zhēngyuè, monthCode M01).
		const chineseNewYear = new Date('2026-02-17T12:00:00Z');
		const chineseCalendars = () => new Map([
			[GREGORIAN_CAL_URI, { uri: GREGORIAN_CAL_URI, name: 'Gregorian', temporalId: 'gregory' }],
			[CHINESE_CAL_URI, { uri: CHINESE_CAL_URI, name: 'Chinese', temporalId: 'chinese' }],
		]);

		it('should match Chinese month 1 (Zhēngyuè, M01) on Chinese New Year', () => {
			const zhengyueUri = 'month/chinese/1';
			const months = [
				{ uri: zhengyueUri, name: 'Zhēngyuè', type: 'Month', orderInCalendar: 1, calendarUri: CHINESE_CAL_URI, temporalMonthCode: 'M01' },
			];
			const cache = makeCache({ months, calendars: chineseCalendars() });
			const result = getCurrentItems(cache, chineseNewYear);
			const monthItems = result.items.filter(i => i.type === 'Month');
			assert.equal(monthItems.length, 1);
			assert.equal(monthItems[0].name, 'Zhēngyuè');
		});

		it('should not match Chinese month 1 in May (month 3 in 2026)', () => {
			// 2026-05-01 is Chinese month 3 (M03); month 1 (M01) should not match.
			const mayDate = new Date('2026-05-01T12:00:00Z');
			const zhengyueUri = 'month/chinese/1';
			const months = [
				{ uri: zhengyueUri, name: 'Zhēngyuè', type: 'Month', orderInCalendar: 1, calendarUri: CHINESE_CAL_URI, temporalMonthCode: 'M01' },
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
		it('should evaluate all calendars with a temporalId', () => {
			const allCalendars = new Map([
				[GREGORIAN_CAL_URI, { uri: GREGORIAN_CAL_URI, name: 'Gregorian', temporalId: 'gregory' }],
				[HEBREW_CAL_URI, { uri: HEBREW_CAL_URI, name: 'Hebrew', temporalId: 'hebrew' }],
				[CHINESE_CAL_URI, { uri: CHINESE_CAL_URI, name: 'Chinese', temporalId: 'chinese' }],
				[HIJRI_CAL_URI, { uri: HIJRI_CAL_URI, name: 'Hijri', temporalId: 'islamic' }],
				[HINDU_CAL_URI, { uri: HINDU_CAL_URI, name: 'Hindu', temporalId: 'indian' }],
			]);
			const cache = makeCache({ calendars: allCalendars });
			const result = getCurrentItems(cache, new Date('2026-05-01T12:00:00Z'));
			assert.ok(result.evaluated_calendars.includes('Gregorian'));
			assert.ok(result.evaluated_calendars.includes('Hebrew'));
			assert.ok(result.evaluated_calendars.includes('Chinese'));
			assert.ok(result.evaluated_calendars.includes('Hijri'));
			assert.ok(result.evaluated_calendars.includes('Hindu'));
		});

		it('should skip calendars with no temporalId', () => {
			const mixedCalendars = new Map([
				[GREGORIAN_CAL_URI, { uri: GREGORIAN_CAL_URI, name: 'Gregorian', temporalId: 'gregory' }],
				['unknown-uri', { uri: 'unknown-uri', name: 'Unknown', temporalId: null }],
			]);
			const cache = makeCache({ calendars: mixedCalendars });
			const result = getCurrentItems(cache, new Date('2026-05-01T12:00:00Z'));
			assert.ok(result.evaluated_calendars.includes('Gregorian'));
			assert.ok(!result.evaluated_calendars.includes('Unknown'));
		});

		it('should not duplicate an item matched via multiple calendars', () => {
			// 2026-12-01: London is December (Gregorian M12) and Kislev (Hebrew M03).
			// If a festival is linked to Kislev, it should appear once regardless.
			const dec1 = new Date('2026-12-01T12:00:00Z');
			const decUri = 'month/greg/december';
			const kislevUri = 'month/heb/kislev';
			const months = [
				{ uri: decUri, name: 'December', type: 'Month', orderInCalendar: 12, calendarUri: GREGORIAN_CAL_URI, temporalMonthCode: 'M12' },
				{ uri: kislevUri, name: 'Kislev', type: 'Month', orderInCalendar: 9, calendarUri: HEBREW_CAL_URI, temporalMonthCode: 'M03' },
			];
			const sharedFestUri = 'fest/shared';
			const festivals = [
				{ uri: sharedFestUri, name: 'Shared', type: 'Festival', monthUri: kislevUri, dayOfMonth: null },
			];
			const allCalendars = new Map([
				[GREGORIAN_CAL_URI, { uri: GREGORIAN_CAL_URI, name: 'Gregorian', temporalId: 'gregory' }],
				[HEBREW_CAL_URI, { uri: HEBREW_CAL_URI, name: 'Hebrew', temporalId: 'hebrew' }],
			]);
			const cache = makeCache({ months, calendars: allCalendars, festivals });
			const result = getCurrentItems(cache, dec1);
			const festItems = result.items.filter(i => i.type === 'Festival');
			assert.equal(festItems.length, 1);
		});
	});

	describe('Calendar polyfill error handling', () => {
		it('should skip a calendar that throws when evaluating, and still return results from other calendars', () => {
			// 'bad-calendar-id' is not a valid Temporal calendar ID — withCalendar will throw.
			const badCalUri = 'https://example.com/calendar/bad/';
			const badCalendars = new Map([
				[GREGORIAN_CAL_URI, { uri: GREGORIAN_CAL_URI, name: 'Gregorian', temporalId: 'gregory' }],
				[badCalUri, { uri: badCalUri, name: 'BadCal', temporalId: 'bad-calendar-id' }],
			]);
			const marchUri = 'month/3';
			const months = [
				{ uri: marchUri, name: 'March', type: 'Month', orderInCalendar: 3, calendarUri: GREGORIAN_CAL_URI, temporalMonthCode: 'M03' },
			];
			// Use 2026-03-15 — definitely March in Gregorian
			const march = new Date('2026-03-15T12:00:00Z');
			const cache = makeCache({ months, calendars: badCalendars });

			const messages = [];
			const origError = console.error;
			console.error = (...args) => messages.push(args.join(' '));
			let result;
			try {
				result = getCurrentItems(cache, march);
			} finally {
				console.error = origError;
			}

			// Bad calendar is skipped — March still matched via Gregorian
			const monthItems = result.items.filter(i => i.type === 'Month');
			assert.equal(monthItems.length, 1);
			assert.equal(monthItems[0].name, 'March');

			// Bad calendar excluded from evaluated_calendars; Gregorian still present
			assert.ok(!result.evaluated_calendars.includes('BadCal'));
			assert.ok(result.evaluated_calendars.includes('Gregorian'));

			// Error was logged naming the skipped calendar
			assert.ok(messages.some(m => m.includes('BadCal')));
		});

		it('should return an empty items array and not crash when the only calendar throws', () => {
			const badCalUri = 'https://example.com/calendar/bad/';
			const badCalendars = new Map([
				[badCalUri, { uri: badCalUri, name: 'BadCal', temporalId: 'bad-calendar-id' }],
			]);
			const months = [
				{ uri: 'month/3', name: 'March', type: 'Month', orderInCalendar: 3, calendarUri: badCalUri, temporalMonthCode: 'M03' },
			];
			const march = new Date('2026-03-15T12:00:00Z');
			const cache = makeCache({ months, calendars: badCalendars });

			const origError = console.error;
			console.error = () => {};
			let result;
			try {
				result = getCurrentItems(cache, march);
			} finally {
				console.error = origError;
			}

			assert.deepEqual(result.items, []);
			assert.deepEqual(result.evaluated_calendars, []);
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
				{ uri: marchUri, name: 'March', type: 'Month', orderInCalendar: 3, calendarUri: GREGORIAN_CAL_URI, temporalMonthCode: 'M03' },
				{ uri: aprilUri, name: 'April', type: 'Month', orderInCalendar: 4, calendarUri: GREGORIAN_CAL_URI, temporalMonthCode: 'M04' },
			];
			const cache = makeCache({ months, calendars: gregorianCalendars() });
			const result = getCurrentItems(cache, lateBst);
			const monthItems = result.items.filter(i => i.type === 'Month');
			assert.equal(monthItems.length, 1);
			// In London at this time, it's March 30, still March
			assert.equal(monthItems[0].name, 'March');
		});
	});

	// ─── FestivalPeriod matching ─────────────────────────────────────────────────

	describe('FestivalPeriod matching', () => {
		const decUri = 'month/greg/december';
		const kislevUri = 'month/heb/kislev';

		const gregorianAndHebrewCalendars = () => new Map([
			[GREGORIAN_CAL_URI, { uri: GREGORIAN_CAL_URI, name: 'Gregorian', temporalId: 'gregory' }],
			[HEBREW_CAL_URI, { uri: HEBREW_CAL_URI, name: 'Hebrew', temporalId: 'hebrew' }],
		]);

		const decemberMonth = { uri: decUri, name: 'December', type: 'Month', orderInCalendar: 12, calendarUri: GREGORIAN_CAL_URI, temporalMonthCode: 'M12' };
		const kislevMonth = { uri: kislevUri, name: 'Kislev', type: 'Month', orderInCalendar: 9, calendarUri: HEBREW_CAL_URI, temporalMonthCode: 'M03' };

		it('should match a one-day festival period on the exact day (Christmas Day, Dec 25)', () => {
			// Christmas Day: Dec 25, duration 1 day
			const christmasUri = 'fest/christmas';
			const festivals = [{ uri: christmasUri, name: 'Christmas Day', type: 'Festival', monthUri: null, dayOfMonth: null }];
			const festivalPeriods = new Map([[christmasUri, [
				{ startMonthUri: decUri, startDay: 25, durationDays: 1 },
			]]]);
			const dec25 = new Date('2026-12-25T12:00:00Z');
			const cache = makeCache({ months: [decemberMonth], calendars: gregorianCalendars(), festivals, festivalPeriods });
			const result = getCurrentItems(cache, dec25);
			const festItems = result.items.filter(i => i.type === 'Festival');
			assert.equal(festItems.length, 1);
			assert.equal(festItems[0].name, 'Christmas Day');
		});

		it('should not match a one-day festival period on the day before', () => {
			const christmasUri = 'fest/christmas';
			const festivals = [{ uri: christmasUri, name: 'Christmas Day', type: 'Festival', monthUri: null, dayOfMonth: null }];
			const festivalPeriods = new Map([[christmasUri, [
				{ startMonthUri: decUri, startDay: 25, durationDays: 1 },
			]]]);
			const dec24 = new Date('2026-12-24T12:00:00Z');
			const cache = makeCache({ months: [decemberMonth], calendars: gregorianCalendars(), festivals, festivalPeriods });
			const result = getCurrentItems(cache, dec24);
			const festItems = result.items.filter(i => i.type === 'Festival');
			assert.equal(festItems.length, 0);
		});

		it('should not match a one-day festival period on the day after', () => {
			const christmasUri = 'fest/christmas';
			const festivals = [{ uri: christmasUri, name: 'Christmas Day', type: 'Festival', monthUri: null, dayOfMonth: null }];
			const festivalPeriods = new Map([[christmasUri, [
				{ startMonthUri: decUri, startDay: 25, durationDays: 1 },
			]]]);
			const dec26 = new Date('2026-12-26T12:00:00Z');
			const cache = makeCache({ months: [decemberMonth], calendars: gregorianCalendars(), festivals, festivalPeriods });
			const result = getCurrentItems(cache, dec26);
			const festItems = result.items.filter(i => i.type === 'Festival');
			assert.equal(festItems.length, 0);
		});

		it('should match a multi-day period throughout its range (Christmas music Dec 1-31)', () => {
			// Dec 1, duration 31 days → Dec 1 through Dec 31
			const christmasUri = 'fest/christmas';
			const festivals = [{ uri: christmasUri, name: 'Christmas', type: 'Festival', monthUri: null, dayOfMonth: null }];
			const festivalPeriods = new Map([[christmasUri, [
				{ startMonthUri: decUri, startDay: 1, durationDays: 31 },
			]]]);
			const cache = makeCache({ months: [decemberMonth], calendars: gregorianCalendars(), festivals, festivalPeriods });
			// Dec 1, Dec 15, Dec 31 should all match
			for (const dateStr of ['2026-12-01T12:00:00Z', '2026-12-15T12:00:00Z', '2026-12-31T12:00:00Z']) {
				const result = getCurrentItems(cache, new Date(dateStr));
				const festItems = result.items.filter(i => i.type === 'Festival');
				assert.equal(festItems.length, 1, `Expected match on ${dateStr}`);
			}
		});

		it('should not match a multi-day period outside its range', () => {
			const christmasUri = 'fest/christmas';
			const festivals = [{ uri: christmasUri, name: 'Christmas', type: 'Festival', monthUri: null, dayOfMonth: null }];
			const festivalPeriods = new Map([[christmasUri, [
				{ startMonthUri: decUri, startDay: 1, durationDays: 31 },
			]]]);
			const cache = makeCache({ months: [decemberMonth], calendars: gregorianCalendars(), festivals, festivalPeriods });
			// Nov 30 and Jan 1 should not match
			const novUri = 'month/greg/november';
			const novMonth = { uri: novUri, name: 'November', type: 'Month', orderInCalendar: 11, calendarUri: GREGORIAN_CAL_URI, temporalMonthCode: 'M11' };
			const janUri = 'month/greg/january';
			const janMonth = { uri: janUri, name: 'January', type: 'Month', orderInCalendar: 1, calendarUri: GREGORIAN_CAL_URI, temporalMonthCode: 'M01' };
			const fullCache = makeCache({ months: [decemberMonth, novMonth, janMonth], calendars: gregorianCalendars(), festivals, festivalPeriods });
			const nov30 = new Date('2026-11-30T12:00:00Z');
			const jan1 = new Date('2027-01-01T12:00:00Z');
			assert.equal(getCurrentItems(fullCache, nov30).items.filter(i => i.type === 'Festival').length, 0, 'Should not match Nov 30');
			assert.equal(getCurrentItems(fullCache, jan1).items.filter(i => i.type === 'Festival').length, 0, 'Should not match Jan 1');
		});

		it('should match a cross-month-boundary period (Hanukkah: Kislev 25, 8 days)', () => {
			// Hanukkah 5787: Kislev 25 (2026-12-05) through Tevet 2 (2026-12-12)
			// On both Kislev 25 (still in Kislev) and Tevet 2 (crossed into Tevet), festival should match
			const hanukkahUri = 'fest/hanukkah';
			const festivals = [{ uri: hanukkahUri, name: 'Hanukkah', type: 'Festival', monthUri: null, dayOfMonth: null }];
			const festivalPeriods = new Map([[hanukkahUri, [
				{ startMonthUri: kislevUri, startDay: 25, durationDays: 8 },
			]]]);
			const cache = makeCache({ months: [kislevMonth], calendars: gregorianAndHebrewCalendars(), festivals, festivalPeriods });

			// Kislev 25 (day 1 of Hanukkah) — 2026-12-05
			const kislev25 = new Date('2026-12-05T12:00:00Z');
			assert.equal(getCurrentItems(cache, kislev25).items.filter(i => i.type === 'Festival').length, 1, 'Should match on Kislev 25');

			// Tevet 2 (day 8 of Hanukkah, cross-month) — 2026-12-12
			const tevet2 = new Date('2026-12-12T12:00:00Z');
			assert.equal(getCurrentItems(cache, tevet2).items.filter(i => i.type === 'Festival').length, 1, 'Should match on Tevet 2 (cross-month)');
		});

		it('should not match outside a cross-month-boundary period', () => {
			const hanukkahUri = 'fest/hanukkah';
			const festivals = [{ uri: hanukkahUri, name: 'Hanukkah', type: 'Festival', monthUri: null, dayOfMonth: null }];
			const festivalPeriods = new Map([[hanukkahUri, [
				{ startMonthUri: kislevUri, startDay: 25, durationDays: 8 },
			]]]);
			const cache = makeCache({ months: [kislevMonth], calendars: gregorianAndHebrewCalendars(), festivals, festivalPeriods });

			// Kislev 24 (day before Hanukkah) — 2026-12-04
			const kislev24 = new Date('2026-12-04T12:00:00Z');
			assert.equal(getCurrentItems(cache, kislev24).items.filter(i => i.type === 'Festival').length, 0, 'Should not match on Kislev 24');

			// Tevet 3 (day after Hanukkah) — 2026-12-13
			const tevet3 = new Date('2026-12-13T12:00:00Z');
			assert.equal(getCurrentItems(cache, tevet3).items.filter(i => i.type === 'Festival').length, 0, 'Should not match on Tevet 3');
		});

		it('should match a festival with a whole-month period (startDay null)', () => {
			const marchUri = 'month/greg/march';
			const marchMonth = { uri: marchUri, name: 'March', type: 'Month', orderInCalendar: 3, calendarUri: GREGORIAN_CAL_URI, temporalMonthCode: 'M03' };
			const festUri = 'fest/march-fest';
			const festivals = [{ uri: festUri, name: 'March Festival', type: 'Festival', monthUri: null, dayOfMonth: null }];
			const festivalPeriods = new Map([[festUri, [
				{ startMonthUri: marchUri, startDay: null, durationDays: null },
			]]]);
			const march15 = new Date('2026-03-15T12:00:00Z');
			const cache = makeCache({ months: [marchMonth], calendars: gregorianCalendars(), festivals, festivalPeriods });
			const result = getCurrentItems(cache, march15);
			const festItems = result.items.filter(i => i.type === 'Festival');
			assert.equal(festItems.length, 1);
			assert.equal(festItems[0].name, 'March Festival');
		});

		it('should match the correct period when a festival has multiple periods (Christmas Day vs Christmas music)', () => {
			// Christmas Day: Dec 25 only (durationDays 1)
			// Christmas music: Dec 1-31 (durationDays 31)
			const christmasUri = 'fest/christmas';
			const festivals = [{ uri: christmasUri, name: 'Christmas', type: 'Festival', monthUri: null, dayOfMonth: null }];
			const festivalPeriods = new Map([[christmasUri, [
				{ startMonthUri: decUri, startDay: 25, durationDays: 1 },
				{ startMonthUri: decUri, startDay: 1, durationDays: 31 },
			]]]);
			const cache = makeCache({ months: [decemberMonth], calendars: gregorianCalendars(), festivals, festivalPeriods });
			// Dec 1 — music period matches, Day period does not
			const dec1 = new Date('2026-12-01T12:00:00Z');
			assert.equal(getCurrentItems(cache, dec1).items.filter(i => i.type === 'Festival').length, 1, 'Dec 1 should match via music period');
			// Dec 25 — both periods match (deduplicated to one item)
			const dec25 = new Date('2026-12-25T12:00:00Z');
			assert.equal(getCurrentItems(cache, dec25).items.filter(i => i.type === 'Festival').length, 1, 'Dec 25 should match exactly once');
		});

		it('should match via day_of_month/month when no FestivalPeriod records exist', () => {
			const marchUri = 'month/3';
			const months = [{ uri: marchUri, name: 'March', type: 'Month', orderInCalendar: 3, calendarUri: GREGORIAN_CAL_URI, temporalMonthCode: 'M03' }];
			const festivals = [{ uri: 'fest/ides', name: 'Ides of March', type: 'Festival', monthUri: marchUri, dayOfMonth: 15 }];
			// festivalPeriods is empty Map — only day_of_month check applies
			const march15 = new Date('2026-03-15T12:00:00Z');
			const cache = makeCache({ months, calendars: gregorianCalendars(), festivals });
			assert.equal(getCurrentItems(cache, march15).items.filter(i => i.type === 'Festival').length, 1);
			const march14 = new Date('2026-03-14T12:00:00Z');
			assert.equal(getCurrentItems(cache, march14).items.filter(i => i.type === 'Festival').length, 0);
		});

		it('should match via day_of_month even when FestivalPeriod records also exist (additive)', () => {
			// Festival has day_of_month=25 (Dec 25) AND a period covering Dec 1-31.
			// Both paths are checked independently: Dec 25 matches via both; Dec 15 matches via period only.
			// Critically, if only an Advent period (Dec 1-24) existed, Dec 25 still matches via day_of_month.
			const christmasUri = 'fest/christmas';
			const festivals = [{ uri: christmasUri, name: 'Christmas', type: 'Festival', monthUri: decUri, dayOfMonth: 25 }];
			const festivalPeriods = new Map([[christmasUri, [
				{ startMonthUri: decUri, startDay: 1, durationDays: 31 }, // Dec 1–31 music period
			]]]);
			const cache = makeCache({ months: [decemberMonth], calendars: gregorianCalendars(), festivals, festivalPeriods });

			// Dec 25 — matches via both day_of_month AND period (deduped to 1 item)
			assert.equal(getCurrentItems(cache, new Date('2026-12-25T12:00:00Z')).items.filter(i => i.type === 'Festival').length, 1, 'Dec 25 should match');
			// Dec 15 — matches via period only
			assert.equal(getCurrentItems(cache, new Date('2026-12-15T12:00:00Z')).items.filter(i => i.type === 'Festival').length, 1, 'Dec 15 should match via period');

			// Now test with ONLY an Advent period (Dec 1–24) — Dec 25 still matches via day_of_month
			const adventOnly = new Map([[christmasUri, [
				{ startMonthUri: decUri, startDay: 1, durationDays: 24 }, // Dec 1–24 only
			]]]);
			const adventCache = makeCache({ months: [decemberMonth], calendars: gregorianCalendars(), festivals, festivalPeriods: adventOnly });
			assert.equal(getCurrentItems(adventCache, new Date('2026-12-25T12:00:00Z')).items.filter(i => i.type === 'Festival').length, 1, 'Dec 25 should still match via day_of_month even when outside all periods');
		});

		it('should handle a FestivalPeriod with a missing calendar gracefully (no match, no crash)', () => {
			// Period references a month whose calendarUri isn't in the calendar map
			const unknownCalUri = 'cal/unknown';
			const orphanMonthUri = 'month/orphan';
			const orphanMonth = { uri: orphanMonthUri, name: 'OrphanMonth', type: 'Month', orderInCalendar: 1, calendarUri: unknownCalUri, temporalMonthCode: 'M01' };
			const festUri = 'fest/orphan';
			const festivals = [{ uri: festUri, name: 'Orphan Festival', type: 'Festival', monthUri: null, dayOfMonth: null }];
			const festivalPeriods = new Map([[festUri, [
				{ startMonthUri: orphanMonthUri, startDay: 1, durationDays: 1 },
			]]]);
			const now = new Date('2026-03-01T12:00:00Z');
			const cache = makeCache({ months: [orphanMonth], calendars: gregorianCalendars(), festivals, festivalPeriods });
			// Should not crash, and festival should not be matched
			const result = getCurrentItems(cache, now);
			assert.equal(result.items.filter(i => i.type === 'Festival').length, 0);
		});
	});
});
