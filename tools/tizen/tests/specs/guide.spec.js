const { test, expect, boot, section, category, enterItems, toolbar, press, sendKeyCode, back, playing, channel } = require('./helpers');

const scheduleRequest = request => new URL(request.url()).searchParams.get('action') === 'get_simple_data_table';
const focused = page => page.locator('#guide .gd-programme.focused');

async function openGuide(page) {
    await sendKeyCode(page, 458);
    await expect(page.locator('#guide')).toBeVisible();
    await expect(focused(page)).toContainText('Program');
}

test('toolbar opens a virtual guide with a now line, skeletons, missing data and bounded requests', async ({ page }, testInfo) => {
    let active = 0;
    let maximum = 0;
    const ids = [];
    await page.route('**/player_api.php?**', async route => {
        if (scheduleRequest(route.request())) {
            ids.push(Number(new URL(route.request().url()).searchParams.get('stream_id')));
            maximum = Math.max(maximum, ++active);
            await new Promise(resolve => setTimeout(resolve, 150));
            await route.continue();
            active--;
        } else await route.continue();
    });
    await boot(page);
    await expect(page.locator('#guide-button')).toBeHidden();
    await section(page, 'Live TV');
    await expect(page.locator('#guide-button')).toHaveText('TV guide');
    await expect(page.locator('#guide-button')).toBeVisible();
    await enterItems(page);
    await toolbar(page, 'guide');
    await press(page, 'Enter');
    await expect(page.locator('#guide .gd-loading').first()).toBeVisible();
    await expect(page.locator('#guide .gd-row')).toHaveCount(9);
    await expect(page.locator('#guide .gd-now-line')).toBeVisible();
    await expect(focused(page)).toContainText('Program');
    // 1002 is divisible by three; 1003 has a schedule in the shared fixture.
    await expect(page.locator('.gd-row[data-channel="1002"]')).toContainText('No programme information');
    await expect(page.locator('.gd-row[data-channel="1003"] .gd-programme').first()).toContainText('Program');
    await expect.poll(() => ids.length).toBe(18);
    await expect(page.locator('#guide .gd-loading')).toHaveCount(0);
    expect(maximum).toBeLessThanOrEqual(3);
    expect(ids.every(id => id >= 1001 && id <= 1018)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('guide-grid.png') });
    await back(page);
    await expect(page.locator('#guide')).toBeHidden();
});

test('fast channel paging replaces queued schedules with the newest screen', async ({ page }) => {
    const ids = [];
    let release;
    const held = new Promise(resolve => { release = resolve; });
    await page.route('**/player_api.php?**', async route => {
        if (scheduleRequest(route.request())) {
            ids.push(Number(new URL(route.request().url()).searchParams.get('stream_id')));
            if (ids.length <= 3) await held;
        }
        await route.continue();
    });
    try {
        await boot(page);
        await section(page, 'Live TV');
        await sendKeyCode(page, 458);
        // Provider requests go two at a time (SourceRequest); the third waits its turn.
        await expect.poll(() => ids.length).toBe(2);
        for (let i = 0; i < 10; i++) await sendKeyCode(page, 428);
        await expect(page.locator('.gd-row.selected')).toHaveAttribute('data-channel', '1091');
        expect(ids).toEqual([1001, 1002]);
        release();
        await expect.poll(() => ids.length).toBe(21);
        await expect(page.locator('#guide .gd-loading')).toHaveCount(0);
        expect(ids.slice(3).every(id => id >= 1091 && id <= 1108)).toBe(true);
        await expect(page.locator('#guide .gd-row')).toHaveCount(9);
    } finally { release(); }
});

test('horizontal focus keeps its time between rows, pages hours and channel/page keys jump a screen', async ({ page }) => {
    await boot(page);
    await section(page, 'Live TV');
    await openGuide(page);
    const original = await focused(page).getAttribute('data-start');
    const window = Number(await page.locator('.gd-marks').getAttribute('data-start'));
    await press(page, 'ArrowRight');
    const next = Number(await focused(page).getAttribute('data-start'));
    expect(next).toBeGreaterThan(Number(original));
    await press(page, 'ArrowDown');
    await press(page, 'ArrowDown');
    await expect(page.locator('.gd-row.selected')).toHaveAttribute('data-channel', '1003');
    expect(Number(await focused(page).getAttribute('data-start'))).toBeLessThanOrEqual(next);
    expect(Number(await focused(page).getAttribute('data-end'))).toBeGreaterThan(next);
    for (let i = 0; i < 6; i++) await press(page, 'ArrowRight');
    expect(Number(await page.locator('.gd-marks').getAttribute('data-start'))).toBeGreaterThan(window);
    await sendKeyCode(page, 428);
    await expect(page.locator('.gd-row.selected')).toHaveAttribute('data-channel', '1012');
    await sendKeyCode(page, 33);
    await expect(page.locator('.gd-row.selected')).toHaveAttribute('data-channel', '1003');
    await sendKeyCode(page, 34);
    await sendKeyCode(page, 427);
    await expect(page.locator('.gd-row.selected')).toHaveAttribute('data-channel', '1003');
    await back(page);
    await expect(page.locator('#items .focused > .label')).toContainText('3. Channel 3');
});

test('OK on now reuses live playback, channel list and previous channel, and returns to the guide', async ({ page }) => {
    await boot(page);
    await section(page, 'Live TV');
    await openGuide(page);
    await press(page, 'Enter');
    await playing(page);
    await expect(page.locator('#pl-title')).toHaveText('1. Channel 1 (cat all)');
    await expect(page.locator('#guide')).toBeHidden();
    await expect(page.locator('#pl-controls')).toBeHidden();
    await press(page, 'ArrowLeft');
    await expect(page.locator('#pl-channels')).toBeVisible();
    await back(page);
    await back(page);
    await expect(page.locator('#guide')).toBeVisible();
    await expect(page.locator('.gd-row.selected')).toHaveAttribute('data-channel', '1001');
    await press(page, 'ArrowDown');
    await press(page, 'ArrowDown');
    await expect(focused(page)).toContainText('Program');
    await press(page, 'Enter');
    await playing(page);
    await expect(page.locator('#pl-title')).toHaveText('3. Channel 3 (cat all)');
    await sendKeyCode(page, 10190);
    await playing(page);
    await expect(page.locator('#pl-title')).toHaveText('1. Channel 1 (cat all)');
    await expect(page.locator('#pl-controls')).toBeHidden({ timeout: 10000 });
    await back(page);
    await expect(page.locator('#guide')).toBeVisible();
    await expect(page.locator('.gd-row.selected')).toHaveAttribute('data-channel', '1001');
});

test('future programme details close with OK or Return and Guide Return restores Live list focus', async ({ page }) => {
    await boot(page);
    await section(page, 'Live TV');
    await openGuide(page);
    await press(page, 'ArrowDown');
    await press(page, 'ArrowDown');
    await expect(focused(page)).toContainText('Program');
    await press(page, 'ArrowRight');
    const title = await focused(page).locator('strong').innerText();
    await press(page, 'Enter');
    const popup = page.locator('.gd-popup');
    await expect(popup).toBeVisible();
    await expect(popup.locator('h2')).toHaveText(title);
    await expect(popup.locator('.gd-popup-time')).toHaveText(/\d\d:\d\d - \d\d:\d\d/);
    await expect(popup.locator('.gd-description')).toContainText('Episode');
    await expect(page.locator('#player')).toBeHidden();
    await press(page, 'Enter');
    await expect(popup).toBeHidden();
    await press(page, 'Enter');
    await expect(popup).toBeVisible();
    await back(page);
    await expect(popup).toBeHidden();
    await expect(page.locator('#guide')).toBeVisible();
    await back(page);
    await expect(page.locator('#guide')).toBeHidden();
    await expect(page.locator('#items .focused > .label')).toContainText('3. Channel 3');
});

test('Favorites and provider categories open their own channels', async ({ page }) => {
    await boot(page, { storage: { 'favorites:s1': { live: [channel(7), channel(9)] } } });
    await section(page, 'Live TV');
    await category(page, 'Favorites');
    await openGuide(page);
    await expect(page.locator('#guide .gd-row')).toHaveCount(2);
    await expect(page.locator('#guide .gd-channel').nth(1)).toContainText('7. Channel 7');
    await press(page, 'ArrowDown');
    await back(page);
    await expect(page.locator('#items .focused > .label')).toContainText('9. Channel 9');
    await press(page, 'ArrowLeft');
    await category(page, 'get_live_categories cat 1');
    await openGuide(page);
    await expect(page.locator('#guide .gd-category')).toContainText('get_live_categories cat 1');
    await expect(page.locator('#guide .gd-row').first()).toContainText('Channel 1 (cat 1)');
});

test('guide Off hides the toolbar button and ignores the remote shortcut', async ({ page }) => {
    let requests = 0;
    page.on('request', request => { if (scheduleRequest(request)) requests++; });
    await boot(page, { storage: { settings: { programmeGuide: false } } });
    await section(page, 'Live TV');
    await expect(page.locator('#guide-button')).toBeHidden();
    await sendKeyCode(page, 458);
    await expect(page.locator('#guide')).toBeHidden();
    expect(requests).toBe(0);
});

test('empty Favorites remains navigable and returns to the category', async ({ page }) => {
    await boot(page);
    await section(page, 'Live TV');
    await category(page, 'Favorites');
    await sendKeyCode(page, 458);
    await expect(page.locator('#guide')).toContainText('No channels in this category');
    await press(page, 'ArrowDown');
    await press(page, 'ArrowRight');
    await press(page, 'Enter');
    await expect(page.locator('#player')).toBeHidden();
    await back(page);
    await expect(page.locator('#guide')).toBeHidden();
    await expect(page.locator('#categories .focused')).toContainText('Favorites');
});

test('M3U without a guide source keeps the Guide button and shortcut unavailable', async ({ page, baseURL }) => {
    await boot(page, { storage: { sources: [{ id: 's1', type: 'm3u', name: 'Regression TV', url: baseURL + '/playlist.m3u' }] } });
    await section(page, 'Live TV');
    await expect(page.locator('#items .count')).toHaveText('1 / 12');
    await expect(page.locator('#guide-button')).toBeHidden();
    await sendKeyCode(page, 458);
    await expect(page.locator('#guide')).toBeHidden();
});
