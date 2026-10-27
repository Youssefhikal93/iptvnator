'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var load = require('./sandbox');

function settle() {
    return new Promise(setImmediate);
}

// A TMDB whose answers wait until the test lets them through. genreOf(item)
// says which genre TMDB knows for a title (or nothing).
function fakeTmdb(genreOf) {
    var tmdb = {
        on: true,
        cache: new Map(),
        calls: 0,
        active: 0,
        peak: 0,
        waiting: [],
        enabled: function () { return tmdb.on; },
        cached: function (item) { return tmdb.cache.get(item) || null; },
        match: function (item) {
            tmdb.calls++;
            tmdb.active++;
            tmdb.peak = Math.max(tmdb.peak, tmdb.active);
            return new Promise(function (resolve) {
                tmdb.waiting.push(function () {
                    tmdb.active--;
                    var name = genreOf(item);
                    tmdb.cache.set(item, { genres: name ? [{ name: name }] : [] });
                    resolve();
                });
            });
        },
        // Lets every answer through, including those asked for meanwhile.
        finish: function () {
            return settle().then(function () {
                if (!tmdb.waiting.length) return;
                tmdb.waiting.splice(0).forEach(function (answer) { answer(); });
                return tmdb.finish();
            });
        },
    };
    return tmdb;
}

function titles(count) {
    var list = [];
    for (var i = 0; i < count; i++) list.push({ name: 'Title ' + i, id: i });
    return list;
}

function setup(genreOf, list, options) {
    var tmdb = fakeTmdb(genreOf);
    tmdb.on = !(options && options.noTmdb);
    var g = load(['genres.js', 'genre-filter.js'], {}, { Tmdb: tmdb }).globals;
    var run = { tmdb: tmdb, list: list, section: 'movies', changes: [], g: g };
    run.filter = g.GenreFilter({
        section: function () { return run.section; },
        ready: function () { return !(options && options.notReady); },
        candidates: function () { return run.list; },
        tmdb: tmdb,
        changed: function (listChanged) { run.changes.push(listChanged); },
    });
    run.filter.offer('movies', function () { return Promise.resolve(run.list); });
    run.filter.pick('Drama');
    return run;
}

test('a genre is looked up twenty titles at a time by two workers at once', function () {
    var run = setup(function (item) { return item.id === 0 ? 'Drama' : null; }, titles(100));
    run.filter.look();
    assert.equal(run.tmdb.calls, 2);
    return run.tmdb.finish().then(function () {
        assert.equal(run.tmdb.calls, 20);
        assert.equal(run.tmdb.peak, 2);
        // One title was found, so nothing carries on by itself.
        assert.equal(run.filter.pending(), 80);
    });
});

test('the hint counts the checked titles while a batch runs', function () {
    var run = setup(function () { return null; }, titles(30));
    run.filter.look();
    assert.equal(run.filter.hint(), 'Checking titles 0 / 20');
    run.tmdb.waiting.shift()();
    return settle().then(function () {
        assert.equal(run.filter.hint(), 'Checking titles 1 / 20');
        assert.equal(run.filter.pending(), 0);
    });
});

test('a title found redraws the list, a title without the genre only the progress', function () {
    var run = setup(function (item) { return item.id === 1 ? 'Drama' : null; }, titles(3));
    run.filter.look();
    return run.tmdb.finish().then(function () {
        // Two checks without a find, one find, then the end of the batch.
        assert.deepEqual(Array.from(run.changes), [false, true, false, true]);
    });
});

test('a new list cancels the look-up that is running', function () {
    var run = setup(function () { return null; }, titles(100));
    run.filter.look();
    assert.equal(run.tmdb.calls, 2);
    var changes = run.changes.length;
    run.list = titles(5);
    run.filter.look();
    var late = run.tmdb.waiting.splice(0, 2);
    late.forEach(function (answer) { answer(); });
    return settle().then(function () {
        // The two answers for the old list neither redraw nor ask for more.
        assert.equal(run.changes.length, changes);
        assert.equal(run.tmdb.calls, 4);
        return run.tmdb.finish();
    }).then(function () {
        // The new list's two first titles were already asked; three are left.
        assert.equal(run.tmdb.calls, 4 + 3);
    });
});

test('cancel stops the look-up and drops the progress', function () {
    var run = setup(function () { return null; }, titles(100));
    run.filter.look();
    run.filter.cancel();
    assert.equal(run.filter.hint(), '');
    return run.tmdb.finish().then(function () {
        assert.equal(run.tmdb.calls, 2);
        assert.equal(run.changes.length, 0);
    });
});

test('with nothing found it keeps going up to five batches, then waits for more', function () {
    var run = setup(function () { return null; }, titles(300));
    run.filter.look();
    return run.tmdb.finish().then(function () {
        assert.equal(run.tmdb.calls, 5 * 20);
        assert.equal(run.filter.pending(), 200);
        assert.match(run.filter.hint(), /200 left/);
        assert.equal(run.filter.more(), true);
        return run.tmdb.finish();
    }).then(function () {
        // A pick the viewer asked for is one batch, not five.
        assert.equal(run.tmdb.calls, 6 * 20);
        assert.equal(run.filter.pending(), 180);
    });
});

test('more does nothing while checking or when every title was checked', function () {
    var run = setup(function () { return null; }, titles(10));
    assert.equal(run.filter.more(), false);
    run.filter.look();
    assert.equal(run.filter.more(), false);
    return run.tmdb.finish().then(function () {
        assert.equal(run.filter.pending(), 0);
        assert.equal(run.filter.more(), false);
    });
});

test('titles TMDB already answered for are not asked again', function () {
    var run = setup(function () { return null; }, titles(10));
    run.filter.look();
    return run.tmdb.finish().then(function () {
        var asked = run.tmdb.calls;
        run.filter.look();
        assert.equal(run.tmdb.calls, asked);
    });
});

test('without TMDB only the genres of the list are offered and nothing is looked up', function () {
    var list = [{ name: 'A', genre: 'Drama' }, { name: 'B', genre: 'Drama, Crime' }, { name: 'C', genre: 'Crime' }];
    var run = setup(function () { return null; }, list, { noTmdb: true });
    // Until the list arrives nothing is offered; then only what the list carries.
    assert.equal(run.filter.names().length, 0);
    return settle().then(function () {
        assert.deepEqual(Array.from(run.filter.names()), ['Drama', 'Crime']);
        run.filter.look();
        assert.equal(run.tmdb.calls, 0);
        assert.equal(run.filter.hint(), '');
    });
});

test('with TMDB the standard genres are offered at once, the common ones of the list first', function () {
    var run = setup(function () { return null; }, [{ name: 'A', genre: 'Crime' }, { name: 'B', genre: 'Crime' }]);
    var names = Array.from(run.filter.names());
    assert.ok(names.indexOf('Drama') !== -1);
    return settle().then(function () {
        var names = Array.from(run.filter.names());
        assert.equal(names[0], 'Crime');
        assert.equal(names.indexOf('Crime'), names.lastIndexOf('Crime'));
        assert.ok(names.indexOf('Western') !== -1);
    });
});

test('the offer of a section is loaded once', function () {
    var run = setup(function () { return null; }, titles(1));
    var loads = 0;
    run.filter.offer('movies', function () { loads++; return Promise.resolve(null); });
    run.filter.offer('series', function () { loads++; return Promise.resolve(null); });
    run.filter.offer('series', function () { loads++; return Promise.resolve(null); });
    assert.equal(loads, 1);
});

test('nothing is offered or picked before the list is ready, outside Movies and Series, or after reset', function () {
    var notReady = setup(function () { return null; }, titles(1), { notReady: true });
    assert.equal(notReady.filter.names().length, 0);
    assert.equal(notReady.filter.current(), null);
    var run = setup(function () { return null; }, titles(1));
    assert.equal(run.filter.current(), 'Drama');
    run.section = 'live';
    assert.equal(run.filter.names().length, 0);
    assert.equal(run.filter.current(), null);
    run.section = 'movies';
    run.filter.reset();
    assert.equal(run.filter.names().length, 0);
    assert.equal(run.filter.current(), null);
});

test('apply narrows the list to the genre and explains an empty result', function () {
    var run = setup(function () { return null; }, [{ name: 'A', genre: 'Drama' }, { name: 'B', genre: 'Crime' }]);
    var view = run.filter.apply(run.list, 'nothing');
    assert.deepEqual(Array.from(view.list, function (item) { return item.name; }), ['A']);
    assert.equal(view.empty, 'nothing');
    var none = [{ name: 'B', genre: 'Crime' }];
    run.list = none;
    // Not looked up yet: nothing left to check, so the list says there is none.
    assert.equal(run.filter.apply(none, 'nothing').empty[0], 'Nothing in Drama here');
    run.filter.look();
    assert.equal(run.filter.apply(none, 'nothing').empty[0], 'Looking for Drama…');
    return run.tmdb.finish().then(function () {
        assert.equal(run.filter.apply(none, 'nothing').empty[0], 'Nothing in Drama here');
    });
});

test('apply leaves the list alone without a picked genre', function () {
    var run = setup(function () { return null; }, titles(2));
    run.filter.pick(null);
    var view = run.filter.apply(run.list, 'empty text');
    assert.equal(view.list, run.list);
    assert.equal(view.empty, 'empty text');
});

test('the empty text asks for more when titles are left to check', function () {
    var run = setup(function () { return null; }, titles(300));
    run.filter.look();
    return run.tmdb.finish().then(function () {
        var view = run.filter.apply(run.list, 'nothing');
        assert.equal(view.list.length, 0);
        assert.equal(view.empty[0], 'No Drama yet');
        assert.match(view.empty[1], /200 left/);
    });
});
