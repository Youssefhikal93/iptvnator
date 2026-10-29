'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('node:fs');
var path = require('node:path');
var load = require('./sandbox');
var uiSandbox = require('./ui-sandbox');
var languages = fs.readdirSync(path.join(__dirname, '../../tv-app/js/i18n')).filter(function (name) { return /\.js$/.test(name); });

function client(fetch, overrides) {
    var api = load(languages.map(function (name) { return 'i18n/' + name; }).concat([
        'settings-store.js', 'appearance.js', 'tmdb-store.js', 'tmdb-language.js', 'tmdb.js',
        'keys.js', 'focus.js', 'kit.js', 'youtube.js', 'tmdb-view.js', 'tmdb-detail.js', 'actor.js',
    ]), {}, Object.assign({
        AbortController: AbortController,
        Log: { error: function () {} },
        UI: uiSandbox.UI,
        document: { documentElement: { setAttribute: function () {} }, addEventListener: function () {} },
        fetch: fetch,
    }, overrides)).globals;
    api.Prefs.set('tmdbApiKey', 'viewer-key');
    return api;
}

function response(body, ok) {
    return Promise.resolve({ ok: ok !== false, json: function () { return Promise.resolve(body); } });
}

test('every shipped app language maps to a TMDB tag, including dialect and legacy codes', function () {
    var api = client();
    var expected = {
        en: 'en-US', ar: 'ar-SA', by: 'be-BY', de: 'de-DE', el: 'el-GR',
        es: 'es-ES', fr: 'fr-FR', hu: 'hu-HU', it: 'it-IT', ja: 'ja-JP', ko: 'ko-KR',
        nl: 'nl-NL', pl: 'pl-PL', pt: 'pt-PT', ru: 'ru-RU', tr: 'tr-TR', uk: 'uk-UA', zh: 'zh-CN', zhtw: 'zh-TW',
    };
    assert.equal(api.I18n.languages().map(function (language) { return language.code; }).sort().join(','), languages.map(function (name) { return name.slice(0, -3); }).sort().join(','));
    assert.equal(Object.keys(expected).sort().join(','), languages.map(function (name) { return name.slice(0, -3); }).sort().join(','));
    api.I18n.languages().forEach(function (language) {
        api.Prefs.set('language', language.code);
        assert.equal(api.TmdbLanguage.parameters('/genre/movie/list').language, expected[language.code], language.code);
    });
    ['', 'unknown', 'constructor', '__proto__', undefined].forEach(function (code) {
        assert.equal(api.TmdbLanguage.tag(code), 'en-US');
    });
});

test('TMDB sends sorted language and video parameters while title search stays English', async function () {
    var seen = [];
    var api = client(function (url) {
        seen.push(new URL(url));
        return response(url.indexOf('/search/') !== -1 ? { results: [{ id: 1, title: 'Dune' }] } : { id: 1, title: 'Dune', overview: 'Handlung' });
    });
    api.Prefs.set('language', 'de');
    await api.Tmdb.match({ name: 'Dune' }, 'movie');
    await api.Tmdb.request('/genre/movie/list');
    await api.Tmdb.request('/person/1', { append_to_response: 'combined_credits' });
    await api.Tmdb.request('/tv/1/videos');
    assert.equal(seen[0].search, '?api_key=viewer-key&language=en-US&query=Dune');
    assert.equal(seen[1].search, '?api_key=viewer-key&append_to_response=credits%2Cvideos%2Csimilar&include_video_language=de%2Cen%2Cnull&language=de-DE');
    assert.equal(seen[2].searchParams.get('language'), 'de-DE');
    assert.equal(seen[3].searchParams.get('language'), 'de-DE');
    assert.equal(seen[4].searchParams.get('include_video_language'), 'de,en,null');
    assert.equal(seen[1].searchParams.has('include_image_language'), false);
});

test('an empty translated plot adds exactly one cached English request and preserves translated facts', async function () {
    var seen = [];
    var api = client(function (url) {
        var language = new URL(url).searchParams.get('language');
        seen.push(language);
        return response({ id: 1, title: language === 'en-US' ? 'English title' : 'Titel', overview: language === 'en-US' ? 'English plot' : '', genres: [{ name: language === 'en-US' ? 'Drama' : 'Komodie' }] });
    });
    api.Prefs.set('language', 'de');
    var movie = { tmdb_id: 1 };
    var answers = await Promise.all([api.Tmdb.match(movie, 'movie'), api.Tmdb.match(movie, 'movie')]);
    assert.equal(answers[0].overview, 'English plot');
    assert.equal(answers[0].title, 'Titel');
    assert.equal(answers[0].genres[0].name, 'Komodie');
    assert.equal(answers[1].overview, 'English plot');
    assert.equal(seen.join(','), 'de-DE,en-US');
    await api.Tmdb.match(movie, 'movie');
    assert.equal(seen.length, 2);
});

test('translated and English plots avoid extra fallback traffic and empty titles use originals', async function () {
    for (var code of ['de', 'en']) {
        var calls = 0;
        var api = client(function () {
            calls++;
            return response({ id: 1, name: '', original_name: 'Original show', overview: code === 'en' ? '' : 'Handlung' });
        });
        api.Prefs.set('language', code);
        var body = await api.Tmdb.match({ tmdb_id: 1 }, 'tv');
        assert.equal(body.name, 'Original show');
        assert.equal(calls, 1);
    }
});

test('a missing title uses English when the plot fallback supplies it; refused fallback keeps local details', async function () {
    for (var refused of [false, true]) {
        var calls = 0;
        var api = client(function (url) {
            calls++;
            var english = new URL(url).searchParams.get('language') === 'en-US';
            return response(english ? { title: 'English title', overview: 'English plot' } : { id: 1, title: '', overview: '', vote_average: 8 }, !(english && refused));
        });
        api.Prefs.set('language', 'ar');
        var body = await api.Tmdb.match({ tmdb_id: 1 }, 'movie');
        assert.equal(body.overview, refused ? '' : 'English plot');
        assert.equal(body.title, refused ? '' : 'English title');
        assert.equal(body.vote_average, 8);
        await api.Tmdb.match({ tmdb_id: 1 }, 'movie');
        assert.equal(calls, 2);
    }
});

test('trailers prefer the app language then English without mutating cached responses', function () {
    var api = client();
    var videos = [
        { key: 'other', iso_639_1: 'fr' }, { key: 'english', iso_639_1: 'en' },
        { key: 'untagged', iso_639_1: null }, { key: 'local', iso_639_1: 'ar' },
    ];
    var body = { videos: { results: videos } };
    assert.equal(api.TmdbLanguage.fill(body, null, 'ar-SA').videos.results.map(function (video) { return video.key; }).join(','), 'local,english,other,untagged');
    assert.equal(videos[0].key, 'other');
    assert.equal(api.TmdbLanguage.fill(body, null, 'de-DE').videos.results[0].key, 'english');
});

test('changing Prefs language separates response and match caches and switching back reuses them', async function () {
    var seen = [];
    var api = client(function (url) {
        var language = new URL(url).searchParams.get('language');
        seen.push(language);
        return response({ id: 1, title: language, overview: language });
    });
    var movie = { tmdb_id: 1 };
    await api.Tmdb.match(movie, 'movie');
    api.Prefs.set('language', 'de');
    assert.equal(api.Tmdb.cached(movie, 'movie'), null);
    assert.equal((await api.Tmdb.match(movie, 'movie')).overview, 'de-DE');
    api.Prefs.set('language', 'en');
    assert.equal(api.Tmdb.cached(movie, 'movie').overview, 'en-US');
    assert.equal((await api.Tmdb.match(movie, 'movie')).overview, 'en-US');
    assert.equal(seen.join(','), 'en-US,de-DE');
});

test('legacy English cache entries stay readable only in English and keep their expiry', async function () {
    var now = 100000;
    var seen = [];
    var api = client(function (url) {
        seen.push(new URL(url).searchParams.get('language'));
        return response({ id: 1, title: 'Fresh', overview: 'Fresh plot' });
    }, { Date: { now: function () { return now; } } });
    // Existing releases used this fingerprint for the viewer-key secret.
    var hash = 2166136261;
    'viewer-key'.split('').forEach(function (letter) { hash = Math.imul(hash ^ letter.charCodeAt(0), 16777619); });
    var legacyKey = (hash >>> 0).toString(16) + '|/movie/1?append_to_response=credits%2Cvideos%2Csimilar';
    await api.TmdbStore.put(legacyKey, { id: 1, title: 'Old English', overview: 'Old plot' });
    var movie = { tmdb_id: 1 };
    now += 6 * 86400000;
    assert.equal((await api.Tmdb.match(movie, 'movie')).overview, 'Old plot');
    assert.equal(seen.length, 0);
    api.Prefs.set('language', 'de');
    assert.equal((await api.Tmdb.match(movie, 'movie')).overview, 'Fresh plot');
    assert.equal(seen.join(','), 'de-DE');
    assert.equal((await api.TmdbStore.get(legacyKey)).body.title, 'Old English');
    api.Prefs.set('language', 'en');
    now += 86400000;
    assert.equal(api.Tmdb.cached(movie, 'movie'), null);
    assert.equal((await api.Tmdb.match(movie, 'movie')).title, 'Fresh');
    assert.equal(seen.join(','), 'de-DE,en-US');
});

test('translated similar titles match original catalogue names without confusing media types or remakes', function () {
    var api = client();
    var credits = [
        { id: 1, title: 'Die Reise', original_title: 'The Journey', release_date: '2020-01-01', media_type: 'movie' },
        { id: 2, title: 'Die Reise', original_title: 'The Journey', release_date: '1990-01-01', media_type: 'movie' },
        { id: 3, name: 'Die Show', original_name: 'The Show', first_air_date: '2020-01-01', media_type: 'tv' },
    ];
    var catalogue = [
        { type: 'movie', item: { name: 'The Journey (2020)', cover: 'source-poster' } },
        { type: 'movie', item: { name: 'The Journey (2000)' } },
        { type: 'tv', item: { name: 'The Journey (2020)' } },
        { type: 'tv', item: { name: 'The Show (2020)' } },
    ];
    var found = api.Tmdb.inLibrary(credits, catalogue);
    assert.equal(found.length, 2);
    assert.equal(api.Tmdb.pick(catalogue[0].item, credits).id, 1);
    assert.equal(api.TmdbLanguage.catalogueCard(found[0], credits).name, 'Die Reise');
    assert.equal(api.TmdbLanguage.catalogueCard(found[0], credits).image, 'source-poster');
    assert.equal(api.TmdbLanguage.catalogueCard(found[1], credits).name, 'Die Show');
    assert.equal(catalogue[0].item.name, 'The Journey (2020)');
    assert.equal(api.Tmdb.pick({ name: 'The Journey' }, credits), null);
});

test('a translated detail page shows the localized title and plot fallback, and Cast OK still opens the actor', async function () {
    function node() {
        return { children: [], appendChild: function (child) { this.children.push(child); }, querySelector: function () { return null; } };
    }
    var api = client(function (url) {
        var endpoint = new URL(url);
        if (endpoint.pathname.indexOf('/person/') !== -1) return response({ id: 71, name: 'Actor', biography: 'Bio' });
        return response({
            id: 1, title: endpoint.searchParams.get('language') === 'en-US' ? 'English' : 'Titel',
            overview: endpoint.searchParams.get('language') === 'en-US' ? 'English plot' : '',
            credits: { cast: [{ id: 71, name: 'Actor' }] },
        });
    }, { document: { documentElement: { setAttribute: function () {} }, addEventListener: function () {}, body: node(), createElement: node } });
    api.Prefs.set('language', 'de');
    var enriched;
    var page = { item: { tmdb_id: 1 }, catalogue: function () { return Promise.resolve([]); } };
    var detail = api.TmdbDetail(page, function (body) { if (body) enriched = body; });
    detail.load({ title: 'Source title', plot: '' });
    await new Promise(setImmediate);
    assert.equal(enriched.title, 'Titel');
    assert.equal(enriched.plot, 'English plot');
    var rows = detail.rows();
    assert.equal(rows[0].label, api.I18n.t('tmdb.cast'));
    assert.equal(rows[0].cards[0].name, 'Actor');
    rows[0].open(0);
    assert.equal(api.Actor.isOpen(), true);
    await new Promise(setImmediate);
    assert.equal(api.document.body.children[0].children[0].textContent, 'Actor');
});
