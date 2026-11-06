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

    // Backdrops (#103): a picture wider than BIG_WIDTH is shrunk once, away
    // from the key press, onto a BIG_WIDTH canvas. The TV took 1–3 s to draw a
    // provider's 3840×2160 backdrop on every move that showed it.
    // big(src) -> { state: 'wait' | 'small' | 'canvas', canvas }; 'small'
    // (also after an error) means draw src as it is. onBig(fn) hears each
    // picture that becomes ready. Pictures from other servers taint the
    // canvas, which is fine: it is drawn, never read back.
    const BIG_WIDTH = 1280;
    const BIG_KEEP = 12;
    const bigs = new Map();
    const bigWatch = [];

    const bigDone = (src, entry) => {
        if (bigs.get(src) === entry) bigWatch.forEach((fn) => fn(src));
    };

    const shrink = (src, entry, image) => {
        const w = BIG_WIDTH;
        const h = Math.round(image.naturalHeight * w / image.naturalWidth);
        const draw = (source) => {
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const g = canvas.getContext('2d');
            if (g) {
                g.drawImage(source, 0, 0, w, h);
                entry.state = 'canvas';
                entry.canvas = canvas;
            } else entry.state = 'small';
            if (source.close) source.close();
            bigDone(src, entry);
        };
        // Resized off the page's thread where the TV can; else drawn here, still
        // only once and not during a key press.
        const resized = window.createImageBitmap
            ? createImageBitmap(image, { resizeWidth: w, resizeHeight: h, resizeQuality: 'medium' })
            : Promise.reject(new Error('no createImageBitmap'));
        resized.then(draw, () => draw(image));
    };

    const big = (src) => {
        if (!src) return null;
        let entry = bigs.get(src);
        if (entry) {
            bigs.delete(src);
            bigs.set(src, entry);
            return entry;
        }
        entry = { state: 'wait', canvas: null };
        bigs.set(src, entry);
        if (bigs.size > BIG_KEEP) bigs.delete(bigs.keys().next().value);
        const image = new Image();
        image.onload = () => {
            if (image.naturalWidth > BIG_WIDTH * 1.25 && image.naturalHeight > 0) return shrink(src, entry, image);
            entry.state = 'small';
            remember(src);
            bigDone(src, entry);
        };
        image.onerror = () => {
            entry.state = 'small';
            bigDone(src, entry);
        };
        image.src = src;
        return entry;
    };

    return { prepare, preload, seen: (src) => seen.has(src), remember, fit, big, onBig: (fn) => bigWatch.push(fn) };
})();
