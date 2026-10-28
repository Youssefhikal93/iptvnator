const zlib = require('node:zlib');
const { test, expect, boot, openFirst, press, playing, playerGroup, moveTo } = require('./helpers');

const FILE = (line) => `1\n00:00:00,000 --> 00:59:00,000\n${line}\n`;

// One deflated file in a zip, the way SubDL serves a subtitle.
function zip(name, text) {
    const raw = Buffer.from(text);
    const data = zlib.deflateRawSync(raw);
    const file = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(file.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(file.length, 28);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(1, 8);
    end.writeUInt16LE(1, 10);
    end.writeUInt32LE(46 + file.length, 12);
    end.writeUInt32LE(30 + file.length + data.length, 16);
    return Buffer.concat([local, file, data, central, file, end]);
}

async function providers(page, { subdlFails = false } = {}) {
    await page.route('https://api.opensubtitles.com/**', (route) => {
        const url = route.request().url();
        if (url.includes('/download')) return route.fulfill({ json: { link: 'https://files.test/os.srt', remaining: 90 } });
        return route.fulfill({ json: { data: [
            { attributes: { language: 'en', release: 'Fixture.2021.1080p.BluRay.x264-GROUP', download_count: 48210, moviehash_match: true, files: [{ file_id: 11 }] } },
            { attributes: { language: 'en', release: 'Fixture.2021.720p.WEBRip', download_count: 3120, hearing_impaired: true, files: [{ file_id: 12 }] } },
            { attributes: { language: 'en', release: 'Fixture.2021.HDTV', download_count: 410, ai_translated: true, files: [{ file_id: 13 }] } },
        ] } });
    });
    await page.route('https://files.test/**', (route) => route.fulfill({ body: FILE('From OpenSubtitles') }));
    await page.route('https://api.subdl.com/**', (route) => (subdlFails
        ? route.fulfill({ status: 500, json: { status: false } })
        : route.fulfill({ json: { status: true, subtitles: [
            { release_name: 'Fixture.2021.1080p.NF.WEB-DL.DDP5.1.H.264', url: '/subtitle/100-200.zip', hi: false },
            { release_name: 'Fixture.2021.2160p.NF.WEB-DL.HDR', url: '/subtitle/100-201.zip', hi: true },
        ] } })));
    await page.route('https://dl.subdl.com/**', (route) => route.fulfill({ contentType: 'application/zip', body: zip('fixture.srt', FILE('From SubDL')) }));
}

async function findOnline(page) {
    await openFirst(page, 'Movies');
    await press(page, 'Enter');
    await playing(page);
    await press(page, 'ArrowUp');
    await playerGroup(page, 'Subtitles');
    await moveTo(page, '#pl-menu .pl-menu-item.focus span:last-child', 'Find subtitles online…');
    await press(page, 'Enter');
}

test('#52 Find subtitles online searches OpenSubtitles and SubDL together in one short list, and a SubDL zip plays', async ({ page }) => {
    await providers(page);
    await boot(page, { storage: { 'shared-settings': { opensubtitlesApiKey: 'test-key', subdlApiKey: 'subdl-key' } } });
    await findOnline(page);
    const rows = page.locator('#menu .menu-row.rich');
    await expect(rows).toHaveCount(5);
    await expect(page.locator('#menu .menu-title')).toHaveText('Subtitles · English');
    await expect(page.locator('#menu .menu-sub')).toHaveText('5 found · OpenSubtitles 3 · SubDL 2');
    // The exact OpenSubtitles match leads; each row is the release over its badges.
    await expect(rows.first().locator('.sp-release')).toHaveText('Fixture.2021.1080p.BluRay.x264-GROUP');
    await expect(rows.first().locator('.sp-badges span')).toHaveText(['OpenSubtitles', '★', '✓', '⬇ 48k']);
    await expect(rows.filter({ hasText: 'NF.WEB-DL.HDR' }).locator('.sp-badges span')).toHaveText(['SubDL', 'CC']);
    await expect(rows.filter({ hasText: 'HDTV' }).locator('.sp-badges span')).toHaveText(['OpenSubtitles', '⬇ 410', 'AI']);
    // Down to the first SubDL row and OK: the zip is unpacked and shown.
    for (let i = 0; i < 6 && !(await page.locator('#menu .menu-row.focused').textContent()).includes('SubDL'); i++) await press(page, 'ArrowDown');
    await press(page, 'Enter');
    await expect(page.locator('#pl-subs')).toHaveText('From SubDL');
});

test('#52 a failing SubDL still leaves the OpenSubtitles results and says so under the title', async ({ page }) => {
    await providers(page, { subdlFails: true });
    await boot(page, { storage: { 'shared-settings': { opensubtitlesApiKey: 'test-key', subdlApiKey: 'subdl-key' } } });
    await findOnline(page);
    await expect(page.locator('#menu .menu-row.rich')).toHaveCount(3);
    await expect(page.locator('#menu .menu-sub')).toHaveText('3 found · OpenSubtitles 3 · SubDL: unavailable');
    await press(page, 'Enter');
    await expect(page.locator('#pl-subs')).toHaveText('From OpenSubtitles');
});
