// "What can <name> watch?" (#62): tick the categories a kids profile may see,
// per source and section. Parts top to bottom: the source (◀ ▶ switches),
// the section tabs, a search box, the categories in two columns, Save/Cancel.
// Categories come from the catalogue the app already saved (see
// KidsProfile.catalogue()); a source never opened has nothing to tick yet.
window.KidsPicker = (() => {
    'use strict';

    const { html } = UI;
    const COLS = 2;
    const LINES = 5;
    let root = null;
    let s = null;

    const source = () => s.sources[s.at];
    const key = (section) => source().id + '|' + section;
    const draft = () => s.lists[source().id] || (s.lists[source().id] = { live: [], movies: [], series: [] });
    const sections = () => KidsProfile.catalogue().sections(source());

    // The categories of the open tab, after the search.
    const shown = () => {
        const all = s.cats[key(s.section)];
        if (!Array.isArray(all)) return [];
        const query = s.query.trim().toLowerCase();
        return query ? all.filter((row) => String(row.category_name).toLowerCase().indexOf(query) !== -1) : all;
    };

    const ticked = (section, id) => draft()[section].indexOf(String(id)) !== -1;

    // Loads every tab of the current source once; counts arrive when saved.
    const load = () => {
        sections().forEach((section) => {
            const at = key(section);
            if (at in s.cats) return;
            s.cats[at] = null;
            const provider = KidsProfile.catalogue();
            provider.categories(source(), section).then((rows) => {
                s.cats[at] = rows && rows.length ? rows : 'none';
                if (root) render();
                return provider.counts(source(), section);
            }).then((counts) => {
                if (counts) s.counts[at] = counts;
                if (root) render();
            });
        });
    };

    const tab = (section) => {
        const all = s.cats[key(section)];
        const total = Array.isArray(all) ? all.length : 0;
        const label = I18n.t('rail.' + section);
        return html`<span class=${'kp-tab' + (section === s.section ? ' on' : '') + (s.zone === 'tabs' && section === s.section ? ' focus' : '')}>
            ${label}${total ? html`<small>${I18n.t('kids.of', { n: draft()[section].length, m: total })}</small>` : null}
        </span>`;
    };

    const grid = () => {
        const all = s.cats[key(s.section)];
        if (all === null || all === undefined) return html`<p class="kp-note">${I18n.t('common.loadingEllipsis')}</p>`;
        if (all === 'none') return html`<p class="kp-note">${I18n.t('kids.none')}</p>`;
        const rows = shown();
        if (!rows.length) return html`<p class="kp-note">${I18n.t('kids.noMatch')}</p>`;
        const lines = Math.ceil(rows.length / COLS);
        const first = Math.max(0, Math.min(Math.floor(s.index / COLS) - 2, lines - LINES)) * COLS;
        const counts = s.counts[key(s.section)] || {};
        return html`<div class="kp-cats">${rows.slice(first, first + LINES * COLS).map((row, n) => {
            const on = ticked(s.section, row.category_id);
            const count = counts[String(row.category_id)];
            return html`<div class=${'kp-cat' + (on ? ' on' : '') + (s.zone === 'list' && first + n === s.index ? ' focus' : '')}>
                <span class="kp-box">${on ? '✓' : ''}</span><span class="kp-name">${row.category_name}</span>
                ${count ? html`<span class="kp-count">${count}</span>` : null}
            </div>`;
        })}</div>`;
    };

    const render = () => {
        const many = s.sources.length > 1;
        UI.render(html`<div class="kp-panel">
            <h1>${I18n.t('kids.title', { name: s.name })}</h1>
            <p class="kp-hint">${I18n.t('kids.hint')}</p>
            <div class=${'kp-source' + (s.zone === 'source' ? ' focus' : '')}>
                ${I18n.t('kids.source')} <b>${source().name}</b> (${Sources.typeLabel(source())})
                ${many ? html`<span>${I18n.t('kids.otherSource', { n: s.sources.length })}</span>` : null}
            </div>
            <div class="kp-tabs">${sections().map(tab)}</div>
            <input id="kids-search" class=${'kp-search' + (s.zone === 'search' ? ' focus' : '')} type="text" autocomplete="off"
                placeholder=${I18n.t('kids.search', { section: I18n.t('rail.' + s.section) })} value=${s.query}
                onInput=${(event) => { s.query = event.target.value; s.index = 0; render(); }} />
            ${grid()}
            <div class="kp-actions">
                <span class=${'kp-btn primary' + (s.zone === 'actions' && s.action === 0 ? ' focus' : '')}>${I18n.t('common.save')}</span>
                <span class=${'kp-btn' + (s.zone === 'actions' && s.action === 1 ? ' focus' : '')}>${I18n.t('common.cancel')}</span>
                <span class="kp-keys">${I18n.t('kids.keys')}</span>
            </div>
        </div>`, root);
    };

    const close = (lists) => {
        const done = s && s.done;
        if (root) root.remove();
        root = null;
        s = null;
        if (done) done(lists);
    };

    const setSection = (section) => {
        s.section = section;
        s.index = 0;
        s.query = '';
    };

    const toggle = () => {
        const row = shown()[s.index];
        if (!row) return;
        const id = String(row.category_id);
        const list = draft()[s.section];
        draft()[s.section] = list.indexOf(id) === -1 ? list.concat(id) : list.filter((other) => other !== id);
    };

    // The search box: the TV keyboard types into it; ▼ or OK ends typing.
    const searchKey = (event, code) => {
        const box = document.getElementById('kids-search');
        if (code === Keys.DOWN || code === Keys.ENTER || code === Keys.IME_DONE || code === Keys.UP || Keys.isBack(code) || code === Keys.IME_CANCEL) {
            box.blur();
            s.zone = code === Keys.UP ? 'tabs' : Keys.isBack(code) || code === Keys.IME_CANCEL ? 'search' : 'list';
            event.preventDefault();
            render();
        }
    };

    // Two columns: ◀ ▶ along a line, ▲ ▼ across lines; past the top the
    // search box, past the bottom Save.
    const move = (code) => {
        const rows = shown().length;
        s.index = Math.max(0, Math.min(s.index, rows - 1));
        if (code === Keys.LEFT && s.index % COLS > 0) s.index--;
        else if (code === Keys.RIGHT && s.index % COLS < COLS - 1 && s.index + 1 < rows) s.index++;
        else if (code === Keys.UP) {
            if (s.index >= COLS) s.index -= COLS;
            else s.zone = 'search';
        } else if (code === Keys.DOWN) {
            if (Math.floor(s.index / COLS) < Math.floor((rows - 1) / COLS)) s.index = Math.min(rows - 1, s.index + COLS);
            else s.zone = 'actions';
        }
    };

    const onKey = (event) => {
        const code = event.keyCode;
        if (document.activeElement && document.activeElement.id === 'kids-search') return searchKey(event, code);
        event.preventDefault();
        if (Keys.repeat(code) && code === Keys.ENTER) return;
        if (Keys.isBack(code)) return close(null);
        const zones = ['source', 'tabs', 'search', 'list', 'actions'];
        const at = zones.indexOf(s.zone);
        if (s.zone === 'list') move(code);
        else if (code === Keys.UP && at > 0) s.zone = zones[at - 1];
        else if (code === Keys.DOWN && at < zones.length - 1) s.zone = zones[at + 1];
        else if (code === Keys.LEFT || code === Keys.RIGHT) {
            const delta = code === Keys.LEFT ? -1 : 1;
            if (s.zone === 'source') {
                s.at = Math.max(0, Math.min(s.sources.length - 1, s.at + delta));
                setSection(sections()[0]);
                load();
            } else if (s.zone === 'tabs') {
                const list = sections();
                setSection(list[Math.max(0, Math.min(list.length - 1, list.indexOf(s.section) + delta))]);
            } else if (s.zone === 'actions') s.action = delta < 0 ? 0 : 1;
        } else if (code === Keys.ENTER) {
            if (s.zone === 'search') {
                render();
                document.getElementById('kids-search').focus();
                return;
            }
            if (s.zone === 'actions') return close(s.action === 0 ? s.lists : null);
        }
        if (code === Keys.ENTER && s.zone === 'list') toggle();
        render();
    };

    return {
        // opts: { name, sources, lists: { sourceId: { live, movies, series } }, done(lists|null) }
        open: (opts) => {
            const lists = {};
            Object.keys(opts.lists || {}).forEach((id) => {
                const from = opts.lists[id];
                lists[id] = { live: from.live.slice(), movies: from.movies.slice(), series: from.series.slice() };
            });
            s = { name: opts.name, sources: opts.sources, at: 0, lists, cats: {}, counts: {}, section: '', query: '', zone: 'tabs', index: 0, action: 0, done: opts.done };
            s.section = sections()[0];
            root = document.createElement('section');
            root.id = 'kids-picker';
            root.setAttribute('role', 'dialog');
            root.setAttribute('aria-modal', 'true');
            document.body.appendChild(root);
            load();
            render();
        },
        isOpen: () => !!root,
        onKey,
    };
})();
