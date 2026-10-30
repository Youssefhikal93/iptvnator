'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var http = require('node:http');
var service = require('../../tv-app/service/phone-source');
var Page = require('../../tv-app/service/phone-page');

// A real service on a free port, with a fixed LAN address.
function request(port, method, path, body) {
    return new Promise(function (resolve, reject) {
        var req = http.request({ host: '127.0.0.1', port: port, method: method, path: path }, function (res) {
            var text = '';
            res.on('data', function (chunk) { text += chunk; });
            res.on('end', function () { resolve({ status: res.statusCode, headers: res.headers, text: text }); });
        });
        req.on('error', reject);
        req.end(body);
    });
}

function started() {
    service.hooks.ip = function () { return '10.0.0.5'; };
    service.start(0);
    return new Promise(function (resolve) {
        setTimeout(function () { resolve(service.port()); }, 50);
    });
}

var OPEN = JSON.stringify({ kind: 'xtream', words: { title: 'Add <b>a</b> source', send: 'Send', name: 'Name', url: 'Server', user: 'User', pass: 'Pass' }, dir: 'ltr' });
var FORM = JSON.stringify({ name: 'Home', url: 'http://example.com:8080', user: 'ann', pass: 'hunter2' });

test('the phone page is served only for the open code and a submit reaches the TV once (#85)', async function () {
    var logged = [];
    var original = { log: console.log, error: console.error, warn: console.warn };
    ['log', 'error', 'warn'].forEach(function (name) { console[name] = function () { logged.push([].slice.call(arguments).join(' ')); }; });
    var port = await started();
    try {
        assert.equal((await request(port, 'GET', '/ABCDEF')).status, 404, 'no session yet');
        var opened = JSON.parse((await request(port, 'POST', '/open', OPEN)).text);
        assert.match(opened.code, /^[A-Z2-9]{6}$/);
        assert.equal(opened.ip, '10.0.0.5');
        assert.equal(opened.port, port);
        assert.equal(opened.ttl, 600000);
        var page = await request(port, 'GET', '/' + opened.code);
        assert.equal(page.status, 200);
        assert.match(page.headers['content-type'], /text\/html/);
        assert.match(page.headers['content-security-policy'], /default-src 'none'/);
        assert.equal(page.headers['cache-control'], 'no-store');
        assert.ok(page.text.indexOf('Add &lt;b&gt;a&lt;/b&gt; source') > 0, 'the TV words are escaped');
        assert.ok(page.text.indexOf('id="pass"') > 0 && page.text.indexOf('id="user"') > 0);
        assert.ok(!/src="http|href="http|<link/.test(page.text), 'nothing is loaded from outside');
        assert.deepEqual(JSON.parse((await request(port, 'GET', '/poll')).text), { state: 'waiting' });
        var bad = await request(port, 'POST', '/' + opened.code, JSON.stringify({ url: 'nope' }));
        assert.equal(bad.status, 400);
        assert.equal(JSON.parse(bad.text).error, 'url');
        var good = await request(port, 'POST', '/' + opened.code, FORM);
        assert.equal(good.status, 200);
        assert.equal((await request(port, 'POST', '/' + opened.code, FORM)).status, 404, 'one use');
        assert.equal((await request(port, 'GET', '/' + opened.code)).status, 404, 'the page is gone too');
        var taken = JSON.parse((await request(port, 'GET', '/poll')).text);
        assert.equal(taken.state, 'received');
        assert.deepEqual(taken.payload, { name: 'Home', url: 'http://example.com:8080', user: 'ann', pass: 'hunter2' });
        assert.equal(JSON.parse((await request(port, 'GET', '/poll')).text).state, 'none');
        assert.equal((await request(port, 'GET', '/other')).status, 404);
    } finally {
        Object.assign(console, original);
        await request(port, 'POST', '/close', '{}');
        await new Promise(function (resolve) { setTimeout(resolve, 400); });
    }
    assert.deepEqual(logged, [], 'nothing is logged');
    assert.equal(service.port(), null, 'the service stops listening after /close');
});

test('a body over the limit is not accepted', async function () {
    var port = await started();
    try {
        var code = JSON.parse((await request(port, 'POST', '/open', OPEN)).text).code;
        var big = JSON.stringify({ url: 'http://x.tv', name: new Array(9000).join('n') });
        var result = await request(port, 'POST', '/' + code, big).catch(function () { return { status: 0 }; });
        assert.notEqual(result.status, 200);
        assert.deepEqual(JSON.parse((await request(port, 'GET', '/poll')).text), { state: 'waiting' });
    } finally {
        await request(port, 'POST', '/close', '{}');
        await new Promise(function (resolve) { setTimeout(resolve, 400); });
    }
});

test('the page builder escapes words, keeps unknown ones out and picks the form by kind', function () {
    var m3u = Page.build('m3u', { title: '"><script>x</script>', send: 'S' }, 'rtl');
    assert.ok(m3u.indexOf('<script>x') === -1);
    assert.ok(m3u.indexOf('id="user"') === -1 && m3u.indexOf('id="url"') > 0);
    assert.ok(m3u.indexOf('dir="rtl"') > 0);
    assert.deepEqual(Page.labels({ title: 'T', bogus: 'x', send: new Array(200).join('s') }), { title: 'T', name: 'name', url: 'url', user: 'user', pass: 'pass', send: 'send', sent: 'sent', failed: 'failed', expired: 'expired' });
});
