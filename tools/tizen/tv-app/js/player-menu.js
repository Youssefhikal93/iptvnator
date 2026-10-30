// The player's ▲ menu (#48): a panel down the right with a row per group
// (Audio, Subtitles, Subtitle style, Picture, Playback speed, Sleep timer,
// Stream info) and its current value. OK or ▶ opens a group's choices;
// Return or ◀ goes back to the groups, and Return there closes the menu.
//
// The player fills it on every render through build(entries), where
// entries.head(label, value) starts a group (value, when given, is what its
// row shows instead of the chosen choices), entries.item(label, active, run, note)
// adds a choice (before the first group it is a row of its own, such as Back
// to live; without run it cannot be picked and note says why), entries.note(text) says why a group has no choices and
// entries.info(text) adds a line of stream information.
window.PlayerMenu = (root, hooks) => {
    'use strict';

    const { html } = UI;
    const { build, run, title } = hooks;
    // group is -1 on the list of groups, else the open group's row.
    let state = { group: -1, focus: 0 };
    let rows = [];

    const collect = () => {
        const list = [];
        let group = null;
        build({
            head: (label, value) => {
                group = { label, value, items: [], notes: [], infos: [] };
                list.push(group);
            },
            item: (label, active, action, note) => (group ? group.items : list).push({ label, active, run: action, note }),
            note: (text) => group && group.notes.push(text),
            info: (text) => group && group.infos.push(text),
        });
        return list;
    };

    const isGroup = (row) => !!row && Array.isArray(row.items);

    // The chosen value(s), else the values of "Label: value" rows, else the note.
    const valueOf = (group) => {
        if (typeof group.value === 'string') return group.value;
        const active = group.items.filter((entry) => entry.active).map((entry) => entry.label);
        if (active.length) return active.join(' · ');
        const values = group.items.map((entry) => entry.label.split(': ')[1]).filter(Boolean);
        if (values.length) return values.slice(0, 2).join(' · ');
        return group.items.length ? '' : group.notes.join(' ');
    };

    const Choice = ({ entry, focused }) => html`<div class=${'pl-menu-item' + (entry.active ? ' active' : '') + (entry.run ? '' : ' unavailable') + (focused ? ' focus' : '')}>
        <span class="dot">${entry.active ? '●' : ''}</span><span>${entry.label}${entry.note ? html`<span class="pl-menu-note">${entry.note}</span>` : ''}</span>
    </div>`;

    const Group = ({ group, focused }) => html`<div class=${'pl-menu-item pl-menu-group' + (focused ? ' focus' : '')}>
        <span class="label">${group.label}</span><span class="value">${valueOf(group)}</span><span class="chev">›</span>
    </div>`;

    const groupsView = () => html`<div class="pl-menu-title">${title ? title() : I18n.t('player.hint.audioSubs')}</div>
        <div class="pl-menu-rows">${rows.map((row, i) => (isGroup(row)
            ? html`<${Group} group=${row} focused=${i === state.focus} />`
            : html`<${Choice} entry=${row} focused=${i === state.focus} />`))}</div>
        <div class="pl-menu-keys">${I18n.t('player.menuKeys')}</div>`;

    const groupView = (group) => html`<div class="pl-menu-title"><span class="pl-menu-back">‹</span>${group.label}</div>
        <div class="pl-menu-rows">
            ${group.items.map((entry, i) => html`<${Choice} entry=${entry} focused=${i === state.focus} />`)}
            ${group.notes.map((text) => html`<div class="pl-menu-empty">${text}</div>`)}
            ${group.infos.map((text) => html`<div class="pl-menu-info">${text}</div>`)}
        </div>
        <div class="pl-menu-keys">${I18n.t('player.menuKeysBack')}</div>`;

    // The label at i, else the first one like it: a row that arrives or leaves
    // while the menu is open (live Start over after the guide loads) must not
    // move the open group or the focus onto another row.
    const follow = (list, label, i, wanted) => {
        if (label === undefined || (list[i] && list[i].label === label && wanted(list[i]))) return i;
        const found = list.findIndex((row) => row.label === label && wanted(row));
        return found < 0 ? i : found;
    };

    const render = () => {
        const old = rows;
        const openGroup = state.group >= 0 && old[state.group] ? old[state.group] : null;
        const oldList = openGroup ? openGroup.items : old;
        const focusLabel = oldList[state.focus] ? oldList[state.focus].label : undefined;
        rows = collect();
        if (openGroup) state.group = follow(rows, openGroup.label, state.group, isGroup);
        const list = state.group >= 0 && isGroup(rows[state.group]) ? rows[state.group].items : rows;
        state.focus = follow(list, focusLabel, state.focus, () => true);
        if (state.group >= rows.length || (state.group >= 0 && !isGroup(rows[state.group]))) state = { group: -1, focus: 0 };
        const group = state.group >= 0 ? rows[state.group] : null;
        const count = group ? group.items.length : rows.length;
        state.focus = Math.max(0, Math.min(state.focus, count - 1));
        UI.render(group ? groupView(group) : groupsView(), root);
        root.classList.toggle('pl-menu-choices', !!group);
        const focused = root.querySelector('.focus');
        if (focused && focused.scrollIntoView) focused.scrollIntoView({ block: 'nearest' });
    };

    const open = (index) => {
        const group = rows[index];
        const active = group.items.findIndex((entry) => entry.active);
        state = { group: index, focus: Math.max(0, active) };
    };

    // 'close' when the menu should close; every key is the menu's.
    const key = (code) => {
        const inGroup = state.group >= 0;
        const list = inGroup ? rows[state.group].items : rows;
        if (Keys.isBack(code) || (inGroup && code === Keys.LEFT)) {
            if (!inGroup) return 'close';
            state = { group: -1, focus: state.group };
        } else if (code === Keys.UP || code === Keys.DOWN) {
            const moved = Focus.step(state.focus, list.length, code, 'column');
            if (moved.index !== undefined) state.focus = moved.index;
        } else if (code === Keys.ENTER || (!inGroup && code === Keys.RIGHT)) {
            const row = list[state.focus];
            if (isGroup(row)) open(state.focus);
            else if (row && row.run && code === Keys.ENTER) run(row.run);
        }
        return true;
    };

    return {
        reset: () => {
            state = { group: -1, focus: 0 };
            rows = [];
        },
        render,
        key,
    };
};
