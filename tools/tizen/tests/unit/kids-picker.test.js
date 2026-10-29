'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var load = require('./sandbox');

// The picker with no screen: UI draws nothing, the catalogue answers when the test says.
function picker() {
    var pending = {};
    var countsFor = [];
    var element = function () { return { setAttribute: function () {}, remove: function () {} }; };
    var env = load(['keys.js', 'kids-picker.js'], {}, {
        UI: { html: function () { return null; }, render: function () {} },
        Sources: { typeLabel: function () { return 'Xtream'; } },
        KidsProfile: { catalogue: function () { return {
            sections: function () { return ['movies']; },
            categories: function (source) { return new Promise(function (resolve) { pending[source.id] = resolve; }); },
            counts: function (source) { countsFor.push(source.id); return Promise.resolve({}); },
        }; } },
    });
    env.globals.document.createElement = element;
    env.globals.document.body = { appendChild: function () {} };
    env.globals.document.getElementById = function () { return null; };
    var g = env.globals;
    var key = function (code) { g.KidsPicker.onKey({ keyCode: code, preventDefault: function () {} }); };
    return { g: g, pending: pending, countsFor: countsFor, key: key };
}

var settle = function () { return new Promise(function (resolve) { setTimeout(resolve, 20); }); };

test('#62 categories that arrive after a source switch count for their own source, not the new one', async function () {
    var p = picker();
    var opened = null;
    p.g.KidsPicker.open({ name: 'Kids', sources: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], lists: {}, done: function (lists) { opened = lists; } });
    p.key(p.g.Keys.UP);
    p.key(p.g.Keys.RIGHT);
    p.pending.a([{ category_id: 1, category_name: 'Cartoons' }]);
    await settle();
    assert.deepEqual(p.countsFor, ['a']);
    assert.equal(opened, null);
});

test('#62 an answer that arrives after the picker closed is ignored without an error', async function () {
    var p = picker();
    var errors = [];
    var onError = function (error) { errors.push(error); };
    process.on('unhandledRejection', onError);
    try {
        p.g.KidsPicker.open({ name: 'Kids', sources: [{ id: 'a', name: 'A' }], lists: {}, done: function () {} });
        p.key(p.g.Keys.RETURN);
        assert.equal(p.g.KidsPicker.isOpen(), false);
        p.pending.a([{ category_id: 1, category_name: 'Cartoons' }]);
        await settle();
    } finally {
        process.removeListener('unhandledRejection', onError);
    }
    assert.deepEqual(errors.map(String), []);
    assert.deepEqual(p.countsFor, []);
});
