const { test, expect, boot, section, enterItems, press, sendKeyCode, back, playing, playerMenu, moveTo } = require('./helpers');

test('#97 pause releases live, resumes the remembered minute, rewinds and returns live without overlapping streams', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => {
        const create = mpegts.createPlayer;
        window.streams = { active: 0, overlaps: 0 };
        mpegts.createPlayer = function (source, options) {
            if (streams.active) streams.overlaps++;
            streams.active++;
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
    await expect(page.locator('#pl-play')).toHaveAttribute('aria-label', 'Pause');
    const before = Date.now();
    await press(page, 'Enter');
    const after = Date.now();
    await expect(page.locator('#pl-play')).toHaveAttribute('aria-label', 'Play');
    await expect.poll(() => page.evaluate(() => streams.active)).toBe(0);
    await expect(page.locator('#pl-now')).toContainText('behind live');
    const request = page.waitForRequest(req => new URL(req.url()).pathname.startsWith('/timeshift/'));
    await press(page, 'Enter');
    const pathname = new URL((await request).url()).pathname;
    const stamp = time => new Date(time).toISOString().slice(0, 16).replace('T', ':').replace(/:(\d\d)$/, '-$1');
    expect([stamp(before), stamp(after)]).toContain(pathname.split('/')[5]);
    await playing(page);
    await expect(page.locator('#pl-live')).toBeHidden();
    const first = await page.evaluate(() => Player.request().catchUp.start);
    await press(page, 'ArrowUp'); // Timeline: arrows reopen at provider-minute boundaries.
    const rewound = page.waitForRequest(req => new URL(req.url()).pathname.startsWith('/timeshift/'));
    await press(page, 'ArrowLeft');
    await rewound;
    await playing(page);
    expect(await page.evaluate(() => Player.request().catchUp.start)).toBeLessThan(first);
    const older = await page.evaluate(() => Player.request().catchUp.start);
    await press(page, 'ArrowUp');
    await press(page, 'ArrowRight');
    await playing(page);
    expect(await page.evaluate(() => Player.request().catchUp.start)).toBeGreaterThan(older);
    await sendKeyCode(page, 19); // Pause again while already behind live.
    await expect.poll(() => page.evaluate(() => streams.active)).toBe(0);
    await sendKeyCode(page, 415);
    await playing(page);
    await playerMenu(page);
    await moveTo(page, '.pl-menu-item.focus', 'Back to live');
    await press(page, 'Enter');
    await playing(page);
    await expect(page.locator('#pl-live')).toBeVisible();
    expect(await page.evaluate(() => streams)).toEqual({ active: 1, overlaps: 0 });
    expect(await page.evaluate(() => Stored.json(ProfileStore.key('progress:' + Sources.current().id)))).toBeNull();
});

test('#97 no guide is needed; overlay badges and Arabic controls identify catch-up, non-archive stays unchanged', async ({ page }) => {
    await boot(page);
    await section(page, 'Live TV');
    await enterItems(page);
    await press(page, 'ArrowDown');
    await press(page, 'ArrowDown'); // Channel 3: no archive.
    await press(page, 'Enter');
    await playing(page);
    await expect(page.locator('#pl-transport')).toBeHidden();
    await sendKeyCode(page, 19); // Pause must not stop an ordinary live stream.
    await expect.poll(() => page.locator('#video').evaluate(video => video.paused)).toBe(false);
    await sendKeyCode(page, 405);
    await expect(page.locator('#pl-menu')).toBeVisible();
    await expect(page.locator('#pl-menu')).not.toContainText('Pause');
    await back(page);
    await press(page, 'ArrowUp');
    await press(page, 'ArrowUp'); // Channel 5 has catch-up, no now/next guide.
    await playing(page);
    await expect(page.locator('#pl-title')).toContainText('Channel 5');
    await sendKeyCode(page, 19);
    await expect(page.locator('#pl-play')).toHaveAttribute('aria-label', 'Play');
    await sendKeyCode(page, 415);
    await playing(page);
    await expect(page.locator('#pl-now')).toContainText('behind live');
    await playerMenu(page);
    await press(page, 'Enter'); // Back to live.
    await playing(page);
    await back(page); // Hide controls so Left opens channel list.
    await press(page, 'ArrowLeft');
    await expect(page.locator('#pl-channels .pl-channel.focused .catch-up-badge')).toHaveText('Catch-up');
    await expect(page.locator('#pl-channels .pl-channel').filter({ hasText: 'Channel 3 ' }).locator('.catch-up-badge')).toHaveCount(0);
    await back(page);
    await page.evaluate(() => I18n.setLanguage('ar'));
    await press(page, 'Enter');
    await expect(page.locator('#pl-play')).toHaveAttribute('aria-label', 'إيقاف مؤقت');
});

test('#97 hold OK offers Pause; Back to live works while paused and zapping clears the paused session', async ({ page }) => {
    await boot(page);
    await section(page, 'Live TV');
    await enterItems(page);
    await press(page, 'Enter');
    await playing(page);
    await page.keyboard.down('Enter');
    await page.waitForTimeout(800);
    await page.keyboard.up('Enter');
    await expect(page.locator('#pl-menu')).toBeVisible();
    await moveTo(page, '.pl-menu-item.focus', 'Pause');
    await press(page, 'Enter');
    await expect(page.locator('#pl-menu')).toBeHidden();
    await expect(page.locator('#pl-play')).toHaveAttribute('aria-label', 'Play');
    await expect(page.locator('#pl-live')).toBeHidden();
    // The live row: ⏪ ⏸ ⏩, then LIVE while behind (#97).
    await press(page, 'ArrowRight');
    await expect(page.locator('#pl-buttons .focus')).toHaveAttribute('data-id', 'forward');
    await expect(page.locator('#pl-buttons .focus')).toHaveAttribute('aria-label', 'Forward 1 min');
    await press(page, 'ArrowRight');
    await expect(page.locator('#pl-buttons .focus')).toHaveAttribute('aria-label', 'Back to live');
    await expect(page.locator('#pl-buttons .focus')).toHaveText('LIVE');
    await press(page, 'Enter');
    await playing(page);
    await sendKeyCode(page, 19);
    await expect(page.locator('#pl-play')).toHaveAttribute('aria-label', 'Play');
    await sendKeyCode(page, 427); // CH+ cancels the paused session.
    await playing(page);
    await expect(page.locator('#pl-title')).toContainText('Channel 2');
    await sendKeyCode(page, 415);
    expect(await page.evaluate(() => Player.request().live)).toBe(true);
    expect(await page.evaluate(() => Player.request().liveReplay)).toBeUndefined();
});

test('#97 a finite timeshift segment continues behind the moving live edge', async ({ page }) => {
    await boot(page);
    await section(page, 'Live TV');
    await enterItems(page);
    await press(page, 'Enter');
    await playing(page);
    // The provider serves one minute. By the time it ends, live has moved on.
    await page.clock.setFixedTime(Math.floor(Date.now() / 60000) * 60000 - 5 * 60000 + 10000);
    await sendKeyCode(page, 19);
    await sendKeyCode(page, 415);
    await playing(page);
    const start = await page.evaluate(() => Player.request().catchUp.start);
    await page.clock.setFixedTime(Date.now());
    const next = page.waitForRequest(req => new URL(req.url()).pathname.startsWith('/timeshift/'));
    await page.locator('#video').evaluate(video => { video.currentTime = 59; });
    await next;
    await playing(page);
    expect(await page.evaluate(() => Player.request().catchUp.start)).toBe(start + 60000);
    await expect(page.locator('#pl-menu')).toBeHidden();
    await expect(page.locator('#pl-now')).toContainText('behind live');
});
