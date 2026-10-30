// The "Use my phone" panel of the add-source form (#85): a QR code, the short
// code and the link, until the phone's details arrive or the code lapses.
window.FormPhone = (function () {
    'use strict';

    var KEY = Keys;
    var $ = function (id) {
        return document.getElementById(id);
    };
    var opened = false;
    var kind = 'xtream';
    var received = null;

    function status(text) {
        $('phone-status').textContent = text;
    }

    function buttons() {
        return ['phone-new', 'phone-cancel'].filter(function (id) {
            return !$(id).classList.contains('hidden');
        });
    }

    // The code is no longer good: say so and offer a new one.
    function lapsed(text) {
        $('phone-qr').classList.add('hidden');
        $('phone-code').textContent = '';
        $('phone-url').textContent = '';
        status(text);
        $('phone-new').classList.remove('hidden');
        $('phone-new').focus();
    }

    function start() {
        $('phone-qr').classList.add('hidden');
        $('phone-new').classList.add('hidden');
        $('phone-code').textContent = '';
        $('phone-url').textContent = '';
        status(I18n.t('phone.waiting'));
        $('phone-cancel').focus();
        PhoneSource.open(kind, {
            code: function (info) {
                Qr.draw($('phone-qr'), info.url, 8);
                $('phone-qr').classList.remove('hidden');
                $('phone-code').textContent = I18n.t('phone.code', { code: info.code });
                $('phone-url').textContent = info.url;
            },
            received: function (source) {
                var done = received;
                close();
                if (done) done(source);
            },
            expired: function () {
                lapsed(I18n.t('phone.expired'));
            },
            failed: function () {
                lapsed(I18n.t('phone.unavailable'));
            },
        });
    }

    function open(type, onReceived) {
        kind = type;
        received = onReceived;
        opened = true;
        $('form-phone-panel').classList.remove('hidden');
        start();
    }

    function close() {
        if (!opened) return;
        opened = false;
        received = null;
        PhoneSource.close();
        $('form-phone-panel').classList.add('hidden');
    }

    // Returns true when the key was for the panel.
    function onKey(event) {
        if (!opened) return false;
        var code = event.keyCode;
        var list = buttons();
        var index = list.indexOf(document.activeElement && document.activeElement.id);
        if (code === KEY.LEFT || code === KEY.RIGHT) {
            if (list.length) $(list[Math.max(0, Math.min(list.length - 1, index + (code === KEY.LEFT ? -1 : 1)))]).focus();
        } else if (code === KEY.RETURN || code === KEY.ESCAPE) {
            close();
            // Back to the form's own buttons.
            $('form-phone').focus();
        } else {
            // OK is a native click on the focused button; the form's other keys do nothing here.
            return true;
        }
        event.preventDefault();
        return true;
    }

    $('phone-cancel').addEventListener('click', function () {
        close();
        $('form-phone').focus();
    });
    $('phone-new').addEventListener('click', start);

    return {
        open: open,
        close: close,
        onKey: onKey,
        isOpen: function () {
            return opened;
        },
    };
})();
