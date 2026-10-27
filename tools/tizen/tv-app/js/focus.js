// One focus model for the remote. A screen is made of lines (a row of
// buttons, a column of episodes, a row of cards); step() moves the focus
// along a line and, at its ends or across it, says which way it left so the
// screen can hand the focus to the next line.
window.Focus = (() => {
    'use strict';

    const AXES = {
        row: { back: 'LEFT', next: 'RIGHT' },
        column: { back: 'UP', next: 'DOWN' },
    };
    const EXITS = { LEFT: 'left', UP: 'up', RIGHT: 'right', DOWN: 'down' };

    // Returns { index } while the focus stays on the line (other keys keep
    // it where it is), or { exit } with 'left' | 'right' | 'up' | 'down'.
    const step = (index, count, code, axis) => {
        const { back, next } = AXES[axis];
        if (code === Keys[back]) return index > 0 ? { index: index - 1 } : { exit: EXITS[back] };
        if (code === Keys[next]) return index < count - 1 ? { index: index + 1 } : { exit: EXITS[next] };
        const across = Object.keys(EXITS).find((name) => Keys[name] === code);
        return across ? { exit: EXITS[across] } : { index };
    };

    return { step };
})();
