// A source's guides (#90): up to three XMLTV links and, for Xtream, the
// provider's own guide, asked channel by channel in the order the viewer
// chose; the first with programmes for a channel wins. Link 1 keeps the
// source's id for its saved guide, so a guide saved before #90 stays; links
// 2 and 3 are saved under the source's id plus '#2' and '#3'.
window.GuideLinks = (function () {
    'use strict';

    var FIELDS = { 1: 'epgUrl', 2: 'epgUrl2', 3: 'epgUrl3' };
    var NUMBERS = [1, 2, 3];

    function url(source, n) {
        return String((source && source[FIELDS[n]]) || '').trim();
    }

    // The source as XmltvGuide and XmltvStore see one of its links.
    function link(source, n) {
        return { id: n === 1 ? source.id : source.id + '#' + n, owner: source.id, n: n, epgUrl: url(source, n), epgOffset: source.epgOffset };
    }

    function links(source) {
        return NUMBERS.filter(function (n) { return url(source, n); }).map(function (n) { return link(source, n); });
    }

    // Xtream has a provider guide; a caller that knows its adapter says so.
    function hasProvider(source, provider) {
        return provider === undefined ? !!source && source.type === 'xtream' : !!provider;
    }

    // '1', '2', '3' and 'provider' in the order they are asked. A source saved
    // before #90 has no order: the provider comes last unless "Prefer my
    // guide" was Off. A link added later goes before a provider that is last.
    function order(source, provider) {
        var keys = links(source).map(function (entry) { return String(entry.n); });
        var present = hasProvider(source, provider) ? keys.concat(['provider']) : keys;
        if (!Array.isArray(source.epgOrder)) {
            return hasProvider(source, provider) && source.epgPrefer === false ? ['provider'].concat(keys) : present;
        }
        var saved = source.epgOrder.filter(function (key, at, all) {
            return present.indexOf(key) >= 0 && all.indexOf(key) === at;
        });
        present.forEach(function (key) {
            if (saved.indexOf(key) >= 0) return;
            var last = saved.indexOf('provider');
            if (key !== 'provider' && last >= 0 && last === saved.length - 1) saved.splice(last, 0, key);
            else saved.push(key);
        });
        return saved;
    }

    // Moves one entry up (-1) or down (+1); returns the source to save.
    function move(source, key, step) {
        var list = order(source);
        var at = list.indexOf(key);
        var to = at + step;
        if (at < 0 || to < 0 || to >= list.length) return source;
        list.splice(at, 1);
        list.splice(to, 0, key);
        return Object.assign({}, source, { epgOrder: list, epgPrefer: list[0] !== 'provider' });
    }

    // The form's "Prefer my guide": Off puts the provider first, On last.
    function prefer(source, wanted) {
        var list = order(source).filter(function (key) { return key !== 'provider'; });
        if (hasProvider(source)) {
            if (wanted) list.push('provider');
            else list.unshift('provider');
        }
        return Object.assign({}, source, { epgOrder: list, epgPrefer: wanted });
    }

    // Each entry in asking order: visit(link) for a link, visit(null) for the provider.
    // provider, when given, says whether there is a provider guide to ask.
    function each(source, visit, provider) {
        var byNumber = {};
        links(source).forEach(function (entry) { byNumber[entry.n] = entry; });
        order(source, provider).forEach(function (key) { visit(key === 'provider' ? null : byNumber[key]); });
    }

    function host(address) {
        try { return new URL(address).hostname; }
        catch (e) { return address; }
    }

    // Which saved guide an id belongs to: 's1#2' -> 's1'.
    function owner(id) {
        return String(id).split('#')[0];
    }

    return {
        MAX: NUMBERS.length,
        FIELDS: FIELDS,
        url: url,
        link: link,
        links: links,
        any: function (source) { return links(source).length > 0; },
        order: order,
        move: move,
        prefer: prefer,
        each: each,
        host: host,
        owner: owner,
        // Every id a source's guides may be saved under, used or not.
        ids: function (id) { return NUMBERS.map(function (n) { return n === 1 ? id : id + '#' + n; }); },
    };
})();
