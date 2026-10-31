// "Guide channel" in a live channel's options (#90): when no guide pairs
// with a channel by itself, the viewer picks one of the guides' channels for
// it. Kept per source; Automatic goes back to pairing by id and name.
window.GuidePick = (function () {
    'use strict';

    var PREFIX = 'iptvnator-tv:guide-pick:';
    var SHOWN = 40;

    function read(sourceId) {
        try {
            var saved = JSON.parse(Stored.text(PREFIX + sourceId));
            return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
        } catch (e) { return {}; }
    }

    function keyOf(channel) {
        return channel.stream_id !== undefined ? 'id:' + channel.stream_id : 'url:' + channel.url;
    }

    // { n, id }: guide link n's channel id, or null for Automatic.
    function get(sourceId, channel) {
        var chosen = read(sourceId)[keyOf(channel)];
        return chosen && chosen.id && chosen.n ? chosen : null;
    }

    function set(sourceId, channel, chosen) {
        var all = read(sourceId);
        if (chosen) all[keyOf(channel)] = { n: chosen.n, id: chosen.id };
        else delete all[keyOf(channel)];
        try { Stored.save(PREFIX + sourceId, all); }
        catch (e) { Log.error('Guide channel could not be saved'); }
        XmltvGuide.touch(sourceId);
    }

    // The guides' channels that share the most words with the channel's
    // name, a matching number counting double; the rest are left out.
    function rank(name, entries) {
        var wanted = XmltvParser.words(name);
        return entries.map(function (entry) {
            var words = XmltvParser.words(entry.id);
            var score = 0;
            wanted.forEach(function (word) {
                if (words.indexOf(word) >= 0) score += /^\d+$/.test(word) ? 2 : 1;
            });
            return { entry: entry, score: score };
        }).filter(function (scored) { return scored.score > 0; }).sort(function (a, b) {
            return b.score - a.score || (a.entry.id < b.entry.id ? -1 : a.entry.id > b.entry.id ? 1 : a.entry.n - b.entry.n);
        }).slice(0, SHOWN).map(function (scored) { return scored.entry; });
    }

    function open(source, channel) {
        var links = GuideLinks.links(source);
        Promise.all(links.map(function (link) {
            return XmltvStore.channels(link).then(function (ids) {
                return ids.map(function (id) { return { n: link.n, id: id }; });
            }, function () { return []; });
        })).then(function (lists) {
            var all = [].concat.apply([], lists);
            var chosen = get(source.id, channel);
            var several = links.length > 1;
            var found = rank(channel.name, all);
            if (chosen && !found.some(function (entry) { return entry.n === chosen.n && entry.id === chosen.id; })) found.unshift(chosen);
            var rows = [{ label: (chosen ? '' : '✓ ') + I18n.t('guide.automatic'), run: function () { set(source.id, channel, null); } }];
            found.forEach(function (entry) {
                var on = !!chosen && entry.n === chosen.n && entry.id === chosen.id;
                rows.push({
                    label: (on ? '✓ ' : '') + entry.id + (several ? ' · ' + I18n.t('guide.linkN', { n: entry.n }) : ''),
                    run: function () { set(source.id, channel, entry); },
                });
            });
            if (!all.length) rows.push({ label: I18n.t('guide.noGuideChannels'), note: true });
            else if (!found.length) rows.push({ label: I18n.t('guide.noSimilar'), note: true });
            var focus = Math.max(0, rows.findIndex(function (row) { return row.label.indexOf('✓ ') === 0; }));
            Menu.open(I18n.t('guide.pickTitle', { name: channel.name }), rows, focus);
        });
    }

    return {
        get: get,
        set: set,
        rank: rank,
        open: open,
        // The row in a live channel's options; none when the source has no guide link.
        option: function (source, channel) {
            if (!source || !GuideLinks.any(source)) return [];
            var chosen = get(source.id, channel);
            return [{
                label: I18n.t('guide.pick', { name: chosen ? chosen.id : I18n.t('guide.automatic') }),
                glyph: '☰',
                run: function () { open(source, channel); },
            }];
        },
        remove: function (sourceId) { Stored.remove(PREFIX + sourceId); },
    };
})();
