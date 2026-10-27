// Which list is on screen in a section: a category's items, a library row
// or search results. Every time the list changes, begin() or beginSearch()
// starts a new one, and whatever was still loading for the one before is no
// longer active.
//
// screen() -> what the browser shows now:
//   { section, base, category, loading }
//   base: whether the section's categories are loaded
//   category: the category under the cursor, if any
//   loading: { movies, series } flags for the lists Home waits for
window.CurrentList = function (screen) {
    'use strict';

    var token = 0;
    var searching = false;

    return {
        // A category's list, or a library row, starts; returns its token.
        begin: function () {
            searching = false;
            return ++token;
        },
        // Search results start; returns their token.
        beginSearch: function () {
            searching = true;
            return ++token;
        },
        // Whether `mine`, a token from begin, is still the list on screen.
        isActive: function (mine) {
            return mine === token;
        },
        showingSearch: function () {
            return searching;
        },
        // Whether a fetch of `what` ({ section, kind, id }) is for the list the
        // viewer is waiting for, so its loading and error show on screen.
        wants: function (what) {
            var now = screen();
            var section = what.section;
            var wholeSection = what.kind === 'items' && (what.id === undefined || what.id === '');
            if (now.section === 'home') return !!now.loading[section] && wholeSection;
            if (now.section !== section) return false;
            if (what.kind === 'categories') return !now.base;
            if (searching) return wholeSection;
            var category = now.category;
            if (!category) return false;
            // A library row waits for the whole list it is made from.
            if (category.virtual) return wholeSection && !!category.fromCatalogue;
            return what.kind === 'items' && String(what.id === undefined ? '' : what.id) === String(category.category_id);
        },
    };
};
