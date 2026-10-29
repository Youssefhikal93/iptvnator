'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('node:fs');
var path = require('node:path');
var load = require('./sandbox');
var UI = require('./ui-sandbox').UI;

var css = fs.readFileSync(path.join(__dirname, '../../tv-app/appearance.css'), 'utf8');

function tokens(selector) {
    var start = css.indexOf(selector + ' {');
    var declarations = css.slice(start, css.indexOf('}', start));
    var found = {};
    declarations.replace(/(--[\w-]+):\s*([^;]+);/g, function (match, name, text) { found[name] = text; });
    return found;
}

// A DOM boundary with enough structure for the real virtual lists and Home.
function node() {
    var element = { children: [], className: '', style: {}, attributes: {} };
    element.appendChild = function (child) { element.children.push(child); return child; };
    element.setAttribute = function (name, text) { element.attributes[name] = text; };
    element.getAttribute = function (name) { return element.attributes[name] === undefined ? null : element.attributes[name]; };
    element.classList = { toggle: function () {} };
    element.querySelector = function () {
        var found = null;
        function visit(parent) {
            parent.children.forEach(function (child) {
                if (/\b(focus|focused)\b/.test(child.className)) found = child;
                if (!found) visit(child);
            });
        }
        visit(element);
        return found;
    };
    ['innerHTML', 'textContent'].forEach(function (property) {
        Object.defineProperty(element, property, {
            get: function () { return element['_' + property]; },
            set: function (text) { element['_' + property] = text; element.children = []; },
        });
    });
    return element;
}

function app() {
    var html = node();
    var home = node();
    var stored = {
        'iptvnator-tv:sources': JSON.stringify([{ id: 's1', name: 'Test source', type: 'm3u', url: 'https://example.test/list' }]),
        'iptvnator-tv:current': JSON.stringify('s1'),
    };
    var run = load(['keys.js', 'settings-store.js', 'appearance.js', 'appearance-layout.js', 'sources.js', 'art.js', 'kit.js', 'list.js', 'home.js'], stored, {
        UI: UI,
        document: {
            addEventListener: function () {},
            documentElement: html,
            createElement: node,
            getElementById: function () { return home; },
        },
        getComputedStyle: function (element) {
            var properties = Object.assign({}, tokens(':root'), html.attributes['data-density'] === 'compact' ? tokens('[data-density="compact"]') : {});
            properties['--visible-rows'] = properties[/\bside\b/.test(element.className) ? '--category-rows' : '--list-rows'];
            return { getPropertyValue: function (name) { return properties[name]; } };
        },
    });
    run.home = home;
    return run;
}

function items(count) {
    return Array.from({ length: count }, function (_, index) { return { name: 'Title ' + index, stream_id: index + 1 }; });
}

test('CSS column counts drive grid rendering, vertical moves, last rows and skeletons across density changes', function () {
    var run = app();
    var pane = node();
    var list = run.globals.List(pane, { rows: 9, title: function () { return 'Movies'; }, label: function (item) { return item.name; } });
    list.set(items(21));
    list.setGrid(true);
    list.setActive(true);
    assert.equal(list.cols(), 5);
    assert.equal(list.pageSize(), 10);
    assert.equal(pane.children[1].children.length, 10);
    list.move(list.cols());
    assert.equal(list.item().name, 'Title 5');
    run.globals.Prefs.set('density', 'compact');
    assert.equal(list.cols(), 6);
    assert.equal(list.pageSize(), 12);
    assert.equal(pane.children[1].children.length, 12);
    assert.equal(list.item().name, 'Title 5');
    list.move(list.cols());
    assert.equal(list.item().name, 'Title 11');
    list.select(20);
    assert.equal(pane.children[1].children.length, 9);
    assert.equal(pane.querySelector().children[1].textContent, 'Title 20');
    run.globals.Prefs.set('density', 'comfortable');
    assert.equal(list.cols(), 5);
    assert.equal(pane.children[1].children.length, 6);
    assert.equal(list.item().name, 'Title 20');
    list.loading();
    assert.equal(pane.children[1].children.length, 10);
});

test('list and category windows follow the density and respect smaller caller limits', function () {
    var run = app();
    var pane = node();
    var options = { rows: 11, title: function () { return ''; }, label: function (item) { return item.name; } };
    var list = run.globals.List(pane, options);
    list.set(items(30));
    assert.equal(list.cols(), 1);
    assert.equal(pane.children.length - 1, 9);
    run.globals.Prefs.set('density', 'compact');
    assert.equal(pane.children.length - 1, 9);
    pane.className = 'pane side';
    list.set(items(30));
    assert.equal(pane.children.length - 1, 11);
    options.rows = 3;
    list.move(1);
    assert.equal(pane.children.length - 1, 3);
});

test('Home keeps the focused entry visible while row counts change and at the end of a row', function () {
    var run = app();
    var entries = items(12).map(function (item) { return { item: item, section: 'movies' }; });
    var home = run.globals.Home({
        hero: function () { return []; },
        rows: function () { return [{ id: 'favorites', title: 'Favorites', entries: entries }]; },
        progress: function () { return null; },
        watched: function () { return false; },
        isNew: function () { return false; },
    });
    home.setActive(true);
    // The row's title, its count (#31 rows), then its cards.
    assert.equal(run.home.children[0].children[1].textContent, '1 / 12');
    assert.equal(run.home.children[0].children[2].children.length, 6);
    for (var i = 0; i < 7; i++) home.key(run.globals.Keys.RIGHT);
    assert.equal(home.focused().item.name, 'Title 7');
    run.globals.Prefs.set('density', 'compact');
    assert.equal(run.home.children[0].children[2].children.length, 7);
    assert.equal(home.focused().item.name, 'Title 7');
    run.globals.Prefs.set('density', 'comfortable');
    assert.equal(run.home.children[0].children[2].children.length, 6);
    for (var j = 0; j < 8; j++) home.key(run.globals.Keys.RIGHT);
    assert.equal(home.focused().item.name, 'Title 11');
});
