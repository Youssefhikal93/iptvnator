// The Recent channels list (#80): a channel joins it once it has played for
// 10 s, so zapping past channels leaves no trace. Saved by Library per
// profile and source; this adds the 10 s rule and the viewer's filters.
//
// hooks: sourceId() -> the open source, playing(channel) -> whether that
//   channel is still on screen, ready() -> whether its picture plays (not
//   still starting, buffering or failed; optional), allows(channel) ->
//   whether the profile may see it, changed() -> the list grew.
window.RecentChannels = function (hooks) {
    'use strict';

    var WATCHED_MS = 10000;
    var STEP_MS = 1000;
    var timer = null;

    function cancel() {
        clearTimeout(timer);
        timer = null;
    }

    return {
        WATCHED_MS: WATCHED_MS,
        cancel: cancel,
        // A channel is asked for: it joins once its picture has played for
        // 10 s, counted a second at a time, so a start that only buffers or
        // fails never joins; leaving the channel ends the count.
        begin: function (channel) {
            cancel();
            var id = hooks.sourceId();
            var played = 0;
            function step() {
                timer = null;
                if (!hooks.playing(channel)) return;
                if (!hooks.ready || hooks.ready()) played += STEP_MS;
                if (played < WATCHED_MS) {
                    timer = setTimeout(step, STEP_MS);
                    return;
                }
                Library.addRecentChannel(id, channel);
                if (hooks.changed) hooks.changed();
            }
            timer = setTimeout(step, STEP_MS);
        },
        list: function () {
            return Library.recentChannels(hooks.sourceId()).filter(hooks.allows);
        },
        clear: function () {
            Library.clearRecentChannels(hooks.sourceId());
        },
    };
};
