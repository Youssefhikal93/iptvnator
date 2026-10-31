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
    var LABELS = { get live() { return I18n.t('rail.live'); }, get movies() { return I18n.t('rail.movies'); }, get series() { return I18n.t('rail.series'); } };
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
    input.placeholder = I18n.t('manage.search');
    box.appendChild(input);
    var all = el('span', 'mc-btn', I18n.t('manage.showAll'));
    bar.appendChild(box);
    bar.appendChild(all);
    var pane = el('div', 'pane main mc-list');
    root.appendChild(title);
    root.appendChild(bar);
    root.appendChild(pane);
    var hint = el('div', 'mc-hint', I18n.t('manage.hint'));
    root.appendChild(hint);
    var move = MoveMode.controller(function (text) { hint.textContent = text || I18n.t('manage.hint'); });
    var groups = GroupMenu({ sourceId: hooks.sourceId, changed: reload });

    var list = List(pane, {
        rows: 8,
        title: function () {
            var hidden = HiddenCategories.count(hooks.sourceId(), s.section);
            return I18n.t('manage.categories') + (hidden ? ' · ' + I18n.t('browser.hidden', { count: hidden }) : '');
        },
        label: function (category) {
            return category.category_name;
        },
        badge: function (category) {
            if (!HiddenCategories.isReal(category)) return '';
            return HiddenCategories.isHidden(hooks.sourceId(), s.section, category.category_id) ? I18n.t('manage.hidden') : I18n.t('manage.shown');
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
        list.set(matching(), index || 0, searching ? [I18n.t('manage.noMatch'), I18n.t('manage.noMatchHint')] : [I18n.t('browser.noCategories'), I18n.t('manage.noneInSection')]);
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
        s = { open: true, section: section, full: categories, all: categories.filter(function (row) { return !row.virtual || row.virtual === 'group'; }), zone: 'list', tool: 0, typing: false, changed: false };
        input.value = '';
        title.textContent = I18n.t('manage.titleOf', { section: LABELS[section] });
        // Built once; follow the language chosen since.
        input.placeholder = I18n.t('manage.search');
        all.textContent = I18n.t('manage.showAll');
        hint.textContent = I18n.t('manage.hint');
        root.classList.remove('hidden');
        var first = s.all.findIndex(HiddenCategories.isReal);
        refresh(Math.max(0, first));
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
        if (!HiddenCategories.isReal(category)) return;
        HiddenCategories.toggle(hooks.sourceId(), s.section, category.category_id);
        s.changed = true;
        list.select(list.index());
    }

    function showAll() {
        HiddenCategories.showAll(hooks.sourceId(), s.section);
        s.changed = true;
        hooks.toast(I18n.t('manage.allShown'));
        refresh(list.index());
    }

    function changed(section) {
        if (!s.open || s.section !== section) return hooks.changed(section);
        s.changed = true;
        refresh(list.index());
    }

    function reload() {
        var row = list.item();
        var section = s.section;
        s.changed = true;
        return hooks.load(section).then(function (rows) {
            if (!s.open || s.section !== section) return;
            s.full = rows;
            s.all = rows.filter(function (entry) { return !entry.virtual || entry.virtual === 'group'; });
            refresh(Math.max(0, matching().map(ListOrder.categoryKey).indexOf(ListOrder.categoryKey(row))));
        }).catch(function () { hooks.toast(I18n.t('manage.loadFailed')); });
    }

    function orderMenu(row) {
        var scope = 'categories:' + s.section;
        var source = hooks.sourceId();
        return OrderMenu({ list: list, row: row, key: ListOrder.categoryKey, controller: move,
            save: function (rows) {
                s.full = ListOrder.replace(s.full, rows, ListOrder.categoryKey);
                ListOrder.save(source, scope, s.full, ListOrder.categoryKey);
            },
            changed: ListOrder.changed(source, scope),
            reset: function () {
                ListOrder.reset(source, scope);
                // Reload the provider's original order, rather than the open list.
            },
            done: reload });
    }

    function onKey(code) {
        if (move.onKey(code)) return true;
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
        else if (code === KEY.ENTER) Keys.press(toggle, function () {
            var row = list.item();
            if (!row) return;
            var options = menu(s.section, row, s.full).slice(0, -1).concat(orderMenu(row));
            if (row.virtual === 'group') options = options.concat(groups.category(row));
            options.push({ label: I18n.t('common.cancel') });
            Menu.open(row.category_name, options);
        }, Keys.focusedIn('manage'));
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
            hooks.toast(I18n.t('manage.loadFailed'));
        });
    }

    // Options for holding OK on a category; `base` is the section's full list.
    function menu(section, row, base) {
        var id = hooks.sourceId();
        var options = [];
        if (HiddenCategories.isReal(row)) {
            options.push({
                label: I18n.t('manage.hide'),
                run: function () {
                    HiddenCategories.hide(id, section, row.category_id);
                    hooks.toast(I18n.t('manage.toastHidden', { name: row.category_name }));
                    changed(section);
                },
            });
            options.push({
                label: I18n.t('manage.hideOthers'),
                run: function () {
                    HiddenCategories.hideAllExcept(id, section, base, row.category_id);
                    hooks.toast(I18n.t('manage.toastHiddenOthers', { name: row.category_name }));
                    changed(section);
                },
            });
        }
        options.push({ label: I18n.t('manage.title'), run: function () { open(section); } });
        options.push({ label: I18n.t('common.cancel') });
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
