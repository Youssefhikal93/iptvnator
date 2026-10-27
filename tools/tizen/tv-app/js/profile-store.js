// Viewer profiles. Everything one viewer owns (favorites, recents, progress,
// watched marks, settings, hidden and locked categories, PIN) lives under
// "iptvnator-tv:p:<profileId>:<name>". Sources and caches stay shared.
// Every per-viewer store builds its key with ProfileStore.key(name).
window.ProfileStore = (function () {
    'use strict';

    var PREFIX = 'iptvnator-tv:';
    var LIST_KEY = PREFIX + 'profiles';
    var ACTIVE_KEY = PREFIX + 'profile';
    var VERSION_KEY = PREFIX + 'profiles-version';
    var SHARED_KEY = PREFIX + 'shared-settings';
    var VERSION = 1;
    var MAX = 6;
    var NAME_MAX = 20;
    var COLOURS = ['#78adff', '#f2a65a', '#7fd6a2', '#e58aa8', '#b79cf0', '#e2d36b'];
    // Per-viewer keys (without the prefix) written before profiles existed.
    var VIEWER_KEY = /^(progress|settings|pin|view:.+|(favorites|recent|last-channel|sort|seen|hidden-categories|locked-categories|backup):.+)$/;
    var listeners = [];
    var profiles = [];
    var activeId = 'default';

    function get(key) {
        try {
            return localStorage.getItem(key);
        } catch (e) {
            return null;
        }
    }

    function parse(text) {
        try {
            return JSON.parse(text);
        } catch (e) {
            return null;
        }
    }

    function put(key, value) {
        try {
            localStorage.setItem(key, value);
            return true;
        } catch (e) {
            return false;
        }
    }

    function keysWith(prefix) {
        var found = [];
        try {
            for (var i = 0; i < localStorage.length; i++) {
                var key = localStorage.key(i);
                if (key && key.indexOf(prefix) === 0) found.push(key);
            }
        } catch (e) {
            // Nothing to list.
        }
        return found;
    }

    function keyFor(id, name) {
        return PREFIX + 'p:' + id + ':' + name;
    }

    // The old settings object also held the TMDB key, which all profiles share.
    function withoutSecret(name, value) {
        if (name !== 'settings') return value;
        var saved = parse(value);
        if (!saved || typeof saved !== 'object') return value;
        delete saved.tmdbApiKey;
        return JSON.stringify(saved);
    }

    function keepSecret(value) {
        var saved = parse(value);
        if (!saved || typeof saved.tmdbApiKey !== 'string' || !saved.tmdbApiKey) return true;
        var shared = parse(get(SHARED_KEY)) || {};
        if (shared.tmdbApiKey) return true;
        shared.tmdbApiKey = saved.tmdbApiKey;
        return put(SHARED_KEY, JSON.stringify(shared));
    }

    // Moves every old per-viewer key under `target`: copy, verify, then delete
    // the old key. A run that stopped half way is finished by the next start,
    // and a key already moved is skipped. Returns whether every key is done.
    function moveOldKeys(target) {
        var complete = true;
        keysWith(PREFIX).forEach(function (old) {
            var name = old.slice(PREFIX.length);
            if (!VIEWER_KEY.test(name)) return;
            var value = get(old);
            if (value === null) return;
            if (name === 'settings' && !keepSecret(value)) {
                complete = false;
                return;
            }
            var wanted = withoutSecret(name, value);
            var dest = keyFor(target, name);
            var saved = get(dest);
            if (saved === null && put(dest, wanted)) saved = get(dest);
            if (saved === wanted) {
                try {
                    localStorage.removeItem(old);
                } catch (e) {
                    complete = false;
                }
            } else if (saved === null) complete = false;
            // A different value already at the destination wins; the old key stays.
        });
        return complete;
    }

    function validList(saved) {
        return Array.isArray(saved) && saved.length > 0 && saved.every(function (entry) {
            return entry && typeof entry.id === 'string' && entry.id && entry.id.indexOf(':') === -1 && typeof entry.name === 'string';
        });
    }

    function saveList() {
        put(LIST_KEY, JSON.stringify(profiles));
    }

    function init() {
        var saved = parse(get(LIST_KEY));
        profiles = validList(saved) ? saved : [{ id: 'default', name: 'Me', color: COLOURS[0] }];
        if (!validList(saved)) saveList();
        var wanted = get(ACTIVE_KEY);
        activeId = find(wanted) ? wanted : profiles[0].id;
        if (wanted !== activeId) put(ACTIVE_KEY, activeId);
        if (parseInt(get(VERSION_KEY), 10) >= VERSION) return;
        var target = profiles.some(function (profile) { return profile.id === 'default'; }) ? 'default' : profiles[0].id;
        if (moveOldKeys(target)) put(VERSION_KEY, String(VERSION));
        else if (window.Log) Log.error('PROFILES migration incomplete, retrying next start');
    }

    function find(id) {
        return profiles.filter(function (profile) { return profile.id === id; })[0] || null;
    }

    function nameError(name, exceptId) {
        if (!name) return I18n.t('profile.errEmpty');
        if (name.length > NAME_MAX) return I18n.t('profile.errLong', { n: NAME_MAX });
        var taken = profiles.some(function (profile) {
            return profile.id !== exceptId && profile.name.toLowerCase() === name.toLowerCase();
        });
        return taken ? I18n.t('profile.errTaken') : '';
    }

    function setActive(id) {
        if (!find(id) || id === activeId) return false;
        activeId = id;
        put(ACTIVE_KEY, id);
        listeners.slice().forEach(function (listener) { listener(id); });
        return true;
    }

    function add(name) {
        name = String(name || '').trim();
        if (profiles.length >= MAX || nameError(name, null)) return null;
        var used = profiles.map(function (profile) { return profile.color; });
        var color = COLOURS.filter(function (colour) { return used.indexOf(colour) === -1; })[0] || COLOURS[profiles.length % COLOURS.length];
        var id;
        do id = 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); while (find(id));
        var profile = { id: id, name: name, color: color };
        profiles = profiles.concat([profile]);
        saveList();
        return profile;
    }

    function remove(id) {
        if (profiles.length < 2 || !find(id)) return false;
        profiles = profiles.filter(function (profile) { return profile.id !== id; });
        saveList();
        // The list goes first, so an interrupted clean-up only leaves unreachable keys.
        keysWith(keyFor(id, '')).forEach(function (key) {
            try {
                localStorage.removeItem(key);
            } catch (e) {
                // Left behind; nothing reads it.
            }
        });
        if (activeId === id) setActive(profiles[0].id);
        return true;
    }

    init();

    return {
        key: function (name) { return keyFor(activeId, name); },
        sharedKey: SHARED_KEY,
        max: MAX,
        list: function () { return profiles.slice(); },
        active: function () { return find(activeId); },
        setActive: setActive,
        add: add,
        remove: remove,
        rename: function (id, name) {
            name = String(name || '').trim();
            var profile = find(id);
            if (!profile || nameError(name, id)) return false;
            profile.name = name;
            saveList();
            return true;
        },
        // avatar: an Avatars id, or '' for the initial.
        setAvatar: function (id, avatar) {
            var profile = find(id);
            if (!profile) return false;
            if (avatar) profile.avatar = String(avatar);
            else delete profile.avatar;
            saveList();
            return true;
        },
        // Whether a profile has a PIN; Who's watching marks those.
        hasPin: function (id) {
            return !!parse(get(keyFor(id, 'pin')));
        },
        nameError: nameError,
        onSwitch: function (listener) { listeners.push(listener); },
        // Exposed for the unit tests: runs the start-up step again.
        init: init,
    };
})();
