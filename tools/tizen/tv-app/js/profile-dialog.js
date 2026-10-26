// Name entry and confirmation for profiles. The text input follows Form's
// approach: a native input the TV keyboard fills; OK is handled by the button.
window.ProfileDialog = (function () {
    'use strict';

    var root = null;
    var input = null;
    var message = null;
    var options = null;

    function el(tag, text) {
        var node = document.createElement(tag);
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function close(result) {
        var done = options && options.done;
        if (root) root.remove();
        root = input = message = options = null;
        if (done) done(result);
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

    // opts: { title, text, value (a string asks for text), ok, validate(value), done(result|null) }
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
        (input || cancel).focus();
    }

    function onKey(event) {
        var code = event.keyCode;
        if (code === Keys.RETURN || code === Keys.ESCAPE || code === Keys.IME_CANCEL) {
            close(null);
            return event.preventDefault();
        }
        var fields = Array.prototype.slice.call(root.querySelectorAll('input, button'));
        var at = fields.indexOf(document.activeElement);
        var step = code === Keys.DOWN || code === Keys.IME_DONE ? 1 : code === Keys.UP ? -1 : 0;
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
