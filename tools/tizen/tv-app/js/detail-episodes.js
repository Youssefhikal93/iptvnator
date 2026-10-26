// Episodes section of a show's detail page: season pills with "N of M
// watched" and episode rows (thumbnail, title, length, plot, progress).
// It also picks the episode for the page's main button (nextUp).
//
// opts: progressOf(episode) -> Library.progress shape or null
//       play(list, index, resume) starts episode `index` of the whole list
window.DetailEpisodes = function (opts) {
    'use strict';

    var KEY = { LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13 };
    var ROWS = 5;
    var s = { list: [], seasons: [], season: 0, focus: 0, zone: 'pills', loaded: false };

    function el(tag, cls, text) {
        var node = document.createElement(tag);
        if (cls) node.className = cls;
        if (text !== undefined && text !== null) node.textContent = text;
        return node;
    }

    function code(ep) {
        return 'S' + ep.season + ' E' + ep.num;
    }

    function watched(ep) {
        var p = opts.progressOf(ep);
        return !!p && p.ratio >= 0.95;
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
        if (index < 0) return s.list.length ? { index: 0, label: 'Watch again ' + code(s.list[0]) } : null;
        var p = opts.progressOf(s.list[index]);
        return p
            ? { index: index, resume: true, progress: p.ratio, label: 'Continue ' + code(s.list[index]) }
            : { index: index, label: 'Play ' + code(s.list[index]) };
    }

    // Puts the focus on the episode the main button would play.
    function focusEpisode(index) {
        var ep = s.list[index];
        if (!ep) return;
        s.season = Math.max(0, s.seasons.indexOf(ep.season));
        s.focus = Math.max(0, inSeason().indexOf(index));
    }

    function runtime(secs) {
        return secs ? Math.round(secs / 60) + ' min' : '';
    }

    function renderRow(index, focused) {
        var ep = s.list[index];
        var p = opts.progressOf(ep);
        var row = el('div', 'dt-ep' + (focused ? ' focus' : ''));
        var thumb = el('div', 'dt-ep-thumb');
        if (ep.image) {
            var image = el('img');
            image.onerror = function () {
                image.style.visibility = 'hidden';
            };
            image.src = ep.image;
            thumb.appendChild(image);
        }
        thumb.appendChild(el('span', 'dt-ep-num', ep.num));
        if (watched(ep)) {
            var tick = el('span', 'watched-tick', '\u2713');
            tick.setAttribute('aria-label', 'Watched');
            thumb.appendChild(tick);
        }
        if (p) {
            var bar = el('div', 'dt-ep-bar');
            var fill = el('div', 'dt-ep-fill');
            fill.style.width = Math.max(3, Math.round(p.ratio * 100)) + '%';
            bar.appendChild(fill);
            thumb.appendChild(bar);
        }
        row.appendChild(thumb);
        var text = el('div', 'dt-ep-text');
        text.appendChild(el('div', 'dt-ep-title', ep.num + '. ' + (ep.title || code(ep))));
        var meta = [runtime(ep.seconds), p && p.ratio >= 0.95 ? 'Watched' : p ? Math.round(p.ratio * 100) + '% watched' : ''].filter(Boolean);
        if (meta.length) text.appendChild(el('div', 'dt-ep-meta', meta.join('  ·  ')));
        if (ep.plot) text.appendChild(el('div', 'dt-ep-plot', ep.plot));
        row.appendChild(text);
        return row;
    }

    function render(active) {
        var box = el('div', 'dt-episodes' + (active ? ' active' : ''));
        if (!s.list.length) {
            box.appendChild(el('div', 'dt-ep-empty', s.loaded ? 'No episodes' : 'Loading episodes…'));
            return box;
        }
        var head = el('div', 'dt-ep-pills');
        s.seasons.forEach(function (season, i) {
            var cls = 'dt-ep-pill' + (i === s.season ? ' active' : '') + (active && s.zone === 'pills' && i === s.season ? ' focus' : '');
            head.appendChild(el('span', cls, 'Season ' + season));
        });
        var shown = inSeason();
        var done = shown.filter(function (index) {
            return watched(s.list[index]);
        }).length;
        head.appendChild(el('span', 'dt-ep-count', done + ' of ' + shown.length + ' watched'));
        box.appendChild(head);
        var start = Math.max(0, Math.min(s.focus - 1, shown.length - ROWS));
        shown.slice(start, start + ROWS).forEach(function (index, i) {
            box.appendChild(renderRow(index, active && s.zone === 'rows' && start + i === s.focus));
        });
        return box;
    }

    // Returns 'up' when the focus leaves the section upwards.
    function key(code) {
        var shown = inSeason();
        if (s.zone === 'pills') {
            if (code === KEY.LEFT && s.season > 0) {
                s.season--;
                s.focus = 0;
            } else if (code === KEY.RIGHT && s.season < s.seasons.length - 1) {
                s.season++;
                s.focus = 0;
            } else if ((code === KEY.DOWN || code === KEY.ENTER) && shown.length) s.zone = 'rows';
            else if (code === KEY.UP) return 'up';
            return undefined;
        }
        if (code === KEY.UP && s.focus === 0) s.zone = 'pills';
        else if (code === KEY.UP) s.focus--;
        else if (code === KEY.DOWN && s.focus < shown.length - 1) s.focus++;
        else if (code === KEY.ENTER) {
            var index = shown[s.focus];
            if (index === undefined) return undefined;
            var p = opts.progressOf(s.list[index]);
            opts.play(s.list, index, p && p.ratio < 0.95 ? true : undefined);
        }
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
        render: render,
        key: key,
    };
};
