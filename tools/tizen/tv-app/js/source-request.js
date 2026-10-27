// Every request to a provider goes through here, paced so the app stays well
// under the flood limits providers set (and do not publish): at most
// MAX_ACTIVE requests at once per provider, started at least GAP_MS apart.
// Requests wait their turn in order; the timeout starts when one is sent and
// covers the response body, since some sources send headers then stall.
//
// A provider that answers 429 (too many requests) gets no requests at all
// until its rest is over: the time it asks for, or 60 s doubling to 10 min
// while it keeps answering 429. The rest is saved, so restarting the app
// does not send a fresh burst into it. Requests in the rest fail at once with
// code 'busy' and the time left, so retries wait instead of adding to it.
window.SourceRequest = (function () {
    'use strict';

    var REST_MS = 60000;
    var REST_MAX_MS = 600000;
    var MAX_ACTIVE = 2;
    var GAP_MS = 400;
    var TIMEOUT_MS = 35000; // Large catalogues on a TV take a while to arrive.
    var REST_KEY = 'iptvnator-tv:source-rest';
    var hosts = {}; // host -> { queue, active, last, timer }
    var rests = load(); // host -> { until, ms }

    function load() {
        try {
            var saved = JSON.parse(localStorage.getItem(REST_KEY)) || {};
            var now = Date.now();
            Object.keys(saved).forEach(function (host) {
                // A rest that ended long ago no longer doubles the next one.
                if (!saved[host] || saved[host].until + REST_MAX_MS < now) delete saved[host];
            });
            return saved;
        } catch (e) {
            return {};
        }
    }

    function save() {
        try {
            localStorage.setItem(REST_KEY, JSON.stringify(rests));
        } catch (e) {
            // Storage full: the rest still holds until the app closes.
        }
    }

    function hostOf(url) {
        var match = /^[a-z]+:\/\/([^/?#]+)/i.exec(url);
        return match ? match[1].toLowerCase() : '';
    }

    function restLeft(host) {
        var rest = rests[host];
        return rest ? Math.max(0, rest.until - Date.now()) : 0;
    }

    function busy(host) {
        var err = new Error('Source is busy');
        err.code = 'busy';
        err.wait = restLeft(host);
        return err;
    }

    function lane(host) {
        if (!hosts[host]) hosts[host] = { queue: [], active: 0, last: 0, timer: 0 };
        return hosts[host];
    }

    function pump(host) {
        var line = lane(host);
        clearTimeout(line.timer);
        line.timer = 0;
        if (restLeft(host)) {
            // A 429 arrived while these waited: they fail now, unsent.
            line.queue.splice(0).forEach(function (job) { job.reject(busy(host)); });
            return;
        }
        while (line.queue.length && line.active < MAX_ACTIVE) {
            var wait = line.last + GAP_MS - Date.now();
            if (wait > 0) {
                line.timer = setTimeout(function () { pump(host); }, wait);
                return;
            }
            line.last = Date.now();
            send(host, line.queue.shift());
        }
    }

    function send(host, job) {
        var line = lane(host);
        line.active++;
        var controller = new AbortController();
        var finished = false;
        var finish = function () {
            if (finished) return false;
            finished = true;
            clearTimeout(timer);
            line.active--;
            pump(host);
            return true;
        };
        var timer = setTimeout(function () {
            var err = new Error('Source request timed out');
            err.code = 'timeout';
            if (finish()) job.reject(err);
            controller.abort();
        }, TIMEOUT_MS);
        fetch(job.url, { signal: controller.signal }).then(function (response) {
            if (response.status === 429) {
                var asked = parseInt(response.headers.get('Retry-After'), 10) * 1000;
                var rest = rests[host] || { until: 0, ms: 0 };
                rest.ms = Math.min(REST_MAX_MS, rest.ms ? rest.ms * 2 : REST_MS);
                rest.until = Date.now() + Math.max(rest.ms, isFinite(asked) ? asked : 0);
                rests[host] = rest;
                save();
                Log.error('SOURCE BUSY ' + Math.round(rest.ms / 1000) + ' s');
                throw busy(host);
            }
            if (!response.ok) throw new Error('HTTP ' + response.status);
            if (rests[host]) {
                delete rests[host];
                save();
            }
            return response[job.format]();
        }).then(function (body) {
            if (finish()) job.resolve(body);
        }, function (err) {
            if (finish()) job.reject(err);
        });
    }

    function request(url, format) {
        var host = hostOf(url);
        if (restLeft(host)) return Promise.reject(busy(host));
        return new Promise(function (resolve, reject) {
            lane(host).queue.push({ url: url, format: format, resolve: resolve, reject: reject });
            pump(host);
        });
    }

    // For tests and diagnostics: how long the longest rest still lasts, in ms.
    request.restLeft = function () {
        return Object.keys(rests).reduce(function (most, host) { return Math.max(most, restLeft(host)); }, 0);
    };
    return request;
})();
