// The same actions serve categories, own groups and live Favorites.
window.OrderMenu = function (options) {
    'use strict';

    var list = options.list;
    function index() {
        return list.items().map(options.key).indexOf(options.key(options.row));
    }

    var rows = [
        { label: I18n.t('order.move'), run: function () {
            var at = index();
            if (at < 0) return;
            list.select(at);
            options.controller.lift(list, options.save, options.done);
        } },
        { label: I18n.t('order.top'), run: function () {
            var at = index();
            if (at > 0) options.save(MoveMode.top(list.items(), at));
            options.done();
        } },
    ];
    if (options.changed) rows.push({ label: I18n.t('order.reset'), run: function () { options.reset(); options.done(); } });
    return rows;
};
