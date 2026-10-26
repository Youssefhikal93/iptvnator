'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var sandbox = require('./sandbox');

function library(stored, overrides) {
    return sandbox(['sources.js', 'library.js', 'library-all.js'], Object.assign({
        'iptvnator-tv:sources': JSON.stringify([
            { id: 's1', name: 'First' }, { id: 's2', name: 'Second' }, { id: 's3', name: 'Third' },
        ]),
    }, stored), overrides);
}

test('favorites keep duplicate item ids across sources, current first, without changing snapshots', function () {
    var env = library();
    var lib = env.globals.Library;
    lib.toggleFavorite('s1', 'live', { stream_id: 1, name: 'One' });
    lib.toggleFavorite('s2', 'live', { stream_id: 1, name: 'Two' });
    lib.toggleFavorite('s2', 'live', { stream_id: 2, name: 'Three' });
    lib.toggleFavorite('s3', 'live', { stream_id: 3, name: 'Four' });
    lib.toggleFavorite('s3', 'movies', { stream_id: 1, name: 'Movie' });
    lib.toggleFavorite('deleted', 'live', { stream_id: 9, name: 'Gone' });
    var before = env.stored['iptvnator-tv:favorites:s2'];
    var merged = env.globals.LibraryAll.favorites('live', 's2');
    assert.equal(merged.map(function (item) { return item.name; }).join(','), 'Three,Two,One,Four');
    assert.equal(merged.map(function (item) { return item.sourceName; }).join(','), 'Second,Second,First,Third');
    assert.equal(merged.map(function (item) { return item.sourceId; }).join(','), 's2,s2,s1,s3');
    merged[0].name = 'Changed';
    assert.equal(env.stored['iptvnator-tv:favorites:s2'], before);
    assert.equal(lib.favorites('s2', 'live')[0].sourceId, undefined);
    assert.equal(env.globals.LibraryAll.favorites('series', 's1').length, 0);
    assert.equal(env.globals.LibraryAll.favorites('live', 'missing').map(function (item) { return item.sourceId; }).join(','), 's1,s2,s2,s3');
});

test('recents merge by watched time, with stable ties and legacy order after dated items', function () {
    var env = library({
        'iptvnator-tv:recent:s1': JSON.stringify({ live: [
            { name: 'Old one' }, { name: 'Old two' }, { name: 'Earlier', watchedAt: 100 },
        ] }),
        'iptvnator-tv:recent:s2': JSON.stringify({ live: [
            { name: 'Latest', watchedAt: 300 }, { name: 'Tie one', watchedAt: 100 }, { name: 'Legacy second' },
        ] }),
        'iptvnator-tv:recent:s3': JSON.stringify({ live: [{ name: 'Tie two', watchedAt: 100 }] }),
        'iptvnator-tv:recent:deleted': JSON.stringify({ live: [{ name: 'Gone', watchedAt: 999 }] }),
    });
    var merged = env.globals.LibraryAll.recent('live', 's2');
    assert.equal(merged.map(function (item) { return item.name; }).join(','),
        'Latest,Tie one,Earlier,Tie two,Legacy second,Old one,Old two');
    assert.equal(env.globals.LibraryAll.recent('movies', 's1').length, 0);
});

test('new plays timestamp and replace recent snapshots, including saved episodes', function () {
    var now = 100;
    var env = library({}, { Date: { now: function () { return now; } } });
    var lib = env.globals.Library;
    lib.addRecent('s1', 'live', { stream_id: 1, name: 'First' });
    now = 200;
    lib.addRecent('s2', 'live', { stream_id: 1, name: 'Second' });
    now = 300;
    lib.addRecent('s1', 'live', { stream_id: 1, name: 'First again' });
    assert.equal(lib.recent('s1', 'live').length, 1);
    assert.equal(env.globals.LibraryAll.recent('live', 's2').map(function (item) { return item.watchedAt; }).join(','), '300,200');
    lib.addRecent('s2', 'series', {}, { series_id: 4, name: 'Show' }, { id: 8, label: 'S1 E1' });
    var episode = env.globals.LibraryAll.recent('series', 's1')[0];
    assert.equal(episode.watchedAt, 300);
    assert.equal(episode.episode.id, 8);
    assert.equal(episode.show.series_id, 4);
});

test('removing a source drops its library even while its storage keys remain', function () {
    var env = library();
    var lib = env.globals.Library;
    lib.toggleFavorite('s2', 'movies', { stream_id: 1 });
    lib.addRecent('s2', 'movies', { stream_id: 1 });
    env.globals.Sources.remove('s2');
    assert.equal(env.globals.LibraryAll.favorites('movies', 's1').length, 0);
    assert.equal(env.globals.LibraryAll.recent('movies', 's1').length, 0);
    assert.equal(lib.favorites('s2', 'movies').length, 1);
});
