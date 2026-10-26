// Shared time rules keep remote navigation and the visible grid in step.
window.GuideTime = (function () {
    'use strict';

    var STEP = 30 * 60000;
    var SPAN = 3 * 3600000;

    function limits(now, channel) {
        var back = channel && window.CatchUp && CatchUp.available(channel) ? Math.min(7, CatchUp.days(channel)) * 86400000 : 2 * 3600000;
        return { from: now - back, to: now + 24 * 3600000 };
    }

    function clamp(time, now, channel) {
        var range = limits(now, channel);
        return Math.max(range.from, Math.min(range.to - 1, time));
    }

    function windowStart(start, time, now, channel) {
        if (time < start || time >= start + SPAN) start = Math.floor(time / STEP) * STEP;
        var range = limits(now, channel);
        return Math.max(range.from, Math.min(range.to - SPAN, start));
    }

    function at(programmes, time) {
        for (var i = 0; i < programmes.length; i++) {
            if (programmes[i].start <= time && time < programmes[i].end) return programmes[i];
        }
        return null;
    }

    // A gap is navigable too, so missing schedules never trap horizontal focus.
    function adjacent(programmes, time, direction) {
        var current = at(programmes, time);
        var index = programmes.indexOf(current);
        if (current) return programmes[index + direction] || null;
        for (var i = direction > 0 ? 0 : programmes.length - 1; i >= 0 && i < programmes.length; i += direction) {
            if (direction > 0 ? programmes[i].start > time : programmes[i].end <= time) return programmes[i];
        }
        return null;
    }

    function firstRow(index, count, rows) {
        return Math.max(0, Math.min(Math.floor(index / rows) * rows, count - rows));
    }

    return { step: STEP, span: SPAN, limits: limits, clamp: clamp, windowStart: windowStart, at: at, adjacent: adjacent, firstRow: firstRow };
})();
