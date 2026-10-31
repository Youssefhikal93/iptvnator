// "Guide channel" in a live channel's options (#90): when no guide pairs
// with a channel by itself, the viewer picks one of the guides' channels for
// it. Kept per source; Automatic goes back to pairing by id and name. A pick
// whose guide link is gone, or whose guide no longer lists it, is ignored
// (xmltv-store.js) and dropped when that link is removed or changed.
window.GuidePick = (function () {
    'use strict';

    var PREFIX = 'iptvnator-tv:guide-pick:';
    var SHOWN = 40;
    var ALL = 300;
    var TICK = '✓ ';

    function read(sourceId) {
        try {
            var saved = Stored.json(PREFIX + sourceId);
            return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
        } catch (e) { return {}; }
    }

    function write(sourceId, all) {
        try {
            if (Object.keys(all).length) Stored.save(PREFIX + sourceId, all);
            else Stored.remove(PREFIX + sourceId);
        } catch (e) { Log.error('Guide channel could not be saved'); }
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
        var all = Object.assign({}, read(sourceId));
        if (chosen) all[keyOf(channel)] = { n: chosen.n, id: chosen.id };
        else delete all[keyOf(channel)];
        write(sourceId, all);
        XmltvGuide.touch(sourceId);
    }

    // "Name (id)", or the id alone when the guide gave no name.
    function title(entry) {
        var id = entry.label || entry.id;
        return entry.name && entry.name !== id ? entry.name + ' (' + id + ')' : id;
    }

    // The guides' channels that share the most words with the channel's
    // name, by their names and ids, a matching number counting double; the
    // rest are left out.
    function rank(name, entries) {
        var wanted = XmltvParser.words(name);
        return entries.map(function (entry) {
            var words = XmltvParser.words(entry.name).concat(XmltvParser.words(entry.label || entry.id));
            var score = 0;
            wanted.forEach(function (word) {
                if (words.indexOf(word) >= 0) score += /^\d+$/.test(word) ? 2 : 1;
            });
            return { entry: entry, score: score };
        }).filter(function (scored) { return scored.score > 0; }).sort(function (a, b) {
            return b.score - a.score || (a.entry.id < b.entry.id ? -1 : a.entry.id > b.entry.id ? 1 : a.entry.n - b.entry.n);
        }).slice(0, SHOWN).map(function (scored) { return scored.entry; });
    }

    // Every guide channel by name, for when none is named alike.
    function alphabetical(entries) {
        return entries.slice().sort(function (a, b) {
            var x = title(a).toLowerCase();
            var y = title(b).toLowerCase();
            return x < y ? -1 : x > y ? 1 : a.n - b.n;
        });
    }

    function same(a, b) {
        return !!a && !!b && a.n === b.n && String(a.id).toLowerCase() === String(b.id).toLowerCase();
    }

    function rows(source, channel, entries, chosen, several) {
        return entries.map(function (entry) {
            return {
                label: (same(entry, chosen) ? TICK : '') + title(entry) + (several ? ' · ' + I18n.t('guide.linkN', { n: entry.n }) : ''),
                run: function () { set(source.id, channel, entry); },
            };
        });
    }

    function focusOf(list) {
        return Math.max(0, list.findIndex(function (row) { return String(row.label).indexOf(TICK) === 0; }));
    }

    function showAll(source, channel, all, chosen, several) {
        var list = rows(source, channel, alphabetical(all).slice(0, ALL), chosen, several);
        if (all.length > ALL) list.push({ label: I18n.t('guide.showingFirst', { shown: ALL, total: all.length }), note: true });
        Menu.open(I18n.t('guide.pickTitle', { name: channel.name }), list, focusOf(list));
    }

    function open(source, channel) {
        var links = GuideLinks.links(source);
        Promise.all(links.map(function (link) {
            return XmltvStore.channels(link).then(function (list) {
                return list.map(function (entry) { return Object.assign({ n: link.n }, entry); });
            }, function () { return []; });
        })).then(function (lists) {
            var all = [].concat.apply([], lists);
            var chosen = get(source.id, channel);
            var several = links.length > 1;
            var found = rank(channel.name, all);
            if (chosen && !found.some(function (entry) { return same(entry, chosen); })) {
                found.unshift(all.filter(function (entry) { return same(entry, chosen); })[0] || chosen);
            }
            var list = [{ label: (chosen ? '' : TICK) + I18n.t('guide.automatic'), run: function () { set(source.id, channel, null); } }];
            list = list.concat(rows(source, channel, found, chosen, several));
            if (!all.length) list.push({ label: I18n.t('guide.noGuideChannels'), note: true });
            else {
                if (!found.length) list.push({ label: I18n.t('guide.noSimilar'), note: true });
                list.push({ label: I18n.t('guide.showAll', { count: all.length }), run: function () { showAll(source, channel, all, chosen, several); } });
            }
            Menu.open(I18n.t('guide.pickTitle', { name: channel.name }), list, focusOf(list));
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
            if (chosen && !GuideLinks.url(source, chosen.n)) chosen = null;
            return [{
                label: I18n.t('guide.pick', { name: chosen ? chosen.id : I18n.t('guide.automatic') }),
                glyph: '☰',
                run: function () { open(source, channel); },
            }];
        },
        // A link removed or pointed at another guide (#90): its picks no longer apply.
        forgetLink: function (sourceId, n) {
            var all = read(sourceId);
            var kept = {};
            Object.keys(all).forEach(function (key) { if (all[key].n !== n) kept[key] = all[key]; });
            if (Object.keys(kept).length !== Object.keys(all).length) write(sourceId, kept);
        },
        // A source that moved to another id keeps its picks.
        move: function (fromId, toId) {
            var all = read(fromId);
            if (!Object.keys(all).length) return;
            write(toId, Object.assign({}, read(toId), all));
            Stored.remove(PREFIX + fromId);
        },
        // Backup (#90): every pick of a source, and putting them back.
        all: function (sourceId) { return Object.assign({}, read(sourceId)); },
        // Unlike a pick by hand, a failed write here reaches the caller.
        replaceAll: function (sourceId, picks) {
            var all = Object.assign({}, picks || {});
            if (Object.keys(all).length) Stored.save(PREFIX + sourceId, all);
            else Stored.remove(PREFIX + sourceId);
        },
        remove: function (sourceId) { Stored.remove(PREFIX + sourceId); },
    };
})();
