// Downloaded subtitles for movies and episodes (#30, #39, #52): search
// OpenSubtitles and SubDL together and pick from one ranked list, then keep
// them in time with the voice. Only when both find nothing, and the Backup
// search switch is on, Subsource is asked, and then a subtitle in another
// language can be translated with DeepL. A subtitle
// timed for another frame rate is stretched to the video's (scale); the
// delay is set with the Sync subtitles bar (subtitle-sync.js), and the next
// episode of the same release starts with the delay chosen last; and the
// next result can be tried without searching again.
window.SubtitleDownload = function (hooks) {
    'use strict';

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
        bar.tick();
    }

    // The delay a show's next episode starts with: kept per show for files
    // of the same release (subtitle-sync.js family), whatever the episode.
    function rememberShow() {
        if (current && current.subtitleShow) SubtitleStore.save(current.subtitleShow, null, offset, 1, SubtitleSync.family(name));
    }

    function showDelay() {
        var saved = current && current.subtitleShow ? SubtitleStore.title(current.subtitleShow) : {};
        return saved.name && saved.name === SubtitleSync.family(name) && isFinite(saved.offset) ? Number(saved.offset) : 0;
    }

    var bar = SubtitleSync.create({
        root: hooks.root,
        cues: function () { return cues; },
        offset: function () { return offset; },
        scale: function () { return scale; },
        setOffset: function (ms) {
            offset = ms;
            lastText = null;
            sync();
        },
        keep: function () {
            remember();
            rememberShow();
            toast('timingSaved');
        },
        position: hooks.position,
        play: function () { if (hooks.play) hooks.play(); },
        pause: function () { if (hooks.pause) hooks.pause(); },
        paused: function () { return !!(hooks.paused && hooks.paused()); },
        hideControls: function () { if (hooks.hideControls) hooks.hideControls(); },
    });

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
    // An unusable file only rules out that file; a refused key, a used-up
    // limit or no connection rules out its provider.
    function moveOn(match, error, failed) {
        failed[error && error.code === 'badFile' ? match.file_id : match.source || 'opensubtitles'] = true;
        var next = match.from ? null : found.filter(function (other) {
            return !failed[other.source || 'opensubtitles'] && !failed[other.file_id];
        })[0];
        if (!next) return report(error);
        var same = (next.source || 'opensubtitles') === (match.source || 'opensubtitles');
        hooks.toast(I18n.t(same ? 'opensubs.nextFile' : 'opensubs.switched', { from: sourceName(match), why: reason(error), to: sourceName(next) }));
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
        // A first subtitle for this title, of a named release, may take the show's timing.
        var firstFile = !SubtitleStore.title(current.subtitleId || current.id).file_id && !!String(match.release || '').trim();
        return SubtitleStore.obtain(match.file_id, match).then(function (result) {
            if (mine !== generation || !alive()) return;
            var stretch = ratio(match);
            apply(result.text, match.file_id, stretch, match.title || languageName(match.language) + ' · ' + match.release);
            // The next episode of a release synced before starts with that delay.
            var reuse = firstFile && !offset ? showDelay() : 0;
            if (reuse) {
                offset = reuse;
                lastText = null;
                remember();
                sync();
                toast('sameTiming', { shift: seconds(reuse) });
            }
            // Chosen by hand: it shows again next time, even after an earlier Off.
            AudioChoice.forgetSubtitleOff(current);
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

    // The first word of a release that is about the video, not the title.
    var FORMAT = /^(\d{3,4}[pi]|4k|uhd|web(-?(dl|rip))?|blu-?ray|b[dr]rip|hdtv|hdrip|dvd(rip)?|webrip|x26[45]|h\.?26[45]|hevc|avc|xvid|amzn|nf|dsnp|hmax|atvp|hulu|shahid|osn|ddp?\d?|aac\d?|ac3|hdr\d*|10bit|proper|repack|internal|remux)(-.*)?$/i;

    // "Mona.Lisa.S01E02.1080p.WEB-DL.x264-GRP" -> name "Mona Lisa S01E02",
    // format "1080p · WEB-DL · x264-GRP"; a release with no format word is all name.
    function releaseParts(release) {
        // Dots split words, except inside "5.1", "AAC2.0" and "H.264".
        var words = String(release || '').replace(/[._]/g, function (mark, at, text) {
            var before = text.charAt(at - 1), after = text.slice(at + 1);
            var keep = mark === '.' && ((/\d/.test(before) && /^\d(?![\da-z])/i.test(after)) || (/h/i.test(before) && /^26[45]/.test(after)));
            return keep ? '.' : ' ';
        }).trim().split(/\s+/).filter(Boolean);
        var at = 0;
        while (at < words.length && !FORMAT.test(words[at])) at++;
        if (!at) return { name: words.join(' '), format: '' };
        return { name: words.slice(0, at).join(' '), format: words.slice(at).join(' · ') };
    }

    // The full name (up to two lines), the video format under it, then the source and small badges.
    function view(match) {
        var parts = releaseParts(match.release);
        return UI.html`<div class="sp-release">${parts.name || I18n.t('opensubs.downloaded')}</div>
            ${parts.format ? UI.html`<div class="sp-format">${parts.format}</div>` : null}
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
    // The languages DeepL translates from, beyond English and Arabic.
    var DEEPL_SOURCES = ['fr', 'es', 'de', 'it', 'pt', 'tr', 'nl', 'pl', 'ru', 'uk', 'ko', 'ja', 'zh', 'id', 'sv', 'da',
        'nb', 'fi', 'cs', 'sk', 'sl', 'ro', 'hu', 'bg', 'el', 'et', 'lv', 'lt', 'he', 'th', 'vi'];

    function offerTranslation(info, language) {
        var row = { from: 'any' };
        row.label = I18n.t('opensubs.translateAny');
        row.view = UI.html`<div class="sp-release">${row.label}</div>
            <div class="sp-badges"><span class="sp-src deepl">DeepL</span><span class="sp-tag sp-warn">AI</span></div>`;
        row.run = function () { translateFrom(info, language); };
        openPicker(I18n.t('opensubs.listTitle', { language: languageName(language) }), [row, { label: I18n.t('common.cancel') }], 0,
            { sub: I18n.t('opensubs.noneIn', { language: languageName(language) }) });
    }

    // Finds the best subtitle in from, then translates it into language.
    // The subtitle to translate: English, then Arabic (every provider), then
    // any language DeepL reads (the providers that search many at once).
    function translateFrom(info, language) {
        var mine = ++generation;
        var secret = keys();
        var alive = openPicker(I18n.t('opensubs.searching'), [{ label: I18n.t('common.cancel') }]);
        var all = providers(false).concat(providers(true));
        var many = all.filter(function (provider) { return provider.id !== 'subsource'; });
        var steps = ['en', 'ar'].filter(function (code) { return code !== language; }).map(function (code) { return { list: all, lang: code }; });
        steps.push({ list: many, lang: DEEPL_SOURCES.filter(function (code) { return code !== language; }).join(',') });
        var source = function (at) {
            if (at >= steps.length || !steps[at].list.length) return Promise.resolve(null);
            return ask(steps[at].list, info, steps[at].lang).then(function (outcomes) {
                if (mine !== generation || !alive() || secret !== keys()) return null;
                var results = [].concat.apply([], outcomes.map(function (outcome) { return outcome.results; }));
                var best = SubtitleRank.rank(results, info && info.video).filter(function (match) { return !match.machine && !match.forced; })[0];
                return best || source(at + 1);
            });
        };
        return source(0).then(function (best) {
            if (mine !== generation || !alive() || secret !== keys()) return;
            if (!best) {
                closePicker();
                return toast('noResults');
            }
            var from = String(best.language || '').toLowerCase().split(/[-_]/)[0] || 'en';
            Log.info('SUBS translating from ' + from);
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

    // The Sync subtitles bar, over the video: 'listen' waits for the next
    // line, 'choose' lists every line first.
    function openSync(mode) {
        hooks.closeMenu();
        // The bar sits where the title and clock are; only the picture stays.
        if (hooks.hideControls) hooks.hideControls();
        bar.open(mode);
    }

    function stop() {
        generation++;
        bar.stop();
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
        if (saved.file_id && AudioChoice.subtitle(request) !== false) {
            var text = SubtitleStore.cached(saved.file_id);
            var stretch = Number(saved.scale);
            if (SubtitleFile.parse(text).length) apply(text, saved.file_id, stretch > 0.9 && stretch < 1.1 ? stretch : 1, saved.name);
        }
        timer = setInterval(sync, 100);
    }

    function seconds(ms) {
        return (ms > 0 ? '+' : ms < 0 ? '−' : '') + (Math.abs(ms) / 1000).toFixed(1) + ' s';
    }

    // The Subtitles group gets Off, the downloaded file and the online search;
    // with a downloaded file on, a Subtitle timing group follows, showing the
    // delay as its value (head is the menu's group starter).
    function menuEntries(item, embeddedChoices, head) {
        if (!current || current.live) return;
        if (!embeddedChoices) item(I18n.t('common.off'), !cues.length, function () { off(); AudioChoice.rememberSubtitle(current, false); });
        if (cues.length) item(name || I18n.t('opensubs.downloaded'), true, function () {});
        item(I18n.t('opensubs.download'), false, function () { hooks.closeMenu(); search(); });
        // Subsource and translation, used only when the first search finds nothing.
        item(I18n.t('opensubs.backup', { state: I18n.t(backupOn() ? 'common.on' : 'common.off') }), false, function () {
            Prefs.set('subtitleFallback', !backupOn());
        });
        if (cues.length && found.length > 1) item(I18n.t('opensubs.next'), false, function () { hooks.closeMenu(); tryNext(); });
        if (!cues.length) return;
        if (head) head(I18n.t('opensubs.timing'), offset ? seconds(offset) : I18n.t('opensubs.inSync'));
        item(I18n.t('opensubs.syncOpen'), false, function () { openSync('listen'); });
        item(I18n.t('opensubs.syncLine'), false, function () { openSync('choose'); });
        if (offset) item(I18n.t('opensubs.resetTiming'), false, function () {
            offset = 0;
            lastText = null;
            remember();
            rememberShow();
            sync();
        });
    }

    return { start: start, stop: stop, active: function () { return cues.length > 0; }, off: off,
        menuEntries: menuEntries, search: search,
        // The Sync subtitles bar takes the remote while it shows.
        syncing: function () { return bar.isOpen(); }, syncKey: bar.key };
};
