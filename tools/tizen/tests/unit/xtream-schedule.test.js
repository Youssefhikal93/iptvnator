'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var load = require('./sandbox');
var HOUR = 3600000;
var NOW = 1800000000000;

function listing(title, start, end) {
    return { title: Buffer.from(title).toString('base64'), description: Buffer.from('Väder och sport').toString('base64'),
        start_timestamp: String((NOW + start * HOUR) / 1000), stop_timestamp: String((NOW + end * HOUR) / 1000) };
}

function source(response, requests) {
    var globals = load(['xtream.js'], {}, {
        Date: { now: function () { return NOW; } },
        Log: { setSecrets: function () {} }, atob: atob, TextDecoder: TextDecoder,
        SourceRequest: function (url) {
            requests.push(new URL(url));
            return Promise.resolve(response);
        },
    }).globals;
    return globals.XtreamSource({ url: 'http://example.test', user: 'u', pass: 'p' });
}

test('full schedule decodes UTF-8, converts seconds, sorts and drops invalid or out-of-range programmes', async function () {
    var requests = [];
    var entries = [listing('Later', 2, 3), listing('Nyheter på svenska', -1, 1),
        listing('Old boundary', -4, -3), listing('Future boundary', 26, 27), listing('Reversed', 3, 2),
        listing('Zero', 2, 2), listing('', 1, 2), listing('   ', 1, 2), null,
        listing('Overlaps past', -4, -2.5), listing('Overlaps future', 25.5, 27), listing('Invalid', NaN, 2)];
    var programmes = await source({ epg_listings: entries }, requests).schedule({ stream_id: 1001 });
    assert.deepEqual(JSON.parse(JSON.stringify(programmes)), [
        { title: 'Overlaps past', desc: 'Väder och sport', start: NOW - 4 * HOUR, end: NOW - 2.5 * HOUR },
        { title: 'Nyheter på svenska', desc: 'Väder och sport', start: NOW - HOUR, end: NOW + HOUR },
        { title: 'Later', desc: 'Väder och sport', start: NOW + 2 * HOUR, end: NOW + 3 * HOUR },
        { title: 'Overlaps future', desc: 'Väder och sport', start: NOW + 25.5 * HOUR, end: NOW + 27 * HOUR },
    ]);
    assert.equal(requests[0].searchParams.get('action'), 'get_simple_data_table');
    assert.equal(requests[0].searchParams.get('stream_id'), '1001');
});

test('empty, malformed and fully discarded schedules resolve null for the next guide source', async function () {
    for (var response of [null, {}, { epg_listings: {} }, { epg_listings: [] }, { epg_listings: [listing('Old', -5, -4)] }]) {
        assert.equal(await source(response, []).schedule({ stream_id: 1003 }), null);
    }
});
