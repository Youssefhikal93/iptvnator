// What the player menu lists for the stream that plays: audio and subtitle
// tracks, and the Stream info lines. The player reads each engine (AVPlay,
// hls.js, the <video> element) and hands the plain data over; nothing here
// touches an engine, so the lists are unit-testable from fake engine output.
//
// Track lists are { audio: [...], text: [...] } of { label, active, ref },
// where `ref` is what the player needs to switch to that track again (AVPlay's
// track index, hls.js's index, the <video> track object) and -1 or null is
// "Off". Labels fall back to the track's language, then to "Track n".
window.PlayerTracks = (function () {
    'use strict';

    var SUBTITLE_KINDS = ['subtitles', 'captions'];

    function languageName(code) {
        if (!code) return '';
        try {
            return new Intl.DisplayNames([I18n.locale()], { type: 'language' }).of(code) || code;
        } catch (e) {
            return String(code).toUpperCase();
        }
    }

    function off(active, ref) {
        return { label: I18n.t('common.off'), active: active, ref: ref };
    }

    // AVPlay's getTotalTrackInfo() entries of one type; extra_info is JSON text.
    function avOfType(total, type) {
        var out = [];
        (total || []).forEach(function (track) {
            if (track.type !== type) return;
            var extra = {};
            try {
                extra = JSON.parse(track.extra_info) || {};
            } catch (e) {
                // No details.
            }
            out.push({ index: track.index, label: languageName(extra.language), extra: extra });
        });
        out.forEach(function (track, i) {
            if (!track.label) track.label = I18n.t('player.track', { n: i + 1 });
        });
        return out;
    }

    // The index AVPlay says is playing for a type (getCurrentStreamInfo()), or -1.
    function avCurrentIndex(streams, type) {
        var found = (streams || []).filter(function (info) {
            return info.type === type;
        })[0];
        return found ? found.index : -1;
    }

    // ---- The file's own sound tracks (#55) --------------------------------

    var CODEC_NAMES = {
        aac: 'AAC', ac3: 'AC-3', eac3: 'E-AC-3', dts: 'DTS', truehd: 'TrueHD', opus: 'Opus',
        flac: 'FLAC', mp3: 'MP3', mp2: 'MP2', vorbis: 'Vorbis', pcm: 'PCM', alac: 'ALAC',
    };
    // Sound Samsung TVs cannot decode; AVPlay leaves these tracks out of its list (#54).
    var UNSUPPORTED = ['dts', 'truehd'];
    var LAYOUTS = { 1: '1.0', 2: '2.0', 6: '5.1', 8: '7.1' };

    // "English · DTS 5.1" for a track MediaSniff read from the file.
    function fileLabel(track, n) {
        var format = [CODEC_NAMES[track.codec] || String(track.codec).toUpperCase(),
            LAYOUTS[track.channels] || (track.channels ? track.channels + ' ch' : '')].filter(Boolean).join(' ');
        return (languageName(track.language) || I18n.t('player.track', { n: n + 1 })) + ' · ' + format;
    }

    // AVPlay's audio rows, named from the file's tracks (`file`, MediaSniff's
    // list) when the two line up: the same count, or the same count once the
    // tracks the TV cannot decode are left out. Those are then listed too, in
    // the file's order, with `unsupported` set and no ref.
    function avAudio(total, audioIndex, file) {
        var playable = avOfType(total, 'AUDIO').map(function (track) {
            return { label: track.label, language: track.extra.language || '', active: track.index === audioIndex, ref: track.index };
        });
        if (!file || !file.length) return playable;
        var blocked = file.filter(function (track) { return UNSUPPORTED.indexOf(track.codec) >= 0; });
        var every = file.length === playable.length;
        if (!every && file.length - blocked.length !== playable.length) return playable;
        var next = 0;
        return file.map(function (track, n) {
            if (!every && UNSUPPORTED.indexOf(track.codec) >= 0) {
                return { label: fileLabel(track, n), language: track.language, active: false, ref: null, unsupported: true };
            }
            var row = playable[next++];
            return { label: fileLabel(track, n), language: track.language || row.language, active: row.active, ref: row.ref };
        });
    }

    // `audioIndex` and `textIndex` are the selected tracks' AVPlay indexes; -1
    // is none. `file` is the file's own sound tracks, when known.
    function av(total, audioIndex, textIndex, file) {
        var text = avOfType(total, 'TEXT').map(function (track) {
            return { label: track.label, active: track.index === textIndex, ref: track.index };
        });
        text.unshift(off(textIndex < 0, -1));
        return { audio: avAudio(total, audioIndex, file), text: text };
    }

    // `hls` is the hls.js instance, or any object with its track fields.
    function hls(hls) {
        var audio = (hls.audioTracks || []).map(function (track, n) {
            return {
                label: track.name || languageName(track.lang) || I18n.t('player.track', { n: n + 1 }),
                language: track.lang || '',
                active: hls.audioTrack === n,
                ref: n,
            };
        });
        var text = [off(hls.subtitleTrack < 0, -1)];
        (hls.subtitleTracks || []).forEach(function (track, n) {
            text.push({
                label: track.name || languageName(track.lang) || I18n.t('player.subtitle', { n: n + 1 }),
                active: hls.subtitleTrack === n,
                ref: n,
            });
        });
        return { audio: audio, text: text };
    }

    // A <video> track list as an array, keeping only the given kinds when set.
    function nativeList(list, kinds) {
        var out = [];
        if (!list) return out;
        for (var i = 0; i < list.length; i++) {
            if (kinds && kinds.indexOf(list[i].kind) === -1) continue;
            out.push(list[i]);
        }
        return out;
    }

    function nativeSubtitles(textTracks) {
        return nativeList(textTracks, SUBTITLE_KINDS);
    }

    // `audioTracks` and `textTracks` are video.audioTracks and video.textTracks;
    // each entry's ref is the track object. Off is listed only beside a subtitle.
    function native(audioTracks, textTracks) {
        var audio = nativeList(audioTracks).map(function (track, n) {
            return {
                label: track.label || languageName(track.language) || I18n.t('player.track', { n: n + 1 }),
                language: track.language || '',
                active: track.enabled,
                ref: track,
            };
        });
        var subs = nativeSubtitles(textTracks);
        var text = [];
        if (subs.length) {
            text.push(off(subs.every(function (t) { return t.mode !== 'showing'; }), null));
        }
        subs.forEach(function (track, n) {
            text.push({
                label: track.label || languageName(track.language) || I18n.t('player.subtitle', { n: n + 1 }),
                active: track.mode === 'showing',
                ref: track,
            });
        });
        return { audio: audio, text: text };
    }

    // ---- Stream info ------------------------------------------------------

    // The first non-empty field of an AVPlay extra_info object under any of
    // these lower-case names; firmware spells them differently.
    function pick(obj, names) {
        for (var i = 0; i < names.length; i++) {
            for (var key in obj) {
                if (key.toLowerCase() === names[i] && obj[key]) return obj[key];
            }
        }
        return '';
    }

    function bitrate(bps) {
        bps = Number(bps);
        if (!bps) return '';
        return bps >= 1e6 ? (bps / 1e6).toFixed(1) + ' Mbps' : Math.round(bps / 1000) + ' kbps';
    }

    var ENGINE_NAMES = { avplay: 'Samsung AVPlay', hls: 'hls.js', mpegts: 'mpegts.js', video: 'HTML5 video' };

    // data: engine ('avplay', 'hls', 'mpegts' or 'video'); for AVPlay, streams
    // (getCurrentStreamInfo()); otherwise width and height of the <video> and,
    // for hls.js, level, the playing quality level ({ bitrate }) or null.
    function infoLines(data) {
        var lines = [];
        if (data.engine === 'avplay') {
            (data.streams || []).forEach(function (info) {
                var extra = {};
                try {
                    extra = JSON.parse(info.extra_info) || {};
                } catch (e) {
                    return;
                }
                var parts = [];
                if (info.type === 'VIDEO') {
                    var w = pick(extra, ['width']);
                    var h = pick(extra, ['height']);
                    if (w && h) parts.push(w + '×' + h);
                    parts.push(pick(extra, ['codec', 'fourcc']));
                    parts.push(bitrate(pick(extra, ['bit_rate', 'bitrate'])));
                    lines.push(I18n.t('player.info.video') + '  ' + parts.filter(Boolean).join(' · '));
                } else if (info.type === 'AUDIO') {
                    parts.push(languageName(pick(extra, ['language'])));
                    parts.push(pick(extra, ['codec']));
                    var ch = pick(extra, ['channels']);
                    if (ch) parts.push(ch + ' ch');
                    var rate = pick(extra, ['sample_rate']);
                    if (rate) parts.push(rate + ' Hz');
                    parts.push(bitrate(pick(extra, ['bit_rate', 'bitrate'])));
                    lines.push(I18n.t('player.audio') + '  ' + parts.filter(Boolean).join(' · '));
                }
            });
        } else {
            if (data.width) lines.push(I18n.t('player.info.video') + '  ' + data.width + '×' + data.height);
            if (data.engine === 'hls' && data.level) {
                lines.push(I18n.t('player.info.bitrate') + '  ' + bitrate(data.level.bitrate));
            }
        }
        lines.push(I18n.t('player.info.player') + '  ' + ENGINE_NAMES[data.engine]);
        return lines;
    }

    return {
        languageName: languageName,
        avCurrentIndex: avCurrentIndex,
        av: av,
        hls: hls,
        native: native,
        nativeList: nativeList,
        nativeSubtitles: nativeSubtitles,
        infoLines: infoLines,
        unsupported: function (codec) { return UNSUPPORTED.indexOf(codec) >= 0; },
        codecName: function (codec) { return CODEC_NAMES[codec] || String(codec).toUpperCase(); },
    };
})();
