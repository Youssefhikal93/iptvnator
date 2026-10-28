'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var load = require('./sandbox');
var uiSandbox = require('./ui-sandbox');
var FILE = '1\n00:00:01,000 --> 00:00:03,000\nHello';
var FILES = ['keys.js', 'settings-store.js', 'opensubs.js', 'zip-file.js', 'subdl.js', 'subsource.js', 'subtitle-file.js', 'subtitle-rank.js', 'subtitle-translate.js', 'subtitle-store.js', 'subtitle-context.js', 'focus.js', 'kit.js', 'menu.js', 'subtitle-download.js', 'opensubs-settings.js'];

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
        UI: uiSandbox.UI,
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
        [{ tmdb_id: 5, moviehash: '8E245D9679D31E12' }, 'en', 'languages=en&moviehash=8e245d9679d31e12&tmdb_id=5'],
        [{ tmdb_id: 5, moviehash: 'xyz' }, 'en', 'languages=en&tmdb_id=5'],
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
    assert.equal(matches[0].hashMatch, false);
    assert.equal(matches[0].machine, false);
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
    // Without a group starter the timing rows follow in the same list.
    assert.ok(items.some(function (item) { return item.label === 'Reset timing'; }));
    items.find(function (item) { return item.label === 'Show later by 0.5 s'; }).run();
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
    // The language moves to the title; the row is the release over its badges.
    assert.equal(env.menu.children[0].textContent, 'Subtitles · English1 found · OpenSubtitles 1');
    assert.equal(env.menu.children[1].textContent, 'FixtureOpenSubtitles★⬇ 42CC');
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
    var row = api.OpenSubsSettings.rows.filter(function (entry) { return entry.key === 'subtitleLanguages'; })[0];
    [['en', 'en,ar'], ['ary', 'en,ar'], ['by', 'en,ar,be'],
        ['zhtw', 'en,ar,zh-tw'], ['de', 'en,ar,de']].forEach(function (scenario) {
        api.Prefs.set('language', scenario[0]);
        assert.equal(row.choices.join(','), scenario[1]);
    });
    api.Prefs.set('subtitleLanguages', 'de');
    api.Prefs.set('language', 'fr');
    assert.equal(row.choices.join('|'), 'en|ar|fr|de');
    assert.equal(row.labels.length, row.choices.length);
    // One language per choice: a pair saved before keeps its first language.
    api.Prefs.set('subtitleLanguages', 'ar,en');
    assert.equal(row.choices.join('|'), 'en|ar|fr');
    assert.equal(api.Prefs.get('subtitleLanguages'), 'ar');
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

// #39: three lines, the second in Arabic, for alignment tests.
var LINES = '1\n00:00:01,000 --> 00:00:03,000\nHello\n\n2\n00:00:05,000 --> 00:00:07,000\nمرحبا بك\n\n3\n00:00:09,000 --> 00:00:11,000\nBye';

// A search with two results; each download returns its own text.
function alignServer(results, texts) {
    var asked = null;
    return function (url, options) {
        if (url.includes('/subtitles?')) return json({ data: results.map(function (attributes) { return { attributes: attributes }; }) });
        if (url.indexOf('/download') >= 0) {
            asked = JSON.parse(options.body).file_id;
            return json({ link: 'https://files.test/temporary', file_name: 'fixture.srt', remaining: 50 });
        }
        return Promise.resolve({ ok: true, text: function () { return Promise.resolve(texts[asked]); } });
    };
}

async function searchAndPick(env, v, request) {
    v.player.start(request);
    await v.player.search();
    env.globals.Menu.onKey(env.globals.Keys.ENTER);
    await new Promise(setImmediate);
    await new Promise(setImmediate);
}

test('#39 a subtitle timed for 25 fps is stretched to a 23.976 fps video, and the stretch is remembered', async function () {
    var env = fixture(alignServer([{ language: 'en', release: 'PAL', fps: 25, files: [{ file_id: 7 }] }], { 7: LINES }));
    env.globals.Prefs.set('opensubtitlesApiKey', 'test-key');
    var v = viewer(env);
    var request = { id: 'movie:1', subtitleId: 's1|movie:1', title: 'Fixture',
        subtitleLookup: function () { return Promise.resolve({ title: 'Fixture', video: { r_frame_rate: '24000/1001', width: 1920, height: 1080 } }); } };
    await searchAndPick(env, v, request);
    assert.ok(v.toasts.some(function (text) { return text.includes('25') && text.includes('23.976'); }), v.toasts.join(','));
    // Unstretched, the third line starts at 9.000 s; at 25/23.976 it starts at about 9.384 s.
    v.position = 9200;
    env.tick();
    assert.equal(v.text, '');
    v.position = 9500;
    env.tick();
    assert.equal(v.text, 'Bye');
    assert.ok(Math.abs(env.globals.SubtitleStore.title('s1|movie:1').scale - 25 / (24000 / 1001)) < 1e-9);
    // The next start restores the stretch with no search.
    v.player.start(request);
    v.position = 9200;
    env.tick();
    assert.equal(v.text, '');
    // The TV log names the facts, never the title or a link.
    var facts = env.logs.filter(function (line) { return line.indexOf('SUBS facts') === 0; })[0];
    assert.equal(facts, 'SUBS facts fps 23.976 res 1080p codec ? hash no results 1 hash matches 0 with fps 1');
    assert.ok(!env.logs.join('\n').includes('Fixture') && !env.logs.join('\n').includes('https://'));
    v.player.stop();
});

test('#39 matching or unknown frame rates leave the timing alone', async function () {
    var env = fixture(alignServer([{ language: 'en', release: 'Same', fps: 23.976, files: [{ file_id: 7 }] }], { 7: LINES }));
    env.globals.Prefs.set('opensubtitlesApiKey', 'test-key');
    var v = viewer(env);
    await searchAndPick(env, v, { id: 'movie:1', title: 'Fixture',
        subtitleLookup: function () { return Promise.resolve({ title: 'Fixture', video: { avg_frame_rate: '24000/1001' } }); } });
    v.position = 9100;
    env.tick();
    assert.equal(v.text, 'Bye');
    assert.equal(v.toasts.filter(function (text) { return text.includes('fps'); }).length, 0);
    v.player.stop();
});

test('#39 the timing group shows the delay and moves it by 0.5 s or 5 s', function () {
    var env = fixture();
    env.stored['iptvnator-tv:subtitle-cache'] = JSON.stringify({ 7: { text: LINES, at: 1 } });
    env.globals.SubtitleStore.save('s1|movie:1', 7, 0);
    var v = viewer(env);
    v.player.start({ id: 'movie:1', subtitleId: 's1|movie:1', title: 'Fixture' });
    var heads = [];
    var labels = function () {
        var items = [];
        heads = [];
        v.player.menuEntries(function (label, active, action) { items.push({ label: label, run: action }); }, false,
            function (label, value) { heads.push(label + ': ' + value); items.push({ label: '# ' + label }); });
        return items;
    };
    assert.deepEqual(labels().map(function (item) { return item.label; }), ['Off', 'Downloaded subtitles', 'Find subtitles online…', 'Backup search: On',
        '# Subtitle timing', 'Sync to the line being spoken…', 'Show earlier by 5 s', 'Show earlier by 0.5 s', 'Show later by 0.5 s', 'Show later by 5 s']);
    assert.deepEqual(heads, ['Subtitle timing: No delay']);
    labels().find(function (item) { return item.label === 'Show later by 5 s'; }).run();
    // The group's value shows the delay, and Reset timing appears.
    assert.ok(labels().some(function (item) { return item.label === 'Reset timing'; }));
    assert.deepEqual(heads, ['Subtitle timing: +5.0 s']);
    v.position = 6500;
    env.tick();
    assert.equal(v.text, 'Hello');
    assert.equal(env.globals.SubtitleStore.title('s1|movie:1').offset, 5000);
    v.player.stop();
});

test('#39 syncing to the spoken line pauses, starts on the nearest line and sets the delay from it', function () {
    var env = fixture();
    env.stored['iptvnator-tv:subtitle-cache'] = JSON.stringify({ 7: { text: LINES, at: 1 } });
    env.globals.SubtitleStore.save('s1|movie:1', 7, 0);
    var paused = 0;
    var v = viewer(env);
    v.player = env.globals.SubtitleDownload({ position: function () { return v.position; },
        draw: function (text) { v.text = text; }, embeddedOff: function () {}, pause: function () { paused++; },
        closeMenu: function () {}, toast: function (text) { v.toasts.push(text); } });
    v.player.start({ id: 'movie:1', subtitleId: 's1|movie:1', title: 'Fixture' });
    // The voice says the Arabic line at 25 s; the file has it at 5 s.
    v.position = 25000;
    var items = [];
    v.player.menuEntries(function (label, active, action) { items.push({ label: label, run: action }); }, false);
    items.find(function (item) { return item.label.indexOf('Sync to the line') === 0; }).run();
    assert.equal(paused, 1);
    assert.ok(env.globals.Menu.isOpen());
    // Lines are listed with where they show now; the focus starts on the last (nearest) line.
    var text = env.menu.children.map(function (child) { return child.textContent; }).join('|');
    assert.ok(text.includes('0:01  \u2068Hello\u2069') && text.includes('0:05  \u2068مرحبا بك\u2069') && text.includes('0:09  \u2068Bye'), text.slice(0, 400));
    env.globals.Menu.onKey(env.globals.Keys.UP);
    env.globals.Menu.onKey(env.globals.Keys.ENTER);
    assert.equal(env.globals.SubtitleStore.title('s1|movie:1').offset, 20000);
    assert.equal(v.text, 'مرحبا بك');
    v.position = 29500;
    env.tick();
    assert.equal(v.text, 'Bye');
    v.player.stop();
});

test('#39 Try the next subtitle downloads the following result without searching again', async function () {
    var calls = 0;
    var server = alignServer([{ language: 'en', release: 'One', download_count: 900, files: [{ file_id: 7 }] },
        { language: 'en', release: 'Two', download_count: 10, files: [{ file_id: 8 }] }], { 7: LINES, 8: '1\n00:00:01,000 --> 00:00:03,000\nSecond file' });
    var env = fixture(function (url, options) {
        if (url.includes('/subtitles?')) calls++;
        return server(url, options);
    });
    env.globals.Prefs.set('opensubtitlesApiKey', 'test-key');
    var v = viewer(env);
    await searchAndPick(env, v, { id: 'movie:1', subtitleId: 's1|movie:1', title: 'Fixture' });
    v.position = 1500;
    env.tick();
    assert.equal(v.text, 'Hello');
    var items = [];
    v.player.menuEntries(function (label, active, action) { items.push({ label: label, run: action }); }, false);
    // The downloaded row names the file's language and release.
    assert.ok(items.some(function (item) { return item.label === 'English · One'; }));
    items.find(function (item) { return item.label === 'Try another match'; }).run();
    await new Promise(setImmediate);
    await new Promise(setImmediate);
    assert.equal(v.text, 'Second file');
    assert.equal(calls, 1);
    assert.equal(env.globals.SubtitleStore.title('s1|movie:1').file_id, 8);
    v.player.stop();
});

test('with a TMDB key the subtitle search uses TMDB\'s English name and IMDb id, not the provider\'s title', async function () {
    var asked = [];
    var env = load(['subtitle-context.js'], {}, {
        Tmdb: {
            enabled: function () { return true; },
            match: function (item, type) {
                asked.push(type + ' ' + item.tmdb_id);
                return Promise.resolve({ id: 230000, name: 'Love Is Blind, Habibi', original_name: 'الحب أعمى حبيبي', imdb_id: 'tt32000000' });
            },
        },
    });
    var request = {};
    env.globals.SubtitleContext.attach(request, { sourceId: 's', item: { name: 'Love is blind, Habibi- الحب أعمى حبيبي', tmdb_id: 230000 },
        episode: { season: 1, num: 2 }, details: {} });
    var info = await request.subtitleLookup();
    assert.equal(asked.join(), 'tv 230000');
    assert.equal(info.title, 'Love Is Blind, Habibi');
    assert.equal(info.imdb_id, 'tt32000000');
    assert.equal(info.season + 'x' + info.episode, '1x2');
    // TMDB knows only the Arabic name: the provider's title stays.
    env.globals.Tmdb.match = function () { return Promise.resolve({ id: 5, name: 'الحب أعمى حبيبي', original_name: 'الحب أعمى حبيبي' }); };
    assert.equal((await request.subtitleLookup()).title, 'Love is blind, Habibi- الحب أعمى حبيبي');
});
