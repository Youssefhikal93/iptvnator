'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var load = require('./sandbox');

function picture() {
    return load(['settings-store.js', 'player-picture.js']).globals.PlayerPicture;
}

test('subtitle preferences map to complete classes, with defaults for missing or invalid stored values', function () {
    var controls = picture();
    assert.equal(controls.classes({}).join(' '), 'sub-size-m sub-colour-white sub-bg-shadow sub-pos-bottom');
    assert.equal(controls.classes({ subtitleSize: 'bad', subtitleColour: null, subtitleBackground: 12 }).join(' '),
        'sub-size-m sub-colour-white sub-bg-shadow sub-pos-bottom');
    ['s', 'm', 'l', 'xl'].forEach(function (size) {
        assert.equal(controls.classes({ subtitleSize: size, subtitleColour: 'yellow', subtitleBackground: 'box', subtitlePosition: 'high' }).join(' '),
            'sub-size-' + size + ' sub-colour-yellow sub-bg-box sub-pos-high');
    });
    assert.ok(controls.classes({ subtitleBackground: 'off' }).indexOf('sub-bg-off') >= 0);
});

test('aspect modes fit the screen or centre a forced ratio without exceeding wide or tall screens', function () {
    var controls = picture();
    var screen = { x: 0, y: 0, w: 1920, h: 1080 };
    [
        ['auto', 'contain', 'LETTER_BOX', '0,0,1920,1080'],
        ['fit', 'contain', 'LETTER_BOX', '0,0,1920,1080'],
        ['fill', 'cover', 'FULL_SCREEN', '0,0,1920,1080'],
        ['16:9', 'fill', 'FULL_SCREEN', '0,0,1920,1080'],
        ['4:3', 'fill', 'FULL_SCREEN', '240,0,1440,1080'],
        ['invalid', 'contain', 'LETTER_BOX', '0,0,1920,1080'],
    ].forEach(function (scenario) {
        var mapped = controls.aspect(scenario[0], screen, null);
        assert.equal(mapped.objectFit, scenario[1]);
        assert.equal(mapped.displayMethod, 'PLAYER_DISPLAY_MODE_' + scenario[2]);
        assert.equal([mapped.rect.x, mapped.rect.y, mapped.rect.w, mapped.rect.h].join(','), scenario[3]);
    });
    var tall = controls.aspect('16:9', { x: 10, y: 20, w: 1000, h: 1000 }, null).rect;
    assert.equal([tall.x, tall.y, tall.w, tall.h].join(','), '10,239,1000,563');
});

test('the live preview rectangle and Fit win over every saved aspect', function () {
    var controls = picture();
    var preview = { x: 1100, y: 180, w: 640, h: 360 };
    ['auto', 'fit', 'fill', '16:9', '4:3'].forEach(function (mode) {
        var mapped = controls.aspect(mode, { x: 0, y: 0, w: 1920, h: 1080 }, preview);
        assert.equal([mapped.rect.x, mapped.rect.y, mapped.rect.w, mapped.rect.h].join(','), '1100,180,640,360');
        assert.equal(mapped.objectFit, 'contain');
        assert.equal(mapped.displayMethod, 'PLAYER_DISPLAY_MODE_LETTER_BOX');
    });
});
