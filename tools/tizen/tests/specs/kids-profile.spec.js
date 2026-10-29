const { test, expect, boot, press, back, section, setting, enterItems, holdOK, moveTo, toolbar } = require('./helpers');

async function digits(page, pin) {
    for (const digit of pin) await press(page, digit);
}

// Ticks the focused tab's categories whose names are given, from the tabs row.
async function tick(page, names) {
    await expect(page.locator('#kids-picker .kp-tab.on small')).toHaveText(/ of /);
    await press(page, 'ArrowDown');
    await press(page, 'ArrowDown');
    await expect(page.locator('#kids-picker .kp-cat.focus')).toHaveCount(1);
    for (const name of names) {
        const all = await page.locator('#kids-picker .kp-name').allTextContents();
        const at = all.indexOf(name);
        if (at < 0) throw new Error('No category ' + name + ' in ' + all.join('|'));
        const focused = await page.locator('#kids-picker .kp-cat').evaluateAll((rows) => rows.findIndex((row) => row.classList.contains('focus')));
        const delta = at - focused;
        for (let i = 0; i < Math.abs(delta); i++) await press(page, delta > 0 ? 'ArrowRight' : 'ArrowLeft');
        await expect(page.locator('#kids-picker .kp-cat.focus .kp-name')).toHaveText(name);
        await press(page, 'Enter');
        await expect(page.locator('#kids-picker .kp-cat.focus')).toHaveClass(/on/);
    }
    // Back up to the tabs: list → search → tabs.
    for (let i = 0; i < 6 && !await page.locator('#kids-picker .kp-search.focus').count(); i++) await press(page, 'ArrowUp');
    await press(page, 'ArrowUp');
    await expect(page.locator('#kids-picker .kp-tab.focus')).toHaveCount(1);
}

async function tab(page, name) {
    await moveTo(page, '#kids-picker .kp-tab.focus', await page.locator('#kids-picker .kp-tab').filter({ hasText: name }).innerText(), 'ArrowRight', 4).catch(async () => {
        await moveTo(page, '#kids-picker .kp-tab.focus', await page.locator('#kids-picker .kp-tab').filter({ hasText: name }).innerText(), 'ArrowLeft', 4);
    });
}

async function save(page) {
    for (let i = 0; i < 40 && !await page.locator('#kids-picker .kp-btn.focus').count(); i++) await press(page, 'ArrowDown');
    await expect(page.locator('#kids-picker .kp-btn.focus')).toHaveText('Save');
    await press(page, 'Enter');
    await expect(page.locator('#kids-picker')).toHaveCount(0);
}

// From the grown-up "Me": Add profile "Kids" with the switch on, a new PIN,
// then Movies cat 1 and Live cat 2 ticked.
async function addKids(page) {
    await setting(page, 'Add profile…');
    await press(page, 'Enter');
    await page.locator('#profile-name').fill('Kids');
    await press(page, 'ArrowDown');
    await expect(page.locator('#profile-kids')).toBeFocused();
    await press(page, 'Enter');
    await expect(page.locator('#profile-kids')).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('#profile-dialog-ok')).toHaveText('Next: choose categories');
    await press(page, 'ArrowDown');
    await press(page, 'Enter');
    // No PIN yet: the grown-up sets one first.
    await expect(page.locator('#pin-pad .pin-title')).toHaveText('Enter a new PIN');
    await digits(page, '1234');
    await digits(page, '1234');
    await expect(page.locator('#kids-picker h1')).toHaveText('What can Kids watch?');
    await tab(page, 'Movies');
    await tick(page, ['get_vod_categories cat 1']);
    await tab(page, 'Live TV');
    await tick(page, ['get_live_categories cat 2']);
    await save(page);
}

test('the Kids switch lines up with the name box and turns Add into Next', async ({ page }) => {
    await boot(page);
    await setting(page, 'Add profile…');
    await press(page, 'Enter');
    const name = await page.locator('#profile-name').boundingBox();
    const row = await page.locator('#profile-kids').boundingBox();
    expect(Math.abs(name.x - row.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(name.width - row.width)).toBeLessThanOrEqual(1);
    await expect(page.locator('#profile-kids')).toHaveAttribute('aria-checked', 'false');
    await expect(page.locator('#profile-dialog-ok')).toHaveText('Add');
    // The same switch shows when a profile is renamed.
    await back(page);
    await setting(page, 'Rename profile…');
    await press(page, 'Enter');
    await expect(page.locator('#profile-kids')).toHaveAttribute('aria-checked', 'false');
    const renamed = await page.locator('#profile-name').boundingBox();
    const switchRow = await page.locator('#profile-kids').boundingBox();
    expect(Math.abs(renamed.x - switchRow.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(renamed.width - switchRow.width)).toBeLessThanOrEqual(1);
});

test('a kids profile sees only ticked categories, has no Settings and leaves only with the PIN', async ({ page }) => {
    await boot(page);
    await addKids(page);
    // The new kids profile is in use: badge on the avatar, no Settings.
    await expect(page.locator('#rail .rail-avatar .kids-badge')).toHaveText('KIDS');
    await expect(page.locator('#rail .rail-item')).toHaveCount(4);
    await expect(page.locator('#rail .rail-item').filter({ hasText: 'Settings' })).toHaveCount(0);
    await expect(page.locator('#rail .rail-item').filter({ hasText: 'Series' })).toHaveClass(/disabled/);
    await section(page, 'Movies');
    const labels = await page.locator('#categories .row .label').allTextContents();
    expect(labels.filter((label) => label.startsWith('get_vod_categories'))).toEqual(['get_vod_categories cat 1']);
    // Search and Home only find titles of the ticked category: in the fake
    // catalogue, Movie n is in category 1 + n % 3.
    const allowed = { has: (title) => /^Movie \d+/.test(title) && Number(title.match(/\d+/)[0]) % 3 === 0 };
    await enterItems(page);
    await toolbar(page, 'search');
    await press(page, 'Enter');
    await page.keyboard.type('Movie');
    await press(page, 'Enter');
    await expect(page.locator('#items .card-title').first()).toBeVisible();
    for (const title of await page.locator('#items .card-title').allTextContents()) expect(allowed.has(title)).toBe(true);
    await section(page, 'Home');
    const home = await page.locator('.hm-row').filter({ hasText: 'Recently added movies' }).locator('.hm-card > span').allTextContents();
    expect(home.length).toBeGreaterThan(0);
    for (const title of home) expect(allowed.has(title)).toBe(true);
    await section(page, 'Movies');
    // A held OK on a title offers Favorite and Mark watched only.
    await enterItems(page);
    await holdOK(page);
    const options = (await page.locator('#menu .menu-row').allTextContents()).map((text) => text.trim());
    expect(options).toEqual(['Add to Favorites', 'Mark as watched']);
    await back(page);
    // A held OK on a category opens nothing (no hide, lock or manage).
    await press(page, 'ArrowLeft');
    await page.keyboard.down('Enter');
    await page.waitForTimeout(800);
    await page.keyboard.up('Enter');
    await expect(page.locator('#menu')).toBeHidden();
    await section(page, 'Live TV');
    const live = await page.locator('#categories .row .label').allTextContents();
    expect(live.filter((label) => label.startsWith('get_live_categories'))).toEqual(['get_live_categories cat 2']);
    // Who's watching: picking Me asks for Me's PIN; a wrong one stays.
    await page.reload();
    await expect(page.locator('#profiles')).toBeVisible();
    await expect(page.locator('#profiles .pf-tile.focused .kids-badge')).toHaveText('KIDS');
    await moveTo(page, '#profiles .pf-tile.focused .pf-name', 'Me', 'ArrowLeft');
    await press(page, 'Enter');
    await expect(page.locator('#pin-pad .pin-title')).toHaveText('Enter the PIN of Me');
    await digits(page, '0000');
    await expect(page.locator('#pin-pad .pin-message')).toHaveText('Wrong PIN');
    await digits(page, '1234');
    await expect(page.locator('#profiles')).toHaveCount(0);
    await expect(page.locator('#rail .rail-item')).toHaveCount(5);
    await expect(page.locator('#rail .rail-avatar .kids-badge')).toHaveCount(0);
});

test('the profile menu leaves a kids profile only with the PIN and has no Manage profiles', async ({ page }) => {
    await boot(page);
    await addKids(page);
    for (let i = 0; i < 8 && !await page.locator('#rail .focused').count(); i++) await back(page);
    for (let i = 0; i < 8 && !await page.locator('.rail-profile.focused').count(); i++) await press(page, 'ArrowUp');
    await press(page, 'Enter');
    await expect(page.locator('#menu.profile-menu')).toBeVisible();
    const rows = (await page.locator('#menu .menu-row').allTextContents()).map((text) => text.trim());
    expect(rows.some((row) => row.includes('Manage profiles'))).toBe(false);
    await moveTo(page, '#menu .focused .menu-label', 'Me', 'ArrowUp');
    await press(page, 'Enter');
    await expect(page.locator('#pin-pad .pin-title')).toHaveText('Enter the PIN of Me');
    await back(page);
    await expect(page.locator('#rail .rail-avatar .kids-badge')).toHaveText('KIDS');
});

test('◀ ▶ switches to another source; one never opened offers nothing and sends no request', async ({ page }) => {
    const sources = [
        { id: 's1', type: 'xtream', name: 'Regression TV', url: 'http://localhost:' + (process.env.TV_TEST_PORT || 8767), user: 'tester', pass: 'secret' },
        { id: 's2', type: 'm3u', name: 'Family list', url: 'http://localhost:' + (process.env.TV_TEST_PORT || 8767) + '/never.m3u' },
    ];
    await boot(page, { storage: { sources } });
    await setting(page, 'Add profile…');
    await press(page, 'Enter');
    await page.locator('#profile-name').fill('Kids');
    await press(page, 'ArrowDown');
    await press(page, 'Enter');
    await press(page, 'ArrowDown');
    await press(page, 'Enter');
    await digits(page, '12341234');
    await expect(page.locator('#kids-picker .kp-source')).toContainText('Regression TV');
    await expect(page.locator('#kids-picker .kp-source span')).toContainText('2 sources');
    // The open source's lists load as browsing would; the other source is never asked.
    const asked = [];
    page.on('request', (req) => { if (/never\.m3u/.test(req.url())) asked.push(req.url()); });
    await press(page, 'ArrowUp');
    await expect(page.locator('#kids-picker .kp-source')).toHaveClass(/focus/);
    await press(page, 'ArrowRight');
    await expect(page.locator('#kids-picker .kp-source b')).toHaveText('Family list');
    await expect(page.locator('#kids-picker .kp-note')).toHaveText('Nothing saved for this source yet. Open it once from a grown-up profile.');
    await page.waitForTimeout(500);
    expect(asked).toEqual([]);
});

test('a grown-up changes what Kids can watch after the PIN; the ticks are kept', async ({ page }) => {
    await boot(page);
    await addKids(page);
    await page.reload();
    await moveTo(page, '#profiles .pf-tile.focused .pf-name', 'Me', 'ArrowLeft');
    await press(page, 'Enter');
    await digits(page, '1234');
    await setting(page, 'Kids profiles');
    await expect(page.locator('#settings .st-row.focused .st-value')).toHaveText('Kids');
    await press(page, 'Enter');
    await expect(page.locator('#pin-pad .pin-title')).toHaveText('Enter the PIN of Me');
    await digits(page, '1234');
    await expect(page.locator('#kids-picker h1')).toHaveText('What can Kids watch?');
    await tab(page, 'Movies');
    await expect(page.locator('#kids-picker .kp-tab.on small')).toHaveText(/^1 of \d+$/);
    // The search box narrows the categories.
    await press(page, 'ArrowDown');
    await press(page, 'Enter');
    await expect(page.locator('#kids-search')).toBeFocused();
    await page.keyboard.type('cat 3');
    await expect(page.locator('#kids-picker .kp-name')).toHaveText(['get_vod_categories cat 3', 'get_vod_categories cat 30']);
    await press(page, 'ArrowDown');
    await press(page, 'Enter');
    await save(page);
    // Kids now sees cat 1 and cat 3.
    await page.reload();
    await moveTo(page, '#profiles .pf-tile.focused .pf-name', 'Kids', 'ArrowRight');
    await press(page, 'Enter');
    await section(page, 'Movies');
    const labels = await page.locator('#categories .row .label').allTextContents();
    expect(labels.filter((label) => label.startsWith('get_vod_categories'))).toEqual(['get_vod_categories cat 1', 'get_vod_categories cat 3']);
});

test('a kids profile with nothing allowed, made from Settings, never reaches Settings', async ({ page }) => {
    await boot(page);
    await setting(page, 'Add profile\u2026');
    await press(page, 'Enter');
    await page.locator('#profile-name').fill('Kids');
    await press(page, 'ArrowDown');
    await press(page, 'Enter');
    await press(page, 'ArrowDown');
    await press(page, 'Enter');
    await digits(page, '12341234');
    await expect(page.locator('#kids-picker h1')).toHaveText('What can Kids watch?');
    // Saved with nothing ticked.
    await save(page);
    await expect(page.locator('#rail .rail-avatar .kids-badge')).toHaveText('KIDS');
    await expect(page.locator('#content')).not.toHaveClass(/settings/);
    // OK in the menu opens nothing: Settings and its sources stay out of reach.
    await press(page, 'Enter');
    await page.waitForTimeout(300);
    await expect(page.locator('#content')).not.toHaveClass(/settings/);
    await expect(page.locator('#settings .st-row.focused')).toHaveCount(0);
    await expect(page.locator('#rail .focused')).toHaveCount(1);
});

test('a kids profile sees the collections of its allowed films, not only their count', async ({ page }) => {
    // Without a TMDB key the collections come from the names; Toy Story is in
    // the ticked category 1, The Godfather in category 2.
    const films = ['Toy Story', 'Toy Story 2', 'Toy Story 3', 'The Godfather', 'The Godfather Part II', 'Heat'];
    await page.route('**/player_api.php*', async (route) => {
        const action = new URL(route.request().url()).searchParams.get('action');
        if (action !== 'get_vod_streams') return route.continue();
        await route.fulfill({ json: films.map((name, i) => ({ name, stream_id: 2100 + i, category_id: i < 3 ? '1' : '2', container_extension: 'mkv', added: String(1700000000 + i) })) });
    });
    await boot(page);
    await addKids(page);
    await section(page, 'Movies');
    await expect.poll(async () => (await page.locator('#categories .row .label').allTextContents()).includes('Collections')).toBe(true);
    await moveTo(page, '#categories .focused .label', 'Collections', 'ArrowUp');
    await expect(page.locator('#items .list-header')).toContainText('Collections');
    await expect(page.locator('#items .card-title')).toHaveText(['Toy Story']);
});
