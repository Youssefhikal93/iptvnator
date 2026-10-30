// The TV guide grid (#6): channels as rows, programmes along a time line.
// Reads programmes only through GuideData (browser state.guide).
window.TvGuide = function (hooks) {
    'use strict';

    var ROWS = 9;
    var view = GuideView(document.getElementById('guide'));
    var state = null;
    var queue = [];
    var pending = [];
    var timer = null;

    function programmes(index) {
        var range = GuideTime.limits(Date.now(), state.channels[index]);
        return state.guide.peek(state.channels[index], range.from, range.to);
    }

    function renderRow(index) {
        if (index < state.first || index >= state.first + ROWS || index >= state.channels.length) return;
        view.row({ channel: state.channels[index], index: index, selected: index === state.index, sourceId: state.sourceId,
            programmes: programmes(index), time: state.time, start: state.start });
    }

    function render() {
        state.first = GuideTime.firstRow(state.index, state.channels.length, ROWS);
        view.times(state.start);
        view.clearRows();
        for (var i = state.first; i < Math.min(state.channels.length, state.first + ROWS); i++) renderRow(i);
        if (!state.channels.length) view.empty();
    }

    function wanted(index) {
        var channel = state.channels[index];
        if (!channel || programmes(index) !== undefined) return;
        var loading = pending.some(function (request) { return request.guide === state.guide && request.channel === channel; });
        if (!loading) queue.push({ guide: state.guide, channel: channel });
    }

    function finished(request) {
        pending.splice(pending.indexOf(request), 1);
        if (state && !state.suspended && request.guide === state.guide) {
            var index = state.channels.indexOf(request.channel);
            if (index >= 0) renderRow(index);
        }
        pump();
    }

    function fetchRow(request) {
        var range = GuideTime.limits(Date.now(), request.channel);
        pending.push(request);
        request.guide.programmes(request.channel, range.from, range.to).then(function () {
            finished(request);
        });
    }

    function pump() {
        while (state && !state.suspended && pending.length < 3 && queue.length) fetchRow(queue.shift());
    }

    // Replace stale wants on every move; visible focus beats speculative rows.
    function wantRows() {
        queue = [];
        if (!state.channels.length) return;
        wanted(state.index);
        for (var i = state.first; i < Math.min(state.channels.length, state.first + 2 * ROWS); i++) {
            if (i !== state.index) wanted(i);
        }
        pump();
    }

    function startTimer() {
        clearInterval(timer);
        timer = setInterval(function () {
            render();
            wantRows();
        }, 30000);
    }

    function open(options) {
        var now = Date.now();
        state = { guide: options.guide, sourceId: options.sourceId, channels: options.channels, index: options.index,
            time: now, start: Math.floor(now / GuideTime.step) * GuideTime.step, first: 0, suspended: false, popup: false };
        view.open(options.title);
        render();
        wantRows();
        startTimer();
    }

    function close() {
        var channel = state.channels[state.index];
        state = null;
        queue = [];
        clearInterval(timer);
        view.hide();
        hooks.close(channel);
    }

    function moveChannel(step) {
        state.index = Math.max(0, Math.min(state.channels.length - 1, state.index + step));
        state.time = GuideTime.clamp(state.time, Date.now(), state.channels[state.index]);
        state.start = GuideTime.windowStart(state.start, state.time, Date.now(), state.channels[state.index]);
        render();
        wantRows();
    }

    function moveTime(direction) {
        var list = programmes(state.index);
        if (list === undefined) return;
        var next = GuideTime.adjacent(list, state.time, direction);
        var current = GuideTime.at(list, state.time);
        var time = next ? (direction > 0 ? next.start : next.end - 1) :
            current ? (direction > 0 ? current.end : current.start - 1) : state.time + direction * GuideTime.step;
        state.time = GuideTime.clamp(time, Date.now(), state.channels[state.index]);
        state.start = GuideTime.windowStart(state.start, state.time, Date.now(), state.channels[state.index]);
        render();
        wantRows();
    }

    function activate() {
        var list = programmes(state.index);
        var programme = list && GuideTime.at(list, state.time);
        if (!programme) return;
        if (programme.start <= Date.now() && Date.now() < programme.end) {
            state.suspended = true;
            queue = [];
            clearInterval(timer);
            view.hide();
            hooks.play(state.channels[state.index]);
        } else {
            state.popup = programme;
            view.details(programme, CatchUp.playable(state.channels[state.index], programme), remindable(programme));
        }
    }

    // null for a programme that started, else whether a reminder is set.
    function remindable(programme) {
        return programme.start > Date.now() ? Reminders.has(state.sourceId, state.channels[state.index], programme) : null;
    }

    function toggleReminder() {
        var channel = state.channels[state.index];
        if (Reminders.has(state.sourceId, channel, state.popup)) Reminders.remove(state.sourceId, channel, state.popup);
        else Reminders.add(state.sourceId, channel, state.popup);
        view.details(state.popup, false, remindable(state.popup));
        renderRow(state.index);
    }

    function key(code) {
        if (state.popup) {
            if (code === Keys.ENTER && CatchUp.playable(state.channels[state.index], state.popup)) {
                var programme = state.popup;
                state.popup = false;
                state.catchUp = true;
                state.suspended = true;
                queue = [];
                clearInterval(timer);
                view.closeDetails();
                view.hide();
                hooks.catchUp(state.channels[state.index], programme);
                return true;
            }
            if (code === Keys.ENTER && remindable(state.popup) !== null) return toggleReminder() || true;
            if (Keys.isBack(code) || code === Keys.ENTER) {
                state.popup = false;
                view.closeDetails();
            }
            return true;
        }
        if (Keys.isBack(code)) close();
        else if (!state.channels.length) return true;
        else if (code === Keys.UP || code === Keys.DOWN) moveChannel(code === Keys.UP ? -1 : 1);
        else if (code === Keys.CH_UP || code === 33) moveChannel(-ROWS);
        else if (code === Keys.CH_DOWN || code === 34) moveChannel(ROWS);
        else if (code === Keys.LEFT || code === Keys.RIGHT) moveTime(code === Keys.LEFT ? -1 : 1);
        else if (code === Keys.ENTER) activate();
        else if (code === Keys.BLUE) {
            queue = [];
            clearInterval(timer);
            hooks.search(function () { if (state && !state.suspended) { render(); wantRows(); startTimer(); } });
        }
        else if (code === Keys.YELLOW) hooks.reminders(function () { if (state && !state.suspended) render(); });
        return true;
    }

    return {
        open: open,
        isOpen: function () { return !!state; },
        key: key,
        close: close,
        resume: function (channel) {
            if (!state || !state.suspended) return;
            var index = hooks.indexOf(state.channels, channel);
            if (index >= 0 && !state.catchUp) state.index = index;
            state.catchUp = false;
            state.suspended = false;
            view.show();
            render();
            wantRows();
            startTimer();
        },
    };
};
