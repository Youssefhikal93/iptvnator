// Appearance follows the active profile's Prefs and applies at once.
window.Appearance = (function () {
    'use strict';

    function choice(name, choices) {
        var saved = Prefs.get(name);
        return choices.indexOf(saved) === -1 ? Prefs.getDefault(name) : saved;
    }

    function apply() {
        I18n.setLanguage(Prefs.get('language'));
        // The light palette is a [data-theme="light"] override of the :root tokens.
        document.documentElement.setAttribute('data-theme', Prefs.get('theme') === 'light' ? 'light' : 'dark');
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
