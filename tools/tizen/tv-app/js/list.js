// A focusable list that renders only the rows around the focused index, so
// categories with thousands of channels stay fast on the TV.
window.List = function (el, options) {
    'use strict';

    var state = { items: [], index: 0, active: false, empty: '' };

    function render() {
        var rows = options.rows;
        var count = state.items.length;
        var start = Math.max(0, Math.min(state.index - Math.floor(rows / 2), count - rows));
        el.innerHTML = '';

        var header = document.createElement('div');
        header.className = 'list-header';
        header.textContent = options.title();
        if (count) {
            var position = document.createElement('span');
            position.className = 'count';
            position.textContent = state.index + 1 + ' / ' + count;
            header.appendChild(position);
        }
        el.appendChild(header);

        if (!count) {
            var empty = document.createElement('div');
            empty.className = 'list-empty';
            empty.textContent = state.empty;
            el.appendChild(empty);
            return;
        }

        for (var i = start; i < Math.min(count, start + rows); i++) {
            var item = state.items[i];
            var row = document.createElement('div');
            row.className = 'row';
            if (i === state.index) row.className += state.active ? ' focused' : ' selected';
            var src = options.icon && options.icon(item);
            if (src) {
                var img = new Image();
                img.className = 'icon';
                img.onerror = function () {
                    this.remove();
                };
                img.src = src;
                row.appendChild(img);
            }
            var label = document.createElement('span');
            label.className = 'label';
            label.textContent = options.label(item);
            row.appendChild(label);
            var badge = options.badge && options.badge(item);
            if (badge !== undefined && badge !== null && badge !== '') {
                var badgeEl = document.createElement('span');
                badgeEl.className = 'badge';
                badgeEl.textContent = badge;
                row.appendChild(badgeEl);
            }
            el.appendChild(row);
        }
    }

    return {
        set: function (items, index, emptyText) {
            state.items = items || [];
            state.index = Math.max(0, Math.min(index || 0, state.items.length - 1));
            state.empty = emptyText || 'Nothing here';
            render();
        },
        // Returns whether the focus moved.
        move: function (delta) {
            if (!state.items.length) return false;
            var next = Math.max(0, Math.min(state.items.length - 1, state.index + delta));
            var moved = next !== state.index;
            state.index = next;
            render();
            return moved;
        },
        select: function (index) {
            state.index = index;
            render();
        },
        setActive: function (active) {
            state.active = active;
            render();
        },
        index: function () {
            return state.index;
        },
        item: function () {
            return state.items[state.index];
        },
        items: function () {
            return state.items;
        },
    };
};
