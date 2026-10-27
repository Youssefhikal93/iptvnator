'use strict';

// UI (tv-app/js/ui.js) for sandboxes without a DOM: the real htm and Preact
// build the views, and render() turns them into the plain nodes the tests
// read ({ tag, className, textContent, children }).
var preact = require('preact');
var htm = require('htm');

function toNodes(view) {
    if (view === null || view === undefined || view === false || view === true) return [];
    if (Array.isArray(view)) return view.reduce(function (all, child) { return all.concat(toNodes(child)); }, []);
    if (typeof view !== 'object') return [{ textContent: String(view), children: [] }];
    if (typeof view.type === 'function') return toNodes(view.type(view.props));
    var children = toNodes(view.props.children);
    if (view.type === preact.Fragment) return children;
    return [{
        tag: view.type,
        className: view.props.class,
        children: children,
        textContent: children.map(function (child) { return child.textContent; }).join(''),
    }];
}

module.exports = {
    toNodes: toNodes,
    UI: {
        html: htm.bind(preact.h),
        img: function (cls, src) { return preact.h('img', { class: cls, src: src }); },
        render: function (view, root) {
            root.children = toNodes(view);
            root.firstChild = root.children[0];
        },
        clear: function (root) {
            root.children = [];
            root.firstChild = undefined;
        },
    },
};
