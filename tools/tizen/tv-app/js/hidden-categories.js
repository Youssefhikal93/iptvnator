// Categories the viewer chose not to see, kept per source and section in
// localStorage: { live: ['12', '40'], movies: [...] }. Only real categories can
// be hidden; Favorites, Recently added and "All channels" (empty id) never are.
window.HiddenCategories = (function () {
    'use strict';

    function read(sourceId) {
        try {
            var saved = Stored.json(ProfileStore.key('hidden-categories:' + sourceId));
            return saved && typeof saved === 'object' ? saved : {};
        } catch (e) {
            return {};
        }
    }

    function ids(sourceId, section) {
        var list = read(sourceId)[section];
        return Array.isArray(list) ? list.map(String) : [];
    }

    function save(sourceId, section, list) {
        var all = read(sourceId);
        if (list.length) all[section] = list;
        else delete all[section];
        try {
            Stored.save(ProfileStore.key('hidden-categories:' + sourceId), all);
        } catch (e) {
            // Kept for this session only.
        }
    }

    function isReal(category) {
        return !!category && !category.virtual && category.category_id !== undefined && category.category_id !== null && String(category.category_id) !== '';
    }

    // Where an item or saved snapshot belongs; M3U channels only have a group.
    function categoryOf(item) {
        var own = item && item.show ? item.show : item;
        if (!own) return '';
        if (own.category_id !== undefined && own.category_id !== null) return String(own.category_id);
        return own.group ? String(own.group) : '';
    }

    function isHidden(sourceId, section, categoryId) {
        return ids(sourceId, section).indexOf(String(categoryId)) !== -1;
    }

    function allows(hidden, item) {
        var id = categoryOf(item);
        return id === '' || hidden.indexOf(id) === -1;
    }

    return {
        ids: ids,
        isReal: isReal,
        isHidden: isHidden,
        count: function (sourceId, section) {
            return ids(sourceId, section).length;
        },
        hide: function (sourceId, section, categoryId) {
            var list = ids(sourceId, section);
            if (list.indexOf(String(categoryId)) === -1) save(sourceId, section, list.concat(String(categoryId)));
        },
        show: function (sourceId, section, categoryId) {
            save(sourceId, section, ids(sourceId, section).filter(function (id) {
                return id !== String(categoryId);
            }));
        },
        // Returns whether the category is now hidden.
        toggle: function (sourceId, section, categoryId) {
            var hide = !isHidden(sourceId, section, categoryId);
            if (hide) this.hide(sourceId, section, categoryId);
            else this.show(sourceId, section, categoryId);
            return hide;
        },
        showAll: function (sourceId, section) {
            save(sourceId, section, []);
        },
        // Hides every other real category of `categories` and shows `keepId`.
        hideAllExcept: function (sourceId, section, categories, keepId) {
            save(sourceId, section, categories.filter(function (category) {
                return isReal(category) && String(category.category_id) !== String(keepId);
            }).map(function (category) {
                return String(category.category_id);
            }));
        },
        // The categories left after hiding; the input is never changed.
        visible: function (sourceId, section, categories) {
            var hidden = ids(sourceId, section);
            if (!hidden.length) return categories;
            return categories.filter(function (category) {
                return !isReal(category) || hidden.indexOf(String(category.category_id)) === -1;
            });
        },
        // Items (or saved snapshots, or episodes of a show) outside hidden categories.
        filterItems: function (sourceId, section, list) {
            var hidden = ids(sourceId, section);
            if (!hidden.length) return list;
            return list.filter(function (item) {
                return allows(hidden, item);
            });
        },
        allows: function (sourceId, section, item) {
            return allows(ids(sourceId, section), item);
        },
    };
})();
