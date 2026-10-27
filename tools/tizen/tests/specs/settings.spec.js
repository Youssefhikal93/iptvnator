const { test, expect, boot, section, press, moveTo, resumeSeed } = require('./helpers');

test('settings show current values; guide Off stops requests and On resumes them', async ({ page }) => {
    let requests = 0;
    page.on('request', req => { if (new URL(req.url()).searchParams.get('action') === 'get_short_epg') requests++; });
    await boot(page);
    await section(page, 'Settings');
    const row = label => page.locator('.st-row').filter({ has: page.locator('.st-label', { hasText: label }) });
    await expect(row('Autoplay next episode').locator('.st-value')).toHaveText('8 s');
    await expect(row('Skip intro length').locator('.st-value')).toHaveText('90 s');
    await expect(row('On start open').locator('.st-value')).toHaveText('Last channel');
    await moveTo(page, '.st-row.focused .st-label', 'Programme guide (now and next)');
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
    await section(page, 'Settings');
    await expect(page.locator('.st-row.focused .st-label')).toHaveText('Programme guide (now and next)');
    await press(page, 'Enter');
    await expect(row('Programme guide').locator('.st-value')).toHaveText('On');
    await section(page, 'Live TV');
    await expect.poll(() => requests).toBeGreaterThan(0);
    await expect(page.locator('#items .epg-now').first()).toBeVisible();
});

test('Showcase home has a 360px hero and settings survive reload', async ({ page }) => {
    await boot(page, resumeSeed());
    await section(page, 'Settings');
    await moveTo(page, '.st-row.focused .st-label', 'Home layout');
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
