'use strict';

// Tizen web service (#85, id IPTVnTVApp.PhoneSource): serves the "add a
// source" page to a phone on the home network. The app opens a session over
// 127.0.0.1, the phone posts the form straight to this service, and the app
// takes it from here once. The service listens only while a session is open,
// never logs what it receives, and keeps nothing on disk.
var http = require('http');
var os = require('os');
var Sessions = require('./phone-session').Sessions;
var Page = require('./phone-page');

var PORT = 8777;
var sessions = Sessions();
var server = null;
var stopTimer = null;
var words = null;
var dir = 'ltr';
// Tests replace the address lookup.
var hooks = { ip: null };

function lanIp() {
    var nets = os.networkInterfaces();
    var names = Object.keys(nets);
    for (var i = 0; i < names.length; i++) {
        var list = nets[names[i]] || [];
        for (var j = 0; j < list.length; j++) {
            if ((list[j].family === 'IPv4' || list[j].family === 4) && !list[j].internal) return list[j].address;
        }
    }
    return '';
}

hooks.ip = lanIp;

function loopback(req) {
    var from = req.socket && req.socket.remoteAddress;
    return from === '127.0.0.1' || from === '::1' || from === '::ffff:127.0.0.1';
}

function send(res, status, type, body, extra) {
    var headers = { 'Content-Type': type, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' };
    Object.keys(extra || {}).forEach(function (name) { headers[name] = extra[name]; });
    res.writeHead(status, headers);
    res.end(body);
}

function json(res, status, data, app) {
    send(res, status, 'application/json', JSON.stringify(data), app ? { 'Access-Control-Allow-Origin': '*' } : null);
}

function readBody(req, done) {
    var size = 0;
    var parts = [];
    req.on('data', function (chunk) {
        size += chunk.length;
        if (size > 8192) {
            req.destroy();
            return;
        }
        parts.push(chunk);
    });
    req.on('end', function () { done(size > 8192 ? null : Buffer.concat(parts).toString('utf8')); });
}

function exitApp() {
    try {
        // eslint-disable-next-line no-undef
        tizen.application.getCurrentApplication().exit();
    } catch (ignored) { /* not running as a Tizen service (tests) */ }
}

// Stops listening and, as a service, ends the process.
function stop(leave) {
    clearTimeout(stopTimer);
    sessions.close();
    words = null;
    var closing = server;
    server = null;
    if (!closing) return;
    if (typeof closing.closeAllConnections === 'function') closing.closeAllConnections();
    closing.close(function () { if (leave !== false) exitApp(); });
}

function control(req, res, path) {
    if (!loopback(req)) return send(res, 404, 'text/plain', '');
    if (req.method === 'OPTIONS') return send(res, 204, 'text/plain', '', { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST', 'Access-Control-Allow-Headers': 'Content-Type' });
    if (path === '/poll') return json(res, 200, sessions.take(), true);
    if (path === '/close') {
        json(res, 200, { ok: true }, true);
        // After the answer is on its way; an /open before then cancels it.
        clearTimeout(stopTimer);
        stopTimer = setTimeout(stop, 200);
        return undefined;
    }
    // /open: the app's request, with the page's words in the TV's language.
    return readBody(req, function (body) {
        var request = {};
        try { request = JSON.parse(body || '{}'); } catch (failure) { request = {}; }
        var ip = hooks.ip();
        if (!ip) return json(res, 200, { error: 'network' }, true);
        var session = sessions.open(request.kind);
        words = request.words;
        dir = request.dir;
        clearTimeout(stopTimer);
        // Without the app's /close, the service ends itself when the code lapses.
        stopTimer = setTimeout(function () { stop(); }, session.ttl + 30000);
        json(res, 200, { code: session.code, ttl: session.ttl, ip: ip, port: server ? server.address().port : PORT }, true);
    });
}

function phone(req, res, path) {
    var code = path.slice(1);
    if (req.method === 'GET') {
        if (!sessions.check(code)) return send(res, 404, 'text/plain', '');
        return send(res, 200, 'text/html; charset=utf-8', Page.build(sessions.kind(), words, dir), {
            'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'",
        });
    }
    if (req.method !== 'POST') return send(res, 405, 'text/plain', '');
    return readBody(req, function (body) {
        var result = sessions.submit(code, body);
        json(res, result.status, { ok: result.status === 200, error: result.error });
    });
}

function handle(req, res) {
    var path = String(req.url || '').split('?')[0];
    if (path === '/open' || path === '/poll' || path === '/close') return control(req, res, path);
    if (/^\/[A-Za-z0-9]{6}$/.test(path)) return phone(req, res, path);
    return send(res, 404, 'text/plain', '');
}

function start(port) {
    if (server) return;
    server = http.createServer(handle);
    server.on('error', function () { server = null; });
    server.listen(typeof port === 'number' ? port : PORT, '0.0.0.0');
}

module.exports = {
    onStart: function () { start(); },
    onRequest: function () { start(); },
    onStop: function () { stop(false); },
    onExit: function () { stop(false); },
    start: start,
    stop: stop,
    hooks: hooks,
    port: function () { return server && server.address().port; },
    PORT: PORT,
};
