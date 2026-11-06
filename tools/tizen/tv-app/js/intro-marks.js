// Where each show's intro starts and ends, per season (#102): learnt from the
// viewer's own skip, or set by hand in the player's Intro menu. Xtream has no
// intro markers. Kept per profile, one small map for all shows:
//   { [show]: { seasons: { [season]: { from, to, hand? } }, off?: true } }
// An entry saved before #102 ({ from, to }, or its end alone) is the show's
// intro for every season until a season gets its own.
window.IntroMarks = (function () {
    'use strict';

    function storageKey() {
        return ProfileStore.key('intros');
    }

    function all() {
        try {
            var saved = JSON.parse(Stored.text(storageKey()));
            return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
        } catch (e) {
            return {};
        }
    }

    function write(marks) {
        try {
            Stored.save(storageKey(), marks);
        } catch (e) {
            // Storage full: the season is learnt again on the next skip.
        }
    }

    function valid(mark) {
        return !!mark && Number(mark.to) > Number(mark.from) && Number(mark.from) >= 0;
    }

    // The show's entry in the current shape; old ones keep their times as `old`.
    function entry(marks, show) {
        var saved = marks[show];
        if (typeof saved === 'number') saved = { from: 10000, to: saved };
        if (!saved || typeof saved !== 'object') return { seasons: {} };
        var out = { seasons: saved.seasons && typeof saved.seasons === 'object' ? saved.seasons : {} };
        if (saved.off) out.off = true;
        if (valid(saved)) out.old = { from: Number(saved.from), to: Number(saved.to) };
        return out;
    }

    function store(marks, show, value) {
        var out = { seasons: value.seasons };
        if (value.off) out.off = true;
        if (value.old) {
            out.from = value.old.from;
            out.to = value.old.to;
        }
        if (!Object.keys(out.seasons).length && !out.off && !value.old) delete marks[show];
        else marks[show] = out;
        write(marks);
    }

    function key(season) {
        return String(season === undefined || season === null ? '' : season);
    }

    // The nearest other season with an intro, the lower one on a tie.
    function nearest(seasons, season) {
        var best = null;
        Object.keys(seasons).forEach(function (other) {
            if (other === season || !valid(seasons[other])) return;
            var gap = Math.abs(Number(other) - Number(season));
            if (isNaN(gap)) gap = Infinity;
            if (!best || gap < best.gap || (gap === best.gap && Number(other) < Number(best.season))) best = { season: other, gap: gap };
        });
        return best && best.season;
    }

    return {
        // { from, to, kind } in ms, or null. kind: 'hand' (set in the menu),
        // 'learnt' (from a skip) or 'other' (another season's, named by
        // `season`, or the show's from before #102 without one).
        get: function (show, season) {
            if (!show) return null;
            var value = entry(all(), show);
            var own = value.seasons[key(season)];
            if (valid(own)) return { from: Number(own.from), to: Number(own.to), kind: own.hand ? 'hand' : 'learnt' };
            var other = nearest(value.seasons, key(season));
            if (other !== null) return { from: Number(value.seasons[other].from), to: Number(value.seasons[other].to), kind: 'other', season: other };
            return value.old ? { from: value.old.from, to: value.old.to, kind: 'other' } : null;
        },
        // A skip by hand; a season set in the menu keeps its times.
        learn: function (show, season, from, to) {
            if (!show || !valid({ from: from, to: to })) return;
            var marks = all();
            var value = entry(marks, show);
            var own = value.seasons[key(season)];
            if (own && own.hand) return;
            value.seasons[key(season)] = { from: Math.round(from), to: Math.round(to) };
            store(marks, show, value);
        },
        setByHand: function (show, season, from, to) {
            if (!show || !valid({ from: from, to: to })) return;
            var marks = all();
            var value = entry(marks, show);
            value.seasons[key(season)] = { from: Math.round(from), to: Math.round(to), hand: true };
            store(marks, show, value);
        },
        // Back to learning: the season forgets its times, and so does the
        // show's intro from before #102, which no season owns.
        reset: function (show, season) {
            if (!show) return;
            var marks = all();
            var value = entry(marks, show);
            delete value.seasons[key(season)];
            delete value.old;
            store(marks, show, value);
        },
        // The Skip intro button for the show, every season; on unless turned off.
        shown: function (show) {
            return !show || !entry(all(), show).off;
        },
        setShown: function (show, on) {
            if (!show) return;
            var marks = all();
            var value = entry(marks, show);
            if (on) delete value.off;
            else value.off = true;
            store(marks, show, value);
        },
    };
})();
