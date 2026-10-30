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

test('without Intl.DisplayNames "ar" and "en" still match tracks tagged "ara" and "eng"', function () {
    var api = load(['audio-choice.js'], {}, { Intl: {} }).globals.AudioChoice;
    assert.equal(api.name('ara'), api.name('ar'));
    assert.equal(api.name('eng'), api.name('en-GB'));
    assert.notEqual(api.name('eng'), api.name('ara'));
    assert.equal(api.pick({ id: 'movie:1' }, rows(1), 'en').ref, 2);
});

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
    assert.deepEqual(JSON.parse(env.stored['iptvnator-tv:audio-choice']), { shows: { 's1|3001': 'ara' }, channels: {}, textShows: {}, textChannels: {}, last: 'eng' });
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

// #83: identities include the source; movies and new shows still use the latest pick.
test('#83 channel picks survive reload, isolate sources and profiles, and preserve legacy show picks', function () {
    var env = load(['profile-store.js', 'audio-choice.js']);
    var api = env.globals.AudioChoice;
    var profiles = env.globals.ProfileStore;
    env.globals.Stored.save(profiles.key('audio-choice'), { shows: { 's1|3001': 'ara' }, last: 'eng' });
    var channel = { live: true, channel: 's1|1001' };
    api.remember(channel, 'ara');
    api.rememberSubtitle(channel, false);
    api.rememberSubtitle(episode('3001'), 'en');
    assert.equal(api.pick(channel, rows(2), 'en').ref, 1);
    assert.equal(api.pick({ live: true, channel: 's2|1001' }, rows(1)), null);
    assert.equal(api.pick({ id: 'movie:8' }, rows(2)).ref, 1);
    assert.equal(api.pick(episode('3001'), rows(2)).ref, 1);
    var other = profiles.add('Other');
    profiles.setActive(other.id);
    assert.equal(api.pick(channel, rows(2)), null);
    assert.equal(api.subtitle(channel), undefined);
    api.remember(channel, 'en');
    api.rememberSubtitle(channel, 'en');
    profiles.setActive('default');
    var reloaded = load(['profile-store.js', 'audio-choice.js'], env.stored).globals.AudioChoice;
    assert.equal(reloaded.pick(channel, rows(2)).ref, 1);
    assert.equal(reloaded.subtitle(channel), false);
    assert.equal(reloaded.subtitle(episode('3001')), 'en');
});

test('#83 each choice list keeps its newest 100 picks, with a repeated pick refreshed', function () {
    var env = load(['audio-choice.js']).globals;
    for (var n = 0; n < 100; n++) {
        env.AudioChoice.remember(episode(String(n)), 'en');
        env.AudioChoice.rememberSubtitle(episode(String(n)), false);
        env.AudioChoice.remember({ live: true, channel: 's1|' + n }, 'ar');
        env.AudioChoice.rememberSubtitle({ live: true, channel: 's1|' + n }, 'en');
    }
    [0, 100].forEach(function (n) {
        env.AudioChoice.remember(episode(String(n)), 'ar');
        env.AudioChoice.rememberSubtitle(episode(String(n)), 'ar');
        env.AudioChoice.remember({ live: true, channel: 's1|' + n }, 'en');
        env.AudioChoice.rememberSubtitle({ live: true, channel: 's1|' + n }, false);
    });
    var saved = JSON.parse(env.Stored.text(env.ProfileStore.key('audio-choice')));
    ['shows', 'channels', 'textShows', 'textChannels'].forEach(function (kind) {
        assert.equal(Object.keys(saved[kind]).length, 100);
        assert.ok(Object.hasOwn(saved[kind], 's1|0'));
        assert.ok(Object.hasOwn(saved[kind], 's1|100'));
        assert.equal(Object.hasOwn(saved[kind], 's1|1'), false);
    });
});

test('#83 malformed choice maps and unknown subtitle languages cannot replace a saved choice', function () {
    var env = load(['audio-choice.js']).globals;
    env.Stored.save(env.ProfileStore.key('audio-choice'), { shows: [], channels: { 's1|1001': false }, textShows: { 's1|1': {} }, textChannels: [] });
    assert.equal(env.AudioChoice.pick({ live: true, channel: 's1|1001' }, rows(1), 'en').ref, 2);
    assert.equal(env.AudioChoice.subtitle(episode('1')), undefined);
    env.AudioChoice.rememberSubtitle(episode('1'), 'en');
    env.AudioChoice.rememberSubtitle(episode('1'), '');
    assert.equal(env.AudioChoice.subtitle(episode('1')), 'en');
});
