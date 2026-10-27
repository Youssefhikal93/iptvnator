// Shared screen components (#41). Screens build their views from these
// instead of their own markup, so a tile, a pill or a menu row looks and
// behaves the same everywhere. Each keeps the class names its CSS already
// styles; `cls` picks the family (for example 'dt-ep-pill' or 'tm-chip').
window.Kit = (() => {
    'use strict';

    const { html, img } = UI;
    const classes = (base, flags) => [base].concat(Object.keys(flags).filter((flag) => flags[flag])).join(' ');

    // A card with artwork and a name: { image, name }.
    const Tile = ({ cls = 'tm-card', image, name, focused }) =>
        html`<div class=${classes(cls, { focus: focused })}>${image ? img('', image) : null}<span>${name}</span></div>`;

    // A titled strip of tiles; focus is the focused tile's index or -1.
    const Row = ({ label, tiles, focus = -1 }) => html`<section class="tm-row">
        <h2>${label}</h2>
        <div class="tm-cards">${tiles.map((tile, i) => html`<${Tile} ...${tile} focused=${i === focus} />`)}</div>
    </section>`;

    // A choice in a line of choices: active is the one shown, selected the
    // one picked, focused the one under the remote.
    const Pill = ({ cls, label, active, selected, focused }) =>
        html`<span class=${classes(cls, { active, selected, focus: focused })}>${label}</span>`;

    // A profile's drawn avatar (avatars.js), or its initial, on its colour.
    const Avatar = ({ cls, profile }) => (Avatars.has(profile.avatar)
        ? html`<div class=${cls + ' drawn'} style=${{ background: profile.color }}>${Avatars.svg(profile.avatar)}</div>`
        : html`<div class=${cls} style=${{ background: profile.color }}>${profile.name.charAt(0).toUpperCase()}</div>`);

    // Full-screen artwork with the shade that keeps text readable on it.
    const Backdrop = ({ src, fallback }) => html`${img('dt-backdrop', src, fallback)}<div class="dt-shade"></div>`;

    // A titled list of options with one focused row. An option may carry an
    // icon before its label and a check mark after it.
    const MenuRow = ({ option, focused }) => (option.icon
        ? html`<div class=${classes('menu-row with-icon', { focused })}>
            ${option.icon}<span class="menu-label">${option.label}</span>${option.check ? html`<span class="menu-check">✓</span>` : null}
        </div>`
        : html`<div class=${classes('menu-row', { focused })}>${option.label}</div>`);

    const SideMenu = ({ title, options, index }) => html`<div class="menu-title">${title}</div>
        ${options.map((option, i) => html`<${MenuRow} option=${option} focused=${i === index} />`)}`;

    return { Tile, Row, Pill, Avatar, Backdrop, SideMenu };
})();
