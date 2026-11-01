const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect, boot, press, setting, channel } = require('./helpers');

// The real receiver (tools/tizen/backup-receiver.js) in a throwaway folder.
async function receiver() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jotv-backup-'));
    const child = spawn(process.execPath, [path.join(__dirname, '..', '..', 'backup-receiver.js'), dir]);
    let out = '';
    const code = await new Promise((resolve, reject) => {
        child.stdout.on('data', (chunk) => {
            out += chunk;
            const found = /Code: (\d{6})/.exec(out);
            if (found) resolve(found[1]);
        });
        child.on('exit', () => reject(new Error('receiver stopped: ' + out)));
    });
    return { dir, code, stop: () => { child.kill(); fs.rmSync(dir, { recursive: true, force: true }); } };
}

async function openRow(page, label, code) {
    await setting(page, label);
    await press(page, 'Enter');
    await expect(page.locator('#backup-screen')).toBeVisible();
    await page.locator('#backup-computer').fill('127.0.0.1:8766');
    await page.locator('#backup-code').fill(code);
}

test('Send everything to computer, change the TV, then Restore from computer puts every record back', async ({ page }) => {
    const box = await receiver();
    try {
        await boot(page, { storage: { 'favorites:s1': { live: [channel(3)] }, settings: { homeTiles: false } } });
        const before = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter((k) => k.startsWith('iptvnator-tv:')).map((k) => [k, localStorage.getItem(k)])));

        await openRow(page, 'Send everything to computer…', box.code);
        await page.locator('#backup-screen button', { hasText: 'Send' }).click();
        await expect(page.locator('#backup-screen')).toContainText(/Saved on the computer as jotv-backup-\d{8}-\d{6}\.json/);
        const files = fs.readdirSync(box.dir);
        expect(files).toHaveLength(1);
        expect(JSON.parse(fs.readFileSync(path.join(box.dir, files[0]), 'utf8')).data['iptvnator-tv:favorites:s1']).toBe(before['iptvnator-tv:favorites:s1']);
        await press(page, 'Enter');

        // The TV changes after the backup.
        await page.evaluate(() => {
            localStorage.removeItem('iptvnator-tv:favorites:s1');
            localStorage.setItem('iptvnator-tv:after-backup', '1');
        });

        await setting(page, 'Restore from computer…');
        await press(page, 'Enter');
        await expect(page.locator('#backup-computer')).toHaveValue('127.0.0.1:8766');
        await page.locator('#backup-code').fill('000000');
        await page.locator('#backup-screen button', { hasText: 'Restore' }).click();
        await expect(page.locator('#backup-screen')).toContainText('The computer did not answer');
        await page.locator('#backup-screen button', { hasText: 'Try again' }).click();
        await page.locator('#backup-code').fill(box.code);
        await page.locator('#backup-screen button', { hasText: 'Restore' }).click();
        await expect(page.locator('#backup-screen')).toContainText('Restoring replaces everything on this TV');
        await Promise.all([page.waitForEvent('load'), page.locator('#backup-screen button', { hasText: 'Restore' }).click()]);

        const after = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter((k) => k.startsWith('iptvnator-tv:')).map((k) => [k, localStorage.getItem(k)])));
        expect(after['iptvnator-tv:favorites:s1']).toBe(before['iptvnator-tv:favorites:s1']);
        expect(after['iptvnator-tv:after-backup']).toBeUndefined();
        expect(after['iptvnator-tv:settings']).toBe(before['iptvnator-tv:settings']);
    } finally {
        box.stop();
    }
});
