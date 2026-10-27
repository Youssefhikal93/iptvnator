'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var sandbox = require('./sandbox');

// A fake fetch that answers each call with the next status.
function provider(statuses) {
    var calls = 0;
    var fetch = function () {
        var status = statuses[Math.min(calls++, statuses.length - 1)];
        return Promise.resolve({
            status: status,
            ok: status < 400,
            headers: { get: function () { return null; } },
            json: function () { return Promise.resolve({ ok: true }); },
        });
    };
    return { fetch: fetch, calls: function () { return calls; } };
}

function load(fake) {
    return sandbox(['source-request.js'], {}, { Log: { error: function () {} }, fetch: fake.fetch, AbortController: AbortController }).globals.SourceRequest;
}

test('a 429 rests every provider request: they fail at once as busy without asking it', async function () {
    var fake = provider([429, 200]);
    var request = load(fake);
    await assert.rejects(request('http://p/a', 'json'), function (err) { return err.code === 'busy' && err.wait > 55000; });
    assert.equal(fake.calls(), 1);
    // Other requests during the rest never reach the provider.
    await assert.rejects(request('http://p/b', 'json'), function (err) { return err.code === 'busy'; });
    await assert.rejects(request('http://p/c', 'json'), function (err) { return err.code === 'busy'; });
    assert.equal(fake.calls(), 1);
    assert.ok(request.restLeft() > 55000);
});

test('the retry schedule waits out a busy provider instead of trying every few seconds', async function () {
    var g = sandbox(['retry.js'], {}, {}).globals;
    var seen = [];
    var err = new Error('Source is busy');
    err.code = 'busy';
    err.wait = 60000;
    var retry = g.Retry({ load: function () { return Promise.reject(err); }, changed: function (status) { seen.push(status.seconds); } });
    retry.now();
    await new Promise(setImmediate);
    retry.cancel();
    assert.ok(seen.indexOf(60) !== -1, 'counts down from 60 s, not 2 s: ' + seen.join(','));
});

// A provider whose answers the test releases one by one.
function held() {
    var started = [];
    var fetch = function (url) {
        return new Promise(function (resolve) {
            started.push({
                url: url,
                answer: function (status) {
                    resolve({ status: status, ok: status < 400, headers: { get: function () { return null; } }, json: function () { return Promise.resolve({ url: url }); } });
                },
            });
        });
    };
    return { fetch: fetch, started: started };
}

function wait(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

test('requests to one provider are paced: two at a time, started at least 400 ms apart', async function () {
    var fake = held();
    var request = load(fake);
    var answers = ['a', 'b', 'c', 'd'].map(function (name) { return request('http://p/' + name, 'json'); });
    assert.equal(fake.started.length, 1, 'the second waits for the gap');
    await wait(450);
    assert.equal(fake.started.length, 2);
    await wait(450);
    assert.equal(fake.started.length, 2, 'never more than two at once');
    fake.started[0].answer(200);
    assert.deepEqual(await answers[0], { url: 'http://p/a' });
    await wait(50);
    assert.equal(fake.started.length, 3, 'a finished request makes room for the next');
    fake.started[1].answer(200);
    fake.started[2].answer(200);
    await wait(450);
    fake.started[3].answer(200);
    assert.deepEqual(await answers[3], { url: 'http://p/d' });
});

test('a rest outlives a restart: the reloaded app sends nothing until it ends', async function () {
    var stored = {};
    var fake = provider([429, 200]);
    var first = sandbox(['source-request.js'], stored, { Log: { error: function () {} }, fetch: fake.fetch, AbortController: AbortController });
    await assert.rejects(first.globals.SourceRequest('http://p/a', 'json'), function (err) { return err.code === 'busy'; });
    var saved = first.globals.localStorage.getItem('iptvnator-tv:source-rest');
    assert.ok(saved, 'the rest is saved');
    var again = sandbox(['source-request.js'], { 'iptvnator-tv:source-rest': saved }, { Log: { error: function () {} }, fetch: fake.fetch, AbortController: AbortController });
    await assert.rejects(again.globals.SourceRequest('http://p/b', 'json'), function (err) { return err.code === 'busy' && err.wait > 55000; });
    assert.equal(fake.calls(), 1);
});

test('requests waiting in line fail unsent when a 429 arrives', async function () {
    var fake = held();
    var request = load(fake);
    var first = request('http://p/a', 'json');
    var later = request('http://p/b', 'json');
    var last = request('http://p/c', 'json');
    await wait(450);
    assert.equal(fake.started.length, 2);
    fake.started[0].answer(429);
    await assert.rejects(first, function (err) { return err.code === 'busy'; });
    await assert.rejects(last, function (err) { return err.code === 'busy'; });
    fake.started[1].answer(200);
    await later;
    assert.equal(fake.started.length, 2, 'the third was never sent');
});
