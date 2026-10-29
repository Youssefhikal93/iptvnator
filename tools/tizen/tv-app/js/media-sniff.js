// Which container and sound formats a movie or episode file holds, read from
// its first and last 64 KiB: Matroska names each track's codec there (A_DTS,
// A_AAC...) and MP4 its sample entries (mp4a, ac-3...). Used when AVPlay finds
// no audio track, to log which sound it could not take. Logs formats only.
window.MediaSniff = (function () {
    'use strict';

    var BLOCK = 65536;
    var BUDGET_MS = 2000;
    var STORE = 'iptvnator-tv:sniff';
    var KEEP = 20;

    // Matroska CodecIDs and MP4 sample entry types, as the log names them.
    var MARKS = [
        ['A_AAC', 'aac'], ['A_AC3', 'ac3'], ['A_EAC3', 'eac3'], ['A_DTS', 'dts'], ['A_TRUEHD', 'truehd'],
        ['A_OPUS', 'opus'], ['A_FLAC', 'flac'], ['A_VORBIS', 'vorbis'], ['A_MPEG/L3', 'mp3'], ['A_MPEG/L2', 'mp2'],
        ['A_PCM', 'pcm'], ['mp4a', 'aac'], ['ac-3', 'ac3'], ['ec-3', 'eac3'], ['dtsc', 'dts'], ['dtsh', 'dts-hd'],
        ['dtsl', 'dts-hd'], ['Opus', 'opus'], ['fLaC', 'flac'], ['alac', 'alac'], ['mlpa', 'truehd'],
    ];

    function ascii(bytes) {
        var text = '';
        for (var i = 0; i < bytes.byteLength; i += 4096) {
            text += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + 4096, bytes.byteLength)));
        }
        return text;
    }

    function container(first) {
        if (first[0] === 0x1a && first[1] === 0x45 && first[2] === 0xdf && first[3] === 0xa3) return 'mkv';
        if (ascii(first.subarray(4, 8)) === 'ftyp') return 'mp4';
        if (first[0] === 0x47 && first[188] === 0x47) return 'ts';
        return 'unknown';
    }

    // { container, audio: ['dts', 'aac'] } from the file's first and last blocks.
    function scan(first, last) {
        var text = ascii(first) + (last ? ascii(last) : '');
        var audio = [];
        MARKS.forEach(function (mark) {
            if (text.indexOf(mark[0]) >= 0 && audio.indexOf(mark[1]) < 0) audio.push(mark[1]);
        });
        return { container: container(first), audio: audio };
    }

    function line(found) {
        return 'media ' + found.container + ' audio ' + (found.audio.join(',') || 'none found');
    }

    function flagged() {
        try {
            var saved = JSON.parse(localStorage.getItem(STORE));
            return Array.isArray(saved) ? saved : [];
        } catch (e) { return []; }
    }

    function save(list) {
        try {
            localStorage.setItem(STORE, JSON.stringify(list.slice(-KEEP)));
        } catch (e) {
            // Without storage the next play just skips the check.
        }
    }

    // AVPlay found no audio track: read the file on its next start, before
    // AVPlay opens it, so the reads never share the provider's one connection.
    function flag(request) {
        if (!request || request.live || !request.id) return;
        var list = flagged().filter(function (id) { return id !== request.id; });
        list.push(request.id);
        save(list);
    }

    function range(url, from, to, signal) {
        return fetch(url, { headers: { Range: 'bytes=' + from + '-' + to }, signal: signal }).then(function (res) {
            if (res.status !== 206) {
                if (res.body && res.body.cancel) res.body.cancel().catch(function () {});
                throw new Error('norange');
            }
            var total = /\/(\d+)\s*$/.exec(res.headers.get('Content-Range') || '');
            return res.arrayBuffer().then(function (buffer) {
                return { bytes: new Uint8Array(buffer), size: total ? Number(total[1]) : 0 };
            });
        });
    }

    // Resolves (never rejects) once a flagged file is read and logged; at once otherwise.
    function prepare(request, url) {
        if (!request || request.live || flagged().indexOf(request.id) < 0) return Promise.resolve();
        save(flagged().filter(function (id) { return id !== request.id; }));
        var controller = new AbortController();
        var timer = setTimeout(function () { controller.abort(); }, BUDGET_MS);
        return range(url, 0, BLOCK - 1, controller.signal).then(function (head) {
            if (!(head.size > BLOCK * 2)) return scan(head.bytes);
            return range(url, head.size - BLOCK, head.size - 1, controller.signal).then(function (tail) {
                return scan(head.bytes, tail.bytes);
            });
        }).then(function (found) {
            Log.info(line(found));
        }, function (error) {
            Log.info('media check skipped ' + (controller.signal.aborted ? 'timeout' : error.message === 'norange' ? 'norange' : 'error'));
        }).then(function () {
            clearTimeout(timer);
        });
    }

    return { scan: scan, line: line, flag: flag, prepare: prepare };
})();
