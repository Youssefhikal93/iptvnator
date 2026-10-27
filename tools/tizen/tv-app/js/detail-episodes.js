// Episodes section of a show's detail page: season pills with "N of M
// watched" and a strip of 16:9 episode tiles (number, length, watched tick
// and progress on the picture; title and plot under it), #46.
// It also picks the episode for the page's main button (nextUp).
//
// opts: progressOf(episode) -> Progress.of shape or null
//       play(list, index, resume) starts episode `index` of the whole list
window.DetailEpisodes = function (opts) {
    'use strict';

    var KEY = Keys;
    var html = UI.html;
    // Four tiles fit across the page; the fifth peeks in from the edge.
    var TILES = 5;
    var s = { list: [], seasons: [], season: 0, focus: 0, zone: 'pills', loaded: false };

    function code(ep) {
        return 'S' + ep.season + ' E' + ep.num;
    }

    function watched(ep) {
        var p = opts.progressOf(ep);
        return !!p && p.status === 'watched';
    }

    // Indexes (in the whole list) of the episodes in the shown season.
    function inSeason() {
        var season = s.seasons[s.season];
        var out = [];
        s.list.forEach(function (ep, i) {
            if (ep.season === season) out.push(i);
        });
        return out;
    }

    function setEpisodes(list) {
        var season = s.seasons[s.season];
        var focusedId = s.list.length ? (s.list[inSeason()[s.focus]] || {}).id : null;
        s.list = list || [];
        s.seasons = [];
        s.list.forEach(function (ep) {
            if (s.seasons.indexOf(ep.season) === -1) s.seasons.push(ep.season);
        });
        s.season = Math.max(0, s.seasons.indexOf(season));
        s.focus = 0;
        inSeason().forEach(function (index, i) {
            if (s.list[index].id === focusedId) s.focus = i;
        });
    }

    function nextUnwatched(latest) {
        if (latest >= 0 && !watched(s.list[latest])) return latest;
        for (var step = 1; step <= s.list.length; step++) {
            var index = (latest + step) % s.list.length;
            if (!watched(s.list[index])) return index;
        }
        return -1;
    }

    // Skip watched episodes even when a later season was marked manually.
    function nextUp() {
        var latest = -1;
        var latestAt = -1;
        s.list.forEach(function (ep, i) {
            var p = opts.progressOf(ep);
            if (p && p.updatedAt > latestAt) {
                latest = i;
                latestAt = p.updatedAt;
            }
        });
        var index = nextUnwatched(latest);
        if (index < 0) return s.list.length ? { index: 0, label: I18n.t('episodes.watchAgain', { code: code(s.list[0]) }) } : null;
        var p = opts.progressOf(s.list[index]);
        return p
            ? { index: index, resume: true, progress: p.ratio, label: I18n.t('episodes.continue', { code: code(s.list[index]) }) }
            : { index: index, label: I18n.t('episodes.play', { code: code(s.list[index]) }) };
    }

    // Puts the focus on the episode the main button would play.
    function focusEpisode(index) {
        var ep = s.list[index];
        if (!ep) return;
        s.season = Math.max(0, s.seasons.indexOf(ep.season));
        s.focus = Math.max(0, inSeason().indexOf(index));
    }

    function runtime(secs) {
        return secs ? I18n.t('unit.minutesOnly', { m: Math.round(secs / 60) }) : '';
    }

    // An episode without its own picture shows the show's artwork, dimmed.
    function tileView(index, focused, art) {
        var ep = s.list[index];
        var p = opts.progressOf(ep);
        var length = runtime(ep.seconds);
        return html`<div key=${ep.id} class=${'dt-ep' + (focused ? ' focus' : '')}>
            <div class=${'dt-ep-thumb' + (ep.image ? '' : ' fallback')}>
                ${ep.image || art ? UI.img(undefined, ep.image || art) : null}
                <span class="dt-ep-num">${ep.num}</span>
                ${length ? html`<span class="dt-ep-length">${length}</span>` : null}
                ${watched(ep) ? html`<span class="watched-tick" aria-label=${I18n.t('browser.watched')}>✓</span>` : null}
                ${p && !watched(ep) ? html`<div class="dt-ep-bar"><div class="dt-ep-fill" style=${'width: ' + Progress.bar(p.ratio)}></div></div>` : null}
            </div>
            <div class="dt-ep-title">${ep.num + '. ' + (ep.title || code(ep))}</div>
            ${ep.plot ? html`<div class="dt-ep-plot">${ep.plot}</div>` : null}
        </div>`;
    }

    function view(active, art) {
        var cls = 'dt-episodes' + (active ? ' active' : '');
        if (!s.list.length) return html`<div class=${cls}><div class="dt-ep-empty">${I18n.t(s.loaded ? 'episodes.none' : 'episodes.loading')}</div></div>`;
        var shown = inSeason();
        var done = shown.filter(function (index) {
            return watched(s.list[index]);
        }).length;
        var start = Math.max(0, Math.min(s.focus - 1, shown.length - TILES + 1));
        return html`<div class=${cls}>
            <div class="dt-ep-pills">
                ${s.seasons.map(function (season, i) {
                    return html`<${Kit.Pill} cls="dt-ep-pill" label=${I18n.t('episodes.season', { n: season })} active=${i === s.season} focused=${active && s.zone === 'pills' && i === s.season} />`;
                })}
                <span class="dt-ep-count">${I18n.t('episodes.doneOf', { done: done, total: shown.length })}</span>
            </div>
            <div class="dt-ep-strip">${shown.slice(start, start + TILES).map(function (index, i) {
                return tileView(index, active && s.zone === 'rows' && start + i === s.focus, art);
            })}</div>
        </div>`;
    }

    // Returns 'up' or 'down' when the focus leaves the section.
    function key(code) {
        var shown = inSeason();
        if (s.zone === 'pills') {
            if (code === KEY.LEFT || code === KEY.RIGHT) {
                var season = Focus.step(s.season, s.seasons.length, code, 'row');
                if (season.index !== undefined && season.index !== s.season) {
                    s.season = season.index;
                    s.focus = 0;
                }
            } else if ((code === KEY.DOWN || code === KEY.ENTER) && shown.length) s.zone = 'rows';
            else if (code === KEY.UP) return 'up';
            return undefined;
        }
        if (code === KEY.ENTER) {
            var index = shown[s.focus];
            if (index === undefined) return undefined;
            var p = opts.progressOf(s.list[index]);
            opts.play(s.list, index, p && p.status === 'continue' ? true : undefined);
            return undefined;
        }
        var moved = Focus.step(s.focus, shown.length, code, 'row');
        if (moved.exit === 'up') s.zone = 'pills';
        else if (moved.exit === 'down') return 'down';
        else if (moved.index !== undefined) s.focus = moved.index;
        return undefined;
    }

    return {
        setEpisodes: setEpisodes,
        ready: function () {
            s.loaded = true;
            var next = nextUp();
            if (next) focusEpisode(next.index);
        },
        all: function () {
            return s.list;
        },
        hasRows: function () {
            return s.list.length > 0;
        },
        nextUp: nextUp,
        selection: function () {
            var ep = s.list[inSeason()[s.focus]];
            return s.zone === 'rows' && ep ? { episode: ep, list: s.list } : null;
        },
        // Entering from the buttons lands on the focused episode; ▲ from
        // the first row reaches the season pills.
        enter: function () {
            s.zone = 'rows';
        },
        view: view,
        key: key,
    };
};
