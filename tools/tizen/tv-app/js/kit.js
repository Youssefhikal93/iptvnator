// Shared screen components (#41). Screens build their views from these
// instead of their own markup, so a tile, a pill or a menu row looks and
// behaves the same everywhere. Each keeps the class names its CSS already
// styles; `cls` picks the family (for example 'dt-ep-pill' or 'tm-chip').
window.Kit = (() => {
    'use strict';

    const { html, img } = UI;
    const classes = (base, flags) => [base].concat(Object.keys(flags).filter((flag) => flags[flag])).join(' ');

    // A card with artwork and a name: { image, name }. `poster` replaces the
    // plain image with a richer box (badges, progress), `sub` adds a second line.
    const Tile = ({ cls = 'tm-card', image, poster, name, sub, focused }) =>
        html`<div class=${classes(cls, { focus: focused })}>${poster || (image ? img('', image) : null)}<span>${name}</span>${sub ? html`<small>${sub}</small>` : null}</div>`;

    // A titled strip of tiles; focus is the focused tile's index or -1. `cls`
    // names the family ('tm' gives tm-row, tm-cards, tm-card); a tile may
    // bring its own cls and a key that keeps it across renders. `aside` is
    // a line beside the title, such as a count.
    const Row = ({ cls = 'tm', kind, label, aside, tiles, focus = -1 }) => html`<section class=${cls + '-row' + (kind ? ' ' + kind : '')}>
        <h2>${label}</h2>${aside ? html`<span class=${cls + '-aside'}>${aside}</span>` : null}
        <div class=${cls + '-cards'}>${tiles.map((tile, i) => html`<${Tile} key=${tile.key === undefined ? i : tile.key} cls=${cls + '-card'} ...${tile} focused=${i === focus} />`)}</div>
    </section>`;

    // A choice in a line of choices: active is the one shown, selected the
    // one picked, focused the one under the remote.
    const Pill = ({ cls, label, active, selected, focused }) =>
        html`<span class=${classes(cls, { active, selected, focus: focused })}>${label}</span>`;

    // A profile's drawn avatar (avatars.js), or its initial in the theme accent. A
    // kids profile (#62) wears a KIDS badge on the avatar's bottom edge.
    const Avatar = ({ cls, profile }) => {
        const face = Avatars.has(profile.avatar) ? Avatars.art(profile.avatar) : profile.name.charAt(0).toUpperCase();
        const drawn = Avatars.has(profile.avatar) ? ' drawn' : '';
        return profile.kids
            ? html`<div class=${cls + drawn + ' kids'}>${face}<span class="kids-badge">${I18n.t('kids.badge')}</span></div>`
            : html`<div class=${cls + drawn}>${face}</div>`;
    };

    // Full-screen artwork with the shade that keeps text readable on it.
    const Backdrop = ({ src, fallback }) => html`${img('dt-backdrop', src, fallback)}<div class="dt-shade"></div>`;

    const ICONS = {
        sources: 'M8 6h13M8 12h13M8 18h13M3 6h1M3 12h1M3 18h1',
        person: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M4 21v-2a8 8 0 0 1 16 0v2',
        play: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0M10 8l6 4-6 4z',
        subtitles: 'M3 5h18v14H3zM10 9H7v6h3M17 9h-3v6h3',
        display: 'M3 4h18v13H3zM12 17v4M8 21h8',
        lock: 'M5 10h14v11H5zM8 10V6a4 4 0 0 1 8 0v4M12 14v3',
        backup: 'M6 17H5a4 4 0 0 1-1-8 7 7 0 0 1 13-2 5 5 0 0 1 2 10h-1M12 21V11M8 15l4-4 4 4',
        film: 'M3 3h18v18H3zM7 3v18M17 3v18M3 8h4M3 16h4M17 8h4M17 16h4M10 9l4 3-4 3z',
        info: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0M12 11v6M12 7h.01',
        sliders: 'M3 6h5M12 6h9M3 18h9M16 18h5M8 3v6M16 15v6M3 12h12M19 12h2M15 9v6',
        quality: 'M3 5h18v14H3zM7 9v6M11 9v6M7 12h4M15 9v6h1a3 3 0 0 0 0-6z',
        audio: 'M3 9h4l5-4v14l-5-4H3zM16 8a6 6 0 0 1 0 8M19 5a10 10 0 0 1 0 14',
        text: 'M4 5h16M12 5v14M8 19h8M4 9V5M20 9V5',
        aspect: 'M2 5h20v14H2zM6 10V9h3M18 14v1h-3',
        speed: 'M3 17a10 10 0 1 1 18 0M12 13l5-5M6 12h.01M12 6h.01M18 12h.01M10 17h4',
        skip: 'M4 5l8 7-8 7zM13 5l8 7-8 7z',
        moon: 'M20 15A9 9 0 0 1 9 3a9 9 0 1 0 11 12z',
        phone: 'M6 2h12v20H6zM10 5h4M11 19h2',
        avatar: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M8 9h.01M16 9h.01M8 14a4 4 0 0 0 8 0',
        edit: 'M4 16L16 4l4 4L8 20H4zM13 7l4 4',
        add: 'M12 5v14M5 12h14',
        trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7',
        chevron: 'M9 5l7 7-7 7',
        restart: 'M3 11a9 9 0 1 1 2 7M3 4v7h7',
        swap: 'M3 7h18l-4-4M21 17H3l4 4',
        grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
        help: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0M9 8a3 3 0 0 1 6 0c0 2-3 2-3 5M12 17h.01',
    };
    const GLYPH_ICONS = { '?': 'help', '›': 'chevron', '▶': 'play', '↺': 'restart', '⇆': 'swap', '▦': 'grid', '↻': 'restart' };
    const MenuIcon = ({ glyph, name }) => {
        const icon = name || GLYPH_ICONS[glyph];
        return html`<span class=${'menu-icon' + (icon ? ' svg-icon' : '')} data-glyph=${glyph} data-icon=${icon} aria-hidden="true">
            ${icon ? html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d=${ICONS[icon]} /></svg>` : null}
        </span>`;
    };

    // A titled list of options with one focused row. An option may carry an
    // icon before its label and a check mark after it, or a glyph that CSS
    // draws before it (so the row's text stays its label); a note is a line
    // of information the focus passes over.
    const MenuRow = ({ option, focused }) => (option.icon
        ? html`<div class=${classes('menu-row with-icon', { focused })}>
            ${typeof option.icon === 'string' ? html`<${MenuIcon} glyph=${option.icon} />` : option.icon}<span class="menu-label">${option.label}</span>${option.check ? html`<span class="menu-check">✓</span>` : null}
        </div>`
        : html`<div class=${classes('menu-row', { focused, note: option.note, rich: !!option.view })} data-glyph=${option.note ? null : option.glyph || '›'}>${option.view || html`<span class="menu-label">${option.label}</span>`}</div>`);

    // header { image, sub } puts the item's artwork and a line beside the title (#48);
    // header { profile } puts the profile's avatar above its name.
    const MenuHead = ({ title, header }) => (header && header.profile
        ? html`<div class="menu-head profile"><${Avatar} cls="menu-avatar menu-head-avatar" profile=${header.profile} />
            <div class="menu-title">${title}</div></div>`
        : header
        ? html`<div class="menu-head">${header.image ? img('menu-art', header.image) : null}<div class="menu-head-text">
            <div class="menu-title">${title}</div>${header.sub ? html`<div class="menu-sub">${header.sub}</div>` : null}
        </div></div>`
        : html`<div class="menu-title">${title}</div>`);

    const SideMenu = ({ title, options, index, header }) => html`<${MenuHead} title=${title} header=${header} />
        ${options.map((option, i) => html`<${MenuRow} option=${option} focused=${i === index} />`)}`;

    // A channel's 16:9 plate (#44): its logo on a light plate, or, without a
    // logo or once the logo fails, its name on a colour taken from the name.
    // Logos are mostly transparent PNGs, so they need a plate of their own.
    // A logo that failed once is not asked for again while the app runs, so
    // lists that rebuild on every key press do not repeat dead requests.
    const hue = (name) => Array.from(String(name)).reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
    const dead = new Set();
    // Children (badges, a progress bar) sit on top of the plate.
    const Plate = ({ cls, name, logo, onFail, children }) => {
        const shown = logo && !dead.has(logo);
        const fail = (event) => {
            if (dead.size >= 400) dead.delete(dead.values().next().value);
            dead.add(logo);
            event.currentTarget.parentNode.classList.add('nologo');
            if (onFail) onFail(logo);
        };
        return html`<div class=${classes('plate' + (cls ? ' ' + cls : ''), { nologo: !shown })} style=${{ '--h': hue(name) }}>
            ${shown ? html`<img class=${classes('plate-logo art', { 'art-in': Art.seen(logo) })} src=${logo} alt="" onError=${fail} />` : null}
            <span class="plate-name">${name}</span>${children}
        </div>`;
    };

    // The plate as a node, for screens not yet in Preact.
    const plateNode = (props) => UI.node(html`<${Plate} ...${props} />`);

    return { Tile, Row, Pill, Avatar, Backdrop, SideMenu, MenuIcon, Plate, plateNode };
})();
