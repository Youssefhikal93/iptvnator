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
//      search(query) -> Promise of result rows (optional: without it Home
//      has no search icon)
window.Home = (api) => {
    'use strict';

    const KEY = Keys;
    const { html } = UI;
    const root = document.getElementById('home');
    // Cinema opens on a banner for what you were watching; Big first row
    // and Backdrop have none (Settings › Display › Home layout).
    const LAYOUTS = ['cinema', 'bigrow', 'backdrop'];
    const layout = () => (LAYOUTS.indexOf(Prefs.get('homeLayout')) > 0 ? Prefs.get('homeLayout') : 'cinema');
    Prefs.onChange((name) => {
        if (name === 'homeLayout' || name === 'programmeGuide' || name === 'density') render();
    });
    // With search, block 0 is the icon at the top right; the focus starts
    // on the block under it.
    const fresh = () => ({ block: api.search ? 1 : 0, hero: 0, button: 0, rows: {}, details: {}, q: { open: false, text: '', typing: false, busy: false, found: null, token: 0 } });
    let s = fresh();

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

    // Blocks top to bottom: the search icon, the hero (when there is
    // history), then rows. An open search has its bar and the results.
    const blocks = () => {
        if (s.q.open) return [{ box: true }].concat((s.q.found || []).map((row) => ({ row })));
        const list = api.search ? [{ icon: true }] : [];
        const hero = layout() === 'cinema' ? api.hero() : [];
        if (hero.length) list.push({ hero });
        api.rows().forEach((row) => {
            const shown = withoutHero(row, hero);
            if (shown.entries.length || shown.loading) list.push({ row: shown });
        });
        // Big first row: the top row has a few wide tiles.
        const top = list.findIndex((block) => block.row);
        if (layout() === 'bigrow' && top !== -1) list[top] = { row: Object.assign({}, list[top].row, { big: true }) };
        return list;
    };

    const visibleCount = (row) => (row && row.big ? AppearanceLayout.count('--home-big-cols', root) : AppearanceLayout.count('--home-cols'));

    const rowState = (row) => {
        if (!s.rows[row.id]) s.rows[row.id] = { focus: 0, offset: 0 };
        const r = s.rows[row.id];
        const visible = visibleCount(row);
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

    const chipsOf = (entry, d) => [episodeOf(entry), d.year, d.genre, d.seconds > 0 ? runtime(d.seconds) : '', d.rating > 0 ? '★ ' + Number(d.rating).toFixed(1) : '']
        .filter(Boolean);
    const Chips = ({ chips }) => (chips.length
        ? html`<div class="hm-hero-chips">${chips.map((chip, i) => html`<span class=${'hm-chip' + (chip.charAt(0) === '★' ? ' rating' : '')} key=${i}>${chip}</span>`)}</div>`
        : null);
    const minutesLeft = (p) => (p && p.duration > p.position ? I18n.t('epg.minLeft', { m: Math.max(1, Math.round((p.duration - p.position) / 60)) }) : '');

    const Hero = ({ hero, focused }) => {
        const entry = hero[heroIndex(hero)];
        const d = heroDetails(entry);
        const p = api.progress(entry);
        const chips = chipsOf(entry, d);
        const left = minutesLeft(p);
        return html`<div class="hm-hero">
            ${UI.img('hm-hero-art', d.backdrop || d.poster || art(entry.item))}
            <div class="hm-hero-shade"></div>
            <div class="hm-hero-text">
                <div class="hm-eyebrow">${I18n.t('browser.continueWatching') + (hero.length > 1 ? '  ·  ' + (s.hero + 1) + ' / ' + hero.length : '')}</div>
                <div class="hm-hero-title">${titleOf(entry)}</div>
                <${Chips} chips=${chips} />
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

    // A big tile (Big first row) shows the title's backdrop and, on it, the
    // time left.
    const tile = (entry, big) => {
        const live = entry.section === 'live';
        const src = big && !live ? heroDetails(entry).backdrop || art(entry.item) : art(entry.item);
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
                big && p && p.status === 'continue' && minutesLeft(p) ? html`<span class="hm-label">${minutesLeft(p)}</span>` : null,
            ];
        }
        const name = titleOf(entry);
        const poster = live
            ? html`<${Kit.Plate} cls="hm-poster" name=${name} logo=${src} onFail=${failed}>${overlays}</${Kit.Plate}>`
            : html`<${Poster} src=${src} initials=${name.replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase()}>${overlays}</${Poster}>`;
        return { key: entryKey(entry), cls: 'hm-card' + (live ? ' live' : '') + (big ? ' big' : ''), poster, name, sub };
    };

    const skeletons = (row) => Array.from({ length: visibleCount(row) }, (_, i) => ({ key: i, cls: 'hm-card skeleton', poster: html`<div class="hm-poster"></div>`, name: '' }));

    const HomeRow = ({ row, focused }) => {
        if (row.loading) return html`<${Kit.Row} cls="hm" kind=${'loading' + (row.big ? ' big' : '')} label=${row.title} tiles=${skeletons(row)} />`;
        const r = rowState(row);
        const visible = visibleCount(row);
        // The tiles RIGHT scrolls to next load while this row is on screen.
        Art.preload(row.entries.slice(r.offset + visible, r.offset + 2 * visible).map((entry) => art(entry.item)));
        // A row says when it goes on: its size (the place while focused),
        // ‹ › at its edges, and the last tile fades unless it has the focus.
        const total = row.entries.length;
        const right = r.offset + visible < total;
        const kind = [row.id === 'live' || row.live ? 'live' : '', row.big ? 'big' : '', r.offset > 0 ? 'more-left' : '', right ? 'more-right' : '',
            right && !(focused && r.focus === r.offset + visible - 1) ? 'fade' : ''].filter(Boolean).join(' ');
        const aside = focused ? (r.focus + 1) + ' / ' + total : String(total);
        return html`<${Kit.Row} cls="hm" kind=${kind} label=${row.title} aside=${aside}
            tiles=${row.entries.slice(r.offset, r.offset + visible).map((entry) => tile(entry, row.big))} focus=${focused ? r.focus - r.offset : -1} />`;
    };

    // ---- Backdrop ---------------------------------------------------------

    // The focused title fills the screen behind one row of tiles. The row
    // above is named over it and the next row peeks in below, so the way
    // up and down shows. A channel shows its logo on a colour.
    const Stage = ({ list }) => {
        const at = list[s.block].row ? s.block : list.findIndex((block) => block.row);
        if (at === -1) return null;
        const row = list[at].row;
        const entry = row.loading ? null : row.entries[rowState(row).focus];
        const live = !!entry && entry.section === 'live';
        const d = entry && !live ? heroDetails(entry) : {};
        const now = live && api.programme(entry.item);
        const plot = live ? now && now.title : d.plot;
        const above = at > 0 ? list[at - 1].row : null;
        const below = list[at + 1] ? list[at + 1].row : null;
        return html`<div class=${'hm-stage' + (live ? ' live' : '')}>
            ${entry ? UI.img('hm-stage-art', live ? art(entry.item) : d.backdrop || d.poster || art(entry.item)) : null}
            <div class="hm-stage-shade"></div>
            ${entry ? html`<div class="hm-stage-text">
                <div class="hm-eyebrow">${row.title}</div>
                <div class="hm-hero-title">${titleOf(entry)}</div>
                <${Chips} chips=${live ? [] : chipsOf(entry, d)} />
                ${plot ? html`<div class="hm-hero-plot">${plot}</div>` : null}
            </div>` : null}
        </div>
        <div class="hm-stage-rows">
            ${above ? html`<div class="hm-stage-above">${above.title}</div>` : null}
            <${HomeRow} key=${row.id} row=${row} focused=${s.active && at === s.block} />
            ${below ? html`<div class="hm-stage-below"><${HomeRow} key=${below.id} row=${below} focused=${false} /></div>` : null}
        </div>`;
    };

    // ---- Search -----------------------------------------------------------

    const input = { current: null };
    const SearchIcon = ({ focused }) => html`<span class=${'hm-search-icon' + (focused ? ' focus' : '')} aria-label=${I18n.t('browser.search')}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg></span>`;
    const SearchBar = ({ focused }) => {
        const q = s.q;
        const note = q.busy ? I18n.t('find.searching')
            : !q.text.trim() ? I18n.t('find.hint')
            : q.found && !q.found.length ? I18n.t('empty.search.title', { query: q.text.trim() }) + ' · ' + I18n.t('empty.search.hint')
            : '';
        return html`<div class="hm-search">
            <div class=${'hm-search-bar' + (focused && !q.typing ? ' focused' : '') + (q.typing ? ' typing' : '')}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
                <input ref=${input} autocomplete="off" value=${q.text} placeholder=${I18n.t('find.placeholder')} onInput=${typed} />
            </div>
            ${note ? html`<div class="hm-search-note">${note}</div>` : null}
        </div>`;
    };

    // Results follow the typing after a short pause.
    function typed(event) {
        s.q.text = event.currentTarget.value;
        clearTimeout(s.q.timer);
        s.q.timer = setTimeout(runSearch, 500);
    }

    function runSearch() {
        clearTimeout(s.q.timer);
        const q = s.q;
        const token = ++q.token;
        const text = q.text.trim();
        if (!text) {
            q.found = null;
            q.busy = false;
            render();
            return Promise.resolve(0);
        }
        q.busy = true;
        render();
        return api.search(text).then((rows) => {
            if (token !== q.token || q !== s.q) return 0;
            q.busy = false;
            q.found = rows;
            render();
            return rows.length;
        });
    }

    const startTyping = () => {
        s.q.typing = true;
        render();
        if (input.current) input.current.focus();
    };
    const stopTyping = () => {
        s.q.typing = false;
        if (input.current) input.current.blur();
        render();
    };
    const openSearch = () => {
        s.q.open = true;
        s.block = 0;
        s.blockKey = null;
        startTyping();
    };
    const closeSearch = () => {
        if (input.current) input.current.blur();
        ++s.q.token;
        s.q = fresh().q;
        s.block = 1;
        s.blockKey = null;
        render();
    };

    // While typing, keys other than these reach the bar (false).
    const typingKey = (code) => {
        if (code === KEY.ENTER || code === KEY.IME_DONE || code === KEY.DOWN) {
            stopTyping();
            runSearch().then((found) => {
                if (found && s.q.open) {
                    s.block = 1;
                    s.blockKey = null;
                    render();
                }
            });
        } else if (code === KEY.RETURN || code === KEY.ESCAPE || code === KEY.IME_CANCEL) stopTyping();
        else return false;
        return true;
    };

    function render() {
        const mode = s.q.open ? 'cinema' : layout();
        root.classList.toggle('bigrow', mode === 'bigrow');
        root.classList.toggle('backdrop', mode === 'backdrop');
        root.classList.toggle('searching', s.q.open);
        const list = blocks();
        const icon = api.search && !s.q.open ? html`<${SearchIcon} key="search-icon" focused=${s.active && s.block === 0} />` : null;
        if (!list.filter((block) => !block.icon).length) {
            UI.render(html`<div class="hm-empty">${I18n.t('home.nothingHere')}<small>${I18n.t('home.nothingHint')}</small></div>`, root);
            return;
        }
        const keyOf = (block) => (block.icon ? 'icon' : block.box ? 'box' : block.hero ? 'hero' : block.row.id);
        list.forEach((block, index) => {
            if (keyOf(block) === s.blockKey) s.block = index;
        });
        s.block = Math.min(s.block, list.length - 1);
        s.blockKey = keyOf(list[s.block]);
        if (mode === 'backdrop') {
            UI.render(html`${icon}<${Stage} list=${list} />`, root);
            return;
        }
        // The icon, bar and hero show while they or the block under them
        // have the focus; further down, the focused row moves to the top.
        const lead = (block) => block.icon || block.box || block.hero;
        let first = s.block;
        while (first > 0 && (lead(list[first]) || lead(list[first - 1])) && !(list[first].row && list[first - 1].hero)) first--;
        // Three blocks, and the search bar above them when it is open.
        const rest = list.slice(first).filter((block) => !block.icon);
        const shown = rest.slice(0, rest[0] && rest[0].box ? 4 : 3);
        UI.render(html`${icon}${shown.map((block) => {
            const focused = s.active && list.indexOf(block) === s.block;
            return block.box
                ? html`<${SearchBar} key="search" focused=${focused} />`
                : block.hero
                ? html`<${Hero} key="hero" hero=${block.hero} focused=${focused} />`
                : html`<${HomeRow} key=${block.row.id} row=${block.row} focused=${focused} />`;
        })}`, root);
        // And the row DOWN brings up.
        const next = list[first + 3];
        if (next && next.row && next.row.entries) Art.preload(next.row.entries.slice(0, visibleCount(next.row)).map((entry) => art(entry.item)));
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

    // Returns the edge the focus leaves Home by, 'left' or 'up', for the
    // menu; false while typing for a key the search bar should get.
    const key = (code) => {
        if (s.q.typing) return typingKey(code);
        const list = blocks();
        const block = list[s.block];
        if (code === KEY.UP && (!block || s.block === 0)) return 'up';
        if (!block) return code === KEY.LEFT ? 'left' : undefined;
        if (code === KEY.UP && s.block > 0) {
            s.block--;
            s.blockKey = null;
        } else if (code === KEY.DOWN && s.block < list.length - 1) {
            s.block++;
            s.blockKey = null;
        } else if (block.icon || block.box) {
            if (code === KEY.ENTER && block.icon) return openSearch();
            if (code === KEY.ENTER) return startTyping();
            if (code === KEY.LEFT) return 'left';
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
            if (!active && s.q.typing) stopTyping();
            render();
        },
        // The poster entry with the focus (OK and hold-OK act on it), or
        // null on the hero, whose buttons take OK themselves.
        focused: () => {
            const block = blocks()[s.block];
            if (!block || !block.row || block.row.loading) return null;
            return block.row.entries[rowState(block.row).focus];
        },
        typing: () => s.q.typing,
        // Whether the focus is on the search icon or bar (for the hints).
        onSearch: () => {
            const block = blocks()[s.block];
            return !!block && !!(block.icon || block.box);
        },
        // Return closes an open search: true when it did.
        back: () => {
            if (!s.q.open) return false;
            closeSearch();
            return true;
        },
        // A library pick keeps its row and search; other source changes
        // start at the top.
        reset: (fromLibrary) => {
            const was = s;
            s = fresh();
            s.active = was.active;
            if (fromLibrary) {
                s.blockKey = was.blockKey;
                s.q = was.q;
            }
        },
    };
};
