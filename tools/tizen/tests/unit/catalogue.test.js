'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var load = require('./sandbox');

test('refresh comparison notices length, identity, order, artwork and nested metadata changes', function () {
    var catalogue = load(['catalogue.js']).globals.Catalogue;
    var saved = [{ stream_id: 1, num: 1, name: 'One', icon: 'old', meta: { rating: 4 } }];
    [
        [[], false],
        [[{ stream_id: 2, num: 1, name: 'One', icon: 'old', meta: { rating: 4 } }], false],
        [[{ stream_id: 1, num: 1, name: 'One', icon: 'new', meta: { rating: 4 } }], false],
        [[{ stream_id: 1, num: 1, name: 'One', icon: 'old', meta: { rating: 5 } }], false],
        [JSON.parse(JSON.stringify(saved)), true],
    ].forEach(function (scenario) { assert.equal(catalogue.same(scenario[0], saved), scenario[1]); });
    assert.equal(catalogue.same([{ stream_id: 1 }, { stream_id: 2 }], [{ stream_id: 2 }, { stream_id: 1 }]), false);
    assert.equal(catalogue.same({ episodes: [1] }, { episodes: [2] }), false);
    assert.equal(catalogue.same([], []), true);
    assert.equal(catalogue.same([null], [null]), true);
    assert.equal(catalogue.same([{}], [null]), false);
});
