'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var load = require('./sandbox');
var FILE = '1\n00:00:01,000 --> 00:00:03,000\nHello';
var FILES = ['keys.js', 'settings-store.js', 'opensubs.js', 'subtitle-file.js', 'subtitle-store.js', 'subtitle-context.js', 'menu.js', 'subtitle-download.js', 'opensubs-settings.js'];

function node() {
    var children = [];
    var element = { children: children, classList: { add: function () {}, remove: function () {} },
        appendChild: function (child) { children.push(child); }, querySelector: function () { return null; } };
    Object.defineProperty(element, 'innerHTML', { set: function () { children.length = 0; } });
    return element;
}

function fixture(fetcher, stored, overrides) {
    var menu = node();
    var logs = [];
    var intervals = [];
    var env = load(FILES, stored, Object.assign({
        AbortController: AbortController,
        document: { body: node(), getElementById: function () { return menu; }, createElement: node, addEventListener: function () {} },
        fetch: fetcher || function () { throw new Error('Unexpected HTTP'); },
        Log: { info: function (text) { logs.push(text); }, error: function (text) { logs.push(text); } },
        setInterval: function (fn) { intervals.push(fn); return intervals.length; },
        clearInterval: function () {},
    }, overrides));
    env.logs = logs;
    env.menu = menu;
    env.tick = function () { intervals.forEach(function (fn) { fn(); }); };
    return env;
}

function json(body, status) {
    return Promise.resolve({ ok: !status || status < 400, status: status || 200,
        json: function () { return Promise.resolve(body); } });
}

function downloadServer(calls) {
    return function (url, options) {
        calls.push({ url: url, options: options });
        if (url.indexOf('/download') >= 0) return json({ link: 'https://files.test/temporary', file_name: 'fixture.srt', remaining: 7 });
        return Promise.resolve({ ok: true, text: function () { return Promise.resolve(FILE); } });
    };
}

function viewer(env) {
    var result = { position: 1500, text: '', toasts: [], embedded: 0 };
    result.player = env.globals.SubtitleDownload({ position: function () { return result.position; },
        draw: function (text) { result.text = text; }, embeddedOff: function () { result.embedded++; },
        closeMenu: function () {}, toast: function (text) { result.toasts.push(text); } });
    return result;
}

test('movie and episode searches prefer identifiers and always sort lower-case query parameters and languages', function () {
    var api = fixture().globals.OpenSubs;
    [
        [{ tmdb_id: 615457, imdb_id: 'tt9', title: 'Other' }, 'en,AR,en', 'languages=ar%2Cen&tmdb_id=615457'],
        [{ imdb_id: 'tt1234567' }, 'en', 'imdb_id=1234567&languages=en'],
        [{ title: 'Nobody', year: 2021 }, 'EN', 'languages=en&query=nobody&year=2021'],
        [{ title: 'Two Words' }, 'ar,en', 'languages=ar%2Cen&query=two+words'],
        [{ tmdb_id: 1234, season: 1, episode: 3 }, 'en', 'episode_number=3&languages=en&parent_tmdb_id=1234&season_number=1'],
        [{ imdb_id: 'tt1234', season: 2, episode: 4 }, 'ar', 'episode_number=4&languages=ar&parent_imdb_id=1234&season_number=2'],
        [{ title: 'Show Name', season: 0, episode: 1 }, 'en', 'episode_number=1&languages=en&query=show+name&season_number=0'],
    ].forEach(function (row) { assert.equal(api.query(row[0], row[1]), row[2]); });
    [{ season: '?', episode: 1 }, { season: 1, episode: '?' }, { season: 1, episode: 0 }].forEach(function (info) {
        assert.throws(function () { api.query(info, 'en'); }, function (error) { return error.code === 'noResults'; });
    });
});

test('search sends the app headers and limits file choices to ten with language, release, downloads and hearing flag', async function () {
    var env = fixture(function (url, options) {
        assert.ok(url.endsWith('/subtitles?languages=ar%2Cen&tmdb_id=615457'));
        assert.equal(options.headers['Api-Key'], 'test-key');
        assert.equal(options.headers['User-Agent'], 'IPTVnator TV v1.0');
        return json({ total_count: 12, data: Array.from({ length: 12 }, function (_, i) {
            return { attributes: { language: 'en', release: 'Fixture', download_count: 42, hearing_impaired: true,
                files: [{ file_id: i + 1, file_name: 'fixture.srt' }] } };
        }) });
    });
    env.globals.Prefs.set('opensubtitlesApiKey', 'test-key');
    var matches = await env.globals.OpenSubs.search({ tmdb_id: 615457 }, 'en,ar');
    assert.equal(matches.length, 10);
    assert.equal(matches[0].language, 'en');
    assert.equal(matches[0].release, 'Fixture');
    assert.equal(matches[0].downloads, 42);
    assert.equal(matches[0].hearing, true);
    assert.ok(!env.logs.join(' ').includes('test-key'));
});

test('download posts a numeric file id, omits secrets on the temporary host, and cache reuse avoids quota use after reload', async function () {
    var calls = [];
    var env = fixture(downloadServer(calls));
    env.globals.Prefs.set('opensubtitlesApiKey', 'test-key');
    var result = await env.globals.SubtitleStore.obtain(7);
    assert.equal(result.text, FILE);
    assert.equal(result.remaining, 7);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].options.method, 'POST');
    assert.equal(calls[0].options.body, '{"file_id":7}');
    assert.equal(calls[0].options.headers['Content-Type'], 'application/json');
    assert.equal(calls[0].options.headers.Accept, 'application/json');
    assert.equal(calls[1].options.headers, undefined);
    var again = fixture(undefined, env.stored);
    assert.equal((await again.globals.SubtitleStore.obtain(7)).text, FILE);
    assert.ok(!env.logs.join(' ').includes('test-key'));
    assert.ok(!env.logs.join(' ').includes('https://'));
});

test('401, 406, 429 and network failures map to safe errors and never log API messages, keys or links', async function () {
    for (var status of [401, 406, 429, 500, 0]) {
        var env = fixture(function () {
            if (!status) return Promise.reject(new Error('test-key https://files.test/private'));
            return json({ message: 'test-key https://files.test/private reset 2026-10-28T00:00:00Z' }, status);
        });
        env.globals.Prefs.set('opensubtitlesApiKey', 'test-key');
        await assert.rejects(env.globals.OpenSubs.download(7), function (error) {
            assert.equal(error.code, status === 401 ? 'badKey' : status === 406 || status === 429 ? 'quota' : 'connection');
            if (status === 406 || status === 429) assert.equal(error.reset, '2026-10-28T00:00:00Z');
            return true;
        });
        assert.ok(!env.logs.join(' ').includes('test-key'));
        assert.ok(!env.logs.join(' ').includes('https://'));
    }
});

test('no key explains Settings without any HTTP, while cached titles restore timing, Off persists and live has no download menu', async function () {
    var env = fixture();
    env.stored['iptvnator-tv:subtitle-cache'] = JSON.stringify({ 7: { text: FILE, at: 1 } });
    env.globals.SubtitleStore.save('s1|movie:1', 7, 500);
    var v = viewer(env);
    var request = { id: 'movie:1', subtitleId: 's1|movie:1', title: 'Fixture' };
    v.player.start(request);
    assert.equal(v.text, 'Hello');
    assert.equal(v.embedded, 1);
    await v.player.search();
    assert.ok(v.toasts[0].includes('Settings'));
    var items = [];
    v.player.menuEntries(function (label, active, action) { items.push({ label: label, run: action }); }, false);
    assert.ok(items.some(function (item) { return item.label.includes('now 0.5 s'); }));
    items.find(function (item) { return item.label.includes('+0.5'); }).run();
    assert.equal(v.text, '');
    v.player.start(request);
    assert.equal(v.text, '');
    v.position = 2100;
    env.tick();
    assert.equal(v.text, 'Hello');
    items[0].run();
    assert.equal(v.text, '');
    v.player.start(request);
    assert.equal(v.player.active(), false);
    v.player.start({ live: true });
    items = [];
    v.player.menuEntries(function () { items.push(1); }, false);
    assert.equal(items.length, 0);
    v.player.stop();
});

test('the key is shared while languages, title choices and delay remain per profile and source', function () {
    var env = load(['profile-store.js', 'settings-store.js', 'subtitle-store.js']);
    var api = env.globals;
    api.Prefs.set('opensubtitlesApiKey', 'test-key');
    api.Prefs.set('subtitleLanguages', 'ar,en');
    api.SubtitleStore.save('s1|movie:1', 7, -500);
    assert.equal(api.SubtitleStore.title('s2|movie:1').file_id, undefined);
    var second = api.ProfileStore.add('Second');
    api.ProfileStore.setActive(second.id);
    assert.equal(api.Prefs.get('opensubtitlesApiKey'), 'test-key');
    assert.equal(api.Prefs.get('subtitleLanguages'), 'en');
    assert.equal(api.SubtitleStore.title('s1|movie:1').file_id, undefined);
    api.Prefs.set('opensubtitlesApiKey', '');
    api.ProfileStore.setActive('default');
    assert.equal(api.Prefs.get('opensubtitlesApiKey'), '');
    assert.equal(api.SubtitleStore.title('s1|movie:1').offset, -500);
});

test('subtitle context uses enriched or provider ids and parent show metadata for episodes', async function () {
    var api = fixture().globals;
    var request = { id: 'episode:3' };
    api.SubtitleContext.attach(request, { sourceId: 'source', item: { name: 'Show', series_id: 4 },
        episode: { season: '1', num: '3' }, details: { tmdb_id: 1234 } });
    assert.equal(request.subtitleId, 'source|episode:3');
    assert.equal(api.OpenSubs.query(await request.subtitleLookup(), 'en'), 'episode_number=3&languages=en&parent_tmdb_id=1234&season_number=1');
    api.SubtitleContext.attach(request, { item: { name: 'Nobody (2021)' }, details: { tmdb_id: 615457 } });
    assert.equal((await request.subtitleLookup()).tmdb_id, 615457);
    api.SubtitleContext.attach(request, { item: { name: 'Nobody (2021)' } });
    assert.equal(api.OpenSubs.query(await request.subtitleLookup(), 'en'), 'languages=en&query=nobody&year=2021');
});

test('picking a search result renders downloaded cues and low quota; reopening uses the cache with no key or HTTP', async function () {
    var calls = [];
    var download = downloadServer(calls);
    var env = fixture(function (url, options) {
        if (url.includes('/subtitles?')) {
            calls.push({ url: url, options: options });
            return json({ data: [{ attributes: { language: 'en', release: 'Fixture', download_count: 42,
                hearing_impaired: true, files: [{ file_id: 7 }] } }] });
        }
        return download(url, options);
    });
    env.globals.Prefs.set('opensubtitlesApiKey', 'test-key');
    var v = viewer(env);
    var request = { id: 'movie:1', title: 'Fixture' };
    v.player.start(request);
    await v.player.search();
    assert.ok(env.menu.children[1].textContent.includes('en · Fixture · 42 · Hearing impaired'));
    env.globals.Menu.onKey(env.globals.Keys.ENTER);
    await new Promise(setImmediate);
    assert.equal(v.text, 'Hello');
    assert.equal(v.player.active(), true);
    assert.equal(v.toasts.join(','), 'Subtitle downloads remaining: 7');
    assert.equal(calls.length, 3);
    env.globals.Prefs.set('opensubtitlesApiKey', '');
    v.player.start(request);
    assert.equal(v.text, 'Hello');
    assert.equal(calls.length, 3);
    v.position = 500;
    env.tick();
    assert.equal(v.text, '');
    v.position = 2000;
    env.tick();
    assert.equal(v.text, 'Hello');
    v.player.stop();
    assert.equal(v.text, '');
});

test('empty searches show a clear no-results toast', async function () {
    var env = fixture(function () { return json({ total_count: 0, data: [] }); });
    env.globals.Prefs.set('opensubtitlesApiKey', 'test-key');
    var v = viewer(env);
    v.player.start({ id: 'movie:1', title: 'Missing' });
    await v.player.search();
    assert.equal(env.globals.Menu.isOpen(), false);
    assert.equal(v.toasts.join(','), 'No subtitles found');
    v.player.stop();
});

test('Return during search prevents late results from reopening the picker', async function () {
    var finish;
    var env = fixture(function () { return new Promise(function (resolve) { finish = resolve; }); });
    env.globals.Prefs.set('opensubtitlesApiKey', 'test-key');
    var v = viewer(env);
    v.player.start({ id: 'movie:1', title: 'Fixture' });
    var searching = v.player.search();
    await new Promise(setImmediate);
    env.globals.Menu.onKey(env.globals.Keys.RETURN);
    finish(await json({ data: [{ attributes: { files: [{ file_id: 7 }] } }] }));
    await searching;
    assert.equal(env.globals.Menu.isOpen(), false);
    assert.equal(v.player.active(), false);
    assert.equal(v.toasts.length, 0);
    v.player.stop();
});

test('changing episode during a download caches the file but never applies it to the new episode', async function () {
    var finish;
    var env = fixture(function (url) {
        if (url.includes('/subtitles?')) return json({ data: [{ attributes: { files: [{ file_id: 7 }] } }] });
        if (url.includes('/download')) return json({ link: 'https://files.test/temporary', remaining: 5 });
        return new Promise(function (resolve) { finish = resolve; });
    });
    env.globals.Prefs.set('opensubtitlesApiKey', 'test-key');
    var v = viewer(env);
    v.player.start({ id: 'episode:1', title: 'Fixture' });
    await v.player.search();
    env.globals.Menu.onKey(env.globals.Keys.ENTER);
    await new Promise(setImmediate);
    v.player.start({ id: 'episode:2', title: 'Fixture' });
    finish({ ok: true, text: function () { return Promise.resolve(FILE); } });
    await new Promise(setImmediate);
    assert.equal(v.player.active(), false);
    assert.equal(v.text, '');
    assert.equal(v.toasts.length, 0);
    assert.equal(env.globals.SubtitleStore.cached(7), FILE);
    assert.equal(env.globals.SubtitleStore.title('episode:2').file_id, undefined);
    v.player.stop();
});

test('subtitle cache is capped, shares pending downloads and refuses malformed text', async function () {
    var calls = [];
    var env = fixture(downloadServer(calls));
    env.globals.Prefs.set('opensubtitlesApiKey', 'test-key');
    await Promise.all([env.globals.SubtitleStore.obtain(7), env.globals.SubtitleStore.obtain(7)]);
    assert.equal(calls.length, 2);
    var large = FILE + 'x'.repeat(300000);
    var old = {};
    old.broken = null;
    [1, 2, 3].forEach(function (id) { old[id] = { text: large, at: id }; });
    env.stored['iptvnator-tv:subtitle-cache'] = JSON.stringify(old);
    await env.globals.SubtitleStore.obtain(8);
    assert.ok(env.stored['iptvnator-tv:subtitle-cache'].length <= 750000);
    assert.equal(env.globals.SubtitleStore.cached(1), '');
    var bad = fixture(function (url) {
        if (url.includes('/download')) return json({ link: 'https://files.test/temporary' });
        return Promise.resolve({ ok: true, text: function () { return Promise.resolve('<html>Error</html>'); } });
    });
    bad.globals.Prefs.set('opensubtitlesApiKey', 'test-key');
    await assert.rejects(bad.globals.SubtitleStore.obtain(9), /Invalid subtitle file/);
    assert.equal(bad.globals.SubtitleStore.cached(9), '');
});

test('requests name the app in User-Agent and X-User-Agent without changing the engine agent', async function () {
    var seen = null;
    var changed = false;
    var env = fixture(function (url, options) { seen = options.headers; return json({ data: [] }); }, {}, {
        tizen: { websetting: { setUserAgentString: function () { changed = true; } } },
    });
    env.globals.Prefs.set('opensubtitlesApiKey', 'test-key');
    await env.globals.OpenSubs.search({ title: 'Fixture' }, 'en');
    assert.equal(seen['X-User-Agent'], 'IPTVnator TV v1.0');
    assert.equal(changed, false);
});

test('title queries use + for spaces, the form the API does not redirect', function () {
    var api = fixture().globals;
    assert.equal(api.OpenSubs.query({ title: 'The Dark Knight', year: 2008 }, 'en'), 'languages=en&query=the+dark+knight&year=2008');
});

test('subtitle language choices map app locales and retain a saved language when the UI language changes', function () {
    var api = fixture().globals;
    var row = api.OpenSubsSettings.rows[3];
    [['en', 'en,ar,ar,en'], ['ary', 'en,ar,ar,en'], ['by', 'en,ar,ar,en,be'],
        ['zhtw', 'en,ar,ar,en,zh-tw'], ['de', 'en,ar,ar,en,de']].forEach(function (scenario) {
        api.Prefs.set('language', scenario[0]);
        assert.equal(row.choices.join(','), scenario[1]);
    });
    api.Prefs.set('subtitleLanguages', 'de');
    api.Prefs.set('language', 'fr');
    assert.equal(row.choices.join('|'), 'en|ar|ar,en|fr|de');
    assert.equal(row.labels.length, row.choices.length);
});

test('Test key searches only, reports bad key or connection errors, and Remove key disables requests', async function () {
    for (var status of [200, 401, 500]) {
        var calls = 0;
        var env = fixture(function (url) {
            calls++;
            assert.ok(url.includes('/subtitles?'));
            return json({ data: [] }, status);
        });
        var api = env.globals;
        var toasts = [];
        var hooks = { toast: function (message) { toasts.push(message); } };
        api.Prefs.set('opensubtitlesApiKey', 'test-key');
        api.OpenSubsSettings.act('opensubs-test', hooks, function () {});
        await new Promise(setImmediate);
        assert.equal(toasts[0], status === 200 ? 'Key works' : status === 401 ? 'Bad OpenSubtitles key' : 'No connection to OpenSubtitles');
        api.OpenSubsSettings.act('opensubs-remove', hooks, function () {});
        api.OpenSubsSettings.act('opensubs-test', hooks, function () {});
        assert.equal(calls, 1);
        assert.ok(toasts[toasts.length - 1].includes('Settings'));
    }
});

test('quota reset durations survive safely without exposing surrounding API message text', async function () {
    var env = fixture(function () { return json({ reset_time: '2 hours and 15 minutes', message: 'test-key' }, 429); });
    env.globals.Prefs.set('opensubtitlesApiKey', 'test-key');
    await assert.rejects(env.globals.OpenSubs.download(7), function (error) {
        assert.equal(error.reset, '2 hours and 15 minutes');
        assert.ok(!error.message.includes('test-key'));
        return true;
    });
});
