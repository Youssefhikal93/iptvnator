/**
 * Small static server for local Tizen proxy measurements: serves the widget
 * directory, a fake 12k-channel playlist at /fake.m3u and a tiny logo image
 * for every /logo/* request. Binds to 127.0.0.1 unless a host is given
 * (serve-fake-playlist.mjs binds the LAN address for a TV test).
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createFakeM3u } from './fake-playlist.mjs';

const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
    '.webmanifest': 'application/manifest+json',
};

// 1x1 grey PNG.
const LOGO = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN8+P9/PQAJYwPNy7VR3wAAAABJRU5ErkJggg==',
    'base64'
);

export async function startLocalServer(
    widgetDir,
    { channels = 12000, host = '127.0.0.1', port = 0 } = {}
) {
    const root = path.resolve(widgetDir);
    let playlist = '';
    const server = createServer(async (request, response) => {
        const send = (status, body, type) => {
            response.writeHead(status, {
                'content-type': type,
                'content-length': body.length,
            });
            response.end(body);
        };
        let pathname;
        try {
            pathname = decodeURIComponent(
                new URL(request.url, 'http://x').pathname
            );
        } catch (error) {
            if (!(error instanceof URIError)) throw error;
            return send(400, Buffer.from('bad request'), 'text/plain');
        }
        if (pathname === '/fake.m3u')
            return send(200, Buffer.from(playlist), 'audio/x-mpegurl');
        if (pathname.startsWith('/logo/')) return send(200, LOGO, 'image/png');
        const file = path.join(
            root,
            pathname === '/' ? 'index.html' : pathname
        );
        const relative = path.relative(root, file);
        if (
            relative === '..' ||
            relative.startsWith('..' + path.sep) ||
            path.isAbsolute(relative)
        )
            return send(403, Buffer.alloc(0), 'text/plain');
        try {
            const body = await readFile(file);
            send(
                200,
                body,
                TYPES[path.extname(file)] ?? 'application/octet-stream'
            );
        } catch {
            send(404, Buffer.from('not found'), 'text/plain');
        }
    });
    await new Promise((resolve) => server.listen(port, host, resolve));
    const origin = `http://${host}:${server.address().port}`;
    playlist = createFakeM3u({ channels, origin });
    return {
        origin,
        playlist,
        close: () => new Promise((resolve) => server.close(resolve)),
    };
}
