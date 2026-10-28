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

    function parse(text) {
        var cues = [];
        String(text || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split(/\n[ \t]*\n/).forEach(function (block) {
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
