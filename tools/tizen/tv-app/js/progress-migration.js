// Keep the original until every source copy and the legacy backup are safe.
window.ProgressMigration = (function () {
    'use strict';

    function copy(key, original) {
        if (Stored.text(key) === null) {
            Stored.put(key, original);
            if (Stored.text(key) !== original) throw new Error('Progress copy failed');
        }
    }

    function migrate(key, sources) {
        var original = Stored.text(key);
        var snapshotKey = key + ':migration';
        // Freeze the recipients before copying, including across quota retries.
        copy(snapshotKey, JSON.stringify(sources));
        var recipients = JSON.parse(Stored.text(snapshotKey));
        recipients.forEach(function (sourceId) {
            if (sources.indexOf(sourceId) >= 0) copy(key + ':' + sourceId, original);
        });
        copy(key + ':legacy', original);
        if (Stored.text(key + ':legacy') !== original) return;
        Stored.remove(key);
        Stored.remove(snapshotKey);
    }

    function init() {
        try {
            var sources = Sources.all().map(function (source) { return source.id; });
            Stored.keys().filter(function (key) {
                return /^iptvnator-tv:(p:[^:]+:)?progress$/.test(key);
            }).forEach(function (key) {
                try {
                    migrate(key, sources);
                } catch (e) {
                    // The original survives a failed copy; retry on the next start.
                    if (window.Log) Log.error('PROGRESS migration incomplete');
                }
            });
        } catch (e) {
            // Unavailable storage or sources must not erase the old library.
            if (window.Log) Log.error('PROGRESS migration unavailable');
        }
    }

    function removeSource(sourceId) {
        Stored.keys().forEach(function (key) {
            var prefix = /^iptvnator-tv:(p:[^:]+:)?progress:/.exec(key);
            if (prefix && key.slice(prefix[0].length) === sourceId) Stored.remove(key);
        });
    }

    init();

    return { init: init, removeSource: removeSource };
})();
