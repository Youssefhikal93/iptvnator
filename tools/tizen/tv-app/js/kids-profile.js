// Kids profiles (#62): a profile that sees only the categories an adult
// ticked, per source. The profile entry carries { kids: true, guardian }, the
// profile whose PIN guards leaving it and changing its lists. The lists live
// under the kids profile's own key "kids-allowed:<sourceId>" =
// { live: [...], movies: [...], series: [...] }: an allow list, so categories
// a provider adds later stay hidden until they are ticked.
//
// Every other profile pays one boolean check: the lists are read once per
// source and kept in memory until the profile or its lists change.
window.KidsProfile = (function () {
    'use strict';

    var SECTIONS = ['live', 'movies', 'series'];
    var on = false;
    var cache = {};
    var catalogue = null;

    function refresh() {
        var profile = ProfileStore.active();
        on = !!(profile && profile.kids);
        cache = {};
    }

    function keyOf(profileId, sourceId) {
        return ProfileStore.keyOf(profileId, 'kids-allowed:' + sourceId);
    }

    // { live: [...], movies: [...], series: [...] } with string ids only.
    function read(profileId, sourceId) {
        var saved = null;
        try {
            saved = Stored.json(keyOf(profileId, sourceId));
        } catch (e) {
            // Nothing allowed.
        }
        var lists = {};
        SECTIONS.forEach(function (section) {
            var list = saved && Array.isArray(saved[section]) ? saved[section] : [];
            lists[section] = list.map(String);
        });
        return lists;
    }

    function save(profileId, sourceId, lists) {
        var clean = {};
        SECTIONS.forEach(function (section) {
            if (lists[section] && lists[section].length) clean[section] = lists[section].map(String);
        });
        if (Object.keys(clean).length) Stored.save(keyOf(profileId, sourceId), clean);
        else Stored.remove(keyOf(profileId, sourceId));
        refresh();
    }

    // The active kids profile's allowed ids of one section, as a lookup.
    function allowed(sourceId, section) {
        if (!cache[sourceId]) {
            var lists = read(ProfileStore.active().id, sourceId);
            cache[sourceId] = {};
            SECTIONS.forEach(function (name) {
                var set = {};
                lists[name].forEach(function (id) { set[id] = true; });
                cache[sourceId][name] = { set: set, count: lists[name].length };
            });
        }
        return cache[sourceId][section] || { set: {}, count: 0 };
    }

    function permits(sourceId, section, item) {
        var id = HiddenCategories.categoryOf(item);
        return id !== '' && !!allowed(sourceId, section).set[id];
    }

    function count(lists) {
        return SECTIONS.reduce(function (sum, section) { return sum + lists[section].length; }, 0);
    }

    // Sources the profile has anything ticked in.
    function sourcesOf(profileId) {
        var list = [];
        try {
            list = Sources.all();
        } catch (e) {
            // No saved sources.
        }
        return list.filter(function (source) { return count(read(profileId, source.id)) > 0; });
    }

    // The profile whose PIN guards a kids profile: its guardian, or any other
    // grown-up profile with a PIN when that one was deleted; null when there is none.
    function guardianOf(profile) {
        var list = ProfileStore.list();
        var named = profile && profile.guardian && list.filter(function (other) { return other.id === profile.guardian; })[0];
        if (named && !named.kids && ProfileStore.hasPin(named.id)) return named;
        return list.filter(function (other) { return !other.kids && other.id !== (profile && profile.id) && ProfileStore.hasPin(other.id); })[0] || null;
    }

    // Runs `run` after the guardian's PIN, or at once when nothing guards `profile`.
    function guard(profile, run) {
        var guardian = guardianOf(profile);
        if (!guardian) return run();
        PinPad.open('guardian', run, { profileId: guardian.id, name: guardian.name });
    }

    ProfileStore.onSwitch(refresh);
    refresh();

    return {
        on: function () { return on; },
        refresh: refresh,
        read: read,
        save: save,
        sourcesOf: sourcesOf,
        guardianOf: guardianOf,
        guard: guard,
        // Leaving the active kids profile for another one asks for the PIN.
        leave: function (targetId, run) {
            var profile = ProfileStore.active();
            if (!on || targetId === profile.id) return run();
            guard(profile, run);
        },
        // Whether the active kids profile may open a section of a source.
        any: function (sourceId, section) {
            return !on || allowed(sourceId, section).count > 0;
        },
        // The source a kids profile opens on: the current one if anything is
        // ticked there, else the first that has ticks, else none.
        source: function (current) {
            if (!on) return current;
            var id = ProfileStore.active().id;
            if (current && count(read(id, current.id)) > 0) return current;
            return sourcesOf(id)[0] || null;
        },
        filterItems: function (sourceId, section, list) {
            if (!on) return list;
            if (!allowed(sourceId, section).count) return [];
            return list.filter(function (item) { return permits(sourceId, section, item); });
        },
        allows: function (sourceId, section, item) {
            return !on || permits(sourceId, section, item);
        },
        // Category rows: real categories only when ticked; "All channels" and
        // the library rows stay, showing only allowed items.
        categories: function (sourceId, section, list) {
            if (!on) return list;
            var set = allowed(sourceId, section).set;
            return list.filter(function (row) { return !HiddenCategories.isReal(row) || !!set[String(row.category_id)]; });
        },
        // The browser lends the picker its catalogue (see kids-picker.js).
        setCatalogue: function (provider) { catalogue = provider; },
        catalogue: function () { return catalogue; },
        sections: SECTIONS,
    };
})();
