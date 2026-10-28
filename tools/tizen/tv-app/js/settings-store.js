// App-wide settings keep their existing object and legacy view keys.
window.Prefs = (function () {
    'use strict';

    // Read before a profile is chosen, or shared by every profile.
    var SHARED = { tmdbApiKey: true, opensubtitlesApiKey: true, subdlApiKey: true, subsourceApiKey: true, deeplApiKey: true, askProfile: true };
    var listeners = [];
    var DEFAULTS = {
        autoplayMs: 8000,
        skipIntroSeconds: 90,
        programmeGuide: true,
        livePreview: true,
        subtitleSize: 'm',
        subtitleLanguages: 'en',
        subtitleFallback: true,
        subtitleColour: 'white',
        subtitleBackground: 'shadow',
        subtitlePosition: 'bottom',
        pictureAspect: 'auto',
        homeLayout: 'cinema',
        librarySources: 'current',
        askProfile: true,
        'view:movies': 'grid',
        'view:series': 'grid',
        'view:live': 'list',
        'sort:movies': 'newest',
        'sort:series': 'newest',
        onStart: 'last-channel',
        parentalRelockMs: 900000,
        language: 'en',
        theme: 'dark',
        accent: 'blue',
        density: 'comfortable',
        motion: 'on',
        topBar: 'on',
        menuPosition: 'side',
    };

    function read(key, fallback) {
        try {
            return JSON.parse(localStorage.getItem(key)) || fallback;
        } catch (e) {
            return fallback;
        }
    }

    function write(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (e) {
            // Storage full or unavailable.
        }
    }

    function store(name) {
        return SHARED[name] ? ProfileStore.sharedKey : ProfileStore.key('settings');
    }

    function get(name) {
        var settings = read(store(name), {});
        if (name === 'lastChannelOnStart') return get('onStart') === 'last-channel';
        if (settings[name] !== undefined) return settings[name];
        if (name === 'onStart' && settings.lastChannelOnStart === false) return 'home';
        // Keep the toolbar's existing view keys, including choices from older installs.
        if (name.indexOf('view:') === 0) {
            var saved;
            try {
                saved = localStorage.getItem(ProfileStore.key(name));
            } catch (e) {
                // Use the default when storage is unavailable.
            }
            if (saved === 'grid' || saved === 'list') return saved;
        }
        return DEFAULTS[name];
    }

    function set(name, value) {
        var settings = read(store(name), {});
        if (name === 'lastChannelOnStart') {
            name = 'onStart';
            value = value ? 'last-channel' : 'home';
        }
        settings[name] = value;
        write(store(name), settings);
        if (name.indexOf('view:') === 0) {
            try {
                localStorage.setItem(ProfileStore.key(name), value);
            } catch (e) {
                // The settings object still holds the choice.
            }
        }
        listeners.slice().forEach(function (listener) { listener(name); });
    }

    return {
        get: get,
        getDefault: function (name) { return DEFAULTS[name]; },
        set: set,
        onChange: function (listener) { listeners.push(listener); },
    };
})();
