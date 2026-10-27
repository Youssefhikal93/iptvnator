// Virtual lists read the same counts as CSS so remote movement follows density.
window.AppearanceLayout = (function () {
    'use strict';

    function count(name, element) {
        return parseInt(window.getComputedStyle(element || document.documentElement).getPropertyValue(name), 10);
    }

    function reveal(root) {
        var focused = root.querySelector('.focused, .focus');
        if (focused) focused.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }

    return { count: count, reveal: reveal };
})();
