// Preact + htm for screens (docs/adr/0009). A screen keeps its state and
// remote keys in its own module and calls UI.render(view, root) after each
// change; Preact then updates only the nodes that changed, so images and
// focus rings are not rebuilt on every key press.
window.UI = (function () {
    'use strict';

    var html = htm.bind(preact.h);

    // Falls back once, then hides itself (a dead poster leaves no broken icon).
    function Img(props) {
        function failed(event) {
            var node = event.currentTarget;
            if (props.fallback && node.getAttribute('src') !== props.fallback) return void (node.src = props.fallback);
            node.style.visibility = 'hidden';
        }
        return html`<img class=${props.cls} src=${props.src || undefined} onError=${failed} style=${props.src ? undefined : 'visibility: hidden'} />`;
    }

    // Keyed by address: a new address gets a fresh element, so a fallback or
    // a hidden state from the old one does not carry over.
    function img(cls, src, fallback) {
        return html`<${Img} key=${src || ''} cls=${cls} src=${src} fallback=${fallback} />`;
    }

    return {
        html: html,
        img: img,
        render: function (view, root) {
            preact.render(view, root);
        },
        clear: function (root) {
            preact.render(null, root);
        },
        // For screens not yet in Preact: the view as a detached node.
        node: function (view) {
            var box = document.createElement('div');
            preact.render(view, box);
            return box.firstChild;
        },
    };
})();
