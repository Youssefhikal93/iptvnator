'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var load = require('./sandbox');

// #90: movie and show posters arrive tile-sized; channel logos stay as sent.
function source(list) {
    var globals = load(['art.js', 'xtream.js'], {}, {
        Log: { setSecrets: function () {} },
        Image: function () {},
        SourceRequest: function () { return Promise.resolve(JSON.parse(JSON.stringify(list))); },
    }).globals;
    return globals.XtreamSource({ url: 'http://example.test', user: 'u', pass: 'p' });
}

var BIG = 'https://image.tmdb.org/t/p/original/p.jpg';
var SMALL = 'https://image.tmdb.org/t/p/w342/p.jpg';

test('#90 movie and series posters from TMDB are asked for at tile size', async function () {
    var xtream = source([{ name: 'A', stream_icon: BIG }, { name: 'B', cover: BIG }, { name: 'C', stream_icon: 'http://logo.test/c.png' }, null]);
    var movies = await xtream.items('movies');
    assert.deepEqual(movies.slice(0, 3).map(function (item) { return item.stream_icon || item.cover; }), [SMALL, SMALL, 'http://logo.test/c.png']);
    var series = await xtream.items('series');
    assert.equal(series[1].cover, SMALL);
});

test('#90 channel logos are left as the provider sent them', async function () {
    var live = await source([{ name: 'A', stream_icon: BIG }]).items('live');
    assert.equal(live[0].stream_icon, BIG);
});