// Help (#89): the keys of the screen in view, shown in the shared side
// panel, and coloured keys drawn as coloured dots. Samsung's Smart Remote
// has no coloured buttons (they appear after 123), so every coloured-key
// action also has a button or a menu row, and Help says where the colours are.
//
// Each screen keeps its own list next to its key handling (TvGuide.help,
// Browser.help, Home.help, Settings.help, PlayerHelp.help): entries are
// [key, does], both i18n keys. Text may hold {red} {green} {yellow} {blue},
// drawn as a dot of that colour.
window.KeyHelp = (function () {
    'use strict';

    var COLOURS = /\{(red|green|yellow|blue)\}/;

    // 'Press {blue} to search' -> ['Press ', { dot: 'blue' }, ' to search'].
    function parts(text) {
        return String(text).split(COLOURS).map(function (part, index) {
            return index % 2 ? { dot: part } : part;
        }).filter(function (part) { return part !== ''; });
    }

    // The colours a text names, in order.
    function colours(text) {
        return parts(text).filter(function (part) { return typeof part !== 'string'; }).map(function (part) { return part.dot; });
    }

    // The text with each colour named in words, for labels and logs.
    function plain(text) {
        return parts(text).map(function (part) {
            return typeof part === 'string' ? part : I18n.t('help.colour.' + part.dot);
        }).join('').trim();
    }

    function dotNode(colour) {
        var dot = document.createElement('span');
        dot.className = 'key-dot key-dot-' + colour;
        dot.setAttribute('role', 'img');
        dot.setAttribute('aria-label', I18n.t('help.colour.' + colour));
        return dot;
    }

    // Fills a node with the text, colours as dots (screens not in Preact).
    function fill(node, text) {
        node.textContent = '';
        parts(text).forEach(function (part) {
            node.appendChild(typeof part === 'string' ? document.createTextNode(part) : dotNode(part.dot));
        });
        return node;
    }

    // The text as Preact children.
    function view(text) {
        return parts(text).map(function (part) {
            return typeof part === 'string' ? part
                : UI.html`<span class=${'key-dot key-dot-' + part.dot} role="img" aria-label=${I18n.t('help.colour.' + part.dot)}></span>`;
        });
    }

    // The panel's rows: one line per key, the 123 line, then Close.
    function options(entries) {
        var rows = entries.map(function (entry) {
            var key = I18n.t(entry[0]);
            var does = I18n.t(entry[1]);
            return {
                label: plain(key) + ': ' + plain(does),
                note: true,
                view: UI.html`<span class="kh-line"><span class="kh-key">${view(key)}</span><span class="kh-does">${view(does)}</span></span>`,
            };
        });
        rows.push({ label: I18n.t('help.colourKeys'), note: true, view: UI.html`<span class="kh-colours">${view('{red}{green}{yellow}{blue} ' + I18n.t('help.colourKeys'))}</span>` });
        rows.push({ label: I18n.t('player.hint.close') });
        return rows;
    }

    // Opens Help over any screen, the player too; onBack runs on Return.
    function open(entries, onBack) {
        var rows = options(entries);
        Menu.open(I18n.t('help.title'), rows, rows.length - 1, null, onBack);
        document.getElementById('menu').classList.add('key-help');
    }

    return { parts: parts, colours: colours, plain: plain, fill: fill, view: view, open: open };
})();
