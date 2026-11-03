window.ChannelEditMenu = function (hooks) {
    'use strict';

    function changed(source, channel, patch) {
        try {
            ChannelEdits.save(source.id, channel, patch);
        } catch (e) { return hooks.toast(I18n.t('channelEdit.saveFailed')); }
        hooks.changed();
    }

    function logos(source, channel) {
        var active = Menu.open(I18n.t('channelEdit.logo'), [{ label: I18n.t('channelEdit.loading'), note: true },
            { label: I18n.t('common.cancel'), glyph: '×' }], 1);
        hooks.catalogue(source).then(function (catalogue) {
            // Old favorites/recents lack guide IDs; match the current provider row.
            var provider = catalogue.filter(function (copy) { return ChannelEdits.keyOf(copy) === ChannelEdits.keyOf(channel); })[0] || channel;
            return Promise.all(GuideLinks.links(source).map(function (link) {
                return XmltvStore.icon(link, ChannelEdits.original(provider)).then(function (icon) {
                    return icon ? { label: I18n.t('channelEdit.guideLogo', { n: link.n }), logo: icon } : null;
                });
            })).then(function (icons) { return [catalogue, icons, provider]; });
        }).then(function (found) {
            if (!active()) return;
            var choices = found[1].filter(Boolean).concat(ChannelEdits.copies(found[2], found[0]).map(function (copy) {
                return { label: copy.name, logo: copy.stream_icon || copy.logo };
            }));
            var seen = Object.create(null);
            var rows = choices.filter(function (choice) {
                if (!ChannelEdits.image(choice.logo) || seen[choice.logo]) return false;
                seen[choice.logo] = true;
                return true;
            }).map(function (choice) {
                return { label: choice.label, icon: UI.img('channel-edit-logo', choice.logo), run: function () { changed(source, channel, { logo: choice.logo }); } };
            });
            if (!rows.length) rows.push({ label: I18n.t('channelEdit.noLogos'), note: true });
            rows.push({ label: I18n.t('common.cancel'), glyph: '×' });
            Menu.open(I18n.t('channelEdit.logo'), rows, rows[0].note ? 1 : 0);
        }).catch(function () {
            if (active()) Menu.open(I18n.t('channelEdit.logo'), [
                { label: I18n.t('channelEdit.loadFailed'), note: true }, { label: I18n.t('common.cancel'), glyph: '×' }], 1);
        });
    }

    return {
        open: function (source, channel) {
            Menu.open(I18n.t('channelEdit.title'), [
                { label: I18n.t('channelEdit.name'), glyph: '✎', run: function () {
                    ProfileDialog.open({ title: I18n.t('channelEdit.name'), value: channel.name, maxLength: ChannelEdits.NAME_MAX,
                        inputLabel: I18n.t('channelEdit.name'), validate: function (text) { return text ? '' : I18n.t('channelEdit.needName'); },
                        done: function (text) { if (text !== null) changed(source, channel, { name: text }); } });
                } },
                { label: I18n.t('channelEdit.logo'), glyph: '▧', run: function () { logos(source, channel); } },
                { label: I18n.t('channelEdit.reset'), glyph: '↶', run: function () { changed(source, channel, null); } },
                { label: I18n.t('common.cancel'), glyph: '×' },
            ]);
        },
    };
};
