// What the current profile may see: hidden categories and the parental lock
// in one place, so a list is never shown with only one of the two applied.
//
// Visibility(current) -> { items, allows, categories }
//   current() -> the id of the source on screen
//   items(section, list, options) -> the list without items of hidden or
//       locked categories; options.withHidden: true keeps hidden ones
//   allows(section, item, options) -> whether one item may be shown;
//       options.sourceId is the item's own source (a library item from
//       another source), options.withHidden as above
//   categories(section, list) -> the category rows without hidden ones
window.Visibility = function (current) {
    'use strict';

    function sourceOf(options) {
        return (options && options.sourceId) || current();
    }

    function withHidden(options) {
        return !!(options && options.withHidden);
    }

    return {
        items: function (section, list, options) {
            var id = current();
            return ParentalLock.filterItems(id, section, withHidden(options) ? list : HiddenCategories.filterItems(id, section, list));
        },
        allows: function (section, item, options) {
            var id = sourceOf(options);
            return (withHidden(options) || HiddenCategories.allows(id, section, item)) && ParentalLock.allows(id, section, item);
        },
        categories: function (section, list) {
            return HiddenCategories.visible(current(), section, list);
        },
    };
};
