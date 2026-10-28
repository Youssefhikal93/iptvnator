// Where each show's intro ends, learnt from the viewer's own Skip intro:
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
            // Storage full: the show falls back to the fixed skip length.
        }
    }

    return {
        // The intro's end in ms, or 0 when the show has none yet.
        get: function (show) {
            var ms = show ? Number(all()[show]) : 0;
            return ms > 0 ? ms : 0;
        },
        set: function (show, ms) {
            if (!show || !(ms > 0)) return;
            var marks = all();
            marks[show] = Math.round(ms);
            write(marks);
        },
        clear: function (show) {
            var marks = all();
            delete marks[show];
            write(marks);
        },
    };
})();
