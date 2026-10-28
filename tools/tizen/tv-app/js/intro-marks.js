// Where each show's intro starts and ends, learnt from the viewer's own skip:
// Xtream has no intro markers. Kept per profile, one small map for all shows.
window.IntroMarks = (function () {
    'use strict';

    function storageKey() {
        return ProfileStore.key('intros');
    }

    function all() {
        try {
            var saved = JSON.parse(localStorage.getItem(storageKey()));
            return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
        } catch (e) {
            return {};
        }
    }

    function write(marks) {
        try {
            localStorage.setItem(storageKey(), JSON.stringify(marks));
        } catch (e) {
            // Storage full: the show is learnt again on the next skip.
        }
    }

    return {
        // { from, to } in ms, or null when the show has none yet. An end alone
        // (saved before starts were learnt) counts from 0:10.
        get: function (show) {
            var mark = show ? all()[show] : null;
            if (typeof mark === 'number') mark = { from: 10000, to: mark };
            if (!mark || !(Number(mark.to) > Number(mark.from))) return null;
            return { from: Math.max(0, Number(mark.from) || 0), to: Number(mark.to) };
        },
        set: function (show, from, to) {
            if (!show || !(to > from) || !(from >= 0)) return;
            var marks = all();
            marks[show] = { from: Math.round(from), to: Math.round(to) };
            write(marks);
        },
        clear: function (show) {
            var marks = all();
            delete marks[show];
            write(marks);
        },
    };
})();
