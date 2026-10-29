'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var load = require('./sandbox');

function boxCards(cached) {
    var asked = [];
    var env = load(['box-cards.js'], {}, {
        I18n: { t: function (key, p) { return key === 'unit.hoursMinutes' ? p.h + ' h ' + p.m + ' min' : p.m + ' min'; } },
        Tmdb: {
            year: function (item) { var m = /\b(19|20)\d{2}\b/.exec(item.name || ''); return m ? m[0] : ''; },
            cached: function (item, type) { asked.push(type); return cached || null; },
            enabled: function () { throw new Error('reads the key from storage'); },
        },
    });
    return { cards: env.globals.BoxCards, asked: asked };
}

test('#66 box meta uses the list item: year, rating out of 10 and length', function () {
    var api = boxCards().cards;
    assert.equal(api.meta({ name: 'Heat (1995)', rating_5based: '3.7' }, 'movies'), '1995 · ★ 7.4');
    assert.equal(api.meta({ name: 'Show', rating: '8.1', releaseDate: '2019-09-01', episode_run_time: '45' }, 'series'), '2019 · ★ 8.1 · 45 min');
    assert.equal(api.meta({ name: 'Long', episode_run_time: '112' }, 'series'), '1 h 52 min');
    // A collection keeps its own line.
    assert.equal(api.meta({ name: 'Trilogy', sub: '4 films · 3 available' }, 'movies'), '4 films · 3 available');
    assert.equal(api.meta({ name: 'Nothing known' }, 'movies'), '');
});

test('#66 box text falls back to a TMDB match already in memory, never asking for one', function () {
    var made = boxCards({ overview: 'From TMDB.', vote_average: 6.84, release_date: '2001-05-02' });
    assert.equal(made.cards.plot({ name: 'Film' }, 'movies'), 'From TMDB.');
    assert.equal(made.cards.meta({ name: 'Film' }, 'movies'), '2001 · ★ 6.8');
    assert.equal(made.cards.plot({ name: 'Show', plot: 'Own plot.' }, 'series'), 'Own plot.');
    made.cards.plot({ name: 'Show' }, 'series');
    assert.deepEqual(made.asked.slice(-1), ['tv']);
});

test('#66 the wide picture is a series backdrop when sent, else the poster', function () {
    var api = boxCards().cards;
    assert.equal(api.picture({ backdrop_path: ['http://x/b.jpg'], cover: 'http://x/c.jpg' }), 'http://x/b.jpg');
    assert.equal(api.picture({ backdrop_path: [], cover: 'http://x/c.jpg' }), 'http://x/c.jpg');
    assert.equal(api.picture({ stream_icon: 'http://x/p.jpg' }), 'http://x/p.jpg');
    assert.equal(api.picture({ name: 'none' }), null);
});
