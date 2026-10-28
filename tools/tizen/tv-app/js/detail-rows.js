// The rows under a detail page (#47): TMDB's cast and similar titles,
// then "More in <category>" from the library. A row is
// { label, cards, open(index) }; this keeps the focus across the rows.
window.DetailRows = () => {
    'use strict';

    let row = 0;
    let focus = 0;
    const reset = () => {
        row = 0;
        focus = 0;
    };

    return {
        view: (rows, focused) => UI.html`<div class="dt-rows">${rows.map((entry, i) =>
            UI.html`<${Kit.Row} key=${entry.label} kind=${entry.kind} label=${entry.label} tiles=${entry.cards} focus=${focused && i === row ? focus : -1} />`)}</div>`,
        // 'up' or 'down' when the focus leaves the rows.
        key: (rows, code) => {
            row = Math.min(row, rows.length - 1);
            focus = Math.min(focus, rows[row].cards.length - 1);
            if (Keys.isBack(code)) return reset(), 'up';
            if (code === Keys.ENTER) return rows[row].open(focus), undefined;
            if (code === Keys.UP || code === Keys.DOWN) {
                const line = Focus.step(row, rows.length, code, 'column');
                if (line.exit === 'up') return reset(), 'up';
                if (line.exit === 'down') return 'down';
                row = line.index;
                focus = 0;
                return undefined;
            }
            const moved = Focus.step(focus, rows[row].cards.length, code, 'row');
            if (moved.index !== undefined) focus = moved.index;
            return undefined;
        },
    };
};
