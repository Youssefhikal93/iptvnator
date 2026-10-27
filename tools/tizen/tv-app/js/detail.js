// Full-screen detail page for a movie (and a show, see detail-episodes.js):
// backdrop, poster, title, facts, plot, cast and a row of buttons.
//
// open(page) takes:
//   item       the list item (name and artwork until the details arrive)
//   load()     Promise of the adapter's details (see xtream.js `details`)
//   actions(d) the buttons for details d: [{ label, run, progress? }]
//   episodes   optional DetailEpisodes section under the buttons
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

    // ---- Rendering --------------------------------------------------------

    function credits(d) {
        return [
            d.cast && html`<div class="dt-credit">${I18n.t('detail.cast', { cast: d.cast })}</div>`,
            d.director && html`<div class="dt-credit">${I18n.t('detail.director', { director: d.director })}</div>`,
        ];
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
        var facts = [d.year, d.rating ? '★ ' + d.rating.toFixed(1) : '', d.genre, runtime(d.seconds)].filter(Boolean);
        return html`
            ${UI.img('dt-backdrop', d.backdrop, provider.backdrop || provider.poster)}
            <div class="dt-shade"></div>
            <div class="dt-body">
                ${UI.img('dt-poster', d.poster, provider.poster)}
                <div class="dt-info">
                    <h1 class="dt-title">${d.title}</h1>
                    <div class="dt-meta">${s.loading ? I18n.t('detail.loading') : facts.join('  ·  ')}</div>
                    <div class="dt-plot">${d.plot}</div>
                    ${credits(d)}
                    ${buttonsView()}
                </div>
            </div>
            ${s.page.episodes ? html`<div class="dt-ep-head">${d.title}</div>` : null}
            ${s.page.episodes ? s.page.episodes.view(s.zone === 'episodes') : null}
            ${s.tmdb ? s.tmdb.view(s.zone === 'tmdb') : null}
            ${s.more ? moreView(d) : null}`;
    }

    function render() {
        var started = performance.now();
        // A show's page scrolls up to its episodes while they have the focus.
        root.classList.toggle('dt-show', !!s.page.episodes);
        root.classList.toggle('dt-scrolled', s.zone === 'episodes');
        root.classList.toggle('dt-tmdb', !!s.tmdb && s.tmdb.hasRows());
        root.classList.toggle('dt-tmdb-focus', s.zone === 'tmdb');
        UI.render(view(), root);
        if (s.zone === 'tmdb') TmdbView.scroll(root);
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
        if (code === KEY.LEFT && s.focus > 0) s.focus--;
        else if (code === KEY.RIGHT && s.focus < list.length - 1) s.focus++;
        else if (code === KEY.DOWN && s.tmdb && s.tmdb.hasRows()) s.zone = 'tmdb';
        else if (code === KEY.DOWN && s.page.episodes && s.page.episodes.hasRows()) {
            s.zone = 'episodes';
            s.page.episodes.enter();
        }
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
        if (s.zone === 'tmdb') {
            var direction = s.tmdb.key(code);
            if (direction === 'up') s.zone = 'buttons';
            if (direction === 'down' && s.page.episodes && s.page.episodes.hasRows()) {
                s.zone = 'episodes';
                s.page.episodes.enter();
            }
        }
        else if (Keys.isBack(code) && s.zone === 'episodes') s.zone = 'buttons';
        else if (Keys.isBack(code)) return close(), true;
        else if (s.zone === 'episodes') {
            var result = s.page.episodes.key(code);
            if (result === 'up') s.zone = 'buttons';
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
            s = { page: page, details: null, loading: true, focus: 0, zone: 'buttons', clipped: false, more: false, youtube: false, renders: [] };
            var mine = s;
            if (Tmdb.enabled() && page.catalogue) s.tmdb = TmdbDetail(page, function (enriched) {
                if (s !== mine) return;
                if (enriched) s.details = enriched;
                render();
            });
            root.classList.remove('hidden');
            render();
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
            return s.page.episodes.selection();
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
