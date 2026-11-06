// Presentation overrides never replace provider catalogue or library snapshots.
window.ChannelEdits = (function () {
    'use strict';

    var NAME_MAX = 120;

    function original(channel) { return channel.__providerChannel || channel; }

    // M3U identities must not put a stream address into another saved record.
    function keyOf(channel) {
        channel = original(channel);
        if (channel.stream_id !== undefined) return 'id:' + channel.stream_id;
        var text = String(channel.url || '');
        var hash = 2166136261;
        for (var i = 0; i < text.length; i++) {
            hash ^= text.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return 'm3u:' + (hash >>> 0).toString(16);
    }

    // Only artwork addresses, never login links or stream addresses, are accepted.
    function image(address) {
        if (typeof address !== 'string' || address.length > 4096) return '';
        try {
            var url = new URL(address);
            if (!/^https?:$/.test(url.protocol) || url.username || url.password ||
                /(?:user(?:name)?|pass(?:word)?|token|auth|key|session|pin)=|\/(?:live|movie|series|timeshift)\//i.test(address)) return '';
            return address;
        } catch (e) { return ''; }
    }

    function clean(saved) {
        if (!saved || typeof saved !== 'object' || Array.isArray(saved)) throw new Error('Invalid channel edits');
        var edits = Object.create(null);
        Object.keys(saved).forEach(function (key) {
            var edit = saved[key];
            if (!/^(id:[\w-]+|m3u:[a-f0-9]+)$/.test(key) || !edit || typeof edit !== 'object' || Array.isArray(edit)) throw new Error('Invalid channel edits');
            var entry = {};
            if (edit.name !== undefined) {
                if (typeof edit.name !== 'string' || !edit.name.trim() || edit.name.length > NAME_MAX) throw new Error('Invalid channel name');
                entry.name = edit.name.trim();
            }
            if (edit.logo !== undefined) {
                if (!image(edit.logo)) throw new Error('Invalid channel logo');
                entry.logo = edit.logo;
            }
            edits[key] = entry;
        });
        return edits;
    }

    function read(sourceId) {
        try { return Stored.json(ProfileStore.key('channel-edits:' + sourceId)) || {}; }
        catch (e) { return {}; }
    }

    function save(sourceId, channel, patch) {
        var edits = Object.assign({}, read(sourceId));
        var key = keyOf(channel);
        if (patch === null) delete edits[key];
        else edits[key] = Object.assign({}, edits[key], patch);
        Stored.save(ProfileStore.key('channel-edits:' + sourceId), clean(edits));
    }

    // A channel's view reads its edit live, so one view per channel serves
    // every later list (#90): Live TV made all of them again on each open.
    var views = Object.create(null);

    function view(sourceId, channel) {
        if (channel.__providerChannel) return channel;
        var made = views[sourceId] || (views[sourceId] = new WeakMap());
        var known = made.get(channel);
        if (known) return known;
        known = fresh(sourceId, channel);
        made.set(channel, known);
        return known;
    }

    function fresh(sourceId, channel) {
        var provider = channel;
        var shown = Object.assign({}, provider);
        var key = keyOf(provider);
        function edit() { return read(sourceId)[key] || {}; }
        Object.defineProperty(shown, '__providerChannel', { value: provider });
        Object.defineProperties(shown, {
            name: { enumerable: true, get: function () { return edit().name || provider.name; } },
            stream_icon: { enumerable: true, get: function () { return edit().logo || provider.stream_icon; } },
            logo: { enumerable: true, get: function () { return edit().logo || provider.logo; } },
        });
        return shown;
    }

    // Keep country, number and regional words; strip only copy/quality suffixes.
    function family(channel) {
        var name = String(original(channel).name || '');
        if (name.normalize) name = name.normalize('NFKC');
        var prefix = /^([^:|]{1,30})[:|]/.exec(name);
        return (prefix ? prefix[1].trim().toLowerCase() + ':' : '') + XmltvParser.normalName(name.replace(/\b(?:raw|4k|8k)\b/gi, ''));
    }

    function country(channel) {
        var prefix = /^([^:|]{1,30})[:|]/.exec(String(original(channel).name || ''));
        return prefix ? prefix[1].trim().toLowerCase() : '';
    }

    // A name's main words for finding logos: no country, quality or copy
    // words, "sport" and "sports" alike; the channel numbers apart.
    function main(name) {
        name = String(name || '');
        if (name.normalize) name = name.normalize('NFKC');
        var list = XmltvParser.words(name.replace(/\braw\b/gi, '')).map(function (word) { return word.length > 3 ? word.replace(/s$/, '') : word; });
        return {
            names: list.filter(function (word) { return !/^\d+$/.test(word); }),
            numbers: list.filter(function (word) { return /^\d+$/.test(word); }).join(' '),
        };
    }

    // "beIN 1" and "UK| beIN Sports 1 4K HEVC" are alike: the shorter name's
    // words are all in the longer one, and their numbers agree when both have one.
    function alike(a, b) {
        if (!a.names.length || !b.names.length) return false;
        if (a.numbers && b.numbers && a.numbers !== b.numbers) return false;
        var short = a.names.length <= b.names.length ? a : b;
        var long = short === a ? b : a;
        return short.names.every(function (word) { return long.names.indexOf(word) >= 0; });
    }

    var LOGOS_MAX = 20;

    // Other channels whose logo may fit: the same channel first, then the
    // same country, one row per logo. Always by the provider's name.
    function copies(channel, catalogue) {
        var wanted = family(channel);
        var words = main(original(channel).name);
        var land = country(channel);
        var found = [];
        catalogue.forEach(function (copy, index) {
            var logo = image(original(copy).stream_icon || original(copy).logo);
            if (!logo || keyOf(copy) === keyOf(channel)) return;
            var rank = wanted && family(copy) === wanted ? 0 : alike(words, main(original(copy).name)) ? (country(copy) === land ? 1 : 2) : -1;
            if (rank >= 0) found.push({ rank: rank, index: index, logo: logo, copy: original(copy) });
        });
        found.sort(function (a, b) { return a.rank - b.rank || a.index - b.index; });
        var seen = Object.create(null);
        return found.filter(function (item) {
            if (seen[item.logo]) return false;
            seen[item.logo] = true;
            return true;
        }).slice(0, LOGOS_MAX).map(function (item) { return item.copy; });
    }

    // Whether a guide channel's name fits this channel's logo.
    function matches(channel, name) {
        return alike(main(original(channel).name), main(name));
    }

    return { NAME_MAX: NAME_MAX, LOGOS_MAX: LOGOS_MAX, original: original, keyOf: keyOf, image: image, clean: clean, save: save,
        view: view, list: function (sourceId, channels) { return channels.map(function (channel) { return view(sourceId, channel); }); }, copies: copies, matches: matches };
})();
