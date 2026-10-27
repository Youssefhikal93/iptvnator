// OpenSubtitles movie hash: the file size plus the 64-bit little-endian words of
// the first and last 64 KiB, modulo 2^64. Only two small range requests go to the
// provider before playback opens (ADR 0006); the file itself never leaves it and
// only the 16-digit hash is sent to OpenSubtitles. Logs reasons, never URLs.
window.MovieHash = (function () {
    'use strict';

    var BLOCK = 65536;
    var BUDGET_MS = 2000;
    var STORE = 'iptvnator-tv:movie-hashes';
    var KEEP = 200;
    var memory = {};

    // Sums 64-bit words as two 32-bit halves; both stay far below 2^53.
    function sums(bytes) {
        var view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        var low = 0;
        var high = 0;
        for (var i = 0; i + 8 <= bytes.byteLength; i += 8) {
            low += view.getUint32(i, true);
            high += view.getUint32(i + 4, true);
        }
        return { low: low, high: high };
    }

    // Returns 16 hex digits, or '' when the file or a block is too small.
    function compute(first, last, size) {
        if (!(size >= BLOCK) || !first || !last || first.byteLength !== BLOCK || last.byteLength !== BLOCK) return '';
        var a = sums(first);
        var b = sums(last);
        var thirtyTwo = BigInt(32);
        var total = BigInt(size) + BigInt(a.low) + BigInt(b.low) + ((BigInt(a.high) + BigInt(b.high)) << thirtyTwo);
        total = total % (BigInt(1) << BigInt(64));
        return ('0000000000000000' + total.toString(16)).slice(-16);
    }

    function stored() {
        try {
            var saved = JSON.parse(localStorage.getItem(STORE));
            return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
        } catch (e) { return {}; }
    }

    function remember(id, hash) {
        memory[id] = hash;
        try {
            var saved = stored();
            delete saved[id];
            saved[id] = hash;
            var keys = Object.keys(saved);
            keys.slice(0, Math.max(0, keys.length - KEEP)).forEach(function (old) { delete saved[old]; });
            localStorage.setItem(STORE, JSON.stringify(saved));
        } catch (e) {
            // A full store only costs a second lookup on the next play.
        }
    }

    function range(url, from, to, signal) {
        return fetch(url, { headers: { Range: 'bytes=' + from + '-' + to }, signal: signal }).then(function (res) {
            if (res.status !== 206) {
                if (res.body && res.body.cancel) res.body.cancel().catch(function () {});
                throw new Error(res.status >= 400 ? 'http' : 'norange');
            }
            var total = /\/(\d+)\s*$/.exec(res.headers.get('Content-Range') || '');
            return res.arrayBuffer().then(function (buffer) {
                return { bytes: new Uint8Array(buffer), size: total ? Number(total[1]) : 0 };
            });
        });
    }

    function reason(error, controller) {
        if (controller.signal.aborted) return 'timeout';
        return error && /^(http|norange|size)$/.test(error.message) ? error.message : 'error';
    }

    // Resolves to the hash or '' and never rejects. Sets request.movieHash.
    function prepare(request, url, options) {
        if (!request || request.live) return Promise.resolve('');
        if (!request.id || !Prefs.get('opensubtitlesApiKey')) {
            Log.info('moviehash skipped ' + (request.id ? 'nokey' : 'noid'));
            return Promise.resolve('');
        }
        var id = request.subtitleId || request.id;
        var known = memory[id] !== undefined ? memory[id] : stored()[id];
        if (known !== undefined) {
            if (known) request.movieHash = known;
            Log.info('moviehash ' + (known ? 'cached' : 'skipped earlier'));
            return Promise.resolve(known);
        }
        var controller = new AbortController();
        var timer = setTimeout(function () { controller.abort(); }, (options && options.budget) || BUDGET_MS);
        var first;
        return range(url, 0, BLOCK - 1, controller.signal).then(function (head) {
            first = head.bytes;
            if (!(head.size >= BLOCK) || first.byteLength !== BLOCK) throw new Error('size');
            return range(url, head.size - BLOCK, head.size - 1, controller.signal).then(function (tail) {
                var hash = compute(first, tail.bytes, head.size);
                if (!hash) throw new Error('size');
                return hash;
            });
        }).then(function (hash) {
            remember(id, hash);
            request.movieHash = hash;
            Log.info('moviehash ok');
            return hash;
        }, function (error) {
            memory[id] = '';
            Log.info('moviehash skipped ' + reason(error, controller));
            return '';
        }).then(function (hash) {
            clearTimeout(timer);
            return hash;
        });
    }

    return { compute: compute, prepare: prepare };
})();
