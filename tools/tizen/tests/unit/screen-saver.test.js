'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var load = require('./sandbox');

// A fake clock and DOM: enough to see which timers exist and what is drawn.
function scene(options) {
    var timers = [];
    var keys = [];
    var renders = [];
    var samsung = [];
    var prefs = { screenSaverMs: options.ms, screenSaverKind: options.kind };
    var motion = options.motion || 'on';
    var prefListeners = [];
    var nextId = 1;
    function addTimer(fn, ms, repeat) {
        var timer = { id: nextId++, fn: fn, ms: ms, repeat: repeat };
        timers.push(timer);
        return timer.id;
    }
    function clear(id) {
        timers = timers.filter(function (timer) { return timer.id !== id; });
    }
    var body = { children: [], appendChild: function (node) { this.children.push(node); } };
    var env = load(['screen-saver.js'], {}, {
        setTimeout: function (fn, ms) { return addTimer(fn, ms, false); },
        clearTimeout: clear,
        setInterval: function (fn, ms) { return addTimer(fn, ms, true); },
        clearInterval: clear,
        addEventListener: function (name, fn, capture) { keys.push({ name: name, fn: fn, capture: capture }); },
        document: {
            hidden: false,
            body: body,
            documentElement: { getAttribute: function () { return motion; } },
            addEventListener: function () {},
            createElement: function () {
                return { remove: function () { body.children.splice(body.children.indexOf(this), 1); } };
            },
        },
        UI: { html: function () { return 'view'; }, img: function () { return 'img'; }, render: function (view) { renders.push(view); }, clear: function () {} },
        Prefs: {
            get: function (name) { return prefs[name]; },
            onChange: function (listener) { prefListeners.push(listener); },
        },
        Art: { preload: function () {} },
        Log: { info: function () {} },
        webapis: { appcommon: {
            AppCommonScreenSaverState: { SCREEN_SAVER_OFF: 0, SCREEN_SAVER_ON: 1 },
            setScreenSaver: function (state) { samsung.push(state); },
        } },
    }).globals;
    var allowed = options.allowed === undefined ? true : options.allowed;
    var slidesAsked = 0;
    var saver = env.ScreenSaver({
        allowed: function () { return allowed; },
        slides: function () { slidesAsked++; return options.slides || []; },
    });
    function press() {
        var event = { keyCode: 13, prevented: false, stopped: false, preventDefault: function () { this.prevented = true; }, stopImmediatePropagation: function () { this.stopped = true; } };
        keys.filter(function (k) { return k.name === 'keydown'; }).forEach(function (k) { k.fn(event); });
        return event;
    }
    function elapse(kind) {
        var timer = timers.filter(function (t) { return t.repeat === (kind === 'slide'); })[0];
        if (!timer.repeat) clear(timer.id);
        timer.fn();
    }
    return {
        env: env,
        saver: saver,
        press: press,
        elapse: elapse,
        timers: function () { return timers; },
        renders: renders,
        samsung: samsung,
        body: body,
        keys: keys,
        allow: function (value) { allowed = value; },
        slidesAsked: function () { return slidesAsked; },
        setKind: function (value) { prefs.screenSaverKind = value; prefListeners.forEach(function (l) { l('screenSaverKind'); }); },
        setPref: function (ms) { prefs.screenSaverMs = ms; prefListeners.forEach(function (l) { l('screenSaverMs'); }); },
    };
}

test('#61 a key press only re-arms the one idle timeout; nothing is drawn until it fires', function () {
    var s = scene({ ms: 600000 });
    assert.equal(s.timers().length, 1);
    assert.equal(s.timers()[0].ms, 600000);
    for (var i = 0; i < 50; i++) {
        var event = s.press();
        assert.equal(event.prevented, false);
        assert.equal(event.stopped, false);
    }
    assert.equal(s.timers().length, 1);
    assert.equal(s.renders.length, 0);
    assert.equal(s.slidesAsked(), 0);
    assert.equal(s.keys[0].capture, true);
    // Samsung's own screen saver is off while ours is on.
    assert.deepEqual(s.samsung, [0]);
});

test('#61 it waits while playback is not idle, starts when allowed, and the waking key does nothing else', function () {
    var s = scene({ ms: 300000, allowed: false, slides: [{ from: 'Continue watching', title: 'A', meta: '', image: 'a.jpg', wide: true }] });
    s.elapse('idle');
    assert.equal(s.saver.isOn(), false);
    assert.equal(s.timers().length, 1);
    s.allow(true);
    s.elapse('idle');
    assert.equal(s.saver.isOn(), true);
    assert.equal(s.slidesAsked(), 1);
    assert.equal(s.body.children.length, 1);
    // One slide timer while it shows, no idle timer.
    assert.deepEqual(s.timers().map(function (t) { return t.repeat; }), [true]);
    s.elapse('slide');
    assert.equal(s.renders.length, 2);
    var event = s.press();
    assert.equal(event.prevented, true);
    assert.equal(event.stopped, true);
    assert.equal(s.saver.isOn(), false);
    assert.equal(s.body.children.length, 0);
    assert.deepEqual(s.timers().map(function (t) { return t.repeat; }), [false]);
});

test('#61 Off keeps no timer and hands the screen back to Samsung; choosing a time turns ours on', function () {
    var s = scene({ ms: 0 });
    assert.equal(s.timers().length, 0);
    s.press();
    assert.equal(s.timers().length, 0);
    assert.deepEqual(s.samsung, [1]);
    s.setPref(900000);
    assert.equal(s.timers().length, 1);
    assert.equal(s.timers()[0].ms, 900000);
    assert.deepEqual(s.samsung, [1, 0]);
});

test('#61 slides come from Continue watching, favorites and recently added, once each, with what the app holds', function () {
    var env = load(['screen-saver.js']).globals;
    var movie = function (n, extra) { return Object.assign({ name: 'Movie ' + n, stream_id: n, stream_icon: 'p' + n + '.jpg' }, extra); };
    var rows = [
        { id: 'live', title: 'Live', entries: [{ section: 'live', item: { name: 'Channel', stream_id: 1, stream_icon: 'c.png' } }] },
        { id: 'new-movies', title: 'Recently added movies', entries: [{ section: 'movies', item: movie(3) }, { section: 'movies', item: movie(1) }] },
        { id: 'continue', title: 'Continue watching', entries: [
            { section: 'movies', item: movie(1) },
            { section: 'series', item: { show: { name: 'Show 4', series_id: 4, cover: 's4.jpg' }, episode: { label: 'S1  E2' } } },
        ] },
        { id: 'fav-movies', title: 'Favorite movies', entries: [{ section: 'movies', item: movie(2, { stream_icon: '' }) }] },
    ];
    var details = {
        1: { backdrop: 'b1.jpg', year: '2008', genre: 'Action, Crime, Drama' },
        4: { poster: 's4-big.jpg', year: '2019', genre: 'Mystery' },
    };
    // Plain copies: the sandbox's arrays come from another realm.
    var slides = JSON.parse(JSON.stringify(env.ScreenSaver.slides(rows, {
        details: function (entry) { return details[(entry.item.show || entry.item).series_id || entry.item.stream_id] || null; },
        progress: function (entry) { return entry.section === 'movies' ? { position: 600, duration: 4920 } : null; },
    })));
    assert.deepEqual(slides.map(function (s) { return s.title; }), ['Movie 1', 'Show 4', 'Movie 3']);
    assert.deepEqual(slides[0], { from: 'Continue watching', title: 'Movie 1', meta: '2008 · Action, Crime · 72 min left', image: 'b1.jpg', wide: true });
    assert.deepEqual(slides[1], { from: 'Continue watching', title: 'Show 4', meta: 'S1 E2 · 2019 · Mystery', image: 's4-big.jpg', wide: false });
    // Recently added shows no time left; a title with no artwork is left out.
    assert.deepEqual(slides[2], { from: 'Recently added movies', title: 'Movie 3', meta: '', image: 'p3.jpg', wide: false });
});

test('#61 at most forty slides', function () {
    var env = load(['screen-saver.js']).globals;
    var entries = [];
    for (var i = 0; i < 60; i++) entries.push({ section: 'movies', item: { name: 'M' + i, stream_id: i, stream_icon: i + '.jpg' } });
    var slides = env.ScreenSaver.slides([{ id: 'new-movies', title: 'New', entries: entries }], { details: function () { return null; }, progress: function () { return null; } });
    assert.equal(slides.length, 40);
});

test('#74 Logo and clock waits like the slideshow, asks for no titles, draws on a clock timer, and swaps on another', function () {
    var s = scene({ ms: 300000, kind: 'logo', allowed: false });
    s.elapse('idle');
    assert.equal(s.saver.isOn(), false);
    s.allow(true);
    s.elapse('idle');
    assert.equal(s.saver.isOn(), true);
    assert.equal(s.slidesAsked(), 0);
    assert.deepEqual(s.timers().map(function (t) { return t.ms; }), [20000, 120000]);
    var event = s.press();
    assert.equal(event.prevented, true);
    assert.equal(event.stopped, true);
    assert.equal(s.saver.isOn(), false);
    assert.deepEqual(s.timers().map(function (t) { return t.ms; }), [300000]);
});

test("#74 an unknown stored kind is the slideshow; the TV's own never starts ours", function () {
    var s = scene({ ms: 300000, kind: 'sparkles' });
    s.elapse('idle');
    assert.equal(s.slidesAsked(), 1);
    assert.deepEqual(s.timers().map(function (t) { return t.ms; }), [20000]);
    var tv = scene({ ms: 300000, kind: 'tv' });
    assert.equal(tv.timers().length, 0);
    assert.deepEqual(tv.samsung, [1]);
});

test('#74 every two minutes the group leaves, then returns as the next variant; with Animations Off it swaps at once', function () {
    var s = scene({ ms: 300000, kind: 'logo' });
    s.elapse('idle');
    var views = s.renders.length;
    s.timers().filter(function (t) { return t.ms === 120000; })[0].fn();
    assert.equal(s.renders.length, views + 1);
    var leave = s.timers().filter(function (t) { return t.ms === 1200; })[0];
    assert.ok(leave);
    leave.fn();
    assert.equal(s.renders.length, views + 2);
    var off = scene({ ms: 300000, kind: 'logo', motion: 'off' });
    off.elapse('idle');
    var offViews = off.renders.length;
    off.timers().filter(function (t) { return t.ms === 120000; })[0].fn();
    assert.equal(off.renders.length, offViews + 1);
    assert.equal(off.timers().filter(function (t) { return t.ms === 1200; }).length, 0);
});

test('#74 the logo group rests off centre by at most a twentieth of the screen', function () {
    var env = load(['screen-saver.js']).globals;
    var screen = { w: 1920, h: 1080 };
    var top = 1 - Number.EPSILON;
    [0, 0.0001, 0.25, 0.5, 0.9999, top].forEach(function (a) {
        [0, 0.5, top].forEach(function (b) {
            var seq = [a, b];
            var off = env.ScreenSaver.offset(function () { return seq.shift(); }, screen, 0.05);
            assert.ok(Math.abs(off.x) <= 96, 'x ' + off.x);
            assert.ok(Math.abs(off.y) <= 54, 'y ' + off.y);
        });
    });
    var mid = env.ScreenSaver.offset(function () { return 0.5; }, screen, 0.05);
    assert.deepEqual([mid.x, mid.y], [0, 0]);
    var low = env.ScreenSaver.offset(function () { return 0; }, screen, 0.05);
    assert.deepEqual([low.x, low.y], [-96, -54]);
});