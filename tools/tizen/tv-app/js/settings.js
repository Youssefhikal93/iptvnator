// App-wide choices live beside the library, independent of the active source.
window.Settings = function (hooks) {
    'use strict';

    var VERSION = '0.1.0'; // Keep in step with config.xml.
    var KEY = Keys;
    var root = document.getElementById('settings');
    var focus = 0;
    var active = false;
    var rows = [
        { group: 'Playback', label: 'Autoplay next episode', key: 'autoplayMs', choices: [0, 5000, 8000, 15000], labels: ['Off', '5 s', '8 s', '15 s'] },
        { label: 'Skip intro length', key: 'skipIntroSeconds', choices: [60, 75, 90, 120], labels: ['60 s', '75 s', '90 s', '120 s'] },
        { label: 'Programme guide (now and next)', key: 'programmeGuide', choices: [true, false], labels: ['On', 'Off'] },
        { label: 'Live preview', key: 'livePreview', choices: [true, false], labels: ['On', 'Off'] },
    ].concat(PlayerPicture.rows, [
        { group: 'Display', label: 'Home layout', key: 'homeLayout', choices: ['cinema', 'showcase'], labels: ['Cinema', 'Showcase'] },
        { label: 'Favorites and recents from', key: 'librarySources', choices: ['current', 'all'], labels: ['This source', 'All sources'] },
        { label: 'Default view for Movies', key: 'view:movies', choices: ['list', 'grid'], labels: ['List', 'Grid'] },
        { label: 'Default view for Series', key: 'view:series', choices: ['list', 'grid'], labels: ['List', 'Grid'] },
        { label: 'Default view for Live TV', key: 'view:live', choices: ['list', 'grid'], labels: ['List', 'Grid'] },
        { label: 'Default sort for Movies', key: 'sort:movies', choices: Sort.options.map(sortId), labels: Sort.options.map(sortLabel) },
        { label: 'Default sort for Series', key: 'sort:series', choices: Sort.options.map(sortId), labels: Sort.options.map(sortLabel) },
        { group: 'Start-up', label: 'On start open', key: 'onStart', choices: ['last-channel', 'home'], labels: ['Last channel', 'Home'] },
        { group: 'Parental lock', label: 'PIN', run: function () { ParentalMenu.settings(render); }, text: function () { return ParentalLock.hasPin() ? 'Change PIN\u2026 / Remove PIN' : 'Set PIN\u2026'; } },
        { label: 'Re-lock after', key: 'parentalRelockMs', choices: [300000, 900000, 3600000, 0], labels: ['5 min', '15 min', '1 hour', 'When the app closes'] },
        { group: 'Categories', label: 'Manage Live TV categories', action: 'live', text: hiddenText('live') },
        { label: 'Manage Movies categories', action: 'movies', text: hiddenText('movies') },
        { label: 'Manage Series categories', action: 'series', text: hiddenText('series') },
        { group: 'Backup', label: 'Import from link\u2026', backup: 'import', text: '' },
        { label: 'Export', backup: 'export', text: '' },
        { group: 'About', label: 'App version', text: VERSION },
        { label: 'Install guide', text: 'tools/tizen/INSTALLATION-TO-TV.md' },
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
        root.appendChild(el('h1', 'st-title', 'Settings'));
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
            if (row.run) row.run();
            if (row.action) hooks.manage(row.action);
            return;
        }
        Prefs.set(row.key, row.choices[(index + step) % row.choices.length]);
        hooks.toast('Saved');
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
