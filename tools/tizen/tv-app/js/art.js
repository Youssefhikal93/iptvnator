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

    // A TMDB picture at `width` (w342 posters, w1280 backdrops) when the
    // provider links a bigger one (#90): an original poster took the TV ~12 ms
    // to decode, a w342 one ~3 ms. Other addresses stay as they are.
    const TMDB = /^(https?:\/\/image\.tmdb\.org\/t\/p\/)(original|w(\d+)[a-z0-9_]*)(\/[^/]+)$/i;
    const fit = (url, width) => {
        const found = typeof url === 'string' && url.indexOf('image.tmdb.org') > 0 && TMDB.exec(url);
        if (!found || (found[3] && Number(found[3]) <= width)) return url;
        return found[1] + 'w' + width + found[4];
    };

    return { prepare, preload, seen: (src) => seen.has(src), remember, fit };
})();
