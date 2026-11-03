// Keeps Jotv full backups on this computer (JOTV-BACKUP.md). The TV sends
// everything it has saved, and gets the newest file back to restore. Home
// network only, and only while this runs; every request needs the code it
// prints. The files hold source passwords: they never leave this folder.
// Usage: node backup-receiver.js [folder] (default: <Projects>/jotv-backup)
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const PORT = 8766;
const MAX_BYTES = 50 * 1024 * 1024;
const dir = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', '..', 'jotv-backup'));
const code = String(crypto.randomInt(100000, 1000000));
fs.mkdirSync(dir, { recursive: true });

function addresses() {
    return Object.values(os.networkInterfaces()).flat()
        .filter((net) => net && (net.family === 'IPv4' || net.family === 4) && !net.internal)
        .map((net) => net.address);
}

// Each backup is a folder named by its date, "2026-11-03 17.05 Jotv backup",
// holding jotv-backup.json; older backups were jotv-backup-<date>.json files.
const FILE = 'jotv-backup.json';

function stamp(date) {
    const two = (n) => String(n).padStart(2, '0');
    return date.getFullYear() + '-' + two(date.getMonth() + 1) + '-' + two(date.getDate()) + ' ' + two(date.getHours()) + '.' + two(date.getMinutes());
}

// The newest backup, folder or older file, by when it was saved.
function newest() {
    const found = [];
    for (const name of fs.readdirSync(dir)) {
        const file = /^jotv-backup-.*\.json$/.test(name) ? name : / Jotv backup( \(\d+\))?$/.test(name) ? path.join(name, FILE) : null;
        if (file && fs.existsSync(path.join(dir, file))) found.push({ file, time: fs.statSync(path.join(dir, file)).mtimeMs });
    }
    found.sort((a, b) => a.time - b.time);
    return found.length ? found[found.length - 1].file : null;
}

function newFolder() {
    const base = stamp(new Date()) + ' Jotv backup';
    let name = base;
    for (let i = 2; fs.existsSync(path.join(dir, name)); i++) name = base + ' (' + i + ')';
    fs.mkdirSync(path.join(dir, name));
    return name;
}

function reply(res, status, body) {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
}

http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Jotv-Code');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.end();
    if (req.url !== '/backup') return reply(res, 404, { error: 'not found' });
    if (req.headers['x-jotv-code'] !== code) return reply(res, 403, { error: 'wrong code' });

    if (req.method === 'GET') {
        const name = newest();
        if (!name) return reply(res, 404, { error: 'no backup yet' });
        console.log('Sent ' + name + ' to the TV');
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        return fs.createReadStream(path.join(dir, name)).pipe(res);
    }
    if (req.method !== 'POST') return reply(res, 405, { error: 'method' });

    const parts = [];
    let size = 0;
    req.on('data', (chunk) => {
        size += chunk.length;
        if (size > MAX_BYTES) req.destroy();
        else parts.push(chunk);
    });
    req.on('end', () => {
        try {
            const backup = JSON.parse(Buffer.concat(parts).toString('utf8'));
            if (backup.kind !== 'jotv-full-backup' || !backup.data) return reply(res, 400, { error: 'not a Jotv full backup' });
            const name = newFolder();
            fs.writeFileSync(path.join(dir, name, FILE), JSON.stringify(backup, null, 1));
            console.log('Saved ' + name + ' (' + Object.keys(backup.data).length + ' records)');
            reply(res, 200, { file: name });
        } catch (e) {
            reply(res, 400, { error: 'not JSON' });
        }
    });
}).listen(PORT, '0.0.0.0', () => {
    console.log('Jotv backup receiver. Folder: ' + dir);
    console.log('On the TV enter address: ' + addresses().map((ip) => ip + ':' + PORT).join('  or  '));
    console.log('Code: ' + code);
});
