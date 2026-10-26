// Local fixtures only: no downloads, and existing media is left untouched.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const media = path.resolve(__dirname, '../media');
fs.mkdirSync(media, { recursive: true });
const video = ['-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=15'];
const encode = ['-c:v', 'libx264', '-preset', 'ultrafast', '-b:v', '80k', '-pix_fmt', 'yuv420p', '-g', '30'];
const files = [
    ['ep.mp4', [...video, '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100', '-t', '400', ...encode, '-c:a', 'aac', '-b:a', '32k', '-movflags', '+faststart']],
    ['live.ts', [...video, '-t', '60', ...encode, '-an', '-f', 'mpegts']],
    ['poster.jpg', ['-f', 'lavfi', '-i', 'color=c=steelblue:size=240x360', '-frames:v', '1', '-update', '1']],
    ['backdrop.jpg', ['-f', 'lavfi', '-i', 'color=c=darkslateblue:size=640x360', '-frames:v', '1', '-update', '1']],
];

for (const [name, args] of files) {
    const target = path.join(media, name);
    if (fs.existsSync(target)) {
        console.log('Keeping ' + name);
        continue;
    }
    console.log('Generating ' + name);
    const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args, target], { stdio: 'inherit' });
    if (result.error || result.status !== 0) {
        // Do not let a partial encode be mistaken for a completed fixture next time.
        fs.rmSync(target, { force: true });
        console.error(result.error ? result.error.message : 'ffmpeg exited with ' + result.status);
        process.exit(1);
    }
}
