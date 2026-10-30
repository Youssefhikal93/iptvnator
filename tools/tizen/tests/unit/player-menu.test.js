'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var load = require('./sandbox');

// The ▲ menu with no screen. `rows.startOver` adds the live "Start over" row
// that the now/next guide can bring in after the menu is open.
function menu() {
    var ran = [];
    var rows = { startOver: false };
    var env = load(['keys.js', 'focus.js', 'player-menu.js'], {}, {
        UI: { html: function () { return null; }, render: function () {} },
    });
    var g = env.globals;
    var root = { classList: { toggle: function () {} }, querySelector: function () { return null; } };
    var m = g.PlayerMenu(root, {
        build: function (e) {
            if (rows.startOver) e.item('Start over', false, 'start-over');
            e.head('Audio');
            e.item('Arabic', true, 'arabic');
            e.item('English', false, 'english');
            e.head('Subtitles');
            e.item('Off', true, 'off');
        },
        run: function (action) { ran.push(action); },
    });
    m.reset();
    m.render();
    return { g: g, m: m, rows: rows, ran: ran, key: function (code) { m.key(code); m.render(); } };
}

test('#83 a row arriving above an open group keeps the group and the focused choice', function () {
    var p = menu();
    p.key(p.g.Keys.ENTER); // Audio
    p.rows.startOver = true;
    p.m.render();
    p.key(p.g.Keys.DOWN);
    p.key(p.g.Keys.ENTER);
    assert.deepEqual(p.ran, ['english']);
});

test('#83 a row arriving above the focused group keeps that group focused', function () {
    var p = menu();
    p.rows.startOver = true;
    p.m.render();
    p.key(p.g.Keys.ENTER);
    p.key(p.g.Keys.DOWN);
    p.key(p.g.Keys.ENTER);
    assert.deepEqual(p.ran, ['english']);
});
