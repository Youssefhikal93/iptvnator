'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var load = require('./sandbox');

function vod() {
    return load(['m3u-vod.js']).globals.M3uVod;
}

function entry(name, url, group) {
    return { name: name, url: url, group: group || 'Other', logo: '' };
}

test('URL path, extension and group hints classify entries', function () {
    var M3uVod = vod();
    var cases = [
        ['Plain', 'http://h/live/u/p/1.ts', 'News', 'live'],
        ['Plain', 'http://h/u/p/1', 'News', 'live'],
        ['Channel', 'http://h/1.m3u8', 'News', 'live'],
        ['Anything', 'http://h/movie/u/p/5.mkv', 'News', 'movie'],
        ['Anything', 'http://h/movie/u/p/5', 'News', 'movie'],
        ['Anything', 'http://h/series/u/p/5.mp4', 'News', 'series'],
        ['Film', 'http://h/files/film.MP4?token=1', 'Other', 'movie'],
        ['Film', 'http://h/files/film.avi#x', 'Other', 'movie'],
        ['Show S01E02', 'http://h/files/a.mkv', 'Other', 'series'],
        ['Heist', 'http://h/1', 'VOD | Action', 'movie'],
        ['Heist', 'http://h/1.m3u8', 'Movies', 'movie'],
        ['Show 1x02', 'http://h/1.m3u8', 'TV Shows', 'series'],
        ['Show S01E02', 'http://h/1.m3u8', 'Series', 'series'],
        ['Seriekanalen', 'http://h/1.m3u8', 'Series', 'live'],
        ['Show S01E02', 'http://h/1.m3u8', 'News', 'live'],
        ['Heist', 'http://h/live/u/p/1.m3u8', 'Movies', 'live'],
    ];
    cases.forEach(function (c) {
        assert.equal(M3uVod.classify(entry(c[0], c[1], c[2])), c[3], c.join(' | '));
    });
});

test('episode names parse into show, season, episode and title', function () {
    var M3uVod = vod();
    function parse(name) {
        var p = M3uVod.episode(name);
        return p && [p.show, p.season, p.episode, p.title].join('|');
    }
    assert.equal(parse('Show S01E02'), 'Show|1|2|');
    assert.equal(parse('Show 1x02'), 'Show|1|2|');
    assert.equal(parse('Show - S01 E02'), 'Show|1|2|');
    assert.equal(parse('Mr. Robot S03E10 - Title Here'), 'Mr. Robot|3|10|Title Here');
    assert.equal(parse('Show.Name.S02.E05.720p'), 'Show Name|2|5|720p');
    assert.equal(parse('Show Season 2 Episode 3'), 'Show|2|3|');
    assert.equal(parse('Movie 1920x1080'), null);
    assert.equal(parse('Just a movie'), null);
    assert.equal(parse('S01E02'), null);
});

test('shows group episodes by season order, movies keep playlist order', function () {
    var M3uVod = vod();
    var built = M3uVod.build([
        entry('Chan', 'http://h/1.m3u8', 'News'),
        entry('Show A S02E01', 'http://h/series/u/p/3.mp4', 'Series'),
        entry('Show A S01E02', 'http://h/series/u/p/2.mp4', 'Series'),
        entry('show a - S01 E01', 'http://h/series/u/p/1.mp4', 'Series'),
        entry('Film Two', 'http://h/movie/u/p/9.mp4', 'Movies'),
        entry('Film One', 'http://h/movie/u/p/8.mp4', 'Movies'),
        entry('Chan Two', 'http://h/2.m3u8', 'News'),
    ]);
    assert.equal(built.live.length, 2);
    assert.equal(built.live.map(function (c) { return c.num; }).join(), '1,2');
    assert.equal(built.shows.length, 1);
    assert.equal(built.shows[0].name, 'Show A');
    var episodes = built.episodesOf[built.shows[0].series_id];
    assert.equal(episodes.map(function (e) { return e.season + 'x' + e.num; }).join(), '1x1,1x2,2x1');
    assert.equal(episodes[0].label, 'S1 E1  ');
    assert.equal(built.movies.map(function (m) { return m.name; }).join(), 'Film Two,Film One');
});

test('ids are stable, unique per entry and never numeric like Xtream ids', function () {
    var M3uVod = vod();
    function list() {
        return [
            entry('A', 'http://h/movie/u/p/1.mp4', 'M'),
            entry('B', 'http://h/movie/u/p/2.mp4', 'M'),
            entry('Show S01E01', 'http://h/series/u/p/3.mp4', 'S'),
            entry('Show S01E02', 'http://h/series/u/p/4.mp4', 'S'),
            entry('Other S01E01', 'http://h/series/u/p/5.mp4', 'S'),
        ];
    }
    function idsOf(built) {
        return built.movies.map(function (m) { return m.stream_id; })
            .concat(built.shows.map(function (s) { return s.series_id; }))
            .concat(Object.keys(built.episodeById));
    }
    var first = idsOf(M3uVod.build(list()));
    var second = idsOf(M3uVod.build(list()));
    assert.equal(first.length, 7);
    assert.equal(new Set(first).size, first.length);
    assert.equal(first.join(), second.join());
    first.forEach(function (id) {
        assert.match(id, /^m3u:[a-z0-9]+$/);
    });
});

test('repeated URLs are listed once and a series link without an episode name still plays', function () {
    var M3uVod = vod();
    var built = M3uVod.build([
        entry('Film', 'http://h/movie/u/p/1.mp4', 'M'),
        entry('Film again', 'http://h/movie/u/p/1.mp4', 'M'),
        entry('Odd special', 'http://h/series/u/p/7.mkv', 'S'),
    ]);
    assert.equal(built.movies.length, 1);
    assert.equal(built.shows.length, 1);
    var episodes = built.episodesOf[built.shows[0].series_id];
    assert.equal(episodes.length, 1);
    assert.equal(episodes[0].title, 'Odd special');
    assert.equal(episodes[0].container_extension, 'mkv');
    assert.equal(episodes[0].season + '|' + episodes[0].num, '1|1');
});

test('a live-only playlist builds no movies or shows', function () {
    var M3uVod = vod();
    var built = M3uVod.build([
        entry('One', 'http://h/1.m3u8', 'News'),
        entry('Two', 'http://h/2.ts', 'Sports'),
    ]);
    assert.equal(built.live.length, 2);
    assert.equal(built.movies.length + built.shows.length, 0);
});

function source(text) {
    var progress = { id: function (section, item) { return 'movie:' + item.stream_id; }, episodeId: function (ep) { return 'episode:' + ep.id; } };
    var g = load(['m3u-vod.js', 'm3u.js'], {}, {
        Progress: progress,
        SourceRequest: function () { return Promise.resolve(text); },
    }).globals;
    return g.M3uSource({ url: 'http://h/list.m3u' });
}

test('sections follow the playlist: live-only stays Live TV, VOD adds Movies and Series', async function () {
    var live = source('#EXTM3U\n#EXTINF:-1 group-title="News",One\nhttp://h/1.m3u8\n');
    assert.equal(live.sections.join(), 'live');
    await live.account();
    assert.equal(live.sections.join(), 'live');
    var cats = await live.categories('live');
    assert.equal(cats.map(function (c) { return c.category_name; }).join(), 'All channels,News');

    var mixed = source('#EXTM3U\n#EXTINF:-1 group-title="News",One\nhttp://h/1.m3u8\n' +
        '#EXTINF:-1 group-title="Movies",Film\nhttp://h/movie/u/p/1.mp4\n' +
        '#EXTINF:-1 group-title="Series",Show S01E01\nhttp://h/series/u/p/2.mp4\n');
    var info = await mixed.account();
    assert.equal(mixed.sections.join(), 'live,movies,series');
    assert.equal(info.channels + '|' + info.movies + '|' + info.shows, '1|1|1');
    var movies = await mixed.items('movies', '');
    assert.equal(movies.length, 1);
    assert.equal((await mixed.categories('movies'))[0].category_id, 'Movies');
    assert.equal((await mixed.items('movies', 'Nope')).length, 0);
    var request = mixed.movieRequest(movies[0]);
    assert.equal(request.id, 'movie:' + movies[0].stream_id);
    assert.equal(request.sources[0].url, 'http://h/movie/u/p/1.mp4');
    assert.equal((await mixed.movieInfo(movies[0])).genre, 'Movies');
    var shows = await mixed.items('series', '');
    var detail = await mixed.seriesInfo(shows[0]);
    assert.equal(detail.episodes.length, 1);
    // An episode saved in Recently watched has no url and is found in the playlist again.
    var saved = { id: detail.episodes[0].id, container_extension: 'mp4', label: 'x' };
    assert.equal(mixed.episodeRequest(shows[0], saved).sources[0].url, 'http://h/series/u/p/2.mp4');
});
