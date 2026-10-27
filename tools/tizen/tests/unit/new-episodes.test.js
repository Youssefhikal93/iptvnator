'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var load = require('./sandbox');

var WATCHED = 1700000000000; // ms, when the viewer last watched
var BEFORE = String(WATCHED / 1000 - 3600); // seconds
var AFTER = String(WATCHED / 1000 + 3600);

function show(id, modified) {
    return { name: 'Show ' + id, series_id: id, last_modified: modified };
}

function episodeEntry(id, episode) {
    var entry = show(id);
    entry.episode = { id: episode, label: 'S1 E1' };
    entry.show = show(id);
    return entry;
}

function app(stored) {
    var start = {};
    Object.keys(stored || {}).forEach(function (key) {
        start['iptvnator-tv:' + (key === 'progress' ? 'progress:s1' : key)] = JSON.stringify(stored[key]);
    });
    return load(['progress.js', 'library.js', 'new-episodes.js'], start);
}

// Show 4 was watched through episode 4001 at WATCHED, with no seen store yet.
function watchedShow() {
    return app({
        'recent:s1': { series: [episodeEntry(3004, 4001)] },
        progress: { 'episode:4001': { position: 200, duration: 400, updatedAt: WATCHED } },
    });
}

test('a watched show is new only when the catalogue date is after the last watched time', function () {
    var NewEpisodes = watchedShow().globals.NewEpisodes;
    assert.equal(NewEpisodes.isNew('s1', show(3004), [show(3004, AFTER)]), true);
    assert.equal(NewEpisodes.isNew('s1', show(3004), [show(3004, BEFORE)]), false);
    assert.equal(NewEpisodes.isNew('s1', show(3004), [show(3004, String(WATCHED / 1000))]), false);
    // Entries of Recently watched carry their show.
    assert.equal(NewEpisodes.isNew('s1', episodeEntry(3004, 4001), [show(3004, AFTER)]), true);
});

test('the catalogue date wins over the stale one saved with the item', function () {
    var NewEpisodes = watchedShow().globals.NewEpisodes;
    var saved = show(3004, BEFORE);
    assert.equal(NewEpisodes.isNew('s1', saved, [show(3004, AFTER)]), true);
    assert.equal(NewEpisodes.isNew('s1', show(3004, AFTER), [show(3004, BEFORE)]), false);
    // Without a catalogue list the saved snapshot is all there is.
    assert.equal(NewEpisodes.isNew('s1', show(3004, AFTER), undefined), true);
});

test('no date, no watching or a show that is neither favorite nor recent gives no badge', function () {
    var NewEpisodes = watchedShow().globals.NewEpisodes;
    assert.equal(NewEpisodes.isNew('s1', show(3004), [show(3004)]), false);
    assert.equal(NewEpisodes.isNew('s1', show(3004), [show(3004, '0')]), false);
    assert.equal(NewEpisodes.isNew('s1', show(3004), [show(3004, 'soon')]), false);
    assert.equal(NewEpisodes.isNew('s1', { name: 'Movie', stream_id: 1 }, []), false);
    // Never watched or opened.
    assert.equal(NewEpisodes.isNew('s1', show(3005), [show(3005, AFTER)]), false);
    var favorite = app({ 'favorites:s1': { series: [show(3005)] } }).globals.NewEpisodes;
    assert.equal(favorite.isNew('s1', show(3005), [show(3005, AFTER)]), false);
    // Another source's library is separate.
    assert.equal(NewEpisodes.isNew('s2', show(3004), [show(3004, AFTER)]), false);
});

test('opening a show clears the badge until the catalogue date moves again', function () {
    var run = watchedShow();
    var NewEpisodes = run.globals.NewEpisodes;
    var list = [show(3004, AFTER)];
    assert.equal(NewEpisodes.isNew('s1', show(3004), list), true);
    NewEpisodes.markSeen('s1', show(3004), list);
    assert.equal(NewEpisodes.isNew('s1', show(3004), list), false);
    var stored = JSON.parse(run.stored['iptvnator-tv:seen:s1']);
    assert.ok(stored['3004'] >= Date.now() - 5000);
    var later = [show(3004, String(Math.floor(Date.now() / 1000) + 7200))];
    assert.equal(NewEpisodes.isNew('s1', show(3004), later), true);
});

test('a provider clock ahead of the TV still clears the badge', function () {
    var NewEpisodes = watchedShow().globals.NewEpisodes;
    var list = [show(3004, String(Math.floor(Date.now() / 1000) + 86400))];
    assert.equal(NewEpisodes.isNew('s1', show(3004), list), true);
    NewEpisodes.markSeen('s1', show(3004), list);
    assert.equal(NewEpisodes.isNew('s1', show(3004), list), false);
});

test('a favorite is new once it has been opened and then grows', function () {
    var run = app({ 'favorites:s1': { series: [show(3005)] } });
    var NewEpisodes = run.globals.NewEpisodes;
    NewEpisodes.markSeen('s1', show(3005), [show(3005, BEFORE)]);
    assert.equal(NewEpisodes.isNew('s1', show(3005), [show(3005, BEFORE)]), false);
    assert.equal(NewEpisodes.isNew('s1', show(3005), [show(3005, String(Math.floor(Date.now() / 1000) + 600))]), true);
});

test('marking seen keeps older records and leaves the library untouched', function () {
    var run = app({
        'seen:s1': { 3001: 5 },
        'recent:s1': { series: [episodeEntry(3004, 4001)] },
    });
    var before = run.stored['iptvnator-tv:recent:s1'];
    run.globals.NewEpisodes.markSeen('s1', show(3004), []);
    var stored = JSON.parse(run.stored['iptvnator-tv:seen:s1']);
    assert.equal(stored['3001'], 5);
    assert.ok(stored['3004'] > 0);
    assert.equal(run.stored['iptvnator-tv:recent:s1'], before);
    // Items without a show id and unreadable storage are harmless.
    run.globals.NewEpisodes.markSeen('s1', { name: 'Movie' }, []);
    var broken = load(['progress.js', 'library.js', 'new-episodes.js'], { 'iptvnator-tv:seen:s1': '{bad json' });
    assert.equal(broken.globals.NewEpisodes.isNew('s1', show(3004), [show(3004, AFTER)]), false);
});

test('entries lists favorite and recent shows with new episodes once, newest first, from the catalogue', function () {
    var run = app({
        'favorites:s1': { series: [show(3004), show(3006), show(3007)] },
        'recent:s1': { series: [episodeEntry(3004, 4001), episodeEntry(3005, 4101)] },
        progress: {
            'episode:4001': { position: 200, duration: 400, updatedAt: WATCHED },
            'episode:4101': { position: 200, duration: 400, updatedAt: WATCHED },
        },
        'seen:s1': { 3006: WATCHED },
    });
    var list = [
        Object.assign(show(3004, String(WATCHED / 1000 + 100)), { cover: 'fresh.jpg' }),
        show(3005, String(WATCHED / 1000 + 500)),
        show(3006, String(WATCHED / 1000 + 300)),
        show(3007, String(WATCHED / 1000 + 900)),
    ];
    var found = run.globals.NewEpisodes.entries('s1', list);
    // 3007 was never watched or opened, so it is not new.
    assert.equal(found.map(function (item) { return item.series_id; }).join(','), '3005,3006,3004');
    assert.equal(found[2].cover, 'fresh.jpg');
    assert.equal(run.globals.NewEpisodes.entries('s2', list).length, 0);
});
