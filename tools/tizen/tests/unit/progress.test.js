'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var load = require('./sandbox');
var KEY = 'iptvnator-tv:progress';

function progressAt(position, duration) {
    var stored = {};
    stored[KEY] = JSON.stringify({ test: { position: position, duration: duration, updatedAt: 123 } });
    return load(['progress.js'], stored);
}

test('old short and long videos use the same finish rule without rewriting storage', function () {
    [
        [279, 300, 'watched'], // 93 %, with 21 seconds left.
        [6912, 7200, 'watched'], // 96 %, with more than 30 seconds left.
        [270, 300, 'continue'], // Exactly 30 seconds remain, below 95 %.
        [270.1, 300, 'watched'],
        [6840, 7200, 'watched'], // Exactly 95 %.
        [6839, 7200, 'continue'],
    ].forEach(function (scenario) {
        var app = progressAt(scenario[0], scenario[1]);
        var before = app.stored[KEY];
        var saved = app.globals.Progress.of('test');
        assert.equal(saved.status, scenario[2]);
        assert.equal(saved.position, scenario[0]);
        assert.equal(saved.duration, scenario[1]);
        assert.equal(saved.updatedAt, 123);
        assert.equal(saved.ratio, scenario[0] / scenario[1]);
        assert.equal(app.stored[KEY], before);
    });
});

test('unknown duration never implies watched; ending and marking create full records', function () {
    [0, 100].forEach(function (position) {
        var progress = progressAt(position, 0).globals.Progress;
        assert.equal(progress.of('test'), null);
        assert.equal(progress.isWatched('test'), false);
        assert.equal(progress.resumeFrom('test', 0), 0);
        progress.save('unknown', position, 0);
        assert.equal(progress.of('unknown'), null);
        progress.finish('ended', 0);
        progress.mark(['marked'], true, [0]);
        ['ended', 'marked'].forEach(function (id) {
            var saved = progress.of(id);
            assert.equal(saved.status, 'watched');
            assert.equal(saved.position, saved.duration);
            assert.equal(saved.ratio, 1);
        });
    });
});

test('save normalizes finished progress and retains the existing record shape and early-save threshold', function () {
    [ [279, 300, 300], [6912, 7200, 7200], [570.5, 600.9, 600], [120.9, 1000.9, 120] ].forEach(function (scenario) {
        var app = progressAt(50, 1000);
        var progress = app.globals.Progress;
        progress.save('saved', scenario[0], scenario[1]);
        var records = JSON.parse(app.stored[KEY]);
        assert.deepEqual(Object.keys(records.saved).sort(), ['duration', 'position', 'updatedAt']);
        assert.equal(records.saved.position, scenario[2]);
        assert.equal(records.saved.duration, Math.floor(scenario[1]));
        assert.ok(records.saved.updatedAt > 0);
        assert.equal(records.test.position, 50);
        progress.save('early', 4.9, 1000);
        assert.equal(progress.of('early'), null);
        progress.save('early', 5, 1000);
        assert.equal(progress.of('early').position, 5);
    });
});

test('resume respects the minimum and both finish boundaries, including the current duration', function () {
    [
        [29, 1000, 1000, 0], [30, 1000, 1000, 30],
        [270, 300, 300, 270], [271, 300, 300, 0],
        [6840, 7200, 7200, 0], [6839, 7200, 7200, 6839],
        [279, 1000, 300, 0], [300, 1000, 0, 300],
    ].forEach(function (scenario) {
        var progress = progressAt(scenario[0], scenario[1]).globals.Progress;
        assert.equal(progress.resumeFrom('test', scenario[2]), scenario[3]);
    });
});

test('ids preserve movie, saved episode, standalone episode and fallback identities', function () {
    var progress = load(['progress.js']).globals.Progress;
    assert.equal(progress.id('movies', { stream_id: 0 }), 'movie:0');
    assert.equal(progress.id('movies', { stream_id: 42 }), 'movie:42');
    assert.equal(progress.id('series', { episode: { id: '007' }, progressId: 'ignored' }), 'episode:007');
    assert.equal(progress.episodeId({ id: 0 }), 'episode:0');
    assert.equal(progress.episodeId({ id: null }), undefined);
    assert.equal(progress.episodeId({}), undefined);
    assert.equal(progress.id('series', { progressId: 'legacy' }), 'legacy');
    assert.equal(progress.id('live', { stream_id: 42 }), undefined);
    assert.equal(progress.of(undefined), null);
});

test('marking a season preserves known lengths and unmarking removes only selected progress', function () {
    var app = progressAt(100, 1000);
    var progress = app.globals.Progress;
    var episodes = [{ id: 1 }, { id: 2 }];
    var ids = episodes.map(progress.episodeId);
    progress.mark(ids.concat(['test']), true, [300.5, 0, 200]);
    assert.equal(progress.allWatched(episodes), true);
    assert.equal(progress.allWatched([]), false);
    assert.equal(progress.of('test').duration, 1000);
    assert.equal(progress.of(ids[0]).duration, 300.5);
    assert.equal(progress.unfinished('series', { episode: episodes[0] }), null);
    progress.mark(ids, false);
    assert.equal(progress.allWatched(episodes), false);
    assert.equal(progress.of(ids[0]), null);
    assert.equal(progress.isWatched('test'), true);
    progress.clear('test');
    assert.deepEqual(JSON.parse(app.stored[KEY]), {});
});
