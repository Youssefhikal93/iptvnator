'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var load = require('./sandbox');

// Objects made inside the sandbox compare by value.
function plain(value) { return JSON.parse(JSON.stringify(value)); }

function quality(overrides) {
    return load(['quality.js', 'player-quality.js'], {}, overrides).globals;
}

test('#94 quality words are read from names; a live "beIN 4K" keeps 4K as its name', function () {
    var Q = quality().Quality;
    assert.deepEqual(plain(Q.parse('beIN SPORTS 1 4K', true)), { tag: '4K', base: 'bein sports 1' });
    assert.deepEqual(plain(Q.parse('beIN SPORTS 1 FHD H.265', true)), { tag: 'FHD', base: 'bein sports 1' });
    assert.deepEqual(plain(Q.parse('beIN SPORTS 1 Low', true)), { tag: 'SD', base: 'bein sports 1' });
    assert.deepEqual(plain(Q.parse('beIN 4K', true)), { tag: '', base: 'bein 4k' });
    assert.deepEqual(plain(Q.parse('Dune 2160p', false)), { tag: '4K', base: 'dune' });
    assert.deepEqual(plain(Q.parse('Dune 4K', false)), { tag: '4K', base: 'dune' });
    assert.deepEqual(plain(Q.parse('Dune (720p)', false)), { tag: 'HD', base: 'dune' });
});

test('#94 copies are one per quality, best first, and only when there is a choice', function () {
    var Q = quality().Quality;
    var hd = { name: 'beIN SPORTS 1 HD' };
    var list = [hd, { name: 'beIN SPORTS 1 4K' }, { name: 'beIN SPORTS 1 HD' }, { name: 'beIN SPORTS 2 FHD' }, { name: 'beIN SPORTS 1' }];
    assert.deepEqual(Array.from(Q.copies(hd, list, true), function (c) { return c.tag; }), ['4K', 'HD', '']);
    assert.equal(Q.copies(hd, [hd, { name: 'beIN SPORTS 1 HD' }], true), null);
    assert.equal(Q.copies({ name: 'News' }, [{ name: 'Sports HD' }], true), null);
});

test('#94 Auto plays the best copy the screen shows; a remembered pick wins until Auto forgets it', function () {
    var full = quality({ webapis: { productinfo: { isUdPanelSupported: function () { return false; } } } });
    var Q = full.Quality;
    var copies = [{ tag: '4K' }, { tag: 'FHD' }, { tag: 'SD' }];
    assert.deepEqual(plain(Q.choose('live|s|bein 1', copies)), { copy: { tag: 'FHD' }, auto: true });
    Q.remember('live|s|bein 1', 'SD');
    assert.deepEqual(plain(Q.choose('live|s|bein 1', copies)), { copy: { tag: 'SD' }, auto: false });
    // A pick whose copy is gone falls back to Auto.
    assert.deepEqual(plain(Q.choose('live|s|bein 1', [{ tag: '4K' }, { tag: 'HD' }])), { copy: { tag: 'HD' }, auto: true });
    Q.remember('live|s|bein 1', null);
    assert.equal(Q.picked('live|s|bein 1'), null);
    assert.equal(quality().Quality.choose('k', copies).copy.tag, '4K');
});

test('#94 at most 200 titles keep a pick, newest kept', function () {
    var Q = quality().Quality;
    for (var i = 0; i < 205; i++) Q.remember('t' + i, 'HD');
    assert.equal(Q.picked('t0'), null);
    assert.equal(Q.picked('t204'), 'HD');
    Q.remember('t5', 'SD');
    assert.equal(Q.picked('t5'), 'SD');
});

function hlsMenu(lib, req) {
    var g = quality();
    var rows = [];
    var heads = [];
    var menu = g.PlayerQuality({ current: function () { return req; }, hls: function () { return lib; }, switchTo: function () {} });
    menu.menuEntries(function (label) { heads.push(label); }, function (label, active, run) { rows.push({ label: label, active: active, run: run }); });
    return { g: g, rows: rows, heads: heads, menu: menu };
}

test('#94 an adaptive HLS stream lists its heights; a pick is kept for the channel and applied next time', function () {
    var lib = { levels: [{ height: 360, bitrate: 1 }, { height: 720, bitrate: 2 }, { height: 720, bitrate: 3 }, { height: 1080, bitrate: 4 }], currentLevel: 1, autoLevelEnabled: true };
    var req = { live: true, channel: 's|live|7' };
    var m = hlsMenu(lib, req);
    assert.deepEqual(m.heads, ['Quality']);
    assert.deepEqual(m.rows.map(function (r) { return r.label + (r.active ? '*' : ''); }), ['Auto (720p)*', '1080p', '720p', '360p']);
    m.rows[2].run();
    assert.equal(lib.currentLevel, 2);
    assert.equal(m.g.Quality.picked('s|live|7'), '720p');
    var next = { levels: lib.levels, currentLevel: -1, autoLevelEnabled: true };
    hlsMenu(next, req).menu.applyLevel();
    assert.equal(m.g.Quality.picked('s|live|7'), '720p');
    var again = hlsMenu(next, req);
    again.g.Quality.remember('s|live|7', '1080p');
    again.menu.applyLevel();
    assert.equal(next.currentLevel, 3);
    m.rows[0].run();
    assert.equal(lib.currentLevel, -1);
    assert.equal(m.g.Quality.picked('s|live|7'), null);
});

test('#94 one height, or no levels, shows no Quality row', function () {
    assert.deepEqual(hlsMenu({ levels: [{ height: 720 }, { height: 720 }], currentLevel: 0 }, { channel: 'c' }).heads, []);
    assert.deepEqual(hlsMenu(null, { channel: 'c' }).heads, []);
});

test('#94 picking a copy reopens on its sources and keeps the one before as the fallback', function () {
    var g = quality();
    var copies = [{ tag: '4K', sources: ['a'] }, { tag: '', sources: ['b'] }];
    var req = { id: 'movie:1', sources: ['a'], quality: { key: 'movies|s|dune', tag: '4K', auto: true, copies: function () { return copies; } } };
    var opened = null;
    var rows = [];
    g.PlayerQuality({ current: function () { return req; }, hls: function () { return null; }, switchTo: function (next) { opened = next; } })
        .menuEntries(function () {}, function (label, active, run) { rows.push({ label: label, active: active, run: run }); });
    assert.deepEqual(rows.map(function (r) { return r.label + (r.active ? '*' : ''); }), ['Auto (4K)*', '4K', 'Standard']);
    rows[2].run();
    assert.deepEqual(opened.sources, ['b']);
    assert.equal(opened.id, 'movie:1');
    assert.deepEqual({ tag: opened.quality.tag, auto: opened.quality.auto }, { tag: '', auto: false });
    assert.deepEqual(plain(opened.qualityFallback), { tag: '4K', auto: true, sources: ['a'] });
    assert.equal(g.Quality.picked('movies|s|dune'), '');
    // Picking the copy already playing only changes Auto to manual.
    opened = null;
    rows[1].run();
    assert.equal(opened, null);
    assert.equal(req.quality.auto, false);
});
