const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = path.join(__dirname, '..', '..', 'tv-app');
const read = (file) => fs.readFileSync(path.join(app, file), 'utf8');

test('the TV app is named Jo-TV under its icon and in the page title, with the same app id', () => {
    const config = read('config.xml');
    assert.match(config, /<name>Jo-TV<\/name>/);
    assert.match(config, /<tizen:application id="IPTVnTVApp\.IPTVnator"/);
    assert.match(read('index.html'), /<title>Jo-TV<\/title>/);
});
