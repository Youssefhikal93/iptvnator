'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var session = require('../../tv-app/service/phone-session');

function clock() {
    var now = 1000;
    var fn = function () { return now; };
    fn.pass = function (ms) { now += ms; };
    return fn;
}

var GOOD = JSON.stringify({ name: 'Home', url: 'http://example.com:8080', user: 'ann', pass: 'secret' });

test('the code is 6 characters from the unambiguous alphabet and differs each time (#85)', function () {
    var sessions = session.Sessions();
    var seen = {};
    for (var i = 0; i < 50; i++) {
        var code = sessions.open('xtream').code;
        assert.match(code, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
        seen[code] = true;
    }
    assert.ok(Object.keys(seen).length > 40);
});

test('the code works for 10 minutes and then the TV is told it expired', function () {
    var now = clock();
    var sessions = session.Sessions(now);
    var opened = sessions.open('xtream');
    assert.equal(opened.ttl, 600000);
    now.pass(599000);
    assert.equal(sessions.take().state, 'waiting');
    assert.equal(sessions.check(opened.code), true);
    now.pass(1001);
    assert.equal(sessions.check(opened.code), false);
    assert.equal(sessions.submit(opened.code, GOOD).status, 404);
    assert.equal(sessions.take().state, 'expired');
});

test('one use: the first valid submit is kept, a second is refused, and the TV takes it once', function () {
    var sessions = session.Sessions(clock());
    var code = sessions.open('xtream').code.toLowerCase();
    assert.deepEqual(sessions.submit(code, GOOD), { status: 200 });
    assert.equal(sessions.submit(code, GOOD).status, 404);
    assert.equal(sessions.check(code), false);
    var taken = sessions.take();
    assert.equal(taken.state, 'received');
    assert.deepEqual(taken.payload, { name: 'Home', url: 'http://example.com:8080', user: 'ann', pass: 'secret' });
    assert.equal(sessions.take().state, 'none');
});

test('a wrong code is refused and ten wrong guesses close the session', function () {
    var sessions = session.Sessions(clock());
    var code = sessions.open('xtream').code;
    var wrong = code[0] === 'A' ? 'BBBBBB' : 'AAAAAA';
    for (var i = 0; i < 10; i++) assert.equal(sessions.submit(wrong, GOOD).status, 404);
    assert.equal(sessions.submit(code, GOOD).status, 404);
    assert.equal(sessions.take().state, 'expired');
});

test('a new session replaces the old one and close ends it', function () {
    var sessions = session.Sessions(clock());
    var first = sessions.open('xtream').code;
    var second = sessions.open('m3u');
    assert.equal(sessions.check(first), false);
    assert.equal(sessions.kind(), 'm3u');
    assert.equal(sessions.check(second.code), true);
    sessions.close();
    assert.equal(sessions.active(), false);
    assert.equal(sessions.check(second.code), false);
});

test('the payload is checked: Xtream needs a link, user and password; M3U only a link', function () {
    var parse = session.parse;
    assert.deepEqual(parse('xtream', JSON.stringify({ name: ' A ', url: ' https://x.tv ', user: 'u', pass: 'p' })).source, { name: 'A', url: 'https://x.tv', user: 'u', pass: 'p' });
    assert.equal(parse('xtream', JSON.stringify({ url: 'http://x.tv', user: 'u', pass: '' })).error, 'login');
    assert.equal(parse('xtream', JSON.stringify({ url: 'ftp://x.tv', user: 'u', pass: 'p' })).error, 'url');
    assert.equal(parse('xtream', JSON.stringify({ url: 'http://', user: 'u', pass: 'p' })).error, 'url');
    assert.equal(parse('xtream', JSON.stringify({ user: 'u', pass: 'p' })).error, 'url');
    assert.deepEqual(parse('m3u', JSON.stringify({ name: '', url: 'http://x.tv/a.m3u', user: 'ignored' })).source, { name: '', url: 'http://x.tv/a.m3u' });
    assert.equal(parse('m3u', JSON.stringify({ url: 'x.tv/a.m3u' })).error, 'url');
    assert.equal(parse('m3u', 'not json').error, 'format');
    assert.equal(parse('m3u', '[]').error, 'url');
    assert.equal(parse('m3u', 'null').error, 'format');
    assert.equal(parse('m3u', JSON.stringify({ url: 'http://x.tv/\n' + 'a' })).error, 'url');
    assert.equal(parse('m3u', JSON.stringify({ name: new Array(90).join('n'), url: 'http://x.tv' })).error, 'name');
    assert.equal(parse('m3u', new Array(5000).join('x')).error, 'format');
    assert.equal(parse('xtream', JSON.stringify({ url: 'http://x.tv', user: 'u\u0007', pass: 'p' })).error, 'login');
});
