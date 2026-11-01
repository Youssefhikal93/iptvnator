'use strict';

// Each waiter owns its timeout and disconnect cleanup. A slow phone cannot
// consume another phone's update or hold up the TV's command connection.
function Channel() {
    var revision = 0;
    var value = null;
    var waiters = [];
    function finish(waiter) {
        clearTimeout(waiter.timer);
        waiters = waiters.filter(function (entry) { return entry !== waiter; });
        if (!waiter.res.destroyed) waiter.done(waiter.res, { revision: revision, state: value });
    }
    return {
        publish: function (next) {
            value = next;
            revision++;
            waiters.slice().forEach(finish);
        },
        wait: function (res, since, done, key) {
            var waiter = { res: res, done: done, key: key };
            if (since !== revision) return finish(waiter);
            waiters.push(waiter);
            waiter.timer = setTimeout(function () { finish(waiter); }, 20000);
            res.on('close', function () {
                clearTimeout(waiter.timer);
                waiters = waiters.filter(function (entry) { return entry !== waiter; });
            });
        },
        revoke: function (check) {
            waiters.slice().forEach(function (waiter) {
                if (!check(waiter.key)) {
                    waiter.done = function (res) { res.writeHead(404); res.end(); };
                    finish(waiter);
                }
            });
        },
        close: function () { waiters.slice().forEach(finish); },
    };
}
module.exports = Channel;
