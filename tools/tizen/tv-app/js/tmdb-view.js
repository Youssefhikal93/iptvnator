// Helpers shared by the TMDB screens (actor page, Detail rows).
window.TmdbView = (() => {
    'use strict';

    const el = (tag, cls, text) => {
        const node = document.createElement(tag);
        node.className = cls;
        if (text !== undefined) node.textContent = text;
        return node;
    };

    // A catalogue match as a Kit.Tile.
    const catalogueCard = (entry) => ({ name: entry.item.name, image: entry.item.stream_icon || entry.item.cover || '' });

    const scroll = (root) => {
        const selected = root.querySelector('.focus');
        if (selected) selected.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    };

    return { el, catalogueCard, scroll };
})();
