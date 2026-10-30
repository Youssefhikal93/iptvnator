'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var load = require('./sandbox');
var P = 'iptvnator-tv:p:default:';
var A = 'iptvnator-tv:p:anna:';
var FILES = ['profile-store.js', 'sources.js', 'progress.js', 'progress-migration.js', 'library.js', 'library-all.js', 'watched.js', 'new-episodes.js'];

function seed() {
    return {
        'iptvnator-tv:sources': '[{"id":"s1","name":"One"},{"id":"s2","name":"Two"}]',
        'iptvnator-tv:current': '"s1"',
        'iptvnator-tv:profiles': '[{"id":"default","name":"Me"},{"id":"anna","name":"Anna"}]',
    };
}

function record(position) {
    return JSON.stringify({ 'movie:42': { position: position, duration: 1000, updatedAt: 123 } });
}

test('#34 the same movie and episode ids keep separate resume points and watched marks per source', function () {
    var env = load(FILES, seed());
    var g = env.globals;
    ['movie:42', 'episode:42'].forEach(function (id) {
        g.Progress.save(id, 120, 1000);
        g.Sources.setCurrent('s2');
        assert.equal(g.Progress.of(id), null);
        g.Progress.finish(id, 1000);
        assert.equal(g.Progress.isWatched(id), true);
        assert.equal(g.Progress.of(id, 's1').position, 120);
        assert.equal(g.Progress.isWatched(id, 's1'), false);
        assert.equal(g.Progress.resumeFrom(id, 1000, 's1'), 120);
        g.Progress.clear(id);
        assert.equal(g.Progress.of(id), null);
        g.Progress.save(id, 300, 1000);
        g.Sources.setCurrent('s1');
        assert.equal(g.Progress.of(id).position, 120);
        assert.equal(g.Progress.of(id, 's2').position, 300);
    });
    g.Progress.mark(['episode:42'], true, [1000], 's2');
    assert.equal(g.Progress.allWatched([{ id: 42 }], 's2'), true);
    assert.equal(g.Progress.allWatched([{ id: 42 }]), false);
    g.ProfileStore.setActive('anna');
    assert.equal(g.Progress.of('movie:42'), null);
    assert.equal(g.Progress.of('movie:42', 's2'), null);
});

test('#34 migration copies every profile to existing sources once, preserves scoped data and keeps the original backup', function () {
    var stored = seed();
    stored[P + 'progress'] = record(120);
    stored[A + 'progress'] = record(240);
    stored[P + 'progress:s2'] = record(500);
    var env = load(FILES, stored);
    assert.equal(env.stored[P + 'progress:s1'], record(120));
    assert.equal(env.stored[P + 'progress:s2'], record(500));
    assert.equal(env.stored[A + 'progress:s1'], record(240));
    assert.equal(env.stored[A + 'progress:s2'], record(240));
    [P, A].forEach(function (prefix) {
        assert.equal(env.stored[prefix + 'progress'], undefined);
        assert.equal(env.stored[prefix + 'progress:legacy'], stored[prefix + 'progress']);
    });
    var again = load(FILES, env.stored);
    assert.deepEqual(again.stored, env.stored);
    var added = again.globals.Sources.add({ name: 'Later', url: 'https://example.invalid' });
    again.globals.ProgressMigration.init();
    assert.equal(again.globals.Progress.of('movie:42', added.id), null);
});

test('#34 an interrupted migration retains the original and retries only the original sources', function () {
    var stored = seed();
    stored[P + 'progress'] = record(120);
    var fail = true;
    var storage = {
        getItem: function (key) { return stored[key] === undefined ? null : stored[key]; },
        setItem: function (key, value) {
            if (fail && key === P + 'progress:s2') throw new Error('quota');
            stored[key] = String(value);
        },
        removeItem: function (key) { delete stored[key]; },
        key: function (index) { return Object.keys(stored)[index] || null; },
        get length() { return Object.keys(stored).length; },
    };
    var g = load(FILES, {}, { localStorage: storage }).globals;
    assert.equal(stored[P + 'progress'], record(120));
    assert.equal(stored[P + 'progress:s1'], record(120));
    g.Progress.save('movie:42', 360, 1000);
    var added = g.Sources.add({ name: 'Later', url: 'https://example.invalid' });
    fail = false;
    load(FILES, {}, { localStorage: storage });
    assert.equal(stored[P + 'progress'], undefined);
    assert.equal(stored[P + 'progress:legacy'], record(120));
    assert.equal(JSON.parse(stored[P + 'progress:s1'])['movie:42'].position, 360);
    assert.equal(stored[P + 'progress:s2'], record(120));
    assert.equal(stored[P + 'progress:' + added.id], undefined);
});

test('#34 removing a source deletes its scoped progress for every profile, keeping other sources and the legacy backup', function () {
    var stored = seed();
    [P, A].forEach(function (prefix) { stored[prefix + 'progress'] = record(120); });
    var env = load(FILES, stored);
    env.globals.Sources.remove('s2');
    [P, A].forEach(function (prefix) {
        assert.equal(env.stored[prefix + 'progress:s2'], undefined);
        assert.equal(env.stored[prefix + 'progress:s1'], record(120));
        assert.equal(env.stored[prefix + 'progress:legacy'], record(120));
    });
});

test('#34 rekey to another source account starts empty and rekey back restores progress', function () {
    var env = load(FILES, seed());
    var g = env.globals;
    g.Progress.save('movie:42', 120, 1000);
    g.Progress.finish('episode:42', 1000);
    g.Sources.rekey('s1', { id: 'changed', name: 'Changed account' });
    assert.equal(g.Progress.of('movie:42'), null);
    assert.equal(g.Progress.isWatched('episode:42'), false);
    g.Progress.save('movie:42', 360, 1000);
    g.Sources.rekey('changed', { id: 's1', name: 'Original account' });
    assert.equal(g.Progress.of('movie:42').position, 120);
    assert.equal(g.Progress.isWatched('episode:42'), true);
    assert.equal(g.Progress.of('movie:42', 'changed').position, 360);
});

test('#34 All sources snapshots, Continue watching and watched actions use the item source', function () {
    var env = load(FILES, seed());
    var g = env.globals;
    var movie = { name: 'Movie', stream_id: 42 };
    g.Library.addRecent('s2', 'movies', movie);
    g.Progress.finish('movie:42', 1000);
    g.Progress.save('movie:42', 240, 1000, 's2');
    var item = g.LibraryAll.recent('movies', 's1')[0];
    assert.equal(g.Progress.unfinished('movies', item).position, 240);
    assert.equal(g.Library.continueWatching('s2', 'movies').length, 1);
    var marked = [];
    var watched = g.Watched({ changed: function () {}, marked: function (from, section, title, ids) { marked.push([from, section, title, ids]); } });
    assert.equal(watched.isWatched(item, 'movies'), false);
    var options;
    g.Menu = { open: function (title, entries) { options = entries; } };
    watched.openItemMenu(item, 'movies', [], 'Movie');
    options[0].run();
    assert.equal(watched.isWatched(item, 'movies'), true);
    // #72: the mark is offered to "Because you watched" with the item's source.
    assert.equal(marked.length, 1);
    assert.equal(marked[0][0], item);
    assert.equal(marked[0][2], item);
    assert.equal(marked[0][3].join(), 'movie:42');
    assert.equal(g.Progress.of('movie:42').duration, 1000);
    assert.equal(g.Library.continueWatching('s2', 'movies').length, 0);
});

test('#34 new episode badges use progress from the requested source', async function () {
    var env = load(FILES, seed());
    var g = env.globals;
    var show = { name: 'Show', series_id: 7, last_modified: 200 };
    g.Library.addRecent('s2', 'series', show, show, { id: 42 });
    env.stored[P + 'progress:s1'] = JSON.stringify({ 'episode:42': { position: 120, duration: 1000, updatedAt: 300000 } });
    env.stored[P + 'progress:s2'] = JSON.stringify({ 'episode:42': { position: 120, duration: 1000, updatedAt: 100000 } });
    // A write from outside the app is read from the next run of its code.
    await null;
    assert.equal(g.NewEpisodes.isNew('s2', show), true);
    env.stored[P + 'progress:s2'] = env.stored[P + 'progress:s1'];
    await null;
    assert.equal(g.NewEpisodes.isNew('s2', show), false);
});
