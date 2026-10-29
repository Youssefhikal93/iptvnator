// Name entry and confirmation for profiles. The text input follows Form's
// approach: a native input the TV keyboard fills; OK is handled by the button.
// A Kids profile switch (#62) can sit under the name, lined up with it.
window.ProfileDialog = (function () {
    'use strict';

    var root = null;
    var input = null;
    var message = null;
    var options = null;
    var kids = null;

    function el(tag, text) {
        var node = document.createElement(tag);
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function close(result) {
        var done = options && options.done;
        var chosen = kids ? kids.getAttribute('aria-checked') === 'true' : undefined;
        if (root) root.remove();
        root = input = message = options = kids = null;
        if (done) done(result, chosen);
    }

    function submit() {
        if (!input) return close(true);
        var value = input.value.trim();
        var error = options.validate ? options.validate(value) : '';
        if (error) {
            message.textContent = error;
            return input.focus();
        }
        close(value);
    }

    function setKids(on) {
        kids.setAttribute('aria-checked', String(on));
        kids.classList.toggle('on', on);
        if (options.kidsChanged) {
            var label = options.kidsChanged(on);
            if (label) root.querySelector('#profile-dialog-ok').textContent = label;
        }
    }

    function kidsRow() {
        var row = el('div');
        row.id = 'profile-kids';
        row.className = 'pf-switch-row';
        row.tabIndex = 0;
        row.setAttribute('role', 'switch');
        var text = el('div');
        text.appendChild(el('b', I18n.t('kids.switch')));
        text.appendChild(el('small', I18n.t('kids.switchHint')));
        row.appendChild(text);
        row.appendChild(el('span')).className = 'pf-switch';
        row.addEventListener('click', function () { setKids(row.getAttribute('aria-checked') !== 'true'); });
        return row;
    }

    // opts: { title, text, value (a string asks for text), ok, validate(value),
    //   kids (a boolean shows the Kids profile switch), kidsChanged(on) -> the
    //   OK button's label, done(result|null, kids) }
    function open(opts) {
        close(null);
        options = opts;
        root = el('div');
        root.id = 'profile-dialog';
        root.className = 'pf-dialog';
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');
        root.setAttribute('aria-label', opts.title);
        root.appendChild(el('h1', opts.title));
        message = el('p', opts.text || '');
        message.id = 'profile-dialog-message';
        root.appendChild(message);
        if (typeof opts.value === 'string') {
            input = el('input');
            input.type = 'text';
            input.id = 'profile-name';
            input.maxLength = 20;
            input.autocomplete = 'off';
            input.setAttribute('aria-label', I18n.t('profile.name'));
            input.value = opts.value;
            root.appendChild(input);
        }
        if (typeof opts.kids === 'boolean') {
            kids = kidsRow();
            root.appendChild(kids);
        }
        var buttons = el('div');
        var ok = el('button', opts.ok || 'OK');
        ok.id = 'profile-dialog-ok';
        ok.addEventListener('click', submit);
        var cancel = el('button', I18n.t('common.cancel'));
        cancel.id = 'profile-dialog-cancel';
        cancel.addEventListener('click', function () { close(null); });
        buttons.appendChild(ok);
        buttons.appendChild(cancel);
        root.appendChild(buttons);
        document.body.appendChild(root);
        if (kids) setKids(opts.kids);
        (input || cancel).focus();
    }

    function onKey(event) {
        var code = event.keyCode;
        // The keyboard's own Cancel only closes the keyboard; the text stays.
        if (code === Keys.IME_CANCEL) return event.preventDefault();
        if (code === Keys.RETURN || code === Keys.ESCAPE) {
            close(null);
            return event.preventDefault();
        }
        if (code === Keys.ENTER && kids && document.activeElement === kids) {
            setKids(kids.getAttribute('aria-checked') !== 'true');
            return event.preventDefault();
        }
        // The keyboard's Done goes on to OK, past the Kids switch.
        if (code === Keys.IME_DONE) {
            root.querySelector('#profile-dialog-ok').focus();
            return event.preventDefault();
        }
        var fields = Array.prototype.slice.call(root.querySelectorAll('input, .pf-switch-row, button'));
        var at = fields.indexOf(document.activeElement);
        var step = code === Keys.DOWN ? 1 : code === Keys.UP ? -1 : 0;
        if (document.activeElement.tagName === 'BUTTON' && (code === Keys.LEFT || code === Keys.RIGHT)) step = code === Keys.LEFT ? -1 : 1;
        if (step) {
            fields[Math.max(0, Math.min(fields.length - 1, at + step))].focus();
            event.preventDefault();
        }
    }

    return {
        open: open,
        onKey: onKey,
        isOpen: function () { return !!root; },
    };
})();
