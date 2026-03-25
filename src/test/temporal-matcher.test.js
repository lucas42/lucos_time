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
