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
    // itself changed while the field was away is never brought back. Taking
    // the focus or typing again also ends a restore still pending.
    function remember(event) {
        if (!typed || !isText(event.target)) return;
        typed.set(event.target, { value: event.target.value, blur: 0 });
    }

    // Only what the keyboard drops comes back: the tail of the typed text,
    // in a field still on screen, from the blur that is still the last one.
    function put(input, entry, blur) {
        var now = typed.get(input);
        var value = entry.value;
        if (now !== entry || entry.blur !== blur || !input.isConnected || !input.offsetParent) return;
        if (input.value === value || value.indexOf(input.value) !== 0) return;
        Log.info('TEXT kept ' + (input.id || 'field') + ' (' + value.length + ' chars)');
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // The keyboard may drop the text during the blur or just after it.
    function restore(event) {
        var input = event.target;
        var entry = typed && isText(input) && typed.get(input);
        if (!entry) return;
        var blur = entry.blur = entry.blur + 1;
        setTimeout(function () { put(input, entry, blur); }, 0);
        setTimeout(function () { if (document.activeElement !== input) put(input, entry, blur); }, 150);
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
