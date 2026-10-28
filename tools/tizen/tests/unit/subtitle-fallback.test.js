'use strict';

// #52 backups: Subsource and DeepL translation, used only when OpenSubtitles
// and SubDL find nothing, behind the Backup search switch.
var test = require('node:test');
var assert = require('node:assert/strict');
var zlib = require('node:zlib');
var load = require('./sandbox');
var uiSandbox = require('./ui-sandbox');
var FILE = '1\n00:00:01,000 --> 00:00:03,000\nHello';
var FILES = ['keys.js', 'settings-store.js', 'opensubs.js', 'zip-file.js', 'subdl.js', 'subsource.js', 'subtitle-file.js', 'subtitle-rank.js',
    'subtitle-translate.js', 'subtitle-store.js', 'subtitle-context.js', 'focus.js', 'kit.js', 'menu.js', 'subtitle-download.js', 'opensubs-settings.js'];

// One deflated file in a zip.
function zip(name, text) {
    var raw = Buffer.from(text);
    var data = zlib.deflateRawSync(raw);
    var file = Buffer.from(name);
    var local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(file.length, 26);
    var central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(file.length, 28);
    var end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(1, 8);
    end.writeUInt16LE(1, 10);
    end.writeUInt32LE(46 + file.length, 12);
    end.writeUInt32LE(30 + file.length + data.length, 16);
    var all = Buffer.concat([local, file, data, central, file, end]);
    return all.buffer.slice(all.byteOffset, all.byteOffset + all.length);
}

function node() {
    var children = [];
    var element = { children: children, classList: { add: function () {}, remove: function () {} },
        appendChild: function (child) { children.push(child); }, querySelector: function () { return null; } };
    Object.defineProperty(element, 'innerHTML', { set: function () { children.length = 0; } });
    return element;
}

function fixture(fetcher) {
    var menu = node();
    var logs = [];
    var env = load(FILES, {}, {
        AbortController: AbortController, Blob: Blob, Response: Response, DecompressionStream: DecompressionStream, TextDecoder: TextDecoder,
        UI: uiSandbox.UI,
        document: { body: node(), getElementById: function () { return menu; }, createElement: node, addEventListener: function () {} },
        fetch: fetcher || function () { throw new Error('Unexpected HTTP'); },
        Log: { info: function (text) { logs.push(text); }, error: function (text) { logs.push(text); } },
        setInterval: function () { return 1; },
        clearInterval: function () {},
    });
    env.logs = logs;
    env.menu = menu;
    return env;
}

function json(body, status) {
    return Promise.resolve({ ok: !status || status < 400, status: status || 200, json: function () { return Promise.resolve(body); } });
}

function binary(buffer) {
    return Promise.resolve({ ok: true, status: 200, arrayBuffer: function () { return Promise.resolve(buffer); } });
}

function viewer(env) {
    var result = { position: 1500, text: '', toasts: [] };
    result.player = env.globals.SubtitleDownload({ position: function () { return result.position; },
        draw: function (text) { result.text = text; }, embeddedOff: function () {},
        closeMenu: function () {}, toast: function (text) { result.toasts.push(text); } });
    return result;
}

async function settle(check) {
    for (var i = 0; i < 80 && !check(); i++) await new Promise(function (done) { setTimeout(done, 5); });
}

// A fake for every provider: found[name] is how many results it has.
function everyProvider(found, calls) {
    return function (url, options) {
        var name = url.indexOf('opensubtitles') >= 0 ? 'os' : url.indexOf('api.subdl') >= 0 ? 'subdl' : url.indexOf('subsource') >= 0 ? 'subsource'
            : url.indexOf('deepl') >= 0 ? 'deepl' : 'file';
        calls.push(name);
        if (name === 'os') {
            if (url.indexOf('/download') >= 0) return json({ link: 'https://files.test/x', remaining: 50 });
            var lang = /languages=([a-z]+)/.exec(url)[1];
            return json({ data: Array.from({ length: found['os-' + lang] || 0 }, function (_, i) {
                return { attributes: { language: lang, release: 'OS.' + lang + '.' + i, download_count: 10, files: [{ file_id: 100 + i }] } };
            }) });
        }
        if (name === 'file') {
            return Promise.resolve({ ok: true, status: 200, text: function () { return Promise.resolve(FILE + '\n\n2\n00:00:04,000 --> 00:00:05,000\nBye'); } });
        }
        if (name === 'subdl') return json({ status: true, subtitles: [] });
        if (name === 'subsource') {
            if (url.indexOf('/movies/search') >= 0) return json({ data: [{ movieId: 5 }] });
            return json({ data: Array.from({ length: found.subsource || 0 }, function (_, i) { return { subtitleId: 50 + i, releaseInfo: ['SS.' + i] }; }) });
        }
        var body = JSON.parse(options.body);
        calls.push('deepl ' + body.source_lang + '>' + body.target_lang + ' ' + body.text.length + ' ' + options.headers.Authorization + ' ' + url);
        return json({ translations: body.text.map(function (text) { return { text: '[EN] ' + text }; }) });
    };
}

function keys(env, more) {
    env.globals.Prefs.set('opensubtitlesApiKey', 'test-key');
    env.globals.Prefs.set('subdlApiKey', 'subdl-key');
    env.globals.Prefs.set('subsourceApiKey', 'ss-key');
    Object.keys(more || {}).forEach(function (key) { env.globals.Prefs.set(key, more[key]); });
}

test('#52 Subsource finds the season by IMDb id, keeps the episode subtitles and unzips a download', async function () {
    var calls = [];
    var env = fixture(function (url, options) {
        calls.push({ url: url, key: options.headers['X-API-Key'] });
        if (url.indexOf('/movies/search?') >= 0) return json({ data: [{ movieId: 9, season: 7 }, { movieId: 10, season: 8, tmdbId: 1234 }] });
        if (url.indexOf('/subtitles?') >= 0) {
            return json({ data: [
                { subtitleId: 1, releaseInfo: ['Show.S08E01.1080p.NF'], downloads: 900, hearingImpaired: true, framerate: '23.976' },
                { subtitleId: 2, releaseInfo: ['Show.S08E02.1080p.NF'] },
                { subtitleId: 3, releaseInfo: ['Show.Season.8.Complete'] },
            ] });
        }
        return binary(zip('Show.S08E01.srt', FILE));
    });
    env.globals.Prefs.set('subsourceApiKey', 'ss-key');
    var matches = await env.globals.SubSource.search({ imdb_id: 'tt777', tmdb_id: 1234, season: 8, episode: 1 }, 'ar');
    assert.equal(calls[0].url, 'https://api.subsource.net/api/v1/movies/search?imdb=tt777&searchType=imdb&season=8&type=series');
    assert.equal(calls[1].url, 'https://api.subsource.net/api/v1/subtitles?language=arabic&limit=50&movieId=10');
    assert.equal(calls[0].key, 'ss-key');
    assert.equal(matches.length, 1);
    assert.equal(matches[0].file_id, 'subsource:1');
    assert.equal(matches[0].downloads, 900);
    assert.equal(matches[0].fps, 23.976);
    var result = await env.globals.SubtitleStore.obtain('subsource:1', matches[0]);
    assert.equal(result.text, FILE);
    assert.equal(calls[2].url, 'https://api.subsource.net/api/v1/subtitles/1/download');
    assert.equal(env.globals.SubSource.titleQuery({ title: 'Nobody', year: 2021 }), 'q=Nobody&searchType=text&type=movie&year=2021');
    assert.ok(!env.logs.join(' ').includes('ss-key'));
});

test('#52 the backup search runs only when OpenSubtitles and SubDL find nothing, and the switch turns it off', async function () {
    var calls = [];
    var env = fixture(everyProvider({ 'os-en': 2, subsource: 3 }, calls));
    keys(env);
    var v = viewer(env);
    v.player.start({ id: 'movie:1', title: 'Fixture' });
    await v.player.search();
    // Found by the first round: Subsource is never asked.
    assert.equal(calls.filter(function (name) { return name === 'subsource'; }).length, 0);
    assert.equal(env.menu.children[0].textContent, 'Subtitles · English2 found · OpenSubtitles 2 · SubDL 0');

    calls = [];
    env = fixture(everyProvider({ subsource: 3 }, calls));
    keys(env);
    v = viewer(env);
    v.player.start({ id: 'movie:1', title: 'Fixture' });
    await v.player.search();
    assert.equal(env.menu.children[0].textContent, 'Subtitles · EnglishBackup · 3 found · Subsource 3');
    assert.equal(env.menu.children[1].textContent, 'SS.0Subsource★');

    // Backup search off, from the player's Subtitles group: only the first round runs.
    var items = [];
    v.player.menuEntries(function (label, active, run) { items.push({ label: label, run: run }); }, false);
    items.find(function (item) { return item.label === 'Backup search: On'; }).run();
    assert.equal(env.globals.Prefs.get('subtitleFallback'), false);
    var labels = [];
    v.player.menuEntries(function (label) { labels.push(label); }, false);
    assert.ok(labels.includes('Backup search: Off'));
    calls.length = 0;
    await v.player.search();
    assert.equal(calls.filter(function (name) { return name === 'subsource'; }).length, 0);
    assert.equal(v.toasts[v.toasts.length - 1], 'No subtitles found');
});

test('#52 with nothing in English anywhere, DeepL translates the best Arabic subtitle and caches it', async function () {
    var calls = [];
    var env = fixture(everyProvider({ 'os-ar': 1 }, calls));
    keys(env, { deeplApiKey: 'dl-key:fx' });
    var v = viewer(env);
    v.player.start({ id: 'movie:1', title: 'Fixture' });
    await v.player.search();
    assert.equal(env.menu.children[0].textContent, 'Subtitles · EnglishNo English subtitles found');
    assert.equal(env.menu.children[1].textContent, 'Translate from ARDeepLAI');
    env.globals.Menu.onKey(env.globals.Keys.ENTER);
    await settle(function () { return v.text; });
    assert.equal(v.text, '[EN] Hello');
    var deepl = calls.filter(function (line) { return line.indexOf('deepl ') === 0; });
    assert.equal(deepl.join('|'), 'deepl AR>EN-US 2 DeepL-Auth-Key dl-key:fx https://api-free.deepl.com/v2/translate');
    var labels = [];
    v.player.menuEntries(function (label) { labels.push(label); }, false);
    assert.ok(labels.includes('English · translated from AR'));
    // The unit sandbox has no language list, so Arabic shows as its code here.
    // Reopened later, the translation comes from the cache with no requests.
    calls.length = 0;
    v.player.start({ id: 'movie:1', title: 'Fixture' });
    assert.equal(calls.length, 0);
    assert.ok(!env.logs.join(' ').includes('dl-key'));
});

test('#52 DeepL uses the paid host for a paid key, translates in batches of 50 and maps errors', async function () {
    var calls = [];
    var env = fixture(function (url, options) {
        var texts = JSON.parse(options.body).text;
        calls.push({ url: url, count: texts.length });
        return json({ translations: texts.map(function (text) { return { text: text }; }) });
    });
    env.globals.Prefs.set('deeplApiKey', 'paid-key');
    var lines = await env.globals.SubtitleTranslate.translate(['a', 'b'], 'ar', 'pt');
    assert.equal(lines.join(','), 'a,b');
    assert.equal(calls[0].url, 'https://api.deepl.com/v2/translate');
    var long = Array.from({ length: 120 }, function (_, i) {
        return (i + 1) + '\n00:00:0' + (i % 9) + ',000 --> 00:00:0' + (i % 9) + ',500\nLine ' + i;
    }).join('\n\n');
    env.stored['iptvnator-tv:subtitle-cache'] = JSON.stringify({ 'subdl:x': { text: long, at: 1 } });
    calls.length = 0;
    var progress = [];
    var result = await env.globals.SubtitleTranslate.download('deepl:en:subdl:x', { source: { file_id: 'subdl:x' }, from: 'ar', to: 'en',
        progress: function (done, total) { progress.push(done + '/' + total); } });
    assert.equal(calls.map(function (call) { return call.count; }).join(','), '50,50,20');
    assert.equal(progress.join(','), '50/120,100/120,120/120');
    assert.equal(env.globals.SubtitleFile.parse(result.text).length, 120);
    for (var status of [403, 456, 500]) {
        env = fixture(function () { return json({}, status); });
        env.globals.Prefs.set('deeplApiKey', 'paid-key');
        await assert.rejects(env.globals.SubtitleTranslate.translate(['a'], 'ar', 'en'), function (error) {
            assert.equal(error.code, status === 403 ? 'badKey' : status === 456 ? 'quota' : 'connection');
            return true;
        });
    }
});

test('#52 Settings list the backup switch and the Subsource and DeepL key rows', function () {
    var api = fixture().globals;
    var rows = api.OpenSubsSettings.rows;
    var labels = rows.map(function (row) { return (row.group ? '[' + row.group + '] ' : '') + row.label; });
    assert.equal(labels.join(' | '), '[Subtitles download] OpenSubtitles API key | Test key | Remove key | SubDL API key | Test SubDL key | Remove SubDL key | ' +
        'Subtitle language | [Backup subtitles] Backup search | Subsource API key | Test Subsource key | Remove Subsource key | DeepL API key | Test DeepL key | Remove DeepL key');
    var toggle = rows.filter(function (row) { return row.key === 'subtitleFallback'; })[0];
    assert.equal(toggle.labels.join(','), 'On,Off');
    assert.equal(api.Prefs.get('subtitleFallback'), true);
});

test('#52 a refused download moves on to another provider and says why, and the list names each failure', async function () {
    var env = fixture(function (url) {
        if (url.indexOf('api.opensubtitles.com') >= 0 && url.indexOf('/download') >= 0) return json({ message: 'quota' }, 406);
        if (url.indexOf('api.opensubtitles.com') >= 0) {
            return json({ data: [{ attributes: { language: 'en', release: 'OS.best', download_count: 900, moviehash_match: true, files: [{ file_id: 7 }] } }] });
        }
        if (url.indexOf('api.subdl.com') >= 0) return json({ status: true, subtitles: [{ release_name: 'SubDL.one', url: '/subtitle/1-2.zip' }] });
        if (url.indexOf('dl.subdl.com') >= 0) return binary(zip('x.srt', FILE));
        throw new Error('Unexpected ' + url);
    });
    env.globals.Prefs.set('opensubtitlesApiKey', 'test-key');
    env.globals.Prefs.set('subdlApiKey', 'subdl-key');
    var v = viewer(env);
    v.player.start({ id: 'movie:1', title: 'Fixture' });
    await v.player.search();
    // The OpenSubtitles exact match leads, but its download limit is used up.
    env.globals.Menu.onKey(env.globals.Keys.ENTER);
    await settle(function () { return v.text; });
    assert.equal(v.toasts.join('|'), 'OpenSubtitles: limit reached. Using SubDL instead.');
    assert.equal(v.text, 'Hello');
    var labels = [];
    v.player.menuEntries(function (label) { labels.push(label); }, false);
    assert.ok(labels.includes('English · SubDL.one'));

    // In the list, a refused key reads as such under the title.
    env = fixture(function (url) {
        if (url.indexOf('api.opensubtitles.com') >= 0) return json({}, 401);
        return json({ status: true, subtitles: [{ release_name: 'SubDL.one', url: '/subtitle/1-2.zip' }] });
    });
    env.globals.Prefs.set('opensubtitlesApiKey', 'expired');
    env.globals.Prefs.set('subdlApiKey', 'subdl-key');
    v = viewer(env);
    v.player.start({ id: 'movie:1', title: 'Fixture' });
    await v.player.search();
    assert.equal(env.menu.children[0].textContent, 'Subtitles · English1 found · OpenSubtitles: key not accepted · SubDL 1');
});
