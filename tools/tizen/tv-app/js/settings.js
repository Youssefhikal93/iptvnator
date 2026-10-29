// App-wide choices live beside the library, independent of the active source.
// The groups run down the left and the chosen group's rows fill the right
// (#49): ▲▼ pick a group, ▶ or OK opens its rows; ◀ or Return goes back to the groups.
// OK on a row flips an on/off switch, opens the row's choices as a list, or runs it.
// Related settings share one group under part headings (#52).
window.Settings = function (hooks) {
    'use strict';

    const { html } = UI;
    const VERSION = '0.1.0'; // Keep in step with config.xml.
    const KEY = Keys;
    const root = document.getElementById('settings');
    const onOff = () => [I18n.t('common.on'), I18n.t('common.off')];
    const views = () => [I18n.t('settings.list'), I18n.t('settings.grid')];
    let group = 0;
    let focus = 0;
    let zone = 'groups';
    let active = false;

    // Read when drawn, so the count follows what the viewer hides.
    const hiddenText = (section) => () => hooks.hiddenText(section);
    const sortId = (option) => option.id;
    const sortLabel = (option) => option.label;

    // The same row under another heading (#52): group starts a group down the
    // left, part a heading inside one. The player menu keeps the row's own.
    const placed = (source, group, part) => Object.create(source, {
        group: { get: () => (group ? I18n.t(group) : undefined) },
        part: { get: () => (part ? I18n.t(part) : undefined) },
    });
    const picture = PlayerPicture.rows;

    const rows = [
        { get group() { return I18n.t('settings.playback'); }, get label() { return I18n.t('settings.autoplay'); }, get hint() { return I18n.t('describe.autoplay'); }, key: 'autoplayMs', choices: [0, 5000, 8000, 15000], get labels() { return [I18n.t('common.off'), I18n.t('unit.seconds', { n: 5 }), I18n.t('unit.seconds', { n: 8 }), I18n.t('unit.seconds', { n: 15 })]; } },
        { get label() { return I18n.t('settings.programmeGuide'); }, get hint() { return I18n.t('describe.programmeGuide'); }, key: 'programmeGuide', choices: [true, false], get labels() { return onOff(); } },
        { get label() { return I18n.t('settings.livePreview'); }, get hint() { return I18n.t('describe.livePreview'); }, key: 'livePreview', choices: [true, false], get labels() { return onOff(); } },
        ...LanguageSettings.rows,
        placed(picture[4], null, 'picture.picture'),
        { get part() { return I18n.t('settings.startUp'); }, get label() { return I18n.t('settings.onStart'); }, get hint() { return I18n.t('describe.onStart'); }, key: 'onStart', choices: ['last-channel', 'home'], get labels() { return [I18n.t('settings.lastChannel'), I18n.t('rail.home')]; } },
        placed(picture[0], 'picture.subtitles', 'picture.subtitleStyle'),
        ...picture.slice(1, 4).map((source) => placed(source)),
        ...OpenSubsSettings.rows,
        { get group() { return I18n.t('settings.display'); }, get label() { return I18n.t('settings.homeLayout'); }, get hint() { return I18n.t('describe.homeLayout'); }, key: 'homeLayout', choices: ['cinema', 'bigrow', 'backdrop'], get labels() { return [I18n.t('settings.cinema'), I18n.t('settings.bigRow'), I18n.t('settings.backdrop')]; } },
        { get label() { return I18n.t('settings.libraryFrom'); }, get hint() { return I18n.t('describe.libraryFrom'); }, key: 'librarySources', choices: ['current', 'all'], get labels() { return [I18n.t('settings.thisSource'), I18n.t('settings.allSources')]; } },
        { get label() { return I18n.t('settings.viewMovies'); }, key: 'view:movies', choices: ['list', 'grid'], get labels() { return views(); } },
        { get label() { return I18n.t('settings.viewSeries'); }, key: 'view:series', choices: ['list', 'grid'], get labels() { return views(); } },
        { get label() { return I18n.t('settings.viewLive'); }, key: 'view:live', choices: ['list', 'grid'], get labels() { return views(); } },
        { get label() { return I18n.t('settings.sortMovies'); }, key: 'sort:movies', choices: Sort.options.map(sortId), get labels() { return Sort.options.map(sortLabel); } },
        { get label() { return I18n.t('settings.sortSeries'); }, key: 'sort:series', choices: Sort.options.map(sortId), get labels() { return Sort.options.map(sortLabel); } },
        { get part() { return I18n.t('settings.categories'); }, get label() { return I18n.t('settings.manageLive'); }, action: 'live', text: hiddenText('live') },
        { get label() { return I18n.t('settings.manageMovies'); }, action: 'movies', text: hiddenText('movies') },
        { get label() { return I18n.t('settings.manageSeries'); }, action: 'series', text: hiddenText('series') },
        ...AppearanceSettings.rows,
        // Our own screen saver (#61); Off hands the screen back to Samsung's.
        { get label() { return I18n.t('settings.screenSaver'); }, get hint() { return I18n.t('describe.screenSaver'); }, key: 'screenSaverMs', choices: [0, 300000, 600000, 900000], get labels() { return [I18n.t('common.off'), I18n.t('unit.minutes', { n: 5 }), I18n.t('unit.minutes', { n: 10 }), I18n.t('unit.minutes', { n: 15 })]; } },
        { get group() { return I18n.t('settings.parentalLock'); }, get label() { return I18n.t('settings.pin'); }, get hint() { return I18n.t('describe.pin'); }, run: () => ParentalMenu.settings(render), text: () => (ParentalLock.hasPin() ? I18n.t('settings.changePin') : I18n.t('settings.setPin')) },
        { get label() { return I18n.t('settings.relock'); }, get hint() { return I18n.t('describe.relock'); }, key: 'parentalRelockMs', choices: [300000, 900000, 3600000, 0], get labels() { return [I18n.t('unit.minutes', { n: 5 }), I18n.t('unit.minutes', { n: 15 }), I18n.t('unit.hour'), I18n.t('settings.relockClose')]; } },
        { get group() { return I18n.t('settings.backup'); }, get label() { return I18n.t('settings.import'); }, backup: 'import', text: '' },
        { get label() { return I18n.t('settings.export'); }, backup: 'export', text: '' },
        ...TmdbSettings.rows,
        { get group() { return I18n.t('settings.about'); }, get label() { return I18n.t('settings.version'); }, text: VERSION },
        { get label() { return I18n.t('settings.installGuide'); }, text: 'tools/tizen/INSTALLATION-TO-TV.md' },
    ];

    rows.unshift(...ProfileSettings.rows(hooks, render));

    // Sources come first (#51) and are read on every draw, as the list
    // changes. A row that names a group starts it.
    function groups() {
        const list = [];
        SourceSettings.rows(hooks.sources).concat(rows).forEach((row) => {
            if (row.hidden) return;
            const name = row.group;
            if (name || !list.length) list.push({ name, rows: [] });
            list[list.length - 1].rows.push(row);
        });
        return list;
    }

    const choice = (row) => Math.max(0, row.choices.indexOf(row.read ? row.read() : Prefs.get(row.key)));
    const isSwitch = (row) => !row.pills && !!row.choices && row.choices.length === 2 && row.choices[0] === true && row.choices[1] === false;
    const valueText = (row) => (row.key ? row.labels[choice(row)] : typeof row.text === 'function' ? row.text() : row.text);
    const classes = (base, flags) => [base].concat(Object.keys(flags).filter((flag) => flags[flag])).join(' ');

    // Every choice is shown, so the viewer sees how many there are; the active one is filled.
    const Pills = ({ row }) => html`<span class="st-value st-pills">
        ${row.labels.map((label, index) => html`<span class=${classes('st-pill', { on: index === choice(row) })}>
            ${row.swatches ? html`<i class=${'st-swatch st-swatch-' + row.choices[index]}></i>` : null}<span>${label}</span>
        </span>`)}
    </span>`;

    // On/off reads by shape as well as by word; other choices show their arrows.
    const Value = ({ row }) => {
        if (row.source) return html`<span class=${classes('st-chip', { warn: row.warn })}>${row.chip}</span>`;
        if (row.pills) return html`<${Pills} row=${row} />`;
        if (isSwitch(row)) {
            return html`<span class="st-toggle"><span class="st-value">${valueText(row)}</span>
                <span class=${classes('st-switch', { on: Prefs.get(row.key) === true })}><i></i></span></span>`;
        }
        if (row.key) return html`<span class="st-choice"><span class="st-value">${valueText(row)}</span><i class="st-arrow">›</i></span>`;
        return html`<span class="st-value">${valueText(row)}</span>`;
    };

    const Row = ({ row, focused }) => {
        const sub = row.source ? row.sub : row.hint;
        return html`<div class=${classes('st-row', { 'st-source': !!row.source, 'st-add': !!row.add, warn: !!row.warn, focused })}>
            <span class="st-text"><span class="st-label">${row.label}</span>${sub ? html`<span class="st-sub">${sub}</span>` : null}</span>
            <${Value} row=${row} />
        </div>`;
    };

    // Every group is drawn and only the chosen one shown, so a row keeps its
    // place in the page whichever group is open.
    const Screen = ({ list }) => html`<div class="st-groups">
            <h1 class="st-title">${I18n.t('rail.settings')}</h1>
            ${list.map((entry, index) => html`<div class=${classes('st-group-item', { selected: index === group, focused: active && zone === 'groups' && index === group })}>
                <span>${entry.name}</span><span class="n">${entry.rows.length}</span>
            </div>`)}
        </div>
        <div class="st-panes">
            ${list.map((entry, index) => html`<section class=${classes('st-section', { hidden: index !== group })}>
                <h2 class="st-group">${entry.name}</h2>
                ${entry.rows.map((row, at) => [row.part ? html`<h3 class="st-part">${row.part}</h3>` : null,
                    html`<${Row} row=${row} focused=${active && zone === 'rows' && index === group && at === focus} />`])}
            </section>`)}
        </div>`;

    function render() {
        const list = groups();
        group = Math.min(group, list.length - 1);
        focus = Math.max(0, Math.min(focus, list[group].rows.length - 1));
        UI.render(html`<${Screen} list=${list} />`, root);
        const selected = root.querySelector('.st-row.focused, .st-group-item.focused');
        if (selected) selected.scrollIntoView({ block: 'nearest' });
    }

    function current() {
        return groups()[group].rows[focus];
    }

    function setZone(next) {
        zone = next;
        render();
        hooks.chrome();
    }

    function save(row, value) {
        if (row.write) row.write(value);
        else Prefs.set(row.key, value);
        hooks.toast(I18n.t('toast.saved'));
        render();
    }

    function choose() {
        const row = current();
        if (!row.key) {
            if (row.backup) BackupScreen.open(row.backup);
            if (row.action && row.action.indexOf('tmdb-') === 0) return TmdbSettings.act(row.action, hooks, render);
            if (row.action && row.action.indexOf('opensubs-') === 0) return OpenSubsSettings.act(row.action, hooks, render);
            if (row.run) row.run();
            if (row.action) hooks.manage(row.action);
            return;
        }
        if (isSwitch(row)) return save(row, !Prefs.get(row.key));
        // The choices as a list, the current one ticked, as for the language.
        const at = choice(row);
        Menu.open(row.label, row.labels.map((label, index) => ({
            label: (index === at ? '\u2713 ' : '') + label,
            run: () => save(row, row.choices[index]),
        })), at);
    }

    function groupKey(code) {
        if (Keys.isBack(code)) return 'back';
        if (code === KEY.LEFT) return 'left';
        // ▲ on the first group leaves for a menu along the top (#50).
        if (code === KEY.UP && group === 0) return 'up';
        if (code === KEY.UP || code === KEY.DOWN) {
            group = Math.max(0, Math.min(groups().length - 1, group + (code === KEY.UP ? -1 : 1)));
            focus = 0;
            root.querySelector('.st-panes').scrollTop = 0;
            render();
        } else if (code === KEY.RIGHT || code === KEY.ENTER) {
            focus = 0;
            setZone('rows');
        }
    }

    return {
        render,
        // Opens the group holding the first row `match` accepts (a source, Add).
        select(match) {
            groups().some((entry, index) => {
                const at = entry.rows.findIndex(match);
                if (at < 0) return false;
                group = index;
                focus = at;
                return true;
            });
            zone = 'rows';
            render();
        },
        setActive(enabled) {
            // Coming back from the menu starts on the groups.
            if (!enabled) zone = 'groups';
            active = enabled;
            render();
        },
        key(code) {
            if (zone === 'groups') return groupKey(code);
            if (Keys.isBack(code) || code === KEY.LEFT) return setZone('groups');
            if (code === KEY.ENTER) return choose();
            if (code === KEY.UP || code === KEY.DOWN) {
                focus = Math.max(0, Math.min(groups()[group].rows.length - 1, focus + (code === KEY.UP ? -1 : 1)));
                render();
            }
        },
    };
};
