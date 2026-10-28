'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var zlib = require('node:zlib');
var load = require('./sandbox');
var uiSandbox = require('./ui-sandbox');
var FILE = '1\n00:00:01,000 --> 00:00:03,000\nHello';
var FILES = ['keys.js', 'settings-store.js', 'opensubs.js', 'zip-file.js', 'subdl.js', 'subsource.js', 'subtitle-file.js', 'subtitle-rank.js', 'subtitle-translate.js', 'subtitle-store.js',
    'subtitle-context.js', 'focus.js', 'kit.js', 'menu.js', 'subtitle-download.js', 'opensubs-settings.js'];

// A zip built the way SubDL serves them: each file stored or deflated.
function zip(files) {
    var locals = [];
    var centrals = [];
    var offset = 0;
    files.forEach(function (file) {
        var raw = Buffer.from(file.data);
        var data = file.stored ? raw : zlib.deflateRawSync(raw);
        var name = Buffer.from(file.name);
        var local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(file.stored ? 0 : 8, 8);
        local.writeUInt32LE(data.length, 18);
        local.writeUInt32LE(raw.length, 22);
        local.writeUInt16LE(name.length, 26);
        var central = Buffer.alloc(46);
        central.writeUInt32LE(0x02014b50, 0);
        central.writeUInt16LE(file.stored ? 0 : 8, 10);
        central.writeUInt32LE(data.length, 20);
        central.writeUInt32LE(raw.length, 24);
        central.writeUInt16LE(name.length, 28);
        central.writeUInt32LE(offset, 42);
        locals.push(local, name, data);
        centrals.push(central, name);
        offset += 30 + name.length + data.length;
    });
    var directory = Buffer.concat(centrals);
    var end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(files.length, 8);
    end.writeUInt16LE(files.length, 10);
    end.writeUInt32LE(directory.length, 12);
    end.writeUInt32LE(offset, 16);
    var all = Buffer.concat(locals.concat([directory, end]));
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

test('#52 SubDL queries prefer ids, name the type and send one upper-case language', function () {
    var api = fixture().globals.SubDL;
    [
        [{ tmdb_id: 615457, imdb_id: 'tt9' }, 'en', 'languages=EN&subs_per_page=30&tmdb_id=615457&type=movie'],
        [{ imdb_id: 'tt1234567' }, 'ar', 'imdb_id=tt1234567&languages=AR&subs_per_page=30&type=movie'],
        [{ title: 'Two Words', year: 2021 }, 'zh-tw', 'film_name=Two%20Words&languages=ZH&subs_per_page=30&type=movie&year=2021'],
        [{ tmdb_id: 1234, season: 8, episode: 1 }, 'en', 'episode_number=1&languages=EN&season_number=8&subs_per_page=30&tmdb_id=1234&type=tv'],
    ].forEach(function (row) { assert.equal(api.query(row[0], row[1]), row[2]); });
    assert.throws(function () { api.query({ season: 1, episode: 0 }, 'en'); }, function (error) { return error.code === 'noResults'; });
});

test('#52 SubDL search keeps the episode\'s own subtitles and season packs, drops the key from links and never logs it', async function () {
    var asked = '';
    var env = fixture(function (url) {
        asked = url;
        return json({ status: true, results: [{ name: 'Love Is Blind' }], subtitles: [
            // Production links carry the key: "/subtitle/<id>.zip?api_key=…".
            { release_name: 'Love.Is.Blind.S08E01.1080p.NF.WEB-DL', url: '/subtitle/111-222.zip?api_key=subdl-key', episode: 1, hi: true, fps: '23.976' },
            { release_name: 'Season Pack', url: '/subtitle/333-444.zip', episode: 1, full_season: true },
            { release_name: 'Love.Is.Blind.S08E02', url: '/subtitle/555-666.zip', episode: 2 },
            { release_name: 'Broken', url: 'https://elsewhere.test/x.zip' },
        ] });
    });
    env.globals.Prefs.set('subdlApiKey', 'subdl-key');
    var matches = await env.globals.SubDL.search({ tmdb_id: 1234, season: 8, episode: 1 }, 'en');
    assert.ok(asked.startsWith('https://api.subdl.com/api/v1/subtitles?api_key=subdl-key&'));
    assert.equal(matches.length, 2);
    // The season pack's id names the episode, so the cache keeps episodes apart.
    assert.equal(matches[1].file_id, 'subdl:333-444#s8e1');
    assert.equal(matches[1].pack, true);
    assert.equal(matches[0].pack, false);
    assert.ok(!JSON.stringify(matches).includes('subdl-key'));
    assert.equal(matches[0].source, 'subdl');
    assert.equal(matches[0].file_id, 'subdl:111-222');
    assert.equal(matches[0].release, 'Love.Is.Blind.S08E01.1080p.NF.WEB-DL');
    assert.equal(matches[0].hearing, true);
    assert.equal(matches[0].fps, 23.976);
    assert.ok(!env.logs.join(' ').includes('subdl-key'));
});

test('#52 SubDL failures map to safe codes and no key means no request', async function () {
    for (var status of [403, 429, 500]) {
        var env = fixture(function () { return json({ status: false, error: 'subdl-key bad' }, status); });
        env.globals.Prefs.set('subdlApiKey', 'subdl-key');
        await assert.rejects(env.globals.SubDL.search({ tmdb_id: 1 }, 'en'), function (error) {
            assert.equal(error.provider, 'subdl');
            assert.equal(error.code, status === 403 ? 'badKey' : status === 429 ? 'quota' : 'connection');
            return true;
        });
        assert.ok(!env.logs.join(' ').includes('subdl-key'));
    }
    await assert.rejects(fixture().globals.SubDL.search({ tmdb_id: 1 }, 'en'), function (error) { return error.code === 'badKey'; });
});

test('#52 zips unpack stored and deflated files; the episode\'s file is picked and Arabic Windows-1256 decodes', async function () {
    var env = fixture();
    var entries = env.globals.ZipFile.entries(zip([{ name: 'a.txt', data: 'stored', stored: true }, { name: 'b.srt', data: FILE }]));
    assert.equal(entries.map(function (entry) { return entry.name; }).join(','), 'a.txt,b.srt');
    assert.equal(Buffer.from(await entries[0].read()).toString(), 'stored');
    assert.equal(Buffer.from(await entries[1].read()).toString(), FILE);
    assert.throws(function () { env.globals.ZipFile.entries(new ArrayBuffer(10)); });

    var pack = zip([{ name: 'Show.S01E01.srt', data: FILE.replace('Hello', 'One') }, { name: 'Show.S01E02.srt', data: FILE.replace('Hello', 'Two') }]);
    // "مرحبا" in Windows-1256.
    var arabic = Buffer.concat([Buffer.from('1\n00:00:01,000 --> 00:00:03,000\n'), Buffer.from([0xe3, 0xd1, 0xcd, 0xc8, 0xc7])]);
    var single = zip([{ name: 'ar.srt', data: arabic }]);
    var requests = [];
    env = fixture(function (url) {
        requests.push(url);
        return binary(url.indexOf('pack') >= 0 ? pack : single);
    });
    var episode = await env.globals.SubDL.download('subdl:pack-1', { season: 1, episode: 2 });
    assert.ok(episode.text.endsWith('Two'));
    assert.equal(requests[0], 'https://dl.subdl.com/subtitle/pack-1.zip');
    var decoded = await env.globals.SubDL.download('subdl:ar-1');
    assert.ok(decoded.text.endsWith('مرحبا'));
    await assert.rejects(env.globals.SubDL.download('subdl:../x'));
});

test('#52 one search asks both providers, merges them into one ranked list and survives one failing', async function () {
    var env = fixture(function (url) {
        if (url.indexOf('api.opensubtitles.com') >= 0 && url.indexOf('/subtitles?') >= 0) {
            return json({ data: [{ attributes: { language: 'en', release: 'Show.S01E01.WEB', download_count: 12345, files: [{ file_id: 7 }] } }] });
        }
        if (url.indexOf('api.subdl.com') >= 0) return json({}, 500);
        if (url.indexOf('dl.subdl.com') >= 0) return binary(zip([{ name: 'x.srt', data: FILE }]));
        throw new Error('Unexpected ' + url);
    });
    env.globals.Prefs.set('opensubtitlesApiKey', 'test-key');
    env.globals.Prefs.set('subdlApiKey', 'subdl-key');
    var v = viewer(env);
    v.player.start({ id: 'movie:1', title: 'Fixture' });
    await v.player.search();
    // SubDL failed, so its name says so under the title and OpenSubtitles' result still shows.
    assert.equal(env.menu.children[0].textContent, 'Subtitles · English1 found · OpenSubtitles 1 · SubDL: no connection');
    assert.equal(env.menu.children[1].textContent, 'Show.S01E01.WEBOpenSubtitles★⬇ 12k');
    assert.ok(env.logs.some(function (line) { return line === 'SUBS providers opensubtitles 1, subdl failed 500'; }));
    v.player.stop();

    env = fixture(function (url) {
        if (url.indexOf('api.subdl.com') >= 0) {
            return json({ status: true, subtitles: [{ release_name: 'Fixture.1080p.NF.WEB-DL', url: '/subtitle/1-2.zip', hi: true }] });
        }
        if (url.indexOf('dl.subdl.com') >= 0) return binary(zip([{ name: 'x.srt', data: FILE }]));
        throw new Error('Unexpected ' + url);
    });
    env.globals.Prefs.set('subdlApiKey', 'subdl-key');
    v = viewer(env);
    v.player.start({ id: 'movie:1', title: 'Fixture' });
    await v.player.search();
    // Only SubDL has a key, so only SubDL is asked.
    assert.equal(env.menu.children[0].textContent, 'Subtitles · English1 found · SubDL 1');
    assert.equal(env.menu.children[1].textContent, 'Fixture.1080p.NF.WEB-DLSubDL★CC');
    env.globals.Menu.onKey(env.globals.Keys.ENTER);
    // Unzipping goes through streams, so wait for the cues rather than a fixed number of turns.
    for (var i = 0; i < 50 && !v.text; i++) await new Promise(function (done) { setTimeout(done, 5); });
    assert.equal(v.text, 'Hello');
    v.player.stop();
});

test('#52 a SubDL key is one row: OK opens Test, Change and Remove, and the row shows the test result', async function () {
    var calls = [];
    var env = fixture(function (url) {
        calls.push(url);
        return json({}, 403);
    });
    var api = env.globals;
    var row = api.OpenSubsSettings.rows.filter(function (entry) { return entry.action === 'opensubs-subdl-key'; })[0];
    var opensubs = api.OpenSubsSettings.rows.filter(function (entry) { return entry.action === 'opensubs-key'; })[0];
    assert.equal(row.text(), 'Not set');
    assert.equal(row.hint, '');
    api.Prefs.set('subdlApiKey', 'subdl-key');
    assert.equal(row.text(), '••••');
    assert.equal(row.hint, 'OK: test, change or remove');
    var toasts = [];
    var hooks = { toast: function (text) { toasts.push(text); } };
    // OK on the set key opens its choices; Test is first.
    api.OpenSubsSettings.act('opensubs-subdl-key', hooks, function () {});
    assert.equal(env.menu.children.map(function (child) { return child.textContent; }).join('|'), 'SubDL API key|Test key|Change key…|Remove key|Cancel');
    api.Menu.onKey(api.Keys.ENTER);
    assert.equal(row.text(), '•••• · Checking…');
    await new Promise(setImmediate);
    await new Promise(setImmediate);
    assert.equal(row.text(), '•••• · Bad SubDL key');
    assert.equal(toasts[toasts.length - 1], 'Bad SubDL key');
    assert.equal(opensubs.text(), 'Not set');
    assert.ok(calls[0].startsWith('https://api.subdl.com/'));
    // Remove is the third choice.
    api.OpenSubsSettings.act('opensubs-subdl-key', hooks, function () {});
    api.Menu.onKey(api.Keys.DOWN);
    api.Menu.onKey(api.Keys.DOWN);
    api.Menu.onKey(api.Keys.ENTER);
    assert.equal(api.Prefs.get('subdlApiKey'), '');
    assert.equal(toasts[toasts.length - 1], 'Key removed');
    assert.equal(row.text(), 'Not set');
});

test('SubDL "can\'t find" is no results, and a title unknown by id is asked again by its Latin name', async function () {
    var asked = [];
    var env = fixture(function (url) {
        asked.push(url.split('&').slice(1).join('&'));
        if (/tmdb_id/.test(url)) return json({ status: false, error: "can't find movie or tv" });
        return json({ status: true, subtitles: [{ release_name: 'Love.Is.Blind.Habibi.S01E01', url: '/subtitle/777-888.zip', episode: 1 }] });
    });
    env.globals.Prefs.set('subdlApiKey', 'subdl-key');
    var matches = await env.globals.SubDL.search({ tmdb_id: 99, title: 'Love is blind, Habibi- الحب أعمى حبيبي', season: 1, episode: 1 }, 'en');
    assert.equal(asked.length, 2);
    assert.equal(asked[1], 'episode_number=1&film_name=Love%20is%20blind%2C%20Habibi&languages=EN&season_number=1&subs_per_page=30&type=tv');
    assert.equal(matches.length, 1);
    assert.equal(matches[0].file_id, 'subdl:777-888');
    // Not found by name either: an empty list, not a connection error.
    env = fixture(function () { return json({ status: false, error: "can't find movie or tv" }); });
    env.globals.Prefs.set('subdlApiKey', 'subdl-key');
    assert.equal((await env.globals.SubDL.search({ title: 'Nothing Here' }, 'en')).length, 0);
    assert.equal(env.globals.SubDL.name('AR - Love Is Blind, Habibi'), 'Love Is Blind, Habibi');
});

test('SubDL asks by id, then by TMDB\'s name, then by the provider\'s own title', async function () {
    var asked = [];
    var env = fixture(function (url) {
        var query = url.split('&').slice(1).join('&');
        asked.push(query);
        if (/film_name=Habibi%20Love&/.test(query)) return json({ status: true, subtitles: [{ release_name: 'Habibi.Love.S01E01', url: '/subtitle/1-2.zip', episode: 1 }] });
        return json({ status: false, error: "can't find movie or tv" });
    });
    env.globals.Prefs.set('subdlApiKey', 'subdl-key');
    var matches = await env.globals.SubDL.search({ tmdb_id: 99, title: 'Love Is Blind, Habibi', providerTitle: 'AR - Habibi Love- حبيبي', season: 1, episode: 1 }, 'en');
    assert.equal(asked.length, 3);
    assert.ok(/tmdb_id=99/.test(asked[0]));
    assert.ok(/film_name=Love%20Is%20Blind%2C%20Habibi/.test(asked[1]));
    assert.ok(/film_name=Habibi%20Love&/.test(asked[2]));
    assert.equal(matches[0].file_id, 'subdl:1-2');
});

test('a season pack plays the episode\'s own file, and never another episode when it has none', async function () {
    var pack = zip([
        { name: 'Love.Is.Blind.Habibi.S01E01.srt', data: FILE.replace('Hello', 'One') },
        { name: 'Love.Is.Blind.Habibi.S01E02.srt', data: FILE.replace('Hello', 'Two') },
    ]);
    var env = fixture(function () { return binary(pack); });
    // The id alone is enough: a saved choice reopens without the search's match.
    var two = await env.globals.SubDL.download('subdl:333-444#s1e2');
    assert.ok(two.text.includes('Two'));
    await assert.rejects(env.globals.SubDL.download('subdl:333-444#s1e3'), function (error) { return error.code === 'badFile'; });
});
