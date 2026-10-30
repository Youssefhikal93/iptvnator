/**
 * Phase 0 TV test aid: serves the fake 12k-channel M3U (and its logos) from
 * the PC on the LAN, so the TV can import a long list without any real
 * provider. Stop with Ctrl+C.
 *
 * Usage: node apps/tizen/scripts/serve-fake-playlist.mjs --host <PC-IP> [--port 8899] [--channels 12000]
 */
import { parseArgs } from 'node:util';
import { startLocalServer } from './local-server.mjs';

const { values } = parseArgs({
    options: {
        host: { type: 'string' },
        port: { type: 'string', default: '8899' },
        channels: { type: 'string', default: '12000' },
        widget: { type: 'string', default: 'dist/apps/tizen/widget' },
    },
});
if (!values.host) throw new Error('--host <PC LAN IP> is required');
const server = await startLocalServer(values.widget, {
    host: values.host,
    port: Number(values.port),
    channels: Number(values.channels),
});
console.log(
    `Fake playlist: ${server.origin}/fake.m3u (${values.channels} channels)`
);
