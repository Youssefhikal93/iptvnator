// Choose a profile's avatar (#43): the initial or one of the drawn avatars,
// shown on the profile's colour. Opened from Settings > Profiles and with
// ▲ on Who's watching. done(changed) runs when it closes.
window.AvatarPicker = (() => {
    'use strict';

    const { html } = UI;
    const COLUMNS = 7;
    let state = null;
    let root = null;

    const choices = () => [''].concat(Avatars.ids);

    const view = () => {
        const { profile, focus } = state;
        return html`<h1 class="ap-title">${I18n.t('profile.chooseAvatar', { name: profile.name })}</h1>
            <div class="ap-grid">${choices().map((avatar, i) => html`
                <div class=${'ap-choice' + (i === focus ? ' focused' : '') + (avatar === (profile.avatar || '') ? ' current' : '')}>
                    <${Kit.Avatar} cls="ap-avatar" profile=${{ ...profile, avatar }} />
                    ${avatar ? null : html`<span class="ap-letter">${I18n.t('profile.letter')}</span>`}
                </div>`)}
            </div>`;
    };

    const render = () => UI.render(view(), root);

    const close = (changed) => {
        const done = state && state.done;
        state = null;
        if (root) root.remove();
        root = null;
        if (done) done(changed);
    };

    // LEFT/RIGHT move along a row, UP/DOWN by a whole row.
    const move = (code) => {
        const count = choices().length;
        const { focus } = state;
        const column = focus % COLUMNS;
        const row = Math.floor(focus / COLUMNS);
        if (code === Keys.LEFT || code === Keys.RIGHT) {
            const width = Math.min(COLUMNS, count - row * COLUMNS);
            const moved = Focus.step(column, width, code, 'row');
            if (moved.index !== undefined) state.focus = row * COLUMNS + moved.index;
        } else {
            const rows = Math.ceil(count / COLUMNS);
            const moved = Focus.step(row, rows, code, 'column');
            if (moved.index !== undefined) state.focus = Math.min(count - 1, moved.index * COLUMNS + column);
        }
    };

    return {
        open: (profile, done) => {
            close(false);
            state = { profile, done, focus: Math.max(0, choices().indexOf(profile.avatar || '')) };
            root = document.createElement('section');
            root.id = 'avatar-picker';
            root.setAttribute('role', 'dialog');
            root.setAttribute('aria-modal', 'true');
            root.setAttribute('aria-label', I18n.t('profile.avatar'));
            document.body.appendChild(root);
            render();
        },
        isOpen: () => !!state,
        onKey: (event) => {
            const code = event.keyCode;
            if (Keys.isBack(code)) close(false);
            else if (code === Keys.ENTER) close(ProfileStore.setAvatar(state.profile.id, choices()[state.focus]));
            else if ([Keys.LEFT, Keys.RIGHT, Keys.UP, Keys.DOWN].indexOf(code) !== -1) {
                move(code);
                render();
            }
            event.preventDefault();
        },
    };
})();
