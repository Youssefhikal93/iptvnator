// How long a film or episode takes to start, step by step (#70): one compact
// line per open in the log, from the press of OK / Next to the first picture,
// e.g. "OPEN timing film resolve=120 hash=cached sniff=90 prepare=1800 total=2020".
// A step that was not needed shows why instead of a time (cached, show, off).
// Only fixed names and numbers are logged, never an address or a title.
//
// begin(kind, clock) -> a tracker: step(name) returns a function that ends
// it (once); run(name, skipped, work) times work() (a promise), or notes
// `skipped` when that is set; finish() logs the line once. `off` does nothing.
window.OpenTiming = (function () {
    'use strict';

    // Only these words reach the log, whatever is passed in.
    var WORDS = ['film', 'episode', 'next', 'resolve', 'hash', 'sniff', 'prepare', 'gap', 'file', 'm3u8', 'ts', 'cached', 'show', 'off'];

    function word(text) {
        return WORDS.indexOf(text) >= 0 ? text : '?';
    }

    function begin(kind, clock) {
        clock = clock || Date.now;
        var began = clock();
        var parts = [];
        var logged = false;

        function step(name) {
            var at = clock();
            var closed = false;
            return function () {
                if (closed) return;
                closed = true;
                parts.push(word(name) + '=' + (clock() - at));
            };
        }

        function run(name, skipped, work) {
            if (skipped) {
                parts.push(word(name) + '=' + word(skipped));
                return work();
            }
            var done = step(name);
            return Promise.resolve(work()).then(function (value) {
                done();
                return value;
            }, function (error) {
                done();
                throw error;
            });
        }

        function line() {
            return 'OPEN timing ' + word(kind) + ' ' + parts.concat('total=' + (clock() - began)).join(' ');
        }

        function finish() {
            if (logged) return;
            logged = true;
            Log.info(line());
        }

        return { step: step, run: run, finish: finish, line: line };
    }

    var off = {
        step: function () { return function () {}; },
        run: function (name, skipped, work) { return work(); },
        finish: function () {},
        line: function () { return ''; },
    };

    return { begin: begin, off: off };
})();
