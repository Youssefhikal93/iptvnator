'use strict';
var http = require('http');
var os = require('os');
var parseUrl = require('url').parse;
var Sessions = require('./remote-session').Sessions;
var Channel = require('./remote-channel');
var Page = require('./remote-page');
var PORT = 8778;
var server = null;
var sessions = null;
var state = Channel();
var commands = Channel();
var queue = [];
var deadline = null;
var snapshot = null;
var sockets = [];
var appWaiter = false;
var appSockets = [];

function ip() {
    var nets = os.networkInterfaces();
    var found = '';
    Object.keys(nets).some(function (name) {
        return nets[name].some(function (net) {
            if (!net.internal && (net.family === 'IPv4' || net.family === 4)) found = net.address;
            return !!found;
        });
    });
    return found;
}
var hooks = { ip: ip };
function loopback(req) {
    return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].indexOf(req.socket.remoteAddress) >= 0;
}
function appOrigin(req) {
    var origin = req.headers.origin;
    return !origin || origin === 'null' || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}
function send(res, status, body, app) {
    var headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' };
    if (app) headers['Access-Control-Allow-Origin'] = '*';
    res.writeHead(status, headers);
    res.end(JSON.stringify(body || {}));
}
function body(req, res, done) {
    var chunks = [];
    var size = 0;
    req.on('data', function (chunk) {
        size += chunk.length;
        if (size > 65536) return req.destroy();
        chunks.push(chunk);
    });
    req.on('end', function () {
        var parsed;
        try { parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
        catch (error) { return send(res, 400); }
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return send(res, 400);
        try { done(parsed); } catch (error) { send(res, 503); }
    });
}
function heartbeat() {
    clearTimeout(deadline);
    deadline = setTimeout(function () { stop(true); }, 30000);
}
function publish(next) {
    if (JSON.stringify(next) === JSON.stringify(snapshot)) return;
    snapshot = next;
    state.publish(next);
}
function disconnected() {
    queue = [];
    if (snapshot && snapshot.online) publish(Object.assign({}, snapshot, { online: false }));
}
function rememberApp(socket) {
    if (appSockets.indexOf(socket) >= 0) return;
    appSockets.push(socket);
    socket.once('close', function () {
        appSockets = appSockets.filter(function (entry) { return entry !== socket; });
        if (!appSockets.length) disconnected();
    });
}
function app(req, res, path, query) {
    if (!loopback(req) || !appOrigin(req)) return send(res, 404);
    rememberApp(req.socket);
    if (req.method === 'GET' && path === '/app/events') {
        heartbeat();
        if (appWaiter) return send(res, 409, {}, true);
        appWaiter = true;
        res.on('close', function () {
            appWaiter = false;
            if (!res.writableEnded && !res.finished) disconnected();
        });
        return commands.wait(res, queue.length ? -1 : Number(query.since === undefined ? null : query.since), function (response, update) {
            appWaiter = false;
            var pending = queue;
            queue = [];
            send(response, 200, { revision: update.revision, commands: pending, phones: sessions.list() }, true);
        });
    }
    if (req.method === 'GET' && path === '/app/phones') return send(res, 200, sessions.list(), true);
    if (req.method !== 'POST') return send(res, 405);
    return body(req, res, function (request) {
        if (path === '/app/state') {
            heartbeat();
            publish(request);
            return send(res, 200, { ok: true }, true);
        }
        if (path === '/app/pair') {
            var address = hooks.ip();
            if (!address) return send(res, 503, {}, true);
            var code = sessions.open();
            code.url = 'http://' + address + ':' + server.address().port + '/r/' + code.code;
            return send(res, 200, code, true);
        }
        if (path === '/app/forget') {
            sessions.forget(request.id);
            queue = queue.filter(function (entry) { return sessions.check(entry.key); });
            state.revoke(sessions.check);
        } else if (path === '/app/rename') sessions.rename(request.id, request.name);
        else return send(res, 404);
        commands.publish(null);
        return send(res, 200, { ok: true }, true);
    });
}
var KEYS = [37, 38, 39, 40, 13, 10009, 457, 447, 448, 449, 412, 417, 10190, 403, 404, 405, 406, 10252, 415, 19, 413, 427, 428, 65376];
function valid(command) {
    if (command.phase !== undefined && (command.type !== 'key' || command.code !== 13 || ['down', 'up'].indexOf(command.phase) < 0)) return false;
    if (command.type === 'key' && typeof command.code === 'number') return KEYS.indexOf(command.code) >= 0 || (command.code >= 48 && command.code <= 57 && command.code % 1 === 0);
    if (command.type === 'text') return typeof command.field === 'string' && typeof command.text === 'string' && command.text.length <= 8192;
    if (command.type === 'jump') return ['search', 'home', 'live', 'guide', 'movies', 'series', 'favs', 'continue', 'lastch', 'settings'].indexOf(command.action) >= 0;
    return command.type === 'context' && snapshot && Array.isArray(snapshot.actions) && snapshot.actions.some(function (entry) { return entry.id === command.action; });
}
function phone(req, res, path, query) {
    var key = String(req.headers.authorization || '').replace(/^Bearer /, '');
    if (!sessions.check(key)) return send(res, 404);
    sessions.touch(key);
    if (req.method === 'GET' && path === '/events') return state.wait(res, Number(query.since === undefined ? null : query.since), function (response, update) { send(response, 200, update); }, key);
    if (req.method !== 'POST' || path !== '/command') return send(res, 404);
    return body(req, res, function (command) {
        // Forget may arrive while a request body is still being read.
        if (!sessions.check(key)) return send(res, 404);
        if (!snapshot || !snapshot.online) return send(res, 409);
        if (!valid(command) || queue.length >= 100) return send(res, 400);
        queue.push({ key: key, command: command });
        commands.publish(null);
        send(res, 200, { ok: true });
    });
}
function handle(req, res) {
    var url;
    try { url = parseUrl(req.url, true); } catch (error) { return send(res, 404); }
    // Literal addresses only: do not let a rebound DNS name reach loopback controls.
    if (!/^(localhost|127\.0\.0\.1|\d+\.\d+\.\d+\.\d+)(:\d+)?$/.test(req.headers.host || '')) return send(res, 404);
    if (url.pathname.indexOf('/app/') === 0) return app(req, res, url.pathname, url.query);
    if (req.headers.origin && req.headers.origin !== 'http://' + req.headers.host) return send(res, 404);
    // The typed or scanned address /r/K7M2QX hands its code to the page.
    if (req.method === 'GET' && /^\/r\/[A-Za-z0-9]{6}$/.test(url.pathname)) {
        res.writeHead(302, { Location: '/#pair=' + url.pathname.slice(3).toUpperCase(), 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
        return res.end();
    }
    if (req.method === 'GET' && Page.icons[url.pathname]) {
        res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'max-age=86400', 'X-Content-Type-Options': 'nosniff' });
        return res.end(Page.icons[url.pathname]);
    }
    if (req.method === 'GET' && url.pathname === '/manifest.webmanifest') {
        res.writeHead(200, { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
        return res.end(Page.manifest(snapshot || {}));
    }
    if (req.method === 'GET' && url.pathname === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': Page.csp });
        return res.end(Page.build(snapshot || {}));
    }
    if (req.method === 'POST' && url.pathname === '/pair') return body(req, res, function (request) {
        var paired = sessions.pair(request.code, request.name);
        if (paired.status === 200) commands.publish(null);
        send(res, paired.status, paired);
    });
    return phone(req, res, url.pathname, url.query);
}
function start(port, options) {
    if (server) return;
    options = options || {};
    sessions = Sessions(options);
    state = Channel();
    commands = Channel();
    snapshot = null;
    queue = [];
    appWaiter = false;
    appSockets = [];
    server = http.createServer(function (req, res) {
        try { handle(req, res); } catch (error) { send(res, 503); }
    });
    server.on('error', function () { console.log('REMOTE service unavailable'); stop(true); });
    server.on('connection', function (socket) {
        sockets.push(socket);
        socket.on('close', function () { sockets = sockets.filter(function (entry) { return entry !== socket; }); });
    });
    server.listen(typeof port === 'number' ? port : PORT, '0.0.0.0');
    heartbeat();
}
function stop(exit) {
    clearTimeout(deadline);
    publish({ online: false, words: snapshot && snapshot.words });
    state.close();
    commands.close();
    var closing = server;
    server = null;
    if (closing) closing.close();
    sockets.forEach(function (socket) { socket.destroy(); });
    sockets = [];
    if (exit && typeof tizen !== 'undefined') tizen.application.getCurrentApplication().exit();
}
var starting = false;
function boot() {
    if (server || starting) return;
    if (typeof tizen === 'undefined') return start();
    starting = true;
    tizen.filesystem.resolve('wgt-private', function (directory) {
        starting = false;
        try { start(PORT, { file: decodeURIComponent(directory.toURI().replace(/^file:\/\//, '')) + '/phone-remote.json' }); }
        catch (error) { console.log('REMOTE storage unavailable'); tizen.application.getCurrentApplication().exit(); }
    }, function () {
        starting = false;
        console.log('REMOTE storage unavailable');
        tizen.application.getCurrentApplication().exit();
    }, 'rw');
}
module.exports = { start: start, stop: stop, hooks: hooks, port: function () { return server && server.address() && server.address().port; }, PORT: PORT,
    onStart: boot, onRequest: boot, onStop: function () { stop(); }, onExit: function () { stop(); } };
