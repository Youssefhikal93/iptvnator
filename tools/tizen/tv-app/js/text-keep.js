// Typed text survives leaving a field. The TV keyboard can drop text it has
// not committed yet (before its Done) when the field loses focus, so ▲/▼ to
// the next field lost the name being typed. Each field remembers what was
// typed since it took the focus and gets it back after a blur that dropped it.
window.TextKeep = (function () {
    'use strict';

    var typed = typeof WeakMap === 'function' ? new WeakMap() : null;

    function isText(node) {
        return !!node && node.tagName === 'INPUT' && /^(text|password|search|url|number|)$/.test(node.type || '');
    }

    // Taking the focus starts from what the field holds, so text the app
    // itself changed while the field was away is never brought back.
    function remember(event) {
        if (typed && isText(event.target)) typed.set(event.target, event.target.value);
    }

    function put(input, value) {
        if (!input.isConnected || input.value === value) return;
        Log.info('TEXT kept ' + (input.id || 'field') + ' (' + value.length + ' chars)');
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // The keyboard may drop the text during the blur or just after it.
    function restore(event) {
        var input = event.target;
        if (!typed || !isText(input) || !typed.has(input)) return;
        var value = typed.get(input);
        setTimeout(function () { put(input, value); }, 0);
        setTimeout(function () { if (document.activeElement !== input) put(input, value); }, 150);
    }

    // Which keys reach the page while typing, without what was typed.
    function noteKey(event) {
        if (!isText(event.target)) return;
        var name = { 38: 'up', 40: 'down', 13: 'ok', 65376: 'done', 65385: 'cancel', 10009: 'return' }[event.keyCode];
        if (name) Log.info('TEXT key ' + name + (event.isComposing ? ' composing' : '') + ' on ' + (event.target.id || 'field'));
    }

    document.addEventListener('focusin', remember, true);
    document.addEventListener('input', remember, true);
    document.addEventListener('compositionend', remember, true);
    document.addEventListener('focusout', restore, true);
    document.addEventListener('keydown', noteKey, true);

    return { isText: isText };
})();
