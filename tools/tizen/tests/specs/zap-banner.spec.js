const { test, expect, boot, section, enterItems, press, playing, sendKeyCode, back } = require('./helpers');

const banner = (page) => page.locator('#pl-banner');

// Live TV, OK on Channel 1: the first start shows the full controls, not the banner.
async function watchChannelOne(page) {
    await section(page, 'Live TV');
    await enterItems(page);
    await press(page, 'Enter');
    await playing(page);
    await expect(page.locator('#pl-controls')).toBeVisible();
    await expect(banner(page)).toBeHidden();
}

test('#79 zapping shows a short channel banner with the guide, or says the guide has nothing', async ({ page }) => {
    await boot(page);
    await watchChannelOne(page);
    // ▲ moves to Channel 2 in the list it was opened from; the fake guide has nothing for it.
    await press(page, 'ArrowUp');
    await expect(banner(page)).toBeVisible();
    await expect(banner(page).locator('.zb-num')).toHaveText('2');
    await expect(banner(page).locator('.zb-name')).toHaveText('Channel 2 (cat all)');
    await expect(banner(page).locator('.plate')).toBeVisible();
    await playing(page);
    await expect(banner(page).locator('.zb-empty')).toHaveText('No programme information');
    await expect(page.locator('#pl-controls')).toBeHidden();
    // ▼ back to Channel 1: now with progress and next, and Start over (catch-up).
    await press(page, 'ArrowDown');
    await expect(banner(page).locator('.zb-name')).toHaveText('Channel 1 (cat all)');
    await playing(page);
    await expect(banner(page).locator('.pl-epg-tag')).toHaveText(['Now', 'Next']);
    await expect(banner(page).locator('.pl-epg-title')).toHaveText([/1001/, /1001/]);
    await expect(banner(page).locator('.pl-epg-fill')).toHaveAttribute('style', /width: \d/);
    await expect(banner(page).locator('.zb-keys')).toContainText('Start over');
    await expect(banner(page).locator('.zb-empty')).toHaveCount(0);
    // It hides by itself after about 4 s.
    await expect(banner(page)).toBeHidden({ timeout: 7000 });
    await expect(page.locator('#pl-controls')).toBeHidden();
    // ▶ on the banner starts the programme on now over.
    await press(page, 'ArrowUp');
    await playing(page);
    await press(page, 'ArrowDown');
    await playing(page);
    await expect(banner(page).locator('.zb-keys')).toContainText('Start over');
    const requested = page.waitForRequest(request => new URL(request.url()).pathname.startsWith('/timeshift/'));
    await press(page, 'ArrowRight');
    await requested;
    await playing(page);
    await expect(banner(page)).toBeHidden();
    await expect(page.locator('#pl-live')).toBeHidden();
});

test('#79 OK or Info on the banner opens the full controls; other keys, Return too, hide it and work', async ({ page }) => {
    await boot(page);
    await watchChannelOne(page);
    await press(page, 'ArrowUp');
    await playing(page);
    await expect(banner(page)).toBeVisible();
    await press(page, 'Enter');
    await expect(banner(page)).toBeHidden();
    await expect(page.locator('#pl-controls')).toBeVisible();
    await back(page);
    await expect(page.locator('#pl-controls')).toBeHidden();
    // The previous-channel key zaps too; Info there opens the full controls.
    await sendKeyCode(page, 10190);
    await playing(page);
    await expect(banner(page).locator('.zb-name')).toHaveText('Channel 1 (cat all)');
    await sendKeyCode(page, 457);
    await expect(banner(page)).toBeHidden();
    await expect(page.locator('#pl-controls')).toBeVisible();
    await expect(page.locator('#pl-menu')).toBeHidden();
    await back(page);
    await expect(page.locator('#pl-controls')).toBeHidden();
    // Green (previous channel) again; ◀ on its banner opens the drawer and hides it.
    await sendKeyCode(page, 404);
    await playing(page);
    await expect(banner(page).locator('.zb-name')).toHaveText('Channel 2 (cat all)');
    await press(page, 'ArrowLeft');
    await expect(page.locator('#pl-channels')).toBeVisible();
    await expect(banner(page)).toBeHidden();
    // A drawer pick shows it.
    await expect(page.locator('.pl-channel.focused .pl-channel-name')).toHaveText('Channel 2 (cat 3)');
    await press(page, 'ArrowDown');
    await expect(page.locator('.pl-channel.focused .pl-channel-name')).toHaveText('Channel 3 (cat 3)');
    await press(page, 'Enter');
    await expect(banner(page).locator('.zb-name')).toHaveText('Channel 3 (cat 3)');
    await playing(page);
    await expect(banner(page)).toBeVisible();
    // Return hides it and still leaves the player, as before the banner.
    await back(page);
    await expect(banner(page)).toBeHidden();
    await expect(page.locator('#player')).toBeHidden();
});

test('#79 with Animations Off the banner appears and leaves without sliding', async ({ page }) => {
    await boot(page, { storage: { settings: { motion: 'off' } } });
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'off');
    await watchChannelOne(page);
    await press(page, 'ArrowUp');
    await playing(page);
    await expect(banner(page)).toBeVisible();
    await expect(banner(page).locator('.zb')).toHaveCSS('animation-name', 'none');
    await expect(banner(page)).toBeHidden({ timeout: 7000 });
    await expect(banner(page)).not.toHaveClass(/zb-out/);
});
