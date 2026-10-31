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

// A page with one card, to see the hold ring drawn on it.
function page(language) {
    var timer;
    var keyup;
    var body = { children: [], appendChild: function (node) { this.children.push(node); } };
    var card = { getBoundingClientRect: function () { return { left: 100, top: 200, right: 340, width: 240, height: 360, bottom: 560 }; }, querySelector: function () { return null; } };
    var screen = { getBoundingClientRect: function () { return { left: 0, top: 0, right: 1920, width: 1920, height: 1080, bottom: 1080 }; } };
    var document = {
        body: body,
        addEventListener: function (name, callback) { if (name === 'keyup') keyup = callback; },
        createElement: function () {
            return { style: { setProperty: function (name, value) { this[name] = value; } }, className: '', innerHTML: '' };
        },
    };
    var app = load(language ? ['i18n/' + language + '.js', 'keys.js'] : ['keys.js'], {}, {
        document: document,
        setTimeout: function (callback, delay) { timer = { callback: callback, delay: delay }; return timer; },
        clearTimeout: function () { timer = null; },
    });
    var keys = app.globals.Keys;
    if (language) app.globals.I18n.setLanguage(language);
    return {
        keys: keys,
        card: card,
        screen: screen,
        bar: function () { return body.children[0]; },
        delay: function () { return timer && timer.delay; },
        fire: function () { var callback = timer.callback; timer = null; callback(); },
        release: function () { keyup({ keyCode: keys.ENTER }); },
    };
}

test('a held OK draws a ring on the card that fills over the hold time and goes at the hold', function () {
    var run = page();
    var actions = [];
    run.keys.press(function () { actions.push('tap'); }, function () { actions.push('hold:' + run.bar().className); }, run.card);
    var bar = run.bar();
    assert.equal(bar.id, 'hold-progress');
    assert.equal(bar.className, 'on');
    assert.match(bar.innerHTML, /^<svg viewBox="0 0 44 44"[^>]*><circle class="hp-track"[^>]*><\/circle><circle class="hp-arc"/);
    assert.equal(bar.style['--hold-ms'], run.keys.HOLD_MS + 'ms');
    assert.equal(run.delay(), run.keys.HOLD_MS);
    // 44px, in the poster's top-right corner, 16px in from both edges.
    assert.deepEqual([bar.style.left, bar.style.top, bar.style.width, bar.style.height], ['280px', '216px', '44px', '44px']);
    run.fire();
    assert.deepEqual(actions, ['hold:']);
    assert.equal(bar.innerHTML, '');
    run.release();
    assert.deepEqual(actions, ['hold:']);
});

test('in Arabic the ring sits in the top-left corner; on the player it is larger and centred near the bottom', function () {
    var arabic = page('ar');
    arabic.keys.press(function () {}, function () {}, arabic.card);
    assert.deepEqual([arabic.bar().style.left, arabic.bar().style.top], ['116px', '216px']);
    var player = page();
    player.keys.press(function () {}, function () {}, player.screen);
    var ring = player.bar();
    assert.deepEqual([ring.style.left, ring.style.top, ring.style.width, ring.style.height], ['924px', '860px', '72px', '72px']);
});

test('letting go early taps and takes the ring away; no target draws no ring', function () {
    var run = page();
    var actions = [];
    run.keys.press(function () { actions.push('tap:' + run.bar().className); }, function () { actions.push('hold'); }, function () { return run.card; });
    assert.equal(run.bar().className, 'on');
    run.release();
    assert.deepEqual(actions, ['tap:']);
    assert.equal(run.bar().innerHTML, '');
    var bare = page();
    bare.keys.press(function () {}, function () {});
    assert.equal(bare.bar(), undefined);
    // Another key cancels the press and its bar.
    run.keys.press(function () {}, function () {}, run.card);
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
