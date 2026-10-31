// Multi-view owns tile lifetimes; the app keeps routing PINs and the channel list.
window.MultiView = function (hooks) {
    'use strict';

    var root = document.createElement('div');
    root.id = 'multi-view';
    document.getElementById('player').appendChild(root);
    var active = false;
    var state = { tiles: [], focus: 0 };
    var slots = [];
    var serial = 0;
    var generation = 0;
    var nowTimer = null;
    var menu = MultiViewMenu({
        channel: channel,
        engine: function () { return slots[state.focus].engine; },
        refused: function () { return slots[state.focus].status === 'refused'; },
        retry: retry,
        pick: hooks.pick,
        leave: leave,
        layout: setLayout,
        main: function () { state = MultiViewState.main(state); sync(); focus(); },
        remove: function () { state = MultiViewState.put(state, null); sync(); focus(); },
    });

    function channel() { return state.tiles[state.focus]; }
    function sourceId() { return Sources.current().id; }
    function save() { MultiViewStore.save(sourceId(), state); }

    function render() {
        var html = UI.html;
        UI.render(html`${slots.map(function (slot, index) {
            return html`<div key=${slot.id} data-tile=${index} class=${'mv-tile' + (index === state.focus ? ' focused' : '')}>
                <video data-slot=${slot.id} playsinline></video>
                ${slot.channel ? html`<div class="mv-label">${I18n.isolate(slot.channel.name)}
                    ${index === state.focus && slot.now ? html`<div class="mv-now">${I18n.isolate(slot.now)}</div>` : ''}</div>`
                    : html`<div class="mv-empty">${I18n.t('multi.add')}</div>`}
                ${slot.status === 'loading' ? html`<div class="mv-status">${I18n.t('common.loadingEllipsis')}</div>` : ''}
                ${slot.status === 'refused' ? html`<div class="mv-status">${I18n.t('multi.refused')}<div class="mv-retry">${I18n.t('multi.retry')}</div></div>` : ''}
            </div>`;
        })}`, root);
        root.className = 'mv-layout-' + state.tiles.length;
    }

    function start(slot) {
        var video = root.querySelector('[data-slot="' + slot.id + '"]');
        video.muted = slots.indexOf(slot) !== state.focus;
        slot.engine = MultiViewEngine(video, slot.request, function (status) {
            slot.status = status;
            if (active) render();
        });
    }

    function sync() {
        var old = slots.slice();
        slots = state.tiles.map(function (next) {
            var index = old.findIndex(function (slot) { return slot && slot.channel === next; });
            if (index >= 0) {
                var kept = old[index];
                old[index] = null;
                return kept;
            }
            return { id: ++serial, channel: next, request: next ? hooks.request(next) : null, status: '', engine: null, now: '' };
        });
        old.forEach(function (slot) { if (slot && slot.engine) slot.engine.stop(); });
        render();
        slots.forEach(function (slot) { if (slot.channel && !slot.engine) start(slot); });
        save();
    }

    function focus() {
        clearTimeout(nowTimer);
        slots.forEach(function (slot, index) {
            slot.now = '';
            root.querySelector('[data-slot="' + slot.id + '"]').muted = index !== state.focus;
        });
        var slot = slots[state.focus];
        if (slot.channel) hooks.focus(slot.channel);
        var mine = ++generation;
        var until = Date.now() + 5000;
        if (slot.request && slot.request.programmes && Prefs.get('programmeGuide')) {
            slot.request.programmes().then(function (programmes) {
                if (!active || mine !== generation || Date.now() >= until) return;
                slot.now = programmes && programmes.now ? programmes.now.title : '';
                render();
            }).catch(function () { Log.error('MULTI-VIEW programme unavailable'); });
        }
        nowTimer = setTimeout(function () { slot.now = ''; if (active) render(); }, 5000);
        render();
    }

    function begin(next) {
        Player.suspend();
        active = true;
        document.getElementById('player').classList.add('multi-on');
        state = next;
        sync();
        focus();
    }

    function setLayout(count) {
        if (!active) return begin(MultiViewState.layout({ tiles: [hooks.current()], focus: 0 }, count));
        state = MultiViewState.layout(state, count);
        sync();
        focus();
    }

    function stop() {
        active = false;
        generation++;
        clearTimeout(nowTimer);
        menu.close();
        slots.forEach(function (slot) { if (slot.engine) slot.engine.stop(); });
        slots = [];
        state = { tiles: [], focus: 0 };
        UI.render(null, root);
        document.getElementById('player').classList.remove('multi-on');
    }

    function leave() {
        var selected = channel() || state.tiles.filter(Boolean)[0];
        stop();
        if (selected) hooks.fullscreen(selected);
        else hooks.close();
    }

    function add(selected) {
        if (!active || !selected) return;
        if (!KidsProfile.allows(sourceId(), 'live', selected)) return;
        if (!ParentalLock.allows(sourceId(), 'live', selected)) {
            return PinPad.open('unlock', function () { add(selected); });
        }
        state = MultiViewState.put(state, selected);
        sync();
        focus();
    }

    function resume() {
        var saved = MultiViewStore.read(sourceId());
        if (!saved) return;
        Player.dismissMenu();
        var mine = ++generation;
        hooks.catalogue().then(function (channels) {
            if (mine !== generation) return;
            var wanted = saved.tiles.map(function (id) {
                return channels.find(function (entry) { return Library.keyOf('live', entry) === id; }) || null;
            });
            function restore() {
                if (mine === generation) begin({ tiles: wanted, focus: 0 });
            }
            // Ask before replacing playback or the saved layout; cancelling keeps both.
            var locked = wanted.some(function (entry) { return entry && !ParentalLock.allows(sourceId(), 'live', entry); });
            if (locked) PinPad.open('unlock', restore);
            else restore();
        }).catch(function () { Log.error('MULTI-VIEW resume unavailable'); });
    }

    function retry() {
        var slot = slots[state.focus];
        slot.engine.stop();
        slot.engine = null;
        start(slot);
    }

    function key(code) {
        if (Menu.isOpen()) return Menu.onKey(code);
        if (menu.isOpen()) return menu.key(code);
        if (Keys.isBack(code)) leave();
        else if (code === Keys.YELLOW || code === Keys.INFO) menu.open();
        else if (code === Keys.ENTER) Keys.press(menu.options, menu.open, Keys.focusedIn('multi-view'));
        else if (code === Keys.CH_UP || code === Keys.CH_DOWN) {
            if (channel()) hooks.zap(code === Keys.CH_UP ? 1 : -1);
        } else if ([Keys.LEFT, Keys.RIGHT, Keys.UP, Keys.DOWN].indexOf(code) >= 0) {
            state = MultiViewState.move(state, code);
            focus();
        } else if (code === Keys.STOP) hooks.close();
        return true;
    }

    return {
        open: menu.layout,
        resume: resume,
        stop: stop,
        add: add,
        key: key,
        closeMenu: menu.close,
        active: function () { return active; },
        enforceLocks: function () {
            if (!active) return;
            state.tiles = state.tiles.map(function (entry) { return entry && hooks.allows(entry) ? entry : null; });
            sync();
            focus();
        },
    };
};
