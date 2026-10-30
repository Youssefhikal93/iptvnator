'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var load = require('./sandbox');
var uiSandbox = require('./ui-sandbox');

var MIN = 60000;

// ZapBanner with the real Kit plate; timers and the Animations setting are the test's.
function banner(motion) {
    var timers = [];
    var env = load(['kit.js', 'zap-banner.js'], {}, {
        UI: uiSandbox.UI,
        Art: { seen: function () { return false; } },
        Avatars: {},
        setTimeout: function (run, ms) { timers.push({ run: run, ms: ms }); return timers.length; },
        clearTimeout: function () {},
        document: {
            addEventListener: function () {},
            documentElement: { getAttribute: function (name) { return name === 'data-motion' ? motion || null : null; } },
        },
    });
    return { ZapBanner: env.globals.ZapBanner, timers: timers };
}

function classes() {
    var set = new Set(['hidden']);
    return {
        add: function () { Array.from(arguments).forEach(function (c) { set.add(c); }); },
        remove: function () { Array.from(arguments).forEach(function (c) { set.delete(c); }); },
        contains: function (c) { return set.has(c); },
    };
}

function texts(node, cls) {
    var found = [];
    (function walk(n) {
        if (n.className && n.className.split(' ').indexOf(cls) >= 0) found.push(n.textContent.trim());
        (n.children || []).forEach(walk);
    })(node);
    return found;
}

var channel = { name: 'Nordic News', num: 7, logo: '' };
var now = Date.UTC(2026, 9, 30, 12, 15);
var guide = {
    loading: false,
    now: { title: 'Morning Report', start: now - 15 * MIN, end: now + 45 * MIN },
    next: { title: 'Weather', start: now + 45 * MIN, end: now + 60 * MIN },
};

function render(ZapBanner, g, startOver) {
    return uiSandbox.toNodes(ZapBanner.view(channel, g, now, startOver))[0];
}

test('#79 the banner shows the plate, number, name, the programme on now with its progress, and the next one', function () {
    var ZapBanner = banner().ZapBanner;
    var node = render(ZapBanner, guide, false);
    assert.deepEqual(texts(node, 'zb-num'), ['7']);
    assert.deepEqual(texts(node, 'zb-name'), ['Nordic News']);
    assert.deepEqual(texts(node, 'plate'), ['Nordic News']);
    assert.deepEqual(texts(node, 'pl-epg-tag'), ['Now', 'Next']);
    assert.deepEqual(texts(node, 'pl-epg-title'), ['Morning Report', 'Weather']);
    assert.deepEqual(texts(node, 'pl-epg-left'), ['45 min left']);
    assert.equal(texts(node, 'pl-epg-time').length, 2);
    assert.equal(ZapBanner.progress(guide.now, now), 25);
    assert.deepEqual(texts(node, 'zb-empty'), []);
    assert.deepEqual(texts(node, 'zb-keys'), ['OKInfo']);
});

test('#79 a channel the guide knows nothing about says so; while the guide loads nothing is claimed', function () {
    var ZapBanner = banner().ZapBanner;
    var none = render(ZapBanner, { loading: false, now: null, next: null }, false);
    assert.deepEqual(texts(none, 'zb-empty'), ['No programme information']);
    assert.deepEqual(texts(none, 'pl-epg-row'), []);
    var loading = render(ZapBanner, { loading: true, now: null, next: null }, false);
    assert.deepEqual(texts(loading, 'zb-empty'), []);
});

test('#79 a catch-up channel with a programme on now offers Start over on the banner', function () {
    var ZapBanner = banner().ZapBanner;
    assert.deepEqual(texts(render(ZapBanner, guide, true), 'zb-keys'), ['OKInfo▶Start over']);
});

test('#79 the progress stays between 0 and 100', function () {
    var ZapBanner = banner().ZapBanner;
    assert.equal(ZapBanner.progress({ start: now + MIN, end: now + 2 * MIN }, now), 0);
    assert.equal(ZapBanner.progress({ start: now - 2 * MIN, end: now - MIN }, now), 100);
    assert.equal(ZapBanner.progress({ start: now, end: now }, now), 0);
});

test('#79 the banner hides itself after about 4 s, sliding down unless Animations are Off', function () {
    [['on', true], ['off', false]].forEach(function (entry) {
        var made = banner(entry[0]);
        var root = { classList: classes() };
        var shown = made.ZapBanner.create(root, { programmes: function () { return guide; }, startOver: function () { return false; } });
        shown.show(channel);
        assert.equal(shown.shown(), true);
        assert.equal(root.classList.contains('hidden'), false);
        assert.equal(made.timers[0].ms, 4000);
        made.timers[0].run();
        assert.equal(shown.shown(), false);
        assert.equal(root.classList.contains('zb-out'), entry[1]);
        assert.equal(root.classList.contains('hidden'), !entry[1]);
        if (entry[1]) {
            made.timers[1].run();
            assert.equal(root.classList.contains('hidden'), true);
        }
    });
});

test('#79 a key hides the banner at once', function () {
    var made = banner();
    var root = { classList: classes() };
    var shown = made.ZapBanner.create(root, { programmes: function () { return guide; }, startOver: function () { return false; } });
    shown.show(channel);
    shown.hide();
    assert.equal(shown.shown(), false);
    assert.equal(root.classList.contains('hidden'), true);
    assert.equal(root.classList.contains('zb-out'), false);
    assert.deepEqual(root.children, []);
});
