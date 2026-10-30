'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var fixture = require('../fixtures/backup/desktop-backup.json');
var load = require('./sandbox');

var FILES = ['library.js', 'recent-channels.js'];
var CHANNEL = function (n) { return { name: 'Channel ' + n, stream_id: 1000 + n, num: n, category_id: '2' }; };

// A clock the test moves by hand: timers fire when it passes their time.
function clock() {
    var now = 0;
    var timers = [];
    return {
        setTimeout: function (fn, ms) { timers.push({ at: now + ms, fn: fn, live: true }); return timers.length - 1; },
        clearTimeout: function (id) { if (timers[id]) timers[id].live = false; },
        pass: function (ms) {
            now += ms;
            timers.forEach(function (timer) {
                if (timer.live && timer.at <= now) {
                    timer.live = false;
                    timer.fn();
                }
            });
        },
    };
}

// The tracker over a source, with the channel on screen settable.
function app(files, stored) {
    var time = clock();
    var env = load(files || FILES, stored || {}, { setTimeout: time.setTimeout, clearTimeout: time.clearTimeout });
    var screen = { source: 's1', channel: null, allowed: function () { return true; }, changes: 0 };
    var tracker = env.globals.RecentChannels({
        sourceId: function () { return screen.source; },
        playing: function (channel) { return !!screen.channel && screen.channel.stream_id === channel.stream_id; },
        allows: function (channel) { return screen.allowed(channel); },
        changed: function () { screen.changes++; },
    });
    // What browser.js does when a channel starts to play.
    screen.watch = function (channel) {
        screen.channel = channel;
        tracker.begin(channel);
    };
    return { env: env, library: env.globals.Library, tracker: tracker, time: time, screen: screen };
}

// A plain array, whichever realm the list came from.
function ids(list) { return Array.prototype.map.call(list, function (channel) { return channel.stream_id - 1000; }); }

test('a channel joins the list after 10 s on screen, newest first, and the list reports the change', function () {
    var run = app();
    run.screen.watch(CHANNEL(1));
    run.time.pass(9999);
    assert.deepEqual(ids(run.tracker.list()), []);
    run.time.pass(1);
    assert.deepEqual(ids(run.tracker.list()), [1]);
    assert.equal(run.screen.changes, 1);
    run.screen.watch(CHANNEL(2));
    run.time.pass(10000);
    assert.deepEqual(ids(run.tracker.list()), [2, 1]);
});

test('a channel left under 10 s is not added, whether zapped away, stopped or never played', function () {
    var run = app();
    run.screen.watch(CHANNEL(1));
    run.time.pass(5000);
    run.screen.watch(CHANNEL(2));
    run.time.pass(9000);
    run.screen.channel = null;
    run.time.pass(2000);
    assert.deepEqual(ids(run.tracker.list()), [], 'channel 1 was zapped, channel 2 stopped');
    run.screen.watch(CHANNEL(3));
    run.tracker.cancel();
    run.time.pass(20000);
    assert.deepEqual(ids(run.tracker.list()), [], 'a cancelled watch (source switch) adds nothing');
});

test('a channel is never listed twice: watching it again moves it to the top', function () {
    var run = app();
    [1, 2, 3, 1].forEach(function (n) {
        run.screen.watch(CHANNEL(n));
        run.time.pass(10000);
    });
    assert.deepEqual(ids(run.tracker.list()), [1, 3, 2]);
});

test('the list keeps the last 10 channels', function () {
    var run = app();
    for (var n = 1; n <= 12; n++) {
        run.screen.watch(CHANNEL(n));
        run.time.pass(10000);
    }
    assert.deepEqual(ids(run.tracker.list()), [12, 11, 10, 9, 8, 7, 6, 5, 4, 3]);
});

test('each source has its own list, and the list survives a restart', function () {
    var run = app();
    run.screen.watch(CHANNEL(1));
    run.time.pass(10000);
    run.screen.source = 's2';
    assert.deepEqual(ids(run.tracker.list()), []);
    run.screen.watch(CHANNEL(2));
    run.time.pass(10000);
    assert.deepEqual(ids(run.tracker.list()), [2]);
    var restarted = app(FILES, run.env.stored);
    assert.deepEqual(ids(restarted.library.recentChannels('s1')), [1]);
    assert.deepEqual(ids(restarted.library.recentChannels('s2')), [2]);
});

test('each profile has its own list', function () {
    var run = app(['profile-store.js'].concat(FILES));
    var profiles = run.env.globals.ProfileStore;
    run.screen.watch(CHANNEL(1));
    run.time.pass(10000);
    profiles.setActive(profiles.add('Anna').id);
    assert.deepEqual(ids(run.tracker.list()), []);
    run.screen.watch(CHANNEL(2));
    run.time.pass(10000);
    assert.deepEqual(ids(run.tracker.list()), [2]);
    profiles.setActive('default');
    assert.deepEqual(ids(run.tracker.list()), [1]);
});

test('a profile sees only the channels it is allowed to, without losing the others', function () {
    var run = app();
    [1, 2, 3].forEach(function (n) {
        run.screen.watch(CHANNEL(n));
        run.time.pass(10000);
    });
    run.screen.allowed = function (channel) { return channel.stream_id !== 1002; };
    assert.deepEqual(ids(run.tracker.list()), [3, 1]);
    run.screen.allowed = function () { return true; };
    assert.deepEqual(ids(run.tracker.list()), [3, 2, 1]);
});

test('clearing empties only this source\'s list', function () {
    var run = app();
    run.screen.watch(CHANNEL(1));
    run.time.pass(10000);
    run.screen.source = 's2';
    run.screen.watch(CHANNEL(2));
    run.time.pass(10000);
    run.tracker.clear();
    assert.deepEqual(ids(run.tracker.list()), []);
    assert.deepEqual(ids(run.library.recentChannels('s1')), [1]);
});

test('a saved list that is not a list reads as empty', function () {
    var run = app();
    run.env.globals.Stored.save('iptvnator-tv:recent-channels:s1', { broken: true });
    assert.deepEqual(ids(run.tracker.list()), []);
});

test('the list is in the backup and comes back with it, joined to what is saved', async function () {
    var source = { id: 'old', type: 'xtream', name: 'Kept', url: 'https://tv.example.invalid/', user: 'fake-viewer', pass: 'keep-password' };
    var files = ['sources.js', 'progress-migration.js', 'library.js', 'progress.js', 'm3u-vod.js', 'm3u.js', 'audio-choice.js', 'backup-store.js', 'backup-m3u.js', 'backup.js'];
    var overrides = { URL: URL, SourceRequest: function () { return Promise.resolve(fixture.playlists[2].source.rawM3u); } };
    var first = load(files, {}, overrides);
    first.globals.Stored.save('iptvnator-tv:sources', [source]);
    first.globals.Stored.save('iptvnator-tv:current', 'old');
    first.globals.Stored.save('iptvnator-tv:recent-channels:old', [Object.assign(CHANNEL(2), { watchedAt: 200 }), Object.assign(CHANNEL(1), { watchedAt: 100 })]);
    var exported = await first.globals.Backup.build();
    assert.deepEqual(ids(exported.playlists[0].tvState.recentChannels), [2, 1]);

    var second = load(files, {}, overrides);
    second.globals.Stored.save('iptvnator-tv:sources', [source]);
    second.globals.Stored.save('iptvnator-tv:current', 'old');
    second.globals.Stored.save('iptvnator-tv:recent-channels:old', [Object.assign(CHANNEL(3), { watchedAt: 300 }), Object.assign(CHANNEL(1), { watchedAt: 50 })]);
    second.globals.Backup.apply(second.globals.Backup.parse(JSON.stringify(exported)), 'merge');
    assert.deepEqual(ids(second.globals.Library.recentChannels('old')), [3, 2, 1]);

    var third = load(files, {}, overrides);
    third.globals.Backup.apply(third.globals.Backup.parse(JSON.stringify(exported)), 'replace');
    assert.deepEqual(ids(third.globals.Library.recentChannels(third.globals.Sources.all()[0].id)), [2, 1]);
});

test('a backup without the list, or with a damaged one, is handled', function () {
    var plain = load(['sources.js', 'progress-migration.js', 'library.js', 'progress.js', 'm3u-vod.js', 'm3u.js', 'backup-store.js', 'backup-m3u.js', 'backup.js'], {}, { URL: URL });
    var archive = JSON.parse(JSON.stringify(fixture));
    assert.deepEqual(ids(plain.globals.Backup.parse(archive).sources[0].recentChannels), []);
    archive.playlists[0].tvState = { recentChannels: 'nope' };
    assert.throws(function () { plain.globals.Backup.parse(archive); }, /Invalid backup/);
});
