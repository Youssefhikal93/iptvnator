// Orders belong to one viewer and source. Save the whole list before hiding.
window.ListOrder = (function () {
    'use strict';

    function read(sourceId) {
        try {
            var saved = Stored.json(ProfileStore.key('list-order:' + sourceId));
            return saved && typeof saved === 'object' && !Array.isArray(saved) ? Object.assign({}, saved) : {};
        } catch (e) {
            return {};
        }
    }

    function write(sourceId, saved) {
        Stored.save(ProfileStore.key('list-order:' + sourceId), saved);
    }

    function apply(sourceId, scope, list, key) {
        var saved = read(sourceId);
        var ids = saved[scope];
        if (!Array.isArray(ids)) return MoveMode.reset(list);
        var ordered = MoveMode.apply(list, ids, key);
        var fresh = ordered.map(function (item) { return String(key(item)); });
        // These rows can arrive after their provider list, even on a reload.
        var waiting = scope.indexOf('categories:') === 0 ? ids.filter(function (id) {
            return (id === '__added' || id === '__collections') && fresh.indexOf(id) < 0;
        }) : [];
        fresh = MoveMode.apply(fresh.concat(waiting), ids, function (id) { return id; });
        if (JSON.stringify(fresh) !== JSON.stringify(ids)) {
            saved[scope] = fresh;
            write(sourceId, saved);
        }
        return ordered;
    }

    function save(sourceId, scope, list, key) {
        var saved = read(sourceId);
        saved[scope] = list.map(function (item) { return String(key(item)); });
        write(sourceId, saved);
    }

    // Hidden items keep their slots while the visible items exchange places.
    function replace(all, visible, key) {
        var ids = visible.map(function (item) { return String(key(item)); });
        var at = 0;
        return all.map(function (item) { return ids.indexOf(String(key(item))) < 0 ? item : visible[at++]; });
    }

    return {
        apply: apply,
        save: save,
        replace: replace,
        prepend: function (sourceId, scope, id) {
            var saved = read(sourceId);
            if (!Array.isArray(saved[scope])) return;
            saved[scope] = [id].concat(saved[scope].filter(function (entry) { return entry !== id; }));
            write(sourceId, saved);
        },
        changed: function (sourceId, scope) { return Array.isArray(read(sourceId)[scope]); },
        reset: function (sourceId, scope) {
            var saved = read(sourceId);
            delete saved[scope];
            write(sourceId, saved);
        },
        categoryKey: function (row) { return String(row.category_id); },
    };
})();
