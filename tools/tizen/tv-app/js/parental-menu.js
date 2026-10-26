window.ParentalMenu = (function () {
    'use strict';

    function settings(done) {
        if (!ParentalLock.hasPin()) return PinPad.open('set', done);
        Menu.open(I18n.t('settings.pin'), [
            { label: I18n.t('pin.change'), run: function () { PinPad.open('change', done); } },
            { label: I18n.t('pin.remove'), run: function () { PinPad.open('remove', done); } },
            { label: I18n.t('common.cancel') },
        ]);
    }

    function category(sourceId, section, row) {
        if (!ParentalLock.hasPin()) {
            return { label: I18n.t('pin.setFirst'), run: function () { PinPad.open('set'); } };
        }
        var locked = ParentalLock.isLocked(sourceId, section, row.category_id);
        return {
            label: I18n.t(locked ? 'pin.unlockCategory' : 'pin.lockCategory'),
            run: function () {
                if (locked) {
                    PinPad.open('verify', function () { ParentalLock.unlockCategory(sourceId, section, row.category_id); });
                } else ParentalLock.lock(sourceId, section, row.category_id);
            },
        };
    }

    return { settings: settings, category: category };
})();
