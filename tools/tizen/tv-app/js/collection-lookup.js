// The background look-up that finds the collections of the provider's films
// (#58). It asks TMDB about one film at a time and only while nobody is
// using the remote or watching: every key press and the player hold it back.
// A film that cost requests is followed by a pause of PACE_MS per request,
// so it never sends more than two a second; one TMDB already answered (the
// genre filter or a detail page) costs nothing. Each film is asked once and
// kept for good in CollectionIndex, the films with no collection too.
//
// deps: index -> CollectionIndex of the open source
//       movies() -> the source's films, or null while not loaded
//       changed() -> progress or a new collection to show
window.CollectionLookup = (function () {
    'use strict';

    var PACE_MS = 500;
    var QUIET_MS = 3000;
    var RETRY_MS = 60000;
    var MAX_FAILURES = 3;
    var MAX_AGE = 30 * 86400000;
    var lastKey = 0;
    var run = null;

    document.addEventListener('keydown', function () { lastKey = Date.now(); }, true);

    function busy() {
        return Date.now() - lastKey < QUIET_MS || !!(window.Player && Player.isOpen());
    }

    function language() { return TmdbLanguage.tag(I18n.language()); }

    function Run(deps) {
        var timer = null;
        var cursor = 0;
        var failures = Object.create(null);
        var self = { deps: deps, done: 0, total: 0, finished: false };

        function later(ms) {
            clearTimeout(timer);
            timer = setTimeout(step, ms);
        }

        function count(movies) {
            self.total = movies.length;
            self.done = movies.filter(function (item) { return !deps.index.due(item); }).length;
        }

        function nextFilm(movies) {
            for (; cursor < movies.length; cursor++) {
                var item = movies[cursor];
                if (deps.index.due(item) && (failures[deps.index.filmKey(item)] || 0) < MAX_FAILURES) return item;
            }
            return null;
        }

        function failed(key) {
            failures[key] = (failures[key] || 0) + 1;
            later(RETRY_MS);
        }

        // Spent requests set the pause before the next step.
        function paced(before) {
            later(Math.max(50, (Tmdb.fetches() - before) * PACE_MS));
        }

        function fetchCollection(id) {
            var before = Tmdb.fetches();
            return Tmdb.collection(id, deps.index.forced(id)).then(function (result) {
                if (run !== self) return;
                if (result.status === 'failed') return failed('c' + id);
                deps.index.setCollection(id, result.status === 'none' ? { none: true, fetched: Date.now() } : CollectionIndex.info(result.body));
                deps.changed();
                paced(before);
            });
        }

        function step() {
            timer = null;
            if (run !== self) return;
            if (!Tmdb.enabled()) return stop();
            var movies = deps.movies();
            if (!movies) return later(QUIET_MS);
            if (busy() || Tmdb.throttled()) return later(Math.max(QUIET_MS, Tmdb.throttled()));
            if (self.total !== movies.length) count(movies);
            var item = nextFilm(movies);
            if (!item) {
                var wanted = deps.index.stale(language(), MAX_AGE).filter(function (id) { return (failures['c' + id] || 0) < MAX_FAILURES; });
                if (wanted.length) return fetchCollection(wanted[0]);
                self.finished = true;
                deps.index.save();
                return deps.changed();
            }
            var before = Tmdb.fetches();
            // A film asked again by a Refresh skips its saved details.
            Tmdb.lookup(item, 'movie', deps.index.film(item) !== undefined).then(function (result) {
                if (run !== self) return;
                if (result.status === 'failed') return failed(deps.index.filmKey(item));
                var body = result.body || {};
                var collection = body.belongs_to_collection && body.belongs_to_collection.id;
                deps.index.setFilm(item, collection || 0, body.id || 0);
                self.done++;
                deps.changed();
                if (collection && (!deps.index.collection(collection) || deps.index.forced(collection))) return fetchCollection(collection);
                paced(before);
            }).catch(function () {
                if (run === self) failed(deps.index.filmKey(item));
            });
        }

        self.start = function (fresh) {
            self.finished = false;
            cursor = 0;
            self.total = 0;
            if (fresh) failures = Object.create(null);
            later(0);
        };
        self.stop = function () { clearTimeout(timer); };
        return self;
    }

    function stop() {
        if (run) run.stop();
        run = null;
    }

    return {
        // Starts (or keeps) the look-up for this index; a new index replaces it.
        start: function (deps) {
            // Done before: a quick pass picks up films the provider added since.
            if (run && run.deps.index === deps.index) {
                if (run.finished) run.start();
                return;
            }
            stop();
            if (!Tmdb.enabled()) return;
            run = Run(deps);
            deps.index.ready().then(function () { if (run && run.deps === deps) run.start(); });
        },
        stop: stop,
        // Refresh (#67): the index is marked and the look-up goes through every
        // film again, at the same pace and only while the remote rests.
        refresh: function (deps) {
            if (!Tmdb.enabled()) return;
            deps.index.ready().then(function () {
                deps.index.refresh();
                if (!run || run.deps.index !== deps.index) {
                    stop();
                    run = Run(deps);
                }
                run.start(true);
                deps.changed();
            });
        },
        // { done, total } while films are still to be checked, else null.
        progress: function () {
            return run && !run.finished && run.total ? { done: run.done, total: run.total } : null;
        },
    };
})();
