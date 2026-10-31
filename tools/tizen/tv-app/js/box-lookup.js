// The length of the films and the seasons of the shows on screen in Wide
// and Info boxes (#91), asked of TMDB in the background, two at a time and
// only while TMDB is on. Each answer is kept in TitleFacts and the boxes are
// drawn again. The IPTV provider is never asked per title.
//
// hooks: sourceId() the source on screen; redraw() draws the boxes again.
window.BoxLookup = function (hooks) {
    'use strict';

    var PARALLEL = 2;
    var WAITING = 30;
    var queue = [];
    var asked = {};
    var running = 0;
    var timer = null;
    var redrawTimer = null;
    var generation = 0;
    // Whether TMDB is on, asked again only when its key changes or on reset:
    // the boxes call want() on every move, and the key is read from storage.
    var tmdbOn = null;
    if (window.Prefs && Prefs.onChange) Prefs.onChange(function (name) { if (name === 'tmdbApiKey') tmdbOn = null; });

    function enabled() {
        if (tmdbOn === null) tmdbOn = Tmdb.enabled();
        return tmdbOn;
    }

    function known(item, section, sourceId) {
        var facts = BoxCards.facts(item, section, null, sourceId);
        return section === 'series' ? !!facts.seasons : !!facts.length;
    }

    function redraw() {
        if (redrawTimer) return;
        redrawTimer = setTimeout(function () {
            redrawTimer = null;
            hooks.redraw();
        }, 150);
    }

    function run(job) {
        var type = job.section === 'series' ? 'tv' : 'movie';
        var mine = generation;
        running++;
        Tmdb.lookup(job.item, type).then(function (result) {
            if (result.status !== 'found') return;
            var body = result.body;
            TitleFacts.save(job.sourceId, job.section, job.item, type === 'tv' ? { seasons: body.number_of_seasons } : { minutes: body.runtime });
            if (mine === generation) redraw();
        }).catch(function () {}).then(function () {
            running--;
            pump();
        });
    }

    function pump() {
        clearTimeout(timer);
        timer = null;
        if (!queue.length) return;
        var wait = Tmdb.throttled();
        if (wait) {
            timer = setTimeout(pump, wait);
            return;
        }
        while (running < PARALLEL && queue.length) run(queue.shift());
    }

    return {
        // The boxes just drawn: the ones still missing their fact go first.
        want: function (list, section) {
            if (section !== 'movies' && section !== 'series') return;
            if (!enabled() || (window.KidsProfile && KidsProfile.on())) return;
            var sourceId = hooks.sourceId();
            var fresh = [];
            list.forEach(function (item) {
                if (!item || item.sub || (item.sourceId && item.sourceId !== sourceId)) return;
                var key = TitleFacts.key(sourceId, section, item);
                if (asked[key] || known(item, section, sourceId)) return;
                asked[key] = true;
                fresh.push({ item: item, section: section, sourceId: sourceId, key: key });
            });
            if (!fresh.length) return;
            queue = fresh.concat(queue);
            // Titles scrolled past long ago may be asked again when they come back.
            queue.splice(WAITING).forEach(function (job) { delete asked[job.key]; });
            pump();
        },
        // Another source or section: what was waiting is dropped.
        reset: function () {
            generation++;
            tmdbOn = null;
            queue.forEach(function (job) { delete asked[job.key]; });
            queue = [];
            clearTimeout(timer);
            timer = null;
        },
    };
};
