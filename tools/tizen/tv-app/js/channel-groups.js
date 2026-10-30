// Own live groups contain snapshots with their original category for Kids/locks.
window.ChannelGroups = (function () {
    'use strict';

    function read(sourceId) {
        try {
            var saved = Stored.json(ProfileStore.key('channel-groups:' + sourceId));
            return Array.isArray(saved) ? JSON.parse(JSON.stringify(saved)) : [];
        } catch (e) {
            return [];
        }
    }

    function write(sourceId, groups) {
        Stored.save(ProfileStore.key('channel-groups:' + sourceId), groups);
    }

    function update(sourceId, id, change) {
        var groups = read(sourceId);
        groups.forEach(function (group) { if (group.id === id) change(group); });
        write(sourceId, groups);
    }

    function items(sourceId, id, catalogue) {
        var group = read(sourceId).filter(function (entry) { return entry.id === id; })[0];
        if (!group) return [];
        if (!catalogue) return group.channels;
        var known = Object.create(null);
        catalogue.forEach(function (channel) { known[Library.keyOf('live', channel)] = channel; });
        return group.channels.map(function (channel) { return known[Library.keyOf('live', channel)]; }).filter(Boolean);
    }

    return {
        list: read,
        items: items,
        create: function (sourceId, name) {
            var groups = read(sourceId);
            var id = '__group_' + Date.now().toString(36);
            while (groups.some(function (group) { return group.id === id; })) id += '_';
            groups.push({ id: id, name: name.trim(), channels: [] });
            write(sourceId, groups);
            return id;
        },
        rename: function (sourceId, id, name) { update(sourceId, id, function (group) { group.name = name.trim(); }); },
        remove: function (sourceId, id) { write(sourceId, read(sourceId).filter(function (group) { return group.id !== id; })); },
        add: function (sourceId, id, item) {
            update(sourceId, id, function (group) {
                if (!group.channels.some(function (channel) { return Library.keyOf('live', channel) === Library.keyOf('live', item); })) group.channels.push(Library.snapshot(item));
            });
        },
        removeChannel: function (sourceId, id, item) {
            update(sourceId, id, function (group) {
                group.channels = group.channels.filter(function (channel) { return Library.keyOf('live', channel) !== Library.keyOf('live', item); });
            });
        },
        rows: function (sourceId, catalogue, allows) {
            return read(sourceId).map(function (group) {
                var channels = items(sourceId, group.id, catalogue).filter(allows);
                return { category_id: group.id, category_name: group.name, virtual: 'group', count: channels.length,
                    list: function () { return items(sourceId, group.id, catalogue); }, sort: function () { return null; }, fromCatalogue: true,
                    empty: [I18n.t('groups.empty'), I18n.t('groups.emptyHint')] };
            });
        },
    };
})();
