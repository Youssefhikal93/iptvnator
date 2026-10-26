// The Profiles group of Settings: switch, add, rename and delete.
window.ProfileSettings = (function () {
    'use strict';

    function rows(hooks, render) {
        // A switch reloads the Home of the current source with the new profile's data.
        function changed(didChange) {
            render();
            if (didChange) hooks.profileChanged();
        }

        function add() {
            if (ProfileStore.list().length >= ProfileStore.max) return hooks.toast('Up to ' + ProfileStore.max + ' profiles');
            ProfileDialog.open({
                title: 'Add profile',
                text: 'Name the new profile. It starts empty and opens now.',
                value: '',
                ok: 'Add',
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
                title: 'Rename profile',
                text: 'New name for ' + profile.name + '.',
                value: profile.name,
                ok: 'Save',
                validate: function (name) { return ProfileStore.nameError(name, profile.id); },
                done: function (name) {
                    if (name) ProfileStore.rename(profile.id, name);
                    changed(false);
                },
            });
        }

        function remove() {
            var profile = ProfileStore.active();
            if (ProfileStore.list().length < 2) return hooks.toast('The last profile cannot be deleted');
            ProfileDialog.open({
                title: 'Delete profile',
                text: 'Delete ' + profile.name + '? Its favorites, history and settings are removed. Sources stay.',
                ok: 'Delete',
                done: function (confirmed) {
                    if (confirmed) {
                        ProfileStore.remove(profile.id);
                        hooks.toast('Profile deleted');
                    }
                    changed(!!confirmed);
                },
            });
        }

        return [
            { group: 'Profiles', label: 'Current profile', run: function () { ProfileScreen.open(changed); }, text: function () { return ProfileStore.active().name; } },
            { label: 'Add profile…', run: add, text: function () { return ProfileStore.list().length >= ProfileStore.max ? 'Up to ' + ProfileStore.max : ''; } },
            { label: 'Rename profile…', run: rename, text: '' },
            { label: 'Delete profile', run: remove, text: function () { return ProfileStore.list().length < 2 ? 'Needs another profile' : ''; } },
            { label: 'Ask who’s watching on start', key: 'askProfile', choices: [true, false], labels: ['On', 'Off'] },
        ];
    }

    return { rows: rows };
})();
