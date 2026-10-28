window.SubtitleFile = (function () {
    'use strict';

    function timestamp(value) {
        var match = /^(?:(\d+):)?(\d{2}):(\d{2})[,.](\d{1,3})$/.exec(value);
        if (!match || Number(match[2]) > 59 || Number(match[3]) > 59) return NaN;
        return ((Number(match[1] || 0) * 60 + Number(match[2])) * 60 + Number(match[3])) * 1000 +
            Number((match[4] + '00').slice(0, 3));
    }

    function plain(text) {
        return text.replace(/<[^>]*>/g, '').replace(/\{\\[^}]*\}/g, '')
            .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, function (all, name) {
                return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }[name];
            }).trim();
    }

    // Advanced SubStation (.ass/.ssa, common for anime): each "Dialogue:" line
    // of [Events] is a cue; its text is the last field and may hold commas.
    // Override tags go, \N is a line break and vector drawings never show.
    function parseAss(text) {
        var cues = [];
        var fields = ['layer', 'start', 'end', 'style', 'name', 'marginl', 'marginr', 'marginv', 'effect', 'text'];
        var events = false;
        text.split('\n').forEach(function (line) {
            var trimmed = line.trim();
            if (/^\[.*\]$/.test(trimmed)) {
                events = /^\[events\]$/i.test(trimmed);
                return;
            }
            if (!events) return;
            var format = /^format\s*:(.*)$/i.exec(trimmed);
            if (format) {
                fields = format[1].split(',').map(function (field) { return field.trim().toLowerCase(); });
                return;
            }
            var dialogue = /^dialogue\s*:(.*)$/i.exec(trimmed);
            if (!dialogue) return;
            var parts = dialogue[1].split(',');
            var values = parts.slice(0, fields.length - 1).concat(parts.slice(fields.length - 1).join(','));
            var row = {};
            fields.forEach(function (field, i) { row[field] = (values[i] || '').trim(); });
            if (/\{[^}]*\\p[1-9]/.test(row.text)) return;
            var start = timestamp(row.start);
            var end = timestamp(row.end);
            var content = plain(String(row.text || '').replace(/\\N/gi, '\n').replace(/\\h/g, ' '));
            if (isFinite(start) && end > start && content) cues.push({ start: start, end: end, text: content });
        });
        return cues.sort(function (a, b) { return a.start - b.start; });
    }

    function parse(text) {
        var cues = [];
        var source = String(text || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
        if (/^\s*\[script info\]/i.test(source) || /^\[events\]/im.test(source)) return parseAss(source);
        source.split(/\n[ \t]*\n/).forEach(function (block) {
            var lines = block.split('\n');
            // VTT metadata and styling blocks must never become visible cues.
            if (/^(WEBVTT|NOTE|STYLE|REGION)(\s|$)/.test(lines[0])) return;
            var index = lines[0].indexOf('-->') >= 0 ? 0 : 1;
            var timing = /^\s*(\S+)\s+-->\s+(\S+)/.exec(lines[index] || '');
            if (!timing) return;
            var start = timestamp(timing[1]);
            var end = timestamp(timing[2]);
            var content = plain(lines.slice(index + 1).join('\n'));
            if (isFinite(start) && end > start && content) cues.push({ start: start, end: end, text: content });
        });
        return cues.sort(function (a, b) { return a.start - b.start; });
    }

    // scale stretches the cue clock when the subtitle was timed for another
    // frame rate: a cue at s shows at s * scale + offset on the video.
    function at(cues, time, offset, scale) {
        var now = (time - (offset || 0)) / (scale || 1);
        var text = [];
        // End is exclusive: adjacent cues must not flash together at their boundary.
        for (var i = 0; i < cues.length && cues[i].start <= now; i++) {
            if (now < cues[i].end) text.push(cues[i].text);
        }
        return text.join('\n');
    }

    return { parse: parse, at: at };
})();
