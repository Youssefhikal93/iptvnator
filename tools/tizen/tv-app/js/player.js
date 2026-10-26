// Full-screen playback with desktop-style controls. A request lists the
// players to try in order (`sources: [{ via, url }]`): live TV uses mpegts.js
// (as IPTVnator's web player does), then hls.js, then Samsung AVPlay; movies
// and episodes (mp4/mkv) use AVPlay, then the <video> element. Only one stream
// is open at a time: single-connection accounts answer 503 while another
// stream is open, so release() always closes the previous one first.
//
// Request fields: live, title, subtitle, id (stable key for saved progress),
// sources, and for episodes an optional episodes list (see player-series.js).
// Live: optional programmes() (see player-epg.js). Movies and episodes:
// optional resume (true / false) skips the Resume prompt.
window.Player = (function () {
    'use strict';

    var ATTEMPT_TIMEOUT_MS = 20000;
    var BUSY_RETRY_MS = 2000;
    var HIDE_AFTER_MS = 5000;
    var TICK_MS = 500;
    var SAVE_EVERY_MS = 10000;
    var SEEK_COMMIT_MS = 700;
    var SEEK_STEPS_S = [10, 30, 60]; // repeated presses accelerate
    var SPEEDS_HTML = [0.5, 1, 1.25, 1.5, 2];
    var SPEEDS_AV = [1, 2];

    var KEY = Keys;

    function $(id) {
        return document.getElementById(id);
    }
    var playerEl = $('player');
    var video = $('video');
    var ui = {
        subs: $('pl-subs'),
        status: $('pl-status'),
        statusText: $('pl-status-text'),
        controls: $('pl-controls'),
        title: $('pl-title'),
        subtitle: $('pl-subtitle'),
        speed: $('pl-speed'),
        live: $('pl-live'),
        seekbox: $('pl-seekbox'),
        bar: $('pl-bar'),
        fill: $('pl-fill'),
        target: $('pl-target'),
        state: $('pl-state'),
        cur: $('pl-cur'),
        total: $('pl-total'),
        jump: $('pl-jump'),
        hint: $('pl-hint'),
        menu: $('pl-menu'),
        resume: $('pl-resume'),
        resumeTitle: $('pl-resume-title'),
        resumeYes: $('pl-resume-yes'),
        resumeNo: $('pl-resume-no'),
    };

    var lib = null;
    var usingAv = false;
    var session = 0;
    var current = null;
    var ready = false; // a stream is playing
    var channelListOpen = false;
    var box = null; // preview rectangle in screen pixels; null is full screen
    var started = false; // the resume prompt is settled; progress may be saved
    var ended = false;
    var playbackError = false;
    var errorFocus = 0;
    var speed = 1;
    var hideAt = 0;
    var tickTimer = null;
    var subsTimer = null;
    var lastSave = 0;
    var avAudio = -1;
    var avText = -1;
    var avSeekPending = false;
    var avSeekSerial = 0;
    var seek = { target: null, origin: 0, count: 0, dir: 0, last: 0, timer: null, holdPos: null, holdUntil: 0 };
    var menu = { open: false, focus: 0, actions: [] };
    var resume = { open: false, focus: 0, position: 0, failed: false };
    var restoration = PlayerResume({
        position: position,
        seekTo: engineSeekTo,
        pending: seekPending,
        ready: canSeek,
        timeout: resumeFailed,
    });
    var epg = PlayerEpg();
    var freeze = PlayerFreeze(video, $('pl-freeze'));
    // A live stream that drops reopens itself with backoff (player-reconnect.js).
    var reconnect = PlayerReconnect({
        position: position,
        paused: isPaused,
        begin: function () {
            freeze.capture();
            release();
            showStatus(heading(current) + '\nReconnecting…', false);
        },
        open: function (done) {
            start(current, done);
        },
        giveUp: function (reason) {
            Log.error('RECONNECT GAVE UP ' + current.title + ' (' + reason + ')');
            release();
            freeze.clear();
            showStatus(heading(current) + '\nThe stream stopped and could not reconnect.', true);
        },
    });
    var series = PlayerSeries({
        current: function () {
            return current;
        },
        position: position,
        duration: duration,
        seekTo: seekTo,
        isEnded: function () {
            return ended;
        },
        play: play,
        openMenu: openMenu,
        showControls: showControls,
    });

    function avplay() {
        return window.webapis && window.webapis.avplay;
    }

    function displayRect() {
        return box || { x: 0, y: 0, w: 1920, h: 1080 };
    }

    // Draws the stream in the live preview box (see live-preview.js) or full
    // screen. The same stream keeps playing, so switching never reopens it.
    function setBox(rect) {
        box = rect || null;
        playerEl.classList.toggle('preview', !!box);
        var at = displayRect();
        playerEl.style.left = box ? at.x + 'px' : '';
        playerEl.style.top = box ? at.y + 'px' : '';
        playerEl.style.width = box ? at.w + 'px' : '';
        playerEl.style.height = box ? at.h + 'px' : '';
        if (usingAv && avplay()) {
            try {
                avplay().setDisplayRect(at.x, at.y, at.w, at.h);
            } catch (e) {
                // Not prepared yet; viaAvPlay sets the rectangle itself.
            }
        }
    }

    function wait(ms) {
        return new Promise(function (resolve) {
            setTimeout(resolve, ms);
        });
    }

    function el(tag, cls, text) {
        var node = document.createElement(tag);
        if (cls) node.className = cls;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function fmt(ms) {
        var s = Math.max(0, Math.floor(ms / 1000));
        var h = Math.floor(s / 3600);
        var m = Math.floor((s % 3600) / 60);
        var sec = s % 60;
        var two = function (n) {
            return (n < 10 ? '0' : '') + n;
        };
        return h ? h + ':' + two(m) + ':' + two(sec) : m + ':' + two(sec);
    }

    // ---- Engine access (AVPlay or <video>) --------------------------------

    function position() {
        try {
            return usingAv ? avplay().getCurrentTime() : video.currentTime * 1000;
        } catch (e) {
            return 0;
        }
    }

    function duration() {
        try {
            var d = usingAv ? avplay().getDuration() : video.duration * 1000;
            return isFinite(d) && d > 0 ? d : 0;
        } catch (e) {
            return 0;
        }
    }

    function isPaused() {
        try {
            return usingAv ? avplay().getState() === 'PAUSED' : video.paused;
        } catch (e) {
            return false;
        }
    }

    function pause() {
        try {
            if (usingAv) avplay().pause();
            else video.pause();
        } catch (e) {
            // Not playing.
        }
    }

    function unpause() {
        try {
            if (usingAv) avplay().play();
            else video.play().catch(function () {});
        } catch (e) {
            // Not ready.
        }
    }

    function seekTo(ms) {
        if (!current || current.live) return;
        if (ms > 0) restoration.start(ms);
        else {
            restoration.cancel();
            engineSeekTo(0);
        }
    }

    function seekPending() {
        return usingAv ? avSeekPending : video.seeking;
    }

    function canSeek(ms) {
        if (!ready) return false;
        if (usingAv) {
            var state = avplay().getState();
            return state === 'PLAYING' || state === 'PAUSED';
        }
        if (video.readyState < 3) return false;
        if (duration() > 0) return true;
        for (var i = 0; i < video.seekable.length; i++) {
            if (video.seekable.start(i) * 1000 <= ms && video.seekable.end(i) * 1000 >= ms) return true;
        }
        return false;
    }

    function engineSeekTo(ms) {
        var serial = ++avSeekSerial;
        function settled() {
            if (serial === avSeekSerial) avSeekPending = false;
        }
        try {
            if (usingAv) {
                avSeekPending = true;
                avplay().seekTo(Math.floor(ms), settled, settled);
            } else video.currentTime = ms / 1000;
        } catch (e) {
            settled(); // The confirmation loop retries when the engine is seekable.
        }
    }

    function applySpeed(value) {
        speed = value;
        try {
            if (usingAv) avplay().setSpeed(value);
            else video.playbackRate = value;
        } catch (e) {
            speed = 1;
        }
        ui.speed.textContent = speed + '×';
        ui.speed.classList.toggle('hidden', speed === 1);
    }

    // ---- Saved progress ---------------------------------------------------

    function saveProgress() {
        if (!started || !current || current.live || !current.id || progressBlocked()) return;
        var pos = position() / 1000;
        var dur = duration() / 1000;
        if (!(dur > 0)) return;
        if (ended) Progress.finish(current.id, dur);
        else if (!Progress.save(current.id, pos, dur)) return;
        lastSave = Date.now();
    }

    function progressBlocked() {
        return resume.open || seek.target !== null || restoration.blocked() || seekPending();
    }

    // ---- Overlay ----------------------------------------------------------

    function canHide() {
        return !isPaused() && !menu.open && !resume.open && !ended && !seek.timer && !series.busy();
    }

    function hideControls() {
        ui.controls.classList.add('hidden');
        playerEl.classList.remove('controls-on');
        series.onHide();
    }

    // The tick hides the overlay once the deadline passes; while paused (or a
    // menu is open) the deadline keeps moving, so it hides 5 s after resuming.
    function scheduleHide() {
        hideAt = Date.now() + HIDE_AFTER_MS;
    }

    function hintHtml() {
        var parts = current.live
            ? [['OK', 'Info'], ['▲▼', 'Channel'], ['◀', 'Channel list'], ['PRE-CH / Green', 'Previous channel'], ['Yellow', 'Audio & subtitles']]
            : [['OK', 'Pause'], ['◀ ▶', 'Seek'], ['▲', 'Audio, subtitles, speed'], ['▼', current.episodes ? 'Episodes & more' : 'More']];
        parts.push(['Return', 'Close']);
        return parts;
    }

    function renderHint() {
        ui.hint.textContent = '';
        hintHtml().forEach(function (pair) {
            var item = el('span');
            item.appendChild(el('b', '', pair[0]));
            item.appendChild(document.createTextNode(pair[1]));
            ui.hint.appendChild(item);
        });
    }

    function render() {
        if (!current || !ready) return;
        var live = current.live;
        ui.seekbox.classList.toggle('live', live);
        ui.live.classList.toggle('hidden', !live);
        var paused = isPaused();
        ui.state.textContent = ended ? '■' : paused ? '❚❚' : '▶';
        if (live) return epg.render();
        var dur = duration();
        var pos = position();
        if (seek.target !== null) pos = seek.target;
        else if (Date.now() < seek.holdUntil) pos = seek.holdPos;
        ui.cur.textContent = fmt(pos);
        ui.total.textContent = fmt(dur);
        var pct = dur > 0 ? Math.min(100, (pos / dur) * 100) : 0;
        ui.fill.style.width = pct + '%';
        ui.bar.style.setProperty('--pl-knob', pct + '%');
        if (seek.target !== null) {
            var basePct = dur > 0 ? Math.min(100, (seek.origin / dur) * 100) : 0;
            ui.target.style.left = Math.min(basePct, pct) + '%';
            ui.target.style.width = Math.abs(pct - basePct) + '%';
            var delta = seek.target - seek.origin;
            ui.jump.textContent = (delta < 0 ? '−' : '+') + fmt(Math.abs(delta)) + '  →  ' + fmt(seek.target);
        } else {
            ui.target.style.width = '0';
            ui.jump.textContent = '';
        }
    }

    function showControls() {
        if (!current || !ready || resume.open || channelListOpen) return;
        ui.controls.classList.remove('hidden');
        playerEl.classList.add('controls-on');
        render();
        scheduleHide();
        series.render(true);
    }

    function showStatus(text, error) {
        if (playbackError) return;
        ui.statusText.textContent = text;
        ui.status.classList.toggle('error', !!error);
        ui.status.classList.remove('hidden');
        $('pl-error-actions').classList.toggle('hidden', !error);
        if (error) {
            playbackError = true;
            errorFocus = 0;
            clearInterval(tickTimer);
            hideControls();
            ui.menu.classList.add('hidden');
            ui.resume.classList.add('hidden');
            $('pl-error-actions').children[0].focus();
        }
    }

    function hideStatus() {
        if (playbackError) return;
        ui.status.classList.add('hidden');
    }

    function errorKey(code) {
        if (Keys.isBack(code)) return false;
        if (code === KEY.LEFT || code === KEY.RIGHT) {
            errorFocus = code === KEY.LEFT ? 0 : 1;
            $('pl-error-actions').children[errorFocus].focus();
        } else if (code === KEY.ENTER) {
            if (errorFocus) return 'back';
            play(current);
        } else return code !== KEY.STOP;
        return true;
    }

    function heading(req) {
        return req.title + (req.subtitle ? '\n' + req.subtitle : '');
    }

    function tick() {
        render();
        if (!ended && !isPaused() && Date.now() - lastSave > SAVE_EVERY_MS) saveProgress();
        if (!canHide()) scheduleHide();
        else if (Date.now() >= hideAt) hideControls();
        series.render(!ui.controls.classList.contains('hidden'));
    }

    // ---- Seeking ----------------------------------------------------------

    function commitSeek() {
        clearTimeout(seek.timer);
        seek.timer = null;
        if (seek.target === null) return;
        seekTo(seek.target);
        seek.holdPos = seek.target;
        seek.holdUntil = Date.now() + 1200;
        seek.target = null;
        seek.count = 0;
        render();
        scheduleHide();
    }

    function nudge(dir) {
        restoration.cancel();
        var now = Date.now();
        var dur = duration();
        if (seek.target === null) {
            seek.origin = position();
            seek.count = 0;
        } else if (dir !== seek.dir || now - seek.last > SEEK_COMMIT_MS) seek.count = 0;
        var tier = seek.count >= 6 ? 2 : seek.count >= 3 ? 1 : 0;
        seek.count++;
        seek.dir = dir;
        seek.last = now;
        var base = seek.target === null ? seek.origin : seek.target;
        var next = base + dir * SEEK_STEPS_S[tier] * 1000;
        seek.target = Math.max(0, dur > 0 ? Math.min(next, dur - 1000) : next);
        clearTimeout(seek.timer);
        seek.timer = setTimeout(commitSeek, SEEK_COMMIT_MS);
        showControls();
    }

    // ---- Tracks, speed and stream info ------------------------------------

    function languageName(code) {
        if (!code) return '';
        try {
            return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) || code;
        } catch (e) {
            return String(code).toUpperCase();
        }
    }

    function avTracks(type) {
        var out = [];
        try {
            avplay()
                .getTotalTrackInfo()
                .forEach(function (track) {
                    if (track.type !== type) return;
                    var extra = {};
                    try {
                        extra = JSON.parse(track.extra_info) || {};
                    } catch (e) {
                        // No details.
                    }
                    out.push({ index: track.index, label: languageName(extra.language), extra: extra });
                });
        } catch (e) {
            // Not prepared.
        }
        out.forEach(function (track, i) {
            if (!track.label) track.label = 'Track ' + (i + 1);
        });
        return out;
    }

    function avCurrentIndex(type) {
        try {
            var found = avplay()
                .getCurrentStreamInfo()
                .filter(function (info) {
                    return info.type === type;
                })[0];
            return found ? found.index : -1;
        } catch (e) {
            return -1;
        }
    }

    function nativeTracks(list, kinds) {
        var out = [];
        if (!list) return out;
        for (var i = 0; i < list.length; i++) {
            if (kinds && kinds.indexOf(list[i].kind) === -1) continue;
            out.push(list[i]);
        }
        return out;
    }

    // Returns { audio: [{label, active, select}], text: [...] }.
    function getTracks() {
        var audio = [];
        var text = [];
        var i;
        if (usingAv) {
            if (avAudio < 0) avAudio = avCurrentIndex('AUDIO');
            avTracks('AUDIO').forEach(function (track) {
                audio.push({
                    label: track.label,
                    active: track.index === avAudio,
                    select: function () {
                        avplay().setSelectTrack('AUDIO', track.index);
                        avAudio = track.index;
                    },
                });
            });
            avTracks('TEXT').forEach(function (track) {
                text.push({
                    label: track.label,
                    active: track.index === avText,
                    select: function () {
                        avplay().setSelectTrack('TEXT', track.index);
                        try {
                            avplay().setSilentSubtitle(false);
                        } catch (e) {
                            // Older firmware.
                        }
                        avText = track.index;
                    },
                });
            });
            text.unshift({
                label: 'Off',
                active: avText < 0,
                select: function () {
                    try {
                        avplay().setSilentSubtitle(true);
                    } catch (e) {
                        // Older firmware.
                    }
                    avText = -1;
                    clearSubs();
                },
            });
        } else if (lib && window.Hls && lib instanceof Hls) {
            (lib.audioTracks || []).forEach(function (track, n) {
                audio.push({
                    label: track.name || languageName(track.lang) || 'Track ' + (n + 1),
                    active: lib.audioTrack === n,
                    select: function () {
                        lib.audioTrack = n;
                    },
                });
            });
            text.push({
                label: 'Off',
                active: lib.subtitleTrack < 0,
                select: function () {
                    lib.subtitleTrack = -1;
                },
            });
            (lib.subtitleTracks || []).forEach(function (track, n) {
                text.push({
                    label: track.name || languageName(track.lang) || 'Subtitle ' + (n + 1),
                    active: lib.subtitleTrack === n,
                    select: function () {
                        lib.subtitleDisplay = true;
                        lib.subtitleTrack = n;
                    },
                });
            });
        } else {
            nativeTracks(video.audioTracks).forEach(function (track, n) {
                audio.push({
                    label: track.label || languageName(track.language) || 'Track ' + (n + 1),
                    active: track.enabled,
                    select: function () {
                        nativeTracks(video.audioTracks).forEach(function (other) {
                            other.enabled = other === track;
                        });
                    },
                });
            });
            var subs = nativeTracks(video.textTracks, ['subtitles', 'captions']);
            if (subs.length) {
                text.push({
                    label: 'Off',
                    active: subs.every(function (t) {
                        return t.mode !== 'showing';
                    }),
                    select: function () {
                        subs.forEach(function (t) {
                            t.mode = 'disabled';
                        });
                    },
                });
            }
            for (i = 0; i < subs.length; i++) {
                (function (track, n) {
                    text.push({
                        label: track.label || languageName(track.language) || 'Subtitle ' + (n + 1),
                        active: track.mode === 'showing',
                        select: function () {
                            subs.forEach(function (t) {
                                t.mode = t === track ? 'showing' : 'disabled';
                            });
                        },
                    });
                })(subs[i], i);
            }
        }
        return { audio: audio, text: text };
    }

    function pick(obj, names) {
        for (var i = 0; i < names.length; i++) {
            for (var key in obj) {
                if (key.toLowerCase() === names[i] && obj[key]) return obj[key];
            }
        }
        return '';
    }

    function bitrate(bps) {
        bps = Number(bps);
        if (!bps) return '';
        return bps >= 1e6 ? (bps / 1e6).toFixed(1) + ' Mbps' : Math.round(bps / 1000) + ' kbps';
    }

    function streamInfoLines() {
        var lines = [];
        if (usingAv) {
            try {
                avplay()
                    .getCurrentStreamInfo()
                    .forEach(function (info) {
                        var extra = {};
                        try {
                            extra = JSON.parse(info.extra_info) || {};
                        } catch (e) {
                            return;
                        }
                        var parts = [];
                        if (info.type === 'VIDEO') {
                            var w = pick(extra, ['width']);
                            var h = pick(extra, ['height']);
                            if (w && h) parts.push(w + '×' + h);
                            parts.push(pick(extra, ['codec', 'fourcc']));
                            parts.push(bitrate(pick(extra, ['bit_rate', 'bitrate'])));
                            lines.push('Video  ' + parts.filter(Boolean).join(' · '));
                        } else if (info.type === 'AUDIO') {
                            parts.push(languageName(pick(extra, ['language'])));
                            parts.push(pick(extra, ['codec']));
                            var ch = pick(extra, ['channels']);
                            if (ch) parts.push(ch + ' ch');
                            var rate = pick(extra, ['sample_rate']);
                            if (rate) parts.push(rate + ' Hz');
                            parts.push(bitrate(pick(extra, ['bit_rate', 'bitrate'])));
                            lines.push('Audio  ' + parts.filter(Boolean).join(' · '));
                        }
                    });
            } catch (e) {
                // Not available.
            }
        } else {
            if (video.videoWidth) lines.push('Video  ' + video.videoWidth + '×' + video.videoHeight);
            if (lib && window.Hls && lib instanceof Hls && lib.levels && lib.levels[lib.currentLevel]) {
                lines.push('Bitrate  ' + bitrate(lib.levels[lib.currentLevel].bitrate));
            }
        }
        lines.push('Player  ' + (usingAv ? 'Samsung AVPlay' : lib ? (window.Hls && lib instanceof Hls ? 'hls.js' : 'mpegts.js') : 'HTML5 video'));
        return lines;
    }

    // ---- Menu -------------------------------------------------------------

    function renderMenu() {
        var tracks = getTracks();
        ui.menu.textContent = '';
        menu.actions = [];
        function head(text) {
            ui.menu.appendChild(el('div', 'pl-menu-head', text));
        }
        function item(label, active, action) {
            var node = el('div', 'pl-menu-item' + (active ? ' active' : ''));
            node.appendChild(el('span', 'dot', active ? '●' : ''));
            node.appendChild(el('span', '', label));
            node.setAttribute('data-i', menu.actions.length);
            menu.actions.push(action);
            ui.menu.appendChild(node);
        }
        head('Audio');
        if (tracks.audio.length) tracks.audio.forEach(function (t) { item(t.label, t.active, t.select); });
        else ui.menu.appendChild(el('div', 'pl-menu-empty', 'Only one audio track'));
        head('Subtitles');
        if (tracks.text.length > 1) tracks.text.forEach(function (t) { item(t.label, t.active, t.select); });
        else ui.menu.appendChild(el('div', 'pl-menu-empty', 'No subtitles available'));
        if (!current.live) {
            head('Playback speed');
            (usingAv ? SPEEDS_AV : SPEEDS_HTML).forEach(function (value) {
                item(value + '×', value === speed, function () {
                    applySpeed(value);
                });
            });
        }
        head('Stream info');
        streamInfoLines().forEach(function (line) {
            ui.menu.appendChild(el('div', 'pl-menu-info', line));
        });
        menu.focus = Math.max(0, Math.min(menu.focus, menu.actions.length - 1));
        var focused = ui.menu.querySelector('[data-i="' + menu.focus + '"]');
        if (focused) {
            focused.classList.add('focus');
            ui.menu.scrollTop = Math.max(0, focused.offsetTop - 300);
        }
    }

    function openMenu() {
        menu.open = true;
        menu.focus = 0;
        // Start on the active audio/subtitle choice that is not the default.
        ui.menu.classList.remove('hidden');
        renderMenu();
        showControls();
    }

    function closeMenu() {
        menu.open = false;
        ui.menu.classList.add('hidden');
        scheduleHide();
    }

    function menuKey(code) {
        if (Keys.isBack(code) || code === KEY.YELLOW || code === KEY.INFO) closeMenu();
        else if (code === KEY.UP || code === KEY.DOWN) {
            menu.focus += code === KEY.UP ? -1 : 1;
            renderMenu();
        } else if (code === KEY.ENTER) {
            var action = menu.actions[menu.focus];
            if (action) {
                try {
                    action();
                } catch (e) {
                    Log.error('TRACK select failed ' + (e && e.message));
                }
                renderMenu();
            }
        }
        return true; // The menu swallows every key.
    }

    // ---- Resume prompt ----------------------------------------------------

    function renderResume() {
        ui.resumeYes.className = resume.focus === 0 ? 'focus' : '';
        ui.resumeNo.className = resume.focus === 1 ? 'focus' : '';
    }

    function settleResume(fromSaved) {
        if (fromSaved && resume.failed) {
            var saved = Progress.of(current.id);
            if (!saved || !(saved.position > 0) || !isFinite(saved.position)) return;
            resume.position = Number(saved.position);
        }
        resume.open = false;
        resume.failed = false;
        ui.resume.classList.add('hidden');
        seekTo(fromSaved ? resume.position * 1000 : 0);
        started = true;
        ended = false;
        unpause();
        showControls();
    }

    function resumeFailed() {
        pause();
        closeMenu();
        hideControls();
        resume.open = true;
        resume.failed = true;
        resume.focus = 0;
        ui.resumeTitle.textContent = 'Could not restore saved progress.';
        ui.resumeYes.textContent = 'Retry';
        ui.resume.classList.remove('hidden');
        renderResume();
    }

    function maybePrompt() {
        started = false;
        if (current.live || !current.id) {
            started = !current.live;
            return;
        }
        var saved = Progress.of(current.id);
        var offer = Progress.resumeFrom(current.id, duration() / 1000);
        // Explicit Resume also accepts early progress from a detail page.
        if (!saved || saved.status === 'watched' || (current.resume !== true && !offer)) {
            started = true;
            return;
        }
        // The detail page already asked: `resume` true resumes, false starts over.
        if (current.resume !== undefined) {
            resume.position = saved.position;
            return settleResume(current.resume);
        }
        pause();
        resume.open = true;
        resume.focus = 0;
        resume.position = saved.position;
        ui.resumeTitle.textContent = current.title + (current.subtitle ? ' · ' + current.subtitle : '');
        ui.resumeYes.textContent = 'Resume from ' + fmt(saved.position * 1000);
        ui.resume.classList.remove('hidden');
        renderResume();
    }

    function resumeKey(code) {
        if (code === KEY.LEFT || code === KEY.RIGHT) {
            resume.focus = 1 - resume.focus;
            renderResume();
        } else if (code === KEY.ENTER || code === KEY.PLAY_PAUSE || code === KEY.PLAY) settleResume(resume.focus === 0);
        else if (Keys.isBack(code) || code === KEY.STOP) return false;
        return true;
    }

    // ---- Subtitles drawn for AVPlay ---------------------------------------

    function clearSubs() {
        clearTimeout(subsTimer);
        ui.subs.textContent = '';
    }

    function showSub(durationMs, text) {
        clearTimeout(subsTimer);
        ui.subs.textContent = String(text || '').replace(/<[^>]*>/g, '');
        if (Number(durationMs) > 0) subsTimer = setTimeout(clearSubs, Number(durationMs));
    }

    // ---- Playback chain ---------------------------------------------------

    // Closes whatever is playing; keeps the player screen.
    function release() {
        saveProgress();
        restoration.cancel();
        avSeekSerial++;
        avSeekPending = false;
        started = false;
        ready = false;
        ended = false;
        clearInterval(tickTimer);
        reconnect.unwatch();
        clearTimeout(seek.timer);
        seek.timer = null;
        seek.target = null;
        seek.holdUntil = 0;
        menu.open = false;
        resume.open = false;
        resume.failed = false;
        ui.menu.classList.add('hidden');
        ui.resume.classList.add('hidden');
        clearSubs();
        series.reset();
        epg.reset();
        avAudio = avText = -1;
        speed = 1;
        ui.speed.classList.add('hidden');
        if (lib) {
            try {
                lib.destroy();
            } catch (e) {
                // Already torn down.
            }
            lib = null;
        }
        video.onplaying = video.onerror = video.onwaiting = video.onended = null;
        video.ontimeupdate = null;
        video.pause();
        video.removeAttribute('src');
        video.load();
        video.playbackRate = 1;
        if (usingAv && avplay()) {
            try {
                avplay().stop();
            } catch (e) {
                // Not playing.
            }
            try {
                avplay().close();
            } catch (e) {
                // Not open.
            }
        }
        usingAv = false;
    }

    // Runs one playback attempt; resolves null when playing, else a reason.
    function attempt(start) {
        return new Promise(function (resolve) {
            var done = false;
            function finish(error) {
                if (done) return;
                done = true;
                clearTimeout(timer);
                resolve(error);
            }
            var timer = setTimeout(function () {
                finish('timeout');
            }, ATTEMPT_TIMEOUT_MS);
            try {
                start(finish);
            } catch (e) {
                finish(e.name || String(e));
            }
        });
    }

    function viaMpegts(url) {
        return function (finish) {
            if (!window.mpegts || !mpegts.isSupported()) return finish('mpegts.js unsupported');
            var player = (lib = mpegts.createPlayer({ type: 'mpegts', isLive: true, url: url }, { enableStashBuffer: false }));
            player.on(mpegts.Events.ERROR, function (type, detail, info) {
                var reason = type + ' ' + detail + ' ' + ((info && info.code) || '');
                if (ready && lib === player) streamLost(reason, 'Playback stopped.');
                finish(reason);
            });
            video.onplaying = function () {
                finish(null);
            };
            lib.attachMediaElement(video);
            lib.load();
            var played = lib.play();
            if (played && played.catch) played.catch(function () {});
        };
    }

    function viaHls(url) {
        return function (finish) {
            if (!window.Hls || !Hls.isSupported()) return finish('hls.js unsupported');
            var player = (lib = new Hls());
            player.on(Hls.Events.ERROR, function (event, data) {
                if (!data.fatal) return;
                var status = data.response && data.response.code;
                var reason = data.details + (status ? ' HTTP ' + status : '');
                if (ready && lib === player) streamLost(reason, 'Playback stopped.');
                finish(reason);
            });
            video.onplaying = function () {
                finish(null);
            };
            lib.loadSource(url);
            lib.attachMedia(video);
            video.play().catch(function () {});
        };
    }

    function viaAvPlay(url) {
        return function (finish) {
            var av = avplay();
            if (!av) return finish('AVPlay unavailable');
            usingAv = true;
            av.open(url);
            av.setListener({
                onbufferingstart: function () {
                    if (ready) showStatus('', false);
                },
                onbufferingcomplete: hideStatus,
                onerror: function (type) {
                    if (ready) streamLost(String(type), 'Playback stopped (' + type + ').');
                    finish(String(type));
                },
                onstreamcompleted: onCompleted,
                oncurrentplaytime: restoration.onTime,
                onsubtitlechange: showSub,
            });
            var at = displayRect();
            av.setDisplayRect(at.x, at.y, at.w, at.h);
            av.prepareAsync(
                function () {
                    try {
                        av.setSilentSubtitle(true);
                    } catch (e) {
                        // Older firmware.
                    }
                    av.play();
                    finish(null);
                },
                function (err) {
                    finish('prepare ' + (err && err.name));
                }
            );
        };
    }

    function viaVideo(url) {
        return function (finish) {
            video.onplaying = function () {
                finish(null);
            };
            video.onerror = function () {
                finish('media error ' + (video.error ? video.error.code : '?'));
            };
            video.src = url;
            video.play().catch(function () {});
        };
    }

    function onCompleted() {
        if (!current) return;
        if (current.live) return streamLost('stream ended', 'Playback stopped.');
        if (!started || progressBlocked()) return;
        ended = true;
        if (current.id) Progress.finish(current.id, duration() / 1000);
        started = false;
        showControls();
    }

    // Live reconnects on its own; a movie or episode shows the error screen.
    function streamLost(reason, message) {
        if (current && current.live) {
            Log.error('STREAM LOST ' + current.title + ' (' + reason + ')');
            reconnect.lost(reason);
        } else showStatus(message, true);
    }

    function onReady() {
        ready = true;
        playerEl.classList.toggle('av', usingAv);
        freeze.clear();
        hideStatus();
        video.onwaiting = function () {
            showStatus('', false);
        };
        video.onplaying = hideStatus;
        video.onended = onCompleted;
        video.onerror = function () {
            streamLost('media error ' + (video.error ? video.error.code : '?'), 'Playback stopped.');
        };
        if (!usingAv && lib && window.Hls && lib instanceof Hls) lib.subtitleTrack = -1;
        renderHint();
        video.ontimeupdate = restoration.onTime;
        maybePrompt();
        lastSave = Date.now();
        clearInterval(tickTimer);
        tickTimer = setInterval(tick, TICK_MS);
        if (current.live) reconnect.watch();
        showControls();
    }

    var STARTERS = { mpegts: viaMpegts, hls: viaHls, avplay: viaAvPlay, video: viaVideo };

    // `rect` plays in the live preview box, null full screen; leaving it out
    // (a retry, the next episode, a reconnect) keeps the current mode.
    function play(req, rect) {
        reconnect.cancel();
        freeze.clear();
        return start(req, undefined, rect);
    }

    // One playback attempt chain. `onAttempt` is set by a reconnect try: it
    // keeps the Reconnecting status and hears null (playing) or the failure.
    function start(req, onAttempt, rect) {
        playbackError = false;
        release();
        var mine = ++session;
        current = req;
        if (rect !== undefined) setBox(rect);
        playerEl.classList.remove('hidden', 'av', 'controls-on');
        hideControls();
        ui.title.textContent = req.title;
        ui.subtitle.textContent = req.subtitle || '';
        epg.load(req);
        if (!onAttempt) showStatus(heading(req) + '\nLoading…', false);

        var attempts = req.sources.map(function (source) {
            return [source.via, STARTERS[source.via](source.url)];
        });

        function fail(message) {
            if (onAttempt) return onAttempt(message);
            showStatus(heading(req) + '\n' + message, true);
        }

        function next(index, retried) {
            if (mine !== session) return Promise.resolve();
            if (index >= attempts.length) {
                fail('Could not play this. It may be offline.');
                return Promise.resolve();
            }
            var name = attempts[index][0];
            return attempt(attempts[index][1]).then(function (error) {
                if (mine !== session) return;
                if (!error) {
                    Log.info('PLAY OK ' + name + ' ' + req.title);
                    onReady();
                    if (onAttempt) onAttempt(null);
                    return;
                }
                Log.error('PLAY FAIL ' + name + ' ' + req.title + ' (' + error + ')');
                release();
                // 503 means the previous stream is still counted (retry once
                // after a pause) or the channel is offline (other players
                // would get the same answer, so stop).
                if (/503/.test(error)) {
                    if (retried) {
                        fail('This channel is offline or your connection is busy.');
                        return;
                    }
                    return wait(BUSY_RETRY_MS).then(function () {
                        return next(index, true);
                    });
                }
                return next(index + 1, false);
            });
        }
        return next(0, false);
    }

    function stop() {
        playbackError = false;
        reconnect.cancel();
        freeze.clear();
        session++;
        release();
        current = null;
        hideStatus();
        hideControls();
        setBox(null);
        playerEl.classList.add('hidden');
    }

    // Moves the playing stream into the preview box; false when nothing is
    // playing to show (stopped or failed).
    function preview(rect) {
        if (!current || playbackError) return false;
        setBox(rect);
        closeMenu();
        hideControls();
        return true;
    }

    // Takes the playing stream full screen, as if it had just started.
    function fullscreen() {
        setBox(null);
        showControls();
    }

    function togglePause(force) {
        var wantPause = force === undefined ? !isPaused() : force;
        if (wantPause) pause();
        else unpause();
        showControls();
    }

    // Returns true when consumed, or 'back' for OK on the error's Back button.
    // Return/Stop and live channel zapping are left to the caller.
    function key(code, live) {
        if (!current) return false;
        if (playbackError) return errorKey(code);
        if (resume.open) return resumeKey(code);
        if (!ready) return false;
        if (menu.open) return menuKey(code);
        if (!live && series.key(code)) return true;
        var wantsMenu = code === KEY.YELLOW || code === KEY.INFO || (!live && code === KEY.UP);
        if (wantsMenu) {
            openMenu();
            return true;
        }
        if (Keys.isBack(code)) return false;
        showControls();
        if (live || ended) return code === KEY.ENTER;
        if (code === KEY.ENTER) {
            if (seek.target !== null) commitSeek();
            else togglePause();
        } else if (code === KEY.PLAY_PAUSE) togglePause();
        else if (code === KEY.PLAY) togglePause(false);
        else if (code === KEY.PAUSE) togglePause(true);
        else if (code === KEY.RIGHT || code === KEY.FAST_FORWARD) nudge(1);
        else if (code === KEY.LEFT || code === KEY.REWIND) nudge(-1);
        else return false;
        return true;
    }

    return {
        play: play,
        stop: stop,
        preview: preview,
        fullscreen: fullscreen,
        key: key,
        canOpenChannelList: function () {
            return ready && current.live && !menu.open && !resume.open && ui.controls.classList.contains('hidden') && ui.status.classList.contains('hidden');
        },
        channelList: function (opened) {
            channelListOpen = opened;
            if (opened) hideControls();
        },
        isOpen: function () {
            return current !== null;
        },
    };
})();
