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
