'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var load = require('./sandbox');

var MIN = 60000;

function epg(list) {
    var Epg = load(['epg.js'], {}, { Log: { error: function () {} }, Prefs: { get: function () { return true; } } }).globals.Epg;
    return Epg({ nowNext: function () { return Promise.resolve(list); } }, null);
}

function p(title, from, to) {
    var now = Date.now();
    return { title: title, desc: '', start: now + from * MIN, end: now + to * MIN };
}

test('overlapping guide entries: the programme that started last is on now, next follows it', async function () {
    // A provider keeps a long replay block over the short programmes inside it.
    var guide = epg([
        p('Long block', -145, 20),
        p('Earlier short', -25, -10),
        p('Started last', -10, 20),
        p('After', 20, 50),
        p('Same time', 20, 50),
    ]);
    var shown = await guide.load({ stream_id: 1 });
    assert.equal(shown.now.title, 'Started last');
    assert.equal(shown.next.title, 'After');
});

test('without overlaps the running programme and the one after it are shown', async function () {
    var guide = epg([p('Before', -60, -30), p('Now', -30, 30), p('Next', 30, 60), p('Later', 60, 90)]);
    var shown = await guide.load({ stream_id: 1 });
    assert.equal(shown.now.title, 'Now');
    assert.equal(shown.next.title, 'Next');
});
