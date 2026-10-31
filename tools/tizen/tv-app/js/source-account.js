// What the viewer sees of a source's account: expiry, status, connections and
// health. Xtream accounts come from player_api.php (user_info); M3U sources
// have no account, so they only show their type and channel count.
window.SourceAccount = (function () {
    'use strict';

    var DAY = 86400000;
    var WARN_DAYS = 7;
    // Settings shows each source's account; asking the provider again sooner
    // than this only adds calls (a provider may block an account for them).
    var FRESH_MS = 30 * 60000;
    var SAVED = 'iptvnator-tv:account-health';
    // The account fields a row shows; the login itself is never saved.
    var KEPT = ['auth', 'status', 'exp_date', 'active_cons', 'max_connections', 'allowed_output_formats'];
    var CHIPS = { get expired() { return I18n.t('account.expired'); }, get inactive() { return I18n.t('account.inactive'); }, get login() { return I18n.t('account.loginFailed'); }, get down() { return I18n.t('account.down'); } };
    var COUNTED = {
        get live() { return I18n.t('account.unitChannels'); },
        get movies() { return I18n.t('account.unitMovies'); },
        get series() { return I18n.t('account.unitShows'); },
    };
    var KEYS = { live: 'live:items:', movies: 'movies:items:', series: 'series:items:' };

    // The newest check per source id: { state, info, at }. State is 'ok', a
    // reason from problem(), or 'down' when the provider did not answer.
    var health = load();
    // Counts read from the saved catalogue only; nothing is downloaded for them.
    var counts = {};
    var checking = {};
    var versions = {};
    var warned = {};

    function load() {
        try {
            var saved = JSON.parse(Stored.text(SAVED));
            return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
        } catch (e) {
            return {};
        }
    }

    function save() {
        var kept = {};
        Object.keys(health).forEach(function (id) {
            var known = health[id];
            var info = null;
            if (known.info) {
                info = {};
                KEPT.forEach(function (field) { if (known.info[field] !== undefined) info[field] = known.info[field]; });
            }
            kept[id] = { state: known.state, info: info, at: known.at };
        });
        try {
            Stored.save(SAVED, kept);
        } catch (e) {
            // Storage full: the checks still hold until the app closes.
        }
    }

    function expiry(info) {
        var seconds = Number(info && info.exp_date);
        return seconds > 0 ? seconds * 1000 : null;
    }

    function day(ms) {
        return I18n.date(ms);
    }

    // Why an Xtream account cannot be used, or null. Expired, inactive and a
    // wrong login need different advice, so they stay apart.
    function problem(info, now) {
        now = now === undefined ? Date.now() : now;
        if (!info || String(info.auth) !== '1') {
            return { reason: 'login', message: I18n.t('account.checkLogin'), expires: null };
        }
        var expires = expiry(info);
        var status = String(info.status || '');
        var active = !status || /^active$/i.test(status);
        if (/^expired$/i.test(status) || (active && expires !== null && expires <= now)) {
            return { reason: 'expired', message: I18n.t('account.accountExpired'), expires: expires };
        }
        if (!active) return { reason: 'inactive', message: I18n.t('account.accountInactive'), expires: expires };
        return null;
    }

    // Days left when the account runs out within the warning window, else 0.
    function daysLeft(info, now) {
        var expires = expiry(info);
        now = now === undefined ? Date.now() : now;
        if (expires === null || expires <= now || expires - now > WARN_DAYS * DAY) return 0;
        return Math.max(1, Math.ceil((expires - now) / DAY));
    }

    function remaining(days) {
        return days <= 1 ? I18n.t('account.inLessThanDay') : I18n.t('account.inDays', { n: days });
    }

    function stateOf(err) {
        return err && err.code === 'account' ? err.reason || 'login' : 'down';
    }

    // Records the outcome of an account check and passes the result through.
    function track(source, promise) {
        var version = versions[source.id] || 0;
        function set(state, info) {
            if ((versions[source.id] || 0) !== version) return;
            health[source.id] = { state: state, info: info || null, at: Date.now() };
            save();
        }
        return promise.then(function (info) {
            set('ok', info);
            return info;
        }, function (err) {
            set(stateOf(err), err && err.info);
            throw err;
        });
    }

    // One background account check; resolves true when it ran. The check must
    // not replace the log's secrets, which belong to the source in use.
    function check(source) {
        var known = health[source.id];
        if (source.type !== 'xtream') return Promise.resolve(false);
        if (checking[source.id]) return checking[source.id];
        if (known && Date.now() - known.at < FRESH_MS) return Promise.resolve(false);
        var done = function () {
            delete checking[source.id];
            return true;
        };
        checking[source.id] = track(source, Promise.resolve().then(function () {
            return XtreamSource(source, { quiet: true }).account();
        })).then(done, done);
        return checking[source.id];
    }

    function readCounts(source) {
        var wanted = source.type === 'xtream' ? Object.keys(KEYS) : ['live'];
        return Promise.all(wanted.map(function (name) {
            var key = source.type === 'xtream' ? KEYS[name] : 'live:categories';
            return Catalogue.get(source.id, key).then(function (list) {
                if (!Array.isArray(list)) return undefined;
                return source.type === 'xtream' ? list.length : list[0] && list[0].count;
            });
        })).then(function (numbers) {
            var found = {};
            wanted.forEach(function (name, i) {
                if (typeof numbers[i] === 'number') found[name] = numbers[i];
            });
            var changed = JSON.stringify(found) !== JSON.stringify(counts[source.id] || {});
            counts[source.id] = found;
            return changed;
        }, function () {
            return false;
        });
    }

    // Checks every Xtream source and re-reads the saved counts; `changed` runs
    // whenever a row would look different.
    function refresh(sources, changed) {
        sources.forEach(function (source) {
            readCounts(source).then(function (differs) {
                if (differs) changed();
            });
            check(source).then(function (ran) {
                if (ran) changed();
            });
        });
    }

    function forget(id) {
        versions[id] = (versions[id] || 0) + 1;
        delete health[id];
        save();
        delete counts[id];
        delete checking[id];
        delete warned[id];
    }

    function channelCount(id) {
        var found = counts[id];
        return found && found.live !== undefined ? I18n.t('account.nChannels', { n: found.live }) : '';
    }

    function expiryText(info, now) {
        var expires = expiry(info);
        if (expires === null) return '';
        if (expires <= (now || Date.now())) return I18n.t('account.expiredOn', { date: day(expires) });
        var days = daysLeft(info, now);
        return I18n.t('account.expires', { when: days ? remaining(days) : day(expires) });
    }

    // The fields a Sources row needs: a right-hand chip and a subtitle line.
    // The source in use says so with its own badge, beside the name.
    function row(source, guide) {
        var known = health[source.id];
        var info = known && known.info;
        var parts = [];
        if (guide) parts.push(guide);
        parts.push(channelCount(source.id));
        if (source.type === 'xtream') parts.push(expiryText(info));
        var chip = known && CHIPS[known.state] || '';
        return {
            chip: chip || (source.type === 'xtream' ? 'Xtream' : 'M3U'),
            warn: !!chip,
            detail: parts.filter(Boolean).join(' · '),
        };
    }

    // Colours the chip and adds the subtitle line under a source's name. The
    // name stays alone in .label so the row's name can still be read.
    function formats(info) {
        var list = info && info.allowed_output_formats;
        if (typeof list === 'string') list = list.split(',');
        return Array.isArray(list) ? list.map(function (f) { return String(f).trim(); }).filter(Boolean).join(', ') : '';
    }

    function statusText(info, state) {
        if (state === 'expired') return I18n.t('account.expired');
        if (state === 'inactive') return info && info.status ? info.status : I18n.t('account.inactive');
        return info && info.status || I18n.t('account.unknown');
    }

    // Rows for the source details pane. `info` is the account the app is using
    // when this is the current source; otherwise the newest background check.
    function detailRows(source, info) {
        var known = health[source.id];
        var rows = [];
        if (source.type !== 'xtream') {
            if (info && info.channels !== undefined) {
                var rows = [{ label: I18n.t('account.channelsInGroups', { channels: info.channels, groups: info.groups }) }];
                if (info.movies) rows.push({ label: I18n.t('account.nMovies', { n: info.movies }) });
                if (info.shows) rows.push({ label: I18n.t('account.nShows', { n: info.shows }) });
                return rows;
            }
            return channelCount(source.id) ? [{ label: I18n.t('account.inCatalogue', { count: channelCount(source.id) }) }] : [];
        }
        info = info || (known && known.info);
        if (known && known.state === 'down' && !info) return [{ label: I18n.t('account.statusDown') }];
        if (known && known.state === 'login' && !info) return [{ label: I18n.t('account.statusLogin') }];
        if (!info) return [];
        var expires = expiry(info);
        rows.push({ label: I18n.t('account.status', { status: statusText(info, known && known.state) }) });
        rows.push({ label: I18n.t('account.expiresRow', { when: expires === null ? I18n.t('account.never') : day(expires) }) });
        rows.push({ label: I18n.t('account.connections', { used: info.active_cons || 0, max: info.max_connections || '?' }) });
        if (formats(info)) rows.push({ label: I18n.t('account.formats', { formats: formats(info) }) });
        var saved = Object.keys(COUNTED).filter(function (name) {
            return counts[source.id] && counts[source.id][name] !== undefined;
        }).map(function (name) {
            return counts[source.id][name] + ' ' + COUNTED[name];
        });
        if (saved.length) rows.push({ label: I18n.t('account.catalogueRow', { counts: saved.join(', ') }) });
        return rows;
    }

    // Tells the viewer once per source when the account is about to run out.
    function warn(source, info, notify) {
        var days = daysLeft(info);
        var expires = expiry(info);
        if (!days || warned[source.id] === expires) return;
        warned[source.id] = expires;
        notify(I18n.t('account.warn', { when: remaining(days), date: day(expires) }), 6000);
    }

    // The full-screen text for a failed account check.
    function screen(err) {
        var status = err.info && err.info.status ? String(err.info.status).toLowerCase() : '';
        if (err.reason === 'expired') {
            return [I18n.t('account.accountExpired'), (err.expires ? I18n.t('account.expiredOnFull', { date: day(err.expires) }) : I18n.t('account.hasExpired')) +
                ' ' + I18n.t('account.renew')];
        }
        if (err.reason === 'inactive') {
            return [I18n.t('account.accountInactive'), I18n.t('account.reportsInactive', { status: status || I18n.t('account.notActive') })];
        }
        return [I18n.t('account.wrongLogin'), I18n.t('account.wrongLoginHint')];
    }

    return {
        problem: problem,
        daysLeft: daysLeft,
        track: track,
        refresh: refresh,
        forget: forget,
        row: row,
        detailRows: detailRows,
        warn: warn,
        screen: screen,
    };
})();
