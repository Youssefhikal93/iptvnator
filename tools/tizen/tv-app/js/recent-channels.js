// The Recent channels list (#80): a channel joins it once it has played for
// 10 s, so zapping past channels leaves no trace. Saved by Library per
// profile and source; this adds the 10 s rule and the viewer's filters.
//
// hooks: sourceId() -> the open source, playing(channel) -> whether that
//   channel is still on screen, allows(channel) -> whether the profile may
//   see it, changed() -> the list grew.
window.RecentChannels = function (hooks) {
    'use strict';

    var WATCHED_MS = 10000;
    var timer = null;

    function cancel() {
        clearTimeout(timer);
        timer = null;
    }

    return {
        WATCHED_MS: WATCHED_MS,
        cancel: cancel,
        // A channel starts playing: it joins if it is still playing in 10 s.
        begin: function (channel) {
            cancel();
            var id = hooks.sourceId();
            timer = setTimeout(function () {
                timer = null;
                if (!hooks.playing(channel)) return;
                Library.addRecentChannel(id, channel);
                if (hooks.changed) hooks.changed();
            }, WATCHED_MS);
        },
        list: function () {
            return Library.recentChannels(hooks.sourceId()).filter(hooks.allows);
        },
        clear: function () {
            Library.clearRecentChannels(hooks.sourceId());
        },
    };
};
