// Collections without TMDB (#58): films whose names share a start once the
// sequel mark is gone ("Toy Story 2", "The Godfather Part II", "Shrek: Forever
// After"). Only the provider's own titles are read, so nothing is requested.
// A name shared by more films than any real series of films is a word such
// as "Movie", not a collection, and is left out.
window.NameGroups = (function () {
    'use strict';

    var MAX = 12;
    var made = new WeakMap();
    var NUMBER = /\s+(?:\d{1,2}|[ivx]{1,4}|one|two|three|four|five)$/;
    var PART = /\s+(?:part|chapter|vol|volume|episode)\s+(?:\d{1,2}|[ivx]{1,4}|one|two|three|four|five)$/;
    var ROMAN = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10, one: 1, two: 2, three: 3, four: 4, five: 5 };

    function plain(title) {
        return Tmdb.clean(title).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    }

    // The name the films of one collection share, or '' for none.
    function base(title) {
        var name = plain(title).split(/\s*[:–—]\s*|\s+-\s+/)[0]
            .replace(/[^a-z0-9Ͱ-鿿]+/g, ' ').trim();
        name = name.replace(PART, '').replace(NUMBER, '').trim();
        return name.length >= 3 && !/^\d+$/.test(name) ? name : '';
    }

    // The film's place in the series: 1 for the first film, 2 for "2" or "II".
    function order(title) {
        var head = plain(title).split(/\s*[:–—]\s*|\s+-\s+/)[0].replace(/[^a-z0-9]+/g, ' ').trim();
        var mark = /(?:\s|^)(\d{1,2}|[ivx]{1,4}|one|two|three|four|five)$/.exec(head);
        if (!mark) return 1;
        return Number(mark[1]) || ROMAN[mark[1]] || 1;
    }

    // The collection's name as the provider writes it, cut to the shared words.
    function label(item, key) {
        var words = Tmdb.clean(item.name).split(/\s*[:–—]\s*|\s+-\s+/)[0].split(/\s+/);
        return words.slice(0, key.split(' ').length).join(' ');
    }

    function build(list) {
        var byKey = Object.create(null);
        list.forEach(function (item) {
            var key = base(item.name);
            if (!key) return;
            var films = byKey[key] || (byKey[key] = { titles: Object.create(null), items: [] });
            var title = plain(item.name);
            // The same film twice (HD and 4K) counts once.
            if (films.titles[title]) return;
            films.titles[title] = true;
            films.items.push(item);
        });
        var groups = [];
        var ofKey = Object.create(null);
        Object.keys(byKey).forEach(function (key) {
            var films = byKey[key].items;
            if (films.length < 2 || films.length > MAX) return;
            films.sort(function (a, b) {
                return (Number(Tmdb.year(a)) || 0) - (Number(Tmdb.year(b)) || 0) || order(a.name) - order(b.name) || String(a.name).localeCompare(String(b.name));
            });
            var first = films.filter(function (item) { return base(item.name) === plain(item.name).replace(/[^a-z0-9Ͱ-鿿]+/g, ' ').trim(); })[0] || films[0];
            var group = { key: key, name: label(first, key), items: films };
            groups.push(group);
            ofKey[key] = group;
        });
        groups.sort(function (a, b) { return a.name.localeCompare(b.name); });
        return { groups: groups, ofKey: ofKey };
    }

    function index(list) {
        if (!made.has(list)) made.set(list, build(list));
        return made.get(list);
    }

    return {
        base: base,
        order: order,
        // Every collection in the list, by name.
        groups: function (list) { return index(list || []).groups; },
        // The collection a film of that name belongs to in `list`, or null.
        of: function (item, list) {
            var key = base(item.name);
            return (key && index(list || []).ofKey[key]) || null;
        },
    };
})();
