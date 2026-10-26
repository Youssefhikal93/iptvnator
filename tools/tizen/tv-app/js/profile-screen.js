// "Who's watching?": one tile per profile plus Add profile. Shown on start when
// there are two or more profiles, and from Settings to switch.
window.ProfileScreen = (function () {
    'use strict';

    var root = null;
    var focus = 0;
    var onDone = null;
    var onCancel = null;

    function el(tag, cls, text) {
        var node = document.createElement(tag);
        node.className = cls;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    // The profiles, then an empty slot for "Add profile" while there is room.
    function slots() {
        var list = ProfileStore.list();
        return list.length < ProfileStore.max ? list.concat([null]) : list;
    }

    function render() {
        root.textContent = '';
        root.appendChild(el('h1', 'pf-title', I18n.t('profile.whosWatching')));
        var tiles = el('div', 'pf-tiles');
        slots().forEach(function (profile, index) {
            var tile = el('div', 'pf-tile' + (focus === index ? ' focused' : ''));
            var avatar = el('div', 'pf-avatar' + (profile ? '' : ' pf-add'), profile ? profile.name.charAt(0).toUpperCase() : '+');
            if (profile) avatar.style.background = profile.color;
            tile.appendChild(avatar);
            tile.appendChild(el('div', 'pf-name', profile ? profile.name : I18n.t('profile.add')));
            tiles.appendChild(tile);
        });
        root.appendChild(tiles);
    }

    function close() {
        if (root) root.remove();
        root = null;
    }

    function finish(changed) {
        var done = onDone;
        close();
        if (done) done(changed);
    }

    function choose() {
        var profile = slots()[focus];
        if (profile) return finish(ProfileStore.setActive(profile.id));
        ProfileDialog.open({
            title: I18n.t('profile.add'),
            text: I18n.t('profile.addHint'),
            value: '',
            ok: I18n.t('profile.addButton'),
            validate: function (name) { return ProfileStore.nameError(name, null); },
            done: function (name) {
                var added = name && ProfileStore.add(name);
                if (added) finish(ProfileStore.setActive(added.id));
                else if (root) render();
            },
        });
    }

    return {
        // Two or more profiles, unless the viewer turned the question off.
        shouldAsk: function () {
            return ProfileStore.list().length > 1 && Prefs.get('askProfile') !== false;
        },
        // done(changed) runs after a pick; cancel runs on Return.
        open: function (done, cancel) {
            close();
            onDone = done;
            onCancel = cancel;
            var active = ProfileStore.active().id;
            focus = Math.max(0, ProfileStore.list().map(function (profile) { return profile.id; }).indexOf(active));
            root = el('section', '');
            root.id = 'profiles';
            root.setAttribute('role', 'dialog');
            root.setAttribute('aria-modal', 'true');
            root.setAttribute('aria-label', I18n.t('profile.whosWatching'));
            document.body.appendChild(root);
            render();
        },
        isOpen: function () { return !!root; },
        onKey: function (event) {
            var code = event.keyCode;
            if (code === Keys.LEFT || code === Keys.RIGHT) {
                focus = Math.max(0, Math.min(slots().length - 1, focus + (code === Keys.LEFT ? -1 : 1)));
                render();
            } else if (code === Keys.ENTER) choose();
            else if (Keys.isBack(code)) {
                var cancel = onCancel;
                close();
                if (cancel) cancel();
            }
            event.preventDefault();
        },
    };
})();
