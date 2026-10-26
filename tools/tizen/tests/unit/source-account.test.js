'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var load = require('./sandbox');

var DAY = 86400000;

function sandbox(overrides) {
    return load(['source-account.js'], {}, Object.assign({ Log: { error: function () {} } }, overrides)).globals.SourceAccount;
}

function info(extra) {
    return Object.assign({ auth: 1, status: 'Active', exp_date: String(Math.floor((Date.now() + 90 * DAY) / 1000)), active_cons: '0', max_connections: '2' }, extra);
}

function inDays(days) {
    return String(Math.floor((Date.now() + days * DAY) / 1000));
}

test('problem tells expired, inactive and a wrong login apart', function () {
    var account = sandbox();
    assert.equal(account.problem(info()), null);
    assert.equal(account.problem(info({ exp_date: null })), null);
    assert.equal(account.problem(info({ exp_date: inDays(-1) })).reason, 'expired');
    assert.equal(account.problem(info({ status: 'Expired' })).reason, 'expired');
    assert.equal(account.problem(info({ status: 'Disabled' })).reason, 'inactive');
    assert.equal(account.problem(info({ status: 'Banned', exp_date: inDays(-1) })).reason, 'inactive');
    assert.equal(account.problem(info({ auth: 0 })).reason, 'login');
    assert.equal(account.problem(undefined).reason, 'login');
    assert.equal(account.problem(info({ exp_date: inDays(-1) })).expires > 0, true);
});

test('daysLeft is only set inside the seven-day window', function () {
    var account = sandbox();
    assert.equal(account.daysLeft(info({ exp_date: inDays(3) })), 3);
    assert.equal(account.daysLeft(info({ exp_date: inDays(0.2) })), 1);
    assert.equal(account.daysLeft(info({ exp_date: inDays(8) })), 0);
    assert.equal(account.daysLeft(info({ exp_date: inDays(-1) })), 0);
    assert.equal(account.daysLeft(info({ exp_date: null })), 0);
});

test('warn speaks once per source and expiry', function () {
    var account = sandbox();
    var said = [];
    var source = { id: 's1' };
    account.warn(source, info({ exp_date: inDays(30) }), function (text) { said.push(text); });
    assert.equal(said.length, 0);
    var soon = info({ exp_date: inDays(2) });
    account.warn(source, soon, function (text, ms) { said.push(text + '|' + ms); });
    account.warn(source, soon, function (text) { said.push(text); });
    assert.equal(said.length, 1);
    assert.match(said[0], /^Account expires in 2 days \(.+\)\|6000$/);
    account.warn(source, info({ exp_date: inDays(4) }), function (text) { said.push(text); });
    assert.equal(said.length, 2);
});

test('track records a good account and the reason for a failed one', async function () {
    var account = sandbox();
    var source = { id: 's1', type: 'xtream' };
    await account.track(source, Promise.resolve(info()));
    assert.equal(account.row(source, true, '').chip, 'Xtream');
    var failure = Object.assign(new Error('x'), { code: 'account', reason: 'expired', info: info({ status: 'Expired', exp_date: inDays(-2) }) });
    await assert.rejects(account.track(source, Promise.reject(failure)));
    var row = account.row(source, true, '');
    assert.equal(row.chip, 'Expired');
    assert.equal(row.warn, true);
    assert.match(row.detail, /^Active · Expired /);
    await assert.rejects(account.track(source, Promise.reject(new Error('Source request timed out'))));
    assert.equal(account.row(source, false, '').chip, 'Not responding');
});

test('forget drops the check of an old login', async function () {
    var account = sandbox();
    var source = { id: 's1', type: 'xtream' };
    var late;
    var slow = new Promise(function (resolve) { late = resolve; });
    var tracked = account.track(source, slow);
    account.forget('s1');
    late(info());
    await tracked;
    assert.equal(account.row(source, false, '').detail, '');
});

test('rows show the guide, saved channel count and expiry; M3U shows no account', async function () {
    var saved = { 's1|live:items:': new Array(500), 's2|live:categories': [{ category_name: 'All', count: 12 }] };
    var account = sandbox({
        Catalogue: { get: function (id, key) { return Promise.resolve(saved[id + '|' + key]); } },
        XtreamSource: function () { return { account: function () { return Promise.resolve(info({ exp_date: inDays(3) })); } }; },
    });
    var xtream = { id: 's1', type: 'xtream' };
    var m3u = { id: 's2', type: 'm3u' };
    var changes = 0;
    account.refresh([xtream, m3u], function () { changes++; });
    await new Promise(function (resolve) { setTimeout(resolve, 20); });
    assert.equal(account.row(xtream, true, 'Guide: failed').detail, 'Active · Guide: failed · 500 channels · Expires in 3 days');
    assert.equal(account.row(m3u, false, '').detail, '12 channels');
    assert.equal(account.row(m3u, false, '').chip, 'M3U');
    assert.ok(changes >= 2);
    var labels = account.detailRows(xtream, null).map(function (r) { return r.label; });
    assert.equal(labels[0], 'Status: Active');
    assert.match(labels[1], /^Expires: /);
    assert.equal(labels[2], 'Connections: 0 / 2');
    assert.equal(labels[labels.length - 1], 'In the catalogue: 500 channels');
    assert.equal(account.detailRows(m3u, null)[0].label, '12 channels in the catalogue');
});

test('detail rows list the account, its formats and a failed check', async function () {
    var account = sandbox();
    var source = { id: 's1', type: 'xtream' };
    var labels = account.detailRows(source, info({ allowed_output_formats: ['m3u8', 'ts'], active_cons: '1' })).map(function (r) { return r.label; });
    assert.equal(labels.indexOf('Formats: m3u8, ts') >= 0, true);
    assert.equal(labels.indexOf('Connections: 1 / 2') >= 0, true);
    assert.equal(account.detailRows(source, info({ exp_date: null }))[1].label, 'Expires: Never');
    await assert.rejects(account.track(source, Promise.reject(new Error('Source request timed out'))));
    assert.equal(account.detailRows(source, null)[0].label, 'Status: Not responding');
});

test('the account screen names the problem and its date', function () {
    var account = sandbox();
    var expired = account.screen({ reason: 'expired', expires: Date.UTC(2026, 0, 17, 12) });
    assert.equal(expired[0], 'Account expired');
    assert.match(expired[1], /expired on .+\./);
    var inactive = account.screen({ reason: 'inactive', info: { status: 'Disabled' } });
    assert.equal(inactive[0], 'Account inactive');
    assert.match(inactive[1], /as disabled/);
    assert.equal(account.screen({ reason: 'login' })[0], 'Wrong login');
});
