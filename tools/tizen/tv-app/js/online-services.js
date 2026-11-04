// Profile choices for optional services; keys remain shared and saved answers stay put.
window.OnlineServices = (function () {
    'use strict';

    var FEATURES = {
        tmdb: ['details', 'artwork', 'cast', 'collections', 'similar', 'genres', 'boxes', 'saver'],
        opensubtitles: ['opensubtitles'], subdl: ['subdl'], subsource: ['subsource'], deepl: ['deepl'],
        trailers: ['youtube'],
    };

    function row(feature) {
        var tmdb = FEATURES.tmdb.indexOf(feature) >= 0;
        var pref = tmdb ? 'tmdb' + feature.charAt(0).toUpperCase() + feature.slice(1) : feature + 'On';
        return {
            key: pref, choices: [true, false],
            get label() { return I18n.t('services.' + feature); },
            get warning() { return I18n.t('services.' + feature + 'Off'); },
            get labels() { return [I18n.t('common.on'), I18n.t('common.off')]; },
        };
    }

    // Backup search owns SubSource and DeepL (#98): turning it Off or On turns
    // both the same way; turning either back On turns Backup search On again.
    // Artwork Off turns Screen saver artwork Off; that On turns Artwork On (#99).
    var linking = false;
    function link(name) {
        if (linking) return;
        var set = function (key, value) { if (Prefs.get(key) !== value) Prefs.set(key, value); };
        linking = true;
        try {
            if (name === 'subtitleFallback') {
                var on = Prefs.get('subtitleFallback') !== false;
                set('subsourceOn', on);
                set('deeplOn', on);
            } else if ((name === 'subsourceOn' || name === 'deeplOn') && Prefs.get(name) !== false) {
                set('subtitleFallback', true);
            } else if (name === 'tmdbArtwork' && Prefs.get(name) === false) {
                // The saver's backdrops are artwork too (#99).
                set('tmdbSaver', false);
            } else if (name === 'tmdbSaver' && Prefs.get(name) !== false) {
                set('tmdbArtwork', true);
            }
        } finally {
            linking = false;
        }
    }
    if (typeof Prefs !== 'undefined' && Prefs.onChange) Prefs.onChange(link);

    return {
        // Artwork the app found on TMDB; '' while Artwork is Off. The provider's
        // own covers never pass through here, so they always show.
        artwork: function (url) {
            return Prefs.get('tmdbArtwork') === false ? '' : url || '';
        },
        rows: function (group) {
            var rows = FEATURES[group].map(row);
            if (group === 'trailers') Object.defineProperty(rows[0], 'part', { get: function () { return I18n.t('services.trailers'); }, enumerable: true });
            return rows;
        },
    };
})();
