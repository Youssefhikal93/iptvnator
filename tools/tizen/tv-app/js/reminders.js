// Reminders for programmes that have not started (#75), kept per profile:
// [{ id, sourceId, channel, title, start, end }] under "reminders". A
// reminder is due in the minute before its programme starts; one that
// started is past and dropped. Nothing wakes a closed app, so a reminder
// only fires while the app is open (see ReminderPopup, which asks due()).
//
// add(sourceId, channel, programme) -> true when set (false when the
//   programme started or is already set); has / remove take the same three
// list() -> the pending reminders, soonest first, past ones removed
// due(now) -> the soonest reminder inside its last minute that was not
//   announced yet, and counts it announced for this run; else null
window.Reminders = (function () {
    'use strict';

    var LEAD = 60000;
    var announced = {};
    // The profile's list as last read or written. Only this module writes the
    // record, and the pop-up asks due() every second, so storage is read once
    // per profile instead of once a second.
    var memo = { key: null, list: [] };

    function key() {
        return ProfileStore.key('reminders');
    }

    function read() {
        var current = key();
        if (memo.key === current) return memo.list;
        var list;
        try {
            var saved = Stored.json(current);
            list = Array.isArray(saved) ? saved : [];
        } catch (e) {
            list = [];
        }
        memo = { key: current, list: list };
        return list;
    }

    function write(list) {
        memo = { key: key(), list: list };
        try {
            Stored.save(memo.key, list);
        } catch (e) {
            // Without storage the reminders are lost at the next start.
        }
    }

    function idOf(sourceId, channel, programme) {
        return sourceId + '|' + Library.keyOf('live', channel) + '|' + programme.start;
    }

    function pending(now) {
        var all = read();
        var kept = all.filter(function (entry) { return entry.start > now; });
        if (kept.length !== all.length) write(kept);
        return kept.sort(function (a, b) { return a.start - b.start; });
    }

    function has(sourceId, channel, programme) {
        var id = idOf(sourceId, channel, programme);
        return read().some(function (entry) { return entry.id === id; });
    }

    return {
        lead: LEAD,
        has: has,
        add: function (sourceId, channel, programme) {
            if (!(programme.start > Date.now()) || has(sourceId, channel, programme)) return false;
            write(read().concat([{ id: idOf(sourceId, channel, programme), sourceId: sourceId, channel: Library.snapshot(channel),
                title: programme.title, start: programme.start, end: programme.end }]));
            return true;
        },
        remove: function (sourceId, channel, programme) {
            var id = idOf(sourceId, channel, programme);
            write(read().filter(function (entry) { return entry.id !== id; }));
        },
        removeId: function (id) {
            write(read().filter(function (entry) { return entry.id !== id; }));
        },
        list: function () {
            return pending(Date.now());
        },
        due: function (now) {
            var found = pending(now).filter(function (entry) { return entry.start - LEAD <= now && !announced[entry.id]; })[0];
            if (!found) return null;
            announced[found.id] = true;
            return found;
        },
    };
})();
