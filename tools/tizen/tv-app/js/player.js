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

    var HIDE_AFTER_MS = 5000;
    var TICK_MS = 500;
    var SAVE_EVERY_MS = 10000;
    var SEEK_COMMIT_MS = 400;
    var ROUTE_GAP_MS = 1000; // between a failed sound route and the next (#54)
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
        transport: $('pl-transport'),
        play: $('pl-play'),
        now: $('pl-now'),
        ends: $('pl-ends'),
        hint: $('pl-hint'),
        menu: $('pl-menu'),
        resume: $('pl-resume'),
        resumeTitle: $('pl-resume-title'),
        resumeYes: $('pl-resume-yes'),
        resumeNo: $('pl-resume-no'),
    };

    var lib = null;
    var usingAv = false;
    var chain = PlaybackChain();
    var current = null;
    var opening = OpenTiming.off; // the timing of the open in progress (#70)
    var ready = false; // a stream is playing
    var channelListOpen = false;
    var box = null; // preview rectangle in screen pixels; null is full screen
    var started = false; // the resume prompt is settled; progress may be saved
    var ended = false;
    var playbackError = false;
    var liveOffered = false;
    var errorFocus = 0;
    var speed = 1;
    var hideAt = 0;
    var tickTimer = null;
    var subsTimer = null;
    var lastSave = 0;
    var avAudio = -1;
    var avText = -1;
    var avRoute = 'file'; // the address AVPlay plays (audio-route.js)
    var avBuffer = null; // AVPlay's last buffering percent, for Stream info (#84)
    var avSeekPending = false;
    var avSeekSerial = 0;
    var seek = { target: null, origin: 0, count: 0, dir: 0, last: 0, timer: null, holdPos: null, holdUntil: 0 };
    var menu = { open: false };
    var subtitles = SubtitleDownload({
        position: position,
        draw: function (text) { clearSubs(); ui.subs.textContent = text; refreshCover(); },
        embeddedOff: function () { var tracks = getTracks(); if (tracks.text.length) tracks.text[0].select(); },
        closeMenu: closeMenu,
        pause: function () { if (!isPaused()) togglePause(true); },
        toast: function (text) { document.dispatchEvent(new CustomEvent('subtitle-toast', { detail: text })); },
    });
    var resume = { open: false, focus: 0, position: 0, failed: false };
    var restoration = PlayerResume({
        position: position,
        seekTo: engineSeekTo,
        pending: seekPending,
        ready: canSeek,
        timeout: resumeFailed,
    });
    var epg = PlayerEpg(function () { banner.refresh(); });
    // The channel banner on zapping (#79, zap-banner.js). zapEnd is what a zap
    // shows once it plays: 'banner', 'quiet' after a key hid it; null otherwise.
    var zapEnd = null;
    var bannerRoot = el('div', 'hidden');
    bannerRoot.id = 'pl-banner';
    playerEl.appendChild(bannerRoot);
    var banner = ZapBanner.create(bannerRoot, {
        programmes: function () { return epg.programmes(); },
        startOver: function () { return ready && !!epg.watchFromStart(); },
    });
    var freeze = PlayerFreeze(video, $('pl-freeze'));
    // A live stream that drops reopens itself with backoff (player-reconnect.js).
    var reconnect = PlayerReconnect({
        position: position,
        paused: isPaused,
        begin: function () {
            freeze.capture();
            release();
            showStatus(heading(current) + '\n' + I18n.t('player.reconnecting'), false);
        },
        open: function (done) {
            start(current, done);
        },
        giveUp: function (reason) {
            Log.error('RECONNECT GAVE UP ' + current.title + ' (' + reason + ')');
            release();
            freeze.clear();
            showStatus(heading(current) + '\n' + I18n.t('player.reconnectFailed'), true);
        },
    });
    var sleep = PlayerSleep({
        warn: closeMenu,
        changed: function () {
            if (menu.open) renderMenu();
        },
        media: function () {
            if (!current || current.live || !ready || (!started && !ended) || progressBlocked()) return null;
            return { position: position(), duration: duration(), ended: ended, rate: speed };
        },
        stop: function () {
            stop();
            document.dispatchEvent(new Event('sleep-timer-stop'));
        },
    });
    var series = PlayerSeries({
        current: function () {
            return current;
        },
        position: position,
        duration: duration,
        seekTo: jumpTo,
        isEnded: function () {
            return ended;
        },
        autoplayBlocked: sleep.blocksAutoplay,
        togglePause: function () { togglePause(); },
        clock: fmt,
        toast: function (text) { document.dispatchEvent(new CustomEvent('subtitle-toast', { detail: text })); },
        play: play,
        openMenu: openMenu,
        showControls: showControls,
    });

    PlayerPicture.init({
        root: playerEl,
        video: video,
        avplay: function () { return usingAv && avplay(); },
        box: function () { return box; },
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
        PlayerPicture.apply();
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
        if (current && current.catchUp) return current.catchUp.end - current.catchUp.start;
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
        liveOffered = false;
        if (ms > 0) restoration.start(ms);
        else {
            restoration.cancel();
            engineSeekTo(0);
        }
    }

    // A jump the viewer asked for (+10, skip intro) is sent once: asking again
    // only restarts the loading, and the TV may land a few seconds off.
    function jumpTo(ms) {
        if (!current || current.live) return;
        restoration.cancel();
        liveOffered = false;
        if (current.catchUp && current.returnTo) ms = Math.min(ms, CatchUp.livePosition(current.catchUp));
        engineSeekTo(Math.max(0, ms));
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
        if (current) renderHint();
    }

    // The tick hides the overlay once the deadline passes; while paused (or a
    // menu is open) the deadline keeps moving, so it hides 5 s after resuming.
    function scheduleHide() {
        hideAt = Date.now() + HIDE_AFTER_MS;
    }

    // Live channels list their keys; movies and shows keep a plain bar.
    function hintHtml() {
        if (!current.live) return [];
        return [['OK', I18n.t('player.hint.info')], ['▲▼', I18n.t('player.hint.channel')], ['◀', I18n.t('player.hint.channelList')], ['PRE-CH / {green}', I18n.t('player.hint.previous')], [I18n.t('help.key.holdOk') + ' / {yellow}', I18n.t('player.hint.audioSubs')],
            ['Return', I18n.t(ui.controls.classList.contains('hidden') ? 'player.hint.close' : 'player.hide')]];
    }

    function renderHint() {
        ui.hint.textContent = '';
        hintHtml().forEach(function (pair) {
            var item = el('span');
            item.appendChild(KeyHelp.fill(el('b'), pair[0]));
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
        // The transport row (#48): OK acts on the play/pause circle, so it
        // shows what OK does next; ▼ moves to the buttons beside it.
        ui.transport.classList.toggle('hidden', live);
        ui.transport.classList.toggle('on-buttons', series.busy() || series.onBar());
        ui.seekbox.classList.toggle('focus', !live && series.onBar());
        ui.play.textContent = ended ? '■' : paused ? '▶' : '❚❚';
        ui.now.textContent = I18n.time(Date.now());
        ui.ends.textContent = '';
        if (live) return epg.render();
        var dur = duration();
        var pos = position();
        if (seek.target !== null) pos = seek.target;
        else if (Date.now() < seek.holdUntil) pos = seek.holdPos;
        ui.cur.textContent = current.catchUp ? CatchUp.clock(current.catchUp.start) : fmt(pos);
        // The time left, and when it ends at this speed.
        ui.total.textContent = current.catchUp ? CatchUp.clock(current.catchUp.end) : '−' + fmt(Math.max(0, dur - pos));
        if (!current.catchUp && dur > 0) ui.ends.textContent = I18n.t('player.endsAt', { time: I18n.time(Date.now() + Math.max(0, dur - pos) / speed) });
        var pct = dur > 0 ? Math.min(100, (pos / dur) * 100) : 0;
        ui.fill.style.width = pct + '%';
        ui.bar.style.setProperty('--pl-knob', pct + '%');
        if (seek.target !== null) {
            var basePct = dur > 0 ? Math.min(100, (seek.origin / dur) * 100) : 0;
            ui.target.style.left = Math.min(basePct, pct) + '%';
            ui.target.style.width = Math.abs(pct - basePct) + '%';
        } else {
            ui.target.style.width = '0';
        }
    }

    function showControls() {
        if (!current || !ready || resume.open || channelListOpen) return;
        banner.hide();
        ui.controls.classList.remove('hidden');
        playerEl.classList.add('controls-on');
        renderHint();
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
            banner.hide();
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

    // The provider cannot serve future programme time; offer live at that edge.
    function offerLive() {
        if (!current || !current.catchUp || !current.returnTo || !started || progressBlocked()) return;
        if (position() < CatchUp.livePosition(current.catchUp) - 1000 || menu.open) return;
        if (liveOffered) return;
        liveOffered = true;
        pause();
        openMenu('caught-up');
    }

    function tick() {
        offerLive();
        if (current && current.catchUp && !ended && position() >= duration()) {
            pause();
            onCompleted();
        }
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
        jumpTo(seek.target);
        series.onJump(seek.origin, seek.target);
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
            // While the last jump still loads the TV reports the old time.
            var loading = seek.holdPos !== null && (now < seek.holdUntil || seekPending());
            seek.origin = loading ? seek.holdPos : position();
            seek.count = 0;
        } else if (dir !== seek.dir || now - seek.last > SEEK_COMMIT_MS) seek.count = 0;
        var tier = seek.count >= 6 ? 2 : seek.count >= 3 ? 1 : 0;
        seek.count++;
        seek.dir = dir;
        seek.last = now;
        var base = seek.target === null ? seek.origin : seek.target;
        var next = base + dir * SEEK_STEPS_S[tier] * 1000;
        if (current.catchUp && current.returnTo) next = Math.min(next, CatchUp.livePosition(current.catchUp));
        seek.target = Math.max(0, dur > 0 ? Math.min(next, dur - 1000) : next);
        clearTimeout(seek.timer);
        seek.timer = setTimeout(commitSeek, SEEK_COMMIT_MS);
        showControls();
    }

    // ---- Tracks, speed and stream info ------------------------------------

    // Which engine plays: 'avplay', 'hls', 'mpegts' or 'video'.
    function engineKind() {
        if (usingAv) return 'avplay';
        if (!lib) return 'video';
        return window.Hls && lib instanceof Hls ? 'hls' : 'mpegts';
    }

    // An AVPlay list (getTotalTrackInfo, getCurrentStreamInfo); empty when not prepared.
    function avRead(method) {
        try {
            return avplay()[method]() || [];
        } catch (e) {
            return [];
        }
    }

    // Returns { audio: [{label, active, select}], text: [...] }. The lists come
    // from player-tracks.js; the switching is each engine's own.
    function getTracks(automatic) {
        var kind = engineKind();
        var tracks;
        var selectAudio;
        var selectText;
        if (kind === 'avplay') {
            if (avAudio < 0) avAudio = PlayerTracks.avCurrentIndex(avRead('getCurrentStreamInfo'), 'AUDIO');
            tracks = PlayerTracks.av(avRead('getTotalTrackInfo'), avAudio, avText, fileAudio());
            selectAudio = function (index) {
                avplay().setSelectTrack('AUDIO', index);
                avAudio = index;
            };
            selectText = function (index) {
                if (index < 0) {
                    try {
                        avplay().setSilentSubtitle(true);
                    } catch (e) {
                        // Older firmware.
                    }
                    avText = -1;
                    clearSubs();
                    return;
                }
                avplay().setSelectTrack('TEXT', index);
                try {
                    avplay().setSilentSubtitle(false);
                } catch (e) {
                    // Older firmware.
                }
                avText = index;
            };
        } else if (kind === 'hls') {
            var hls = lib;
            tracks = PlayerTracks.hls(hls);
            selectAudio = function (n) {
                hls.audioTrack = n;
            };
            selectText = function (n) {
                if (n < 0) {
                    hls.subtitleTrack = -1;
                    return;
                }
                hls.subtitleDisplay = true;
                hls.subtitleTrack = n;
            };
        } else {
            tracks = PlayerTracks.native(video.audioTracks, video.textTracks);
            selectAudio = function (track) {
                PlayerTracks.nativeList(video.audioTracks).forEach(function (other) {
                    other.enabled = other === track;
                });
            };
            selectText = function (track) {
                PlayerTracks.nativeSubtitles(video.textTracks).forEach(function (t) {
                    t.mode = t === track ? 'showing' : 'disabled';
                });
            };
        }
        function bind(list, select) {
            return list.map(function (entry) {
                return {
                    label: entry.label,
                    language: entry.language,
                    ref: entry.ref,
                    active: entry.active,
                    select: function () {
                        select(entry.ref);
                    },
                };
            });
        }
        // A track the TV cannot decode is listed without a way to pick it;
        // a picked one's language is what the next episode starts in.
        var audio = tracks.audio.map(function (entry) {
            if (entry.unsupported) return { label: entry.label, active: false, select: null, note: I18n.t('player.audioUnsupported') };
            return {
                label: entry.label,
                language: entry.language,
                ref: entry.ref,
                active: entry.active,
                select: function () {
                    selectAudio(entry.ref);
                    if (!automatic) AudioChoice.remember(current, entry.language);
                },
            };
        });
        return { audio: audio, text: bind(tracks.text, selectText) };
    }

    // The file's own sound tracks; a converted address has others.
    function fileAudio() {
        return avRoute === 'file' ? current.fileAudio : null;
    }

    // Reopens what plays where it is, on the provider's converted address
    // (`converted`) or the file itself (#54, #55).
    function switchRoute(converted) {
        if (!converted) AudioRoute.remember(current, 'original');
        play(Object.assign({}, current, converted ? { audioRetry: true, audioRoute: null, resume: true } : { audioRetry: false, audioRoute: 'original', resume: true }));
    }

    var languagePrefs;

    function preferAudio() {
        return LanguageChoice.apply(current, getTracks(true), languagePrefs);
    }

    // What the Stream info panel (#84, stream-info.js) reads every second.
    function streamSample() {
        var kind = engineKind();
        var sample = { engine: kind, route: avRoute, avBuffer: avBuffer };
        if (kind === 'avplay') {
            sample.streams = avRead('getCurrentStreamInfo');
            return sample;
        }
        var quality = video.getVideoPlaybackQuality ? video.getVideoPlaybackQuality() : null;
        var ahead = null;
        for (var i = 0; i < video.buffered.length; i++) {
            if (video.buffered.start(i) <= video.currentTime && video.currentTime <= video.buffered.end(i)) ahead = video.buffered.end(i) - video.currentTime;
        }
        sample.video = {
            width: video.videoWidth,
            height: video.videoHeight,
            buffered: ready ? ahead : null,
            dropped: quality ? quality.droppedVideoFrames : null,
            frames: quality ? quality.totalVideoFrames : null,
        };
        if (kind === 'hls' && lib.levels) sample.level = lib.levels[lib.currentLevel];
        if (kind === 'mpegts') {
            sample.media = lib.mediaInfo;
            sample.stats = lib.statisticsInfo;
        }
        return sample;
    }

    var infoRoot = el('div', 'hidden');
    infoRoot.id = 'pl-info';
    playerEl.appendChild(infoRoot);
    var streamInfo = StreamInfo.create(infoRoot, streamSample);

    // ---- Menu -------------------------------------------------------------

    // The groups each part of the menu keeps: Audio & subtitles has the
    // tracks and subtitle style; Settings has the rest.
    function menuPart(m) {
        if (!menu.part || menu.part === 'caught-up') return m;
        var tracks = [I18n.t('player.audio'), I18n.t('picture.subtitles'), I18n.t('opensubs.timing'), I18n.t('picture.subtitleStyle')];
        var keep = false;
        return {
            head: function (label, value) {
                keep = (tracks.indexOf(label) >= 0) === (menu.part === 'tracks');
                if (keep) m.head(label, value);
            },
            item: function (label, active, action, note) { if (keep) m.item(label, active, action, note); },
            note: function (text) { if (keep) m.note(text); },
            info: function (text) { if (keep) m.info(text); },
        };
    }

    // What the ▲ menu shows (see player-menu.js), asked again on every render.
    function menuEntries(whole) {
        var m = menuPart(whole);
        var tracks = getTracks();
        var watch = epg.watchFromStart();
        if (watch) m.item(I18n.t('player.startOver'), false, startOver);
        if (current.backToLive) m.item(I18n.t('player.backToLive'), false, current.backToLive);
        PlayerHelp.menuEntries(m.item, current);
        m.head(I18n.t('player.audio'));
        tracks.audio.forEach(function (t) { m.item(t.label, t.active, t.select, t.note); });
        var routes = usingAv && AudioRoute.offered(current);
        if (routes) {
            var converted = avRoute !== 'file';
            m.item(I18n.t('player.convertedSound'), converted, function () { if (!converted) switchRoute(true); });
            if (converted) m.item(I18n.t('player.originalSound'), false, function () { switchRoute(false); });
        } else if (!tracks.audio.length) m.note(I18n.t('player.oneAudio'));
        m.head(I18n.t('picture.subtitles'));
        if (tracks.text.length > 1) tracks.text.forEach(function (t) {
            m.item(t.label, t.active && !subtitles.active(), function () { subtitles.off(); t.select(); AudioChoice.rememberSubtitle(current, t.ref === -1 || t.ref === null ? false : t.language); });
        });
        else if (current.live) m.note(I18n.t('player.noSubtitles'));
        subtitles.menuEntries(m.item, tracks.text.length > 1, m.head);
        PlayerPicture.menuEntries(m.head, m.item);
        if (!current.live) {
            m.head(I18n.t('player.speed'));
            (usingAv ? SPEEDS_AV : SPEEDS_HTML).forEach(function (value) {
                m.item(value + '×', value === speed, function () {
                    applySpeed(value);
                });
            });
        }
        if (!current.live) series.introEntries(m.head, m.item);
        m.head(sleep.heading());
        sleep.choices(current).forEach(function (choice) { m.item(choice.label, choice.active, choice.select); });
        m.head(I18n.t('player.streamInfo'), I18n.t(streamInfo.shown() ? 'common.on' : 'common.off'));
        m.item(I18n.t('player.info.show'), streamInfo.shown(), function () { streamInfo.toggle(); closeMenu(); });
    }

    var playerMenu = PlayerMenu(ui.menu, {
        build: menuEntries,
        title: function () {
            if (menu.part === 'caught-up') return I18n.t('player.caughtUp');
            return I18n.t(menu.part === 'settings' ? 'rail.settings' : 'player.hint.audioSubs');
        },
        run: function (action) {
            try {
                action();
            } catch (e) {
                Log.error('TRACK select failed ' + (e && e.message));
            }
            refreshCover();
        },
    });

    function renderMenu() {
        playerMenu.render();
    }

    // part: 'tracks' or 'settings' for a part of the menu, else all of it.
    function openMenu(part) {
        menu.open = true;
        menu.part = typeof part === 'string' ? part : null;
        playerMenu.reset();
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
        if (code === KEY.YELLOW || code === KEY.INFO || playerMenu.key(code) === 'close') closeMenu();
        else if (menu.open) renderMenu();
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
        ui.resumeTitle.textContent = I18n.t('player.restoreFailed');
        ui.resumeYes.textContent = I18n.t('common.retry');
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
        ui.resumeYes.textContent = I18n.t('player.resumeFrom', { time: fmt(saved.position * 1000) });
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

    // The Cover background shows while any subtitle is switched on, even between cues.
    function embeddedOn() {
        try {
            return getTracks().text.some(function (track, n) { return n > 0 && track.active; });
        } catch (e) {
            return false;
        }
    }

    function refreshCover() {
        playerEl.classList.toggle('sub-on', !!current && ready && (subtitles.active() || embeddedOn()));
    }

    function showSub(durationMs, text) {
        if (subtitles.active()) return;
        clearTimeout(subsTimer);
        ui.subs.textContent = String(text || '').replace(/<[^>]*>/g, '');
        if (Number(durationMs) > 0) subsTimer = setTimeout(clearSubs, Number(durationMs));
    }

    // ---- Playback chain ---------------------------------------------------

    // Closes whatever is playing; keeps the player screen.
    function release() {
        subtitles.stop();
        saveProgress();
        restoration.cancel();
        avSeekSerial++;
        avSeekPending = false;
        started = false;
        ready = false;
        liveOffered = false;
        playerEl.classList.remove('sub-on');
        ended = false;
        clearInterval(tickTimer);
        reconnect.unwatch();
        clearTimeout(seek.timer);
        seek.timer = null;
        seek.target = null;
        seek.holdUntil = 0;
        seek.holdPos = null;
        menu.open = false;
        resume.open = false;
        resume.failed = false;
        ui.menu.classList.add('hidden');
        ui.resume.classList.add('hidden');
        clearSubs();
        series.reset();
        epg.reset();
        avAudio = avText = -1;
        avRoute = 'file';
        avBuffer = null;
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

    function viaMpegts(url) {
        return function (finish) {
            if (!window.mpegts || !mpegts.isSupported()) return finish('mpegts.js unsupported');
            var player = (lib = mpegts.createPlayer({ type: 'mpegts', isLive: current.live, url: url }, { enableStashBuffer: false }));
            player.on(mpegts.Events.ERROR, function (type, detail, info) {
                var reason = type + ' ' + detail + ' ' + ((info && info.code) || '');
                if (ready && lib === player) streamLost(reason, I18n.t('player.stopped'));
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
                if (ready && lib === player) streamLost(reason, I18n.t('player.stopped'));
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

    function viaAvPlay(url, source) {
        return function (finish) {
            var av = avplay();
            if (!av) return finish('AVPlay unavailable');
            usingAv = true;
            var mine = chain.session();
            // The reads below belong to this request, even if another starts meanwhile.
            var request = current;
            var gone = function () { return chain.stale(mine) || current !== request; };
            var timing = opening;
            var target = current.live && !(source && source.resolve) ? Promise.resolve(url) : timing.run('resolve', '', function () { return AvResolve.final(url); });
            target.then(function (address) {
                if (gone()) return null;
                // A busy or offline answer goes to the chain's 503 handling.
                if (address.error) return finish(address.error);
                // The subtitle hash needs two small reads; finish them before AVPlay opens (ADR 0006).
                // Each step is skipped when its answer is already known (#70).
                return timing.run('hash', MovieHash.skipNote(request), function () { return MovieHash.prepare(request, address.url || address); }).then(function () {
                    return gone() ? null : timing.run('sniff', MediaSniff.skipNote(request), function () { return MediaSniff.prepare(request, address.url || address); });
                }).then(function () { return address; });
            }).then(function (address) {
                if (!address || gone() || address.error) return;
                openRoute(av, AudioRoute.plan(current, source, address.url || address), 0, finish, mine, url, timing);
            });
        };
    }

    // Opens routes[at] (audio-route.js); a route that needs sound and has
    // none, or fails, closes and hands over to the next one. Only one is
    // open at a time (ADR 0006). `link` is the provider's own link: its
    // redirect is often good for one use, so a file opened after another
    // route asks for a fresh one.
    function openRoute(av, routes, at, finish, mine, link, timing) {
        var route = routes[at];
        // The route's own time: its address look-up, prepare and sound check.
        route.timed = timing.step(at === 0 ? 'prepare' : route.name);
        var request = current;
        var left = false;
        // Ended once this AVPlay attempt has (a timeout moves the chain on),
        // so a late route never opens a second stream (ADR 0006).
        var ended = function () { return chain.stale(mine) || current !== request || !!(finish.ended && finish.ended()); };
        // A route handed over is stale too: its pending sound check must not
        // judge the next route's stream.
        route.stale = function () { return left || ended(); };
        if (at + 1 < routes.length) {
            route.next = function (why) {
                // The TV reports one failure twice (onerror and prepareAsync's error).
                // A cancelled attempt's late callback must not stop the
                // AVPlay that a newer title now uses.
                if (left || ended()) return;
                left = true;
                route.timed();
                Log.info('AUDIO route ' + route.name + ' ' + why);
                try {
                    av.stop();
                } catch (e) {
                    // Never started.
                }
                try {
                    av.close();
                } catch (e) {
                    // Already closed.
                }
                // A provider allowing one connection needs a moment to let it go.
                var gap = timing.step('gap');
                setTimeout(function () {
                    gap();
                    if (!ended()) openRoute(av, routes, at + 1, finish, mine, link, timing);
                }, ROUTE_GAP_MS);
            };
        }
        var first = route.name === 'file' && (at === 0 || !link);
        if (route.direct) Log.info('AUDIO route ' + route.name + ' direct');
        var address = first || route.direct ? Promise.resolve({ url: route.url }) : AvResolve.final(route.name === 'file' ? link : route.url);
        address.then(function (found) {
            if (route.stale()) return;
            if (found.error) return route.next ? route.next(found.error) : finish(found.error);
            try {
                open(av, found.url, finish, route);
            } catch (e) {
                if (route.next) route.next(e.name || String(e));
                else finish(e.name || String(e));
            }
        });
    }

    // Whether AVPlay lists a sound track; a route that needs one also gets
    // four seconds of playback, as some firmware lists tracks only then.
    function checkSound(av, route, done) {
        var sound = AvResolve.tracks(av, current.audio);
        if (sound || !route.needsSound) return done(sound);
        av.play();
        setTimeout(function () {
            if (!route.stale()) done(AvResolve.tracks(av, null, 'after 4s'));
        }, 4000);
    }

    // No sound five seconds into a file that has other routes: start again
    // there, where the viewer was (audio-route.js).
    function retrySound() {
        Log.info('AUDIO no sound after 5s, trying the converted routes');
        play(Object.assign({}, current, { audioRetry: true, resume: true }));
    }

    function open(av, url, finish, route) {
        route = route || {};
        av.open(url);
        av.setListener({
            onbufferingstart: function () {
                avBuffer = 0;
                if (ready) showStatus('', false);
            },
            onbufferingprogress: function (percent) {
                avBuffer = Number(percent);
            },
            onbufferingcomplete: function () {
                avBuffer = 100;
                hideStatus();
            },
            onerror: function (type) {
                if (!ready && route.next) return route.next('error ' + type);
                if (ready) streamLost(String(type), I18n.t('player.stoppedType', { type: type }));
                finish(String(type));
            },
            onstreamcompleted: onCompleted,
            oncurrentplaytime: restoration.onTime,
            onsubtitlechange: showSub,
        });
        PlayerPicture.apply();
        av.prepareAsync(
            function () {
                try {
                    av.setSilentSubtitle(true);
                } catch (e) {
                    // Older firmware.
                }
                checkSound(av, route, function (sound) {
                    route.timed();
                    if (route.needsSound && !sound && route.next) return route.next('has no sound');
                    if (route.needsSound && sound) AudioRoute.remember(current, route.name);
                    avRoute = route.name || 'file';
                    // The last resort is only silent when the TV lists no sound track.
                    if (route.silent && sound) AudioRoute.forget(current);
                    if (route.silent && !sound) {
                        AudioRoute.remember(current, 'none');
                        document.dispatchEvent(new CustomEvent('subtitle-toast', { detail: AudioRoute.message(current) }));
                    }
                    av.play();
                    // AVPlay switches sound only while playing.
                    var preferred = preferAudio();
                    finish(null);
                    // Some firmware lists a track only once playback runs; a second look
                    // tells a late track from a missing one.
                    var shown = current;
                    setTimeout(function () {
                        if (current !== shown || !usingAv) return;
                        var later = AvResolve.tracks(av, null, 'after 5s');
                        if (!later && route.retry) return retrySound();
                        if (!preferred) preferAudio();
                    }, 5000);
                });
            },
            function (err) {
                route.timed();
                if (route.next) return route.next('prepare ' + (err && err.name));
                finish('prepare ' + (err && err.name));
            }
        );
    }

    function viaVideo(url) {
        return function (finish) {
            video.onplaying = function () {
                finish(null);
            };
            video.onerror = function () {
                finish('media error ' + (video.error ? video.error.code : '?'));
            };
            var mine = chain.session();
            MovieHash.prepare(current, url).then(function () {
                if (chain.stale(mine)) return;
                video.src = url;
                video.play().catch(function () {});
            });
        };
    }

    function onCompleted() {
        if (!current) return;
        if (current.live) return streamLost('stream ended', I18n.t('player.stopped'));
        if (!started || progressBlocked()) return;
        offerLive();
        ended = true;
        if (current.id) Progress.finish(current.id, duration() / 1000);
        started = false;
        sleep.check();
        if (!current) return;
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
        PlayerPicture.apply();
        freeze.clear();
        hideStatus();
        video.onwaiting = function () {
            showStatus('', false);
        };
        video.onplaying = hideStatus;
        video.onended = onCompleted;
        video.onerror = function () {
            streamLost('media error ' + (video.error ? video.error.code : '?'), I18n.t('player.stopped'));
        };
        if (!usingAv && lib && window.Hls && lib instanceof Hls) lib.subtitleTrack = -1;
        subtitles.start(current);
        if (!usingAv) preferAudio();
        video.textTracks.addEventListener('change', refreshCover);
        refreshCover();
        renderHint();
        video.ontimeupdate = restoration.onTime;
        maybePrompt();
        lastSave = Date.now();
        clearInterval(tickTimer);
        tickTimer = setInterval(tick, TICK_MS);
        if (current.live) reconnect.watch();
        // A channel change shows the banner (#79), not the full controls.
        if (zapEnd === 'banner') banner.show(current.banner);
        else if (zapEnd === null) showControls();
        zapEnd = null;
    }

    var STARTERS = { mpegts: viaMpegts, hls: viaHls, avplay: viaAvPlay, video: viaVideo };

    // `rect` plays in the live preview box, null full screen; leaving it out
    // (a retry, the next episode, a reconnect) keeps the current mode.
    function play(req, rect) {
        reconnect.cancel();
        freeze.clear();
        // A zap (#79) shows the channel banner while it opens and again once it
        // plays, after start() has asked for this channel's guide.
        zapEnd = req.live && req.zapped && req.banner ? 'banner' : null;
        var run = start(req, undefined, rect);
        if (zapEnd) banner.show(req.banner);
        else banner.hide();
        return run;
    }

    // One playback attempt chain. `onAttempt` is set by a reconnect try: it
    // keeps the Reconnecting status and hears null (playing) or the failure.
    function start(req, onAttempt, rect) {
        playbackError = false;
        release();
        current = req;
        opening = req.live ? OpenTiming.off : OpenTiming.begin(req.openKind || (req.episodes ? 'episode' : 'film'));
        languagePrefs = LanguageChoice.read();
        if (rect !== undefined) setBox(rect);
        playerEl.classList.remove('hidden', 'av', 'controls-on');
        hideControls();
        ui.title.textContent = req.title;
        ui.subtitle.textContent = req.subtitle || '';
        epg.load(req);
        if (!onAttempt) showStatus(heading(req) + '\n' + I18n.t('common.loadingEllipsis'), false);

        var attempts = req.sources.map(function (source) {
            return { name: source.via, start: STARTERS[source.via](source.url, source) };
        });

        function fail(message) {
            if (onAttempt) return onAttempt(message);
            showStatus(heading(req) + '\n' + message, true);
        }

        return chain.run(attempts, {
            ready: function (name, ms) {
                Log.info('PLAY OK ' + name + ' ' + req.title + ' in ' + ms + 'ms');
                onReady();
                opening.finish();
                if (onAttempt) onAttempt(null);
            },
            failed: function (name, error, ms) {
                Log.error('PLAY FAIL ' + name + ' ' + req.title + ' (' + error + ') after ' + ms + 'ms');
                release();
                // release() also clears the now/next guide; the next player needs it again.
                epg.load(req);
            },
            giveUp: function (kind) {
                fail(I18n.t(kind === 'busy' ? 'player.busy' : 'player.offline'));
            },
        });
    }

    function stop() {
        sleep.cancel();
        playbackError = false;
        reconnect.cancel();
        freeze.clear();
        chain.cancel();
        release();
        banner.hide();
        streamInfo.hide();
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
        sleep.cancel();
        setBox(rect);
        closeMenu();
        hideControls();
        banner.hide();
        streamInfo.hide();
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

    // While the channel banner shows (#79): OK or Info opens the full
    // controls, ▶ starts the programme over where it can; any other key
    // (Return too) hides it and does what it always does.
    function bannerKey(code) {
        var again = code === KEY.RIGHT && ready && !!epg.watchFromStart();
        if (zapEnd) zapEnd = 'quiet';
        banner.hide();
        if (again) startOver();
        else if (code === KEY.ENTER || code === KEY.INFO) showControls();
        else return false;
        return true;
    }

    // Returns true when consumed, or 'back' for OK on the error's Back button.
    // Return with hidden controls, Stop and live zapping are left to the caller.
    function key(code, live) {
        if (Menu.isOpen()) return Menu.onKey(code);
        if (!current) return false;
        if (playbackError) return errorKey(code);
        if (resume.open) return resumeKey(code);
        if (banner.shown() && bannerKey(code)) return true;
        if (!ready) return false;
        if (menu.open) return menuKey(code);
        // Return hides Stream info (#84) before anything else.
        if (Keys.isBack(code) && streamInfo.shown()) {
            streamInfo.hide();
            return true;
        }
        // The first ◀ ▶ ▼ only brings the controls up, with play/pause focused.
        var arrow = code === KEY.LEFT || code === KEY.RIGHT || code === KEY.DOWN;
        if (!live && arrow && ui.controls.classList.contains('hidden')) {
            showControls();
            return true;
        }
        if (!live && series.key(code)) return true;
        var wantsMenu = code === KEY.YELLOW || code === KEY.INFO || (!live && code === KEY.UP);
        if (wantsMenu) {
            openMenu();
            return true;
        }
        if (Keys.isBack(code)) {
            if (box || ui.controls.classList.contains('hidden')) return false;
            hideControls();
            return true;
        }
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

    // The programme banner can call this without knowing the playback request.
    function startOver() {
        if (!current || !current.live || !ready) return;
        var watch = epg.watchFromStart();
        if (watch) watch();
    }

    return {
        startOver: startOver,
        play: play,
        stop: stop,
        preview: preview,
        fullscreen: fullscreen,
        key: key,
        canOpenChannelList: function () {
            return ready && current.live && !menu.open && !resume.open && ui.controls.classList.contains('hidden') && ui.status.classList.contains('hidden');
        },
        // Hold OK on live TV opens the menu (#89), when nothing else is open.
        canHoldMenu: function () {
            return ready && !!current && current.live && !menu.open && !resume.open && !playbackError && !channelListOpen && !Menu.isOpen();
        },
        openMenu: function () { openMenu(); },
        channelList: function (opened) {
            channelListOpen = opened;
            if (opened) hideControls();
            if (opened) banner.hide();
        },
        isOpen: function () {
            return current !== null;
        },
        paused: isPaused,
    };
})();
