// Include the response body in the timeout: some sources send headers then stall.
// A provider that answers 429 (too many requests) gets no requests at all
// until its rest is over: the time it asks for, or 60 s doubling to 10 min
// while it keeps answering 429. Requests in the rest fail at once with code
// 'busy' and the time left, so retries wait instead of adding to the burst.
window.SourceRequest = (function () {
    'use strict';

    var REST_MS = 60000;
    var REST_MAX_MS = 600000;
    var rest = { until: 0, ms: 0 };

    function busy() {
        var err = new Error('Source is busy');
        err.code = 'busy';
        err.wait = Math.max(0, rest.until - Date.now());
        return err;
    }

    function request(url, format) {
        if (Date.now() < rest.until) return Promise.reject(busy());
        return new Promise(function (resolve, reject) {
            var controller = new AbortController();
            var timer = setTimeout(function () {
                var err = new Error('Source request timed out');
                err.code = 'timeout';
                reject(err);
                controller.abort();
            }, 35000); // Large catalogues on a TV take a while to arrive.
            fetch(url, { signal: controller.signal }).then(function (response) {
                if (response.status === 429) {
                    var asked = parseInt(response.headers.get('Retry-After'), 10) * 1000;
                    rest.ms = Math.min(REST_MAX_MS, rest.ms ? rest.ms * 2 : REST_MS);
                    rest.until = Date.now() + Math.max(rest.ms, isFinite(asked) ? asked : 0);
                    Log.error('SOURCE BUSY ' + Math.round((rest.until - Date.now()) / 1000) + ' s');
                    throw busy();
                }
                if (!response.ok) throw new Error('HTTP ' + response.status);
                rest.ms = 0;
                return response[format]();
            }).then(function (body) {
                clearTimeout(timer);
                resolve(body);
            }, function (err) {
                clearTimeout(timer);
                reject(err);
            });
        });
    }

    // For tests and diagnostics: how long the rest still lasts, in ms.
    request.restLeft = function () {
        return Math.max(0, rest.until - Date.now());
    };
    return request;
})();
