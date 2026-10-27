'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var load = require('./sandbox');
var ID = 'dQw4w9WgXcQ';
var WATCH = 'https://www.youtube.com/watch?v=' + ID;
var APP_ID = '111299001912';

function platform(application) {
    return {
        ApplicationControl: function (operation, uri, mime, category, payload) {
            this.operation = operation;
            this.uri = uri;
            this.payload = payload;
        },
        ApplicationControlData: function (key, values) { this.key = key; this.value = values; },
        application: application,
    };
}

function client(tizen, events) {
    return load(['youtube.js'], {}, {
        tizen: tizen,
        URL: URL,
        Event: function (type) { this.type = type; },
        document: { dispatchEvent: function (event) { if (events) events.push(event.type); } },
        Log: { info: function () {}, error: function () {} },
    }).globals.YouTube;
}

test('trailer ids accept bare ids and YouTube links with query strings and fragments', function () {
    var api = client();
    [
        ID, '  ' + ID + '  ', WATCH, WATCH + '&t=12#start',
        'https://www.youtube.com/watch?feature=shared&v=' + ID,
        'https://youtu.be/' + ID + '?si=shared',
        'https://www.youtube.com/embed/' + ID + '?autoplay=1',
        'https://m.youtube.com/shorts/' + ID,
        'http://youtube.com/live/' + ID,
        'youtube.com/v/' + ID, '//youtu.be/' + ID,
    ].forEach(function (text) { assert.equal(api.videoId(text), ID, text); });
});

test('trailer ids reject junk, non-YouTube hosts and ids of the wrong length', function () {
    var api = client();
    [
        null, undefined, 123, {}, '', 'junk', ID + 'x',
        'https://example.com/watch?v=' + ID,
        'https://youtube.com.example.com/embed/' + ID,
        'https://notyoutube.com/watch?v=' + ID,
        'https://youtube.com@evil.example/watch?v=' + ID,
        'https://youtube.com/watch?v=' + ID + 'x',
        'https://youtu.be/short', 'https://youtube.com/watch',
        'javascript:alert(1)', 'https://youtube.com/other/' + ID,
    ].forEach(function (text) { assert.equal(api.videoId(text), '', String(text)); });
});

test('#38 stops playback before launching the implicit view control', function () {
    var events = [];
    var api = client(platform({
        launchAppControl: function (control, appId, ok) {
            assert.equal(events.join(','), 'trailer-open');
            assert.equal(control.operation, 'http://tizen.org/appcontrol/operation/view');
            assert.equal(control.uri, WATCH);
            assert.equal(appId, null);
            events.push('launch');
            ok();
        },
    }), events);
    api.open(ID, function () { assert.fail('view launch succeeded'); });
    assert.equal(events.join(','), 'trailer-open,launch');
});

test('a failed view launch falls back to Samsung YouTube with its PAYLOAD deep link', function () {
    var calls = [];
    var api = client(platform({
        launchAppControl: function (control, appId, ok, fail) {
            calls.push(control.operation.split('/').pop());
            if (appId === null) return fail({ message: 'view unavailable' });
            assert.equal(appId, APP_ID);
            assert.equal(control.uri, null);
            assert.equal(control.payload.length, 1);
            assert.equal(control.payload[0].key, 'PAYLOAD');
            assert.equal(control.payload[0].value.length, 1);
            assert.equal(JSON.parse(control.payload[0].value[0]).values, 'v=' + ID);
            ok();
        },
    }));
    api.open(ID, function () { assert.fail('fallback succeeded'); });
    assert.equal(calls.join(','), 'view,default');
});

test('two rejected launch controls call onFail once and request an unavailable toast', function () {
    var calls = 0;
    var failures = 0;
    var events = [];
    var api = client(platform({
        launchAppControl: function (control, appId, ok, fail) { calls++; fail(); },
    }), events);
    api.open(ID, function () { failures++; });
    assert.equal(calls, 2);
    assert.equal(failures, 1);
    assert.equal(events.join(','), 'trailer-open,trailer-unavailable');
});

test('synchronous Tizen exceptions use the same fallback and failure path', function () {
    ['view', 'both', 'constructor', 'payload'].forEach(function (broken) {
        var failures = 0;
        var calls = 0;
        var tizen = platform({
            launchAppControl: function (control, appId, ok) {
                calls++;
                if (broken === 'both' || appId === null) throw new Error('SecurityError');
                ok();
            },
        });
        if (broken === 'constructor') tizen.ApplicationControl = function () { throw new Error('SecurityError'); };
        if (broken === 'payload') tizen.ApplicationControlData = function () { throw new Error('SecurityError'); };
        client(tizen).open(ID, function () { failures++; });
        assert.equal(failures, broken === 'view' ? 0 : 1, broken);
        assert.equal(calls, broken === 'constructor' ? 0 : broken === 'payload' ? 1 : 2, broken);
    });
});

test('availability caches a matching view control and shares an in-flight lookup', function () {
    var queries = 0;
    var complete;
    var answers = [];
    var api = client(platform({
        findAppControl: function (control, success) {
            queries++;
            assert.equal(control.operation, 'http://tizen.org/appcontrol/operation/view');
            assert.equal(control.uri, 'https://www.youtube.com/watch');
            complete = success;
        },
        getAppInfo: function () { assert.fail('view control matched'); },
    }));
    function answer(found) { answers.push(found); }
    api.available(answer);
    api.available(answer);
    assert.equal(answers.length, 0);
    complete([{ id: 'youtube.tv' }]);
    api.available(answer);
    assert.equal(queries, 1);
    assert.equal(answers.join(','), 'true,true,true');
});

test('availability checks the installed app after no match, lookup rejection or thrown privilege error', function () {
    ['empty', 'failure', 'throw', 'missing'].forEach(function (lookup) {
        var queries = 0;
        var application = {
            findAppControl: function (control, ok, fail) {
                if (lookup === 'throw') throw new Error('SecurityError');
                if (lookup === 'failure') return fail();
                ok([]);
            },
            getAppInfo: function (appId) { queries++; assert.equal(appId, APP_ID); return { id: APP_ID }; },
        };
        if (lookup === 'missing') delete application.findAppControl;
        var api = client(platform(application));
        api.available(function (answer) { assert.equal(answer, true, lookup); });
        api.available(function (answer) { assert.equal(answer, true, lookup); });
        assert.equal(queries, 1, lookup);
    });
});

test('an unavailable TV caches false even if YouTube is installed later in the session', function () {
    var queries = 0;
    var application = {
        findAppControl: function (control, ok) { queries++; ok([]); },
        getAppInfo: function () { throw new Error('NotFoundError'); },
    };
    var api = client(platform(application));
    api.available(function (answer) { assert.equal(answer, false); });
    application.getAppInfo = function () { return { id: APP_ID }; };
    api.available(function (answer) { assert.equal(answer, false); });
    assert.equal(queries, 1);
});

test('browser builds keep Trailer but opening it reports unavailable without a player', function () {
    var events = [];
    var failures = 0;
    var api = client(undefined, events);
    api.available(function (answer) { assert.equal(answer, true); });
    api.open(ID, function () { failures++; });
    assert.equal(failures, 1);
    assert.equal(events.join(','), 'trailer-unavailable');
    client({}).available(function (answer) { assert.equal(answer, false); });
});

test('invalid trailer input fails without launching another app', function () {
    var failures = 0;
    var api = client(platform({ launchAppControl: function () { assert.fail('invalid video id'); } }));
    api.open('https://example.com/watch?v=' + ID, function () { failures++; });
    assert.equal(failures, 1);
});
