window.SubtitleDownload = function (hooks) {
    'use strict';

    var current = null;
    var cues = [];
    var offset = 0;
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
        if (current && current.id) SubtitleStore.save(current.subtitleId || current.id, fileId, offset);
    }

    function sync() {
        if (!cues.length) return;
        var text = SubtitleFile.at(cues, hooks.position(), offset);
        if (text !== lastText) hooks.draw(text);
        lastText = text;
    }

    function closePicker() {
        if (picker && picker()) Menu.close();
        picker = null;
        document.getElementById('menu').classList.remove('subtitle-picker');
    }

    function openPicker(title, options) {
        picker = Menu.open(title, options);
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

    function apply(text, id) {
        var parsed = SubtitleFile.parse(text);
        if (!parsed.length) throw new Error('Invalid subtitle file');
        hooks.embeddedOff();
        cues = parsed;
        fileId = id;
        lastText = null;
        remember();
        sync();
    }

    function choose(match) {
        var mine = ++generation;
        var alive = openPicker(I18n.t('opensubs.downloading'), [{ label: I18n.t('common.cancel') }]);
        return SubtitleStore.obtain(match.file_id).then(function (result) {
            if (mine !== generation || !alive()) return;
            apply(result.text, match.file_id);
            closePicker();
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
        var video = null;
        var lookup = current.subtitleLookup ? current.subtitleLookup() : Promise.resolve({ title: current.title });
        return lookup.then(function (info) {
            if (mine !== generation || !alive() || secret !== Prefs.get('opensubtitlesApiKey')) return null;
            video = info.video;
            if (current.movieHash) info = Object.assign({}, info, { moviehash: current.movieHash });
            return OpenSubs.search(info, Prefs.get('subtitleLanguages'), 60);
        }).then(function (found) {
            var matches = found && SubtitleRank.rank(found, video).slice(0, 10);
            if (mine !== generation || !alive() || secret !== Prefs.get('opensubtitlesApiKey')) return;
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

    function stop() {
        generation++;
        clearInterval(timer);
        timer = null;
        closePicker();
        cues = [];
        current = null;
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
            if (SubtitleFile.parse(text).length) apply(text, saved.file_id);
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
        [-500, 500].forEach(function (step) {
            item(I18n.t('opensubs.delay', { step: step < 0 ? '−0.5' : '+0.5', offset: (offset / 1000).toFixed(1) }), false, function () { shift(step); });
        });
    }

    return { start: start, stop: stop, active: function () { return cues.length > 0; }, off: off,
        menuEntries: menuEntries, search: search };
};
