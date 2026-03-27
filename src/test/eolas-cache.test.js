import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildCacheFromQuads, parseRdf, PREDICATES, TYPE_URIS, EOLAS_NS, TIME_NS, RDF_TYPE, RDFS_LABEL } from '../eolas-cache.js';

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
    eolas:month <https://example.com/month/12/> ;
    eolas:day_of_month 25 ;
    wdt:P547 <https://example.com/historicalevent/1/> .

<https://example.com/festival/2/>
    rdf:type eolas:Festival ;
    rdfs:label "March Month Festival" ;
    eolas:month <https://example.com/month/3/> .

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
