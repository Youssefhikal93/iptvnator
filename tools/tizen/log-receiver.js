// Receives the TV app's remote log (js/log.js) on the PC and appends each
// line to a file. See TV-LOGS.md.
// Usage: node log-receiver.js [log file] (default: logs/tv.log next to this script)
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8765;
const out = path.resolve(process.argv[2] || path.join(__dirname, 'logs', 'tv.log'));
fs.mkdirSync(path.dirname(out), { recursive: true });

http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    if (req.method !== 'POST') { res.end(); return; }
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
        fs.appendFileSync(out, new Date().toISOString().slice(11, 23) + ' ' + body + '\n');
        res.end();
    });
}).listen(PORT, '0.0.0.0', () => console.log('Listening on port ' + PORT + ', writing to ' + out));
