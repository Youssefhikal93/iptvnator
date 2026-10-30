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

// The box's line: year, a starred score and length, as the Info box shows it.
function line(facts) {
    return facts.sub || [facts.year, facts.score && '★ ' + facts.score, facts.length].filter(Boolean).join(' · ');
}

test('#66 box facts use the list item: year, score out of 10 and length', function () {
    var api = boxCards().cards;
    assert.equal(line(api.facts({ name: 'Heat (1995)', rating_5based: '3.7' }, 'movies')), '1995 · ★ 7.4');
    assert.deepEqual(JSON.parse(JSON.stringify(api.facts({ name: 'Show', rating: '8.1', releaseDate: '2019-09-01', episode_run_time: '45' }, 'series'))), { year: '2019', score: '8.1', length: '45 min' });
    assert.equal(line(api.facts({ name: 'Long', episode_run_time: '112' }, 'series')), '1 h 52 min');
    // A collection keeps its own line.
    assert.equal(api.facts({ name: 'Trilogy', sub: '4 films · 3 available' }, 'movies').sub, '4 films · 3 available');
    assert.equal(line(api.facts({ name: 'Nothing known' }, 'movies')), '');
});

test('#66 box text falls back to a TMDB match already in memory, never asking for one', function () {
    var made = boxCards({ overview: 'From TMDB.', vote_average: 6.84, release_date: '2001-05-02' });
    assert.equal(made.cards.plot({ name: 'Film' }, 'movies'), 'From TMDB.');
    assert.equal(line(made.cards.facts({ name: 'Film' }, 'movies')), '2001 · ★ 6.8');
    assert.equal(made.cards.plot({ name: 'Show', plot: 'Own plot.' }, 'series'), 'Own plot.');
    made.cards.plot({ name: 'Show' }, 'series');
    assert.deepEqual(made.asked.slice(-1), ['tv']);
});