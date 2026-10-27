const { test, expect, boot, channel, section, category, enterItems, toolbar, press, back, holdOK, menuChoice, moveTo, playing, setting } = require('./helpers');

const labels = page => page.locator('#categories .row .label').allTextContents();
const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('iptvnator-tv:p:default:hidden-categories:s1') || '{}'));
const focusedCategory = page => page.locator('#categories .focused .label');

test('hold OK on a category hides it, opens the next one and stays hidden after a reload', async ({ page }) => {
    await boot(page);
    await section(page, 'Live TV');
    await category(page, 'get_live_categories cat 1');
    await holdOK(page);
    await expect(page.locator('#menu .menu-title')).toHaveText('get_live_categories cat 1');
    await expect(page.locator('#menu .menu-row')).toHaveText(['Hide category', 'Hide all except this', 'Manage categories', 'Set a PIN first', 'Cancel']);
    await menuChoice(page, 'Hide category');
    await expect(focusedCategory(page)).toHaveText('get_live_categories cat 2');
    await expect(page.locator('#items .skeleton')).toHaveCount(0);
    await expect(page.locator('#items .row .label').first()).toContainText('(cat 2)');
    const shown = await labels(page);
    expect(shown).not.toContain('get_live_categories cat 1');
    expect(shown).toContain('All channels');
    expect(await stored(page)).toEqual({ live: ['1'] });
    await page.reload();
    await section(page, 'Live TV');
    expect(await labels(page)).not.toContain('get_live_categories cat 1');
    expect(await labels(page)).toContain('get_live_categories cat 2');
});

test('Hide all except this keeps one real category; virtual rows stay and cannot be hidden', async ({ page }) => {
    await boot(page);
    await section(page, 'Movies');
    await category(page, 'get_vod_categories cat 3');
    await holdOK(page);
    await menuChoice(page, 'Hide all except this');
    await expect.poll(async () => (await labels(page)).filter(label => label.startsWith('get_vod_categories')).join('|')).toBe('get_vod_categories cat 3');
    expect(await labels(page)).toContain('Favorites');
    expect(await labels(page)).toContain('Recently watched');
    await expect(focusedCategory(page)).toHaveText('get_vod_categories cat 3');
    await expect(page.locator('#items .list-header')).toContainText('get_vod_categories cat 3');
    await expect(page.locator('#items .card').first()).toBeVisible();
    const saved = (await stored(page)).movies;
    expect(saved.length).toBe(29);
    expect(saved).not.toContain('3');
    await category(page, 'Favorites');
    await holdOK(page);
    await expect(page.locator('#menu .menu-row')).toHaveText(['Manage categories', 'Cancel']);
    await back(page);
    await expect(page.locator('#menu')).toBeHidden();
});

test('Manage categories toggles, searches and shows all; its choices carry into the lists', async ({ page }) => {
    await boot(page);
    await setting(page, 'Manage Movies categories');
    await expect(page.locator('.st-row.focused .st-value')).toHaveText('All shown');
    await press(page, 'Enter');
    await expect(page.locator('#manage')).toBeVisible();
    await expect(page.locator('.mc-title')).toHaveText('Manage Movies categories');
    await expect(page.locator('#manage .row.focused .label')).toHaveText('get_vod_categories cat 1');
    await expect(page.locator('#manage .row.focused .badge')).toHaveText('Shown');
    await press(page, 'Enter');
    await expect(page.locator('#manage .row.focused .badge')).toHaveText('Hidden');
    await expect(page.locator('#manage .list-header')).toContainText('1 hidden');
    // Remote typing: OK on the search box, type, OK again to reach the matches.
    await press(page, 'ArrowUp');
    await expect(page.locator('.mc-search')).toHaveClass(/focused/);
    await press(page, 'Enter');
    await expect(page.locator('.mc-search')).toHaveClass(/typing/);
    await page.keyboard.type('cat 12');
    await expect(page.locator('#manage .row')).toHaveCount(1);
    await press(page, 'Enter');
    await expect(page.locator('#manage .row.focused .label')).toHaveText('get_vod_categories cat 12');
    await press(page, 'Enter');
    await expect(page.locator('#manage .row.focused .badge')).toHaveText('Hidden');
    await expect(page.locator('#manage .list-header')).toContainText('2 hidden');
    await back(page);
    await expect(page.locator('#manage')).toBeHidden();
    await expect(page.locator('.st-row.focused .st-value')).toHaveText('2 hidden');
    expect(await stored(page)).toEqual({ movies: ['1', '12'] });

    await section(page, 'Movies');
    await expect(focusedCategory(page)).toHaveText('get_vod_categories cat 2');
    expect(await labels(page)).not.toContain('get_vod_categories cat 1');

    // Restore everything through the category menu.
    await holdOK(page);
    await menuChoice(page, 'Manage categories');
    await expect(page.locator('#manage')).toBeVisible();
    await expect(page.locator('#manage .row.focused .badge')).toHaveText('Hidden');
    await press(page, 'ArrowUp');
    await press(page, 'ArrowRight');
    await expect(page.locator('.mc-btn')).toHaveClass(/focused/);
    await press(page, 'Enter');
    await expect(page.locator('#manage .row .badge', { hasText: 'Hidden' })).toHaveCount(0);
    await back(page);
    await expect(page.locator('#manage')).toBeHidden();
    await expect.poll(() => labels(page)).toContain('get_vod_categories cat 1');
    await expect(focusedCategory(page)).toHaveText('get_vod_categories cat 2');
    expect(await stored(page)).toEqual({});
});

test('search and All channels leave out hidden categories', async ({ page }) => {
    await boot(page);
    await section(page, 'Live TV');
    await category(page, 'get_live_categories cat 5');
    await holdOK(page);
    await menuChoice(page, 'Hide category');
    await expect(focusedCategory(page)).toHaveText('get_live_categories cat 6');
    // 17 of the 500 channels belong to category 5.
    await moveTo(page, '#categories .focused .label', 'All channels', 'ArrowUp');
    await expect(page.locator('#items .list-header')).toContainText('All channels');
    await expect(page.locator('#items .count')).toHaveText('1 / 483');
    // Channel 34 is in the hidden category 5, channel 35 in the shown 6.
    await enterItems(page);
    await toolbar(page, 'search');
    await press(page, 'Enter');
    await page.locator('#search-input').fill('channel 34 (');
    await press(page, 'Enter');
    await expect(page.locator('#items .list-empty')).toContainText('No results');
    await press(page, 'Enter');
    await page.locator('#search-input').fill('channel 35 (');
    await press(page, 'Enter');
    await expect(page.locator('#items .count')).toHaveText('1 / 1');
    await expect(page.locator('#items .focused .label')).toContainText('Channel 35 (cat all)');
});

test('Home rows leave out favorites of hidden categories', async ({ page }) => {
    // Channel 4 is in category 5 and channel 1 in category 2.
    await boot(page, { storage: {
        'favorites:s1': { live: [channel(4), channel(1)] },
        'hidden-categories:s1': { live: ['5'] },
    } });
    const row = page.locator('.hm-row').filter({ hasText: 'Live now on your favorite channels' });
    await expect(row.locator('.hm-card > span')).toHaveText(['Channel 1 (cat all)']);
});

test('the channel list while watching skips hidden categories', async ({ page }) => {
    await boot(page, { storage: { 'last-channel:s1': channel(1), 'hidden-categories:s1': { live: ['2'] } } });
    await playing(page);
    await expect(page.locator('#pl-title')).toHaveText('1. Channel 1 (cat all)');
    await expect(page.locator('#pl-controls')).toBeHidden();
    await press(page, 'ArrowLeft');
    await expect(page.locator('#pl-channels')).toBeVisible();
    // Channel 1 is in the hidden category 2, so the list opens on All channels.
    await expect(page.locator('.pl-channel-header')).toContainText('All channels');
    await expect(page.locator('.pl-channel-header')).not.toContainText('cat 2');
});

test('All movies and All series come first and list the whole section', async ({ page }) => {
    await boot(page);
    await section(page, 'Movies');
    await expect(page.locator('#categories .row .label').first()).toHaveText('All movies');
    await moveTo(page, '#categories .row.focused .label', 'All movies', 'ArrowUp');
    await expect(page.locator('#items .list-header')).toContainText('All movies');
    await expect(page.locator('#items .list-header .count')).toContainText('/ 25');
    await section(page, 'Series');
    await expect(page.locator('#categories .row .label').first()).toHaveText('All series');
});
