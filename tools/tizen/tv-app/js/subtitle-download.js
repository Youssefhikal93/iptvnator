// Downloaded subtitles for movies and episodes (#30, #39, #52): search
// OpenSubtitles and SubDL together and pick from one ranked list, then keep
// them in time with the voice. Only when both find nothing, and the Backup
// search switch is on, Subsource is asked, and then a subtitle in another
// language can be translated with DeepL. A subtitle
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
    var name = ''; // The language and release of the downloaded file, for the menu.
    var fileId = null;
    var generation = 0;
    var timer = null;
    var picker = null;
    var lastText = null;

    function toast(key, params) { hooks.toast(I18n.t('opensubs.' + key, params)); }

    function report(error) {
        var provider = error && error.provider;
        var key = (/^(subdl|subsource|deepl)$/.test(provider) ? provider + '.' : 'opensubs.') + (error && error.code || 'connection');
        hooks.toast(I18n.t(key, { reset: error && error.reset || '' }));
    }

    // The providers with a key set, in the order their results are shown on a
    // tie; a backup one is asked only when the others find nothing.
    var PROVIDERS = [{ id: 'opensubtitles', name: 'OpenSubtitles', pref: 'opensubtitlesApiKey', api: function () { return OpenSubs; } },
        { id: 'subdl', name: 'SubDL', pref: 'subdlApiKey', api: function () { return SubDL; } },
        { id: 'subsource', name: 'Subsource', pref: 'subsourceApiKey', backup: true, api: function () { return SubSource; } }];

    function backupOn() { return Prefs.get('subtitleFallback') !== false; }

    function providers(backup) {
        return PROVIDERS.filter(function (provider) { return !!provider.backup === !!backup && !!Prefs.get(provider.pref); });
    }

    function translator() { return backupOn() && !!Prefs.get('deeplApiKey'); }

    // A changed or removed key makes an open search stale.
    function keys() {
        return PROVIDERS.map(function (provider) { return Prefs.get(provider.pref) || ''; }).concat([Prefs.get('deeplApiKey') || '']).join('\n');
    }

    function remember() {
        if (current && current.id) SubtitleStore.save(current.subtitleId || current.id, fileId, offset, scale, name);
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

    function openPicker(title, options, index, header) {
        picker = Menu.open(title, options, index, header);
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

    function apply(text, id, stretch, title) {
        var parsed = SubtitleFile.parse(text);
        if (!parsed.length) throw new Error('Invalid subtitle file');
        hooks.embeddedOff();
        cues = parsed;
        fileId = id;
        scale = stretch || 1;
        name = title || '';
        lastText = null;
        remember();
        sync();
    }

    // "limit reached", "key not accepted" or "no connection".
    function reason(error) {
        return I18n.t('opensubs.why.' + ({ badKey: 'badKey', quota: 'quota', badFile: 'badFile' }[error && error.code] || 'connection'));
    }

    // A download refused by one provider (expired key, used-up limit, no
    // connection) moves on to the best result from another, and says so.
    function moveOn(match, error, failed) {
        failed[match.source || 'opensubtitles'] = true;
        var next = match.from ? null : found.filter(function (other) { return !failed[other.source || 'opensubtitles']; })[0];
        if (!next) return report(error);
        hooks.toast(I18n.t('opensubs.switched', { from: sourceName(match), why: reason(error), to: sourceName(next) }));
        Log.info('SUBS download failed ' + (match.source || 'opensubtitles') + ' ' + (error && error.status) + ', trying ' + next.source);
        return choose(next, failed);
    }

    function choose(match, failed) {
        var mine = ++generation;
        var alive = openPicker(I18n.t(match.from ? 'opensubs.translating' : 'opensubs.downloading', { p: 0 }), [{ label: I18n.t('common.cancel') }]);
        if (match.from) {
            match.progress = function (done, total) {
                if (mine === generation && alive()) Menu.retitle(I18n.t('opensubs.translating', { p: Math.round(done / total * 100) }));
            };
        }
        return SubtitleStore.obtain(match.file_id, match).then(function (result) {
            if (mine !== generation || !alive()) return;
            var stretch = ratio(match);
            apply(result.text, match.file_id, stretch, match.title || languageName(match.language) + ' · ' + match.release);
            closePicker();
            Log.info('SUBS picked fps ' + (SubtitleRank.rate(match.fps) || '?') + ' scale ' + stretch.toFixed(4));
            if (stretch !== 1) toast('retimed', { from: +SubtitleRank.rate(match.fps).toFixed(3), to: +video.fps.toFixed(3) });
            if (result.remaining !== null && isFinite(result.remaining) && result.remaining < 10) toast('remaining', { n: result.remaining });
        }).catch(function (error) {
            if (mine !== generation || !alive()) return;
            closePicker();
            return moveOn(match, error, failed || {});
        });
    }

    // "ar" -> "العربية", in the language's own name when the app knows it.
    function languageName(code) {
        var app = { be: 'by', 'zh-cn': 'zh', 'zh-tw': 'zhtw' }[code] || code;
        var known = I18n.languages().filter(function (entry) { return entry.code === app; })[0];
        return known ? known.name : String(code || '').toUpperCase();
    }

    // 12345 -> "12k", the way a badge has room for.
    function short(count) {
        var n = Number(count) || 0;
        if (n >= 1e6) return +(n / 1e6).toFixed(n < 1e7 ? 1 : 0) + 'M';
        if (n >= 1e3) return +(n / 1e3).toFixed(n < 1e4 ? 1 : 0) + 'k';
        return String(n);
    }

    function sourceName(match) {
        return { subdl: 'SubDL', subsource: 'Subsource' }[match.source] || 'OpenSubtitles';
    }

    // The badges after the release: [text, class, spoken name].
    function badges(match) {
        var list = [[sourceName(match), 'sp-src ' + (match.source || 'opensubtitles')]];
        if (match.recommended) list.push(['★', 'sp-best', I18n.t('opensubs.recommended')]);
        if (match.hashMatch) list.push(['✓', 'sp-exact', I18n.t('opensubs.exact')]);
        else if (match.marks.length) list.push(['≈', 'sp-fit', I18n.t('opensubs.fits')]);
        if (match.downloads) list.push(['⬇ ' + short(match.downloads), 'sp-count']);
        if (match.hearing) list.push(['CC', 'sp-tag', I18n.t('opensubs.hearing')]);
        if (match.machine) list.push(['AI', 'sp-tag sp-warn', I18n.t('opensubs.machine')]);
        return list;
    }

    function label(match) {
        return [match.release].concat(badges(match).map(function (badge) { return badge[2] || badge[0]; })).join(' · ');
    }

    // Two short lines: the release, then the source and small badges.
    function view(match) {
        return UI.html`<div class="sp-release">${match.release || I18n.t('opensubs.downloaded')}</div>
            <div class="sp-badges">${badges(match).map(function (badge) { return UI.html`<span class=${badge[1]}>${badge[0]}</span>`; })}</div>`;
    }

    // "8 found · OpenSubtitles 5 · SubDL 3", and which provider failed.
    function summary(matches, outcomes) {
        return [I18n.t('opensubs.found', { n: matches.length })].concat(outcomes.map(function (outcome) {
            if (outcome.error) return outcome.provider.name + ': ' + reason(outcome.error);
            return outcome.provider.name + ' ' + matches.filter(function (match) { return (match.source || 'opensubtitles') === outcome.provider.id; }).length;
        })).join(' · ');
    }

    // Asks every provider with a key at the same time; one that fails or
    // finds nothing leaves the others' results.
    function ask(list, known, language) {
        return Promise.all(list.map(function (provider) {
            var query = provider.id === 'opensubtitles' && current.movieHash ? Object.assign({}, known, { moviehash: current.movieHash }) : known;
            return Promise.resolve().then(function () { return provider.api().search(query, language, 60); }).then(function (results) {
                return { provider: provider, results: (results || []).map(function (match) { return Object.assign({ source: provider.id }, match); }) };
            }, function (error) { return { provider: provider, results: [], error: error }; });
        }));
    }

    function showList(matches, outcomes, language, backup) {
        openPicker(I18n.t('opensubs.listTitle', { language: languageName(language) }), matches.map(function (match) {
            return { label: label(match), view: view(match), run: function () { choose(match); } };
        }).concat([{ label: I18n.t('common.cancel') }]), 0, { sub: (backup ? I18n.t('opensubs.fromBackup') + ' · ' : '') + summary(matches, outcomes) });
    }

    // "Translate from العربية": the only row when no provider has the language.
    function offerTranslation(info, language) {
        var from = language === 'ar' ? 'en' : 'ar';
        var row = { from: from };
        row.label = I18n.t('opensubs.translateFrom', { language: languageName(from) });
        row.view = UI.html`<div class="sp-release">${row.label}</div>
            <div class="sp-badges"><span class="sp-src deepl">DeepL</span><span class="sp-tag sp-warn">AI</span></div>`;
        row.run = function () { translateFrom(info, from, language); };
        openPicker(I18n.t('opensubs.listTitle', { language: languageName(language) }), [row, { label: I18n.t('common.cancel') }], 0,
            { sub: I18n.t('opensubs.noneIn', { language: languageName(language) }) });
    }

    // Finds the best subtitle in from, then translates it into language.
    function translateFrom(info, from, language) {
        var mine = ++generation;
        var secret = keys();
        var alive = openPicker(I18n.t('opensubs.searching'), [{ label: I18n.t('common.cancel') }]);
        return ask(providers(false).concat(providers(true)), info, from).then(function (outcomes) {
            if (mine !== generation || !alive() || secret !== keys()) return;
            var results = [].concat.apply([], outcomes.map(function (outcome) { return outcome.results; }));
            var best = SubtitleRank.rank(results, info && info.video).filter(function (match) { return !match.machine; })[0];
            if (!best) {
                closePicker();
                return toast('noResults');
            }
            return choose({ file_id: SubtitleTranslate.id(best.file_id, language), source: best, from: from, to: language,
                language: language, release: best.release, fps: best.fps, machine: true, marks: [],
                title: languageName(language) + ' · ' + I18n.t('opensubs.translatedFrom', { language: languageName(from) }) });
        }).catch(function (error) {
            if (mine !== generation || !alive()) return;
            closePicker();
            report(error);
        });
    }

    function search() {
        var list = providers(false);
        var backup = backupOn() ? providers(true) : [];
        if (!list.length && !backup.length) {
            toast('setFirst');
            return Promise.resolve();
        }
        var mine = ++generation;
        var secret = keys();
        var language = String(Prefs.get('subtitleLanguages')).split(',')[0];
        var alive = openPicker(I18n.t('opensubs.searching'), [{ label: I18n.t('common.cancel') }]);
        var info = null;
        var lookup = current.subtitleLookup ? current.subtitleLookup() : Promise.resolve({ title: current.title });
        var rounds = [list, backup].filter(function (round) { return round.length; });
        // Each round only runs when the ones before it found nothing.
        var next = function (at, earlier) {
            return ask(rounds[at], info, language).then(function (outcomes) {
                if (mine !== generation || !alive() || secret !== keys()) return;
                var results = [].concat.apply([], outcomes.map(function (outcome) { return outcome.results; }));
                video = SubtitleRank.facts(info && info.video);
                var matches = SubtitleRank.rank(results, info && info.video).slice(0, 12);
                logFacts(results, outcomes);
                found = matches;
                if (matches.length) return showList(matches, outcomes, language, rounds[at] === backup);
                var all = earlier.concat(outcomes);
                if (at + 1 < rounds.length) return next(at + 1, all);
                if (translator()) return offerTranslation(info, language);
                closePicker();
                var failed = all.filter(function (outcome) { return outcome.error && outcome.error.code !== 'noResults'; })[0];
                return failed ? report(failed.error) : toast('noResults');
            });
        };
        return lookup.then(function (known) {
            if (mine !== generation || !alive() || secret !== keys()) return null;
            info = known;
            return next(0, []);
        }).catch(function (error) {
            if (mine !== generation || !alive()) return;
            closePicker();
            report(error);
        });
    }

    // What the alignment can use, for the TV log: never titles, links or keys.
    function logFacts(results, outcomes) {
        Log.info('SUBS providers ' + outcomes.map(function (outcome) {
            return outcome.provider.id + ' ' + (outcome.error ? 'failed ' + outcome.error.status : outcome.results.length);
        }).join(', '));
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
        name = '';
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
            if (SubtitleFile.parse(text).length) apply(text, saved.file_id, stretch > 0.9 && stretch < 1.1 ? stretch : 1, saved.name);
        }
        timer = setInterval(sync, 100);
    }

    function shift(step) {
        offset = Math.max(-600000, Math.min(600000, offset + step));
        remember();
        sync();
    }

    function seconds(ms) {
        return (ms > 0 ? '+' : ms < 0 ? '−' : '') + (Math.abs(ms) / 1000).toFixed(1) + ' s';
    }

    // The Subtitles group gets Off, the downloaded file and the online search;
    // with a downloaded file on, a Subtitle timing group follows, showing the
    // delay as its value (head is the menu's group starter).
    function menuEntries(item, embeddedChoices, head) {
        if (!current || current.live) return;
        if (!embeddedChoices) item(I18n.t('common.off'), !cues.length, off);
        if (cues.length) item(name || I18n.t('opensubs.downloaded'), true, function () {});
        item(I18n.t('opensubs.download'), false, function () { hooks.closeMenu(); search(); });
        // Subsource and translation, used only when the first search finds nothing.
        item(I18n.t('opensubs.backup', { state: I18n.t(backupOn() ? 'common.on' : 'common.off') }), false, function () {
            Prefs.set('subtitleFallback', !backupOn());
        });
        if (cues.length && found.length > 1) item(I18n.t('opensubs.next'), false, function () { hooks.closeMenu(); tryNext(); });
        if (!cues.length) return;
        if (head) head(I18n.t('opensubs.timing'), offset ? seconds(offset) : I18n.t('opensubs.inSync'));
        item(I18n.t('opensubs.syncLine'), false, syncToLine);
        [-5000, -500, 500, 5000].forEach(function (step) {
            var size = Math.abs(step) >= 1000 ? '5' : '0.5';
            item(I18n.t(step < 0 ? 'opensubs.earlier' : 'opensubs.later', { s: size }), false, function () { shift(step); });
        });
        if (offset) item(I18n.t('opensubs.resetTiming'), false, function () { shift(-offset); });
    }

    return { start: start, stop: stop, active: function () { return cues.length > 0; }, off: off,
        menuEntries: menuEntries, search: search };
};
