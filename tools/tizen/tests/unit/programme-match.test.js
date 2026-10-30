'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var load = require('./sandbox');
var match = load(['programme-match.js']).globals.ProgrammeMatch;
var now = new Date(2026, 9, 30, 12).getTime();
var hour = 3600000;

function programme(title, start, end) {
    return { title: title, start: start, end: end };
}

test('#81 matches titles across channels and groups exact start/end and local midnight boundaries', function () {
    var midnight = new Date(2026, 9, 31).getTime();
    var schedules = [{ channel: { stream_id: 1 }, programmes: [
        programme('Liverpool past', now - hour, now),
        programme('Liverpool live', now, now + hour),
        programme('Liverpool tonight', midnight - 1, midnight),
        programme('Liverpool tomorrow', midnight, midnight + hour),
        programme('Other title', now, now + hour),
    ] }, { channel: { stream_id: 2 }, programmes: [programme('LIVERPOOL next', now + hour, now + 2 * hour)] }];
    var before = JSON.stringify(schedules);
    var groups = match.search(match.index(schedules), '  liverpool  ', now);
    assert.equal(groups.now.map(function (entry) { return entry.programme.title; }).join(), 'Liverpool live');
    assert.equal(groups.today.map(function (entry) { return entry.programme.title; }).join(), 'LIVERPOOL next,Liverpool tonight');
    assert.equal(groups.today[0].channel.stream_id, 2);
    assert.equal(groups.coming[0].programme.start, midnight);
    assert.equal(groups.past[0].programme.end, now);
    assert.equal(JSON.stringify(schedules), before);
});

test('#81 ignores invalid schedules, deduplicates programmes per channel, and orders past newest first', function () {
    var valid = programme('مباراة Liverpool', now - hour, now);
    var index = match.index([{ channel: { stream_id: 1 }, programmes: [valid, valid, null,
        programme('', now, now + hour), programme('Liverpool', now, now),
        programme('Liverpool', NaN, now), programme('Liverpool old', now - 3 * hour, now - 2 * hour),
    ] }]);
    assert.equal(index.length, 2);
    assert.equal(match.search(index, 'مباراة', now).past.length, 1);
    assert.equal(match.search(index, 'Liverpool', now).past[0].programme, valid);
    [' ', 'missing'].forEach(function (query) {
        var groups = match.search(index, query, now);
        assert.equal(Object.keys(groups).reduce(function (count, group) { return count + groups[group].length; }, 0), 0);
    });
});

test('#81 reuses an index over 12,000 channels for successive queries', function () {
    var schedules = Array.from({ length: 12000 }, function (_, i) {
        return { channel: { stream_id: i }, programmes: [programme('Match ' + i, now, now + hour)] };
    });
    var index = match.index(schedules);
    assert.equal(match.search(index, 'Match', now).now.length, 12000);
    assert.equal(match.search(index, 'Match 11999', now).now[0].channel.stream_id, 11999);
});
