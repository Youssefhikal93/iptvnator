// Stream quality (#94). Providers list each quality as its own entry
// ("beIN SPORTS 1 HD", "beIN SPORTS 1 4K", a film twice as HD and 4K). The
// copies of the item that is playing become the player's Quality choices;
// Auto plays the best copy this TV shows. A manual pick is kept per channel
// or title, per profile; Auto forgets it.
window.Quality = (function () {
    'use strict';

    var KEEP = 200;
    var RANK = { '4K': 4, FHD: 3, HD: 2, '': 1.5, SD: 1 };
    var TAGS = {
        '8k': '4K', '4k': '4K', uhd: '4K', '2160p': '4K',
        fhd: 'FHD', '1080p': 'FHD', '1080i': 'FHD',
        hd: 'HD', '720p': 'HD',
        sd: 'SD', '576p': 'SD', '480p': 'SD', low: 'SD',
    };
    // Codec words name the same copy, not another one.
    var CODEC = /^(?:hevc|h26[45]|x26[45]|\d{2}fps)$/;

    function words(name) {
        return String(name || '').toLowerCase().replace(/h\.26([45])/g, 'h26$1').split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    }

    // A live "beIN 4K" is the channel's name; "beIN SPORTS 1 4K" is the
    // quality after a channel number (as the guide matching reads it).
    function nameKeeps4k(list, live) {
        return live && !list.some(function (word) { return /^\d+$/.test(word); });
    }

    // Names are read again on every zap; remember them.
    var parsed = Object.create(null);
    var parsedCount = 0;

    function parse(name, live) {
        var id = (live ? 'l:' : 't:') + String(name || '');
        if (parsed[id]) return parsed[id];
        if (++parsedCount > 20000) { parsed = Object.create(null); parsedCount = 1; }
        return (parsed[id] = readName(name, live));
    }

    function readName(name, live) {
        var list = words(name);
        var keep4k = nameKeeps4k(list, live);
        var tag = '';
        var base = list.filter(function (word) {
            if (CODEC.test(word)) return false;
            var found = TAGS[word];
            if (!found || (keep4k && /^[48]k$/.test(word))) return true;
            if (!tag || RANK[found] > RANK[tag]) tag = found;
            return false;
        });
        return { tag: tag, base: base.join(' ') };
    }

    // The copies of `item` in `list` (itself included), best first, or null
    // when there is no choice: one copy per quality, at least two qualities.
    function copies(item, list, live) {
        if (live && window.ChannelEdits) item = ChannelEdits.original(item);
        var own = parse(item && item.name, live);
        if (!own.base || !list || !list.length) return null;
        var seen = Object.create(null);
        var found = [];
        [item].concat(list).forEach(function (entry) {
            if (!entry) return;
            var provider = live && window.ChannelEdits ? ChannelEdits.original(entry) : entry;
            var copy = parse(provider.name, live);
            if (copy.base !== own.base || seen[copy.tag]) return;
            seen[copy.tag] = true;
            found.push({ tag: copy.tag, item: entry });
        });
        if (found.length < 2) return null;
        return found.sort(function (a, b) { return RANK[b.tag] - RANK[a.tag]; });
    }

    // Whether this screen shows 4K; a browser preview is treated as one.
    function shows4k() {
        try {
            if (window.webapis && webapis.productinfo && webapis.productinfo.isUdPanelSupported) return !!webapis.productinfo.isUdPanelSupported();
        } catch (e) {
            // Older firmware: assume it can.
        }
        return true;
    }

    function best(list) {
        var uhd = shows4k();
        return list.filter(function (copy) { return uhd || copy.tag !== '4K'; })[0] || list[list.length - 1];
    }

    function storeKey() {
        return ProfileStore.key('quality-choice');
    }

    function read() {
        try {
            var saved = JSON.parse(Stored.text(storeKey()));
            if (saved && typeof saved === 'object' && !Array.isArray(saved)) return saved;
        } catch (e) {
            // Nothing saved yet.
        }
        return {};
    }

    function picked(key) {
        var value = key ? read()[key] : null;
        return typeof value === 'string' && value.length <= 12 ? value : null;
    }

    // `tag` null forgets the pick (Auto). Newest last, at most KEEP titles.
    function remember(key, tag) {
        if (!key) return;
        var saved = read();
        delete saved[key];
        if (tag !== null && tag !== undefined) saved[key] = String(tag);
        var keys = Object.keys(saved);
        keys.slice(0, Math.max(0, keys.length - KEEP)).forEach(function (old) { delete saved[old]; });
        Stored.save(storeKey(), saved);
    }

    // The copy a title opens with: the remembered pick when that copy is
    // still offered, otherwise the best one.
    function choose(key, list) {
        var tag = picked(key);
        var mine = tag === null ? null : list.filter(function (copy) { return copy.tag === tag; })[0];
        return { copy: mine || best(list), auto: !mine };
    }

    function label(tag) {
        return tag || I18n.t('player.quality.standard');
    }

    return { parse: parse, copies: copies, choose: choose, picked: picked, remember: remember, label: label, shows4k: shows4k };
})();
