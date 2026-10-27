'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var load = require('./sandbox');

function art() {
    var listeners = {};
    var images = [];
    function Image() { images.push(this); }
    var app = load(['art.js'], {}, {
        document: { addEventListener: function (name, callback) { listeners[name] = callback; } },
        Image: Image,
    });
    function node(src) {
        var classes = [];
        return {
            tagName: 'IMG',
            classList: {
                add: function (name) { if (classes.indexOf(name) === -1) classes.push(name); },
                contains: function (name) { return classes.indexOf(name) !== -1; },
            },
            getAttribute: function () { return src; },
            classes: classes,
        };
    }
    return { Art: app.globals.Art, loaded: function (target) { listeners.load({ target: target }); }, node: node, images: images };
}

test('a new image fades in after it loads and the same address later shows at once', function () {
    var a = art();
    var first = a.Art.prepare(a.node('p.jpg'), 'p.jpg');
    assert.deepEqual(first.classes.slice(), ['art']);
    a.loaded(first);
    assert.deepEqual(first.classes.slice(), ['art', 'art-in']);
    var again = a.Art.prepare(a.node('p.jpg'), 'p.jpg');
    assert.deepEqual(again.classes.slice(), ['art', 'art-in']);
});

test('images outside the art pipeline are left alone', function () {
    var a = art();
    var other = a.node('logo.png');
    a.loaded(other);
    assert.equal(a.Art.seen('logo.png'), false);
    assert.deepEqual(other.classes.slice(), []);
});

test('preload fetches each new address once and remembers it when it arrives', function () {
    var a = art();
    a.Art.remember('known.jpg');
    a.Art.preload(['a.jpg', '', 'known.jpg', 'b.jpg']);
    assert.deepEqual(a.images.map(function (image) { return image.src; }), ['a.jpg', 'b.jpg']);
    assert.equal(a.Art.seen('a.jpg'), false);
    a.images[0].onload();
    assert.equal(a.Art.seen('a.jpg'), true);
});
