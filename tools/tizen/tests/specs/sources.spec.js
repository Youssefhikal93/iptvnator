const { test, expect, boot, section, moveTo, press, back, category, sources, sourceMenu, menuChoice } = require('./helpers');

test('Sources is the first group of Settings and has no menu item (#51)', async ({ page }) => {
    await boot(page);
    await expect(page.locator('#rail .rail-item')).toHaveText(['Home', 'Live TV', 'Movies', 'Series', 'Settings']);
    await sources(page);
    await expect(page.locator('#settings .st-group').first()).toHaveText('Sources');
    await expect(page.locator('#settings .st-row').nth(0)).toHaveClass(/st-source/);
    await expect(page.locator('#settings .st-row').nth(0).locator('.st-label')).toHaveText('Regression TV');
    await expect(page.locator('#settings .st-row').nth(0).locator('.st-sub')).toContainText('Active');
    await expect(page.locator('#settings .st-row .st-label').nth(1)).toHaveText('+  Add Xtream account');
    await expect(page.locator('#settings .st-row .st-label').nth(2)).toHaveText('+  Add M3U playlist');
    await expect(page.locator('#settings .st-group').nth(1)).toHaveText('Profiles');
    // OK opens the source's options; the account details are lines the focus skips.
    await press(page, 'Enter');
    await expect(page.locator('#menu .menu-title')).toHaveText('Regression TV');
    await expect(page.locator('#menu .focused')).toHaveText('Watch this source');
    await expect(page.locator('#menu .menu-row.note').first()).toContainText('Xtream Code · ');
    for (let i = 0; i < 10; i++) await press(page, 'ArrowDown');
    await expect(page.locator('#menu .focused')).toHaveText('Remove');
    await back(page);
    await expect(page.locator('#menu')).toBeHidden();
    // Back goes to the groups, then leaves Settings for the menu (#49, #50).
    await back(page);
    await back(page);
    await expect(page.locator('#rail .focused')).toHaveText('Settings');
});

test('with no source the app opens Settings on Add Xtream account', async ({ page }) => {
    await boot(page, { storage: { sources: [] } });
    await expect(page.locator('#rail .active')).toHaveText('Settings');
    await expect(page.locator('#settings .st-row.focused')).toHaveText('+  Add Xtream account');
    await expect(page.locator('#rail .rail-item').filter({ hasText: 'Home' })).toHaveClass(/disabled/);
});

test('add form validates Xtream fields, saves an account, and restores it after reload', async ({ page }) => {
    await boot(page);
    await sources(page, '+  Add Xtream account');
    await press(page, 'Enter');
    await expect(page.locator('#form-title')).toHaveText('Add Xtream account');
    await page.locator('#form-save').click();
    await expect(page.locator('#form-msg')).toHaveText('The link must start with http:// or https://');
    await page.locator('#form-url').fill(new URL(page.url()).origin);
    await page.locator('#form-save').click();
    await expect(page.locator('#form-msg')).toHaveText('Enter the username and password.');
    await page.locator('#form-name').fill('Second account');
    await page.locator('#form-user').fill('other');
    await page.locator('#form-pass').fill('password');
    await page.locator('#form-save').click();
    await expect(page.locator('#form')).toBeHidden();
    await expect(page.locator('body')).toHaveAttribute('data-source', 'Second account');
    await expect(page.locator('#rail .active')).toHaveText('Home');
    await page.reload();
    await expect(page.locator('body')).toHaveAttribute('data-source', 'Second account');
    await sourceMenu(page, 'Regression TV');
    await expect(page.locator('#menu .focused')).toHaveText('Switch to this source');
    await press(page, 'Enter');
    await expect(page.locator('body')).toHaveAttribute('data-source', 'Regression TV');
    await expect(page.locator('#rail .active')).toHaveText('Home');
});

test('M3U import preserves comma-containing group names and exposes only Live TV; removal needs two OKs', async ({ page }) => {
    await boot(page);
    await sources(page, '+  Add M3U playlist');
    await press(page, 'Enter');
    await expect(page.locator('#form-login')).toBeHidden();
    await page.locator('#form-name').fill('Test playlist');
    await page.locator('#form-url').fill(new URL(page.url()).origin + '/playlist.m3u');
    await page.locator('#form-save').click();
    await expect(page.locator('#form')).toBeHidden();
    await section(page, 'Live TV');
    await expect(page.locator('#items .count')).toHaveText('1 / 12');
    await expect(page.locator('#rail .rail-item').filter({ hasText: 'Movies' })).toHaveClass(/disabled/);
    await expect(page.locator('#rail .rail-item').filter({ hasText: 'Series' })).toHaveClass(/disabled/);
    await category(page, 'Sports, HD');
    await expect(page.locator('#items .count')).toHaveText('1 / 6');
    await expect(page.locator('#items .row').first()).toContainText('M3U Channel 2');
    await sourceMenu(page, 'Test playlist');
    await expect(page.locator('#menu')).toContainText('12 channels in 2 groups');
    await moveTo(page, '#menu .focused', 'Remove');
    await press(page, 'Enter');
    await expect(page.locator('#menu .focused')).toHaveText('Press OK again to remove');
    await expect(page.locator('body')).toHaveAttribute('data-source', 'Test playlist');
    await press(page, 'Enter');
    await expect(page.locator('body')).toHaveAttribute('data-source', '');
    await expect(page.locator('#settings')).not.toContainText('Test playlist');
    await expect(page.locator('#settings .st-row.focused')).toHaveCount(1);
});

test('Cancel keeps a source; refresh refetches catalogues; Return cancels an add form', async ({ page }) => {
    let loads = 0;
    page.on('request', req => { if (new URL(req.url()).searchParams.get('action') === 'get_vod_streams') loads++; });
    await boot(page);
    await sourceMenu(page);
    await moveTo(page, '#menu .focused', 'Remove');
    await press(page, 'Enter');
    await moveTo(page, '#menu .focused', 'Cancel');
    await press(page, 'Enter');
    await expect(page.locator('#menu .menu-title')).toHaveText('Regression TV');
    await back(page);
    await expect(page.locator('#settings .st-source')).toHaveCount(1);
    await section(page, 'Movies');
    const before = loads;
    await sourceMenu(page);
    await menuChoice(page, 'Refresh source');
    await expect(page.locator('#rail .active')).toHaveText('Home');
    await expect.poll(() => loads).toBeGreaterThan(before);
    await sources(page, '+  Add Xtream account');
    await press(page, 'Enter');
    await back(page);
    await expect(page.locator('#form')).toBeHidden();
    await expect(page.locator('#settings .st-row.focused')).toHaveText('+  Add Xtream account');
    await expect(page.locator('body')).toHaveAttribute('data-source', 'Regression TV');
});
