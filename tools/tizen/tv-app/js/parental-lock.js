// The unlock session and wrong-try counter never leave memory.
window.ParentalLock = (function (clock) {
    'use strict';

    // Each profile has its own PIN and locks.
    var listeners = [];
    var openedAt = null;
    var timer = null;
    var failures = 0;
    var blockedUntil = 0;

    function read(key, fallback) {
        try {
            return JSON.parse(localStorage.getItem(key)) || fallback;
        } catch (e) {
            return fallback;
        }
    }

    function pinKey() {
        return ProfileStore.key('pin');
    }

    function locksKey(sourceId) {
        return ProfileStore.key('locked-categories:' + sourceId);
    }

    function hasPin() {
        return !!read(pinKey(), null);
    }

    // A salted non-cryptographic hash is a TV convenience lock, not encryption.
    function hash(pin, salt) {
        var text = salt + ':' + pin;
        var hashed = 5381;
        for (var i = 0; i < text.length; i++) hashed = ((hashed * 33) ^ text.charCodeAt(i)) >>> 0;
        return hashed.toString(16);
    }

    function changed() {
        listeners.slice().forEach(function (listener) { listener(); });
    }

    function closeSession() {
        clock.clearTimeout(timer);
        openedAt = null;
    }

    function relock() {
        var wasOpen = openedAt !== null;
        closeSession();
        if (wasOpen) changed();
    }

    function duration() {
        var ms = Prefs.get('parentalRelockMs');
        return [0, 300000, 900000, 3600000].indexOf(ms) >= 0 ? ms : 900000;
    }

    function schedule() {
        clock.clearTimeout(timer);
        if (openedAt === null || !duration()) return;
        var remaining = openedAt + duration() - clock.now();
        if (remaining <= 0) relock();
        else timer = clock.setTimeout(relock, remaining);
    }

    function isUnlocked() {
        if (openedAt !== null && duration() && clock.now() >= openedAt + duration()) relock();
        return openedAt !== null;
    }

    function waitSeconds() {
        return Math.max(0, Math.ceil((blockedUntil - clock.now()) / 1000));
    }

    function verify(pin) {
        if (waitSeconds()) return false;
        var saved = read(pinKey(), null);
        if (saved && /^\d{4}$/.test(pin) && saved.hash === hash(pin, saved.salt)) {
            failures = 0;
            return true;
        }
        failures++;
        if (failures >= 5) {
            blockedUntil = clock.now() + 30000;
            failures = 0;
        }
        return false;
    }

    function setPin(pin) {
        if (!/^\d{4}$/.test(pin)) throw new Error('Enter four digits');
        var salt = Date.now().toString(36) + Math.random().toString(36).slice(2);
        localStorage.setItem(pinKey(), JSON.stringify({ salt: salt, hash: hash(pin, salt) }));
        failures = 0;
        closeSession();
        changed();
    }

    function ids(sourceId, section) {
        var saved = read(locksKey(sourceId), {})[section];
        return Array.isArray(saved) ? saved.map(String) : [];
    }

    function isLocked(sourceId, section, categoryId) {
        return hasPin() && ids(sourceId, section).indexOf(String(categoryId)) !== -1;
    }

    function setCategory(sourceId, section, categoryId, locked) {
        if (!hasPin() || String(categoryId) === '') return;
        var saved = read(locksKey(sourceId), {});
        var list = ids(sourceId, section).filter(function (id) { return id !== String(categoryId); });
        saved[section] = locked ? list.concat(String(categoryId)) : list;
        localStorage.setItem(locksKey(sourceId), JSON.stringify(saved));
        changed();
    }

    function removePin() {
        // Clear every source, including sources that are not currently selected.
        var keys = [];
        for (var i = 0; i < localStorage.length; i++) {
            var key = localStorage.key(i);
            if (key.indexOf(locksKey('')) === 0) keys.push(key);
        }
        keys.forEach(function (key) { localStorage.removeItem(key); });
        localStorage.removeItem(pinKey());
        failures = 0;
        blockedUntil = 0;
        closeSession();
        changed();
    }

    function filterItems(sourceId, section, list) {
        if (!hasPin() || isUnlocked()) return list;
        var locked = ids(sourceId, section);
        if (!locked.length) return list;
        return list.filter(function (item) {
            var own = item.show || item;
            var category = own.category_id !== undefined && own.category_id !== null ? String(own.category_id) : own.group || '';
            // Old library snapshots without a category cannot prove access.
            return category !== '' && locked.indexOf(category) === -1;
        });
    }

    // The next viewer starts locked and has their own PIN.
    ProfileStore.onSwitch(function () {
        failures = 0;
        blockedUntil = 0;
        relock();
    });

    Prefs.onChange(function (name) {
        if (name === 'parentalRelockMs') schedule();
    });

    return {
        hasPin: hasPin,
        setPin: setPin,
        removePin: removePin,
        verify: verify,
        waitSeconds: waitSeconds,
        isUnlocked: isUnlocked,
        isLocked: isLocked,
        filterItems: filterItems,
        allows: function (sourceId, section, item) { return filterItems(sourceId, section, [item]).length === 1; },
        lock: function (sourceId, section, categoryId) { setCategory(sourceId, section, categoryId, true); },
        unlockCategory: function (sourceId, section, categoryId) { setCategory(sourceId, section, categoryId, false); },
        unlock: function (pin) {
            if (!verify(pin)) return false;
            openedAt = clock.now();
            schedule();
            changed();
            return true;
        },
        onChange: function (listener) { listeners.push(listener); },
    };
})(window.ParentalLockClock || {
    now: function () { return Date.now(); },
    setTimeout: function (callback, ms) { return setTimeout(callback, ms); },
    clearTimeout: function (timer) { clearTimeout(timer); },
});
