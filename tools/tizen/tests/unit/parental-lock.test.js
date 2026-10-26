'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var sandbox = require('./sandbox');

function setup(stored) {
    var records = Object.assign({}, stored);
    var now = 0;
    var timers = [];
    var storage = {
        get length() { return Object.keys(records).length; },
        key: function (index) { return Object.keys(records)[index]; },
        getItem: function (key) { return records[key] || null; },
        setItem: function (key, value) { records[key] = String(value); },
        removeItem: function (key) { delete records[key]; },
    };
    var clock = {
        now: function () { return now; },
        setTimeout: function (callback, ms) {
            var timer = { callback: callback, at: now + ms };
            timers.push(timer);
            return timer;
        },
        clearTimeout: function (timer) { timers = timers.filter(function (pending) { return pending !== timer; }); },
    };
    var globals = sandbox(['settings-store.js', 'parental-lock.js'], {}, { localStorage: storage, ParentalLockClock: clock }).globals;
    return {
        lock: globals.ParentalLock,
        prefs: globals.Prefs,
        records: records,
        advance: function (ms) {
            now += ms;
            timers.slice().forEach(function (timer) {
                if (timer.at <= now) {
                    clock.clearTimeout(timer);
                    timer.callback();
                }
            });
        },
    };
}

test('PINs are salted hashes, survive startup and reject wrong or incomplete digits', function () {
    var first = setup();
    first.lock.setPin('0427');
    var saved = JSON.parse(first.records['iptvnator-tv:pin']);
    assert.ok(saved.salt);
    assert.ok(saved.hash);
    assert.equal(Object.keys(saved).sort().join(','), 'hash,salt');
    assert.notEqual(saved.hash, '0427');
    var restarted = setup(first.records);
    assert.equal(restarted.lock.hasPin(), true);
    assert.equal(restarted.lock.verify('0427'), true);
    assert.equal(restarted.lock.verify('042'), false);
    assert.equal(restarted.lock.verify('1234'), false);
    first.lock.setPin('0427');
    assert.notEqual(first.records['iptvnator-tv:pin'], restarted.records['iptvnator-tv:pin']);
    assert.throws(function () { first.lock.setPin('12345'); });
});

test('filters per source and section, including M3U, saved episodes and unknown old snapshots', function () {
    var lock = setup().lock;
    lock.setPin('1234');
    lock.lock('s1', 'live', '5');
    lock.lock('s1', 'series', 'Drama');
    var channels = [{ category_id: 5 }, { category_id: '6' }, { group: '5' }, { name: 'Old snapshot' }];
    assert.equal(lock.filterItems('s1', 'live', channels).length, 1);
    assert.equal(lock.filterItems('s2', 'live', channels).length, 4);
    assert.equal(lock.filterItems('s1', 'movies', channels).length, 4);
    assert.equal(lock.filterItems('s1', 'series', [{ show: { group: 'Drama' }, episode: { id: 1 } }]).length, 0);
    assert.equal(channels.length, 4);
    assert.equal(lock.unlock('1234'), true);
    assert.equal(lock.filterItems('s1', 'live', channels).length, 4);
    assert.equal(lock.isLocked('s1', 'live', '5'), true);
});

[300000, 900000, 3600000, 0].forEach(function (duration) {
    test('unlock session expires at the selected duration: ' + duration, function () {
        var app = setup();
        app.prefs.set('parentalRelockMs', duration);
        app.lock.setPin('1234');
        app.lock.lock('s1', 'live', '5');
        app.lock.unlock('1234');
        app.advance(duration ? duration - 1 : 86400000);
        assert.equal(app.lock.isUnlocked(), true);
        app.advance(1);
        assert.equal(app.lock.isUnlocked(), duration === 0);
        assert.equal(setup(app.records).lock.isUnlocked(), false);
    });
});

test('five consecutive wrong tries block even a correct PIN for exactly 30 seconds', function () {
    var app = setup();
    app.lock.setPin('1234');
    for (var i = 0; i < 4; i++) assert.equal(app.lock.verify('0000'), false);
    assert.equal(app.lock.waitSeconds(), 0);
    assert.equal(app.lock.verify('0000'), false);
    assert.equal(app.lock.waitSeconds(), 30);
    assert.equal(app.lock.unlock('1234'), false);
    app.advance(29999);
    assert.equal(app.lock.verify('1234'), false);
    app.advance(1);
    assert.equal(app.lock.unlock('1234'), true);
    for (var j = 0; j < 4; j++) app.lock.verify('0000');
    assert.equal(app.lock.verify('1234'), true);
    app.lock.verify('0000');
    assert.equal(app.lock.waitSeconds(), 0);
});

test('changing the duration reschedules from unlock time; removing a PIN clears every source lock', function () {
    var app = setup({ 'iptvnator-tv:unrelated': 'keep' });
    app.lock.setPin('1234');
    app.lock.lock('s1', 'live', '5');
    app.lock.lock('s2', 'movies', '2');
    app.lock.unlockCategory('s2', 'movies', '2');
    assert.equal(app.lock.isLocked('s2', 'movies', '2'), false);
    app.lock.lock('s2', 'movies', '2');
    app.lock.unlock('1234');
    app.advance(300000);
    app.prefs.set('parentalRelockMs', 300000);
    assert.equal(app.lock.isUnlocked(), false);
    app.lock.removePin();
    assert.equal(app.lock.hasPin(), false);
    assert.equal(Object.keys(app.records).some(function (key) { return key.indexOf('iptvnator-tv:locked-categories:') === 0; }), false);
    assert.equal(app.records['iptvnator-tv:unrelated'], 'keep');
    app.lock.setPin('5678');
    assert.equal(app.lock.isLocked('s1', 'live', '5'), false);
});
