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

// A guide whose answers are scripted per call, on a clock the test moves.
function scripted(answers) {
    var clock = { at: Date.now() };
    var calls = 0;
    var Epg = load(['epg.js'], {}, {
        Log: { error: function () {} },
        Prefs: { get: function () { return true; } },
        Date: { now: function () { return clock.at; } },
    }).globals.Epg;
    var guide = Epg({ nowNext: function () { return answers[Math.min(calls++, answers.length - 1)](); } }, null);
    return { guide: guide, clock: clock, calls: function () { return calls; } };
}

function busy(wait) {
    var err = new Error('Source is busy');
    err.code = 'busy';
    err.wait = wait;
    return Promise.reject(err);
}

test('a busy provider is not "no guide": the channel is asked again once the rest is over', async function () {
    var t = scripted([function () { return busy(60 * 1000); }, function () { return Promise.resolve([p('Now', -30, 30)]); }]);
    var channel = { stream_id: 1 };
    assert.equal((await t.guide.load(channel)).now, null);
    t.clock.at += 30 * 1000;
    assert.notEqual(t.guide.peek(channel), undefined, 'not asked again during the rest');
    t.clock.at += 31 * 1000;
    assert.equal(t.guide.peek(channel), undefined, 'asked again after the rest, not in 30 minutes');
    assert.equal((await t.guide.load(channel)).now.title, 'Now');
    assert.equal(t.calls(), 2);
});

test('a failed request is retried after two minutes; an empty answer waits thirty', async function () {
    var failed = scripted([function () { return Promise.reject(new Error('HTTP 500')); }]);
    await failed.guide.load({ stream_id: 1 });
    failed.clock.at += 2 * MIN + 1000;
    assert.equal(failed.guide.peek({ stream_id: 1 }), undefined);
    var empty = scripted([function () { return Promise.resolve([]); }]);
    await empty.guide.load({ stream_id: 1 });
    empty.clock.at += 2 * MIN + 1000;
    assert.notEqual(empty.guide.peek({ stream_id: 1 }), undefined);
    empty.clock.at += 30 * MIN;
    assert.equal(empty.guide.peek({ stream_id: 1 }), undefined);
});
