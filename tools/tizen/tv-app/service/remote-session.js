'use strict';

var crypto = require('crypto');
var fs = require('fs');
// The same short code as "Add from phone", so the address can be typed.
var Code = require('./phone-session');
var TTL = 600000;
var LIMIT = 5;

function randomCode() {
    var bytes = crypto.randomBytes(Code.CODE_LENGTH);
    var code = '';
    for (var i = 0; i < Code.CODE_LENGTH; i++) code += Code.ALPHABET.charAt(bytes[i] & 31);
    return code;
}

function Sessions(options) {
    var now = options.now || Date.now;
    var phones = [];
    var pending = null;
    if (options.file && fs.existsSync(options.file)) {
        phones = JSON.parse(fs.readFileSync(options.file, 'utf8'));
        if (!Array.isArray(phones)) throw new Error('Invalid remote pairings');
    }
    function save() {
        if (!options.file) return;
        fs.writeFileSync(options.file + '.tmp', JSON.stringify(phones), { mode: 384 });
        fs.renameSync(options.file + '.tmp', options.file);
    }
    function list() {
        return phones.map(function (phone) { return { id: phone.id, name: phone.name, lastUsed: phone.lastUsed }; });
    }
    function find(key) {
        return phones.filter(function (phone) { return phone.key === key; })[0];
    }
    return {
        list: list,
        open: function () {
            pending = { code: randomCode(), expires: now() + TTL, wrong: 0 };
            return { code: pending.code, ttl: TTL, count: phones.length };
        },
        pair: function (code, name) {
            if (!pending || now() >= pending.expires) return { status: 404 };
            if (typeof code !== 'string' || code.toUpperCase() !== pending.code) {
                // Too many wrong guesses close the code.
                if (++pending.wrong >= Code.MAX_WRONG) pending = null;
                return { status: 404 };
            }
            if (phones.length >= LIMIT) return { status: 409, error: 'limit' };
            var phone = { id: crypto.randomBytes(8).toString('hex'), key: crypto.randomBytes(32).toString('hex'), name: String(name || '').trim().slice(0, 40), lastUsed: now() };
            phones.push(phone);
            try { save(); } catch (failure) { phones.pop(); throw failure; }
            pending = null;
            return { status: 200, key: phone.key };
        },
        check: function (key) { return !!find(key); },
        touch: function (key) {
            var phone = find(key);
            if (!phone || now() - phone.lastUsed < 60000) return;
            phone.lastUsed = now();
            save();
        },
        forget: function (id) {
            var before = phones;
            phones = id === 'all' ? [] : phones.filter(function (phone) { return phone.id !== id; });
            try { save(); } catch (failure) { phones = before; throw failure; }
        },
        rename: function (id, name) {
            var phone = phones.filter(function (phone) { return phone.id === id; })[0];
            if (!phone || typeof name !== 'string' || !name.trim()) return false;
            var before = phone.name;
            phone.name = name.trim().slice(0, 40);
            try { save(); } catch (failure) { phone.name = before; throw failure; }
            return true;
        },
    };
}

module.exports = { Sessions: Sessions, TTL: TTL, LIMIT: LIMIT };
