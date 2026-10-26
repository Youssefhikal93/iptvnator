// Shared remote-friendly cards for cast, catalogue matches and Discover.
window.TmdbView = (function () {
    'use strict';

    function el(tag, cls, text) {
        var node = document.createElement(tag);
        node.className = cls;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function cards(label, entries, focus) {
        var row = el('section', 'tm-row');
        row.appendChild(el('h2', '', label));
        var list = el('div', 'tm-cards');
        entries.forEach(function (entry, i) {
            var card = el('div', 'tm-card' + (i === focus ? ' focus' : ''));
            if (entry.image) {
                var image = el('img', '');
                image.src = entry.image;
                image.onerror = function () { image.style.visibility = 'hidden'; };
                card.appendChild(image);
            }
            card.appendChild(el('span', '', entry.name));
            list.appendChild(card);
        });
        row.appendChild(list);
        return row;
    }

    function catalogueCard(entry) {
        return { name: entry.item.name, image: entry.item.stream_icon || entry.item.cover || '' };
    }

    function scroll(root) {
        var selected = root.querySelector('.focus');
        if (selected) selected.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }

    return { el: el, cards: cards, catalogueCard: catalogueCard, scroll: scroll };
})();
