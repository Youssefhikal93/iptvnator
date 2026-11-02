// "Who's watching?": one tile per profile plus Add profile. Shown on start when
// there are two or more profiles, and from Settings to switch. Holding OK on
// a profile offers to change its name or avatar.
window.ProfileScreen = (() => {
    'use strict';

    const { html } = UI;
    let root = null;
    let focus = 0;
    let onDone = null;
    let onCancel = null;
    // The profile in use changed its limits here (Kids switch or lists), so
    // leaving must reload even when the same profile stays in use.
    let reload = false;

    // The profiles, then an empty slot for "Add profile" while there is room.
    const slots = () => {
        const list = ProfileStore.list();
        return list.length < ProfileStore.max ? list.concat([null]) : list;
    };

    // A padlock before the name marks a profile that asks for a PIN (#95).
    const lock = () => html`<svg class="pf-lock" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8h-1V6A5 5 0 0 0 7 6v2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2zm-6 9a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm3.1-9H8.9V6a3.1 3.1 0 0 1 6.2 0v2z"/></svg>`;

    const tile = (profile, focused) => html`<div class=${'pf-tile' + (focused ? ' focused' : '')}>
        ${profile
            ? html`<${Kit.Avatar} cls="pf-avatar" profile=${profile} />`
            : html`<div class="pf-avatar pf-add">+</div>`}
        <div class="pf-name">
            ${profile && ProfileStore.hasPin(profile.id) ? lock() : null}
            <span class="pf-name-text">${profile ? profile.name : I18n.t('profile.add')}</span>
        </div>
    </div>`;

    const render = () => {
        const focused = slots()[focus];
        UI.render(html`<h1 class="pf-title">${I18n.t('profile.whosWatching')}</h1>
            <div class="pf-tiles">${slots().map((profile, index) => tile(profile, index === focus))}</div>
            <p class="pf-hint">${focused ? I18n.t('profile.avatarHint') : ''}</p>`, root);
    };

    const close = () => {
        if (root) root.remove();
        root = null;
    };

    const finish = (changed) => {
        const done = onDone;
        close();
        if (done) done(changed);
    };

    // Name, Kids switch, avatar and, for a kids profile, its categories, from
    // a held OK. While a kids profile is in use, these ask for the PIN first.
    const options = (profile) => {
        const again = (changed) => {
            if (changed === true) reload = true;
            if (root) render();
        };
        const list = [
            { label: I18n.t('profile.changeName'), glyph: '✎', run: () => KidsSetup.edit(profile, again) },
            { label: I18n.t('profile.changeAvatar'), glyph: '◉', run: () => AvatarPicker.open(profile, again) },
        ];
        if (profile.kids) list.push({ label: I18n.t('kids.title', { name: profile.name }), run: () => KidsSetup.choose(profile, again) });
        KidsProfile.leave(null, () => Menu.open(profile.name, list, 0, { profile }));
    };

    const choose = () => {
        const profile = slots()[focus];
        if (profile) return KidsProfile.leave(profile.id, () => finish(ProfileStore.setActive(profile.id) || reload));
        KidsProfile.leave(null, () => KidsSetup.add(I18n.t('profile.addHint'), (added) => {
            if (added) finish(ProfileStore.setActive(added.id));
            else if (root) render();
        }));
    };

    return {
        // Two or more profiles, unless the viewer turned the question off.
        shouldAsk: () => ProfileStore.list().length > 1 && Prefs.get('askProfile') !== false,
        // done(changed) runs after a pick; cancel runs on Return.
        open: (done, cancel) => {
            close();
            onDone = done;
            onCancel = cancel;
            reload = false;
            const active = ProfileStore.active().id;
            focus = Math.max(0, ProfileStore.list().map((profile) => profile.id).indexOf(active));
            root = document.createElement('section');
            root.id = 'profiles';
            root.setAttribute('role', 'dialog');
            root.setAttribute('aria-modal', 'true');
            root.setAttribute('aria-label', I18n.t('profile.whosWatching'));
            document.body.appendChild(root);
            render();
        },
        isOpen: () => !!root,
        onKey: (event) => {
            const code = event.keyCode;
            const profile = slots()[focus];
            event.preventDefault();
            // A held OK must not also pick in the menu it opens.
            if (Keys.repeat(code)) return;
            if (Menu.isOpen()) return Menu.onKey(code);
            if (code === Keys.LEFT || code === Keys.RIGHT) {
                const moved = Focus.step(focus, slots().length, code, 'row');
                if (moved.index !== undefined) focus = moved.index;
                render();
            } else if (code === Keys.ENTER) {
                if (profile) Keys.press(choose, () => options(profile), () => root && root.querySelector('.pf-tile.focused'));
                else choose();
            } else if (Keys.isBack(code)) {
                if (reload) return finish(true);
                const cancel = onCancel;
                close();
                if (cancel) cancel();
            }
        },
    };
})();
