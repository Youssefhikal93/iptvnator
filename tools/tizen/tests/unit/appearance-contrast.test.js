'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('node:fs');
var path = require('node:path');

var directory = path.join(__dirname, '../../tv-app');
var baseCss = fs.readFileSync(path.join(directory, 'style.css'), 'utf8');
var accentCss = fs.readFileSync(path.join(directory, 'theme-accents.css'), 'utf8');

function declarations(css, selector) {
    var start = css.indexOf(selector + ' {');
    var block = css.slice(start, css.indexOf('}', start));
    var found = {};
    block.replace(/(--[\w-]+):\s*([^;]+);/g, function (match, name, text) { found[name] = text; });
    return found;
}

function luminance(hex) {
    var channels = hex.slice(1).match(/../g).map(function (part) {
        var channel = parseInt(part, 16) / 255;
        return channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
    });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrast(first, second) {
    var a = luminance(first);
    var b = luminance(second);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

test('all five accents, focus rings and secondary text meet 4.5:1 on normal theme surfaces, with readable accent fills', function () {
    var dark = declarations(baseCss, '[data-theme="light"] #player');
    ['dark', 'black', 'grey', 'light'].forEach(function (theme) {
        var base = theme === 'dark' ? dark : Object.assign({}, dark, declarations(baseCss, '[data-theme="' + theme + '"]'));
        var surfaces = ['--shell-bg', '--rail-bg', '--content-bg', '--widget-bg', '--card-hover-bg', '--panel-bg', '--field-bg', '--skeleton'].map(function (name) { return base[name]; });
        surfaces = surfaces.concat(base['--poster-bg'].match(/#[a-f\d]{6}/gi));
        ['blue', 'saffron', 'asphalt', 'violet', 'pink'].forEach(function (accent) {
            var selector = theme === 'light' ? ':root[data-theme="light"][data-accent="' + accent + '"]' : '[data-accent="' + accent + '"] #player';
            var palette = Object.assign({}, base, accent === 'blue' ? {} : declarations(accentCss, selector));
            ['--selection', '--focus-ring', '--eyebrow', '--muted'].forEach(function (token) {
                surfaces.forEach(function (surface) {
                    var ratio = contrast(palette[token], surface);
                    assert.ok(ratio >= 4.5, theme + '/' + accent + ' ' + token + ' on ' + surface + ': ' + ratio.toFixed(2));
                });
            });
            assert.ok(contrast(palette['--selection-on'], palette['--selection']) >= 4.5, theme + '/' + accent + ' accent fill');
        });
    });
});
