// The Profiles group of Settings: switch, add, rename and delete.
window.ProfileSettings = (function () {
    'use strict';

    function rows(hooks, render) {
        // A switch reloads the Home of the current source with the new profile's data;
        // a new avatar or name shows on the menu at once.
        function changed(didChange) {
            render();
            if (didChange) hooks.profileChanged();
            else hooks.chrome();
        }

        function add() {
            if (ProfileStore.list().length >= ProfileStore.max) return hooks.toast(I18n.t('profile.upTo', { n: ProfileStore.max }));
            ProfileDialog.open({
                title: I18n.t('profile.add'),
                text: I18n.t('profile.addHintOpen'),
                value: '',
                ok: I18n.t('profile.addButton'),
                validate: function (name) { return ProfileStore.nameError(name, null); },
                done: function (name) {
                    var profile = name && ProfileStore.add(name);
                    changed(!!profile && ProfileStore.setActive(profile.id));
                },
            });
        }

        function rename() {
            var profile = ProfileStore.active();
            ProfileDialog.open({
                title: I18n.t('profile.rename'),
                text: I18n.t('profile.renameHint', { name: profile.name }),
                value: profile.name,
                ok: I18n.t('common.save'),
                validate: function (name) { return ProfileStore.nameError(name, profile.id); },
                done: function (name) {
                    if (name) ProfileStore.rename(profile.id, name);
                    changed(false);
                },
            });
        }

        function remove() {
            var profile = ProfileStore.active();
            if (ProfileStore.list().length < 2) return hooks.toast(I18n.t('profile.lastCannotDelete'));
            ProfileDialog.open({
                title: I18n.t('profile.delete'),
                text: I18n.t('profile.deleteHint', { name: profile.name }),
                ok: I18n.t('profile.deleteButton'),
                done: function (confirmed) {
                    if (confirmed) {
                        ProfileStore.remove(profile.id);
                        hooks.toast(I18n.t('profile.deleted'));
                    }
                    changed(!!confirmed);
                },
            });
        }

        return [
            { get group() { return I18n.t('profile.group'); }, get label() { return I18n.t('profile.current'); }, run: function () { ProfileScreen.open(changed); }, text: function () { return ProfileStore.active().name; } },
            { get label() { return I18n.t('profile.avatar'); }, run: function () { AvatarPicker.open(ProfileStore.active(), function () { changed(false); }); }, text: '' },
            { get label() { return I18n.t('profile.addMenu'); }, run: add, text: function () { return ProfileStore.list().length >= ProfileStore.max ? I18n.t('profile.upToShort', { n: ProfileStore.max }) : ''; } },
            { get label() { return I18n.t('profile.renameMenu'); }, run: rename, text: '' },
            { get label() { return I18n.t('profile.delete'); }, run: remove, text: function () { return ProfileStore.list().length < 2 ? I18n.t('profile.needsAnother') : ''; } },
            { get label() { return I18n.t('profile.ask'); }, key: 'askProfile', choices: [true, false], get labels() { return [I18n.t('common.on'), I18n.t('common.off')]; } },
        ];
    }

    return { rows: rows };
})();
