'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var load = require('./sandbox');
var SETTINGS = 'iptvnator-tv:settings';

function node() {
    var classes = {};
    return {
        className: '',
        textContent: '',
        style: {},
        children: [],
        appendChild: function (child) { this.children.push(child); },
        classList: {
            add: function (name) { classes[name] = true; },
            remove: function (name) { delete classes[name]; },
            has: function (name) { return !!classes[name]; },
        },
        getBoundingClientRect: function () { return { left: 1100, top: 130, width: 672, height: 378 }; },
    };
}

// A preview over fake Player hooks: the log lists every call, in order.
function preview(stored) {
    var content = node();
    var root = node();
    var log = [];
    var playing = true;
    var app = load(['settings-store.js', 'library.js', 'live-preview.js'], stored, {
        Log: { error: function () {} },
        setInterval: function () { return 1; }, // A real timer would keep the test process alive.
        clearInterval: function () {},
        document: {
            getElementById: function (id) { return id === 'content' ? content : root; },
            createElement: node,
            addEventListener: function () {},
        },
    });
    var current = null;
    var request = { live: true, title: 'One' };
    var subject = app.globals.LivePreview({
        live: {
            play: function (channel) { current = channel; log.push('play ' + channel.stream_id); return request; },
            current: function () { return current; },
        },
        start: function (req, rect) { log.push('start ' + rect.w + 'x' + rect.h + '@' + rect.x + ',' + rect.y); },
        show: function (rect) { log.push('show ' + rect.w); return playing; },
        stop: function () { log.push('stop'); },
        fullscreen: function () { log.push('fullscreen'); },
    });
    return { subject: subject, log: log, content: content, request: request, app: app, lost: function () { playing = false; } };
}

test('Live preview defaults On and an Off choice is kept', function () {
    var stored = {};
    var app = load(['settings-store.js'], stored);
    assert.equal(app.globals.Prefs.get('livePreview'), true);
    app.globals.Prefs.set('livePreview', false);
    assert.equal(app.globals.Prefs.get('livePreview'), false);
    assert.equal(JSON.parse(app.stored[SETTINGS]).livePreview, false);
});

test('OK previews a channel, a different channel replaces it, OK on the playing channel goes fullscreen without a new stream', function () {
    var p = preview({});
    assert.equal(p.subject.open({ stream_id: 1 }, []), true);
    assert.equal(p.subject.active(), true);
    assert.equal(p.content.classList.has('previewing'), true);
    assert.equal(p.subject.open({ stream_id: 2 }, []), true);
    assert.equal(p.subject.open({ stream_id: 2 }, []), true);
    assert.equal(p.log.join('|'), 'play 1|start 672x378@1100,130|play 2|start 672x378@1100,130|fullscreen');
});

test('back shows the box again and stop closes the stream once', function () {
    var p = preview({});
    p.subject.open({ stream_id: 1 }, []);
    assert.equal(p.subject.back(p.request), true);
    assert.equal(p.log[p.log.length - 1], 'show 672');
    p.subject.stop();
    p.subject.stop();
    assert.equal(p.subject.active(), false);
    assert.equal(p.content.classList.has('previewing'), false);
    assert.equal(p.log.filter(function (entry) { return entry === 'stop'; }).length, 1);
    assert.equal(p.subject.back(p.request), false);
});

test('back from a stream that stopped playing closes the preview', function () {
    var p = preview({});
    p.subject.open({ stream_id: 1 }, []);
    p.lost();
    assert.equal(p.subject.back(p.request), false);
    assert.equal(p.subject.active(), false);
});

test('the setting Off or the grid view leaves OK to the caller', function () {
    var off = {};
    off[SETTINGS] = JSON.stringify({ livePreview: false });
    var p = preview(off);
    assert.equal(p.subject.open({ stream_id: 1 }, []), false);
    assert.equal(p.log.length, 0);
    var grid = {};
    grid[SETTINGS] = JSON.stringify({ 'view:live': 'grid' });
    p = preview(grid);
    assert.equal(p.subject.open({ stream_id: 1 }, []), false);
    assert.equal(p.subject.active(), false);
});
