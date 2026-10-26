// Include the response body in the timeout: some sources send headers then stall.
window.SourceRequest = function (url, format) {
    'use strict';

    return new Promise(function (resolve, reject) {
        var controller = new AbortController();
        var timer = setTimeout(function () {
            var err = new Error('Source request timed out');
            err.code = 'timeout';
            reject(err);
            controller.abort();
        }, 35000); // Large catalogues on a TV take a while to arrive.
        fetch(url, { signal: controller.signal }).then(function (response) {
            if (!response.ok) throw new Error('HTTP ' + response.status);
            return response[format]();
        }).then(function (body) {
            clearTimeout(timer);
            resolve(body);
        }, function (err) {
            clearTimeout(timer);
            reject(err);
        });
    });
};
