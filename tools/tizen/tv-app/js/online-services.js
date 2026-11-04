// Profile choices for optional services; keys remain shared and saved answers stay put.
window.OnlineServices = (function () {
    'use strict';

    var FEATURES = {
        tmdb: ['details', 'artwork', 'cast', 'collections', 'similar', 'genres', 'boxes'],
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
