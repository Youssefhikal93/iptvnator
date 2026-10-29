// How a collection (#58) looks: the row on a film's detail page, and the
// marks on the Collections list's tiles and on films the provider lacks.
window.CollectionView = (() => {
    'use strict';

    const { html } = UI;

    const tag = (cls, text) => html`<span class=${'cl-tag ' + cls}>${text}</span>`;

    // The part's poster with "This film", "Not available", watched and progress.
    const poster = (part) => {
        const p = part.item ? Progress.of(Progress.id('movies', part.item), part.item.sourceId) : null;
        return html`<div class="cl-poster">${UI.img('', part.poster)}
            ${part.current ? tag('this', I18n.t('collections.thisFilm')) : null}
            ${part.item ? null : tag('na', I18n.t('collections.notAvailable'))}
            ${p && p.status === 'watched' ? html`<span class="cl-tick">✓</span>` : null}
            ${p && p.status === 'continue' ? html`<span class="cl-bar"><span style=${'width: ' + Progress.bar(p.ratio)}></span></span>` : null}
        </div>`;
    };

    // A detail row (see detail-rows.js); open(item) opens a film the provider has.
    const row = (found, open) => ({
        kind: 'collection',
        label: found.label,
        aside: found.sub,
        cards: found.parts.map((part, i) => ({ key: i, cls: 'tm-card' + (part.item ? '' : ' missing'), poster: poster(part), name: part.title, sub: part.year })),
        open: (i) => {
            const part = found.parts[i];
            if (part.item && !part.current) open(part.item);
        },
    });

    // The Collections list's own items: a film the provider lacks is greyed.
    const decorate = (el, item) => {
        if (!item.missing) return;
        el.classList.add('missing');
        const mark = document.createElement('span');
        mark.className = 'cl-tag na';
        mark.textContent = I18n.t('collections.notAvailable');
        el.appendChild(mark);
    };

    return { row, decorate };
})();
