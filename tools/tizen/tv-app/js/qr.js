// A small QR code encoder (#85): byte mode, error correction level M, versions
// 1 to 6 (up to 106 bytes), enough for the phone page's address. The phone
// page's link is the only thing it encodes.
window.Qr = (function () {
    'use strict';

    // Per version at level M: [error correction codewords per block, blocks of
    // [count, data codewords]], and the alignment pattern centres.
    var VERSIONS = [
        null,
        { ec: 10, blocks: [[1, 16]], align: [] },
        { ec: 16, blocks: [[1, 28]], align: [6, 18] },
        { ec: 26, blocks: [[1, 44]], align: [6, 22] },
        { ec: 18, blocks: [[2, 32]], align: [6, 26] },
        { ec: 24, blocks: [[2, 43]], align: [6, 30] },
        { ec: 16, blocks: [[4, 27]], align: [6, 34] },
    ];

    var EXP = [];
    var LOG = [];
    (function () {
        var x = 1;
        for (var i = 0; i < 255; i++) {
            EXP[i] = x;
            LOG[x] = i;
            x <<= 1;
            if (x & 256) x ^= 0x11d;
        }
    })();

    function multiply(a, b) {
        return a && b ? EXP[(LOG[a] + LOG[b]) % 255] : 0;
    }

    function remainder(data, degree) {
        var generator = [1];
        for (var i = 0; i < degree; i++) {
            var next = [];
            for (var j = 0; j <= generator.length; j++) {
                next[j] = (j < generator.length ? generator[j] : 0) ^ (j > 0 ? multiply(generator[j - 1], EXP[i]) : 0);
            }
            generator = next;
        }
        var result = [];
        for (var k = 0; k < degree; k++) result.push(0);
        data.forEach(function (byte) {
            var factor = byte ^ result.shift();
            result.push(0);
            for (var m = 0; m < degree; m++) result[m] ^= multiply(generator[m + 1], factor);
        });
        return result;
    }

    function dataCapacity(version) {
        return VERSIONS[version].blocks.reduce(function (sum, group) { return sum + group[0] * group[1]; }, 0);
    }

    function utf8(text) {
        var bytes = [];
        var encoded = unescape(encodeURIComponent(text));
        for (var i = 0; i < encoded.length; i++) bytes.push(encoded.charCodeAt(i));
        return bytes;
    }

    function codewords(bytes, version) {
        var bits = [];
        var push = function (value, length) {
            for (var i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
        };
        push(4, 4);
        push(bytes.length, 8);
        bytes.forEach(function (byte) { push(byte, 8); });
        var capacity = dataCapacity(version) * 8;
        push(0, Math.min(4, capacity - bits.length));
        while (bits.length % 8) bits.push(0);
        var data = [];
        for (var i = 0; i < bits.length; i += 8) {
            var byte = 0;
            for (var j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
            data.push(byte);
        }
        for (var pad = 0xec; data.length < capacity / 8; pad ^= 0xec ^ 0x11) data.push(pad);
        // Split into blocks, add each block's error correction, interleave.
        var info = VERSIONS[version];
        var blocks = [];
        var at = 0;
        info.blocks.forEach(function (group) {
            for (var b = 0; b < group[0]; b++) {
                var chunk = data.slice(at, at + group[1]);
                at += group[1];
                blocks.push({ data: chunk, ec: remainder(chunk, info.ec) });
            }
        });
        var out = [];
        var longest = Math.max.apply(null, blocks.map(function (block) { return block.data.length; }));
        for (var d = 0; d < longest; d++) blocks.forEach(function (block) { if (d < block.data.length) out.push(block.data[d]); });
        for (var e = 0; e < info.ec; e++) blocks.forEach(function (block) { out.push(block.ec[e]); });
        return out;
    }

    function blank(size) {
        var rows = [];
        for (var y = 0; y < size; y++) {
            rows[y] = [];
            for (var x = 0; x < size; x++) rows[y][x] = false;
        }
        return rows;
    }

    // The fixed patterns; `reserved` marks the modules the data must skip.
    function frame(version) {
        var size = version * 4 + 17;
        var modules = blank(size);
        var reserved = blank(size);
        var set = function (x, y, dark) {
            if (x < 0 || y < 0 || x >= size || y >= size) return;
            modules[y][x] = dark;
            reserved[y][x] = true;
        };
        [[0, 0], [size - 7, 0], [0, size - 7]].forEach(function (corner) {
            for (var dy = -1; dy <= 7; dy++) {
                for (var dx = -1; dx <= 7; dx++) {
                    var edge = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
                    set(corner[0] + dx, corner[1] + dy, edge !== 4 && edge !== 2 && edge <= 3 && dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6);
                }
            }
        });
        for (var i = 8; i < size - 8; i++) {
            set(i, 6, i % 2 === 0);
            set(6, i, i % 2 === 0);
        }
        var centres = VERSIONS[version].align;
        centres.forEach(function (cy, yi) {
            centres.forEach(function (cx, xi) {
                var onFinder = (xi === 0 && yi === 0) || (xi === 0 && yi === centres.length - 1) || (xi === centres.length - 1 && yi === 0);
                if (onFinder) return;
                for (var dy = -2; dy <= 2; dy++) {
                    for (var dx = -2; dx <= 2; dx++) set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
                }
            });
        });
        // Format information areas and the dark module.
        for (var f = 0; f < 15; f++) {
            if (f < 6) set(8, f, false);
            else if (f < 8) set(8, f + 1, false);
            else set(14 - f, 8, false);
            if (f < 8) set(size - 1 - f, 8, false);
            else set(8, size - 15 + f, false);
        }
        set(7, 8, false);
        set(8, 8, false);
        set(8, size - 8, true);
        return { size: size, modules: modules, reserved: reserved };
    }

    function place(base, words) {
        var size = base.size;
        var bits = [];
        words.forEach(function (word) {
            for (var i = 7; i >= 0; i--) bits.push((word >>> i) & 1);
        });
        var index = 0;
        for (var right = size - 1; right >= 1; right -= 2) {
            if (right === 6) right = 5;
            for (var v = 0; v < size; v++) {
                for (var j = 0; j < 2; j++) {
                    var x = right - j;
                    var upward = ((right + 1) & 2) === 0;
                    var y = upward ? size - 1 - v : v;
                    if (!base.reserved[y][x]) {
                        base.modules[y][x] = index < bits.length && bits[index] === 1;
                        index++;
                    }
                }
            }
        }
    }

    function masked(base, mask) {
        var size = base.size;
        var test = [
            function (x, y) { return (x + y) % 2 === 0; },
            function (x, y) { return y % 2 === 0; },
            function (x, y) { return x % 3 === 0; },
            function (x, y) { return (x + y) % 3 === 0; },
            function (x, y) { return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; },
            function (x, y) { return ((x * y) % 2) + ((x * y) % 3) === 0; },
            function (x, y) { return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; },
            function (x, y) { return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0; },
        ][mask];
        var rows = base.modules.map(function (row, y) {
            return row.map(function (dark, x) { return base.reserved[y][x] ? dark : dark !== test(x, y); });
        });
        // Format information: level M (00) and the mask, BCH protected.
        var remainderBits = mask;
        for (var i = 0; i < 10; i++) remainderBits = (remainderBits << 1) ^ ((remainderBits >>> 9) * 0x537);
        var format = ((mask << 10) | remainderBits) ^ 0x5412;
        var bit = function (n) { return ((format >>> n) & 1) === 1; };
        for (var n = 0; n < 15; n++) {
            if (n < 6) rows[n][8] = bit(n);
            else if (n < 8) rows[n + 1][8] = bit(n);
            else rows[8][n < 9 ? 7 : 14 - n] = bit(n);
            if (n < 8) rows[8][size - 1 - n] = bit(n);
            else rows[size - 15 + n][8] = bit(n);
        }
        return rows;
    }

    // Runs of five or more and two-by-two blocks of one colour cost points.
    function penalty(rows) {
        var size = rows.length;
        var score = 0;
        for (var a = 0; a < size; a++) {
            [true, false].forEach(function (horizontal) {
                var run = 1;
                for (var b = 1; b < size; b++) {
                    var same = horizontal ? rows[a][b] === rows[a][b - 1] : rows[b][a] === rows[b - 1][a];
                    run = same ? run + 1 : 1;
                    if (run === 5) score += 3;
                    else if (run > 5) score += 1;
                }
            });
        }
        for (var y = 0; y < size - 1; y++) {
            for (var x = 0; x < size - 1; x++) {
                if (rows[y][x] === rows[y][x + 1] && rows[y][x] === rows[y + 1][x] && rows[y][x] === rows[y + 1][x + 1]) score += 3;
            }
        }
        return score;
    }

    // The dark modules of the code for `text`, as rows of booleans.
    function matrix(text) {
        var bytes = utf8(text);
        var version = 1;
        while (version < VERSIONS.length && bytes.length > dataCapacity(version) - 2) version++;
        if (version >= VERSIONS.length) throw new Error('qr: text too long');
        var base = frame(version);
        place(base, codewords(bytes, version));
        var best = null;
        var bestScore = Infinity;
        for (var mask = 0; mask < 8; mask++) {
            var rows = masked(base, mask);
            var score = penalty(rows);
            if (score < bestScore) {
                best = rows;
                bestScore = score;
            }
        }
        return best;
    }

    // Draws black modules on white, with the four-module quiet zone scanners need.
    function draw(canvas, text, scale) {
        var rows = matrix(text);
        var side = (rows.length + 8) * scale;
        canvas.width = side;
        canvas.height = side;
        var context = canvas.getContext('2d');
        context.fillStyle = '#fff';
        context.fillRect(0, 0, side, side);
        context.fillStyle = '#000';
        rows.forEach(function (row, y) {
            row.forEach(function (dark, x) {
                if (dark) context.fillRect((x + 4) * scale, (y + 4) * scale, scale, scale);
            });
        });
    }

    return { matrix: matrix, draw: draw };
})();
