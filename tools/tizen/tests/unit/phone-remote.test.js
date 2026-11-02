'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { Sessions, TTL } = require('../../tv-app/service/remote-session');
const Page = require('../../tv-app/service/remote-page');
const service = require('../../tv-app/service/phone-remote');

function store(t) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jotv-remote-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    return path.join(dir, 'pairings.json');
}

test('a ten-minute code is single-use; opening another invalidates it (#93)', () => {
    let now = 1000;
    const sessions = Sessions({ now: () => now });
    const first = sessions.open();
    assert.equal(first.ttl, TTL);
    const second = sessions.open();
    assert.equal(sessions.pair(first.code, 'Old').status, 404);
    now += TTL - 1;
    const paired = sessions.pair(second.code, 'Android');
    assert.equal(paired.status, 200);
    assert.match(paired.key, /^[a-f0-9]{64}$/);
    assert.equal(sessions.pair(second.code, 'Again').status, 404);
    const expired = sessions.open();
    now += TTL;
    assert.equal(sessions.pair(expired.code, 'Late').status, 404);
});

test('the code is six typeable letters, any case, and ten wrong guesses close it (#93)', () => {
    const sessions = Sessions({});
    const opened = sessions.open();
    assert.match(opened.code, /^[A-HJ-NP-Z2-9]{6}$/);
    assert.equal(sessions.pair(opened.code.toLowerCase(), 'Phone').status, 200);
    const next = sessions.open();
    for (let n = 0; n < 10; n++) assert.equal(sessions.pair('AAAAAA', 'Guess').status, 404);
    assert.equal(sessions.pair(next.code, 'Late').status, 404);
});

test('five phones survive restart; a sixth is refused, forget revokes and frees a slot (#93)', t => {
    const file = store(t);
    let sessions = Sessions({ file });
    const keys = Array.from({ length: 5 }, (_, n) => sessions.pair(sessions.open().code, 'Phone ' + n).key);
    assert.equal(new Set(keys).size, 5);
    const sixth = sessions.open();
    assert.deepEqual(sessions.pair(sixth.code, 'Sixth'), { status: 409, error: 'limit' });
    sessions = Sessions({ file });
    keys.forEach(key => assert.equal(sessions.check(key), true));
    assert.equal(JSON.stringify(sessions.list()).includes(keys[0]), false);
    sessions.rename(sessions.list()[0].id, 'Kitchen');
    assert.equal(Sessions({ file }).list()[0].name, 'Kitchen');
    sessions.forget(sessions.list()[0].id);
    assert.equal(sessions.check(keys[0]), false);
    assert.equal(sessions.pair(sessions.open().code, 'Sixth').status, 200);
    sessions.forget('all');
    assert.deepEqual(Sessions({ file }).list(), []);
});

test('last-used changes are persisted without changing the phone key', t => {
    let now = 1000;
    const file = store(t);
    const sessions = Sessions({ file, now: () => now });
    const paired = sessions.pair(sessions.open().code, 'Phone');
    now += 61000;
    sessions.touch(paired.key);
    assert.equal(Sessions({ file }).list()[0].lastUsed, now);
    assert.equal(Sessions({ file }).check(paired.key), true);
});

test('page builder escapes TV words and metadata, preserves RTL and allows only known accents', () => {
    const html = Page.build({ dir: 'rtl', lang: 'ar" onload="bad', accent: 'saffron', words: { title: '<img src=x onerror=bad>', closedText: '</script><script>bad()</script>', remote: '<b>word</b>' } });
    assert.match(html, /dir="rtl"/);
    assert.match(html, /data-accent="saffron"/);
    assert.match(html, /&lt;img src=x onerror=bad&gt;/);
    assert.match(html, /\\u003c\/script\\u003e/);
    assert.ok(!html.includes('<script>bad()'));
    assert.ok(!html.includes('lang="ar" onload='));
    assert.ok(!/src="https?:|<link[^>]+href="(?!\/)|@import/.test(html));
    assert.match(Page.csp, /script-src 'sha256-/);
    assert.match(Page.csp, /frame-ancestors 'none'/);
    assert.ok(!Page.build({ accent: '" onload="bad' }).includes('data-accent=""'));
});

test('the page script matches its CSP hash the way a browser reads it, even from a CRLF checkout', () => {
    const script = Page.build({}).match(/<script>([\s\S]*?)<\/script><\/body>/)[1];
    // HTML parsing turns CRLF into LF before the browser hashes the script.
    const seen = require('crypto').createHash('sha256').update(script.replace(/\r\n?/g, '\n'), 'utf8').digest('base64');
    assert.ok(Page.csp.includes("'sha256-" + seen + "'"));
});

const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../tv-app/js/remote-context.js'), 'utf8'), context);
const mapping = { episode: ['next', 'skip', 'subtitles', 'audio'], film: ['subtitles', 'audio', 'sync', 'speed'], live: ['startover', 'lastch', 'channels', 'subtitles'], details: ['play', 'trailer', 'favourite'], saver: ['wake'], home: [] };
for (const [screen, expected] of Object.entries(mapping)) {
    test('context actions for ' + screen + ' exclude unavailable actions', () => {
        const all = Object.values(mapping).flat();
        const offered = Object.fromEntries(all.map(id => [id, { label: id, run() {} }]));
        const select = () => Array.from(context.window.RemoteContext.select(screen, offered), action => action.id);
        assert.deepEqual(select(), expected);
        delete offered[expected[0]];
        assert.deepEqual(select(), expected.slice(1));
    });
}

async function start(t) {
    service.hooks.ip = () => '127.0.0.1';
    service.start(0, { file: store(t) });
    t.after(() => service.stop());
    while (!service.port()) await new Promise(resolve => setTimeout(resolve, 5));
    const base = 'http://127.0.0.1:' + service.port();
    return async (route, request, key, extra, options) => fetch(base + route, { method: request ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + (key || ''), ...extra }, body: request ? JSON.stringify(request) : undefined, ...options });
}

test('the page offers a home-screen icon and a manifest named after the TV words', async t => {
    const call = await start(t);
    await call('/app/state', { online: true, words: { title: 'Jotv remote' } });
    const html = await (await call('/')).text();
    assert.match(html, /rel="apple-touch-icon" href="\/icon-180.png"/);
    for (const route of ['/icon-180.png', '/icon-512.png']) {
        const icon = await call(route);
        assert.equal(icon.headers.get('content-type'), 'image/png');
        assert.deepEqual([...new Uint8Array(await icon.arrayBuffer()).slice(1, 4)], [80, 78, 71]);
    }
    const manifest = await (await call('/manifest.webmanifest')).json();
    assert.equal(manifest.name, 'Jotv remote');
    assert.equal(manifest.start_url, undefined);
    assert.match(Page.csp, /img-src 'self'; manifest-src 'self'/);
});

test('unknown keys and cross-origin controls get 404; held requests deliver keys immediately (#93)', async t => {
    const call = await start(t);
    assert.equal((await call('/events?since=-1')).status, 404);
    assert.equal((await call('/command', { type: 'key', code: 38 }, 'unknown')).status, 404);
    assert.equal((await call('/app/pair', {}, '', { Origin: 'http://attacker.test' })).status, 404);
    await call('/app/state', { online: true, title: 'Home', actions: [] });
    const opened = await (await call('/app/pair', {})).json();
    assert.ok(opened.url.endsWith('/r/' + opened.code));
    const typed = await call('/r/' + opened.code.toLowerCase(), null, '', {}, { redirect: 'manual' });
    assert.equal(typed.headers.get('location'), '/#pair=' + opened.code);
    const paired = await (await call('/pair', { code: opened.code, name: 'Phone' })).json();
    assert.equal((await call('/pair', { code: opened.code })).status, 404);
    const initial = await (await call('/app/events?since=-1')).json();
    const waiting = call('/app/events?since=' + initial.revision);
    const sent = await call('/command', { type: 'key', code: 38 }, paired.key);
    assert.equal(sent.status, 200);
    assert.deepEqual((await (await waiting).json()).commands.map(entry => entry.command), [{ type: 'key', code: 38 }]);
    assert.equal((await call('/command', { type: 'key', code: 999999 }, paired.key)).status, 400);
    assert.equal((await call('/command', { type: 'context', action: 'skip' }, paired.key)).status, 400);
    const current = await (await call('/events?since=-1', null, paired.key)).json();
    const held = call('/events?since=' + current.revision, null, paired.key);
    await new Promise(resolve => setTimeout(resolve, 20));
    const phones = await (await call('/app/phones')).json();
    await call('/app/forget', { id: phones[0].id });
    assert.equal((await held).status, 404);
    assert.equal((await call('/command', { type: 'key', code: 38 }, paired.key)).status, 404);
});

test('every paired phone receives state independently and closed state refuses commands', async t => {
    const call = await start(t);
    const keys = [];
    for (let n = 0; n < 2; n++) {
        const opened = await (await call('/app/pair', {})).json();
        keys.push((await (await call('/pair', { code: opened.code, name: 'Phone' })).json()).key);
    }
    await call('/app/state', { online: true, title: 'Film' });
    const current = await Promise.all(keys.map(key => call('/events?since=-1', null, key).then(r => r.json())));
    const pending = keys.map((key, n) => call('/events?since=' + current[n].revision, null, key));
    await call('/app/state', { online: false });
    const updates = await Promise.all(pending.map(p => p.then(r => r.json())));
    assert.deepEqual(updates.map(update => update.state.online), [false, false]);
    assert.equal((await call('/command', { type: 'key', code: 38 }, keys[0])).status, 409);
});

test('explicit Last channel works when startup is Home and resolves the current catalogue (#93)', async () => {
    const g = require('./sandbox')(['settings-store.js', 'library.js', 'live-channels.js']).globals;
    const saved = { stream_id: 7, name: 'Old name' };
    const current = { stream_id: 7, name: 'Current name' };
    g.Library.setLastChannel('source', saved);
    g.Prefs.set('onStart', 'home');
    const live = g.LiveChannels({ channels: () => Promise.resolve([current]) });
    assert.equal(await live.last('source'), null);
    assert.equal(await live.last('source', true), current);
});

test('search and Favorites follow playing or detail content even when opened from Home (#93)', () => {
    const section = context.window.RemoteContext.section;
    for (const [browser, playing, expected] of [
        [{ section: 'home' }, { live: true }, 'live'],
        [{ section: 'home' }, { episodes: {} }, 'series'],
        [{ section: 'home' }, {}, 'movies'],
        [{ section: 'home', detail: { section: 'movies' } }, null, 'movies'],
        [{ section: 'home', detail: { section: 'series' } }, null, 'series'],
        [{ section: 'live' }, null, 'live'],
        [{ section: 'settings' }, null, 'settings'],
    ]) assert.equal(section(browser, playing), expected);
});

test('a browser without the service probes once and does not poll during browsing (#93)', async () => {
    const requests = [];
    const timers = [];
    const g = require('./sandbox')(['phone-remote.js'], {}, {
        fetch: url => { requests.push(new URL(url).pathname); return Promise.reject(new Error('Service absent')); },
        document: { activeElement: null, documentElement: { getAttribute: () => 'blue' }, addEventListener() {}, body: {} },
        MutationObserver: function () { this.observe = function () {}; },
        setTimeout: (fn, ms) => { timers.push(ms); return 0; },
        setInterval: (fn, ms) => { timers.push(ms); return 0; },
    }).globals;
    g.PhoneRemote.start({ state: () => ({ title: 'Home' }), command() {} });
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(requests, ['/app/phones']);
    assert.deepEqual(timers, []);
});

test('volume keys use Tizen TVAudioControl, including mute toggle and volume unmute (#93)', () => {
    let volume = 50;
    let muted = false;
    const shown = [];
    const g = require('./sandbox')(['keys.js', 'remote-app.js'], {}, {
        VolumeOsd: { show: (level, mute) => shown.push([level, mute]) },
        document: { hidden: false, activeElement: null, addEventListener() {}, dispatchEvent() { return true; } },
        KeyboardEvent: function (type, options) { this.keyCode = options.keyCode; },
        tizen: { tvaudiocontrol: {
            getVolume: () => volume,
            isMute: () => muted,
            setMute: next => { muted = next; },
            setVolumeUp: () => { volume++; muted = false; },
            setVolumeDown: () => { volume--; muted = false; },
        } },
    }).globals;
    const remote = g.RemoteApp({});
    remote.command({ type: 'key', code: 447 });
    assert.equal(volume, 51);
    assert.deepEqual(shown.pop(), [51, false]);
    remote.command({ type: 'key', code: 449 });
    assert.equal(muted, true);
    remote.command({ type: 'key', code: 448 });
    assert.equal(volume, 50);
    assert.equal(muted, false);
    remote.command({ type: 'key', code: 449 });
    remote.command({ type: 'key', code: 449 });
    assert.equal(muted, false);
    assert.match(fs.readFileSync(path.join(__dirname, '../../tv-app/config.xml'), 'utf8'), /privilege name="http:\/\/tizen.org\/privilege\/tv.audio"/);
});

test('an abruptly closed TV command connection reports offline and cannot replay keys on reconnect (#93)', async t => {
    const call = await start(t);
    await call('/app/state', { online: true });
    const opened = await (await call('/app/pair', {})).json();
    const paired = await (await call('/pair', { code: opened.code, name: 'Phone' })).json();
    const appUpdate = await (await call('/app/events?since=-1')).json();
    const phoneUpdate = await (await call('/events?since=-1', null, paired.key)).json();
    const base = 'http://127.0.0.1:' + service.port();
    const controller = new AbortController();
    const appHeld = fetch(base + '/app/events?since=' + appUpdate.revision, { signal: controller.signal });
    let held = false;
    for (let n = 0; n < 20 && !held; n++) {
        held = (await call('/app/events?since=-1')).status === 409;
        if (!held) await new Promise(resolve => setTimeout(resolve, 5));
    }
    assert.equal(held, true);
    const phoneHeld = fetch(base + '/events?since=' + phoneUpdate.revision, { headers: { Authorization: 'Bearer ' + paired.key }, signal: AbortSignal.timeout(1000) });
    controller.abort();
    await assert.rejects(appHeld, { name: 'AbortError' });
    assert.equal((await (await phoneHeld).json()).state.online, false);
    assert.equal((await call('/command', { type: 'key', code: 38 }, paired.key)).status, 409);
    await call('/app/state', { online: true });
    assert.deepEqual((await (await call('/app/events?since=-1')).json()).commands, []);
});
