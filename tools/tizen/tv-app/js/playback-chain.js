// The order in which one stream's players are tried (ADR 0004), apart from the
// players themselves: each attempt gets ATTEMPT_MS to start, a 503 is retried
// once after BUSY_RETRY_MS (the previous stream may still be counted by the
// provider, ADR 0006), any other failure falls through to the next player, and
// a newer run or cancel() makes an older chain ignore everything it hears late.
//
// attempts: [{ name, start(finish) }] in the order to try; start opens one
// player and calls finish(null) when playing or finish(reason) on failure.
// hooks: ready(name, ms) when one plays; failed(name, error, ms) after each
// failed try, where the player closes it before the next opens; giveUp(kind)
// with 'offline' (every player failed) or 'busy' (503 twice).
// Starters that finish asynchronously ask stale(token) with session() read at
// their start, and finish.ended() for their own attempt. Timers are the globals, so tests can replace them.
window.PlaybackChain = function () {
    'use strict';

    var ATTEMPT_MS = 20000;
    var BUSY_RETRY_MS = 2000;
    var session = 0;

    function wait(ms) {
        return new Promise(function (resolve) {
            setTimeout(resolve, ms);
        });
    }

    // Runs one playback attempt; resolves null when playing, else a reason.
    function attempt(start) {
        return new Promise(function (resolve) {
            var done = false;
            function finish(error) {
                if (done) return;
                done = true;
                clearTimeout(timer);
                resolve(error);
            }
            // Whether this attempt has ended (played, failed or timed out):
            // a starter's late work for it must not open a player again.
            finish.ended = function () {
                return done;
            };
            var timer = setTimeout(function () {
                finish('timeout');
            }, ATTEMPT_MS);
            try {
                start(finish);
            } catch (e) {
                finish(e.name || String(e));
            }
        });
    }

    function run(attempts, hooks) {
        var mine = ++session;

        function next(index, retried) {
            if (mine !== session) return Promise.resolve();
            if (index >= attempts.length) {
                hooks.giveUp('offline');
                return Promise.resolve();
            }
            var name = attempts[index].name;
            var began = Date.now();
            return attempt(attempts[index].start).then(function (error) {
                if (mine !== session) return;
                if (!error) return hooks.ready(name, Date.now() - began);
                hooks.failed(name, error, Date.now() - began);
                // 503 means the previous stream is still counted (retry once
                // after a pause) or the channel is offline (other players
                // would get the same answer, so stop).
                if (/503/.test(error)) {
                    if (retried) {
                        hooks.giveUp('busy');
                        return;
                    }
                    return wait(BUSY_RETRY_MS).then(function () {
                        return next(index, true);
                    });
                }
                return next(index + 1, false);
            });
        }
        return next(0, false);
    }

    return {
        run: run,
        // Drops the running chain; a later run starts a new one.
        cancel: function () {
            session++;
        },
        session: function () {
            return session;
        },
        stale: function (token) {
            return token !== session;
        },
    };
};
