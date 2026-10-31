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

    // A source's guide links, their order and hand-picked guide channels (#90).
    function parseGuide(saved) {
        if (!object(saved)) return invalid();
        var links = saved.links === undefined ? [] : saved.links;
        if (!Array.isArray(links) || links.length > 3 || !links.every(function (url) { return url === '' || typeof url === 'string' && /^https?:\/\//i.test(url); })) return invalid();
        var offset = saved.offset === undefined ? 0 : Number(saved.offset);
        if (!isFinite(offset) || offset < -12 || offset > 12) return invalid();
        var order = saved.order === undefined ? null : saved.order;
        if (order !== null && (!Array.isArray(order) || !order.every(function (key) { return /^(1|2|3|provider)$/.test(key); }))) return invalid();
        var picks = saved.picks === undefined ? {} : saved.picks;
        if (!object(picks)) return invalid();
        var clean = {};
        Object.keys(picks).forEach(function (key) {
            var pick = picks[key];
            if (!object(pick) || [1, 2, 3].indexOf(pick.n) < 0 || typeof pick.id !== 'string' || !pick.id) return invalid();
            clean[key] = { n: pick.n, id: pick.id };
        });
        return { links: links.slice(), offset: offset, order: order && order.slice(), prefer: saved.prefer !== false, picks: clean };
    }

    function guideOf(sourceId) {
        var source = Sources.all().filter(function (saved) { return saved.id === sourceId; })[0];
        if (!source || !GuideLinks.any(source)) return undefined;
        return {
            links: [1, 2, 3].map(function (n) { return GuideLinks.url(source, n); }),
            offset: Number(source.epgOffset) || 0,
            order: Array.isArray(source.epgOrder) ? source.epgOrder.slice() : undefined,
            prefer: source.epgPrefer !== false,
            picks: window.GuidePick ? GuidePick.all(sourceId) : {},
        };
    }

    // The source fields a parsed guide sets.
    function guideFields(guide) {
        var fields = { epgUrl: guide.links[0] || '', epgUrl2: guide.links[1] || '', epgUrl3: guide.links[2] || '', epgOffset: guide.offset, epgPrefer: guide.prefer };
        if (guide.order) fields.epgOrder = guide.order;
        return fields;
    }

    // Keys such as 'sB|2' in a channel order name another source (All sources
    // Favorites); an import gives sources new ids.
    function remapOrder(order, sourceIds) {
        var result = {};
        Object.keys(order || {}).forEach(function (scope) {
            result[scope] = scope.indexOf('channels:') !== 0 ? order[scope] : order[scope].map(function (key) {
                var split = key.indexOf('|');
                return split > 0 && sourceIds[key.slice(0, split)] ? sourceIds[key.slice(0, split)] + key.slice(split) : key;
            });
        });
        return result;
    }
    function parse(state, item) {
        if (!state) return { order: {}, groups: [] };
        if (!object(state)) return invalid();
        return { order: state.order === undefined ? {} : parseOrder(state.order),
            groups: state.groups === undefined ? [] : parseGroups(state.groups, item),
            guide: state.guide === undefined ? null : parseGuide(state.guide) };
    }

    function build(sourceId, entry) {
        entry.tvState = Object.assign({}, entry.tvState, {
            order: BackupStore.read('list-order:' + sourceId, {}) || {},
            groups: BackupStore.read('channel-groups:' + sourceId, []) || [],
            guide: guideOf(sourceId),
        });
        return entry;
    }

    // Merge keeps existing choices; unrelated incoming groups/orders are added.
    function merge(saved, incoming) {
        if (!Array.isArray(saved)) return Object.assign({}, incoming, saved);
        return saved.concat(incoming.filter(function (group) { return !saved.some(function (own) { return own.id === group.id; }); }));
    }

    return { parse: parse, build: build, merge: merge, guideFields: guideFields, remapOrder: remapOrder };
})();
