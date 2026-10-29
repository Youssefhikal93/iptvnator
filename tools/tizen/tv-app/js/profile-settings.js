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
            KidsSetup.add(I18n.t('profile.addHintOpen'), function (profile) {
                changed(!!profile && ProfileStore.setActive(profile.id));
            }, hooks.toast);
        }

        function rename() {
            KidsSetup.edit(ProfileStore.active(), changed, hooks.toast);
        }

        // "What can <name> watch?" for one of the kids profiles (#62).
        function kids() {
            var list = KidsSetup.profiles();
            if (list.length === 1) return KidsSetup.choose(list[0], changed, hooks.toast);
            Menu.open(I18n.t('kids.profiles'), list.map(function (profile) {
                return { label: profile.name, run: function () { KidsSetup.choose(profile, changed, hooks.toast); } };
            }));
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
            { get label() { return I18n.t('kids.profiles'); }, get hidden() { return !KidsSetup.profiles().length; }, run: kids, text: function () { return KidsSetup.profiles().map(function (profile) { return profile.name; }).join(', '); } },
            { get label() { return I18n.t('profile.delete'); }, run: remove, text: function () { return ProfileStore.list().length < 2 ? I18n.t('profile.needsAnother') : ''; } },
            { get label() { return I18n.t('profile.ask'); }, key: 'askProfile', choices: [true, false], get labels() { return [I18n.t('common.on'), I18n.t('common.off')]; } },
        ];
    }

    return { rows: rows };
})();
