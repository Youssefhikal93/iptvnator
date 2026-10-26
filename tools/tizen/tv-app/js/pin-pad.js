// This overlay owns all remote keys until it is dismissed.
window.PinPad = (function () {
    'use strict';

    var root = document.createElement('div');
    root.id = 'pin-pad';
    root.className = 'hidden';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'Parental lock');
    document.body.appendChild(root);
    var labels = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'Clear', '0', 'Back'];
    var state = null;
    var refreshTimer = null;

    function el(tag, cls, text) {
        var node = document.createElement(tag);
        node.className = cls;
        node.textContent = text;
        return node;
    }

    function title() {
        if (state.stage === 'new') return 'Enter a new PIN';
        if (state.stage === 'confirm') return 'Confirm the PIN';
        return state.mode === 'unlock' ? 'Enter the PIN' : 'Enter the current PIN';
    }

    function render() {
        if (!state) return;
        root.textContent = '';
        var card = el('div', 'pin-card', '');
        card.appendChild(el('h1', 'pin-title', title()));
        card.appendChild(el('div', 'pin-dots', new Array(state.digits.length + 1).join('\u25cf') + new Array(5 - state.digits.length).join('\u25cb')));
        var wait = ParentalLock.waitSeconds();
        card.appendChild(el('div', 'pin-message', wait ? 'Wait ' + wait + ' s' : state.message));
        var pad = el('div', 'pin-keys', '');
        labels.forEach(function (label, index) {
            pad.appendChild(el('div', 'pin-key' + (index === state.focus ? ' focused' : ''), label));
        });
        card.appendChild(pad);
        card.appendChild(el('p', 'pin-hint', 'Digits or arrows and OK \u00b7 Return: cancel'));
        root.appendChild(card);
    }

    function close() {
        state = null;
        clearInterval(refreshTimer);
        root.textContent = '';
        root.classList.add('hidden');
    }

    function finish() {
        var done = state.done;
        close();
        if (done) done();
    }

    function savePin() {
        if (state.digits !== state.first) {
            state.first = '';
            state.stage = 'new';
            state.message = 'PINs do not match. Start again';
        } else {
            try {
                ParentalLock.setPin(state.digits);
            } catch (e) {
                if (e.name !== 'QuotaExceededError' && e.name !== 'SecurityError') throw e;
                state.message = 'Could not save the PIN. Try again';
                return;
            }
            finish();
        }
    }

    function submit() {
        if (state.stage === 'new') {
            state.first = state.digits;
            state.stage = 'confirm';
        } else if (state.stage === 'confirm') savePin();
        else submitCurrent();
    }

    function removePin() {
        try {
            ParentalLock.removePin();
        } catch (e) {
            if (e.name !== 'QuotaExceededError' && e.name !== 'SecurityError') throw e;
            state.message = 'Could not remove the PIN. Try again';
            return;
        }
        finish();
    }

    function submitCurrent() {
        var accepted = state.mode === 'unlock' ? ParentalLock.unlock(state.digits) : ParentalLock.verify(state.digits);
        if (!accepted) state.message = 'Wrong PIN';
        else if (state.mode === 'change') state.stage = 'new';
        else if (state.mode === 'remove') removePin();
        else finish();
    }

    function digit(number) {
        if (ParentalLock.waitSeconds()) return;
        state.message = '';
        state.digits += number;
        if (state.digits.length === 4) {
            submit();
            if (state) state.digits = '';
        }
    }

    function onKey(code) {
        if (!state) return false;
        if (Keys.isBack(code)) close();
        else if (code >= 48 && code <= 57) digit(String(code - 48));
        else if (code >= 96 && code <= 105) digit(String(code - 96));
        else if (code === Keys.ENTER) selectKey();
        else moveFocus(code);
        render();
        return true;
    }

    function selectKey() {
        if (state.focus === 11) close();
        else if (state.focus === 9) state.digits = '';
        else digit(labels[state.focus]);
    }

    function moveFocus(code) {
        if (code === Keys.LEFT && state.focus % 3 > 0) state.focus--;
        else if (code === Keys.RIGHT && state.focus % 3 < 2) state.focus++;
        else if (code === Keys.UP && state.focus >= 3) state.focus -= 3;
        else if (code === Keys.DOWN && state.focus < 9) state.focus += 3;
    }

    return {
        open: function (mode, done) {
            state = { mode: mode, stage: mode === 'set' ? 'new' : 'current', digits: '', first: '', focus: 0, message: '', done: done };
            root.classList.remove('hidden');
            clearInterval(refreshTimer);
            refreshTimer = setInterval(render, 1000);
            render();
        },
        onKey: onKey,
        isOpen: function () { return !!state; },
    };
})();
