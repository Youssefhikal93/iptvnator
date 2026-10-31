'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var load = require('./sandbox');
var fs = require('node:fs');
var vm = require('node:vm');
var path = require('node:path');

function plain(state) { return JSON.parse(JSON.stringify(state)); }
function app(records) { return load(['keys.js', 'profile-store.js', 'library.js', 'multi-view-state.js', 'multi-view-store.js'], records); }

test('#77 round1 delayed picks retain their target and channel after focus moves', function () {
    var g = app().globals;
    var state = { tiles: ['one', null, null, null], focus: 1 };
    var firstTarget = state.focus;
    state = g.MultiViewState.move(state, g.Keys.DOWN);
    var secondTarget = state.focus;
    state = g.MultiViewState.put(state, 'three', secondTarget);
    state = g.MultiViewState.put(state, 'two', firstTarget);
    assert.deepEqual(plain(state), { tiles: ['one', 'two', null, 'three'], focus: 3 });
});

test('#77 round1 resume preserves each tile category without storing its whole channel list', function () {
    var env = app();
    env.globals.MultiViewStore.save('s1', { tiles: [{ stream_id: 3 }, { stream_id: 1 }], categories: ['__group_tv', '__fav'] });
    var reloaded = app(env.stored).globals;
    assert.deepEqual(plain(reloaded.MultiViewStore.read('s1')), { tiles: ['3', '1'], focus: 0, categories: ['__group_tv', '__fav'] });
});

test('#77 adding, removing and making main preserve the other tiles and the input state', function () {
    var m = app().globals.MultiViewState;
    var initial = { tiles: ['a', 'b', null], focus: 2 };
    var added = m.put(initial, 'c');
    assert.deepEqual(plain(added), { tiles: ['a', 'b', 'c'], focus: 2 });
    var main = m.main(added);
    assert.deepEqual(plain(main), { tiles: ['c', 'b', 'a'], focus: 0 });
    assert.deepEqual(plain(m.put(main, null)), { tiles: [null, 'b', 'a'], focus: 0 });
    assert.deepEqual(initial, { tiles: ['a', 'b', null], focus: 2 });
});

test('#77 smaller layouts drop the last channels and clamp focus; larger layouts add empty tiles', function () {
    var m = app().globals.MultiViewState;
    var four = { tiles: ['a', 'b', 'c', 'd'], focus: 3 };
    var three = m.layout(four, 3);
    assert.deepEqual(plain(three), { tiles: ['a', 'b', 'c'], focus: 2 });
    var two = m.layout(three, 2);
    assert.deepEqual(plain(two), { tiles: ['a', 'b'], focus: 1 });
    assert.deepEqual(plain(m.layout(two, 4)), { tiles: ['a', 'b', null, null], focus: 1 });
});

test('#77 directional focus follows the geometry and stays at screen edges', function () {
    var g = app().globals;
    [
        [2, 0, 'RIGHT', 1], [2, 1, 'LEFT', 0], [2, 0, 'UP', 0], [2, 1, 'RIGHT', 1],
        [3, 0, 'RIGHT', 1], [3, 1, 'DOWN', 2], [3, 2, 'UP', 1], [3, 2, 'LEFT', 0], [3, 0, 'DOWN', 0],
        [4, 0, 'DOWN', 2], [4, 2, 'RIGHT', 3], [4, 3, 'UP', 1], [4, 1, 'RIGHT', 1], [4, 2, 'LEFT', 2],
    ].forEach(function (example) {
        var state = g.MultiViewState.layout({ tiles: [], focus: 0 }, example[0]);
        state.focus = example[1];
        assert.equal(g.MultiViewState.move(state, g.Keys[example[2]]).focus, example[3], example.join(' '));
    });
});

test('#77 lowering the single TV limit removes the fourth layout and truncates old resumes', function () {
    var env = app();
    var source = fs.readFileSync(path.join(__dirname, '../../tv-app/js/multi-view-state.js'), 'utf8');
    vm.runInNewContext(source.replace('MAX_TILES = 4', 'MAX_TILES = 3'), env.globals);
    assert.deepEqual(plain(env.globals.MultiViewState.layouts()), [2, 3]);
    assert.equal(env.globals.MultiViewState.layout({ tiles: [1, 2, 3, 4], focus: 3 }, 4).tiles.length, 3);
});

test('#77 resume survives a new page, isolates profiles and sources, and stores no stream addresses', function () {
    var env = app();
    var g = env.globals;
    var state = { tiles: [{ stream_id: 1, name: 'One', url: 'http://secret.test/live' }, null, { stream_id: 2, name: 'Two' }], focus: 2 };
    g.MultiViewStore.save('s1', state);
    assert.equal(g.MultiViewStore.read('s2'), null);
    var second = g.ProfileStore.add('Second');
    g.ProfileStore.setActive(second.id);
    assert.equal(g.MultiViewStore.read('s1'), null);
    g.MultiViewStore.save('s1', { tiles: [state.tiles[2], null], focus: 0 });
    g.ProfileStore.setActive('default');
    var reloaded = app(env.stored).globals;
    assert.deepEqual(plain(reloaded.MultiViewStore.read('s1')), { tiles: ['1', null, '2'], focus: 0 });
    assert.ok(!JSON.stringify(env.stored).includes('secret.test'));
});

test('#77 malformed resume records are ignored without changing saved storage', function () {
    [null, '{broken', JSON.stringify({ channels: [1, 2] }), JSON.stringify({ channels: ['1'] })].forEach(function (raw) {
        var records = { 'iptvnator-tv:p:default:multi-view:s1': raw };
        var env = app(records);
        assert.equal(env.globals.MultiViewStore.read('s1'), null);
        assert.equal(env.stored['iptvnator-tv:p:default:multi-view:s1'], raw);
    });
});
