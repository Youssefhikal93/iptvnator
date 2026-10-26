// App-wide choices live beside the library, independent of the active source.
window.Settings = function (hooks) {
    'use strict';

    var VERSION = '0.1.0'; // Keep in step with config.xml.
    var KEY = Keys;
    var root = document.getElementById('settings');
    var focus = 0;
    var active = false;
    var rows = [
        { get group() { return I18n.t('settings.playback'); }, get label() { return I18n.t('settings.autoplay'); }, key: 'autoplayMs', choices: [0, 5000, 8000, 15000], get labels() { return [I18n.t('common.off'), I18n.t('unit.seconds', { n: 5 }), I18n.t('unit.seconds', { n: 8 }), I18n.t('unit.seconds', { n: 15 })]; } },
        { get label() { return I18n.t('settings.skipIntro'); }, key: 'skipIntroSeconds', choices: [60, 75, 90, 120], get labels() { return [60, 75, 90, 120].map(function (n) { return I18n.t('unit.seconds', { n: n }); }); } },
        { get label() { return I18n.t('settings.programmeGuide'); }, key: 'programmeGuide', choices: [true, false], get labels() { return [I18n.t('common.on'), I18n.t('common.off')]; } },
        { get label() { return I18n.t('settings.livePreview'); }, key: 'livePreview', choices: [true, false], get labels() { return [I18n.t('common.on'), I18n.t('common.off')]; } },
    ].concat(PlayerPicture.rows, [
        { get group() { return I18n.t('settings.display'); }, get label() { return I18n.t('settings.homeLayout'); }, key: 'homeLayout', choices: ['cinema', 'showcase'], get labels() { return [I18n.t('settings.cinema'), I18n.t('settings.showcase')]; } },
        { get label() { return I18n.t('settings.libraryFrom'); }, key: 'librarySources', choices: ['current', 'all'], get labels() { return [I18n.t('settings.thisSource'), I18n.t('settings.allSources')]; } },
        { get label() { return I18n.t('settings.viewMovies'); }, key: 'view:movies', choices: ['list', 'grid'], get labels() { return [I18n.t('settings.list'), I18n.t('settings.grid')]; } },
        { get label() { return I18n.t('settings.viewSeries'); }, key: 'view:series', choices: ['list', 'grid'], get labels() { return [I18n.t('settings.list'), I18n.t('settings.grid')]; } },
        { get label() { return I18n.t('settings.viewLive'); }, key: 'view:live', choices: ['list', 'grid'], get labels() { return [I18n.t('settings.list'), I18n.t('settings.grid')]; } },
        { get label() { return I18n.t('settings.sortMovies'); }, key: 'sort:movies', choices: Sort.options.map(sortId), get labels() { return Sort.options.map(sortLabel); } },
        { get label() { return I18n.t('settings.sortSeries'); }, key: 'sort:series', choices: Sort.options.map(sortId), get labels() { return Sort.options.map(sortLabel); } },
        { get group() { return I18n.t('settings.startUp'); }, get label() { return I18n.t('settings.onStart'); }, key: 'onStart', choices: ['last-channel', 'home'], get labels() { return [I18n.t('settings.lastChannel'), I18n.t('rail.home')]; } },
        { get group() { return I18n.t('settings.parentalLock'); }, get label() { return I18n.t('settings.pin'); }, run: function () { ParentalMenu.settings(render); }, text: function () { return ParentalLock.hasPin() ? I18n.t('settings.changePin') : I18n.t('settings.setPin'); } },
        { get label() { return I18n.t('settings.relock'); }, key: 'parentalRelockMs', choices: [300000, 900000, 3600000, 0], get labels() { return [I18n.t('unit.minutes', { n: 5 }), I18n.t('unit.minutes', { n: 15 }), I18n.t('unit.hour'), I18n.t('settings.relockClose')]; } },
        { get group() { return I18n.t('settings.categories'); }, get label() { return I18n.t('settings.manageLive'); }, action: 'live', text: hiddenText('live') },
        { get label() { return I18n.t('settings.manageMovies'); }, action: 'movies', text: hiddenText('movies') },
        { get label() { return I18n.t('settings.manageSeries'); }, action: 'series', text: hiddenText('series') },
        { get group() { return I18n.t('settings.backup'); }, get label() { return I18n.t('settings.import'); }, backup: 'import', text: '' },
        { get label() { return I18n.t('settings.export'); }, backup: 'export', text: '' },
    ], TmdbSettings.rows, AppearanceSettings.rows, [
        { get group() { return I18n.t('settings.about'); }, get label() { return I18n.t('settings.version'); }, text: VERSION },
        { get label() { return I18n.t('settings.installGuide'); }, text: 'tools/tizen/INSTALLATION-TO-TV.md' },
    ]);

    // Read when drawn, so the count follows what the viewer hides.
    function hiddenText(section) {
        return function () {
            return hooks.hiddenText(section);
        };
    }

    function sortId(option) { return option.id; }
    function sortLabel(option) { return option.label; }

    function el(tag, cls, text) {
        var node = document.createElement(tag);
        node.className = cls;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function choice(row) {
        return Math.max(0, row.choices.indexOf(Prefs.get(row.key)));
    }

    function renderRow(row, index) {
        if (row.group) root.appendChild(el('h2', 'st-group', row.group));
        var node = el('div', 'st-row' + (active && focus === index ? ' focused' : ''));
        node.appendChild(el('span', 'st-label', row.label));
        node.appendChild(el('span', 'st-value', row.key ? row.labels[choice(row)] : typeof row.text === 'function' ? row.text() : row.text));
        root.appendChild(node);
    }

    function render() {
        var scroll = root.scrollTop;
        root.textContent = '';
        root.appendChild(el('h1', 'st-title', I18n.t('rail.settings')));
        rows.forEach(renderRow);
        root.scrollTop = scroll;
        var selected = root.querySelector('.focused');
        if (selected) selected.scrollIntoView({ block: 'nearest' });
    }

    function change(step) {
        var row = rows[focus];
        var index = row.key ? choice(row) : 0;
        // LEFT at the first choice leaves the screen; RIGHT cycles forward.
        if (step < 0 && index === 0) return 'left';
        if (!row.key) {
            if (row.backup) BackupScreen.open(row.backup);
            if (row.action && row.action.indexOf('tmdb-') === 0) return TmdbSettings.act(row.action, hooks, render);
            if (row.run) row.run();
            if (row.action) hooks.manage(row.action);
            return;
        }
        Prefs.set(row.key, row.choices[(index + step) % row.choices.length]);
        hooks.toast(I18n.t('toast.saved'));
        render();
    }

    return {
        render: render,
        setActive: function (enabled) {
            active = enabled;
            render();
        },
        key: function (code) {
            if (Keys.isBack(code)) return 'left';
            if (code === KEY.LEFT) return change(-1);
            if (code === KEY.RIGHT || code === KEY.ENTER) return change(1);
            if (code === KEY.UP || code === KEY.DOWN) {
                focus = Math.max(0, Math.min(rows.length - 1, focus + (code === KEY.UP ? -1 : 1)));
                render();
            }
        },
    };
};
