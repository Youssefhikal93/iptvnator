'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var load = require('./sandbox');
var uiSandbox = require('./ui-sandbox');

// Only the DOM, media engine and clock are substituted; player modules run together.
function element() {
    var node = { className: '', children: [], style: { setProperty: function () {} } };
    var text = '';
    node.classList = {
        contains: function (name) { return node.className.split(' ').indexOf(name) >= 0; },
        add: function () {
            Array.from(arguments).forEach(function (name) {
                if (!node.classList.contains(name)) node.className += ' ' + name;
            });
        },
        remove: function () {
            var names = Array.from(arguments);
            node.className = node.className.split(' ').filter(function (name) { return names.indexOf(name) < 0; }).join(' ');
        },
        toggle: function (name, force) {
            if (force === undefined) force = !node.classList.contains(name);
            node.classList[force ? 'add' : 'remove'](name);
        },
    };
    Object.defineProperty(node, 'textContent', {
        get: function () { return text + node.children.map(function (child) { return child.textContent; }).join(''); },
        set: function (next) { text = next; node.children = []; },
    });
    node.appendChild = function (child) { node.children.push(child); };
    node.setAttribute = function () {};
    node.removeAttribute = function () {};
    node.addEventListener = function () {};
    node.querySelector = function () { return null; };
    node.focus = node.blur = function () {};
    return node;
}

function scene(settings, Hls) {
    var nodes = {};
    var intervals = {};
    var serial = 0;
    var now = 10000;
    function get(id) {
        if (!nodes[id]) nodes[id] = element();
        return nodes[id];
    }
    var video = get('video');
    video.currentTime = 60;
    video.duration = 600;
    video.textTracks = [];
    video.textTracks.addEventListener = function () {};
    video.pause = function () { video.paused = true; };
    video.play = function () {
        video.paused = false;
        if (video.onplaying) video.onplaying();
        return Promise.resolve();
    };
    video.load = function () {};
    var env = load([
        'keys.js', 'settings-store.js', 'progress.js', 'log.js', 'focus.js', 'kit.js', 'menu.js',
        'subtitle-file.js', 'subtitle-rank.js', 'open-timing.js', 'movie-hash.js', 'media-sniff.js', 'subtitle-store.js', 'subtitle-download.js',
        'player-resume.js', 'player-epg.js', 'player-freeze.js', 'playback-chain.js', 'player-tracks.js', 'player-reconnect.js',
        'sleep-timer.js', 'player-sleep.js', 'intro-marks.js', 'player-series.js', 'player-picture.js', 'player-menu.js', 'zap-banner.js', 'stream-info.js', 'audio-choice.js', 'language-choice.js', 'player.js',
    ], { 'iptvnator-tv:settings': JSON.stringify(settings || {}) }, {
        Hls: Hls,
        UI: uiSandbox.UI,
        document: {
            body: element(),
            getElementById: get,
            createElement: element,
            createTextNode: function (text) { var node = element(); node.textContent = text; return node; },
            querySelector: function (selector) { return selector === '#pl-controls .pl-top' ? get('top') : null; },
            addEventListener: function () {},
        },
        addEventListener: function () {},
        innerWidth: 1920,
        innerHeight: 1080,
        // The clock (#48) builds dates; the fake keeps them on the test's time.
        Date: Object.assign(function (when) { return new Date(when === undefined ? now : when); }, { now: function () { return now; } }),
        setTimeout: function () { return ++serial; },
        clearTimeout: function () {},
        setInterval: function (fn, ms) { intervals[++serial] = { fn: fn, ms: ms }; return serial; },
        clearInterval: function (id) { delete intervals[id]; },
        console: { log: function () {} },
        fetch: function () { return Promise.resolve(); },
    });
    return {
        player: env.globals.Player,
        keys: env.globals.Keys,
        video: video,
        controls: get('pl-controls'),
        hint: get('pl-hint'),
        banner: function () { return get('player').children.find(function (node) { return node.id === 'pl-banner'; }); },
        request: function (live) { return { live: live, title: 'Fixture', sources: [{ via: 'video', url: 'https://example.test/fixture' }] }; },
        tick: function () {
            now += 6000;
            Object.keys(intervals).forEach(function (id) { if (intervals[id].ms === 500) intervals[id].fn(); });
        },
    };
}

test('#37 Return hides movie, episode and live controls before allowing close, while Stop passes through', async function () {
    for (var kind of ['movie', 'episode', 'live']) {
        var s = scene();
        var request = s.request(kind === 'live');
        if (kind === 'episode') request.episodes = { items: [{ label: 'Episode 1' }], index: 0 };
        await s.player.play(request, null);
        assert.equal(s.controls.classList.contains('hidden'), false);
        // Live lists its keys; movies and shows keep a plain bar.
        assert.ok(kind === 'live' ? s.hint.textContent.indexOf('ReturnHide') >= 0 : s.hint.textContent === '');
        assert.equal(s.player.key(s.keys.RETURN, request.live), true);
        assert.equal(s.controls.classList.contains('hidden'), true);
        assert.equal(s.video.paused, false);
        assert.equal(s.player.isOpen(), true);
        assert.ok(kind === 'live' ? s.hint.textContent.indexOf('ReturnClose') >= 0 : s.hint.textContent === '');
        assert.equal(s.player.key(s.keys.RETURN, request.live), false);
        s.player.key(s.keys.ENTER, request.live);
        assert.equal(s.controls.classList.contains('hidden'), false);
        assert.equal(s.player.key(s.keys.STOP, request.live), false);
    }
});

test('#60 HTML and hls.js apply preferences at playback start without replacing later viewer choices', async function () {
    function Hls() {
        Hls.instance = this;
        this.audioTracks = [{ lang: 'ara' }, { lang: 'eng' }];
        this.audioTrack = 0;
        this.subtitleTracks = [{ lang: 'en-GB' }];
        this.subtitleTrack = -1;
    }
    Hls.isSupported = function () { return true; };
    Hls.Events = { ERROR: 'error' };
    ['on', 'loadSource', 'attachMedia', 'destroy'].forEach(function (method) { Hls.prototype[method] = function () {}; });
    for (var engine of ['video', 'hls']) {
        var s = scene({ preferredSound: 'en', preferredSubtitles: { language: 'en', when: 'always' } }, Hls);
        s.video.audioTracks = [{ language: 'ara', enabled: true }, { language: 'eng', enabled: false }];
        s.video.textTracks.push({ kind: 'subtitles', language: 'en-GB', mode: 'disabled' });
        var request = s.request(false);
        request.sources[0].via = engine;
        await s.player.play(request, null);
        if (engine === 'video') {
            assert.equal(s.video.audioTracks[1].enabled, true);
            assert.equal(s.video.audioTracks[0].enabled, false);
            assert.equal(s.video.textTracks[0].mode, 'showing');
            s.video.textTracks[0].mode = 'disabled';
        } else {
            assert.equal(Hls.instance.audioTrack, 1);
            assert.equal(Hls.instance.subtitleTrack, 0);
            Hls.instance.subtitleTrack = -1;
        }
        s.tick();
        s.player.key(s.keys.ENTER, false);
        assert.equal(engine === 'video' ? s.video.textTracks[0].mode : Hls.instance.subtitleTrack, engine === 'video' ? 'disabled' : -1);
    }
});

test('#37 hidden paused controls stay hidden across ticks; normal keys restore them', async function () {
    var s = scene();
    await s.player.play(s.request(false), null);
    s.player.key(s.keys.PAUSE, false);
    for (var code of [s.keys.RIGHT, s.keys.ENTER, s.keys.PLAY_PAUSE]) {
        assert.equal(s.player.key(s.keys.ESCAPE, false), true);
        s.tick();
        assert.equal(s.video.paused, true);
        assert.equal(s.controls.classList.contains('hidden'), true);
        assert.equal(s.player.key(code, false), true);
        assert.equal(s.controls.classList.contains('hidden'), false);
        s.player.key(s.keys.PAUSE, false);
    }
    assert.equal(s.player.key(s.keys.BACKSPACE, false), true);
    assert.equal(s.player.key(s.keys.BACKSPACE, false), false);
});

test('#37 live zapping and fullscreen show controls again; preview Return still passes through', async function () {
    var s = scene();
    await s.player.play(s.request(true), null);
    s.tick();
    assert.equal(s.player.key(s.keys.RETURN, true), false);
    await s.player.play(s.request(true), null);
    assert.equal(s.player.key(s.keys.RETURN, true), true);
    s.player.preview({ x: 0, y: 0, w: 640, h: 360 });
    assert.equal(s.player.key(s.keys.RETURN, true), false);
    s.player.fullscreen();
    assert.equal(s.player.key(s.keys.RETURN, true), true);
    assert.equal(s.player.key(s.keys.RETURN, true), false);
});

test('#79 a zap shows the channel banner instead of the controls; OK opens them, Return hides it and passes through', async function () {
    var s = scene();
    var zapped = Object.assign(s.request(true), { zapped: true, banner: { name: 'Fixture', num: 3, logo: '' } });
    await s.player.play(zapped, null);
    var banner = s.banner();
    assert.equal(s.controls.classList.contains('hidden'), true);
    assert.equal(banner.classList.contains('hidden'), false);
    assert.equal(s.player.key(s.keys.ENTER, true), true);
    assert.equal(banner.classList.contains('hidden'), true);
    assert.equal(s.controls.classList.contains('hidden'), false);
    await s.player.play(Object.assign({}, zapped), null);
    assert.equal(banner.classList.contains('hidden'), false);
    assert.equal(s.player.key(s.keys.RETURN, true), false);
    assert.equal(banner.classList.contains('hidden'), true);
    assert.equal(s.controls.classList.contains('hidden'), true);
    // The first start of a channel keeps the full controls.
    await s.player.play(s.request(true), null);
    assert.equal(banner.classList.contains('hidden'), true);
    assert.equal(s.controls.classList.contains('hidden'), false);
});