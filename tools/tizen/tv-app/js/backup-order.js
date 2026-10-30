// Optional per-source TV state; desktop backups ignore this extension.
window.BackupOrder = (function () {
    'use strict';

    function invalid() { throw new Error('Invalid backup: category order or channel groups.'); }
    function object(value) { return value && typeof value === 'object' && !Array.isArray(value); }

    function parseOrder(saved) {
        if (!object(saved)) return invalid();
        var result = {};
        Object.keys(saved).forEach(function (scope) {
            if (!/^(categories:(live|movies|series)|channels:(__fav|__group_[a-z0-9_]+))$/.test(scope)) return invalid();
            var ids = saved[scope];
            if (!Array.isArray(ids) || !ids.every(function (id) { return typeof id === 'string'; })) return invalid();
            result[scope] = ids.slice();
        });
        return result;
    }

    function parseGroups(saved, item) {
        if (!Array.isArray(saved)) return invalid();
        var seen = Object.create(null);
        return saved.map(function (group) {
            if (!object(group) || typeof group.id !== 'string' || !/^__group_[a-z0-9_]+$/.test(group.id) || seen[group.id]) return invalid();
            if (typeof group.name !== 'string' || !group.name.trim() || group.name.length > 20 || !Array.isArray(group.channels)) return invalid();
            seen[group.id] = true;
            return { id: group.id, name: group.name.trim(), channels: group.channels.map(function (channel) {
                var clean = item(channel);
                if (clean.series_id !== undefined || clean.episode) return invalid();
                return clean;
            }) };
        });
    }

    function parse(state, item) {
        if (!state) return { order: {}, groups: [] };
        if (!object(state)) return invalid();
        return { order: state.order === undefined ? {} : parseOrder(state.order),
            groups: state.groups === undefined ? [] : parseGroups(state.groups, item) };
    }

    function build(sourceId, entry) {
        entry.tvState = Object.assign({}, entry.tvState, {
            order: BackupStore.read('list-order:' + sourceId, {}) || {},
            groups: BackupStore.read('channel-groups:' + sourceId, []) || [],
        });
        return entry;
    }

    // Merge keeps existing choices; unrelated incoming groups/orders are added.
    function merge(saved, incoming) {
        if (!Array.isArray(saved)) return Object.assign({}, incoming, saved);
        return saved.concat(incoming.filter(function (group) { return !saved.some(function (own) { return own.id === group.id; }); }));
    }

    return { parse: parse, build: build, merge: merge };
})();
