'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var load = require('./sandbox');

var MINUTE = 60000;
var START = Date.UTC(2026, 2, 4, 20, 0, 0);
var KEY = 'iptvnator-tv:reminders';

// A fake clock: Date.now() is whatever the test says.
function setup(now, stored, files) {
    var clock = { now: now };
    var FakeDate = { now: function () { return clock.now; } };
    var env = load(files || ['library.js', 'reminders.js'], stored, { Date: FakeDate });
    return { api: env.globals.Reminders, clock: clock, env: env };
}

var channel = { name: 'Channel 1', stream_id: 1001, num: 1, category_id: '2', extra: 'dropped' };
function titles(list) { return plain(list.map(function (entry) { return entry.title; })); }
function plain(value) { return JSON.parse(JSON.stringify(value)); }
var programme = function (start, title) { return { title: title || 'Match', start: start, end: start + 90 * MINUTE }; };

test('a reminder is set, found and removed by source, channel and start', function () {
    var t = setup(START - 30 * MINUTE);
    assert.equal(t.api.add('s1', channel, programme(START)), true);
    assert.equal(t.api.has('s1', channel, programme(START)), true);
    assert.equal(t.api.has('s2', channel, programme(START)), false, 'another source');
    assert.equal(t.api.has('s1', { stream_id: 1002 }, programme(START)), false, 'another channel');
    assert.equal(t.api.has('s1', channel, programme(START + 90 * MINUTE)), false, 'another programme');
    assert.equal(t.api.add('s1', channel, programme(START)), false, 'twice is once');
    assert.equal(t.api.list().length, 1);
    t.api.remove('s1', channel, programme(START));
    assert.equal(t.api.has('s1', channel, programme(START)), false);
    assert.deepEqual(plain(t.api.list()), []);
});

test('a programme that started or ended cannot be reminded of', function () {
    var t = setup(START + MINUTE);
    assert.equal(t.api.add('s1', channel, programme(START)), false);
    assert.equal(t.api.add('s1', channel, programme(START + MINUTE)), false, 'starting this very second');
    assert.deepEqual(plain(t.api.list()), []);
});

test('the reminder keeps the programme and a slim channel snapshot, soonest first', function () {
    var t = setup(START - 60 * MINUTE);
    t.api.add('s1', channel, programme(START + 2 * 60 * MINUTE, 'Later'));
    t.api.add('s1', channel, programme(START, 'Match'));
    var list = t.api.list();
    assert.deepEqual(titles(list), ['Match', 'Later']);
    assert.equal(list[0].sourceId, 's1');
    assert.equal(list[0].start, START);
    assert.equal(list[0].end, START + 90 * MINUTE);
    assert.deepEqual(plain(list[0].channel), { name: 'Channel 1', stream_id: 1001, num: 1, category_id: '2' });
});

test('due is empty until the last minute, then names the reminder once', function () {
    var t = setup(START - 30 * MINUTE);
    t.api.add('s1', channel, programme(START));
    assert.equal(t.api.due(START - 2 * MINUTE), null, 'more than a minute away');
    assert.equal(t.api.due(START - MINUTE - 1), null, 'one millisecond early');
    var found = t.api.due(START - MINUTE);
    assert.equal(found.title, 'Match');
    assert.equal(t.api.due(START - MINUTE + 1000), null, 'announced once');
    assert.equal(t.api.has('s1', channel, programme(START)), true, 'still listed until it starts');
});

test('two reminders in the same minute come one after the other', function () {
    var t = setup(START - 30 * MINUTE);
    var other = { name: 'Channel 2', stream_id: 1002 };
    t.api.add('s1', other, programme(START, 'Second'));
    t.api.add('s1', channel, programme(START - 20000, 'First'));
    assert.equal(t.api.due(START - MINUTE).title, 'First');
    assert.equal(t.api.due(START - MINUTE + 1000).title, 'Second');
    assert.equal(t.api.due(START - MINUTE + 2000), null);
});

test('a reminder whose programme started is dropped and never announced', function () {
    var t = setup(START - 30 * MINUTE);
    t.api.add('s1', channel, programme(START));
    t.clock.now = START;
    assert.equal(t.api.due(START), null);
    assert.deepEqual(JSON.parse(t.env.stored[KEY]), [], 'removed from storage too');
});

test('reminders survive a restart and past ones go when the app opens', function () {
    var first = setup(START - 30 * MINUTE);
    first.api.add('s1', channel, programme(START, 'Soon'));
    first.api.add('s1', channel, programme(START + 5 * 60 * MINUTE, 'Tonight'));
    var saved = {};
    saved[KEY] = first.env.stored[KEY];
    var restarted = setup(START + MINUTE, saved);
    assert.deepEqual(titles(restarted.api.list()), ['Tonight']);
});

test('a reminder missing storage or holding junk reads as none', function () {
    var junk = {};
    junk[KEY] = '{"not":"a list"}';
    assert.deepEqual(plain(setup(START, junk).api.list()), []);
    junk[KEY] = 'oops';
    assert.deepEqual(plain(setup(START, junk).api.list()), []);
});

test('each profile has its own reminders', function () {
    var files = ['profile-store.js', 'library.js', 'reminders.js'];
    var t = setup(START - 30 * MINUTE, {}, files);
    var profiles = t.env.globals.ProfileStore;
    var first = profiles.active().id;
    t.api.add('s1', channel, programme(START));
    var second = profiles.add('Guest').id;
    profiles.setActive(second);
    assert.deepEqual(plain(t.api.list()), [], 'the other profile has none');
    t.api.add('s1', channel, programme(START, 'Mine'));
    profiles.setActive(first);
    assert.deepEqual(titles(t.api.list()), ['Match']);
});
