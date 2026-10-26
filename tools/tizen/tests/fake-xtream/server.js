// Fake Xtream API + static host for smoke-testing the TV app in a browser.
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = process.argv[2] || path.resolve(__dirname, '../../tv-app');
const port = Number(process.argv[3] || process.env.PORT || 8767);
const origin = 'http://localhost:' + port;
const json = (res, body) => {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(body));
};
const range = (n, f) => Array.from({ length: n }, (_, i) => f(i + 1));

// Test switch: /__fail?api=503&media=404 breaks provider calls / streams; /__fail clears.
let fail = {};
http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/__fail') {
        fail = { api: url.searchParams.get('api'), media: url.searchParams.get('media') };
        return json(res, fail);
    }
    if (fail.api && url.pathname === '/player_api.php' && url.searchParams.get('action')) {
        res.writeHead(Number(fail.api), { 'Access-Control-Allow-Origin': '*' });
        return res.end();
    }
    if (fail.media && /^\/(live|movie|series)\//.test(url.pathname)) {
        res.writeHead(Number(fail.media), { 'Access-Control-Allow-Origin': '*' });
        return res.end();
    }
    if (url.pathname === '/player_api.php') {
        const action = url.searchParams.get('action');
        const cat = url.searchParams.get('category_id');
        if (!action) return json(res, { user_info: { auth: 1, status: 'Active', exp_date: '1800206249', active_cons: '0', max_connections: '1' } });
        if (action.endsWith('_categories')) return json(res, range(30, (i) => ({ category_id: String(i), category_name: action + ' cat ' + i })));
        if (action === 'get_live_streams') return json(res, range(cat ? 40 : 500, (i) => ({ num: i, name: 'Channel ' + i + ' (cat ' + (cat || 'all') + ')', stream_id: 1000 + i, category_id: cat || String(1 + (i % 30)) })));
        if (action === 'get_vod_streams') return json(res, range(25, (i) => ({ name: 'Movie ' + i, stream_id: 2000 + i, container_extension: 'mkv', stream_icon: i % 3 ? origin + '/img/poster.jpg' : '', added: i === 5 ? '' : String(1700000000 + i * 3600), rating_5based: String(((i * 7) % 10) / 2) })));
        if (action === 'get_series') return json(res, range(15, (i) => ({ name: 'Show ' + i, series_id: 3000 + i, cover: origin + '/img/poster.jpg', last_modified: String(1700000000 + (i % 5) * 7200) })));
        if (action === 'get_series_info') {
            const ep = (id, i, title) => ({ id, episode_num: i, title, container_extension: 'mp4', info: { movie_image: i % 2 ? origin + '/img/backdrop.jpg' : '', plot: 'The team follows a new lead. '.repeat(i), duration_secs: 2580 + i * 60 } });
            return json(res, {
                info: { name: 'Show ' + (url.searchParams.get('series_id') - 3000), cover: origin + '/img/poster.jpg', backdrop_path: [origin + '/img/backdrop.jpg'], plot: 'A small town hides a big secret.', cast: 'Mia Holm, Jonas Wik', genre: 'Mystery', rating: '8.1', releaseDate: '2019-09-01' },
                episodes: { 1: range(7, (i) => ep(4000 + i, i, 'Pilot ' + i)), 2: range(2, (i) => ep(5000 + i, i, 'Return ' + i)) },
            });
        }
        if (action === 'get_vod_info') {
            const id = url.searchParams.get('vod_id');
            return json(res, {
                info: {
                    name: 'Movie ' + (id - 2000) + ': The Long Title',
                    movie_image: origin + '/img/poster.jpg',
                    backdrop_path: [origin + '/img/backdrop.jpg'],
                    plot: 'A retired detective returns for one last case. '.repeat(id % 2 ? 8 : 1).trim(),
                    cast: 'Ana Lindqvist, Omar Haddad, Lena Berg',
                    director: 'Karin Ek',
                    genre: 'Crime, Drama',
                    releasedate: '2021-03-14',
                    rating: '7.4',
                    duration_secs: 6730,
                    youtube_trailer: id % 2 ? 'dQw4w9WgXcQ' : '',
                },
                movie_data: { stream_id: id, container_extension: 'mp4' },
            });
        }
        if (action === 'get_short_epg') {
            // Every third channel has no guide; the rest: now (20 min in) and next.
            const id = Number(url.searchParams.get('stream_id'));
            if (id % 3 === 0) return json(res, { epg_listings: [] });
            const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
            const start = Math.floor(Date.now() / 1000) - 20 * 60;
            const p = (title, from, mins, desc) => ({ title: b64(title), description: b64(desc), start_timestamp: String(from), stop_timestamp: String(from + mins * 60) });
            return json(res, { epg_listings: [p('Nyheter på svenska ' + id, start, 60, 'Dagens nyheter med väder och sport. Ett långt program om allt som hänt i världen idag, med reportage från hela landet.'), p('Kvällsfilm ' + id, start + 3600, 90, 'En film.')] });
        }
        return json(res, []);
    }
    if (url.pathname.startsWith('/img/')) {
        res.writeHead(200, { 'Content-Type': 'image/jpeg' });
        return fs.createReadStream(path.join(__dirname, '..', 'media', path.basename(url.pathname))).on('error', () => res.end()).pipe(res);
    }
    if (url.pathname.startsWith('/live/') && url.pathname.endsWith('.ts')) {
        res.writeHead(200, { 'Content-Type': 'video/mp2t', 'Access-Control-Allow-Origin': '*' });
        return fs.createReadStream(path.join(__dirname, '..', 'media', 'live.ts')).pipe(res);
    }
    if (url.pathname.startsWith('/series/') || url.pathname.startsWith('/movie/')) {
        const buf = fs.readFileSync(path.join(__dirname, '..', 'media', 'ep.mp4'));
        const m = /bytes=([0-9]+)-([0-9]*)/.exec(req.headers.range || '');
        if (!m) {
            res.writeHead(200, { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Content-Length': buf.length });
            return res.end(buf);
        }
        const start = +m[1], end = m[2] ? +m[2] : buf.length - 1;
        res.writeHead(206, { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Content-Range': 'bytes ' + start + '-' + end + '/' + buf.length, 'Content-Length': end - start + 1 });
        return res.end(buf.subarray(start, end + 1));
    }
    if (url.pathname === '/playlist.m3u') {
        res.writeHead(200, { 'Content-Type': 'audio/x-mpegurl', 'Access-Control-Allow-Origin': '*' });
        return res.end(
            '#EXTM3U\n' +
                range(12, (i) => `#EXTINF:-1 tvg-logo="" group-title="${i % 2 ? 'News' : 'Sports, HD'}",M3U Channel ${i}\nhttp://example.test/${i}.m3u8`).join('\n')
        );
    }
    const file = path.join(root, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname));
    fs.readFile(file, (err, data) => {
        if (err) {
            res.writeHead(404);
            return res.end();
        }
        const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
        res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
        res.end(data);
    });
}).listen(port, () => console.log('fake xtream on ' + port));
