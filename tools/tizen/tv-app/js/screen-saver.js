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
    // The centre stays fixed; extras accumulate every two minutes, then reset.
    const LOGO_MOVE_MS = 120000;
    const LOGO_PLAYS = ['rotate', 'flip', 'swing', 'breathe', 'wobble', 'float', 'reverse', 'flip-x', 'tilt'];
    const MAX_EXTRAS = 28;
    const CLOCK_MS = 20000;
    const LOGO_DATE = { weekday: 'long', day: 'numeric', month: 'long' };
    // The text and the clock move a little with every slide, so no pixel
    // stays lit in one place for hours.
    const SHIFTS = [[0, 0], [-36, 24], [28, -20], [-20, -32]];
    let wait = 0;
    let timer = 0;
    let ticker = 0;
    let root = null;
    let list = [];
    let index = 0;
    let kind = 'ours';
    // Logo and clock: the step, reserved slots and visible extras.
    let logo = null;
    let mover = 0;

    function samsung(ours) {
        try {
            const state = webapis.appcommon.AppCommonScreenSaverState;
            webapis.appcommon.setScreenSaver(ours ? state.SCREEN_SAVER_OFF : state.SCREEN_SAVER_ON);
        } catch (e) {
            // Not on a TV.
        }
    }

    // With "The TV's own" (#71) ours never starts and Samsung's runs. "Logo and
    // clock" (#74) waits and starts like the slideshow; only the drawing differs.
    function read() {
        const chosen = Prefs.get('screenSaverKind');
        kind = chosen === 'tv' || chosen === 'logo' ? chosen : 'ours';
        const ours = kind !== 'tv';
        wait = ours ? Number(Prefs.get('screenSaverMs')) || 0 : 0;
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

    const LogoView = ({ look, time, date }) => html`<div class="ss-stage ss-logo-stage">
        <div class="ss-logo">
            <img class="ss-logo-icon" src="icon.png" alt="" />
            <div class="ss-logo-clock">${time}</div>
            <div class="ss-logo-date">${date}</div>
        </div>
        ${look.extras.map((extra) => html`<div key=${extra.key} class="ss-logo-extra" style=${{ left: extra.x + '%', top: extra.y + '%' }}>
            <img class=${'ss-logo-extra-icon p-' + extra.play} src="icon.png" alt="" style=${{ '--duration': extra.duration + 's', '--delay': extra.delay + 's' }} />
        </div>`)}
        <div class="ss-hint">${I18n.t('saver.hint')}</div>
    </div>`;

    function showLogo() {
        const now = Date.now();
        UI.render(html`<${LogoView} look=${logo} time=${I18n.time(now)} date=${I18n.date(now, LOGO_DATE)} />`, root);
    }

    function extraLogo(slot, i) {
        // Avoid matching loops even in diagonally neighbouring cells.
        const neighbours = logo.extras.filter((extra) => Math.abs(extra.col - slot.col) <= 1 && Math.abs(extra.row - slot.row) <= 1);
        let play = i % LOGO_PLAYS.length;
        while (neighbours.some((extra) => extra.play === LOGO_PLAYS[play])) play = (play + 1) % LOGO_PLAYS.length;
        return Object.assign({}, slot, {
            key: logo.step + ':' + i,
            play: LOGO_PLAYS[play],
            duration: 14 + i * 0.22,
            delay: -i * 2.1,
        });
    }

    function jump() {
        const count = ScreenSaver.extraCount(++logo.step);
        if (count < logo.extras.length) {
            logo.extras = [];
            logo.slots = ScreenSaver.positions(Math.random, MAX_EXTRAS);
        }
        while (logo.extras.length < count) {
            const i = logo.extras.length;
            logo.extras.push(extraLogo(logo.slots[i], i));
        }
        showLogo();
    }
    function startLogo() {
        logo = { step: 0, slots: ScreenSaver.positions(Math.random, MAX_EXTRAS), extras: [] };
        showLogo();
        ticker = setInterval(showLogo, CLOCK_MS);
        mover = setInterval(jump, LOGO_MOVE_MS);
        Log.info('SAVER on (logo and clock)');
    }

    function start() {
        root = document.createElement('div');
        root.id = 'screen-saver';
        document.body.appendChild(root);
        if (kind === 'logo') return startLogo();
        list = deps.slides();
        index = 0;
        show();
        ticker = setInterval(next, SLIDE_MS);
        Log.info('SAVER on (' + list.length + ' titles)');
    }

    function stop() {
        clearInterval(ticker);
        clearInterval(mover);
        ticker = mover = 0;
        logo = null;
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
        if (name !== 'screenSaverMs' && name !== 'screenSaverKind') return;
        read();
        arm();
    });
    ProfileStore.onSwitch(() => {
        read();
        arm();
    });
    read();
    arm();

    return {
        isOn: () => !!root,
        // Something that must be seen now (a due reminder, #75) ends it and restarts the wait.
        wake: () => (root ? stop() : arm()),
    };
};

// Step zero is alone; later steps repeat 2, 6, 14, 28 extras.
ScreenSaver.extraCount = function (step) {
    'use strict';

    return step === 0 ? 0 : [2, 6, 14, 28][(step - 1) % 4];
};

// Pick without replacement from an 8 x 6 grid, reserving the middle 4 x 4 and the hint's corner.
// x/y are percentages at cell centres. At 1920 x 1080 each 240 x 180 cell
// contains a 108 px icon's full animation envelope (at most 160 x 160 px).
// random() -> [0, 1); count is 0..28 (30 free cells).
ScreenSaver.positions = function (random, count) {
    'use strict';

    const cells = [];
    const out = [];
    for (let row = 0; row < 6; row++) {
        for (let col = 0; col < 8; col++) {
            if (col >= 2 && col <= 5 && row >= 1 && row <= 4) continue;
            if (row === 5 && col >= 6) continue;
            cells.push({ col, row, x: (col + 0.5) * 100 / 8, y: (row + 0.5) * 100 / 6 });
        }
    }
    while (out.length < count) out.push(cells.splice(Math.floor(random() * cells.length), 1)[0]);
    return out;
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
