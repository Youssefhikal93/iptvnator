// Reads the files of a small zip (SubDL serves subtitles zipped, #52)
// without a library: the central directory names each file, and stored or
// deflated data is unpacked with the browser's DecompressionStream.
window.ZipFile = (function () {
    'use strict';

    var MAX_FILES = 50;
    var MAX_SIZE = 2000000; // Bytes per unpacked file; a subtitle is far smaller.

    function failure() {
        var error = new Error('Invalid zip file');
        error.code = 'badFile';
        error.status = 0;
        return error;
    }

    function inflate(bytes) {
        var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        return new Response(stream).arrayBuffer().then(function (buffer) { return new Uint8Array(buffer); });
    }

    // [{ name, size, read() -> Promise<Uint8Array> }] for every file in the zip.
    function entries(buffer) {
        var bytes = new Uint8Array(buffer);
        var view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        var end = -1;
        // The end record sits in the last 22 bytes plus an optional comment.
        for (var at = bytes.length - 22; at >= Math.max(0, bytes.length - 65557); at--) {
            if (view.getUint32(at, true) === 0x06054b50) {
                end = at;
                break;
            }
        }
        if (end < 0) throw failure();
        var count = view.getUint16(end + 10, true);
        var cursor = view.getUint32(end + 16, true);
        var list = [];
        for (var i = 0; i < Math.min(count, MAX_FILES); i++) {
            if (cursor + 46 > bytes.length || view.getUint32(cursor, true) !== 0x02014b50) throw failure();
            var method = view.getUint16(cursor + 10, true);
            var packed = view.getUint32(cursor + 20, true);
            var size = view.getUint32(cursor + 24, true);
            var nameLength = view.getUint16(cursor + 28, true);
            var local = view.getUint32(cursor + 42, true);
            var name = new TextDecoder().decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
            cursor += 46 + nameLength + view.getUint16(cursor + 30, true) + view.getUint16(cursor + 32, true);
            if (/\/$/.test(name)) continue;
            list.push({ name: name, size: size, read: reader(bytes, view, local, method, packed, size) });
        }
        return list;
    }

    function reader(bytes, view, local, method, packed, size) {
        return function () {
            if (size > MAX_SIZE || local + 30 > bytes.length || view.getUint32(local, true) !== 0x04034b50) return Promise.reject(failure());
            var start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
            var data = bytes.subarray(start, start + packed);
            if (method === 0) return Promise.resolve(data);
            if (method === 8) return inflate(data).catch(function () { throw failure(); });
            return Promise.reject(failure());
        };
    }

    function decode(bytes) {
        var text;
        try {
            text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        } catch (e) {
            // Older Arabic subtitles are often Windows-1256 rather than UTF-8.
            var arabic = new TextDecoder('windows-1256').decode(bytes);
            text = /[\u0600-\u06ff]{3}/.test(arabic) ? arabic : new TextDecoder('windows-1252').decode(bytes);
        }
        return text.replace(/^\uFEFF/, '');
    }

    // Whether a file or release name says it is this episode (S01E02, 1x02).
    function tagged(text, season, episode) {
        var tag = new RegExp('s0*' + season + '\\W?e0*' + episode + '(?!\\d)|\\b0*' + season + 'x0*' + episode + '(?!\\d)', 'i');
        return tag.test(String(text || ''));
    }

    // A pack file named by its episode number without an SxxEyy tag:
    // "03 Title.srt", "E03.srt", "Episode 3.srt", "One Piece - 05 720p.ass", or
    // season and episode run together, "Paranormal 102 Title.srt" (S1 E2).
    function numbered(text, episode, season) {
        var base = String(text || '').split('/').pop();
        if (anyTag(base)) return false;
        if (new RegExp('^(?:e|ep|episode)?[\\s._-]*0*' + episode + '(?!\\d)', 'i').test(base)) return true;
        if (new RegExp('\\s-\\s*(?:e|ep)?0*' + episode + '(?![\\dpx])', 'i').test(base)) return true;
        var compact = season > 0 && season < 10 && episode < 100 ? String(season) + (episode < 10 ? '0' : '') + episode : '';
        return !!compact && new RegExp('(?:^|[\\s._-])' + compact + '(?![\\dpx])', 'i').test(base);
    }

    // Whether a name says the file is forced: only signs and foreign lines.
    function forced(text) {
        return /(^|[^a-z0-9])(forced|foreign[\s._-]?parts?)([^a-z0-9]|$)/i.test(String(text || ''));
    }

    // Whether a name says it is some episode at all.
    function anyTag(text) {
        return /s\d+\W?e\d+|\b\d+x\d+\b/i.test(String(text || ''));
    }

    // The subtitle file in the zip; with several, the one naming the episode.
    function pick(list, match) {
        // .srt first: with both, the plain file is the one to show.
        // Full files before forced ones, then .srt before .ass.
        var files = list.filter(function (entry) { return /\.(srt|vtt|ass|ssa)$/i.test(entry.name); })
            .sort(function (a, b) {
                return forced(a.name) - forced(b.name) || /\.(ass|ssa)$/i.test(a.name) - /\.(ass|ssa)$/i.test(b.name);
            });
        var season = Number(match && match.season);
        var episode = Number(match && match.episode);
        if (files.length > 1 && episode) {
            var named = files.filter(function (entry) { return tagged(entry.name, season, episode); })[0]
                || files.filter(function (entry) { return numbered(entry.name, episode, season); })[0];
            if (named) return named;
        }
        // A season pack without this episode's file must not play another episode.
        if (match && match.pack && files.length > 1) return null;
        return files[0];
    }

    function safeEntries(buffer) {
        try {
            return entries(buffer);
        } catch (error) {
            throw error && error.code ? error : failure();
        }
    }

    return {
        entries: safeEntries,
        tagged: tagged,
        anyTag: anyTag,
        numbered: numbered,
        forced: forced,
        // A subtitle file served as is, not zipped.
        text: function (buffer) { return decode(new Uint8Array(buffer)); },
        // The text of the subtitle a provider's zip holds for match.
        subtitle: function (buffer, match) {
            var file = pick(safeEntries(buffer), match);
            if (!file) return Promise.reject(failure());
            return file.read().then(decode);
        },
    };
})();
