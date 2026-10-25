// Console logging with credential redaction, mirrored to an optional log
// receiver on a developer PC (see tools/tizen/INSTALLATION-TO-TV.md).
window.Log = (function () {
    'use strict';

    // Set to '' to disable mirroring.
    var REMOTE_LOG_URL = 'http://192.168.0.21:8765/log';
    var secrets = [];

    function setSecrets(list) {
        secrets = list.filter(Boolean);
    }

    function redact(text) {
        return secrets.reduce(function (out, secret) {
            return out.split(secret).join('***');
        }, String(text));
    }

    function write(level, message) {
        var line = level + ' ' + redact(message);
        console.log(line);
        if (REMOTE_LOG_URL) {
            fetch(REMOTE_LOG_URL, { method: 'POST', body: line }).catch(function () {});
        }
    }

    return {
        setSecrets: setSecrets,
        info: function (message) {
            write('INFO', message);
        },
        error: function (message) {
            write('ERROR', message);
        },
    };
})();
