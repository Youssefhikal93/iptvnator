// Virtual lists read the same counts as CSS so remote movement follows density.
window.AppearanceLayout = (function () {
    'use strict';

    function count(name, element) {
        return parseInt(window.getComputedStyle(element || document.documentElement).getPropertyValue(name), 10);
    }


    return { count: count };
})();
