// A focusable list that renders only the rows around the focused index, so
// categories with thousands of channels stay fast on the TV.
window.List = function (el, options) {
    'use strict';

    var state = { items: [], index: 0, active: false, empty: '', grid: false, loading: false };
    Prefs.onChange(function (name) {
        if (name === 'density') render();
    });

    function gridSize() {
        return { cols: AppearanceLayout.count('--grid-cols'), rows: AppearanceLayout.count('--grid-rows') };
    }

    function visibleRows() {
        return Math.min(options.rows, AppearanceLayout.count('--visible-rows', el));
    }

    // Initials tile, like the desktop shows for channels without a logo.
    function placeholder(item) {
        var tile = document.createElement('span');
        tile.className = 'icon ph';
        tile.textContent = String(item.name).replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase();
        return tile;
    }

    // Own function so each failing logo swaps in its own item's initials,
    // even after the list has re-rendered and detached the image.
    function logo(src, item) {
        var img = new Image();
        img.className = 'icon';
        img.onerror = function () {
            if (img.parentNode) img.parentNode.replaceChild(placeholder(item), img);
        };
        Art.prepare(img, src).src = src;
        return img;
    }

    function render() {
        var grid = gridSize();
        var rows = state.grid ? grid.rows : visibleRows();
        var count = state.items.length;
        var start;
        if (state.grid) {
            var lastRow = Math.floor((count - 1) / grid.cols);
            var firstRow = Math.max(0, Math.min(Math.floor(state.index / grid.cols) - Math.floor(rows / 2), lastRow - rows + 1));
            start = firstRow * grid.cols;
        } else {
            start = Math.max(0, Math.min(state.index - Math.floor(rows / 2), count - rows));
        }
        el.innerHTML = '';

        var header = document.createElement('div');
        header.className = 'list-header';
        header.textContent = options.title();
        var subtitle = options.subtitle && options.subtitle();
        if (subtitle) {
            var caption = document.createElement('small');
            caption.className = 'list-subtitle';
            caption.textContent = subtitle;
            header.appendChild(caption);
        }
        if (count) {
            var position = document.createElement('span');
            position.className = 'count';
            position.textContent = state.index + 1 + ' / ' + count;
            header.appendChild(position);
        }
        el.appendChild(header);

        if (state.loading) return renderSkeleton(rows, grid);
        if (!count) {
            var empty = document.createElement('div');
            empty.className = 'list-empty';
            var lines = typeof state.empty === 'string' ? [state.empty, I18n.t('list.chooseAnother')] : state.empty;
            empty.textContent = lines[0];
            var hint = document.createElement('small');
            hint.textContent = lines[1];
            empty.appendChild(hint);
            el.appendChild(empty);
            return;
        }

        // The next page's artwork loads while this one is on screen.
        if (options.icon) {
            var shown = state.grid ? grid.cols * grid.rows : rows;
            Art.preload(state.items.slice(start + shown, start + 2 * shown).map(options.icon));
        }

        if (state.grid) return renderGrid(start, count, grid);

        for (var i = start; i < Math.min(count, start + rows); i++) {
            var item = state.items[i];
            var row = document.createElement('div');
            row.className = 'row';
            if (i === state.index) row.className += state.active ? ' focused' : ' selected';
            var src = options.icon && options.icon(item);
            if (src) {
                row.appendChild(logo(src, item));
            } else if (options.icon && item.name) {
                row.appendChild(placeholder(item));
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
            if (options.decorate) options.decorate(row, item);
            el.appendChild(row);
        }
    }

    function renderSkeleton(rows, grid) {
        var strip = document.createElement('div');
        strip.className = state.grid ? 'grid' : '';
        strip.setAttribute('aria-label', I18n.t('common.loading'));
        for (var i = 0; i < (state.grid ? grid.cols * grid.rows : rows); i++) {
            var tile = document.createElement('div');
            tile.className = state.grid ? 'card skeleton' : 'row skeleton';
            tile.setAttribute('aria-hidden', 'true');
            if (state.grid) {
                var poster = document.createElement('div');
                poster.className = 'poster';
                tile.appendChild(poster);
            }
            strip.appendChild(tile);
        }
        el.appendChild(strip);
    }

    // Poster cards follow CSS columns; only the visible rows exist in the DOM.
    function renderGrid(start, count, size) {
        var grid = document.createElement('div');
        grid.className = 'grid';
        for (var i = start; i < Math.min(count, start + size.cols * size.rows); i++) {
            var item = state.items[i];
            var card = document.createElement('div');
            card.className = 'card';
            if (i === state.index) card.className += state.active ? ' focused' : ' selected';
            var poster = document.createElement('div');
            poster.className = 'poster';
            var src = options.icon && options.icon(item);
            poster.appendChild(src ? logo(src, item) : placeholder(item));
            if (options.decorate) options.decorate(poster, item);
            card.appendChild(poster);
            var title = document.createElement('div');
            title.className = 'card-title';
            title.textContent = options.label(item);
            card.appendChild(title);
            grid.appendChild(card);
        }
        el.appendChild(grid);
    }

    return {
        set: function (items, index, emptyText) {
            state.loading = false;
            state.items = items || [];
            state.index = Math.max(0, Math.min(index || 0, state.items.length - 1));
            state.empty = emptyText || I18n.t('list.nothingHere');
            render();
        },
        loading: function () {
            state.loading = true;
            state.items = [];
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
        setGrid: function (grid) {
            state.grid = grid;
            render();
        },
        cols: function () {
            return state.grid ? AppearanceLayout.count('--grid-cols') : 1;
        },
        pageSize: function () {
            var grid = gridSize();
            return state.grid ? grid.cols * grid.rows : visibleRows();
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
