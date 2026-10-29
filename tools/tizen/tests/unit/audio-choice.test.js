'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var load = require('./sandbox');

function choice(stored) {
    var env = load(['audio-choice.js'], stored || {});
    return { api: env.globals.AudioChoice, stored: env.stored };
}

// PlayerTracks' audio rows: Arabic plays, English is the file's second track, DTS cannot play.
function rows(active) {
    return [
        { label: 'Arabic', language: 'ara', active: active === 1, ref: 1 },
        { label: 'English', language: 'eng', active: active === 2, ref: 2 },
        { label: 'English DTS', language: 'eng', active: false, ref: null, unsupported: true },
    ];
}

var episode = function (show) { return { id: 'episode:1', episodes: { show: 's1|' + show } }; };

test('nothing picked yet keeps the file\'s own track', function () {
    assert.equal(choice().api.pick(episode('3001'), rows(1)), null);
});

test('a show starts in the language picked for it; "en" and "eng" are the same language', function () {
    var env = choice();
    env.api.remember(episode('3001'), 'en');
    var row = env.api.pick(episode('3001'), rows(1));
    assert.equal(row.ref, 2);
    assert.equal(env.api.pick(episode('3001'), rows(2)), null, 'English already plays');
});

test('the show\'s own pick wins over the latest pick, which a movie or another show starts in', function () {
    var env = choice();
    env.api.remember(episode('3001'), 'ara');
    env.api.remember({ id: 'movie:7' }, 'eng');
    assert.equal(env.api.pick(episode('3001'), rows(2)).ref, 1);
    assert.equal(env.api.pick(episode('3002'), rows(1)).ref, 2);
    assert.equal(env.api.pick({ id: 'movie:8' }, rows(1)).ref, 2);
    assert.deepEqual(JSON.parse(env.stored['iptvnator-tv:audio-choice']), { shows: { 's1|3001': 'ara' }, last: 'eng' });
});

test('a language the file lacks, or has only in a track the TV cannot play, changes nothing', function () {
    var env = choice();
    env.api.remember({ id: 'movie:7' }, 'swe');
    assert.equal(env.api.pick({ id: 'movie:8' }, rows(1)), null);
    env.api.remember({ id: 'movie:7' }, 'eng');
    assert.equal(env.api.pick({ id: 'movie:8' }, [rows(1)[0], rows(1)[2]]), null);
});

test('damaged storage is treated as nothing picked', function () {
    assert.equal(choice({ 'iptvnator-tv:audio-choice': '{bad' }).api.pick(episode('1'), rows(1)), null);
    assert.equal(choice({ 'iptvnator-tv:audio-choice': '[]' }).api.pick(episode('1'), rows(1)), null);
});
