// Appearance follows the active profile's Prefs and applies at once.
window.Appearance = (function () {
    'use strict';

    function choice(name, choices) {
        var saved = Prefs.get(name);
        return choices.indexOf(saved) === -1 ? Prefs.getDefault(name) : saved;
    }

    var migrating = false;

    function apply() {
        var language = Prefs.get('language');
        // Moroccan Arabic was dropped; a profile that chose it gets Arabic,
        // even when the TV's storage refuses to save the change.
        if (language === 'ary') {
            language = 'ar';
            if (!migrating) {
                migrating = true;
                try { Prefs.set('language', 'ar'); } catch (e) { /* kept for this run only */ }
                migrating = false;
            }
        }
        I18n.setLanguage(language);
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
