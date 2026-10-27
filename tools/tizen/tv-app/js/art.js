// Artwork that arrives smoothly (#42). An image marked with prepare() starts
// transparent over its placeholder box and fades in once loaded; an address
// that already loaded this session shows at once, so lists that rebuild on
// every key press do not flash. preload() warms addresses the viewer is
// about to see (the next page, the next row).
window.Art = (() => {
    'use strict';

    const LIMIT = 400;
    const seen = new Set();

    const remember = (src) => {
        if (!src) return;
        if (seen.size >= LIMIT) seen.delete(seen.values().next().value);
        seen.add(src);
    };

    // Load events do not bubble, but they can be caught on the way down.
    document.addEventListener('load', (event) => {
        const node = event.target;
        if (node.tagName !== 'IMG' || !node.classList.contains('art')) return;
        remember(node.getAttribute('src'));
        node.classList.add('art-in');
    }, true);

    const prepare = (node, src) => {
        node.classList.add('art');
        if (seen.has(src)) node.classList.add('art-in');
        return node;
    };

    const preload = (urls) => {
        urls.forEach((src) => {
            if (!src || seen.has(src)) return;
            const image = new Image();
            image.onload = () => remember(src);
            image.src = src;
        });
    };

    return { prepare, preload, seen: (src) => seen.has(src), remember };
})();
