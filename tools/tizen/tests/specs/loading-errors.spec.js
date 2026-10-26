const { test, expect, boot, section, enterItems, press, playing, moveTo } = require('./helpers');

test('fresh catalogue shows skeletons, source error with focused countdown Retry, and recovers on OK', async ({ page, request }) => {
    await boot(page);
    await expect(page.locator('#home .skeleton')).toHaveCount(0);
    await request.get('/__fail?api=503');
    // Hold the first response so the loading state is observable deterministically.
    let release;
    const held = new Promise(resolve => { release = resolve; });
    await page.route('**/player_api.php?**', async route => {
        if (new URL(route.request().url()).searchParams.get('action') === 'get_live_categories') await held;
        await route.continue();
    });
    try {
        await press(page, 'Escape');
        await moveTo(page, '#rail .focused', 'Live TV');
        await press(page, 'ArrowRight');
        await expect(page.locator('#categories .skeleton').first()).toBeVisible();
        await expect(page.locator('#items .skeleton').first()).toBeVisible();
    } finally { release(); }
    await expect(page.locator('#load-error')).toBeVisible();
    await expect(page.locator('#load-message')).toHaveText('Source not responding');
    await expect(page.locator('#load-retry')).toBeFocused();
    await expect(page.locator('#load-countdown')).toContainText(/Retrying in \d+ s/);
    await request.get('/__fail');
    await press(page, 'Enter');
    await expect(page.locator('#load-error')).toBeHidden();
    await expect(page.locator('#items .count')).toHaveText('1 / 500');
});

test('stream failure offers Retry playback and Back with arrow focus; Retry recovers', async ({ page, request }) => {
    await boot(page);
    await section(page, 'Live TV');
    await request.get('/__fail?media=404');
    await enterItems(page);
    await press(page, 'Enter');
    await expect(page.locator('#pl-error-actions')).toBeVisible({ timeout: 45_000 });
    const buttons = page.locator('#pl-error-actions button');
    await expect(buttons).toHaveText(['Retry playback', 'Back']);
    await expect(buttons.nth(0)).toBeFocused();
    await press(page, 'ArrowRight');
    await expect(buttons.nth(1)).toBeFocused();
    await press(page, 'ArrowLeft');
    await expect(buttons.nth(0)).toBeFocused();
    await request.get('/__fail');
    await press(page, 'Enter');
    await playing(page);
    await expect(page.locator('#pl-error-actions')).toBeHidden();
});
