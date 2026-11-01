// Everything Jotv keeps on the TV, in one file (JOTV-BACKUP.md): every
// saved record of every profile and source, as it is stored, so a restore
// puts the TV back exactly as it was (new name, new TV). The downloaded
// catalogue, guide and TMDB caches are not in it; they load again.
//
// collect() -> the backup object; parse(text) -> a checked backup (throws);
// apply(backup): replaces every saved record, or changes nothing (throws).
window.FullBackup = (function () {
    'use strict';

    var KIND = 'jotv-full-backup';
    var PREFIX = 'iptvnator-tv:';

    function ours(key) {
        return typeof key === 'string' && key.indexOf(PREFIX) === 0;
    }

    function snapshot() {
        var data = {};
        Stored.keys().filter(ours).sort().forEach(function (key) { data[key] = Stored.text(key); });
        return data;
    }

    function collect() {
        return { kind: KIND, version: 1, createdAt: new Date().toISOString(), data: snapshot() };
    }

    function parse(text) {
        var backup = JSON.parse(text);
        var data = backup && backup.data;
        var valid = backup && backup.kind === KIND && backup.version === 1 && data && typeof data === 'object' && !Array.isArray(data) &&
            Object.keys(data).every(function (key) { return ours(key) && typeof data[key] === 'string'; });
        if (!valid) throw new Error('not a Jotv full backup');
        return backup;
    }

    function write(data) {
        Stored.keys().filter(ours).forEach(Stored.remove);
        Object.keys(data).forEach(function (key) { Stored.put(key, data[key]); });
        Object.keys(data).forEach(function (key) {
            if (Stored.text(key) !== data[key]) throw new Error('not saved');
        });
    }

    // A restore the TV cannot finish (full storage) puts the old records back.
    function apply(backup) {
        var before = snapshot();
        try {
            write(backup.data);
        } catch (e) {
            write(before);
            throw e;
        }
    }

    function count(backup) {
        return Object.keys(backup.data).length;
    }

    return { collect: collect, parse: parse, apply: apply, count: count };
})();
