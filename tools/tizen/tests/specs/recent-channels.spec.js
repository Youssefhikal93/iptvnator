const { test, expect, boot, section, enterItems, press, holdOK, moveTo, menuChoice, sendKeyCode, playing, back, channel } = require('./helpers');

// A channel counts as watched after 10 s on screen (#80).
const WATCHED_MS = 10500;

// From the categories: the Recent channels row, with its channels listed.
async function recentRow(page) {
    await moveTo(page, '#categories .focused .label', 'Recent channels', 'ArrowUp');
    await expect(page.locator('#items .list-header')).toContainText('Recent channels');
    await expect(page.locator('#items .skeleton')).toHaveCount(0);
}

// The channel names in the list, without their numbers.
const names = page => page.locator('#items .row .label').evaluateAll(rows => rows.map(row => row.firstChild.textContent.trim().replace(/^\d+\.\s*/, '')));

// ◀ in the drawer until its first row, Recent channels, shows.
async function drawerRecent(page) {
    await press(page, 'ArrowLeft');
    await expect(page.locator('#pl-channels')).toBeVisible();
    for (let i = 0; i < 40 && !(await page.locator('.pl-channel-header').innerText()).includes('Recent channels'); i++) await press(page, 'ArrowLeft');
    await expect(page.locator('.pl-channel-header')).toContainText('Recent channels');
    await expect(page.locator('.pl-channel').first()).toBeVisible();
}

test('Recent channels lists channels watched 10 s or more, newest first, in the drawer and in Live TV', async ({ page }) => {
    await boot(page);
    await section(page, 'Live TV');
    // Nothing watched yet: the row is in Live TV, empty.
    await moveTo(page, '#categories .focused .label', 'Recent channels', 'ArrowUp');
    await expect(page.locator('#items')).toContainText('No recent channels');
    await moveTo(page, '#categories .focused .label', 'get_live_categories cat 1', 'ArrowDown', 6);
    await expect(page.locator('#items .list-header')).toContainText('get_live_categories cat 1');
    await expect(page.locator('#items .row .epg-now').first()).toBeVisible();
    await enterItems(page);
    await press(page, 'Enter');
    await playing(page);
    // The drawer has no Recent row until a channel qualifies.
    await expect(page.locator('#pl-controls')).toBeHidden();
    await press(page, 'ArrowLeft');
    await expect(page.locator('.pl-channel-header')).not.toContainText('Recent channels');
    await back(page);
    await expect(page.locator('#pl-channels')).toBeHidden();
    await page.waitForTimeout(WATCHED_MS);
    // A channel zapped past in a few seconds is not added.
    const title = await page.locator('#pl-title').innerText();
    await sendKeyCode(page, 427);
    await playing(page);
    await expect(page.locator('#pl-title')).not.toHaveText(title);
    await page.waitForTimeout(3000);
    await expect(page.locator('#pl-controls')).toBeHidden();
    // The zap banner (#79) goes by itself; Return while it shows only hides it.
    await expect(page.locator('#pl-banner .zb-name')).toBeHidden();
    await back(page);
    await press(page, 'ArrowLeft');
    await recentRow(page);
    await expect(page.locator('#items .row')).toHaveCount(1);
    expect(await names(page)).toEqual([expect.stringContaining('Channel')]);
    const first = (await names(page))[0];
    // Play another channel for 10 s from the drawer; Recent comes first there.
    await enterItems(page);
    await press(page, 'Enter');
    await playing(page);
    await expect(page.locator('#pl-controls')).toBeHidden();
    await drawerRecent(page);
    await expect(page.locator('.pl-channel .pl-channel-name')).toHaveText([first]);
    // Past the drawer's Favorites (#76) to All channels.
    for (let i = 0; i < 5 && !(await page.locator('.pl-channel-header').innerText()).includes('All channels'); i++) await press(page, 'ArrowRight');
    await expect(page.locator('.pl-channel-header')).toContainText('All channels');
    await press(page, 'ArrowDown');
    const second = await page.locator('.pl-channel.focused .pl-channel-name').innerText();
    expect(second).not.toBe(first);
    await press(page, 'Enter');
    await playing(page);
    await page.waitForTimeout(WATCHED_MS);
    await expect(page.locator('#pl-controls')).toBeHidden();
    await drawerRecent(page);
    await expect(page.locator('.pl-channel .pl-channel-name')).toHaveText([second, first]);
    // OK on a Recent row plays it.
    await press(page, 'ArrowDown');
    await press(page, 'Enter');
    await playing(page);
    await expect(page.locator('#pl-title')).toContainText(first);
});

test('Recent channels survive a restart and Clear recent channels empties them', async ({ page }) => {
    const seeded = [channel(5), channel(3)].map((entry, i) => ({ ...entry, watchedAt: 2000 - i }));
    await boot(page, { storage: { 'p:default:recent-channels:s1': seeded, settings: { onStart: 'home' } } });
    await section(page, 'Live TV');
    await recentRow(page);
    await expect(page.locator('#items .row')).toHaveCount(2);
    expect(await names(page)).toEqual([expect.stringContaining('Channel 5'), expect.stringContaining('Channel 3')]);
    await page.reload();
    await section(page, 'Live TV');
    await recentRow(page);
    await expect(page.locator('#items .row')).toHaveCount(2);
    await enterItems(page);
    await holdOK(page);
    await expect(page.locator('#menu .menu-row').filter({ hasText: 'Clear recent channels' })).toHaveCount(1);
    await menuChoice(page, 'Clear recent channels');
    await expect(page.locator('#items')).toContainText('No recent channels');
    await expect(page.locator('#toast')).toHaveText('Recent channels cleared');
    await page.reload();
    await section(page, 'Live TV');
    await recentRow(page);
    await expect(page.locator('#items')).toContainText('No recent channels');
});
