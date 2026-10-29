// Account ids are shared by profiles so each viewer's library follows the login.
window.SourceIdentity = (function () {
    'use strict';

    var KEY = 'iptvnator-tv:source-accounts';

    function accountKey(source) {
        if (source.type === 'm3u') return 'm3u\n' + source.url;
        return 'xtream\n' + new URL(source.url).origin.toLowerCase() + '\n' + source.user;
    }

    function fingerprint(source) {
        var account = accountKey(source);
        var hash = 2166136261;
        for (var i = 0; i < account.length; i++) {
            hash ^= account.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return 'a' + (hash >>> 0).toString(16);
    }

    function read() {
        try {
            var accounts = JSON.parse(Stored.text(KEY));
            return accounts && typeof accounts === 'object' && !Array.isArray(accounts) ? accounts : {};
        } catch (e) {
            Log.error('Source accounts could not be read');
            return {};
        }
    }

    function freshId(accounts, sources) {
        var used = Object.keys(accounts).map(function (key) { return accounts[key]; }).concat(
            sources.map(function (source) { return source.id; })
        );
        var stamp = Date.now();
        // Several edits can finish within one clock tick.
        while (used.indexOf('s' + stamp) !== -1) stamp++;
        return 's' + stamp;
    }

    function sameAccount(a, b) {
        return accountKey(a) === accountKey(b);
    }

    function resolveId(oldSource, updatedSource) {
        var accounts = read();
        var sources = Sources.all();
        var key = fingerprint(updatedSource);
        accounts[fingerprint(oldSource)] = oldSource.id;
        var id = sameAccount(oldSource, updatedSource) ? oldSource.id : accounts[key];
        // A separately saved source must keep its own list position and library.
        if (!id || sources.some(function (source) { return source.id === id && source.id !== oldSource.id; })) {
            id = freshId(accounts, sources);
        }
        accounts[key] = id;
        try {
            Stored.save(KEY, accounts);
        } catch (e) {
            Log.error('Source accounts could not be saved');
        }
        return id;
    }

    return { fingerprint: fingerprint, sameAccount: sameAccount, resolveId: resolveId };
})();
