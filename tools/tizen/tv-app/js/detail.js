// Full-screen detail page for a movie (and a show, see detail-episodes.js):
// full-bleed backdrop, poster, eyebrow, title, fact chips, plot, cast and a
// row of pill buttons (#46). A show's episodes are a strip under the buttons,
// then rows of cast and related titles (#47, detail-rows.js).
//
// open(page) takes:
//   item       the list item (name and artwork until the details arrive)
//   load()     Promise of the adapter's details (see xtream.js `details`)
//   actions(d) the buttons for details d: [{ label, run, progress? }]
//   episodes   optional DetailEpisodes section under the buttons
//   badges     optional extra chips, e.g. [I18n.t('home.newEpisodes')]
//   related()  optional Promise of { label, items } for "More in <category>"
//   collection(provider) optional Promise of the film's collection row (#58)
//   found(details) optional, told the provider's and then TMDB's details (#91)
window.Detail = function () {
    'use strict';

    var KEY = Keys;
    var html = UI.html;
    var root = document.getElementById('detail');
    var s = null;

    function runtime(secs) {
        if (!secs) return '';
        var h = Math.floor(secs / 3600);
        var m = Math.round((secs % 3600) / 60);
        return I18n.t(h ? 'unit.hoursMinutes' : 'unit.minutesOnly', { h: h, m: m });
    }

    function details() {
        var d = s.details || {};
        var item = s.page.item;
        return {
            title: d.title || item.name,
            poster: d.poster || item.stream_icon || item.cover || '',
            backdrop: d.backdrop || d.poster || item.cover || item.stream_icon || '',
            year: d.year,
            rating: d.rating,
            genre: d.genre,
            seconds: d.seconds,
            plot: d.plot,
            cast: d.cast,
            director: d.director,
            trailer: YouTube.videoId(d.trailer),
        };
    }

    function buttons() {
        var d = details();
        var list = s.page.actions(d);
        if (s.youtube && (d.trailer || (s.tmdb && s.tmdb.trailer()))) list.push({ label: I18n.t('detail.trailer'), run: d.trailer ? openTrailer : s.tmdb.openTrailer });
        if (s.clipped) list.push({ label: I18n.t('detail.more'), run: openMore });
        return list;
    }

    // The film's collection first (#58), the TMDB rows (cast, then similar
    // titles) once they arrive, then "More in <category>".
    function rows() {
        return (s.collection ? [s.collection] : []).concat(s.tmdb ? s.tmdb.rows() : [], s.related ? [s.related] : []);
    }

    function relatedRow(found) {
        var section = s.page.episodes ? 'series' : 'movies';
        return {
            kind: 'related',
            label: found.label,
            cards: found.items.map(function (item) { return TmdbView.catalogueCard({ item: item }); }),
            open: function (i) { s.page.open(found.items[i], section); },
        };
    }

    // ---- Rendering --------------------------------------------------------

    function credits(d) {
        return [
            d.cast && html`<div class="dt-credit">${I18n.t('detail.cast', { cast: d.cast })}</div>`,
            d.director && html`<div class="dt-credit">${I18n.t('detail.director', { director: d.director })}</div>`,
        ];
    }

    function genres(d) {
        return String(d.genre || '').split(/\s*[,/|]\s*/).filter(Boolean).slice(0, 3);
    }

    // Year, length, rating and genres as chips, then the page's badges.
    function chips(d) {
        var list = [
            d.year && { label: d.year },
            d.seconds && { label: runtime(d.seconds) },
            d.rating && { label: '★ ' + d.rating.toFixed(1), cls: 'rating' },
        ].concat(genres(d).map(function (genre) { return { label: genre }; }))
            .concat((s.page.badges || []).map(function (badge) { return { label: badge, cls: 'badge' }; }))
            .filter(Boolean);
        return list.map(function (chip) {
            return html`<span class=${'dt-chip' + (chip.cls ? ' ' + chip.cls : '')}>${chip.label}</span>`;
        });
    }

    function buttonsView() {
        var list = buttons();
        s.focus = Math.max(0, Math.min(s.focus, list.length - 1));
        return html`<div class="dt-buttons">${list.map(function (button, i) {
            var cls = 'dt-btn' + (i === 0 ? ' primary' : '') + (s.zone === 'buttons' && i === s.focus ? ' focus' : '');
            return html`<span class=${cls}>${button.label}${button.progress ? html`<span class="dt-btn-bar"><span class="dt-btn-fill" style=${'width: ' + Progress.bar(button.progress)}></span></span>` : null}</span>`;
        })}</div>`;
    }

    function moreView(d) {
        return html`<div class="dt-more">
            <div class="dt-more-title">${d.title}</div>
            <div class="dt-more-plot">${d.plot}</div>
            ${credits(d)}
            <div class="dt-more-hint">${I18n.t('detail.returnClose')}</div>
        </div>`;
    }

    function view() {
        var d = details();
        var provider = s.provider || {};
        var eyebrow = [I18n.t(s.page.episodes ? 'rail.series' : 'rail.movies'), genres(d)[0]].filter(Boolean).join('  ·  ');
        return html`
            <${Kit.Backdrop} src=${d.backdrop} fallback=${provider.backdrop || provider.poster} />
            <div class="dt-body">
                ${UI.img('dt-poster', d.poster, provider.poster)}
                <div class="dt-info">
                    <div class="dt-eyebrow">${eyebrow}</div>
                    <h1 class="dt-title">${d.title}</h1>
                    <div class="dt-meta">${s.loading ? I18n.t('detail.loading') : chips(d)}</div>
                    <div class="dt-plot">${d.plot}</div>
                    <div class="dt-credits">${credits(d)}</div>
                    ${buttonsView()}
                </div>
            </div>
            ${s.page.episodes ? s.page.episodes.view(s.zone === 'episodes', d.backdrop || d.poster) : null}
            ${s.rows.view(rows(), s.zone === 'rows')}
            ${s.more ? moreView(d) : null}`;
    }

    function render() {
        var started = performance.now();
        root.classList.toggle('dt-show', !!s.page.episodes);
        root.classList.toggle('dt-rows-focus', s.zone === 'rows');
        UI.render(view(), root);
        if (s.zone === 'rows') TmdbView.scroll(root);
        // "More" only when the plot does not fit its lines.
        var plot = root.querySelector('.dt-plot');
        var clipped = plot.scrollHeight > plot.clientHeight + 2;
        if (clipped !== s.clipped) {
            s.clipped = clipped;
            UI.render(view(), root);
        }
        s.renders.push(performance.now() - started);
    }

    // One line per page for the TV check in docs/adr/0009.
    function logRenders(list) {
        if (!list.length) return;
        var sorted = list.slice().sort(function (a, b) { return a - b; });
        Log.info('DETAIL renders ' + list.length + ', median ' + sorted[sorted.length >> 1].toFixed(1) + ' ms, max ' + sorted[sorted.length - 1].toFixed(1) + ' ms');
    }

    function openMore() {
        s.more = true;
        render();
    }

    function openTrailer() {
        YouTube.open(details().trailer);
    }

    // ---- Keys -------------------------------------------------------------

    function buttonsKey(code) {
        var list = buttons();
        if (code === KEY.LEFT || code === KEY.RIGHT) {
            var moved = Focus.step(s.focus, list.length, code, 'row');
            if (moved.index !== undefined) s.focus = moved.index;
        }
        else if (code === KEY.DOWN && s.page.episodes && s.page.episodes.hasRows()) {
            s.zone = 'episodes';
            s.page.episodes.enter();
        }
        else if (code === KEY.DOWN && rows().length) s.zone = 'rows';
        else if (code === KEY.ENTER && list[s.focus]) return list[s.focus].run(), true;
        render();
        return true;
    }

    function onKey(code) {
        if (s.more) {
            if (Keys.isBack(code)) {
                s.more = false;
                render();
            }
            return true;
        }
        if (s.zone === 'rows') {
            // The rows come after a show's episodes.
            if (s.rows.key(rows(), code) === 'up') s.zone = s.page.episodes && s.page.episodes.hasRows() ? 'episodes' : 'buttons';
        }
        else if (Keys.isBack(code) && s.zone === 'episodes') s.zone = 'buttons';
        else if (Keys.isBack(code)) return close(), true;
        else if (s.zone === 'episodes') {
            var result = s.page.episodes.key(code);
            if (result === 'up') s.zone = 'buttons';
            if (result === 'down' && rows().length) s.zone = 'rows';
        } else return buttonsKey(code);
        render();
        return true;
    }

    function close() {
        var done = s.page.onClose;
        if (s.tmdb) s.tmdb.dispose();
        logRenders(s.renders);
        s = null;
        UI.clear(root);
        root.classList.add('hidden');
        if (done) done();
    }

    return {
        open: function (page) {
            if (s && s.tmdb) s.tmdb.dispose();
            s = { page: page, details: null, loading: true, focus: 0, zone: 'buttons', clipped: false, more: false, youtube: false, renders: [], rows: DetailRows(), related: null, collection: null };
            var mine = s;
            if (Tmdb.enabled() && page.catalogue) s.tmdb = TmdbDetail(page, function (enriched) {
                if (s !== mine) return;
                if (enriched) s.details = enriched;
                if (enriched && page.found) page.found(enriched);
                render();
            });
            root.classList.remove('hidden');
            render();
            // From the saved lists, so it is there before the details (#47).
            if (page.related) page.related().then(function (found) {
                if (s !== mine || !found || !found.items.length) return;
                s.related = relatedRow(found);
                render();
            });
            YouTube.available(function (available) {
                if (s !== mine) return;
                s.youtube = available;
                render();
            });
            page.load()
                .then(function (d) {
                    if (s !== mine) return;
                    s.details = d;
                    s.provider = d;
                    // What the page learnt, for the boxes to keep (#91).
                    if (d && page.found) page.found(d);
                })
                .catch(function (err) {
                    Log.error('DETAIL FAIL ' + err.message);
                })
                .then(function () {
                    if (s !== mine) return;
                    s.loading = false;
                    if (page.episodes) page.episodes.ready(s.details);
                    render();
                    if (s.tmdb) s.tmdb.load(s.details || {});
                    if (page.collection) page.collection(s.provider || {}).then(function (row) {
                        if (s !== mine || !row) return;
                        s.collection = row;
                        render();
                    });
                });
        },
        isOpen: function () {
            return !!s;
        },
        subtitleInfo: function (item) { return s && s.page.item === item ? s.details : null; },
        onKey: onKey,
        close: close,
        episodeSelection: function () {
            if (!s || s.zone !== 'episodes' || s.more) return null;
            var selection = s.page.episodes.selection();
            return selection && Object.assign({ show: s.page.item }, selection);
        },
        // After playback or a library change: new Resume labels and progress.
        refresh: function () {
            if (s) render();
        },
        details: function () {
            return s && s.details;
        },
    };
};
