// Catalogue ordering stays independent of the screen and never changes its input.
window.Sort = (function () {
    'use strict';

    var OPTIONS = [
        { id: 'newest', get label() { return I18n.t('sort.newest'); } },
        { id: 'oldest', get label() { return I18n.t('sort.oldest'); } },
        { id: 'name-asc', get label() { return I18n.t('sort.nameAsc'); } },
        { id: 'name-desc', get label() { return I18n.t('sort.nameDesc'); } },
        { id: 'rating', get label() { return I18n.t('sort.rating'); } },
        { id: 'provider', get label() { return I18n.t('sort.provider'); } },
    ];

    function number(value) {
        if (typeof value !== 'number' && typeof value !== 'string') return null;
        if (String(value).trim() === '') return null;
        var parsed = Number(value);
        return isFinite(parsed) && parsed >= 0 ? parsed : null;
    }

    function date(item, section) {
        var value = number(item[section === 'series' ? 'last_modified' : 'added']);
        return value > 0 ? value : null;
    }

    function rating(item) {
        var value = number(item.rating_5based);
        return value === null ? number(item.rating) : value;
    }

    function numeric(a, b, direction) {
        // Missing values stay last in both directions.
        if (a === null) return b === null ? 0 : 1;
        if (b === null) return -1;
        return (a - b) * direction;
    }

    function compare(a, b, section, mode) {
        if (mode === 'newest' || mode === 'oldest') return numeric(date(a, section), date(b, section), mode === 'newest' ? -1 : 1);
        if (mode === 'rating') return numeric(rating(a), rating(b), -1);
        if (mode === 'name-asc' || mode === 'name-desc') {
            return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }) * (mode === 'name-asc' ? 1 : -1);
        }
        return 0;
    }

    function order(list, section, mode) {
        return list.map(function (item, index) {
            return { item: item, index: index };
        }).sort(function (a, b) {
            return compare(a.item, b.item, section, mode) || a.index - b.index;
        }).map(function (entry) {
            return entry.item;
        });
    }

    return {
        options: OPTIONS,
        order: order,
        recentlyAdded: function (list, section, limit) {
            return order(list.filter(function (item) {
                return date(item, section) !== null;
            }), section, 'newest').slice(0, limit);
        },
    };
})();
