const { test, expect, boot, section, press, moveTo, resumeSeed, setting, back } = require('./helpers');

test('settings show current values; guide Off stops requests and On resumes them', async ({ page }) => {
    let requests = 0;
    page.on('request', req => { if (new URL(req.url()).searchParams.get('action') === 'get_short_epg') requests++; });
    await boot(page);
    await section(page, 'Settings');
    const row = label => page.locator('.st-row').filter({ has: page.locator('.st-label', { hasText: label }) });
    await expect(row('Autoplay next episode').locator('.st-value')).toHaveText('8 s');
    await expect(row('Skip intro length').locator('.st-value')).toHaveText('90 s');
    await expect(row('On start open').locator('.st-value')).toHaveText('Last channel');
    await setting(page, 'Programme guide (now and next)');
    await press(page, 'Enter');
    await expect(row('Programme guide').locator('.st-value')).toHaveText('Off');
    const beforeBrowsing = requests;
    await section(page, 'Live TV');
    await press(page, 'ArrowDown');
    await expect(page.locator('#items .list-header')).toContainText('get_live_categories cat 1');
    // Negative network assertion needs an observation window beyond the 300 ms debounce.
    await page.waitForTimeout(1000);
    expect(requests).toBe(beforeBrowsing);
    await expect(page.locator('#items .epg-now')).toHaveCount(0);
    // Settings opens on the groups; the group last used is still chosen (#49).
    await section(page, 'Settings');
    await expect(page.locator('.st-group-item.focused')).toContainText('Playback');
    await setting(page, 'Programme guide (now and next)');
    await press(page, 'Enter');
    await expect(row('Programme guide').locator('.st-value')).toHaveText('On');
    await section(page, 'Live TV');
    await expect.poll(() => requests).toBeGreaterThan(0);
    await expect(page.locator('#items .epg-now').first()).toBeVisible();
});

test('Showcase home has a 360px hero and settings survive reload', async ({ page }) => {
    await boot(page, resumeSeed());
    await setting(page, 'Home layout');
    await press(page, 'Enter');
    await expect(page.locator('.st-row.focused .st-value')).toHaveText('Showcase');
    await section(page, 'Home');
    await expect(page.locator('#home')).toHaveClass(/showcase/);
    await expect(page.locator('.hm-hero')).toHaveCSS('height', '360px');
    await page.reload();
    await expect(page.locator('#home')).toHaveClass(/showcase/);
    await expect(page.locator('.hm-hero')).toHaveCSS('height', '360px');
    await section(page, 'Settings');
    await expect(page.locator('.st-row').filter({ hasText: 'Home layout' }).locator('.st-value')).toHaveText('Showcase');
});

test('Settings shows groups on the left and one group of rows on the right (#49)', async ({ page }) => {
    await boot(page);
    await section(page, 'Settings');
    const groups = page.locator('#settings .st-group-item');
    await expect(groups.first()).toContainText('Sources');
    await expect(groups.first()).toHaveClass(/focused/);
    await expect(page.locator('#hints')).toContainText('group');
    // ▼ shows the next group's rows at once; only that group is visible.
    await press(page, 'ArrowDown');
    await press(page, 'ArrowDown');
    await expect(groups.nth(2)).toContainText('Playback');
    await expect(page.locator('#settings .st-section:visible .st-group')).toHaveText('Playback');
    await expect(page.locator('#settings .st-section:visible .st-row')).toHaveCount(4);
    // ▶ enters the rows; a row says what it does and on/off is a switch.
    await press(page, 'ArrowRight');
    await expect(page.locator('#settings .st-row.focused .st-label')).toHaveText('Autoplay next episode');
    await expect(page.locator('#settings .st-row.focused .st-sub')).toHaveText('Counts down to the next episode when one ends');
    await expect(page.locator('#settings .st-row.focused .st-arrow')).toHaveCount(2);
    await expect(page.locator('#hints')).toContainText('Return: groups');
    await press(page, 'ArrowDown');
    await press(page, 'ArrowDown');
    await expect(page.locator('#settings .st-row.focused .st-switch')).toHaveClass(/on/);
    await press(page, 'Enter');
    await expect(page.locator('#settings .st-row.focused .st-switch')).not.toHaveClass(/on/);
    await expect(page.locator('#settings .st-row.focused .st-value')).toHaveText('Off');
    // Return goes back to the groups, then to the menu.
    await back(page);
    await expect(groups.nth(2)).toHaveClass(/focused/);
    await expect(page.locator('#settings .st-row.focused')).toHaveCount(0);
    await back(page);
    await expect(page.locator('#rail .focused')).toHaveText('Settings');
});
