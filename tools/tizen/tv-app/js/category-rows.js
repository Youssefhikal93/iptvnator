// The rows at the top of a section's category list: All movies / All series,
// Recently added, Favorites, Recently watched and Continue watching. Each
// library row describes itself, so the browser asks the row instead of
// repeating which row shows what and which can be sorted:
//
//   row.list() -> the items it shows
//   row.empty -> the title and hint for when it shows nothing
//   row.sort() -> the order it uses: 'newest', 'chosen' (the viewer's Sort
//       choice) or null (none)
//   row.fromCatalogue -> its items come out of the section's whole list, so
//       it shows again when that list is fetched
//
// deps: ready() -> whether a source is open
//       section() -> the open section
//       sortable() -> whether the section can be sorted (dated Xtream lists)
//       everySource() -> whether the library spans every source
//       chosenSort() -> the viewer's Sort choice for the section
//       favorites(), recent(), continued(), added() -> the items of each row
//       favoriteItems() -> favorites refreshed from the catalogue, in its order
window.CategoryRows = function (deps) {
    'use strict';

    // Fields are added to `fields` itself: its `empty` getter stays a getter.
    function row(id, name, kind, items, fields) {
        fields.category_id = id;
        fields.category_name = name;
        fields.virtual = kind;
        fields.count = items.length;
        return fields;
    }

    // Library rows, then All movies / All series and Recently added in front.
    function build(section) {
        if (!deps.ready()) return [];
        section = section || deps.section();
        var rows = [
            row('__fav', I18n.t('browser.favorites'), 'favorites', deps.favorites(section), {
                // The library of every source has no one catalogue to refresh from.
                list: function () { return !deps.everySource() && deps.sortable() ? deps.favoriteItems(section) : deps.favorites(section); },
                get empty() { return [I18n.t('empty.favorites.title'), I18n.t('empty.favorites.hint')]; },
                sort: function () { return deps.everySource() ? null : 'chosen'; },
                fromCatalogue: true,
            }),
            row('__recent', I18n.t('browser.recentlyWatched'), 'recent', deps.recent(section), {
                list: function () { return deps.recent(section); },
                get empty() { return [I18n.t('empty.recent.title'), I18n.t('empty.recent.hint')]; },
                sort: function () { return null; },
                fromCatalogue: false,
            }),
        ];
        if (section !== 'live') {
            rows.push(row('__continue', I18n.t('browser.continueWatching'), 'continue', deps.continued(section), {
                list: function () { return deps.continued(section); },
                get empty() { return [I18n.t('empty.continue.title'), I18n.t('empty.continue.hint')]; },
                sort: function () { return null; },
                fromCatalogue: false,
            }));
        }
        var added = deps.sortable() ? deps.added(section) : [];
        if (added.length) {
            rows.unshift(row('__added', I18n.t('browser.recentlyAdded'), 'added', added, {
                list: function () { return deps.added(section); },
                get empty() { return [I18n.t('empty.added.title'), I18n.t('empty.added.hint')]; },
                sort: function () { return 'newest'; },
                fromCatalogue: true,
            }));
        }
        // The whole section, without hidden categories (a category with no id
        // loads all of it).
        if (section === 'movies' || section === 'series') {
            rows.unshift({ category_id: '', category_name: I18n.t(section === 'movies' ? 'browser.allMovies' : 'browser.allSeries'), all: section });
        }
        return rows;
    }

    return {
        build: build,
        // The order of the list under `row` (a category, a library row or
        // nothing): null where there is none.
        sortMode: function (row) {
            if (!deps.sortable()) return null;
            if (!row || !row.virtual) return deps.chosenSort();
            var sort = row.sort();
            return sort === 'chosen' ? deps.chosenSort() : sort;
        },
        // Whether the viewer can choose the order of the list under `row`.
        canSort: function (row) {
            return !!deps.sortable() && (!row || !row.virtual || row.sort() === 'chosen');
        },
    };
};
