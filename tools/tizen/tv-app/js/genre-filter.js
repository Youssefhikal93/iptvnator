// The genre filter of Movies and Series (#31): the genre the viewer picked
// for each section, the genres offered, and the TMDB look-up that finds the
// titles of the picked genre in the list on screen. A genre matches what the
// provider's list or TMDB says. Only the list showing is checked, PAGE titles
// at a time, and only with TMDB: the provider is never asked, so filtering
// cannot add to its request limit. The viewer can check the next titles
// (more); nothing found yet keeps going a few batches by itself.
//
// deps: section() -> the open section
//       ready() -> whether the section's list is loaded and can be filtered
//       candidates() -> the list on screen, before the genre narrows it
//       tmdb -> { enabled(), cached(item, type), match(item, type, wanted) }
//       changed(listChanged) -> something to show again: the progress, and
//           with listChanged also the narrowed list
window.GenreFilter = function (deps) {
    'use strict';

    var PAGE = 20;
    var WORKERS = 2;
    var AUTO_RUNS = 5;
    var OFFER_MAX = 20;
    var picks = {};
    var offers = {};
    // A new look-up, a new list or a new section cancels the one running.
    var token = 0;
    var progress = null;
    var remaining = 0;
    var tried = [];
    var runs = 0;

    function filterable(section) {
        return section === 'movies' || section === 'series';
    }

    // All and the section's most common genres, once the list is loaded.
    function names() {
        var section = deps.section();
        var list = filterable(section) && deps.ready() && offers[section];
        return list && list.length ? list : [];
    }

    function current() {
        return names().length ? picks[deps.section()] || null : null;
    }

    // continuing: the next batch of the same genre, not a new look-up.
    function look(continuing) {
        var mine = ++token;
        var genre = current();
        var section = deps.section();
        progress = null;
        remaining = 0;
        if (!continuing) {
            tried = [];
            runs = 0;
        }
        runs++;
        if (!genre || !deps.tmdb.enabled()) return;
        var type = section === 'movies' ? 'movie' : 'tv';
        var asked = tried;
        var open = function (item) { return !Genres.has(item, section, genre); };
        var waiting = function () {
            return deps.candidates().filter(function (item) {
                return open(item) && asked.indexOf(item) === -1 && !deps.tmdb.cached(item, type);
            });
        };
        var batch = waiting().slice(0, PAGE);
        if (!batch.length) return;
        var checking = progress = { done: 0, total: batch.length };
        var live = function () { return mine === token; };
        var step = function () {
            if (!live() || !batch.length) return Promise.resolve();
            var item = batch.shift();
            asked.push(item);
            return deps.tmdb.match(item, type, live).catch(function () {}).then(function () {
                if (!live()) return;
                checking.done++;
                deps.changed(!open(item));
                return step();
            });
        };
        var workers = [];
        for (var i = 0; i < WORKERS; i++) workers.push(step());
        Promise.all(workers).then(function () {
            if (!live()) return;
            progress = null;
            remaining = waiting().length;
            deps.changed(true);
            // Nothing found yet: keep going a few batches before asking.
            var none = !deps.candidates().some(function (item) { return !open(item); });
            if (none && remaining && runs < AUTO_RUNS) more();
        });
    }

    // Checks the next titles for the genre; false when there is nothing to do.
    function more() {
        if (!remaining || progress) return false;
        look(true);
        deps.changed(true);
        return true;
    }

    return {
        names: names,
        current: current,
        pick: function (name) {
            picks[deps.section()] = name;
        },
        // The picked genre and what is offered start over with the source.
        reset: function () {
            picks = {};
            offers = {};
        },
        // Offers a section's genres: the common and standard ones at once,
        // then those of its list. `load` returns a promise of the list (or
        // nothing when it is no longer wanted) and is asked once per section.
        offer: function (section, load) {
            if (offers[section]) return;
            // With TMDB every standard genre can be found; without it only the
            // genres the provider's list carries.
            var pick = deps.tmdb.enabled() ? Genres.pills : Genres.common;
            offers[section] = pick([], section, OFFER_MAX);
            load().then(function (list) {
                if (list) offers[section] = pick(list, section, OFFER_MAX);
            }).catch(function () {});
        },
        look: function () { look(false); },
        more: more,
        // A section or list left: whatever is running stops.
        cancel: function () {
            token++;
            progress = null;
        },
        // Titles still to check for the picked genre; none while checking.
        pending: function () {
            return current() && !progress ? remaining : 0;
        },
        // The list narrowed to the picked genre and the text for when it
        // leaves nothing: still looking, more to check, or no title at all.
        apply: function (list, empty) {
            var genre = current();
            if (!genre) return { list: list, empty: empty };
            var section = deps.section();
            var shown = list.filter(function (item) { return Genres.has(item, section, genre); });
            if (!shown.length && list.length) {
                empty = progress
                    ? [I18n.t('find.looking', { genre: genre }), I18n.t('find.lookingHint')]
                    : remaining
                    ? [I18n.t('find.noneYet', { genre: genre }), I18n.t('find.moreHint', { n: remaining })]
                    : [I18n.t('find.noGenre', { genre: genre }), I18n.t('find.noGenreHint')];
            }
            return { list: shown, empty: empty };
        },
        // What the status chip shows: the count while checking, else what is left.
        hint: function () {
            if (progress) return I18n.t('find.progress', progress);
            if (remaining && current()) return I18n.t('find.moreHint', { n: remaining });
            return '';
        },
    };
};
