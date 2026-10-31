// Tile order is also main order: tile 1 is the large tile in layout 3.
window.MultiViewState = (function () {
    'use strict';

    var MAX_TILES = 4; // Lower this for TVs with fewer simultaneous decoders.

    function layouts() {
        var choices = [];
        for (var n = 2; n <= MAX_TILES; n++) choices.push(n);
        return choices;
    }

    function layout(state, count) {
        count = Math.max(2, Math.min(MAX_TILES, count));
        var tiles = state.tiles.slice(0, count);
        while (tiles.length < count) tiles.push(null);
        return { tiles: tiles, focus: Math.min(state.focus, count - 1) };
    }

    function put(state, channel, index) {
        var tiles = state.tiles.slice();
        tiles[index === undefined ? state.focus : index] = channel;
        return { tiles: tiles, focus: state.focus };
    }

    function main(state) {
        var tiles = state.tiles.slice();
        tiles[0] = state.tiles[state.focus];
        tiles[state.focus] = state.tiles[0];
        return { tiles: tiles, focus: 0 };
    }

    function move(state, code) {
        var at = state.focus;
        if (state.tiles.length === 2) {
            if (code === Keys.LEFT) at = 0;
            if (code === Keys.RIGHT) at = 1;
        } else if (state.tiles.length === 3) {
            if (code === Keys.LEFT) at = 0;
            if (code === Keys.RIGHT && at === 0) at = 1;
            if (code === Keys.UP && at === 2) at = 1;
            if (code === Keys.DOWN && at === 1) at = 2;
        } else {
            if (code === Keys.LEFT && at % 2) at--;
            if (code === Keys.RIGHT && !(at % 2)) at++;
            if (code === Keys.UP && at >= 2) at -= 2;
            if (code === Keys.DOWN && at < 2) at += 2;
        }
        return { tiles: state.tiles, focus: at };
    }

    return { layouts: layouts, layout: layout, put: put, main: main, move: move };
})();
