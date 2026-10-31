// Save identities only: streams are resolved from the current source catalogue.
window.MultiViewStore = (function () {
    'use strict';

    function key(sourceId) { return ProfileStore.key('multi-view:' + sourceId); }

    function read(sourceId) {
        try {
            var saved = Stored.json(key(sourceId));
            if (!saved || !Array.isArray(saved.channels) || saved.channels.length < 2) return null;
            if (!saved.channels.every(function (id) { return id === null || typeof id === 'string'; })) return null;
            var state = MultiViewState.layout({ tiles: saved.channels, focus: 0 }, saved.channels.length);
            if (Array.isArray(saved.categories) && saved.categories.length === saved.channels.length &&
                saved.categories.every(function (id) { return id === null || typeof id === 'string'; })) {
                state.categories = saved.categories.slice(0, state.tiles.length);
            }
            return state;
        } catch (e) {
            return null; // Missing, corrupt or inaccessible storage has no resume.
        }
    }

    function save(sourceId, state) {
        try {
            var categories = state.categories && state.categories.map(function (id) { return id === null ? null : String(id); });
            Stored.save(key(sourceId), { categories: categories, channels: state.tiles.map(function (channel) {
                return channel ? Library.keyOf('live', channel) : null;
            }) });
        } catch (e) {
            Log.error('MULTI-VIEW resume save failed');
        }
    }

    return { read: read, save: save };
})();
