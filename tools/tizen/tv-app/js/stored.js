// The one door to the TV's localStorage (#53). Home, the menu and a tab
// switch looked up the same small records (progress, the PIN, hidden
// categories, sources) hundreds of times per key press, fetching and parsing
// each one again every time. Here a record is fetched at most once per key
// press (one run of the page's code) and parsed again only when its saved
// text changed, so a write from outside the app is still seen on the next.
//
// json(key) -> the parsed record (null when there is none); the value is
//   shared, so change it only to save it straight back.
// text(key) -> the saved text, or null.
// save(key, value) / put(key, text) / remove(key) write; keys() lists all.
// Reads and writes throw as localStorage and JSON.parse do.
window.Stored = (function () {
    'use strict';

    var cache = {};
    var checked = {};
    var turning = false;

    // The next run of the page's code fetches each record again.
    function nextTurn() {
        if (turning) return;
        turning = true;
        Promise.resolve().then(function () {
            checked = {};
            turning = false;
        });
    }

    function entry(key) {
        var found = cache[key];
        if (found && checked[key]) return found;
        var raw = localStorage.getItem(key);
        if (!found || found.raw !== raw) found = cache[key] = { raw: raw };
        checked[key] = true;
        nextTurn();
        return found;
    }

    // Tests ask for a check that no caller changed a record without saving it.
    function drifted(key, found) {
        if (!window.__storedCheck || JSON.stringify(found.value) === (found.raw === null ? 'null' : found.raw)) return;
        (window.__storedDrift = window.__storedDrift || []).push(key);
    }

    function json(key) {
        var found = entry(key);
        if (!('value' in found)) found.value = JSON.parse(found.raw);
        else drifted(key, found);
        return found.value;
    }

    // A write is read back from storage, so a write the TV dropped shows.
    function forget(key) {
        delete cache[key];
        delete checked[key];
    }

    function put(key, text) {
        forget(key);
        localStorage.setItem(key, text);
    }

    function remove(key) {
        forget(key);
        localStorage.removeItem(key);
    }

    function keys() {
        var list = [];
        for (var i = 0; i < localStorage.length; i++) list.push(localStorage.key(i));
        return list;
    }

    return {
        json: json,
        text: function (key) { return entry(key).raw; },
        save: function (key, value) { put(key, JSON.stringify(value)); },
        put: put,
        remove: remove,
        keys: keys,
    };
})();
