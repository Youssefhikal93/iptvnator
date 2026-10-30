// Group naming reuses the native text dialog and TV keyboard.
window.GroupMenu = function (hooks) {
    'use strict';

    function name(title, value, done) {
        ProfileDialog.open({ title: title, value: value, inputLabel: I18n.t('groups.name'),
            validate: function (text) { return text ? '' : I18n.t('groups.needName'); },
            done: function (text) { if (text !== null) { done(text); hooks.changed(); } } });
    }

    function add(source, item) {
        var rows = ChannelGroups.list(source).map(function (group) {
            return { label: group.name, run: function () { ChannelGroups.add(source, group.id, item); hooks.changed(); } };
        });
        rows.push({ label: I18n.t('groups.new'), run: function () {
            name(I18n.t('groups.new'), '', function (text) {
                var id = ChannelGroups.create(source, text);
                ListOrder.addGroup(source, 'categories:live', id);
                ChannelGroups.add(source, id, item);
            });
        } });
        rows.push({ label: I18n.t('common.cancel') });
        Menu.open(I18n.t('groups.add'), rows);
    }

    return {
        channel: function (item, row) {
            var source = item.sourceId || hooks.sourceId();
            var rows = [{ label: I18n.t('groups.add'), run: function () {
                add(source, item);
            } }];
            if (row && row.virtual === 'group') rows.push({ label: I18n.t('groups.removeChannel'), run: function () {
                ChannelGroups.removeChannel(source, row.category_id, item);
                hooks.changed();
            } });
            return rows;
        },
        category: function (row) {
            var source = hooks.sourceId();
            return [
                { label: I18n.t('groups.rename'), run: function () {
                    name(I18n.t('groups.rename'), row.category_name, function (text) { ChannelGroups.rename(source, row.category_id, text); });
                } },
                { label: I18n.t('groups.delete'), run: function () {
                    ProfileDialog.open({ title: I18n.t('groups.delete'), text: row.category_name, ok: I18n.t('groups.delete'), done: function (confirmed) {
                        if (confirmed) {
                            ChannelGroups.remove(source, row.category_id);
                            ListOrder.reset(source, 'channels:' + row.category_id);
                            hooks.changed();
                        }
                    } });
                } },
            ];
        },
    };
};
