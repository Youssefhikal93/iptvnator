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

    var KEY = { LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13, RETURN: 10009, BACKSPACE: 8, ESCAPE: 27 };
    var root = document.getElementById('detail');
    var s = null;

    function el(tag, cls, text) {
        var node = document.createElement(tag);
        if (cls) node.className = cls;
        if (text !== undefined && text !== null) node.textContent = text;
        return node;
    }

    function img(cls, src) {
        var node = el('img', cls);
        node.onerror = function () {
            node.style.visibility = 'hidden';
        };
        if (src) node.src = src;
        else node.style.visibility = 'hidden';
        return node;
    }

    function isBack(code) {
        return code === KEY.RETURN || code === KEY.BACKSPACE || code === KEY.ESCAPE;
    }

    function runtime(secs) {
        if (!secs) return '';
        var h = Math.floor(secs / 3600);
        var m = Math.round((secs % 3600) / 60);
        return h ? h + ' h ' + m + ' min' : m + ' min';
    }

    // A YouTube id from an id or any youtube.com / youtu.be link.
    function youtubeId(text) {
        var match = /(?:v=|youtu\.be\/|embed\/)([\w-]{11})/.exec(text || '');
        if (match) return match[1];
        return /^[\w-]{11}$/.test(text || '') ? text : '';
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
            trailer: youtubeId(d.trailer),
        };
    }

    function buttons() {
        var d = details();
        var list = s.page.actions(d);
        if (d.trailer) list.push({ label: 'Trailer', run: openTrailer });
        if (s.clipped) list.push({ label: 'More', run: openMore });
        return list;
    }

    // ---- Rendering --------------------------------------------------------

    function render() {
        var d = details();
        root.textContent = '';
        // A show's page scrolls up to its episodes while they have the focus.
        root.classList.toggle('dt-show', !!s.page.episodes);
        root.classList.toggle('dt-scrolled', s.zone === 'episodes');
        root.appendChild(img('dt-backdrop', d.backdrop));
        root.appendChild(el('div', 'dt-shade'));
        var body = el('div', 'dt-body');
        body.appendChild(img('dt-poster', d.poster));
        var info = el('div', 'dt-info');
        info.appendChild(el('h1', 'dt-title', d.title));
        var facts = [d.year, d.rating ? '★ ' + d.rating.toFixed(1) : '', d.genre, runtime(d.seconds)].filter(Boolean);
        info.appendChild(el('div', 'dt-meta', s.loading ? 'Loading details…' : facts.join('  ·  ')));
        var plot = el('div', 'dt-plot', d.plot);
        info.appendChild(plot);
        if (d.cast) info.appendChild(el('div', 'dt-credit', 'Cast: ' + d.cast));
        if (d.director) info.appendChild(el('div', 'dt-credit', 'Director: ' + d.director));
        info.appendChild(renderButtons());
        body.appendChild(info);
        root.appendChild(body);
        if (s.page.episodes) {
            root.appendChild(el('div', 'dt-ep-head', d.title));
            root.appendChild(s.page.episodes.render(s.zone === 'episodes'));
        }
        if (s.more) root.appendChild(renderMore(d));
        if (s.trailer) root.appendChild(s.trailer);
        // "More" only when the plot does not fit its lines.
        var clipped = plot.scrollHeight > plot.clientHeight + 2;
        if (clipped !== s.clipped) {
            s.clipped = clipped;
            var row = root.querySelector('.dt-buttons');
            row.parentNode.replaceChild(renderButtons(), row);
        }
    }

    function renderButtons() {
        var row = el('div', 'dt-buttons');
        var list = buttons();
        s.focus = Math.max(0, Math.min(s.focus, list.length - 1));
        list.forEach(function (button, i) {
            var node = el('span', 'dt-btn' + (i === 0 ? ' primary' : '') + (s.zone === 'buttons' && i === s.focus ? ' focus' : ''), button.label);
            if (button.progress) {
                var bar = el('span', 'dt-btn-bar');
                var fill = el('span', 'dt-btn-fill');
                fill.style.width = Math.max(3, Math.round(button.progress * 100)) + '%';
                bar.appendChild(fill);
                node.appendChild(bar);
            }
            row.appendChild(node);
        });
        return row;
    }

    function renderMore(d) {
        var box = el('div', 'dt-more');
        box.appendChild(el('div', 'dt-more-title', d.title));
        box.appendChild(el('div', 'dt-more-plot', d.plot));
        if (d.cast) box.appendChild(el('div', 'dt-credit', 'Cast: ' + d.cast));
        if (d.director) box.appendChild(el('div', 'dt-credit', 'Director: ' + d.director));
        box.appendChild(el('div', 'dt-more-hint', 'Return: close'));
        return box;
    }

    function openMore() {
        s.more = true;
        render();
    }

    // The trailer plays in an embedded YouTube player; focus stays on the
    // page so Return still reaches the app.
    function openTrailer() {
        var frame = el('iframe', 'dt-trailer');
        frame.setAttribute('tabindex', '-1');
        frame.setAttribute('allow', 'autoplay; encrypted-media');
        frame.src = 'https://www.youtube.com/embed/' + details().trailer + '?autoplay=1&controls=0&rel=0';
        s.trailer = el('div', 'dt-trailer-box');
        s.trailer.appendChild(frame);
        s.trailer.appendChild(el('div', 'dt-more-hint', 'Return: close the trailer'));
        render();
    }

    // ---- Keys -------------------------------------------------------------

    function buttonsKey(code) {
        var list = buttons();
        if (code === KEY.LEFT && s.focus > 0) s.focus--;
        else if (code === KEY.RIGHT && s.focus < list.length - 1) s.focus++;
        else if (code === KEY.DOWN && s.page.episodes && s.page.episodes.hasRows()) {
            s.zone = 'episodes';
            s.page.episodes.enter();
        }
        else if (code === KEY.ENTER && list[s.focus]) return list[s.focus].run(), true;
        render();
        return true;
    }

    function onKey(code) {
        if (s.trailer || s.more) {
            if (isBack(code)) {
                s.trailer = null;
                s.more = false;
                render();
            }
            return true;
        }
        if (isBack(code) && s.zone === 'episodes') s.zone = 'buttons';
        else if (isBack(code)) return close(), true;
        else if (s.zone === 'episodes') {
            var result = s.page.episodes.key(code);
            if (result === 'up') s.zone = 'buttons';
        } else return buttonsKey(code);
        render();
        return true;
    }

    function close() {
        var done = s.page.onClose;
        s = null;
        root.textContent = '';
        root.classList.add('hidden');
        if (done) done();
    }

    return {
        open: function (page) {
            s = { page: page, details: null, loading: true, focus: 0, zone: 'buttons', clipped: false, more: false, trailer: null };
            var mine = s;
            root.classList.remove('hidden');
            render();
            page.load()
                .then(function (d) {
                    if (s !== mine) return;
                    s.details = d;
                })
                .catch(function (err) {
                    Log.error('DETAIL FAIL ' + err.message);
                })
                .then(function () {
                    if (s !== mine) return;
                    s.loading = false;
                    if (page.episodes) page.episodes.ready(s.details);
                    render();
                });
        },
        isOpen: function () {
            return !!s;
        },
        onKey: onKey,
        episodeSelection: function () {
            if (!s || s.zone !== 'episodes' || s.more || s.trailer) return null;
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
