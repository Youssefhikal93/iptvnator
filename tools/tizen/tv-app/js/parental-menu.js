window.ParentalMenu = (function () {
    'use strict';

    function settings(done) {
        if (!ParentalLock.hasPin()) return PinPad.open('set', done);
        Menu.open('PIN', [
            { label: 'Change PIN\u2026', run: function () { PinPad.open('change', done); } },
            { label: 'Remove PIN', run: function () { PinPad.open('remove', done); } },
            { label: 'Cancel' },
        ]);
    }

    function category(sourceId, section, row) {
        if (!ParentalLock.hasPin()) {
            return { label: 'Set a PIN first', run: function () { PinPad.open('set'); } };
        }
        var locked = ParentalLock.isLocked(sourceId, section, row.category_id);
        return {
            label: locked ? 'Unlock category' : 'Lock category',
            run: function () {
                if (locked) {
                    PinPad.open('verify', function () { ParentalLock.unlockCategory(sourceId, section, row.category_id); });
                } else ParentalLock.lock(sourceId, section, row.category_id);
            },
        };
    }

    return { settings: settings, category: category };
})();
