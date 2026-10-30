'use strict';

// The one pending "add a source from your phone" session (#85): its short
// code, its 10 minute life, its single use, and the check of what the phone
// sends. Nothing here logs or writes to disk: the details live in this
// object until the TV takes them once.
var crypto = require('crypto');

var TTL_MS = 10 * 60 * 1000;
var MAX_WRONG = 10;
var MAX_BODY = 4096;
// No I, O, 0 or 1: they look alike on a phone. 32 characters, so one random
// byte maps to one character without bias.
var ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
var CODE_LENGTH = 6;

function randomCode() {
    var bytes = crypto.randomBytes(CODE_LENGTH);
    var code = '';
    for (var i = 0; i < CODE_LENGTH; i++) code += ALPHABET.charAt(bytes[i] & 31);
    return code;
}

function clean(value, max) {
    if (typeof value !== 'string') return '';
    var text = value.trim();
    // eslint-disable-next-line no-control-regex
    return text.length <= max && !/[\u0000-\u001f\u007f]/.test(text) ? text : null;
}

// What the phone page sends: { name, url, user, pass }. The TV's form checks
// it again before saving; this keeps junk from reaching the TV at all.
function parse(kind, body) {
    if (typeof body !== 'string' || body.length > MAX_BODY) return { error: 'format' };
    var data;
    try {
        data = JSON.parse(body);
    } catch (failure) {
        return { error: 'format' };
    }
    if (!data || typeof data !== 'object') return { error: 'format' };
    var source = { name: clean(data.name || '', 80), url: clean(data.url, 500) };
    if (source.name === null) return { error: 'name' };
    if (!source.url || !/^https?:\/\/[^\s/]+/i.test(source.url)) return { error: 'url' };
    if (kind === 'xtream') {
        source.user = clean(data.user, 200);
        source.pass = clean(data.pass, 200);
        if (!source.user || !source.pass) return { error: 'login' };
    }
    return { source: source };
}

function Sessions(now) {
    var clock = now || Date.now;
    var current = null;

    function alive() {
        return !!current && !current.locked && clock() < current.expiresAt;
    }

    return {
        // A new session replaces any earlier one; its code stops working.
        open: function (kind) {
            current = { kind: kind === 'm3u' ? 'm3u' : 'xtream', code: randomCode(), expiresAt: clock() + TTL_MS, used: false, payload: null, wrong: 0, locked: false };
            return { code: current.code, kind: current.kind, ttl: TTL_MS };
        },
        // Is this the code of the open session? A wrong guess counts; too
        // many close the session.
        check: function (code) {
            if (!alive() || current.used) return false;
            if (typeof code === 'string' && code.toUpperCase() === current.code) return true;
            if (++current.wrong >= MAX_WRONG) current.locked = true;
            return false;
        },
        kind: function () {
            return current && current.kind;
        },
        // The phone's submit. One use: the code is spent when it is accepted.
        submit: function (code, body) {
            if (!this.check(code)) return { status: 404 };
            var result = parse(current.kind, body);
            if (result.error) return { status: 400, error: result.error };
            current.used = true;
            current.payload = result.source;
            return { status: 200 };
        },
        // The TV's question: still waiting, expired, or received (once).
        take: function () {
            if (!current) return { state: 'none' };
            if (current.payload) {
                var payload = current.payload;
                current = null;
                return { state: 'received', payload: payload };
            }
            return { state: alive() ? 'waiting' : 'expired' };
        },
        active: function () {
            return alive() && !current.used;
        },
        close: function () {
            current = null;
        },
    };
}

module.exports = { Sessions: Sessions, parse: parse, TTL_MS: TTL_MS, MAX_BODY: MAX_BODY, MAX_WRONG: MAX_WRONG, ALPHABET: ALPHABET, CODE_LENGTH: CODE_LENGTH };
