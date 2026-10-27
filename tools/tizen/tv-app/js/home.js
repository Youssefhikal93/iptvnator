// Home (#45): a hero for what you were watching and rows of tiles (continue
// watching, favorites, recently added). It only draws and moves the focus;
// the browser supplies the data and opens items. Drawn with Preact (ADR
// 0009) from the kit's Row and Tile, so a key press updates only the tiles
// that changed and the focused tile can grow smoothly.
//
// api: hero() / rows() -> entries { item, section } and [{ id, title, entries }]
//      open(entry) (OK on a poster), resume(entry) and openDetails(entry)
//      (hero buttons), details(entry) -> Promise of detail-page details,
//      progress(entry) -> Progress.of shape or null, watched(entry) -> boolean,
//      isNew(entry) -> whether a show has new episodes since it was watched,
//      programme(item) -> the programme on now for a channel, or null
window.Home = (api) => {
    'use strict';

    const KEY = Keys;
    const { html } = UI;
    const root = document.getElementById('home');
    Prefs.onChange((name) => {
        if (name === 'homeLayout' || name === 'programmeGuide' || name === 'density') render();
    });
    let s = { block: 0, hero: 0, button: 0, rows: {}, details: {} };

    // Host and file name only: enough to tell which logo server fails.
    const logoHost = (src) => {
        try {
            const u = new URL(src);
            return u.host + ' ' + u.pathname.split('/').pop();
        } catch (e) {
            return '?';
        }
    };
    const failed = (src) => Log.error('Logo failed ' + logoHost(src));

    const art = (item) => {
        const show = item.show || item;
        return show.stream_icon || show.cover || show.logo || '';
    };
    const titleOf = (entry) => (entry.item.show ? entry.item.show.name : entry.item.name);
    const episodeOf = (entry) => {
        const ep = entry.item.episode;
        return ep ? String(ep.label || '').replace(/\s+/g, ' ').trim() : '';
    };
    const entryKey = (entry) => {
        const item = entry.item.show || entry.item;
        return entry.section + ':' + (item.series_id || item.stream_id);
    };

    // The continue row leaves out the title the hero is showing (#45).
    const withoutHero = (row, hero) => {
        if (row.id !== 'continue' || !hero.length) return row;
        const shown = entryKey(hero[heroIndex(hero)]);
        return Object.assign({}, row, { entries: row.entries.filter((entry) => entryKey(entry) !== shown) });
    };

    // Blocks top to bottom: the hero (when there is history), then rows.
    const blocks = () => {
        const list = [];
        const hero = api.hero();
        if (hero.length) list.push({ hero });
        api.rows().forEach((row) => {
            const shown = withoutHero(row, hero);
            if (shown.entries.length || shown.loading) list.push({ row: shown });
        });
        return list;
    };

    const visibleCount = () => AppearanceLayout.count('--home-cols');

    const rowState = (row) => {
        if (!s.rows[row.id]) s.rows[row.id] = { focus: 0, offset: 0 };
        const r = s.rows[row.id];
        const visible = visibleCount();
        r.focus = Math.max(0, Math.min(r.focus, row.entries.length - 1));
        if (r.focus < r.offset) r.offset = r.focus;
        if (r.focus >= r.offset + visible) r.offset = r.focus - visible + 1;
        return r;
    };

    // ---- Hero -------------------------------------------------------------

    // The hero keeps showing the same title when the list reorders (after
    // playback the title just watched moves first).
    function heroIndex(hero) {
        for (let i = 0; i < hero.length; i++) {
            if (entryKey(hero[i]) === s.heroKey) return (s.hero = i);
        }
        s.hero = Math.min(s.hero, hero.length - 1);
        s.heroKey = entryKey(hero[s.hero]);
        return s.hero;
    }

    const heroButtons = (hero) => {
        const list = [
            { label: I18n.t('home.continueButton'), run: 'open' },
            { label: I18n.t('menu.details'), run: 'details' },
        ];
        if (hero.length > 1) list.push({ label: '‹', run: 'prev', small: true }, { label: '›', run: 'next', small: true });
        return list;
    };

    const heroDetails = (entry) => {
        const key = entryKey(entry);
        if (!s.details[key]) {
            s.details[key] = { value: null };
            api.details(entry)
                .then((d) => {
                    s.details[key].value = d;
                    render();
                })
                .catch(() => {});
        }
        return s.details[key].value || {};
    };

    const runtime = (seconds) => {
        const minutes = Math.round(seconds / 60);
        return minutes >= 60 ? Math.floor(minutes / 60) + ' h ' + String(minutes % 60).padStart(2, '0') + ' min' : minutes + ' min';
    };

    const Hero = ({ hero, focused }) => {
        const entry = hero[heroIndex(hero)];
        const d = heroDetails(entry);
        const p = api.progress(entry);
        const chips = [episodeOf(entry), d.year, d.genre, d.seconds > 0 ? runtime(d.seconds) : '', d.rating > 0 ? '★ ' + Number(d.rating).toFixed(1) : '']
            .filter(Boolean);
        const left = p && p.duration > p.position ? I18n.t('epg.minLeft', { m: Math.max(1, Math.round((p.duration - p.position) / 60)) }) : '';
        return html`<div class="hm-hero">
            ${UI.img('hm-hero-art', d.backdrop || d.poster || art(entry.item))}
            <div class="hm-hero-shade"></div>
            <div class="hm-hero-text">
                <div class="hm-eyebrow">${I18n.t('browser.continueWatching') + (hero.length > 1 ? '  ·  ' + (s.hero + 1) + ' / ' + hero.length : '')}</div>
                <div class="hm-hero-title">${titleOf(entry)}</div>
                ${chips.length ? html`<div class="hm-hero-chips">${chips.map((chip, i) => html`<span class=${'hm-chip' + (chip.charAt(0) === '★' ? ' rating' : '')} key=${i}>${chip}</span>`)}</div>` : null}
                ${d.plot ? html`<div class="hm-hero-plot">${d.plot}</div>` : null}
                ${p ? html`<div class="hm-hero-progress">
                    <div class="hm-hero-bar"><div class="hm-hero-fill" style=${{ width: Progress.bar(p.ratio) }}></div></div>
                    ${left ? html`<span class="hm-hero-left">${left}</span>` : null}
                </div>` : null}
                <div class="hm-hero-buttons">
                    ${heroButtons(hero).map((button, i) => html`<span key=${button.run}
                        class=${'dt-btn' + (i === 0 ? ' primary' : '') + (button.small ? ' small' : '') + (focused && i === s.button ? ' focus' : '')}>${button.label}</span>`)}
                </div>
            </div>
            ${hero.length > 1 ? html`<div class="hm-dots">${hero.map((_, i) => html`<i key=${i} class=${i === s.hero ? 'on' : ''}></i>`)}</div>` : null}
        </div>`;
    };

    // ---- Rows -------------------------------------------------------------

    // A poster that fails shows the initials underneath it.
    const Poster = ({ src, initials, children }) => html`<div class="hm-poster">
        <span class="hm-initials">${initials}</span>
        ${src ? html`<img class=${'art' + (Art.seen(src) ? ' art-in' : '')} src=${src} alt=""
            onError=${(event) => { failed(src); event.currentTarget.style.visibility = 'hidden'; }} />` : null}
        ${children}
    </div>`;

    const bar = (cls, ratio) => html`<div class=${cls}><div class="hm-fill" style=${{ width: Math.round(Math.min(1, Math.max(0, ratio)) * 100) + '%' }}></div></div>`;

    const tile = (entry) => {
        const live = entry.section === 'live';
        const src = art(entry.item);
        const item = entry.item;
        const chip = item.sourceId && item.sourceId !== Sources.current().id ? html`<span class="source-chip">${item.sourceName}</span>` : null;
        let overlays;
        let sub;
        if (live) {
            const now = api.programme(item);
            sub = now && now.title;
            overlays = [chip, now && now.end > now.start ? bar('hm-bar live', (Date.now() - now.start) / (now.end - now.start)) : null];
        } else {
            const p = api.progress(entry);
            sub = episodeOf(entry).replace(/^S(\d+) E(\d+)\s.*$/, 'S$1 E$2');
            overlays = [
                chip,
                api.watched(entry) ? html`<span class="watched-tick" aria-label=${I18n.t('browser.watched')}>✓</span>` : null,
                api.isNew(entry) ? html`<span class="new-badge">${I18n.t('home.newEpisodes')}</span>` : null,
                p && p.status === 'continue' ? bar('hm-bar', p.ratio) : null,
            ];
        }
        const name = titleOf(entry);
        const poster = live
            ? html`<${Kit.Plate} cls="hm-poster" name=${name} logo=${src} onFail=${failed}>${overlays}</${Kit.Plate}>`
            : html`<${Poster} src=${src} initials=${name.replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase()}>${overlays}</${Poster}>`;
        return { key: entryKey(entry), cls: 'hm-card' + (live ? ' live' : ''), poster, name, sub };
    };

    const skeletons = () => Array.from({ length: visibleCount() }, (_, i) => ({ key: i, cls: 'hm-card skeleton', poster: html`<div class="hm-poster"></div>`, name: '' }));

    const HomeRow = ({ row, focused }) => {
        if (row.loading) return html`<${Kit.Row} cls="hm" kind="loading" label=${row.title} tiles=${skeletons()} />`;
        const r = rowState(row);
        const visible = visibleCount();
        // The tiles RIGHT scrolls to next load while this row is on screen.
        Art.preload(row.entries.slice(r.offset + visible, r.offset + 2 * visible).map((entry) => art(entry.item)));
        return html`<${Kit.Row} cls="hm" kind=${row.id === 'live' ? 'live' : ''} label=${row.title}
            tiles=${row.entries.slice(r.offset, r.offset + visible).map(tile)} focus=${focused ? r.focus - r.offset : -1} />`;
    };

    function render() {
        root.classList.toggle('showcase', Prefs.get('homeLayout') === 'showcase');
        const list = blocks();
        if (!list.length) {
            UI.render(html`<div class="hm-empty">${I18n.t('home.nothingHere')}<small>${I18n.t('home.nothingHint')}</small></div>`, root);
            return;
        }
        list.forEach((block, index) => {
            if ((block.hero ? 'hero' : block.row.id) === s.blockKey) s.block = index;
        });
        s.block = Math.min(s.block, list.length - 1);
        s.blockKey = list[s.block].hero ? 'hero' : list[s.block].row.id;
        // The hero shows while it has the focus; further down, the focused
        // row moves to the top.
        const first = list[0].hero && s.block === 0 ? 0 : s.block;
        const shown = list.slice(first, first + 3);
        UI.render(html`${shown.map((block, i) => {
            const focused = s.active && first + i === s.block;
            return block.hero
                ? html`<${Hero} key="hero" hero=${block.hero} focused=${focused} />`
                : html`<${HomeRow} key=${block.row.id} row=${block.row} focused=${focused} />`;
        })}`, root);
        // And the row DOWN brings up.
        const next = list[first + 3];
        if (next && next.row && next.row.entries) Art.preload(next.row.entries.slice(0, visibleCount()).map((entry) => art(entry.item)));
    }

    // ---- Keys -------------------------------------------------------------

    const heroKey = (code, hero) => {
        const buttons = heroButtons(hero);
        if (code === KEY.LEFT && s.button === 0) return 'left';
        if (code === KEY.LEFT) s.button--;
        else if (code === KEY.RIGHT && s.button < buttons.length - 1) s.button++;
        else if (code === KEY.ENTER) {
            const run = buttons[s.button].run;
            const at = heroIndex(hero);
            if (run === 'prev' || run === 'next') {
                s.hero = (at + (run === 'prev' ? hero.length - 1 : 1)) % hero.length;
                s.heroKey = entryKey(hero[s.hero]);
            } else if (run === 'details') api.openDetails(hero[at]);
            else api.resume(hero[at]);
        }
        return undefined;
    };

    // Returns 'left' when the focus leaves Home to the rail.
    const key = (code) => {
        const list = blocks();
        const block = list[s.block];
        if (!block) return code === KEY.LEFT ? 'left' : undefined;
        if (code === KEY.UP && s.block > 0) {
            s.block--;
            s.blockKey = null;
        } else if (code === KEY.DOWN && s.block < list.length - 1) {
            s.block++;
            s.blockKey = null;
        } else if (block.hero) {
            const out = heroKey(code, block.hero);
            render();
            return out;
        } else if (block.row.loading) {
            if (code === KEY.LEFT) return 'left';
        } else {
            const r = rowState(block.row);
            if (code === KEY.LEFT && r.focus === 0) return 'left';
            if (code === KEY.LEFT) r.focus--;
            else if (code === KEY.RIGHT && r.focus < block.row.entries.length - 1) r.focus++;
        }
        render();
        return undefined;
    };

    return {
        render,
        key,
        setActive: (active) => {
            s.active = active;
            render();
        },
        // The poster entry with the focus (OK and hold-OK act on it), or
        // null on the hero, whose buttons take OK themselves.
        focused: () => {
            const block = blocks()[s.block];
            if (!block || block.hero || block.row.loading) return null;
            return block.row.entries[rowState(block.row).focus];
        },
        // A library pick keeps its row; other source changes start at the top.
        reset: (fromLibrary) => {
            s = { block: 0, blockKey: fromLibrary ? s.blockKey : null, hero: 0, button: 0, rows: {}, details: {}, active: s.active };
        },
    };
};
