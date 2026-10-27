'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var load = require('./sandbox');
var sandbox = require('./ui-sandbox');

function kit() {
    var Art = { seen: function () { return false; } };
    return load(['kit.js'], {}, { UI: sandbox.UI, Art: Art, Avatars: {} }).globals.Kit;
}

function plate(Kit, props) {
    return Kit.Plate(props);
}

function find(node, tag) {
    if (node.tag === tag) return node;
    return node.children.reduce(function (found, child) { return found || find(child, tag); }, null);
}

test('a channel with a logo shows it on the plate, with the name kept for a failure', function () {
    var Kit = kit();
    var node = sandbox.toNodes(plate(Kit, { cls: 'row-plate', name: 'Nordic News', logo: 'http://logos.test/n24.png' }))[0];
    assert.equal(node.className, 'plate row-plate');
    assert.equal(find(node, 'img').className, 'plate-logo art');
    assert.equal(node.textContent.trim(), 'Nordic News');
});

test('a channel without a logo shows its name on a colour taken from the name', function () {
    var Kit = kit();
    var view = plate(Kit, { name: 'Kanal Film', logo: '' });
    var node = sandbox.toNodes(view)[0];
    assert.equal(node.className, 'plate nologo');
    assert.equal(find(node, 'img'), null);
    assert.equal(node.textContent.trim(), 'Kanal Film');
    var hue = view.props.style['--h'];
    assert.ok(hue >= 0 && hue < 360);
    assert.equal(plate(Kit, { name: 'Kanal Film', logo: '' }).props.style['--h'], hue);
    assert.notEqual(plate(Kit, { name: 'Arena Sport', logo: '' }).props.style['--h'], hue);
});

test('a dead logo switches to the name and is not requested again', function () {
    var Kit = kit();
    var failed = [];
    var added = [];
    var props = { name: 'Arena', logo: 'http://logos.test/dead.png', onFail: function (src) { failed.push(src); } };
    var img = plate(Kit, props).props.children.find(function (child) { return child && child.type === 'img'; });
    img.props.onError({ currentTarget: { parentNode: { classList: { add: function (cls) { added.push(cls); } } } } });
    assert.deepEqual(added, ['nologo']);
    assert.deepEqual(failed, ['http://logos.test/dead.png']);
    var again = sandbox.toNodes(plate(Kit, props))[0];
    assert.equal(again.className, 'plate nologo');
    assert.equal(find(again, 'img'), null);
});
