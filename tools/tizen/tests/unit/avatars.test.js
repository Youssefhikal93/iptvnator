'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('node:fs');
var path = require('node:path');
var load = require('./sandbox');
var UI = require('./ui-sandbox').UI;

function avatars() {
    return load(['avatars.js'], {}, { UI: UI }).globals.Avatars;
}

test('picker offers 16 unique animals with shipped image files', function () {
    var art = avatars();
    assert.equal(art.ids.length, 16);
    assert.equal(new Set(art.ids).size, 16);
    art.ids.forEach(function (id) {
        assert.equal(art.has(id), true);
        var node = art.art(id);
        assert.equal(node.type, 'img');
        assert.equal(node.props.class, 'avatar-art');
        assert.equal(node.props.src, 'avatars/' + id + '.webp');
        assert.equal(node.props.alt, '');
        assert.equal(node.props.draggable, 'false');
        var filename = path.join(__dirname, '../../tv-app', node.props.src);
        assert.ok(fs.statSync(filename).size < 40000, id + ' stays below 40 KB');
    });
});

test('retired saved choices resolve to animals without entering the picker', function () {
    var art = avatars();
    [['princess', 'unicorn'], ['wizard', 'owl']].forEach(function (pair) {
        assert.equal(art.has(pair[0]), true);
        assert.equal(art.ids.includes(pair[0]), false);
        assert.equal(art.art(pair[0]).props.src, art.art(pair[1]).props.src);
    });
});

test('unknown avatars preserve the initial fallback', function () {
    var globals = load(['avatars.js', 'kit.js'], {}, { UI: UI }).globals;
    ['nope', 'toString', '__proto__', undefined].forEach(function (id) {
        assert.equal(globals.Avatars.has(id), false);
    });
    var node = globals.Kit.Avatar({ cls: 'pf-avatar', profile: { avatar: 'nope', name: 'Kids', color: '#fff' } });
    assert.equal(node.props.children, 'K');
    assert.equal(node.props.class, 'pf-avatar');
});
