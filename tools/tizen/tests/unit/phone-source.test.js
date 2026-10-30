'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var load = require('./sandbox');

// The sandbox has its own Object prototype, so compare through JSON.
function same(actual, expected) {
    assert.equal(JSON.stringify(actual), JSON.stringify(expected));
}

// A clock and a fake service the test drives by hand.
function setup(answers) {
    var now = 0;
    var timers = [];
    var calls = [];
    var overrides = {
        setTimeout: function (fn, ms) { timers.push({ at: now + ms, fn: fn, live: true }); return timers.length - 1; },
        clearTimeout: function (id) { if (timers[id]) timers[id].live = false; },
        fetch: function (url, options) {
            var path = url.replace('http://127.0.0.1:8777', '');
            calls.push({ path: path, body: options && options.body });
            var answer = answers(path);
            return answer instanceof Error ? Promise.reject(answer) : Promise.resolve({ json: function () { return Promise.resolve(answer); } });
        },
    };
    var env = load(['phone-source.js'], {}, overrides);
    function pass(ms) {
        now += ms;
        timers.forEach(function (timer) {
            if (timer.live && timer.at <= now) {
                timer.live = false;
                timer.fn();
            }
        });
        return new Promise(function (resolve) { setImmediate(resolve); });
    }
    return { PhoneSource: env.globals.PhoneSource, calls: calls, pass: pass };
}

function handlers(log) {
    return {
        code: function (info) { log.push(['code', info]); },
        received: function (source) { log.push(['received', source]); },
        expired: function () { log.push(['expired']); },
        failed: function () { log.push(['failed']); },
    };
}

var OPENED = { code: 'K7M2QX', ttl: 600000, ip: '192.168.1.5', port: 8777 };

test('the app opens a session, shows the link, and takes the phone details once (#85)', async function () {
    var state = { state: 'waiting' };
    var env = setup(function (path) { return path === '/open' ? OPENED : path === '/poll' ? state : { ok: true }; });
    var log = [];
    env.PhoneSource.open('xtream', handlers(log));
    await env.pass(0);
    same(log, [['code', { code: 'K7M2QX', url: 'http://192.168.1.5:8777/K7M2QX' }]]);
    var body = JSON.parse(env.calls[0].body);
    assert.equal(body.kind, 'xtream');
    assert.equal(body.words.send, 'Send to TV');
    assert.equal(body.dir, 'ltr');
    await env.pass(1500);
    state = { state: 'received', payload: { name: 'A', url: 'http://x.tv', user: 'u', pass: 'p' } };
    await env.pass(1500);
    same(log[1], ['received', { name: 'A', url: 'http://x.tv', user: 'u', pass: 'p' }]);
    assert.equal(log.length, 2);
    assert.equal(env.calls[env.calls.length - 1].path, '/close', 'the service is told to stop');
    var count = env.calls.length;
    await env.pass(60000);
    assert.equal(env.calls.length, count, 'no more polling');
});

test('the code screen ends by itself after 10 minutes, even if the service is silent', async function () {
    var env = setup(function (path) { return path === '/open' ? OPENED : { state: 'waiting' }; });
    var log = [];
    env.PhoneSource.open('m3u', handlers(log));
    await env.pass(0);
    await env.pass(599000);
    assert.equal(log.length, 1);
    await env.pass(1000);
    same(log[1], ['expired']);
    assert.equal(env.calls[env.calls.length - 1].path, '/close');
});

test('the service reporting an expired code ends the screen', async function () {
    var env = setup(function (path) { return path === '/open' ? OPENED : { state: 'expired' }; });
    var log = [];
    env.PhoneSource.open('xtream', handlers(log));
    await env.pass(0);
    await env.pass(1500);
    same(log[1], ['expired']);
});

test('a service that does not answer is retried, then reported as unavailable', async function () {
    var env = setup(function () { return new Error('refused'); });
    var log = [];
    env.PhoneSource.open('xtream', handlers(log));
    await env.pass(0);
    for (var i = 0; i < 12; i++) await env.pass(600);
    same(log, [['failed']]);
    var opens = env.calls.filter(function (call) { return call.path === '/open'; }).length;
    assert.equal(opens, 12);
});

test('no network address is reported as unavailable', async function () {
    var env = setup(function (path) { return path === '/open' ? { error: 'network' } : {}; });
    var log = [];
    env.PhoneSource.open('xtream', handlers(log));
    for (var i = 0; i < 13; i++) await env.pass(600);
    same(log, [['failed']]);
});

test('closing stops polling and asks the service to stop; late answers are ignored', async function () {
    var env = setup(function (path) { return path === '/open' ? OPENED : { state: 'waiting' }; });
    var log = [];
    env.PhoneSource.open('xtream', handlers(log));
    await env.pass(0);
    env.PhoneSource.close();
    assert.equal(env.calls[env.calls.length - 1].path, '/close');
    var count = env.calls.length;
    await env.pass(5000);
    assert.equal(env.calls.length, count);
    assert.equal(log.length, 1);
});
