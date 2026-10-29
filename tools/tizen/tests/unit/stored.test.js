'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('node:fs');
var path = require('node:path');
var load = require('./sandbox');

function counted(records) {
    var run = load([], records);
    var storage = run.globals.localStorage;
    var get = storage.getItem;
    run.reads = 0;
    storage.getItem = function (key) {
        run.reads++;
        return get(key);
    };
    return run;
}

test('a record is fetched once per run of code and parsed again only when its text changes', async function () {
    var run = counted({ a: '{"n":1}' });
    var Stored = run.globals.Stored;
    var first = Stored.json('a');
    for (var i = 0; i < 50; i++) assert.equal(Stored.json('a'), first);
    assert.equal(run.reads, 1);
    // The next run fetches it again and keeps the same parsed value.
    await null;
    assert.equal(Stored.json('a'), first);
    assert.equal(run.reads, 2);
    // A change made outside the app shows from the next run.
    run.stored.a = '{"n":2}';
    await null;
    assert.equal(JSON.stringify(Stored.json('a')), '{"n":2}');
    assert.equal(Stored.json('missing'), null);
});

test('writes are read back at once and failures throw as localStorage does', function () {
    var run = load([], {});
    var Stored = run.globals.Stored;
    assert.equal(Stored.json('k'), null);
    Stored.save('k', { list: [1] });
    assert.equal(JSON.stringify(Stored.json('k')), '{"list":[1]}');
    assert.equal(run.stored.k, '{"list":[1]}');
    Stored.put('t', 'grid');
    assert.equal(Stored.text('t'), 'grid');
    Stored.remove('k');
    assert.equal(Stored.json('k'), null);
    assert.equal(Stored.keys().join(), 't');
    run.globals.localStorage.setItem = function () { throw new Error('QuotaExceededError'); };
    assert.throws(function () { Stored.save('t', 'list'); }, /Quota/);
    assert.equal(Stored.text('t'), 'grid');
    run.stored.bad = '{';
    assert.throws(function () { Stored.json('bad'); }, { name: 'SyntaxError' });
});

test('only Stored touches localStorage, so no write can leave a stale record', function () {
    var dir = path.join(__dirname, '../../tv-app/js');
    var direct = fs.readdirSync(dir).filter(function (file) {
        if (!/\.js$/.test(file) || file === 'stored.js') return false;
        var code = fs.readFileSync(path.join(dir, file), 'utf8').replace(/\/\/.*$/gm, '');
        return /localStorage\s*[.[]/.test(code);
    });
    assert.deepEqual(direct, []);
});
