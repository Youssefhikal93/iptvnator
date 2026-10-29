// The app's own screen saver (#61): after a while without a key press on a
// menu, a paused video or the live preview, a slow slideshow of the viewer's
// own titles, so a still screen does not burn into an OLED panel. Samsung's
// screen saver stays off while ours is on, and comes back when ours is Off.
//
// Nothing runs until it starts: a key press only resets one timeout. While it
// shows, a key press ends it and does nothing else.
//
// deps: allowed() -> whether it may start now (never over full-screen video)
//       slides() -> [{ from, title, meta, image, wide }] from what the app
//       already has (see ScreenSaver.slides); no request is made for it
window.ScreenSaver = function (deps) {
    'use strict';

    const { html } = UI;
    const SLIDE_MS = 20000;
    // The text and the clock move a little with every slide, so no pixel
    // stays lit in one place for hours.
    const SHIFTS = [[0, 0], [-36, 24], [28, -20], [-20, -32]];
    let wait = 0;
    let timer = 0;
    let ticker = 0;
    let root = null;
    let list = [];
    let index = 0;

    function samsung(ours) {
        try {
            const state = webapis.appcommon.AppCommonScreenSaverState;
            webapis.appcommon.setScreenSaver(ours ? state.SCREEN_SAVER_OFF : state.SCREEN_SAVER_ON);
        } catch (e) {
            // Not on a TV.
        }
    }

    function read() {
        wait = Number(Prefs.get('screenSaverMs')) || 0;
        samsung(wait > 0);
    }

    function arm() {
        clearTimeout(timer);
        timer = wait > 0 ? setTimeout(fire, wait) : 0;
    }

    function fire() {
        timer = 0;
        if (document.hidden || !deps.allowed()) return arm();
        start();
    }

    const clock = () => I18n.time(Date.now());

    const Slide = ({ slide }) => (slide.wide
        ? UI.img('ss-art', slide.image)
        : html`<div class="ss-poster-back" style=${{ backgroundImage: 'url("' + slide.image + '")' }}></div>${UI.img('ss-poster', slide.image)}`);

    const View = ({ slide, shift, time }) => {
        const move = { transform: 'translate(' + shift[0] + 'px, ' + shift[1] + 'px)' };
        return html`<div class=${'ss-stage' + (slide ? '' : ' empty')}>
            ${slide ? html`<div class="ss-slide" key=${index + ':' + slide.image}><${Slide} slide=${slide} /></div><div class="ss-shade"></div>` : null}
            <div class="ss-clock" style=${move}>${time}</div>
            ${slide ? html`<div class="ss-info" style=${move}>
                <div class="ss-from">${slide.from}</div>
                <div class="ss-title">${slide.title}</div>
                ${slide.meta ? html`<div class="ss-meta">${slide.meta}</div>` : null}
            </div>` : null}
            <div class="ss-hint">${I18n.t('saver.hint')}</div>
        </div>`;
    };

    function show() {
        const slide = list.length ? list[index % list.length] : null;
        if (list.length > 1) Art.preload([list[(index + 1) % list.length].image]);
        UI.render(html`<${View} slide=${slide} shift=${SHIFTS[index % SHIFTS.length]} time=${clock()} />`, root);
    }

    function next() {
        index++;
        show();
    }

    function start() {
        list = deps.slides();
        index = 0;
        root = document.createElement('div');
        root.id = 'screen-saver';
        document.body.appendChild(root);
        show();
        ticker = setInterval(next, SLIDE_MS);
        Log.info('SAVER on (' + list.length + ' titles)');
    }

    function stop() {
        clearInterval(ticker);
        ticker = 0;
        UI.clear(root);
        root.remove();
        root = null;
        list = [];
        arm();
    }

    // Before every other key handler: the key that ends it does nothing else.
    window.addEventListener('keydown', (event) => {
        if (!root) return arm();
        event.preventDefault();
        event.stopImmediatePropagation();
        stop();
    }, true);

    Prefs.onChange((name) => {
        if (name !== 'screenSaverMs') return;
        read();
        arm();
    });
    ProfileStore.onSwitch(() => {
        read();
        arm();
    });
    read();
    arm();

    return { isOn: () => !!root };
};

// The slides for a list of Home rows: Continue watching, favorites and
// recently added, without live channels or repeats. A title shows its
// backdrop, else its poster; one with no artwork is left out.
// deps: details(entry) -> the details the app already holds, or null
//       progress(entry) -> Progress.of shape or null
ScreenSaver.ROWS = ['continue', 'fav-movies', 'fav-series', 'new-movies', 'new-series'];
ScreenSaver.MAX = 40;
ScreenSaver.slides = function (rows, deps) {
    'use strict';

    const seen = {};
    const out = [];
    const minutesLeft = (p) => (p && p.duration > p.position ? I18n.t('epg.minLeft', { m: Math.max(1, Math.round((p.duration - p.position) / 60)) }) : '');
    ScreenSaver.ROWS.forEach((id) => {
        const row = rows.filter((candidate) => candidate.id === id)[0];
        (row ? row.entries : []).forEach((entry) => {
            const item = entry.item.show || entry.item;
            const key = entry.section + ':' + (item.series_id || item.stream_id);
            if (seen[key] || out.length >= ScreenSaver.MAX) return;
            const d = deps.details(entry) || {};
            const poster = d.poster || item.stream_icon || item.cover || '';
            const image = d.backdrop || poster;
            if (!image) return;
            seen[key] = true;
            const genre = String(d.genre || item.genre || '').split(/\s*,\s*/).filter(Boolean).slice(0, 2).join(', ');
            const episode = entry.item.episode ? String(entry.item.episode.label || '').replace(/\s+/g, ' ').trim() : '';
            const left = id === 'continue' ? minutesLeft(deps.progress(entry)) : '';
            out.push({
                from: row.title,
                title: item.name || '',
                meta: [episode, d.year, genre, left].filter(Boolean).join(' · '),
                image,
                wide: !!d.backdrop,
            });
        });
    });
    return out;
};
