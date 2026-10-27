'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var load = require('./sandbox');

function focus() {
    var api = load(['keys.js', 'focus.js']).globals;
    // Copy into this realm so deepEqual compares plain objects.
    return { step: function () { return Object.assign({}, api.Focus.step.apply(null, arguments)); }, Keys: api.Keys };
}

test('a row moves with LEFT and RIGHT and leaves at its ends or across it', function () {
    var f = focus();
    var K = f.Keys;
    assert.deepEqual(f.step(1, 3, K.RIGHT, 'row'), { index: 2 });
    assert.deepEqual(f.step(2, 3, K.RIGHT, 'row'), { exit: 'right' });
    assert.deepEqual(f.step(1, 3, K.LEFT, 'row'), { index: 0 });
    assert.deepEqual(f.step(0, 3, K.LEFT, 'row'), { exit: 'left' });
    assert.deepEqual(f.step(1, 3, K.UP, 'row'), { exit: 'up' });
    assert.deepEqual(f.step(1, 3, K.DOWN, 'row'), { exit: 'down' });
});

test('a column moves with UP and DOWN and leaves at its ends or across it', function () {
    var f = focus();
    var K = f.Keys;
    assert.deepEqual(f.step(0, 2, K.DOWN, 'column'), { index: 1 });
    assert.deepEqual(f.step(1, 2, K.DOWN, 'column'), { exit: 'down' });
    assert.deepEqual(f.step(0, 2, K.UP, 'column'), { exit: 'up' });
    assert.deepEqual(f.step(1, 2, K.LEFT, 'column'), { exit: 'left' });
    assert.deepEqual(f.step(1, 2, K.RIGHT, 'column'), { exit: 'right' });
});

test('other keys keep the focus and an empty line can only be left', function () {
    var f = focus();
    var K = f.Keys;
    assert.deepEqual(f.step(1, 3, K.ENTER, 'row'), { index: 1 });
    assert.deepEqual(f.step(0, 0, K.RIGHT, 'row'), { exit: 'right' });
    assert.deepEqual(f.step(0, 0, K.DOWN, 'column'), { exit: 'down' });
});
