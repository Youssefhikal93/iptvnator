const { test, expect, boot, section, enterItems, press, sendKeyCode, playing } = require('./helpers');

test('Start over (#82) and Back to live release each stream before opening the next', async ({ page }) => {
    const start = Math.floor(Date.now() / 60000) * 60000 - 60000;
    const end = start + 3600000;
    await page.route('**/player_api.php?**', async route => {
        const url = new URL(route.request().url());
        if (url.searchParams.get('action') !== 'get_short_epg') return route.continue();
        await route.fulfill({ json: { epg_listings: [{ title: Buffer.from('Programme now').toString('base64'),
            start_timestamp: String(start / 1000), stop_timestamp: String(end / 1000) }] } });
    });
    await boot(page);
    // Count connections at the media engine boundary, including rapid banner calls.
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
    await expect(page.locator('#pl-epg .pl-epg-catch-up')).toHaveText('/ Hold OK: menu, then Start over');
    await expect(page.locator('#pl-epg .pl-epg-catch-up .key-dot-yellow')).toHaveCount(1);
    const requested = page.waitForRequest(request => new URL(request.url()).pathname.startsWith('/timeshift/'));
    await page.evaluate(() => { Player.startOver(); Player.startOver(); });
    expect(new URL((await requested).url()).pathname).toMatch(/\/60\/[^/]+\/1001\.ts$/);
    await playing(page);
    await expect(page.locator('#pl-title')).toContainText('Programme now');
    await expect(page.locator('#pl-live')).toBeHidden();
    const clocks = await page.evaluate(times => times.map(time => I18n.time(time)), [start, end]);
    await expect(page.locator('#pl-cur')).toHaveText(clocks[0]);
    await expect(page.locator('#pl-total')).toHaveText(clocks[1]);
    await press(page, 'ArrowRight'); // Start over on the transport row.
    await press(page, 'ArrowRight'); // Back to live.
    await expect(page.locator('#pl-buttons .focus')).toHaveText('Back to live');
    await press(page, 'Enter');
    await playing(page);
    await expect(page.locator('#pl-live')).toBeVisible();
    expect(await page.evaluate(() => streams)).toEqual({ active: 1, overlaps: 0, modes: [true, false, true] });
    expect(await page.evaluate(() => Stored.json(ProfileStore.key('progress:' + Sources.current().id)))).toBeNull();
});

test('reaching now offers Back to live and forward seeks stop at the live edge', async ({ page }) => {
    const start = Math.floor(Date.now() / 1000) * 1000 - 20000;
    await page.route('**/player_api.php?**', async route => {
        const url = new URL(route.request().url());
        if (url.searchParams.get('action') !== 'get_short_epg') return route.continue();
        await route.fulfill({ json: { epg_listings: [{ title: Buffer.from('Short delay').toString('base64'),
            start_timestamp: String(start / 1000), stop_timestamp: String(start / 1000 + 3600) }] } });
    });
    await boot(page);
    await section(page, 'Live TV');
    await enterItems(page);
    await press(page, 'Enter');
    await playing(page);
    await expect(page.locator('#pl-epg')).toContainText('Hold OK: menu, then Start over');
    await sendKeyCode(page, 405);
    await expect(page.locator('.pl-menu-item.focus')).toHaveText(/Start over|Watch from start/);
    await press(page, 'Enter');
    await playing(page);
    await press(page, 'Enter'); // Pause, then seek up to the moving live edge.
    await press(page, 'ArrowUp');
    for (let i = 0; i < 4; i++) await press(page, 'ArrowRight');
    await expect(page.locator('#pl-menu')).toBeVisible();
    await expect(page.locator('#pl-menu .pl-menu-title')).toHaveText('You have caught up with live TV');
    await expect(page.locator('.pl-menu-item.focus')).toHaveText('Back to live');
    expect(await page.locator('#video').evaluate(video => video.paused)).toBe(true);
    const position = await page.locator('#video').evaluate(video => video.currentTime);
    expect(position).toBeGreaterThan(20);
    expect(position).toBeLessThanOrEqual((Date.now() - start) / 1000);
    await press(page, 'Enter');
    await playing(page);
    await expect(page.locator('#pl-live')).toBeVisible();
});

test('non-archive channels and archive channels without a now programme do not offer Start over', async ({ page }) => {
    await boot(page);
    await section(page, 'Live TV');
    await enterItems(page);
    await press(page, 'ArrowDown');
    await press(page, 'ArrowDown'); // Channel 3 has a guide but no catch-up.
    await press(page, 'Enter');
    await playing(page);
    await expect(page.locator('#pl-epg')).toContainText('1003');
    await sendKeyCode(page, 405);
    await expect(page.locator('#pl-menu')).toBeVisible();
    await expect(page.locator('#pl-menu')).not.toContainText('Start over');
    await sendKeyCode(page, 405);
    await page.evaluate(() => Player.startOver());
    await expect(page.locator('#pl-title')).toHaveText('3. Channel 3 (cat all)');
    await press(page, 'ArrowUp');
    await press(page, 'ArrowUp'); // Channel 5 has catch-up but no guide.
    await playing(page);
    await expect(page.locator('#pl-title')).toHaveText('5. Channel 5 (cat all)');
    await sendKeyCode(page, 405);
    await expect(page.locator('#pl-menu')).toBeVisible();
    await expect(page.locator('#pl-menu')).not.toContainText('Start over');
    await page.evaluate(() => Player.startOver());
    await expect(page.locator('#pl-title')).toHaveText('5. Channel 5 (cat all)');
});
