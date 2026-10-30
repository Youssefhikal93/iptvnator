'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var crypto = require('node:crypto');
var load = require('./sandbox');

function matrix(text) {
    return load(['qr.js']).globals.Qr.matrix(text);
}

// The matrix of this link decodes with an independent reader (checked once
// with jsQR); the hash catches any later change of the encoder.
test('the QR code of the phone link has not changed (#85)', function () {
    var rows = matrix('http://192.168.1.5:8777/ABCDEF');
    assert.equal(rows.length, 29);
    var hash = crypto.createHash('sha1').update(rows.map(function (row) { return row.map(function (dark) { return dark ? 1 : 0; }).join(''); }).join('\n')).digest('hex');
    assert.equal(hash, 'f5f4536c9b018c7331d3f74e00acd8d8876ed3ed');
});

test('QR codes have finder patterns, timing lines and the version by length', function () {
    [['a', 21], ['http://10.0.0.123:8777/K7M2QX', 29], [new Array(96).join('x'), 41]].forEach(function (pair) {
        var rows = matrix(pair[0]);
        assert.equal(rows.length, pair[1]);
        var size = rows.length;
        [[0, 0], [size - 7, 0], [0, size - 7]].forEach(function (corner) {
            for (var i = 0; i < 7; i++) {
                assert.ok(rows[corner[1]][corner[0] + i] && rows[corner[1] + 6][corner[0] + i], 'finder edge');
                assert.ok(rows[corner[1] + i][corner[0]] && rows[corner[1] + i][corner[0] + 6], 'finder edge');
            }
            assert.ok(!rows[corner[1] + 1][corner[0] + 1] && rows[corner[1] + 3][corner[0] + 3], 'finder middle');
        });
        for (var i = 8; i < size - 8; i++) assert.equal(rows[6][i], i % 2 === 0, 'timing');
    });
});

test('text that does not fit version 6 is refused', function () {
    assert.throws(function () { matrix(new Array(200).join('x')); }, /too long/);
});
