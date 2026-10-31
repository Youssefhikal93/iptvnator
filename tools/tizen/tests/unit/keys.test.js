'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var load = require('./sandbox');

function remote() {
    var timer;
    var app = load(['keys.js'], {}, {
        setTimeout: function (callback, delay) { timer = { callback: callback, delay: delay }; return timer; },
        clearTimeout: function () { timer = null; },
    });
    app.advance = function (milliseconds) {
        if (!timer) return;
        timer.delay -= milliseconds;
        if (timer.delay <= 0) {
            var callback = timer.callback;
            timer = null;
            callback();
        }
    };
    app.release = function () { app.events.keyup({ keyCode: app.globals.Keys.ENTER }); };
    return app;
}

test('OK releases a tap before 600 ms and fires only hold at or beyond 600 ms', function () {
    [ [599, 'tap'], [600, 'hold'], [1200, 'hold'] ].forEach(function (scenario) {
        var app = remote();
        var keys = app.globals.Keys;
        var actions = [];
        keys.press(function () { actions.push('tap'); }, function () { actions.push('hold'); });
        assert.equal(keys.repeat(keys.ENTER), true);
        app.advance(scenario[0]);
        assert.equal(keys.repeat(keys.ENTER), true);
        app.release();
        app.advance(1000);
        app.release();
        assert.deepEqual(actions, [scenario[1]]);
        assert.equal(keys.repeat(keys.ENTER), false);
    });
});

// A page with one card, to see the hold ring drawn on it. Timers run on a
// clock the test moves.
function page(language) {
    var now = 0;
    var timers = [];
    var keyup;
    var body = { children: [], appendChild: function (node) { this.children.push(node); } };
    var rect = function (left, top, width, height) {
        return function () { return { left: left, top: top, right: left + width, width: width, height: height, bottom: top + height }; };
    };
    var card = { getBoundingClientRect: rect(100, 200, 240, 360), querySelector: function () { return null; } };
    var plate = { getBoundingClientRect: rect(800, 180, 120, 68) };
    var row = { getBoundingClientRect: rect(790, 176, 1100, 90), querySelector: function () { return plate; } };
    var screen = { getBoundingClientRect: rect(0, 0, 1920, 1080) };
    var document = {
        body: body,
        addEventListener: function (name, callback) { if (name === 'keyup') keyup = callback; },
        createElement: function () {
            return { style: { setProperty: function (name, value) { this[name] = value; } }, className: '', innerHTML: '' };
        },
    };
    var app = load(language ? ['i18n/' + language + '.js', 'keys.js'] : ['keys.js'], {}, {
        document: document,
        setTimeout: function (callback, delay) { var timer = { callback: callback, at: now + delay }; timers.push(timer); return timer; },
        clearTimeout: function (timer) { if (timer) timer.at = Infinity; },
    });
    var keys = app.globals.Keys;
    if (language) app.globals.I18n.setLanguage(language);
    return {
        keys: keys,
        card: card,
        row: row,
        screen: screen,
        bar: function () { return body.children[0]; },
        advance: function (ms) {
            var end = now + ms;
            timers.slice().sort(function (a, b) { return a.at - b.at; }).forEach(function (timer) {
                if (timer.at > end) return;
                now = timer.at;
                timer.at = Infinity;
                timer.callback();
            });
            now = end;
        },
        release: function () { keyup({ keyCode: keys.ENTER }); },
    };
}

test('a held OK shows a ring on the card after a moment; it fills until the hold and goes at the hold', function () {
    var run = page();
    var actions = [];
    var keys = run.keys;
    keys.press(function () { actions.push('tap'); }, function () { actions.push('hold:' + run.bar().className); }, run.card);
    // Nothing yet: a plain tap draws no ring.
    assert.equal(run.bar(), undefined);
    run.advance(keys.RING_DELAY_MS);
    var bar = run.bar();
    assert.equal(bar.id, 'hold-progress');
    assert.equal(bar.className, 'on');
    assert.match(bar.innerHTML, /^<svg viewBox="0 0 44 44"[^>]*><circle class="hp-track"[^>]*><\/circle><circle class="hp-arc"/);
    // It fills over what is left, so it is full exactly when the hold fires.
    assert.equal(bar.style['--hold-ms'], (keys.HOLD_MS - keys.RING_DELAY_MS) + 'ms');
    // 44px, in the poster's top-right corner, 16px in from both edges.
    assert.deepEqual([bar.style.left, bar.style.top, bar.style.width, bar.style.height], ['280px', '216px', '44px', '44px']);
    run.advance(keys.HOLD_MS - keys.RING_DELAY_MS - 1);
    assert.deepEqual(actions, []);
    run.advance(1);
    assert.deepEqual(actions, ['hold:']);
    assert.equal(bar.innerHTML, '');
    run.release();
    assert.deepEqual(actions, ['hold:']);
});

test('a plain tap never draws the ring', function () {
    var run = page();
    var actions = [];
    run.keys.press(function () { actions.push('tap'); }, function () { actions.push('hold'); }, run.card);
    run.advance(run.keys.RING_DELAY_MS - 30);
    run.release();
    run.advance(1000);
    assert.deepEqual(actions, ['tap']);
    assert.equal(run.bar(), undefined);
});

test('in Arabic the ring sits in the top-left corner; on the player it is larger and centred near the bottom', function () {
    var arabic = page('ar');
    arabic.keys.press(function () {}, function () {}, arabic.card);
    arabic.advance(arabic.keys.RING_DELAY_MS);
    assert.deepEqual([arabic.bar().style.left, arabic.bar().style.top], ['116px', '216px']);
    var player = page();
    player.keys.press(function () {}, function () {}, player.screen);
    player.advance(player.keys.RING_DELAY_MS);
    var ring = player.bar();
    assert.deepEqual([ring.style.left, ring.style.top, ring.style.width, ring.style.height], ['924px', '860px', '72px', '72px']);
});

test('on a live row the ring sits in the middle of the channel plate, clear of the badges on the right', function () {
    var run = page();
    run.keys.press(function () {}, function () {}, run.row);
    run.advance(run.keys.RING_DELAY_MS);
    // The 120 x 68 plate at (800, 180): 44px ring centred on it.
    assert.deepEqual([run.bar().style.left, run.bar().style.top], ['838px', '192px']);
});

test('letting go early taps and takes the ring away; no target draws no ring', function () {
    var run = page();
    var actions = [];
    run.keys.press(function () { actions.push('tap:' + run.bar().className); }, function () { actions.push('hold'); }, function () { return run.card; });
    run.advance(run.keys.RING_DELAY_MS);
    assert.equal(run.bar().className, 'on');
    run.release();
    assert.deepEqual(actions, ['tap:']);
    assert.equal(run.bar().innerHTML, '');
    var bare = page();
    bare.keys.press(function () {}, function () {});
    bare.advance(1000);
    assert.equal(bare.bar(), undefined);
    // Another key cancels the press and its bar.
    run.keys.press(function () {}, function () {}, run.card);
    run.advance(run.keys.RING_DELAY_MS);
    assert.equal(run.bar().className, 'on');
    assert.equal(run.keys.repeat(run.keys.RETURN), false);
    assert.equal(run.bar().className, '');
});
test('another key cancels a pending OK without tapping or holding, then the next press works', function () {
    var app = remote();
    var keys = app.globals.Keys;
    var actions = [];
    function press() {
        keys.press(function () { actions.push('tap'); }, function () { actions.push('hold'); });
    }
    press();
    app.advance(300);
    assert.equal(keys.repeat(keys.RETURN), false);
    app.advance(600);
    app.release();
    assert.deepEqual(actions, []);
    press();
    app.release();
    assert.deepEqual(actions, ['tap']);
    [keys.RETURN, keys.BACKSPACE, keys.ESCAPE].forEach(function (code) { assert.equal(keys.isBack(code), true); });
    assert.equal(keys.isBack(keys.LEFT), false);
});
