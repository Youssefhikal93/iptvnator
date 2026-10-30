// A focusable list that renders only the rows around the focused index, so
// categories with thousands of channels stay fast on the TV.
window.List = function (el, options) {
    'use strict';

    var state = { items: [], index: 0, active: false, empty: '', grid: false, boxes: '', loading: false };
    Prefs.onChange(function (name) {
        if (name === 'density') render();
    });

    // Read from the list itself: channel lists set their own sizes in CSS.
    function gridSize() {
        return { cols: AppearanceLayout.count('--grid-cols', el), rows: AppearanceLayout.count('--grid-rows', el) };
    }

    // Channels show wide logo plates (#44) instead of square icons and posters.
    function plates() {
        return !!(options.plate && options.plate());
    }

    function plate(item, cls) {
        var src = options.icon && options.icon(item);
        return Kit.plateNode({ cls: cls, name: item.name, logo: src || '' });
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
        el.classList.toggle('channels', plates());
        // Wide picture and Info boxes (#66) are grids with their own counts in CSS.
        el.classList.toggle('boxes-wide', state.boxes === 'wide');
        el.classList.toggle('boxes-info', state.boxes === 'info');
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
        // A pill at the end of the header, such as Collections' Refresh (#67).
        var action = options.action && options.action();
        if (action) {
            var pill = document.createElement('span');
            pill.className = 'list-action' + (action.focused ? ' focused' : '');
            pill.textContent = action.label;
            header.appendChild(pill);
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
            if (lines[2]) {
                var action = document.createElement('button');
                action.className = 'view-btn' + (state.active ? ' focused' : '');
                action.textContent = lines[2].label;
                action.onclick = lines[2].run;
                empty.appendChild(action);
            }
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
            if (plates()) {
                row.className += ' channel';
                row.appendChild(plate(item, 'row-plate'));
            } else if (src) {
                row.appendChild(logo(src, item));
            } else if (options.icon && item.name) {
                row.appendChild(placeholder(item));
            }
            var label = document.createElement('span');
            label.className = 'label';
            label.textContent = options.label(item);
            row.appendChild(label);
            var rowSub = options.sub && options.sub(item);
            if (rowSub) {
                var rowSubEl = document.createElement('small');
                rowSubEl.className = 'sub';
                rowSubEl.textContent = rowSub;
                row.appendChild(rowSubEl);
            }
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
            tile.className = (state.grid ? 'card skeleton' : 'row skeleton') + (plates() ? ' channel' : '');
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

    function text(cls, value) {
        var node = document.createElement('div');
        node.className = cls;
        node.textContent = value;
        return node;
    }

    // "2021 · ★ 7.4 · 1 h 52 min" with the star part in the rating colour.
    function metaLine(facts) {
        var line = text('box-meta', '');
        [facts.year, facts.score, facts.length].forEach(function (part, i) {
            if (!part) return;
            if (line.childNodes.length) line.appendChild(document.createTextNode(' · '));
            if (i === 1) line.appendChild(Object.assign(document.createElement('span'), { className: 'box-star', textContent: '★ ' + part }));
            else line.appendChild(document.createTextNode(part));
        });
        return line;
    }

    // A Wide picture or Info box (#66, #69): the whole poster and, beside it,
    // the title on top, then the facts. Wide boxes stand on a blurred copy of
    // the poster, with the rating on the poster and year and length on lines
    // of their own; Info boxes add the plot.
    function box(item, card) {
        var wide = state.boxes === 'wide';
        card.className += ' box ' + state.boxes;
        var src = options.icon && options.icon(item);
        var facts = (options.facts && options.facts(item)) || { sub: options.sub && options.sub(item) };
        if (wide && src) {
            var blur = document.createElement('div');
            blur.className = 'box-blur';
            blur.style.backgroundImage = 'url("' + String(src).replace(/"/g, '%22') + '")';
            card.appendChild(blur);
        }
        var picture = document.createElement('div');
        picture.className = 'poster';
        picture.appendChild(src ? logo(src, item) : placeholder(item));
        if (wide && facts.score) picture.appendChild(text('box-rate', '★ ' + facts.score));
        if (options.decorate) options.decorate(picture, item);
        card.appendChild(picture);
        var caption = document.createElement('div');
        caption.className = 'box-text';
        caption.appendChild(text('card-title', options.label(item)));
        if (facts.sub) caption.appendChild(text('box-meta', facts.sub));
        else if (wide) {
            if (facts.year) caption.appendChild(text('box-meta', facts.year));
            if (facts.length) caption.appendChild(text('box-meta', facts.length));
        } else if (facts.year || facts.score || facts.length) caption.appendChild(metaLine(facts));
        var plot = !wide && options.plot && options.plot(item);
        if (plot) caption.appendChild(text('box-plot', plot));
        card.appendChild(caption);
    }

    // Poster cards follow CSS columns; only the visible rows exist in the DOM,
    // and the top of the row after them, dimmed, so the viewer sees the
    // list goes on (like Home's next row).
    function renderGrid(start, count, size) {
        var grid = document.createElement('div');
        grid.className = 'grid';
        var shown = start + size.cols * size.rows;
        for (var i = start; i < Math.min(count, shown + size.cols); i++) {
            var item = state.items[i];
            var card = document.createElement('div');
            card.className = (plates() ? 'card channel' : 'card') + (i >= shown ? ' peek' : '');
            if (i === state.index) card.className += state.active ? ' focused' : ' selected';
            if (state.boxes && !plates()) {
                box(item, card);
                grid.appendChild(card);
                continue;
            }
            var poster;
            if (plates()) {
                poster = plate(item, 'poster');
            } else {
                poster = document.createElement('div');
                poster.className = 'poster';
                var src = options.icon && options.icon(item);
                poster.appendChild(src ? logo(src, item) : placeholder(item));
            }
            if (options.decorate) options.decorate(poster, item);
            card.appendChild(poster);
            var title = document.createElement('div');
            title.className = 'card-title';
            title.textContent = options.label(item);
            card.appendChild(title);
            // A second line under the title, such as a collection's count.
            var sub = options.sub && options.sub(item);
            if (sub) {
                var subEl = document.createElement('div');
                subEl.className = 'card-sub';
                subEl.textContent = sub;
                card.appendChild(subEl);
            }
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
        // boxes: '' for posters, or 'wide' / 'info' (#66).
        setGrid: function (grid, boxes) {
            state.grid = grid;
            state.boxes = (grid && boxes) || '';
            render();
        },
        cols: function () {
            return state.grid ? AppearanceLayout.count('--grid-cols', el) : 1;
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
