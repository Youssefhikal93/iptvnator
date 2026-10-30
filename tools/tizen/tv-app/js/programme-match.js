// A search session normalizes and orders its saved schedules once, before typing.
window.ProgrammeMatch = (function () {
    'use strict';

    function index(schedules) {
        var entries = [];
        schedules.forEach(function (schedule) {
            var seen = Object.create(null);
            schedule.programmes.forEach(function (programme) {
                if (!programme || typeof programme.title !== 'string' || !programme.title.trim() ||
                    typeof programme.start !== 'number' || typeof programme.end !== 'number' || !isFinite(programme.start) || !isFinite(programme.end) || programme.end <= programme.start) return;
                var key = programme.start + '|' + programme.end + '|' + programme.title;
                if (seen[key]) return;
                seen[key] = true;
                entries.push({ channel: schedule.channel, programme: programme, text: programme.title.toLowerCase() });
            });
        });
        return entries.sort(function (a, b) { return a.programme.start - b.programme.start; });
    }

    function search(entries, query, now) {
        var groups = { now: [], today: [], coming: [], past: [] };
        var needle = String(query).trim().toLowerCase();
        if (!needle) return groups;
        var midnight = new Date(now);
        midnight.setHours(24, 0, 0, 0);
        entries.forEach(function (entry) {
            if (entry.text.indexOf(needle) < 0) return;
            var programme = entry.programme;
            var group = programme.end <= now ? 'past' : programme.start <= now ? 'now' :
                programme.start < midnight.getTime() ? 'today' : 'coming';
            groups[group].push(entry);
        });
        groups.past.reverse();
        return groups;
    }

    return { index: index, search: search };
})();
