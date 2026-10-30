// The player's Help (#89): its keys for live TV and for films and episodes
// (player.js and app.js handle them), and the menu rows that reach the
// coloured keys' actions without colours: Previous channel (Green) and Help.
// Hold OK on live TV opens the menu, as Yellow and Info do.
window.PlayerHelp = (function () {
    'use strict';

    // previous() -> the channel before this one, or null; watchPrevious() plays it.
    var hooks = { previous: function () { return null; }, watchPrevious: function () {} };

    function help(live) {
        return live ? [
            ['help.key.ok', 'help.player.info'],
            ['help.key.holdOk', 'help.player.menu'],
            ['help.key.yellowInfo', 'help.player.menu'],
            ['help.key.upDownCh', 'help.player.channel'],
            ['help.key.left', 'player.hint.channelList'],
            ['help.key.green', 'player.hint.previous'],
            ['help.key.return', 'player.hint.close'],
        ] : [
            ['help.key.ok', 'help.player.pause'],
            ['help.key.playPause', 'help.player.pause'],
            ['help.key.leftRight', 'help.player.seek'],
            ['help.key.up', 'help.player.menu'],
            ['help.key.yellowInfo', 'help.player.menu'],
            ['help.key.down', 'help.player.buttons'],
            ['help.key.return', 'help.player.back'],
        ];
    }

    return {
        help: help,
        init: function (given) { hooks = given; },
        // Rows before the menu's first group, through the menu's item(label, active, run).
        menuEntries: function (item, current) {
            var previous = current.live && hooks.previous();
            if (previous) item(I18n.t('help.player.previousChannel', { name: previous.name }), false, hooks.watchPrevious);
            item(I18n.t('help.title'), false, function () { KeyHelp.open(help(!!current.live)); });
        },
    };
})();
