// Downloaded subtitles for movies and episodes (#30, #39): search and pick
// from OpenSubtitles, then keep them in time with the voice. A subtitle
// timed for another frame rate is stretched to the video's (scale); the
// delay moves by 0.5 s or 5 s, or is set from the line being spoken; and
// the next result can be tried without searching again.
window.SubtitleDownload = function (hooks) {
    'use strict';

    var SYNC_LINES = 6; // Lines listed on each side of "now" when syncing.
    var current = null;
    var cues = [];
    var offset = 0;
    var scale = 1;
    var found = []; // The last search's ranked results, for "Try the next subtitle".
    var video = {};
    var fileId = null;
    var generation = 0;
    var timer = null;
    var picker = null;
    var lastText = null;

    function toast(key, params) { hooks.toast(I18n.t('opensubs.' + key, params)); }

    function report(error) {
        toast(error && error.code || 'connection', { reset: error && error.reset || '' });
    }

    function remember() {
        if (current && current.id) SubtitleStore.save(current.subtitleId || current.id, fileId, offset, scale);
    }

    function sync() {
        if (!cues.length) return;
        var text = SubtitleFile.at(cues, hooks.position(), offset, scale);
        if (text !== lastText) hooks.draw(text);
        lastText = text;
    }

    function closePicker() {
        if (picker && picker()) Menu.close();
        picker = null;
        document.getElementById('menu').classList.remove('subtitle-picker');
    }

    function openPicker(title, options, index) {
        picker = Menu.open(title, options, index);
        document.getElementById('menu').classList.add('subtitle-picker');
        return picker;
    }

    function off() {
        generation++;
        cues = [];
        fileId = null;
        lastText = null;
        hooks.draw('');
        remember();
    }

    // A subtitle made for 25 fps runs 4% fast on a 23.976 fps video; only
    // known rates that differ, and only by a frame-rate-sized amount, count.
    function ratio(match) {
        var from = SubtitleRank.rate(match.fps);
        var to = video.fps;
        if (!from || !to || Math.abs(from - to) <= 0.01) return 1;
        var r = from / to;
        return r > 0.9 && r < 1.1 ? r : 1;
    }

    function apply(text, id, stretch) {
        var parsed = SubtitleFile.parse(text);
        if (!parsed.length) throw new Error('Invalid subtitle file');
        hooks.embeddedOff();
        cues = parsed;
        fileId = id;
        scale = stretch || 1;
        lastText = null;
        remember();
        sync();
    }

    function choose(match) {
        var mine = ++generation;
        var alive = openPicker(I18n.t('opensubs.downloading'), [{ label: I18n.t('common.cancel') }]);
        return SubtitleStore.obtain(match.file_id).then(function (result) {
            if (mine !== generation || !alive()) return;
            var stretch = ratio(match);
            apply(result.text, match.file_id, stretch);
            closePicker();
            Log.info('SUBS picked fps ' + (SubtitleRank.rate(match.fps) || '?') + ' scale ' + stretch.toFixed(4));
            if (stretch !== 1) toast('retimed', { from: +SubtitleRank.rate(match.fps).toFixed(3), to: +video.fps.toFixed(3) });
            if (result.remaining !== null && isFinite(result.remaining) && result.remaining < 10) toast('remaining', { n: result.remaining });
        }).catch(function (error) {
            if (mine !== generation || !alive()) return;
            closePicker();
            report(error);
        });
    }

    function label(match) {
        return (match.recommended ? '★ ' + I18n.t('opensubs.recommended') + ' · ' : '') + match.language + ' · ' + match.release +
            ' · ⬇ ' + SubtitleRank.count(match.downloads) + match.marks.map(function (mark) { return ' · ' + mark; }).join('') +
            (match.hearing ? ' · ' + I18n.t('opensubs.hearing') : '') + (match.machine ? ' · ' + I18n.t('opensubs.machine') : '');
    }

    function search() {
        if (!Prefs.get('opensubtitlesApiKey')) {
            toast('setFirst');
            return Promise.resolve();
        }
        var mine = ++generation;
        var secret = Prefs.get('opensubtitlesApiKey');
        var alive = openPicker(I18n.t('opensubs.searching'), [{ label: I18n.t('common.cancel') }]);
        var info = null;
        var lookup = current.subtitleLookup ? current.subtitleLookup() : Promise.resolve({ title: current.title });
        return lookup.then(function (known) {
            if (mine !== generation || !alive() || secret !== Prefs.get('opensubtitlesApiKey')) return null;
            info = known;
            if (current.movieHash) known = Object.assign({}, known, { moviehash: current.movieHash });
            return OpenSubs.search(known, Prefs.get('subtitleLanguages'), 60);
        }).then(function (results) {
            if (mine !== generation || !alive() || secret !== Prefs.get('opensubtitlesApiKey')) return;
            video = SubtitleRank.facts(info && info.video);
            var matches = results && SubtitleRank.rank(results, info && info.video).slice(0, 10);
            logFacts(results || []);
            found = matches || [];
            if (!matches || !matches.length) {
                closePicker();
                return toast('noResults');
            }
            openPicker(I18n.t('opensubs.download'), matches.map(function (match) {
                return { label: label(match), run: function () { choose(match); } };
            }).concat([{ label: I18n.t('common.cancel') }]));
        }).catch(function (error) {
            if (mine !== generation || !alive()) return;
            closePicker();
            report(error);
        });
    }

    // What the alignment can use, for the TV log: never titles, links or keys.
    function logFacts(results) {
        Log.info('SUBS facts fps ' + (video.fps ? +video.fps.toFixed(3) : '?') + ' res ' + (video.resolution || '?') +
            ' codec ' + (video.codec || '?') + ' hash ' + (current.movieHash ? 'yes' : 'no') + ' results ' + results.length +
            ' hash matches ' + results.filter(function (match) { return match.hashMatch; }).length +
            ' with fps ' + results.filter(function (match) { return SubtitleRank.rate(match.fps); }).length);
    }

    // The next search result after the one showing, wrapping round.
    function tryNext() {
        var index = found.map(function (match) { return match.file_id; }).indexOf(fileId);
        var next = found[(index + 1) % found.length];
        if (next && next.file_id !== fileId) choose(next);
    }

    function clock(ms) {
        var s = Math.floor(ms / 1000);
        var h = Math.floor(s / 3600);
        var m = Math.floor(s / 60) % 60;
        return (h ? h + ':' + (m < 10 ? '0' : '') : '') + m + ':' + (s % 60 < 10 ? '0' : '') + (s % 60);
    }

    // Pauses and lists the lines around "now"; the one picked starts now.
    function syncToLine() {
        hooks.closeMenu();
        if (hooks.pause) hooks.pause();
        var now = (hooks.position() - offset) / scale;
        var nearest = 0;
        cues.forEach(function (cue, i) { if (Math.abs(cue.start - now) < Math.abs(cues[nearest].start - now)) nearest = i; });
        var from = Math.max(0, nearest - SYNC_LINES);
        var lines = cues.slice(from, nearest + SYNC_LINES + 1);
        var options = lines.map(function (cue) {
            var line = cue.text.replace(/\s+/g, ' ');
            // The isolate marks keep an Arabic line's punctuation with its own text.
            return { label: clock(cue.start * scale + offset) + '  \u2068' + (line.length > 70 ? line.slice(0, 69) + '…' : line) + '\u2069', run: function () {
                offset = Math.max(-600000, Math.min(600000, hooks.position() - cue.start * scale));
                remember();
                lastText = null;
                sync();
            } };
        });
        // The focus starts on the line closest to now.
        openPicker(I18n.t('opensubs.syncTitle'), options.concat([{ label: I18n.t('common.cancel') }]), nearest - from);
    }

    function stop() {
        generation++;
        clearInterval(timer);
        timer = null;
        closePicker();
        cues = [];
        current = null;
        found = [];
        video = {};
        scale = 1;
        document.body.classList.remove('subtitles-open');
        fileId = null;
        lastText = null;
        hooks.draw('');
    }

    function start(request) {
        stop();
        if (request.live) return;
        current = request;
        document.body.classList.add('subtitles-open');
        var saved = SubtitleStore.title(request.subtitleId || request.id);
        offset = isFinite(saved.offset) ? Number(saved.offset) : 0;
        if (saved.file_id) {
            var text = SubtitleStore.cached(saved.file_id);
            var stretch = Number(saved.scale);
            if (SubtitleFile.parse(text).length) apply(text, saved.file_id, stretch > 0.9 && stretch < 1.1 ? stretch : 1);
        }
        timer = setInterval(sync, 100);
    }

    function shift(step) {
        offset = Math.max(-600000, Math.min(600000, offset + step));
        remember();
        sync();
    }

    function menuEntries(item, embeddedChoices) {
        if (!current || current.live) return;
        if (!embeddedChoices) item(I18n.t('common.off'), !cues.length, off);
        if (cues.length) item(I18n.t('opensubs.downloaded'), true, function () {});
        item(I18n.t('opensubs.download'), false, function () { hooks.closeMenu(); search(); });
        if (cues.length && found.length > 1) item(I18n.t('opensubs.next'), false, function () { hooks.closeMenu(); tryNext(); });
        if (cues.length) item(I18n.t('opensubs.syncLine'), false, syncToLine);
        [-5000, -500, 500, 5000].forEach(function (step) {
            var size = Math.abs(step) >= 1000 ? '5' : '0.5';
            item(I18n.t('opensubs.delay', { step: (step < 0 ? '−' : '+') + size, offset: (offset / 1000).toFixed(1) }), false, function () { shift(step); });
        });
    }

    return { start: start, stop: stop, active: function () { return cues.length > 0; }, off: off,
        menuEntries: menuEntries, search: search };
};
