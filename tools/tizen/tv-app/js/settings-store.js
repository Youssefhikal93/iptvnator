// App-wide settings keep their existing object and legacy view keys.
window.Prefs = (function () {
    'use strict';

    var PREFIX = 'iptvnator-tv:';
    var listeners = [];
    var DEFAULTS = {
        autoplayMs: 8000,
        skipIntroSeconds: 90,
        programmeGuide: true,
        livePreview: true,
        homeLayout: 'cinema',
        librarySources: 'current',
        'view:movies': 'grid',
        'view:series': 'grid',
        'view:live': 'list',
        'sort:movies': 'newest',
        'sort:series': 'newest',
        onStart: 'last-channel',
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

    function get(name) {
        var settings = read(PREFIX + 'settings', {});
        if (name === 'lastChannelOnStart') return get('onStart') === 'last-channel';
        if (settings[name] !== undefined) return settings[name];
        if (name === 'onStart' && settings.lastChannelOnStart === false) return 'home';
        // Keep the toolbar's existing view keys, including choices from older installs.
        if (name.indexOf('view:') === 0) {
            var saved;
            try {
                saved = localStorage.getItem(PREFIX + name);
            } catch (e) {
                // Use the default when storage is unavailable.
            }
            if (saved === 'grid' || saved === 'list') return saved;
        }
        return DEFAULTS[name];
    }

    function set(name, value) {
        var settings = read(PREFIX + 'settings', {});
        if (name === 'lastChannelOnStart') {
            name = 'onStart';
            value = value ? 'last-channel' : 'home';
        }
        settings[name] = value;
        write(PREFIX + 'settings', settings);
        if (name.indexOf('view:') === 0) {
            try {
                localStorage.setItem(PREFIX + name, value);
            } catch (e) {
                // The settings object still holds the choice.
            }
        }
        listeners.slice().forEach(function (listener) { listener(name); });
    }

    return {
        get: get,
        set: set,
        onChange: function (listener) { listeners.push(listener); },
    };
})();
