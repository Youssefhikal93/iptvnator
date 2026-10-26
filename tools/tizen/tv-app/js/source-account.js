// What the viewer sees of a source's account: expiry, status, connections and
// health. Xtream accounts come from player_api.php (user_info); M3U sources
// have no account, so they only show their type and channel count.
window.SourceAccount = (function () {
    'use strict';

    var DAY = 86400000;
    var WARN_DAYS = 7;
    var FRESH_MS = 60000;
    var CHIPS = { expired: 'Expired', inactive: 'Inactive', login: 'Login failed', down: 'Not responding' };
    var COUNTED = {
        live: 'channels',
        movies: 'movies',
        series: 'shows',
    };
    var KEYS = { live: 'live:items:', movies: 'movies:items:', series: 'series:items:' };

    // The newest check per source id: { state, info, at }. State is 'ok', a
    // reason from problem(), or 'down' when the provider did not answer.
    var health = {};
    // Counts read from the saved catalogue only; nothing is downloaded for them.
    var counts = {};
    var checking = {};
    var versions = {};
    var warned = {};

    function expiry(info) {
        var seconds = Number(info && info.exp_date);
        return seconds > 0 ? seconds * 1000 : null;
    }

    function day(ms) {
        return new Date(ms).toLocaleDateString();
    }

    // Why an Xtream account cannot be used, or null. Expired, inactive and a
    // wrong login need different advice, so they stay apart.
    function problem(info, now) {
        now = now === undefined ? Date.now() : now;
        if (!info || String(info.auth) !== '1') {
            return { reason: 'login', message: 'Check the source login and subscription', expires: null };
        }
        var expires = expiry(info);
        var status = String(info.status || '');
        var active = !status || /^active$/i.test(status);
        if (/^expired$/i.test(status) || (active && expires !== null && expires <= now)) {
            return { reason: 'expired', message: 'Account expired', expires: expires };
        }
        if (!active) return { reason: 'inactive', message: 'Account inactive', expires: expires };
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
        return days <= 1 ? 'in less than a day' : 'in ' + days + ' days';
    }

    function stateOf(err) {
        return err && err.code === 'account' ? err.reason || 'login' : 'down';
    }

    // Records the outcome of an account check and passes the result through.
    function track(source, promise) {
        var version = versions[source.id] || 0;
        function set(state, info) {
            if ((versions[source.id] || 0) === version) health[source.id] = { state: state, info: info || null, at: Date.now() };
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
        delete counts[id];
        delete checking[id];
        delete warned[id];
    }

    function channelCount(id) {
        var found = counts[id];
        return found && found.live !== undefined ? found.live + ' channels' : '';
    }

    function expiryText(info, now) {
        var expires = expiry(info);
        if (expires === null) return '';
        if (expires <= (now || Date.now())) return 'Expired ' + day(expires);
        var days = daysLeft(info, now);
        return days ? 'Expires ' + remaining(days) : 'Expires ' + day(expires);
    }

    // The fields a Sources row needs: a right-hand chip and a subtitle line.
    function row(source, current, guide) {
        var known = health[source.id];
        var info = known && known.info;
        var parts = [];
        if (current) parts.push('Active');
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
    function decorate(el, entry) {
        var chip = el.querySelector('.badge');
        if (chip && entry.warn) chip.classList.add('warn');
        if (!entry.detail) return;
        var subtitle = document.createElement('div');
        subtitle.className = 'source-guide-status';
        subtitle.textContent = entry.detail;
        var label = el.querySelector('.label');
        var box = document.createElement('div');
        box.className = 'source-text';
        el.replaceChild(box, label);
        box.appendChild(label);
        box.appendChild(subtitle);
    }

    function formats(info) {
        var list = info && info.allowed_output_formats;
        if (typeof list === 'string') list = list.split(',');
        return Array.isArray(list) ? list.map(function (f) { return String(f).trim(); }).filter(Boolean).join(', ') : '';
    }

    function statusText(info, state) {
        if (state === 'expired') return 'Expired';
        if (state === 'inactive') return info && info.status ? info.status : 'Inactive';
        return info && info.status || 'unknown';
    }

    // Rows for the source details pane. `info` is the account the app is using
    // when this is the current source; otherwise the newest background check.
    function detailRows(source, info) {
        var known = health[source.id];
        var rows = [];
        if (source.type !== 'xtream') {
            if (info && info.channels !== undefined) return [{ label: info.channels + ' channels in ' + info.groups + ' groups' }];
            return channelCount(source.id) ? [{ label: channelCount(source.id) + ' in the catalogue' }] : [];
        }
        info = info || (known && known.info);
        if (known && known.state === 'down' && !info) return [{ label: 'Status: Not responding' }];
        if (known && known.state === 'login' && !info) return [{ label: 'Status: Login failed' }];
        if (!info) return [];
        var expires = expiry(info);
        rows.push({ label: 'Status: ' + statusText(info, known && known.state) });
        rows.push({ label: 'Expires: ' + (expires === null ? 'Never' : day(expires)) });
        rows.push({ label: 'Connections: ' + (info.active_cons || 0) + ' / ' + (info.max_connections || '?') });
        if (formats(info)) rows.push({ label: 'Formats: ' + formats(info) });
        var saved = Object.keys(COUNTED).filter(function (name) {
            return counts[source.id] && counts[source.id][name] !== undefined;
        }).map(function (name) {
            return counts[source.id][name] + ' ' + COUNTED[name];
        });
        if (saved.length) rows.push({ label: 'In the catalogue: ' + saved.join(', ') });
        return rows;
    }

    // Tells the viewer once per source when the account is about to run out.
    function warn(source, info, notify) {
        var days = daysLeft(info);
        var expires = expiry(info);
        if (!days || warned[source.id] === expires) return;
        warned[source.id] = expires;
        notify('Account expires ' + remaining(days) + ' (' + day(expires) + ')', 6000);
    }

    // The full-screen text for a failed account check.
    function screen(err) {
        var status = err.info && err.info.status ? String(err.info.status).toLowerCase() : '';
        if (err.reason === 'expired') {
            return ['Account expired', (err.expires ? 'This account expired on ' + day(err.expires) + '.' : 'This account has expired.') +
                ' Renew it with your provider, or choose another source.'];
        }
        if (err.reason === 'inactive') {
            return ['Account inactive', 'The provider reports this account as ' + (status || 'not active') + '. Contact your provider, or choose another source.'];
        }
        return ['Wrong login', 'The provider did not accept this username and password. Edit the source in Sources.'];
    }

    return {
        problem: problem,
        daysLeft: daysLeft,
        track: track,
        refresh: refresh,
        forget: forget,
        row: row,
        decorate: decorate,
        detailRows: detailRows,
        warn: warn,
        screen: screen,
    };
})();
