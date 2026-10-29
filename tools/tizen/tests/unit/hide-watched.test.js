'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const load = require('./sandbox');

function app() {
    return load(['sources.js', 'progress.js', 'watched.js', 'hide-watched.js'], {
        'iptvnator-tv:sources': '[{"id":"s1"}]',
        'iptvnator-tv:current': '"s1"',
    }).globals;
}

test('finish rule, explicit marks and source identity filter movies and count every row without mutating it', () => {
    const g = app();
    g.Progress.save('movie:1', 279, 300);
    g.Progress.mark(['movie:2'], true);
    const movies = [1, 2, 3].map(id => ({ stream_id: id, category_id: 'a' }));
    movies.push({ stream_id: 1, category_id: 'b', sourceId: 's2' });
    const filter = g.HideWatched(g.Watched({}), 'movies');
    assert.deepEqual(Array.from(filter.filter(movies), m => m.stream_id), [3, 1]);
    const rows = [{ all: 'movies' }, { category_id: 'a', count: 3 }, { category_id: 'b' },
        { virtual: 'favorites', list: () => movies.slice(0, 2) }];
    assert.deepEqual(Array.from(filter.counts(rows, movies, () => null), r => r.count), [2, 1, 1, 0]);
    assert.equal(filter.counts(rows, movies, () => movies)[1].count, 2);
    assert.equal(rows[1].count, 3);
    assert.equal(filter.filter(movies.slice(0, 2)).length, 0);
});

test('series filtering matches the badge for unknown, empty, partial and fully watched known episodes', () => {
    const g = app();
    const shows = [{}, { episodes: [] }, { episodes: [{ id: 1 }, { id: 2 }] }, { episodes: [{ id: 1 }] }];
    const watched = g.Watched({ knownShow: item => shows[item.series_id] });
    const items = shows.map((_, series_id) => ({ series_id }));
    g.Progress.mark(['episode:1'], true);
    let filter = g.HideWatched(watched, 'series');
    assert.deepEqual(Array.from(filter.filter(items), s => s.series_id), [0, 1, 2]);
    items.forEach(item => assert.equal(!filter.filter([item]).length, watched.isWatched(item, 'series')));
    g.Progress.mark(['episode:2'], true);
    filter = g.HideWatched(watched, 'series');
    assert.deepEqual(Array.from(filter.filter(items), s => s.series_id), [0, 1]);
});

test('8000-title filtering reads progress once per source and the snapshot needs no further storage', () => {
    const g = app();
    g.Progress.mark(['movie:8000'], true);
    let reads = 0;
    const read = g.localStorage.getItem;
    g.localStorage.getItem = key => { reads++; return read(key); };
    const filter = g.HideWatched(g.Watched({}), 'movies');
    const items = Array.from({ length: 8000 }, (_, i) => ({ stream_id: i + 1 }));
    assert.equal(filter.filter(items).length, 7999);
    const first = reads;
    filter.filter(items);
    assert.equal(reads, first);
    assert.ok(first <= 3);
});
