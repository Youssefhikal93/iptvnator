// Shared ordering and the remote's lift / move / place transaction.
window.MoveMode = (function () {
    'use strict';

    function apply(list, saved, key) {
        var remaining = Object.create(null);
        list.forEach(function (item) { remaining[String(key(item))] = item; });
        var result = [];
        (saved || []).forEach(function (id) {
            if (!Object.prototype.hasOwnProperty.call(remaining, String(id))) return;
            result.push(remaining[String(id)]);
            delete remaining[String(id)];
        });
        return result.concat(list.filter(function (item) { return Object.prototype.hasOwnProperty.call(remaining, String(key(item))); }));
    }

    // Empty lists and either edge leave the input untouched.
    function move(list, index, delta) {
        var result = list.slice();
        if (index < 0 || index >= list.length) return result;
        var target = Math.max(0, Math.min(list.length - 1, index + delta));
        result.splice(target, 0, result.splice(index, 1)[0]);
        return result;
    }

    function controller(hint) {
        var active = null;

        function end(place) {
            var transaction = active;
            active = null;
            transaction.list.lift(null);
            if (place && transaction.before.some(function (item, i) { return item !== transaction.list.items()[i]; })) transaction.save(transaction.list.items());
            if (!place) transaction.list.set(transaction.before, transaction.index);
            hint('');
            if (transaction.done) transaction.done();
        }

        return {
            lift: function (list, save, done) {
                if (active) end(false);
                active = { list: list, before: list.items().slice(), index: list.index(), save: save, done: done };
                list.lift(list.item());
                hint(I18n.t('order.hint'));
            },
            onKey: function (code) {
                if (!active) return false;
                var list = active.list;
                if (Keys.isBack(code)) end(false);
                else if (code === Keys.ENTER) end(true);
                else if (code === Keys.UP || code === Keys.DOWN) {
                    var at = list.index();
                    var next = Math.max(0, Math.min(list.items().length - 1, at + (code === Keys.UP ? -1 : 1)));
                    list.set(move(list.items(), at, next - at), next);
                }
                return true;
            },
            active: function () { return !!active; },
        };
    }

    return {
        apply: apply,
        move: move,
        top: function (list, index) { return move(list, index, -index); },
        reset: function (provider) { return provider.slice(); },
        controller: controller,
    };
})();
