// Sync subtitles: a bar over the playing video for a downloaded subtitle
// that runs early or late. The bar shows the next line; OK when that line is
// heard moves every line to it, ◀ ▶ fine-tune by 0.1 s and ▲ ▼ by 1 s while
// the video plays, OK keeps and Return puts the timing back. Hold OK lists
// every line of the file to pick one that is easy to recognise; the video
// then goes back to just before it and the bar waits for it.
//
// SubtitleSync.create(hooks): hooks.cues(), offset(), scale(), setOffset(ms)
// (shows it, unsaved), keep() (saves), position(), jump(ms), play(), pause(),
// paused(), hideControls(), root (the element the bar is drawn in; none in\n// unit tests).
window.SubtitleSync = (function () {
    'use strict';

    var LIMIT = 600000; // The furthest a subtitle may be moved, either way.
    var REACTION_MS = 250; // OK lands a moment after the line starts.
    var LEAD_MS = 15000; // A picked line is played from this long before it shows.
    var MISSED_MS = 20000; // A line not heard by then makes way for the next.
    var PAGE = 8;
    var ROWS = 2; // Lines drawn on each side of the focused one when choosing.

    function clamp(ms) { return Math.max(-LIMIT, Math.min(LIMIT, Math.round(ms))); }

    // Where a cue shows in the video with this timing.
    function shows(cue, offset, scale) { return cue.start * (scale || 1) + (offset || 0); }

    // The first line still to show after time.
    function upcoming(cues, time, offset, scale) {
        for (var i = 0; i < cues.length; i++) if (shows(cues[i], offset, scale) > time) return i;
        return Math.max(0, cues.length - 1);
    }

    // The timing that makes cue start when OK was pressed (heard, in video ms).
    function aligned(cue, heard, scale) { return clamp(heard - REACTION_MS - cue.start * (scale || 1)); }

    // Where to play from so a picked line comes up soon.
    function startAt(cue, offset, scale) { return Math.max(0, shows(cue, offset, scale) - LEAD_MS); }

    // A release name without its episode number, so the next episode of the
    // same release can be recognised: "Show.S01E02.1080p-GRP" -> "show 1080p grp".
    function family(name) {
        return String(name || '').toLowerCase()
            .replace(/s\d{1,2}\s*[ex]\s*\d{1,3}/g, ' ').replace(/\b\d{1,2}x\d{1,3}\b/g, ' ')
            .replace(/\b(episode|ep|e)\s*\d{1,3}\b/g, ' ').replace(/[^a-z0-9؀-ۿ]+/g, ' ').trim();
    }

    function shift(ms) {
        if (!ms) return I18n.t('sync.inSync');
        return I18n.t(ms > 0 ? 'sync.later' : 'sync.earlier', { s: (Math.abs(ms) / 1000).toFixed(1) });
    }

    function oneLine(text) { return String(text || '').replace(/\s+/g, ' '); }

    function create(hooks) {
        var state = null; // 'listen', 'tuned' or 'choose'
        var target = 0;
        var focus = 0;
        var before = 0; // The timing when the bar opened, for Return.
        var wasPaused = false;
        var bar = null;

        function el(tag, className, text) {
            var node = document.createElement(tag);
            if (className) node.className = className;
            if (text !== undefined) node.textContent = text;
            return node;
        }

        function render() {
            if (!hooks.root) return;
            if (!bar) {
                bar = el('div', 'hidden');
                bar.id = 'pl-sync';
                hooks.root.appendChild(bar);
            }
            bar.className = state ? 'sync-' + state : 'hidden';
            bar.innerHTML = '';
            if (!state) return;
            var cues = hooks.cues();
            var head = el('div', 'sync-head');
            head.appendChild(el('span', 'sync-title', I18n.t(state === 'choose' ? 'sync.choose' : 'opensubs.syncOpen')));
            head.appendChild(el('span', 'sync-shift', shift(hooks.offset())));
            bar.appendChild(head);
            if (state === 'choose') {
                var list = el('div', 'sync-lines');
                for (var i = Math.max(0, focus - ROWS); i <= Math.min(cues.length - 1, focus + ROWS); i++) {
                    var row = el('div', 'sync-line' + (i === focus ? ' focus' : ''), oneLine(cues[i].text));
                    row.dir = 'auto';
                    list.appendChild(row);
                }
                bar.appendChild(list);
            } else if (cues[target]) {
                bar.appendChild(el('div', 'sync-ask', I18n.t(state === 'listen' ? 'sync.listen' : 'sync.tuned')));
                var line = el('div', 'sync-target', oneLine(cues[target].text));
                line.dir = 'auto';
                bar.appendChild(line);
            }
            bar.appendChild(el('div', 'sync-keys', I18n.t('sync.keys.' + state)));
        }

        function move(ms) {
            hooks.setOffset(clamp(hooks.offset() + ms));
            if (state === 'listen') state = 'tuned';
            render();
        }

        // Playing and pausing bring the player controls back; the bar keeps them away.
        function play() {
            hooks.play();
            if (hooks.hideControls) hooks.hideControls();
        }

        function pause() {
            hooks.pause();
            if (hooks.hideControls) hooks.hideControls();
        }

        // ending: playback is going away, so nothing is played again.
        function close(keep, ending) {
            if (!state) return;
            if (state === 'choose' && !wasPaused && !ending) play();
            if (keep) hooks.keep();
            else hooks.setOffset(before);
            state = null;
            Keys.cancel();
            render();
        }

        function listenFor(index) {
            target = index;
            state = 'listen';
            render();
        }

        function open(mode) {
            var cues = hooks.cues();
            if (!cues.length) return;
            before = hooks.offset();
            target = upcoming(cues, hooks.position(), before, hooks.scale());
            if (mode === 'choose') choose();
            else listenFor(target);
        }

        function choose() {
            wasPaused = hooks.paused();
            pause();
            focus = target;
            state = 'choose';
            render();
        }

        // OK in the line list: play from just before the line and wait for it.
        function pick() {
            var cue = hooks.cues()[focus];
            hooks.jump(startAt(cue, hooks.offset(), hooks.scale()));
            play();
            listenFor(focus);
        }

        // OK heard the line: every line moves so it starts then. The line is
        // the one shown at the press, even if the bar moved on before letting go.
        function align(index, at) {
            var cue = hooks.cues()[index];
            if (!cue) return;
            hooks.setOffset(aligned(cue, at, hooks.scale()));
            state = 'tuned';
            render();
        }

        function chooseKey(code) {
            var last = hooks.cues().length - 1;
            if (code === Keys.UP || code === Keys.DOWN) focus += code === Keys.UP ? -1 : 1;
            else if (code === Keys.CH_UP || code === Keys.CH_DOWN) focus += code === Keys.CH_UP ? -PAGE : PAGE;
            else if (code === Keys.ENTER) {
                pick();
                return true;
            } else if (Keys.isBack(code)) {
                state = 'listen';
                if (!wasPaused) play();
            } else return true;
            focus = Math.max(0, Math.min(last, focus));
            render();
            return true;
        }

        function key(code) {
            if (!state) return false;
            // Stop closes the bar without saving and still stops the video.
            if (code === Keys.STOP) {
                close(false);
                return false;
            }
            if (state === 'choose') return chooseKey(code);
            if (code === Keys.ENTER) {
                // The moment counts from the press, not from letting go.
                var at = hooks.position();
                var line = target;
                Keys.press(function () {
                    if (state === 'listen') align(line, at);
                    else close(true);
                }, choose, function () { return bar; });
            } else if (code === Keys.LEFT || code === Keys.RIGHT) move(code === Keys.LEFT ? -100 : 100);
            else if (code === Keys.UP || code === Keys.DOWN) move(code === Keys.UP ? 1000 : -1000);
            else if (Keys.isBack(code)) close(false);
            // Play and pause still work; every other key stays with the bar.
            else return code !== Keys.PLAY_PAUSE && code !== Keys.PLAY && code !== Keys.PAUSE;
            return true;
        }

        // Every 100 ms while the video plays: a line not heard in time makes
        // way for the next one, and the bar follows.
        function tick() {
            if (state !== 'listen') return;
            var cues = hooks.cues();
            var due = cues[target] && shows(cues[target], hooks.offset(), hooks.scale()) + MISSED_MS;
            if (!due || hooks.position() <= due) return;
            // The last line has nothing after it: the bar stays as it is.
            var next = upcoming(cues, hooks.position(), hooks.offset(), hooks.scale());
            if (next !== target) listenFor(next);
        }

        return {
            open: open,
            key: key,
            tick: tick,
            isOpen: function () { return !!state; },
            state: function () { return state; },
            // Playback ended or changed: nothing is saved.
            stop: function () { if (state) close(false, true); },
        };
    }

    return { create: create, upcoming: upcoming, aligned: aligned, startAt: startAt, family: family, REACTION_MS: REACTION_MS };
})();
