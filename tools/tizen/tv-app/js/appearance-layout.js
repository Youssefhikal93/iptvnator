// Virtual lists read the same counts as CSS so remote movement follows density.
// Reading a computed style makes the TV recalculate the page's styles, and
// Home and the lists asked several times per key press (#53), so each count
// is kept until something it depends on changes: the density, the classes on
// the body (the menu position) and on the element, or the window size.
window.AppearanceLayout = (function () {
    'use strict';

    var cache = {};

    function count(name, element) {
        var el = element || document.documentElement;
        var key = [name, el.id, el.className, document.documentElement.getAttribute('data-density'),
            document.body ? document.body.className : '', window.innerWidth, window.innerHeight].join('|');
        if (!(key in cache)) cache[key] = parseInt(window.getComputedStyle(el).getPropertyValue(name), 10);
        return cache[key];
    }

    return { count: count };
})();
