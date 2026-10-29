// Which sound tracks a movie or episode file holds, read from its header
// before AVPlay opens it (#55): Matroska lists each track's codec, language
// and channels in its Tracks element, MP4 in each trak box. AVPlay hides the
// tracks it cannot decode (DTS on Samsung TVs, #54), so the player's Audio
// list shows these too. Each file is read once and remembered; the reads end
// before AVPlay opens the stream, so they never share the provider's one
// connection (ADR 0006). Logs formats only.
window.MediaSniff = (function () {
    'use strict';

    var BLOCK = 65536;
    var BUDGET_MS = 2000;
    var STORE = 'iptvnator-tv:sniff-tracks';
    var KEEP = 50;
    var memory = {};

    // Matroska CodecIDs (by prefix) and MP4 sample entry types, as the log and labels name them.
    var MKV = [
        ['A_AAC', 'aac'], ['A_AC3', 'ac3'], ['A_EAC3', 'eac3'], ['A_DTS', 'dts'], ['A_TRUEHD', 'truehd'],
        ['A_OPUS', 'opus'], ['A_FLAC', 'flac'], ['A_VORBIS', 'vorbis'], ['A_MPEG/L3', 'mp3'], ['A_MPEG/L2', 'mp2'],
        ['A_PCM', 'pcm'], ['A_ALAC', 'alac'],
    ];
    var MP4 = {
        mp4a: 'aac', 'ac-3': 'ac3', 'ec-3': 'eac3', dtsc: 'dts', dtsh: 'dts', dtsl: 'dts', dtse: 'dts',
        Opus: 'opus', fLaC: 'flac', alac: 'alac', mlpa: 'truehd', '.mp3': 'mp3',
    };

    function ascii(bytes, from, to) {
        var text = '';
        for (var i = from; i < Math.min(to, bytes.byteLength); i++) text += String.fromCharCode(bytes[i]);
        return text;
    }

    function container(first) {
        if (first[0] === 0x1a && first[1] === 0x45 && first[2] === 0xdf && first[3] === 0xa3) return 'mkv';
        if (ascii(first, 4, 8) === 'ftyp') return 'mp4';
        if (first[0] === 0x47 && first[188] === 0x47) return 'ts';
        return 'unknown';
    }

    // ---- Matroska ----------------------------------------------------------

    // An EBML number at `at`: { value, length }; an `id` keeps its length
    // marker, and a size of all ones (unknown) is -1.
    function vint(bytes, at, id) {
        var first = bytes[at];
        if (!first) return null;
        var length = 1;
        while (!(first & (0x80 >> (length - 1)))) length++;
        if (at + length > bytes.byteLength) return null;
        var value = id ? first : first & (0xff >> length);
        var full = value === 0xff >> length;
        for (var i = 1; i < length; i++) {
            value = value * 256 + bytes[at + i];
            if (bytes[at + i] !== 0xff) full = false;
        }
        return { value: !id && full ? -1 : value, length: length };
    }

    // { id, start, end } of the element at `at`; an unknown size runs to the buffer's end.
    function element(bytes, at) {
        var id = vint(bytes, at, true);
        var size = id && vint(bytes, at + id.length, false);
        if (!size) return null;
        var start = at + id.length + size.length;
        return { id: id.value, start: start, end: size.value < 0 ? bytes.byteLength : start + size.value };
    }

    // Calls back with each child of [from, to) the buffer holds, even a cut-off last one.
    function children(bytes, from, to, back) {
        var at = from;
        var limit = Math.min(to, bytes.byteLength);
        while (at < limit) {
            var found = element(bytes, at);
            if (!found) return;
            back(found);
            at = found.end;
        }
    }

    function uint(bytes, found) {
        var value = 0;
        for (var i = found.start; i < Math.min(found.end, bytes.byteLength); i++) value = value * 256 + bytes[i];
        return value;
    }

    function text(bytes, found) {
        return ascii(bytes, found.start, found.end).replace(/\0+$/, '');
    }

    function mkvCodec(id) {
        var mark = MKV.filter(function (entry) { return id.indexOf(entry[0]) === 0; })[0];
        return mark ? mark[1] : id.replace(/^A_/, '').toLowerCase();
    }

    // The Tracks element (id 1654AE6B) in the block, or null. The SeekHead
    // names that id too, so only a match whose first child, past a CRC-32 or
    // Void element, is a TrackEntry counts.
    function findTracks(bytes) {
        for (var i = 0; i + 4 <= bytes.byteLength; i++) {
            if (bytes[i] !== 0x16 || bytes[i + 1] !== 0x54 || bytes[i + 2] !== 0xae || bytes[i + 3] !== 0x6b) continue;
            var found = element(bytes, i);
            var entry = found && element(bytes, found.start);
            while (entry && (entry.id === 0xbf || entry.id === 0xec)) entry = element(bytes, entry.end);
            if (entry && entry.id === 0xae) return found;
        }
        return null;
    }

    // The audio tracks of a Matroska block, or null when it holds no Tracks element.
    function mkvTracks(bytes) {
        var list = findTracks(bytes);
        if (!list) return null;
        var audio = [];
        children(bytes, list.start, list.end, function (entry) {
            if (entry.id !== 0xae) return;
            // Matroska's default language is English.
            var track = { codec: '', language: 'eng', channels: 0 };
            var type = 0;
            var tag = '';
            children(bytes, entry.start, entry.end, function (field) {
                if (field.id === 0x83) type = uint(bytes, field);
                else if (field.id === 0x86) track.codec = mkvCodec(text(bytes, field));
                else if (field.id === 0x22b59c) track.language = text(bytes, field);
                else if (field.id === 0x22b59d) tag = text(bytes, field);
                else if (field.id === 0xe1) {
                    children(bytes, field.start, field.end, function (sound) {
                        if (sound.id === 0x9f) track.channels = uint(bytes, sound);
                    });
                }
            });
            if (tag) track.language = tag;
            if (track.language === 'und') track.language = '';
            if (type === 2 && track.codec) audio.push(track);
        });
        return audio;
    }

    // ---- MP4 ---------------------------------------------------------------

    // Calls back with each box of [from, to) as { type, start, end }, even a cut-off last one.
    function boxes(bytes, from, to, back) {
        var at = from;
        var limit = Math.min(to, bytes.byteLength);
        while (at + 8 <= limit) {
            var view = new DataView(bytes.buffer, bytes.byteOffset + at);
            var size = view.getUint32(0);
            var head = 8;
            if (size === 1 && at + 16 <= limit) {
                size = view.getUint32(8) * 4294967296 + view.getUint32(12);
                head = 16;
            } else if (size === 0) {
                size = to - at;
            }
            if (size < head) return;
            back({ type: ascii(bytes, at + 4, at + 8), start: at + head, end: at + size });
            at += size;
        }
    }

    function inside(bytes, box, type, back) {
        boxes(bytes, box.start, box.end, function (child) { if (child.type === type) back(child); });
    }

    // mdhd packs the language as three 5-bit letters after its times.
    function mp4Language(bytes, mdhd) {
        var at = mdhd.start + (bytes[mdhd.start] === 1 ? 32 : 20);
        if (at + 2 > bytes.byteLength) return '';
        var packed = bytes[at] * 256 + bytes[at + 1];
        var code = String.fromCharCode(((packed >> 10) & 31) + 0x60, ((packed >> 5) & 31) + 0x60, (packed & 31) + 0x60);
        return /^[a-z]{3}$/.test(code) && code !== 'und' ? code : '';
    }

    // An audio sample entry's codec and channels; AC-3 keeps its real layout
    // in dac3 (acmod and the LFE bit), the entry itself says 2.
    function mp4Sound(bytes, entry, track) {
        track.codec = MP4[entry.type] || entry.type.trim().toLowerCase();
        if (entry.start + 18 <= bytes.byteLength) track.channels = bytes[entry.start + 16] * 256 + bytes[entry.start + 17];
        boxes(bytes, entry.start + 28, entry.end, function (dac3) {
            if (dac3.type !== 'dac3' || dac3.start + 3 > bytes.byteLength) return;
            var bits = (bytes[dac3.start + 1] << 8) | bytes[dac3.start + 2];
            track.channels = [2, 1, 2, 3, 3, 4, 4, 5][(bits >> 11) & 7] + ((bits >> 10) & 1);
        });
    }

    // The audio tracks of an MP4 block, or null when its moov box is elsewhere.
    function mp4Tracks(bytes) {
        var moov = null;
        boxes(bytes, 0, bytes.byteLength, function (box) { if (box.type === 'moov' && !moov) moov = box; });
        if (!moov) return null;
        var audio = [];
        inside(bytes, moov, 'trak', function (trak) {
            inside(bytes, trak, 'mdia', function (mdia) {
                var track = { codec: '', language: '', channels: 0 };
                var sound = false;
                inside(bytes, mdia, 'mdhd', function (mdhd) { track.language = mp4Language(bytes, mdhd); });
                inside(bytes, mdia, 'hdlr', function (hdlr) { sound = ascii(bytes, hdlr.start + 8, hdlr.start + 12) === 'soun'; });
                inside(bytes, mdia, 'minf', function (minf) {
                    inside(bytes, minf, 'stbl', function (stbl) {
                        inside(bytes, stbl, 'stsd', function (stsd) {
                            boxes(bytes, stsd.start + 8, stsd.end, function (entry) {
                                if (!track.codec) mp4Sound(bytes, entry, track);
                            });
                        });
                    });
                });
                if (sound && track.codec) audio.push(track);
            });
        });
        return audio;
    }

    // ---- Reading -------------------------------------------------------------

    // [{ codec, language, channels }] in file order, or null when the block holds no track list.
    function tracks(bytes) {
        var kind = container(bytes);
        if (kind === 'mkv') return mkvTracks(bytes);
        if (kind === 'mp4') return mp4Tracks(bytes);
        return null;
    }

    function line(kind, audio) {
        return 'media ' + kind + ' audio ' + (audio ? audio.map(function (track) { return track.codec; }).join(',') || 'none' : 'not found');
    }

    function saved() {
        try {
            var list = JSON.parse(Stored.text(STORE));
            return list && typeof list === 'object' && !Array.isArray(list) ? list : {};
        } catch (e) { return {}; }
    }

    function remember(id, audio) {
        memory[id] = audio;
        try {
            var list = saved();
            delete list[id];
            list[id] = audio;
            var keys = Object.keys(list);
            keys.slice(0, Math.max(0, keys.length - KEEP)).forEach(function (old) { delete list[old]; });
            Stored.save(STORE, list);
        } catch (e) {
            // A full store only costs a second read on the next play.
        }
    }

    // What an earlier read found for this file: an array, null (no track list) or undefined (not read).
    function known(request) {
        if (!request || !request.id) return undefined;
        return memory[request.id] !== undefined ? memory[request.id] : saved()[request.id];
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

    // Sets request.fileAudio to the file's sound tracks (null when unknown)
    // and resolves; never rejects. A file is read once: its first block (the
    // one MovieHash just read, when it did), and for a Matroska file whose
    // track list is not there, its last block.
    function prepare(request, url) {
        if (!request || request.live || !request.id) return Promise.resolve();
        var before = known(request);
        var head = request.fileHead;
        delete request.fileHead;
        if (before !== undefined) {
            request.fileAudio = before;
            return Promise.resolve();
        }
        var controller = new AbortController();
        var timer = setTimeout(function () { controller.abort(); }, BUDGET_MS);
        var kind = 'unknown';
        return (head ? Promise.resolve(head) : range(url, 0, BLOCK - 1, controller.signal)).then(function (first) {
            kind = container(first.bytes);
            var audio = tracks(first.bytes);
            if (audio || kind !== 'mkv' || !(first.size > BLOCK * 2)) return audio;
            return range(url, first.size - BLOCK, first.size - 1, controller.signal).then(function (last) {
                return mkvTracks(last.bytes);
            });
        }).then(function (audio) {
            Log.info(line(kind, audio));
            request.fileAudio = audio || null;
            remember(request.id, request.fileAudio);
        }, function (error) {
            Log.info('media check skipped ' + (controller.signal.aborted ? 'timeout' : error.message === 'norange' ? 'norange' : 'error'));
        }).then(function () {
            clearTimeout(timer);
        });
    }

    return { tracks: tracks, prepare: prepare, known: known };
})();
