const { test, expect, boot, section, enterItems, toolbar, press, sendKeyCode, back, playing } = require('./helpers');

async function pastProgramme(page) {
    await sendKeyCode(page, 458);
    await expect(page.locator('.gd-programme.focused')).toContainText('Program');
    await press(page, 'ArrowLeft');
    await expect(page.locator('.gd-programme.focused .gd-catch-up')).toHaveText('↺');
}

test('archive badges appear on live rows and grid cards only for archive channels', async ({ page }) => {
    await boot(page);
    await section(page, 'Live TV');
    await expect(page.locator('#items .row').nth(0).locator('.catch-up-badge')).toHaveText('Catch-up 3 days');
    await expect(page.locator('#items .row').nth(1).locator('.catch-up-badge')).toHaveCount(0);
    await enterItems(page);
    await toolbar(page, 'grid');
    await press(page, 'Enter');
    await expect(page.locator('#items .card').nth(0).locator('.catch-up-badge')).toHaveText('Catch-up 3 days');
    await expect(page.locator('#items .card').nth(1).locator('.catch-up-badge')).toHaveCount(0);
});

test('guide past programme plays a timeshift request, seeks, and returns without saving progress', async ({ page }, testInfo) => {
    await page.route('**/player_api.php?**', async route => {
        const url = new URL(route.request().url());
        if (url.searchParams.has('action')) return route.continue();
        const response = await route.fetch();
        const body = await response.json();
        body.server_info = { timezone: 'UTC' };
        await route.fulfill({ json: body });
    });
    await boot(page);
    await section(page, 'Live TV');
    await pastProgramme(page);
    const tile = page.locator('.gd-programme.focused');
    const start = Number(await tile.getAttribute('data-start'));
    const end = Number(await tile.getAttribute('data-end'));
    const title = await tile.locator('strong').innerText();
    await press(page, 'Enter');
    await expect(page.getByRole('button', { name: 'Watch from start' })).toBeFocused();
    await page.screenshot({ path: testInfo.outputPath('catch-up-guide.png') });
    const requested = page.waitForRequest(request => new URL(request.url()).pathname.startsWith('/timeshift/'));
    await press(page, 'Enter');
    const url = new URL((await requested).url());
    const stamp = new Date(start).toISOString().slice(0, 16).replace('T', ':').replace(/:(\d\d)$/, '-$1');
    expect(url.origin).toBe(new URL(page.url()).origin);
    expect(url.pathname).toBe('/timeshift/tester/secret/' + Math.ceil((end - start) / 60000) + '/' + stamp + '/1001.ts');
    await playing(page);
    await expect(page.locator('#pl-title')).toHaveText('Channel 1 (cat all) · ' + title);
    await expect(page.locator('#pl-live')).toBeHidden();
    const clocks = await page.evaluate(([start, end]) => [start, end].map(time => {
        const date = new Date(time);
        return String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0');
    }), [start, end]);
    await expect(page.locator('#pl-cur')).toHaveText(clocks[0]);
    await expect(page.locator('#pl-total')).toHaveText(clocks[1]);
    await page.screenshot({ path: testInfo.outputPath('catch-up-player.png') });
    await press(page, 'Enter');
    await expect.poll(() => page.locator('#video').evaluate(video => video.paused)).toBe(true);
    await press(page, 'ArrowRight');
    await expect.poll(() => page.locator('#video').evaluate(video => video.currentTime)).toBeGreaterThanOrEqual(10);
    await press(page, 'ArrowLeft');
    await expect.poll(() => page.locator('#video').evaluate(video => video.currentTime)).toBeLessThan(5);
    await back(page);
    await expect(page.locator('#guide')).toBeVisible();
    await expect(page.locator('.gd-programme.focused')).toHaveAttribute('data-start', String(start));
    expect(await page.evaluate(() => localStorage.getItem('iptvnator-tv:p:default:progress'))).toBeNull();
    expect(await page.evaluate(() => localStorage.getItem('iptvnator-tv:p:default:recent:s1'))).toBeNull();
});

test('past programmes on non-archive channels keep the details-only popup', async ({ page }) => {
    await boot(page);
    await section(page, 'Live TV');
    await sendKeyCode(page, 458);
    await press(page, 'ArrowDown');
    await press(page, 'ArrowDown');
    await expect(page.locator('.gd-row.selected')).toHaveAttribute('data-channel', '1003');
    await expect(page.locator('.gd-programme.focused')).toContainText('Program');
    await press(page, 'ArrowLeft');
    await expect(page.locator('.gd-programme.focused .gd-catch-up')).toHaveCount(0);
    await press(page, 'Enter');
    await expect(page.locator('.gd-popup')).toBeVisible();
    await expect(page.locator('.gd-popup button')).toHaveCount(0);
    await press(page, 'Enter');
    await expect(page.locator('.gd-popup')).toBeHidden();
    await expect(page.locator('#player')).toBeHidden();
});

test('now and next restarts the current programme, Return restores live and Back to live closes catch-up first', async ({ page }) => {
    await boot(page);
    // Observe the real player's engine lifecycle at the third-party boundary.
    await page.evaluate(() => {
        const create = mpegts.createPlayer;
        window.streams = { active: 0, overlaps: 0, modes: [] };
        mpegts.createPlayer = function (source, options) {
            if (streams.active) streams.overlaps++;
            streams.active++;
            streams.modes.push(source.isLive);
            const engine = create(source, options);
            const destroy = engine.destroy.bind(engine);
            engine.destroy = function () { streams.active--; return destroy(); };
            return engine;
        };
    });
    await section(page, 'Live TV');
    await enterItems(page);
    await press(page, 'Enter');
    await playing(page);
    await expect(page.locator('#pl-epg')).toContainText('Watch from start');
    await sendKeyCode(page, 405);
    await expect(page.locator('.pl-menu-item.focus')).toHaveText('Watch from start');
    await press(page, 'Enter');
    await playing(page);
    await expect(page.locator('#pl-title')).toContainText(' · ');
    await back(page);
    await playing(page);
    await expect(page.locator('#pl-title')).toHaveText('1. Channel 1 (cat all)');
    await sendKeyCode(page, 405);
    await press(page, 'Enter');
    await playing(page);
    await press(page, 'ArrowUp');
    await expect(page.locator('.pl-menu-item.focus')).toHaveText('Back to live');
    await press(page, 'Enter');
    await playing(page);
    await expect(page.locator('#pl-title')).toHaveText('1. Channel 1 (cat all)');
    expect(await page.evaluate(() => streams.overlaps)).toBe(0);
    expect(await page.evaluate(() => streams.modes)).toEqual([true, false, true, false, true]);
});

test('archive guide reaches older programmes while a non-archive row stays within two hours', async ({ page }) => {
    await page.route('**/player_api.php?**', async route => {
        const url = new URL(route.request().url());
        if (url.searchParams.get('action') !== 'get_simple_data_table') return route.continue();
        const now = Math.floor(Date.now() / 1000);
        const epg_listings = Array.from({ length: 6 }, (_, index) => ({
            title: Buffer.from('Program day ' + index).toString('base64'),
            start_timestamp: String(now - (5 - index) * 86400 - 1800),
            stop_timestamp: String(now - (5 - index) * 86400 + 1800),
        }));
        await route.fulfill({ json: { epg_listings } });
    });
    await boot(page);
    await section(page, 'Live TV');
    await sendKeyCode(page, 458);
    await expect(page.locator('.gd-programme.focused')).toContainText('Program day 5');
    await press(page, 'ArrowLeft');
    await expect(page.locator('.gd-programme.focused')).toContainText('Program day 4');
    await press(page, 'ArrowLeft');
    await expect(page.locator('.gd-programme.focused')).toContainText('Program day 3');
    const older = Number(await page.locator('.gd-marks').getAttribute('data-start'));
    expect(older).toBeLessThan(Date.now() - 40 * 3600000);
    for (let i = 0; i < 4; i++) await press(page, 'ArrowLeft');
    expect(Number(await page.locator('.gd-marks').getAttribute('data-start'))).toBeGreaterThanOrEqual(Date.now() - 3 * 86400000 - 5000);
    await press(page, 'ArrowDown');
    expect(Number(await page.locator('.gd-marks').getAttribute('data-start'))).toBeGreaterThan(Date.now() - 3 * 3600000);
});

test('seeking clamps at the programme end and finishing never marks catch-up watched', async ({ page }) => {
    await page.route('**/player_api.php?**', async route => {
        const url = new URL(route.request().url());
        if (url.searchParams.get('action') !== 'get_simple_data_table') return route.continue();
        const now = Math.floor(Date.now() / 1000);
        const listing = (title, start, end) => ({ title: Buffer.from(title).toString('base64'),
            start_timestamp: String(start), stop_timestamp: String(end) });
        await route.fulfill({ json: { epg_listings: [listing('Program short', now - 40, now - 20), listing('Program now', now - 20, now + 1800)] } });
    });
    await boot(page);
    await section(page, 'Live TV');
    await pastProgramme(page);
    await press(page, 'Enter');
    await press(page, 'Enter');
    await playing(page);
    await press(page, 'Enter');
    for (let i = 0; i < 4; i++) await press(page, 'ArrowRight');
    await expect.poll(() => page.locator('#video').evaluate(video => video.currentTime)).toBe(19);
    await sendKeyCode(page, 415);
    await expect.poll(() => page.locator('#video').evaluate(video => video.paused)).toBe(true);
    expect(await page.locator('#video').evaluate(video => video.currentTime)).toBeLessThan(21);
    await back(page);
    await expect(page.locator('#guide')).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('iptvnator-tv:p:default:progress'))).toBeNull();
});
