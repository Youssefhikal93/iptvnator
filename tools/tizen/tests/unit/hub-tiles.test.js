'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var load = require('./sandbox');

// The TV's application calls, recorded: what was handed to the service and
// what the TV says opened the app.
function tiles(stored) {
    var tv = { sent: [], requested: null };
    var env = load(['log.js', 'hub-tiles.js'], stored || {}, {
        fetch: function () { return Promise.resolve(); },
        __hubTilesPlatform: {
            launch: function (text, done) { tv.sent.push(text); done(); },
            requested: function () { return tv.requested; },
        },
        addEventListener: function (name, fn) { tv[name] = fn; },
    });
    return { api: env.globals.HubTiles, stored: env.stored, tv: tv };
}

var MOVIE = { section: 'movies', key: '11', title: 'Dexter', subtitle: '42 min left', image: 'http://posters.test/dexter.jpg' };
var CHANNEL = { section: 'live', key: '7', title: 'beIN SD 1', image: 'https://logos.test/bein.png' };

function payload(action) {
    return { data: [{ key: 'PAYLOAD', value: [JSON.stringify({ values: JSON.stringify(action) })] }] };
}

test('Continue watching and Recent channels become two sections; a tile carries only the source, section and key', function () {
    var env = tiles();
    var preview = JSON.parse(env.api.build('s1', { continue: [MOVIE], live: [CHANNEL] }));
    assert.deepEqual(preview.sections.map(function (part) { return part.title; }), ['Continue watching', 'Recently watched channels']);
    assert.deepEqual(preview.sections[0].tiles[0], {
        title: 'Dexter', subtitle: '42 min left', image_ratio: '2by3', image_url: 'http://posters.test/dexter.jpg',
        action_data: JSON.stringify({ s: 's1', sec: 'movies', key: '11' }), is_playable: true,
    });
    assert.equal(preview.sections[1].tiles[0].image_ratio, '1by1');
    assert.equal('subtitle' in preview.sections[1].tiles[0], false);
});

test('a tile without a picture is left out, a section without tiles too, and each section keeps six', function () {
    var env = tiles();
    var many = Array.from({ length: 9 }, function (_, n) { return Object.assign({}, MOVIE, { key: String(n) }); });
    var preview = JSON.parse(env.api.build('s1', { continue: many, live: [Object.assign({}, CHANNEL, { image: '' })] }));
    assert.equal(preview.sections.length, 1);
    assert.equal(preview.sections[0].tiles.length, 6);
    assert.deepEqual(JSON.parse(env.api.build('s1', {})), { sections: [] });
});

test('tiles go to the service once; the same tiles again are not sent, and new ones wait ten minutes', function () {
    var env = tiles();
    var first = env.api.build('s1', { continue: [MOVIE] });
    var second = env.api.build('s1', { live: [CHANNEL] });
    assert.equal(env.api.publish(first, 1000), 'sent');
    assert.equal(env.api.publish(first, 2000), 'same');
    assert.equal(env.api.publish(second, 1000 + env.api.WAIT_MS - 1), 'later');
    assert.equal(env.api.publish(second, 1000 + env.api.WAIT_MS), 'sent');
    assert.deepEqual(env.tv.sent, [first, second]);
});

test('the tile that opened the app, and one picked while it runs, are handed on', function () {
    var env = tiles();
    var opened = [];
    env.tv.requested = payload({ s: 's1', sec: 'live', key: '7' });
    env.api.listen(function (action) { opened.push(action); });
    env.tv.requested = payload({ s: 's1', sec: 'movies', key: '11' });
    env.tv.appcontrol();
    env.tv.requested = { data: [{ key: 'other', value: ['x'] }] };
    env.tv.appcontrol();
    assert.equal(JSON.stringify(opened), JSON.stringify([{ s: 's1', sec: 'live', key: '7' }, { s: 's1', sec: 'movies', key: '11' }]));
});

test('a PAYLOAD that is not a Jotv tile is ignored', function () {
    var api = tiles().api;
    assert.equal(api.action({ data: [{ key: 'PAYLOAD', value: ['not json'] }] }), null);
    assert.equal(api.action(payload({ videoIdx: 1 })), null);
    assert.equal(api.action(null), null);
});
