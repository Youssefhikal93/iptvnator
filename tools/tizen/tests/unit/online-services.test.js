'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var load = require('./sandbox');
var TMDB = ['details', 'artwork', 'cast', 'collections', 'similar', 'genres', 'boxes'];
var FILES = ['settings-store.js', 'online-services.js', 'tmdb-store.js', 'tmdb-language.js', 'tmdb.js',
    'opensubs.js', 'subdl.js', 'subsource.js', 'subtitle-translate.js', 'youtube.js', 'subtitle-file.js', 'subtitle-store.js'];

function client(fetcher, extra) {
    return load(FILES, {}, Object.assign({
        AbortController: AbortController, URL: URL,
        Log: { info: function () {}, error: function () {} },
        fetch: fetcher,
    }, extra)).globals;
}

TMDB.forEach(function (feature) {
    test('#98 ' + feature + ' Off blocks requests with a saved key and hides cached answers', async function () {
        var calls = 0;
        var api = client(function () {
            calls++;
            return Promise.resolve({ ok: true, json: function () { return Promise.resolve({ id: 1, title: 'Film' }); } });
        });
        var pref = 'tmdb' + feature.charAt(0).toUpperCase() + feature.slice(1);
        api.Prefs.set('tmdbApiKey', 'unit-key');
        var film = { tmdb_id: 1 };
        await api.Tmdb.match(film, 'movie', null, feature);
        var before = calls;
        api.Prefs.set(pref, false);
        assert.equal(api.Tmdb.enabled(), true);
        assert.equal(await api.Tmdb.match(film, 'movie', null, feature), null);
        assert.equal(api.Tmdb.cached(film, 'movie', feature), null);
        assert.equal(await api.Tmdb.request('/movie/2', {}, false, feature), null);
        if (feature === 'collections') assert.equal((await api.Tmdb.collection(9)).status, 'failed');
        if (feature === 'artwork') assert.equal(api.Tmdb.image('/poster.jpg', 'w342'), '');
        assert.equal(calls, before);
        api.Prefs.set(pref, true);
        assert.equal((await api.Tmdb.match(film, 'movie', null, feature)).id, 1);
        assert.equal(calls, before);
    });
});

TMDB.filter(function (feature) { return feature !== 'artwork'; }).forEach(function (feature) {
    test('#98 queued ' + feature + ' requests are dropped even after Off then On', async function () {
        var release = [];
        var api = client(function () {
            return new Promise(function (resolve) { release.push(function () {
                resolve({ ok: true, json: function () { return Promise.resolve({ id: 1 }); } });
            }); });
        });
        api.Prefs.set('tmdbApiKey', 'unit-key');
        var jobs = [1, 2, 3, 4, 5].map(function (id) { return api.Tmdb.request('/movie/' + id, {}, false, feature); });
        await new Promise(setImmediate);
        assert.equal(release.length, 3);
        var pref = 'tmdb' + feature.charAt(0).toUpperCase() + feature.slice(1);
        api.Prefs.set(pref, false);
        api.Prefs.set(pref, true);
        release.forEach(function (finish) { finish(); });
        assert.deepEqual(await Promise.all(jobs), [null, null, null, null, null]);
        assert.equal(release.length, 3);
    });
});

[
    ['opensubtitles', 'opensubtitlesApiKey', 'OpenSubs'],
    ['subdl', 'subdlApiKey', 'SubDL'],
    ['subsource', 'subsourceApiKey', 'SubSource'],
    ['deepl', 'deeplApiKey', 'SubtitleTranslate'],
].forEach(function (entry) {
    test('#98 ' + entry[0] + ' Off blocks search and download requests', async function () {
        var calls = 0;
        var api = client(function () { calls++; throw new Error('Unexpected request'); });
        api.Prefs.set(entry[1], 'unit-key');
        api.Prefs.set(entry[0] + 'On', false);
        var service = api[entry[2]];
        await assert.rejects(entry[0] === 'deepl' ? service.translate(['Hello'], 'en', 'ar') : service.search({ title: 'Film' }, 'en'));
        await assert.rejects(service.download(entry[0] === 'opensubtitles' ? 1 : entry[0] + ':1', { source: { file_id: 1 }, from: 'en', to: 'ar' }));
        assert.equal(calls, 0);
    });
});

test('#98 YouTube Off suppresses availability and platform launches', function () {
    var calls = 0;
    var api = client(function () { calls++; }, {
        tizen: { application: { findAppControl: function () { calls++; }, launchAppControl: function () { calls++; } },
            ApplicationControl: function () { calls++; } },
    });
    api.Prefs.set('youtubeOn', false);
    api.YouTube.available(function (available) { assert.equal(available, false); });
    api.YouTube.open('dQw4w9WgXcQ');
    assert.equal(calls, 0);
});

test('#98 switches belong to profiles and full backups retain every switch', function () {
    var api = load(['profile-store.js', 'settings-store.js', 'online-services.js', 'full-backup.js']).globals;
    var rows = ['tmdb', 'opensubtitles', 'subdl', 'subsource', 'deepl', 'trailers'].flatMap(function (group) { return api.OnlineServices.rows(group); });
    var first = api.ProfileStore.active().id;
    rows.forEach(function (row) { assert.equal(api.Prefs.get(row.key), true); });
    rows.forEach(function (row) { api.Prefs.set(row.key, false); });
    var backup = api.FullBackup.collect();
    var second = api.ProfileStore.add('Second');
    api.ProfileStore.setActive(second.id);
    rows.forEach(function (row) { assert.equal(api.Prefs.get(row.key), true); });
    api.ProfileStore.setActive(first);
    rows.forEach(function (row) { api.Prefs.set(row.key, true); });
    api.FullBackup.apply(api.FullBackup.parse(JSON.stringify(backup)));
    rows.forEach(function (row) { assert.equal(api.Prefs.get(row.key), false); });
});

test('#98 a shared queued job keeps its enabled consumer and the same query, so saved answers are reused', async function () {
    var waiting = [];
    var sent = [];
    var api = client(function (url) {
        sent.push(new URL(url));
        return new Promise(function (resolve) { waiting.push(function () {
            resolve({ ok: true, json: function () { return Promise.resolve({ id: 1 }); } });
        }); });
    });
    api.Prefs.set('tmdbApiKey', 'unit-key');
    var running = [1, 2, 3].map(function (id) { return api.Tmdb.request('/movie/' + id); });
    var details = api.Tmdb.request('/movie/4', { append_to_response: 'credits,videos,similar' }, false, 'details');
    var cast = api.Tmdb.request('/movie/4', { append_to_response: 'credits,videos,similar' }, false, 'cast');
    await new Promise(setImmediate);
    api.Prefs.set('tmdbCast', false);
    api.Prefs.set('tmdbSimilar', false);
    api.Prefs.set('youtubeOn', false);
    waiting.splice(0).forEach(function (finish) { finish(); });
    await new Promise(setImmediate);
    assert.equal(sent.length, 4);
    assert.equal(sent[3].searchParams.get('append_to_response'), 'credits,videos,similar');
    waiting.splice(0).forEach(function (finish) { finish(); });
    await Promise.all(running);
    assert.equal((await details).id, 1);
    assert.equal(await cast, null);
});

['opensubtitles', 'subdl', 'subsource', 'deepl'].forEach(function (feature) {
    test('#98 cached ' + feature + ' subtitles stay saved but hidden while Off', async function () {
        var id = feature === 'opensubtitles' ? '1' : feature + ':1';
        var text = '1\n00:00:01,000 --> 00:00:03,000\nHello';
        var cached = {};
        cached[id] = { text: text, at: Date.now() };
        var stored = { 'iptvnator-tv:subtitle-cache': JSON.stringify(cached) };
        var api = load(FILES, stored).globals;
        api.Prefs.set(feature + 'On', false);
        assert.equal(api.SubtitleStore.cached(id), '');
        await assert.rejects(api.SubtitleStore.obtain(id));
        api.Prefs.set(feature + 'On', true);
        assert.equal(api.SubtitleStore.cached(id), text);
        assert.equal((await api.SubtitleStore.obtain(id)).text, text);
    });
});

test('#98 OpenSubtitles Off drops the temporary-file request after a pending download answer', async function () {
    var release;
    var calls = 0;
    var api = client(function () {
        calls++;
        return new Promise(function (resolve) { release = function () {
            resolve({ ok: true, json: function () { return Promise.resolve({ link: 'https://files.test/subtitle' }); } });
        }; });
    });
    api.Prefs.set('opensubtitlesApiKey', 'unit-key');
    var download = api.OpenSubs.download(1);
    api.Prefs.set('opensubtitlesOn', false);
    release();
    await assert.rejects(download);
    assert.equal(calls, 1);
});

test('#98 DeepL Off drops translation batches waiting behind a request', async function () {
    var release;
    var calls = 0;
    var api = client(function (url, options) {
        calls++;
        var texts = JSON.parse(options.body).text;
        return new Promise(function (resolve) { release = function () {
            resolve({ ok: true, json: function () { return Promise.resolve({ translations: texts.map(function (text) { return { text: text }; }) }); } });
        }; });
    });
    api.Prefs.set('deeplApiKey', 'unit-key');
    // Exercise the real batching path through a downloaded source file.
    var many = Array.from({ length: 51 }, function (_, i) { return (i + 1) + '\n00:00:01,000 --> 00:00:03,000\nHello'; }).join('\n\n');
    api.Stored.save('iptvnator-tv:subtitle-cache', { 1: { text: many, at: Date.now() } });
    var download = api.SubtitleTranslate.download('deepl:1', { source: { file_id: 1 }, from: 'en', to: 'ar' });
    await new Promise(setImmediate);
    api.Prefs.set('deeplOn', false);
    release();
    await assert.rejects(download);
    assert.equal(calls, 1);
});

test('#98 browsing facts Off preserves provider facts and hides TMDB and unclassified legacy facts', function () {
    var stored = { 'iptvnator-tv:title-facts': JSON.stringify({ order: ['s1|movies|9'], facts: { 's1|movies|9': { minutes: 80 } } }) };
    var env = load(FILES.concat(['title-facts.js', 'box-cards.js']), stored, { Log: { error: function () {} } });
    var api = env.globals;
    var film = { stream_id: 1 };
    var show = { series_id: 2 };
    api.Prefs.set('tmdbApiKey', 'unit-key');
    api.TitleFacts.save('s1', 'movies', film, { minutes: 95 });
    api.TitleFacts.save('s1', 'movies', film, { minutes: 112, tmdb: true });
    api.TitleFacts.save('s1', 'series', show, { seasons: 3 });
    api.TitleFacts.save('s1', 'series', show, { seasons: 5, tmdb: true });
    api.Prefs.set('tmdbBoxes', false);
    assert.equal(api.BoxCards.facts(film, 'movies', null, 's1').length, '1 h 35 min');
    assert.equal(api.BoxCards.facts(show, 'series', null, 's1').seasons, '3 seasons');
    assert.equal(api.BoxCards.facts({ stream_id: 9 }, 'movies', null, 's1').length, '');
    assert.equal(api.TitleFacts.get('s1', 'movies', { stream_id: 9 }).minutes, 80);
    api.Prefs.set('tmdbBoxes', true);
    assert.equal(api.BoxCards.facts(film, 'movies', null, 's1').length, '1 h 52 min');
    assert.equal(api.BoxCards.facts(show, 'series', null, 's1').seasons, '5 seasons');
    api.TitleFacts.flush();
    var again = load(FILES.concat(['title-facts.js', 'box-cards.js']), env.stored).globals;
    again.Prefs.set('tmdbBoxes', false);
    assert.equal(again.BoxCards.facts(film, 'movies', null, 's1').length, '1 h 35 min');
});

test('#98 Backup search Off turns SubSource and DeepL off; On turns both on; either back On turns Backup search on', function () {
    var api = client(function () { throw new Error('no request'); });
    var state = function () { return [api.Prefs.get('subtitleFallback'), api.Prefs.get('subsourceOn'), api.Prefs.get('deeplOn')]; };
    assert.deepEqual(state(), [true, true, true]);
    api.Prefs.set('subtitleFallback', false);
    assert.deepEqual(state(), [false, false, false]);
    api.Prefs.set('subsourceOn', true);
    assert.deepEqual(state(), [true, true, false]);
    api.Prefs.set('subtitleFallback', false);
    api.Prefs.set('subtitleFallback', true);
    assert.deepEqual(state(), [true, true, true]);
    api.Prefs.set('deeplOn', false);
    assert.deepEqual(state(), [true, true, false]);
});
