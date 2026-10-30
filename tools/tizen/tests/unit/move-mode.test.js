'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var load = require('./sandbox');
var key = function (row) { return row.id; };
var ids = function (rows) { return Array.from(rows, key).join(','); };

test('#87 saved order reconciles fresh objects, removed and new ids, including All and unusual ids', function () {
    var move = load(['move-mode.js']).globals.MoveMode;
    var fresh = [{ id: '' }, { id: 'a' }, { id: '__proto__' }, { id: 'new' }];
    var ordered = move.apply(fresh, ['gone', '__proto__', '__proto__', 'a', ''], key);
    assert.equal(ids(ordered), '__proto__,a,,new');
    assert.equal(ordered[1], fresh[1]);
    assert.equal(ids(fresh), ',a,__proto__,new');
    assert.equal(ids(move.reset(fresh)), ids(fresh));
    assert.notEqual(move.reset(fresh), fresh);
});

test('moving and moving to top clamp either edge and never mutate the list', function () {
    var move = load(['move-mode.js']).globals.MoveMode;
    var rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    [[0, -1, 'a,b,c'], [2, 1, 'a,b,c'], [0, 1, 'b,a,c'], [2, -1, 'a,c,b'], [1, 20, 'a,c,b'], [-1, 1, 'a,b,c']].forEach(function (example) {
        assert.equal(ids(move.move(rows, example[0], example[1])), example[2]);
    });
    assert.equal(ids(move.top(rows, 2)), 'c,a,b');
    assert.equal(move.move([], 0, 1).length, 0);
    assert.equal(ids(rows), 'a,b,c');
});

test('lift moves live, swallows unrelated keys, places once, and Return restores order and focus without saving', function () {
    var g = load(['keys.js', 'move-mode.js']).globals;
    var rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    // The controller's UI boundary: a visible list and its focus.
    var shown = rows, at = 1, lifted = null, hint = '', saved = [];
    var list = {
        items: function () { return shown; }, index: function () { return at; }, item: function () { return shown[at]; },
        set: function (items, index) { shown = items; at = index; }, lift: function (item) { lifted = item; },
    };
    var controller = g.MoveMode.controller(function (text) { hint = text; });
    var save = function (items) { saved.push(ids(items)); };
    controller.lift(list, save);
    assert.equal(lifted.id, 'b');
    assert.match(hint, /OK place/);
    controller.onKey(g.Keys.DOWN);
    assert.equal(ids(shown), 'a,c,b');
    assert.equal(at, 2);
    assert.equal(controller.onKey(g.Keys.RIGHT), true);
    controller.onKey(g.Keys.RETURN);
    assert.equal(ids(shown), 'a,b,c');
    assert.equal(at, 1);
    assert.equal(saved.length, 0);
    assert.equal(lifted, null);
    assert.equal(hint, '');
    controller.lift(list, save);
    controller.onKey(g.Keys.UP);
    controller.onKey(g.Keys.ENTER);
    assert.deepEqual(saved, ['b,a,c']);
    assert.equal(controller.onKey(g.Keys.DOWN), false);
    controller.lift(list, save);
    controller.onKey(g.Keys.ENTER);
    assert.deepEqual(saved, ['b,a,c']);
});

test('a menu opened before a list refresh moves the same identity in the fresh list', function () {
    var g = load(['keys.js', 'move-mode.js', 'order-menu.js']).globals;
    var shown = [{ id: 'a' }, { id: 'b' }], at = 0, saved;
    var list = {
        items: function () { return shown; }, index: function () { return at; }, item: function () { return shown[at]; },
        select: function (index) { at = index; }, set: function (items, index) { shown = items; at = index; }, lift: function () {},
    };
    var controller = g.MoveMode.controller(function () {});
    var menu = g.OrderMenu({ list: list, row: { id: 'b' }, key: key, controller: controller,
        save: function (rows) { saved = ids(rows); }, done: function () {} });
    menu[0].run();
    controller.onKey(g.Keys.UP);
    controller.onKey(g.Keys.ENTER);
    assert.equal(saved, 'b,a');
});
