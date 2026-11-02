const { test, expect, boot, openFirst, press, playing, playerMenu, playerGroup, moveTo, back, section, enterItems, sendKeyCode } = require('./helpers');

// The provider lists every even title as a copy of a neighbour: films as
// "Movie 25" and "Movie 25 4K" (the newest film opens first), channels as
// "Channel 1 (cat 1)" and "Channel 1 (cat 1) FHD".
async function copies(page, action, tag, step) {
    await page.route(url => url.pathname === '/player_api.php' && url.searchParams.get('action') === action, async route => {
        const response = await route.fetch();
        const list = await response.json();
        list.forEach(entry => {
            if (Number(entry.stream_id) % 2) return;
            entry.name = entry.name.replace(/^(\w+) (\d+)/, (all, word, number) => word + ' ' + (Number(number) + step)) + ' ' + tag;
        });
        await route.fulfill({ response, json: list });
    });
}

const request = page => page.evaluate(() => {
    const req = Player.request();
    return { url: req.sources[0].url, tag: req.quality && req.quality.tag, auto: req.quality && req.quality.auto, id: req.id };
});
const streamOf = url => url.match(/\/(\d+)\.[a-z0-9]+$/)[1];
const qualityValue = page => page.locator('#pl-menu .pl-menu-group', { hasText: 'Quality' }).locator('.value');

async function pick(page, label, key) {
    await playerGroup(page, 'Quality');
    await moveTo(page, '.pl-menu-item.focus span:last-child', label, key);
    await press(page, 'Enter');
}

test('#94 a film with a 4K copy opens it on Auto; Standard is kept for the title and Auto forgets it', async ({ page }) => {
    await copies(page, 'get_vod_streams', '4K', 1);
    await boot(page);
    await openFirst(page, 'Movies');
    await press(page, 'Enter');
    await playing(page);
    const opened = await request(page);
    expect(opened.auto).toBe(true);
    expect(opened.tag).toBe('4K');
    const fourK = streamOf(opened.url);
    await playerMenu(page);
    await expect(page.locator('#pl-menu .pl-menu-group .label').first()).toHaveText('Quality');
    await expect(qualityValue(page)).toHaveText('Auto (4K)');
    await pick(page, 'Standard');
    await playing(page);
    const standard = await request(page);
    expect(standard).toMatchObject({ tag: '', auto: false, id: opened.id });
    expect(streamOf(standard.url)).not.toBe(fourK);
    // Opening the title again keeps the pick.
    await back(page);
    await back(page);
    await expect(page.locator('#detail')).toBeVisible();
    await press(page, 'Enter');
    await playing(page);
    expect(await request(page)).toMatchObject({ tag: '', auto: false });
    await playerMenu(page);
    await expect(qualityValue(page)).toHaveText('Standard');
    await pick(page, 'Auto (4K)', 'ArrowUp');
    await playing(page);
    expect(await request(page)).toMatchObject({ tag: '4K', auto: true });
    expect(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem(ProfileStore.key('quality-choice')) || '{}')))).toEqual([]);
});

test('#94 a copy that does not play goes back to the one opened, with a note', async ({ page }) => {
    await copies(page, 'get_vod_streams', '4K', 1);
    await boot(page);
    // Every 4K copy fails; the copies without a tag play.
    await page.route(url => /\/movie\//.test(url.pathname) && Number(streamOf(url.pathname)) % 2 === 0, route => route.abort());
    await openFirst(page, 'Movies');
    await press(page, 'Enter');
    await playing(page);
    expect(await request(page)).toMatchObject({ tag: '', auto: true });
    await expect(page.locator('body')).toContainText('That copy did not play. Back to Standard.');
});

test('#94 a live channel opens its FHD copy and Standard switches on the same channel', async ({ page }) => {
    await copies(page, 'get_live_streams', 'FHD', -1);
    await boot(page);
    await section(page, 'Live TV');
    await expect(page.locator('#items .skeleton')).toHaveCount(0);
    await enterItems(page);
    await press(page, 'Enter');
    await playing(page);
    const opened = await request(page);
    expect(opened).toMatchObject({ tag: 'FHD', auto: true });
    await sendKeyCode(page, 457);
    await expect(page.locator('#pl-menu')).toBeVisible();
    await expect(qualityValue(page)).toHaveText('Auto (FHD)');
    await pick(page, 'Standard');
    await playing(page);
    const standard = await request(page);
    expect(standard).toMatchObject({ tag: '', auto: false });
    expect(Number(streamOf(standard.url))).toBe(Number(streamOf(opened.url)) - 1);
    await expect(page.locator('#pl-title')).toContainText('Channel 1 (cat');
});

test('#94 titles without copies show no Quality row', async ({ page }) => {
    await boot(page);
    await openFirst(page, 'Movies');
    await press(page, 'Enter');
    await playing(page);
    await playerMenu(page);
    await expect(page.locator('#pl-menu .pl-menu-group .label').first()).toHaveText('Audio');
    await expect(page.locator('#pl-menu .pl-menu-group', { hasText: 'Quality' })).toHaveCount(0);
});

test('#94 an episode offers the same episode of the 4K copy of its show once that copy is loaded', async ({ page }) => {
    await page.route(url => url.pathname === '/player_api.php' && url.searchParams.get('action') === 'get_series', async route => {
        const response = await route.fetch();
        const list = await response.json();
        list.forEach(entry => { if (!(Number(entry.series_id) % 2)) entry.name = entry.name.replace(/(\d+)$/, number => Number(number) + 1) + ' 4K'; });
        await route.fulfill({ response, json: list });
    });
    await boot(page);
    await openFirst(page, 'Series');
    await press(page, 'Enter');
    await playing(page);
    const opened = await request(page);
    await playerMenu(page);
    await expect(qualityValue(page)).toHaveText(/^Auto \(/);
    await pick(page, opened.tag === '4K' ? 'Standard' : '4K');
    await playing(page);
    const other = await request(page);
    expect(other.id).toBe(opened.id);
    expect(other.auto).toBe(false);
    // The fake provider gives every show the same episode files.
    expect(other.tag).toBe(opened.tag === '4K' ? '' : '4K');
});
