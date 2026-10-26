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
