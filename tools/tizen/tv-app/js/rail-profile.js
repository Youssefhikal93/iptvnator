// The active profile's avatar above the rail. OK opens a small menu that
// switches profiles, like the profile menu of streaming apps.
window.RailProfile = (() => {
    'use strict';

    const { html } = UI;

    const render = (rail, focused) => {
        const profile = ProfileStore.active();
        const item = UI.node(html`<div class=${'rail-profile' + (focused ? ' focused' : '')}>
            <${Kit.Avatar} cls="rail-avatar" profile=${profile} />
            <span>${profile.name}</span>
        </div>`);
        rail.insertBefore(item, rail.firstChild);
    };

    // changed() reloads the browser for the new profile; manage() opens Settings.
    const open = (changed, manage) => {
        const active = ProfileStore.active().id;
        let at = 0;
        const options = ProfileStore.list().map((profile, index) => {
            if (profile.id === active) at = index;
            return {
                label: (profile.id === active ? '✓ ' : '') + profile.name,
                run: () => { if (ProfileStore.setActive(profile.id)) changed(); },
            };
        });
        options.push({ label: I18n.t('profile.manage'), run: manage });
        Menu.open(I18n.t('profile.switch'), options, at);
        document.getElementById('menu').classList.add('profile-menu');
    };

    return { render, open };
})();
