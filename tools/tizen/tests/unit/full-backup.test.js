'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var load = require('./sandbox');

function backup(stored) {
    var env = load(['full-backup.js'], stored);
    return { api: env.globals.FullBackup, stored: env.stored };
}

var TV = {
    'iptvnator-tv:sources': '[{"id":"s1","pass":"secret"}]',
    'iptvnator-tv:profile:kids:settings': '{"language":"ar"}',
    'iptvnator-tv:pin': '"hash"',
    'other-app': 'keep',
};

test('a full backup holds every Jotv record as stored, and nothing of other apps', function () {
    var api = backup(TV).api;
    var made = api.collect();
    assert.equal(made.kind, 'jotv-full-backup');
    assert.equal(JSON.stringify(Object.keys(made.data)), JSON.stringify(['iptvnator-tv:pin', 'iptvnator-tv:profile:kids:settings', 'iptvnator-tv:sources']));
    assert.equal(made.data['iptvnator-tv:sources'], TV['iptvnator-tv:sources']);
});

test('restoring on a fresh TV puts every record back and removes records the backup does not have', function () {
    var text = JSON.stringify(backup(TV).api.collect());
    var fresh = backup({ 'iptvnator-tv:sources': '[]', 'iptvnator-tv:new-thing': '1', 'other-app': 'x' });
    fresh.api.apply(fresh.api.parse(text));
    assert.equal(fresh.stored['iptvnator-tv:sources'], TV['iptvnator-tv:sources']);
    assert.equal(fresh.stored['iptvnator-tv:profile:kids:settings'], TV['iptvnator-tv:profile:kids:settings']);
    assert.equal(fresh.stored['iptvnator-tv:new-thing'], undefined);
    assert.equal(fresh.stored['other-app'], 'x');
});

test('a file that is not a Jotv full backup is refused', function () {
    var api = backup({}).api;
    assert.throws(function () { api.parse('{"kind":"iptvnator-playlist-backup","data":{}}'); });
    assert.throws(function () { api.parse(JSON.stringify({ kind: 'jotv-full-backup', version: 1, data: { 'evil': 'x' } })); });
    assert.throws(function () { api.parse('not json'); });
});
