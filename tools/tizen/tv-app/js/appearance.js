// Appearance follows the active profile's Prefs and applies at once.
window.Appearance = (function () {
    'use strict';

    function choice(name, choices) {
        var saved = Prefs.get(name);
        return choices.indexOf(saved) === -1 ? Prefs.getDefault(name) : saved;
    }

    function apply() {
        // Moroccan Arabic was dropped; a profile that chose it gets Arabic.
        if (Prefs.get('language') === 'ary') return Prefs.set('language', 'ar');
        I18n.setLanguage(Prefs.get('language'));
        document.documentElement.setAttribute('data-theme', choice('theme', ['dark', 'black', 'grey', 'light']));
        document.documentElement.setAttribute('data-accent', choice('accent', ['blue', 'saffron', 'asphalt', 'violet', 'pink']));
        document.documentElement.setAttribute('data-density', choice('density', ['comfortable', 'compact']));
        document.documentElement.setAttribute('data-motion', choice('motion', ['on', 'off']));
    }

    Prefs.onChange(function (name) {
        if (name === 'language' || name === 'theme' || name === 'accent' || name === 'density' || name === 'motion') apply();
    });
    ProfileStore.onSwitch(apply);
    apply();

    return { apply: apply };
})();
