// "Manage categories": a full-screen list of one section's categories with a
// Shown / Hidden choice for each, a search box and "Show all". It also builds
// the options for holding OK on a category (Hide category, Hide all except this).
//
// hooks: sourceId() -> id of the current source
//        load(section) -> Promise of the section's categories, hidden ones too
//        changed(section) after hiding or showing, so the browser can redraw
//        toast(text)
window.ManageCategories = function (hooks) {
    'use strict';

    var KEY = Keys;
    var LABELS = { live: 'Live TV', movies: 'Movies', series: 'Series' };
    var root = document.getElementById('manage');
    var s = { open: false, section: '', all: [], zone: 'list', tool: 0, typing: false, changed: false };

    function el(tag, cls, text) {
        var node = document.createElement(tag);
        if (cls) node.className = cls;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    var title = el('h1', 'mc-title');
    var bar = el('div', 'mc-bar');
    var box = el('div', 'mc-search');
    var input = el('input');
    input.autocomplete = 'off';
    input.placeholder = 'Search categories…';
    box.appendChild(input);
    var all = el('span', 'mc-btn', 'Show all');
    bar.appendChild(box);
    bar.appendChild(all);
    var pane = el('div', 'pane main mc-list');
    root.appendChild(title);
    root.appendChild(bar);
    root.appendChild(pane);
    root.appendChild(el('div', 'mc-hint', 'OK: show or hide · ▲ at the top: search and Show all · Return: done'));

    var list = List(pane, {
        rows: 8,
        title: function () {
            var hidden = HiddenCategories.count(hooks.sourceId(), s.section);
            return 'Categories' + (hidden ? ' · ' + hidden + ' hidden' : '');
        },
        label: function (category) {
            return category.category_name;
        },
        badge: function (category) {
            return HiddenCategories.isHidden(hooks.sourceId(), s.section, category.category_id) ? 'Hidden' : 'Shown';
        },
        decorate: function (row, category) {
            if (HiddenCategories.isHidden(hooks.sourceId(), s.section, category.category_id)) row.classList.add('mc-off');
        },
    });

    function matching() {
        var needle = input.value.trim().toLowerCase();
        if (!needle) return s.all;
        return s.all.filter(function (category) {
            return String(category.category_name).toLowerCase().indexOf(needle) !== -1;
        });
    }

    function paint() {
        box.classList.toggle('focused', s.zone === 'bar' && s.tool === 0);
        box.classList.toggle('typing', s.typing);
        all.classList.toggle('focused', s.zone === 'bar' && s.tool === 1);
        list.setActive(s.zone === 'list');
    }

    function refresh(index) {
        var searching = !!input.value.trim();
        list.set(matching(), index || 0, searching ? ['No matching categories', 'Try a shorter search.'] : ['No categories', 'This source has none in this section.']);
        paint();
    }

    function startTyping() {
        s.typing = true;
        input.focus();
        paint();
    }

    function stopTyping() {
        s.typing = false;
        input.blur();
    }

    function close() {
        stopTyping();
        s.open = false;
        root.classList.add('hidden');
        if (s.changed) hooks.changed(s.section);
    }

    function show(section, categories) {
        s = { open: true, section: section, all: categories.filter(HiddenCategories.isReal), zone: 'list', tool: 0, typing: false, changed: false };
        input.value = '';
        title.textContent = 'Manage ' + LABELS[section] + ' categories';
        root.classList.remove('hidden');
        refresh(0);
    }

    function typingKey(code) {
        if (code === KEY.ENTER || code === KEY.IME_DONE || code === KEY.DOWN) {
            stopTyping();
            s.zone = matching().length ? 'list' : 'bar';
        } else if (code === KEY.RETURN || code === KEY.ESCAPE || code === KEY.IME_CANCEL) {
            stopTyping();
        } else return false;
        paint();
        return true;
    }

    function toggle() {
        var category = list.item();
        if (!category) return;
        HiddenCategories.toggle(hooks.sourceId(), s.section, category.category_id);
        s.changed = true;
        list.select(list.index());
    }

    function showAll() {
        HiddenCategories.showAll(hooks.sourceId(), s.section);
        s.changed = true;
        hooks.toast('All categories shown');
        refresh(list.index());
    }

    function onKey(code) {
        if (s.typing) return typingKey(code);
        if (Keys.isBack(code) || (code === KEY.LEFT && (s.zone === 'list' || s.tool === 0))) {
            close();
            return true;
        }
        if (s.zone === 'bar') {
            if (code === KEY.RIGHT) s.tool = 1;
            else if (code === KEY.LEFT) s.tool = 0;
            else if (code === KEY.DOWN && matching().length) s.zone = 'list';
            else if (code === KEY.ENTER && s.tool === 0) startTyping();
            else if (code === KEY.ENTER) showAll();
        } else if (code === KEY.UP) {
            if (!list.move(-1)) s.zone = 'bar';
        } else if (code === KEY.DOWN) list.move(1);
        else if (code === KEY.CH_UP) list.move(-list.pageSize());
        else if (code === KEY.CH_DOWN) list.move(list.pageSize());
        else if (code === KEY.ENTER) toggle();
        paint();
        return true;
    }

    input.addEventListener('input', function () {
        refresh(0);
    });

    function open(section) {
        return hooks.load(section).then(function (categories) {
            show(section, categories);
        }).catch(function () {
            hooks.toast('Could not load the categories');
        });
    }

    // Options for holding OK on a category; `base` is the section's full list.
    function menu(section, row, base) {
        var id = hooks.sourceId();
        var options = [];
        if (HiddenCategories.isReal(row)) {
            options.push({
                label: 'Hide category',
                run: function () {
                    HiddenCategories.hide(id, section, row.category_id);
                    hooks.toast('Hidden: ' + row.category_name);
                    hooks.changed(section);
                },
            });
            options.push({
                label: 'Hide all except this',
                run: function () {
                    HiddenCategories.hideAllExcept(id, section, base, row.category_id);
                    hooks.toast('Hidden all except: ' + row.category_name);
                    hooks.changed(section);
                },
            });
        }
        options.push({ label: 'Manage categories', run: function () { open(section); } });
        options.push({ label: 'Cancel' });
        return options;
    }

    return {
        open: open,
        menu: menu,
        onKey: onKey,
        isOpen: function () {
            return s.open;
        },
    };
};
