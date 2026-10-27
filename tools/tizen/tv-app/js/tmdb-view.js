// Shared remote-friendly cards for cast, catalogue matches and Discover.
window.TmdbView = (function () {
    'use strict';

    function el(tag, cls, text) {
        var node = document.createElement(tag);
        node.className = cls;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function cardsView(label, entries, focus) {
        var html = UI.html;
        return html`<section class="tm-row">
            <h2 class="">${label}</h2>
            <div class="tm-cards">${entries.map(function (entry, i) {
                return html`<div class=${'tm-card' + (i === focus ? ' focus' : '')}>${entry.image ? UI.img('', entry.image) : null}<span class="">${entry.name}</span></div>`;
            })}</div>
        </section>`;
    }

    // For screens not yet in Preact (Actor, Discover): the same row as a node.
    function cards(label, entries, focus) {
        var box = document.createElement('div');
        UI.render(cardsView(label, entries, focus), box);
        return box.firstChild;
    }

    function catalogueCard(entry) {
        return { name: entry.item.name, image: entry.item.stream_icon || entry.item.cover || '' };
    }

    function scroll(root) {
        var selected = root.querySelector('.focus');
        if (selected) selected.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }

    return { el: el, cards: cards, cardsView: cardsView, catalogueCard: catalogueCard, scroll: scroll };
})();
