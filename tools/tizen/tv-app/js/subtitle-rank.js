// Orders OpenSubtitles results by how likely they fit the video and marks the
// reasons. Pure: no network, no storage. Recommends one result, never picks it.
window.SubtitleRank = (function () {
    'use strict';

    var WEIGHT = { hash: 1000, fps: 100, resolution: 30, codec: 20, trusted: 8, machine: -100000 };
    var RESOLUTION_PATTERN = { '2160p': '2160p|4k|uhd', '1080p': '1080p', '720p': '720p', '480p': '480p' };
    var CODEC_PATTERN = { x264: 'x264|h\\.?264|avc', x265: 'x265|h\\.?265|hevc' };

    function number(value) {
        var parsed = Number(value);
        return isFinite(parsed) && parsed > 0 ? parsed : 0;
    }

    // "24000/1001" or "25" or 23.976 -> frames per second, 0 when unknown.
    function rate(value) {
        var parts = String(value === undefined || value === null ? '' : value).split('/');
        if (parts.length === 2) return number(parts[1]) ? number(parts[0]) / number(parts[1]) : 0;
        return number(parts[0]);
    }

    function family(codec) {
        var name = String(codec || '').toLowerCase();
        if (/^(h\.?264|x264|avc1?)$/.test(name)) return 'x264';
        if (/^(h\.?265|x265|hevc)$/.test(name)) return 'x265';
        return '';
    }

    function resolution(width, height) {
        if (width >= 3000 || height >= 1800) return '2160p';
        if (width >= 1800 || height >= 1000) return '1080p';
        if (width >= 1200 || height >= 700) return '720p';
        return height >= 400 || width >= 600 ? '480p' : '';
    }

    // Normalises the provider's info.video; every field is optional.
    function facts(raw) {
        var video = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
        return { resolution: resolution(number(video.width), number(video.height)), codec: family(video.codec_name || video.codec),
            fps: rate(video.r_frame_rate) || rate(video.avg_frame_rate) || rate(video.fps) };
    }

    function has(release, pattern) {
        return new RegExp('(^|[^a-z0-9])(' + pattern + ')([^a-z0-9]|$)').test(String(release || '').toLowerCase());
    }

    function score(match, wanted) {
        var marks = [];
        var points = 0;
        if (match.hashMatch) {
            points += WEIGHT.hash;
            marks.push('hash ✓');
        }
        if (wanted.fps && number(match.fps) && Math.abs(number(match.fps) - wanted.fps) <= 0.01) {
            points += WEIGHT.fps;
            marks.push(number(match.fps) + ' fps ✓');
        }
        if (wanted.resolution && has(match.release, RESOLUTION_PATTERN[wanted.resolution])) {
            points += WEIGHT.resolution;
            marks.push(wanted.resolution + ' ✓');
        }
        if (wanted.codec && has(match.release, CODEC_PATTERN[wanted.codec])) {
            points += WEIGHT.codec;
            marks.push(wanted.codec + ' ✓');
        }
        // Popularity breaks ties between equal fits but never outweighs a fit.
        points += Math.min(Math.log(1 + number(match.downloads)) / Math.LN10, 6) * 2;
        if (match.trusted) points += WEIGHT.trusted;
        if (match.machine) points += WEIGHT.machine;
        return { score: points, marks: marks };
    }

    // Returns new objects, best first; the first is `recommended` unless it is machine translated.
    function rank(matches, video) {
        var wanted = facts(video);
        var ranked = (matches || []).map(function (match, index) {
            var result = score(match, wanted);
            return Object.assign({}, match, { score: result.score, marks: result.marks, order: index, recommended: false });
        }).sort(function (a, b) { return b.score - a.score || a.order - b.order; });
        if (ranked.length && !ranked[0].machine) ranked[0].recommended = true;
        return ranked;
    }

    function count(value) {
        return String(Math.round(number(value))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

    return { rank: rank, facts: facts, count: count, rate: rate };
})();
