// The active profile's avatar above the rail. OK opens a small menu that
// switches profiles, like the profile menu of streaming apps.
window.RailProfile = (function () {
    'use strict';

    function avatar(profile, cls) {
        var node = document.createElement('div');
        node.className = cls;
        node.textContent = profile.name.charAt(0).toUpperCase();
        node.style.background = profile.color;
        return node;
    }

    function render(rail, focused) {
        var profile = ProfileStore.active();
        var item = document.createElement('div');
        item.className = 'rail-profile' + (focused ? ' focused' : '');
        item.appendChild(avatar(profile, 'rail-avatar'));
        var name = document.createElement('span');
        name.textContent = profile.name;
        item.appendChild(name);
        rail.insertBefore(item, rail.firstChild);
    }

    // changed() reloads the browser for the new profile; manage() opens Settings.
    function open(changed, manage) {
        var active = ProfileStore.active().id;
        var at = 0;
        var options = ProfileStore.list().map(function (profile, index) {
            if (profile.id === active) at = index;
            return {
                label: (profile.id === active ? '✓ ' : '') + profile.name,
                run: function () { if (ProfileStore.setActive(profile.id)) changed(); },
            };
        });
        options.push({ label: I18n.t('profile.manage'), run: manage });
        Menu.open(I18n.t('profile.switch'), options, at);
        document.getElementById('menu').classList.add('profile-menu');
    }

    return { render: render, open: open };
})();
