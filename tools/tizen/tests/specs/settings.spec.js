const { test, expect, boot, section, press, moveTo, resumeSeed, setting, choose, back } = require('./helpers');

test('settings show current values; guide Off stops requests and On resumes them', async ({ page }) => {
    let requests = 0;
    page.on('request', req => { if (new URL(req.url()).searchParams.get('action') === 'get_short_epg') requests++; });
    await boot(page);
    await section(page, 'Settings');
    const row = label => page.locator('.st-row').filter({ has: page.locator('.st-label', { hasText: label }) });
    await expect(row('Autoplay next episode').locator('.st-value')).toHaveText('8 s');
    // Skip intro is learnt from the viewer's own skip: no length to choose.
    await expect(row('Skip intro length')).toHaveCount(0);
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

test('Big first row and Backdrop home layouts, and the choice survives reload', async ({ page }) => {
    await boot(page, resumeSeed());
    await setting(page, 'Home layout');
    await choose(page, 'Big first row');
    await expect(page.locator('.st-row.focused .st-value')).toHaveText('Big first row');
    await section(page, 'Home');
    // No banner: the first row has wide tiles with the time left.
    await expect(page.locator('#home')).toHaveClass(/bigrow/);
    await expect(page.locator('.hm-hero')).toHaveCount(0);
    await expect(page.locator('.hm-row').first()).toHaveClass(/big/);
    await expect(page.locator('.hm-row.big .hm-card')).toHaveText(/Movie 25/);
    await expect(page.locator('.hm-row.big .hm-label').first()).toContainText('min left');
    await page.reload();
    await expect(page.locator('#home')).toHaveClass(/bigrow/);
    await setting(page, 'Home layout');
    await choose(page, 'Backdrop');
    await expect(page.locator('.st-row.focused .st-value')).toHaveText('Backdrop');
    await section(page, 'Home');
    // The focused title is drawn behind one row; the next row peeks in below.
    await expect(page.locator('#home')).toHaveClass(/backdrop/);
    await expect(page.locator('.hm-stage-rows > .hm-row')).toHaveCount(1);
    await expect(page.locator('.hm-stage-below .hm-row')).toHaveCount(1);
    await expect(page.locator('.hm-peek')).toHaveCount(0);
    const first = await page.locator('.hm-stage-rows .hm-card > span').first().textContent();
    await expect(page.locator('.hm-stage-text .hm-hero-title')).toHaveText(first);
    await press(page, 'ArrowDown');
    await press(page, 'ArrowRight');
    const second = await page.locator('.hm-stage-rows .hm-card.focus > span').textContent();
    await expect(page.locator('.hm-stage-text .hm-hero-title')).toHaveText(second);
    // Further down, the bottom of the row above peeks in over the focused
    // one, without its title.
    await expect(page.locator('.hm-stage-rows > .hm-peek .hm-card').first()).toBeVisible();
    await expect(page.locator('.hm-stage-rows > .hm-peek h2')).toBeHidden();
    await expect(page.locator('.hm-stage-text')).not.toContainText('Continue watching');
});

test('Settings shows groups on the left and one group of rows on the right (#49)', async ({ page }) => {
    await boot(page);
    await section(page, 'Settings');
    const groups = page.locator('#settings .st-group-item');
    await expect(groups.first()).toContainText('Sources');
    await expect(groups.first()).toHaveClass(/focused/);
    // No key-hint bar: the screen speaks for itself.
    await expect(page.locator('#hints')).toHaveCount(0);
    // ▼ shows the next group's rows at once; only that group is visible.
    await press(page, 'ArrowDown');
    await press(page, 'ArrowDown');
    await expect(groups.nth(2)).toContainText('Playback');
    await expect(page.locator('#settings .st-section:visible .st-group')).toHaveText('Playback');
    // Playback, then its Picture and Start-up parts (#52).
    await expect(page.locator('#settings .st-section:visible .st-row')).toHaveCount(5);
    await expect(page.locator('#settings .st-section:visible .st-part')).toHaveText(['Picture', 'Start-up']);
    // ▶ enters the rows; a row says what it does and on/off is a switch.
    await press(page, 'ArrowRight');
    await expect(page.locator('#settings .st-row.focused .st-label')).toHaveText('Autoplay next episode');
    await expect(page.locator('#settings .st-row.focused .st-sub')).toHaveText('Counts down to the next episode when one ends');
    await expect(page.locator('#settings .st-row.focused .st-arrow')).toHaveCount(1);
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

test('OK on a Settings row lists its choices; ◀ goes back to the groups', async ({ page }) => {
    await boot(page);
    await setting(page, 'Autoplay next episode');
    // ▶ no longer changes the value.
    await press(page, 'ArrowRight');
    await expect(page.locator('#settings .st-row.focused .st-value')).toHaveText('8 s');
    await press(page, 'Enter');
    await expect(page.locator('#menu')).toBeVisible();
    await expect(page.locator('#menu .focused')).toHaveText('\u2713 8 s');
    await press(page, 'ArrowDown');
    await expect(page.locator('#menu .focused')).toHaveText('15 s');
    await press(page, 'Enter');
    await expect(page.locator('#menu')).toBeHidden();
    await expect(page.locator('#settings .st-row.focused .st-value')).toHaveText('15 s');
    // Return closes the list without a change.
    await press(page, 'Enter');
    await press(page, 'ArrowUp');
    await back(page);
    await expect(page.locator('#menu')).toBeHidden();
    await expect(page.locator('#settings .st-row.focused .st-value')).toHaveText('15 s');
    // ◀ goes back to the groups, from any row.
    await press(page, 'ArrowDown');
    await press(page, 'ArrowLeft');
    await expect(page.locator('#settings .st-group-item.focused')).toContainText('Playback');
    await expect(page.locator('#settings .st-row.focused')).toHaveCount(0);
});
