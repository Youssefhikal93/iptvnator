const { test, expect, boot, section, category, press, back, holdOK, menuChoice, moveTo, enterItems, toolbar, channel, playing, sendKeyCode } = require('./helpers');

async function digits(page, pin) {
    for (const digit of pin) await press(page, digit);
}

async function setPin(page) {
    await section(page, 'Settings');
    await moveTo(page, '.st-row.focused .st-label', 'PIN');
    await expect(page.locator('.st-row.focused .st-value')).toHaveText('Set PIN…');
    await press(page, 'Enter');
    await expect(page.locator('.pin-title')).toHaveText('Enter a new PIN');
    await digits(page, '1234');
    await expect(page.locator('.pin-title')).toHaveText('Confirm the PIN');
    await digits(page, '1234');
    await expect(page.locator('#pin-pad')).toBeHidden();
}

async function lockCategory(page) {
    await section(page, 'Live TV');
    await category(page, 'get_live_categories cat 5');
    await holdOK(page);
    await menuChoice(page, 'Lock category');
    await expect(page.locator('#categories .focused .badge')).toHaveText('🔒');
    await expect(page.locator('#items .list-empty')).toContainText('Locked category');
}

async function allChannels(page, count) {
    await moveTo(page, '#categories .focused .label', 'All channels', 'ArrowUp');
    await expect(page.locator('#items .list-header')).toContainText('All channels');
    await expect(page.locator('#items .count')).toHaveText('1 / ' + count);
}

async function search(page, found) {
    await enterItems(page);
    await toolbar(page, 'search');
    await press(page, 'Enter');
    await page.locator('#search-input').fill('channel 34 (');
    await press(page, 'Enter');
    if (found) await expect(page.locator('#items .focused .label')).toContainText('Channel 34 (cat all)');
    else await expect(page.locator('#items .list-empty')).toContainText('No results');
}

test('Settings PIN protects a category, search and All channels; unlock expires and Remove PIN clears locks', async ({ page }) => {
    await boot(page);
    await page.clock.install();
    await setPin(page);
    await lockCategory(page);
    await press(page, 'Enter');
    await expect(page.locator('.pin-title')).toHaveText('Enter the PIN');
    await digits(page, '0000');
    await expect(page.locator('.pin-message')).toHaveText('Wrong PIN');
    await expect(page.locator('.pin-dots')).toHaveText('○○○○');
    await back(page);
    await allChannels(page, 483);
    await search(page, false);
    await section(page, 'Home');
    await section(page, 'Live TV');
    await category(page, 'get_live_categories cat 5');
    await press(page, 'Enter');
    await digits(page, '1234');
    await expect(page.locator('#pin-pad')).toBeHidden();
    await expect(page.locator('#items .focused .label')).toContainText('(cat 5)');
    await back(page);
    await allChannels(page, 500);
    await search(page, true);

    // Jump the real browser clock; the session also checks elapsed time on access.
    await page.clock.fastForward(900001);
    await section(page, 'Home');
    await section(page, 'Live TV');
    await category(page, 'get_live_categories cat 5');
    await press(page, 'Enter');
    await expect(page.locator('.pin-title')).toHaveText('Enter the PIN');
    await back(page);
    await section(page, 'Settings');
    await moveTo(page, '.st-row.focused .st-label', 'PIN');
    await press(page, 'Enter');
    await menuChoice(page, 'Remove PIN');
    await expect(page.locator('.pin-title')).toHaveText('Enter the current PIN');
    await digits(page, '1234');
    await expect(page.locator('.st-row.focused .st-value')).toHaveText('Set PIN…');
    expect(await page.evaluate(() => localStorage.getItem('iptvnator-tv:p:default:locked-categories:s1'))).toBeNull();
    await section(page, 'Live TV');
    await category(page, 'get_live_categories cat 5');
    await expect(page.locator('#categories .focused .badge')).toHaveCount(0);
    await enterItems(page);
});

test('pad supports arrows, Clear and Back; mismatch restarts and Change PIN checks the current PIN', async ({ page }) => {
    await boot(page);
    await section(page, 'Live TV');
    await category(page, 'get_live_categories cat 5');
    await holdOK(page);
    await menuChoice(page, 'Set a PIN first');
    await press(page, 'Enter'); // 1
    await expect(page.locator('.pin-dots')).toHaveText('●○○○');
    await press(page, 'ArrowDown');
    await press(page, 'ArrowDown');
    await press(page, 'ArrowDown');
    await expect(page.locator('.pin-key.focused')).toHaveText('Clear');
    await press(page, 'Enter');
    await expect(page.locator('.pin-dots')).toHaveText('○○○○');
    await digits(page, '1234');
    await digits(page, '9999');
    await expect(page.locator('.pin-title')).toHaveText('Enter a new PIN');
    await expect(page.locator('.pin-message')).toContainText('do not match');
    await digits(page, '1234');
    await digits(page, '1234');
    await section(page, 'Settings');
    await moveTo(page, '.st-row.focused .st-label', 'PIN');
    await press(page, 'Enter');
    await menuChoice(page, 'Change PIN…');
    await digits(page, '0000');
    await expect(page.locator('.pin-message')).toHaveText('Wrong PIN');
    await digits(page, '1234');
    await expect(page.locator('.pin-title')).toHaveText('Enter a new PIN');
    await digits(page, '5678');
    await digits(page, '5678');
    await lockCategory(page);
    await press(page, 'Enter');
    await digits(page, '1234');
    await expect(page.locator('.pin-message')).toHaveText('Wrong PIN');
    await press(page, 'ArrowDown');
    await press(page, 'ArrowDown');
    await press(page, 'ArrowDown');
    await press(page, 'ArrowRight');
    await press(page, 'ArrowRight');
    await press(page, 'Enter');
    await expect(page.locator('#pin-pad')).toBeHidden();
    await press(page, 'Enter');
    await digits(page, '5678');
    await expect(page.locator('#pin-pad')).toBeHidden();
    await back(page);
    await holdOK(page);
    await menuChoice(page, 'Unlock category');
    await digits(page, '5678');
    await expect(page.locator('#categories .focused .badge')).toHaveCount(0);
});

test('locked library snapshots are hidden on Home, Favorites, Recently watched and Continue watching', async ({ page }) => {
    // The shared fake VOD lists predate categories; add membership at the HTTP boundary.
    await page.route('**/player_api.php?**', async route => {
        const action = new URL(route.request().url()).searchParams.get('action');
        if (!['get_vod_streams', 'get_series'].includes(action)) return route.continue();
        const response = await route.fetch();
        const items = await response.json();
        await route.fulfill({ response, json: items.map(item => ({ ...item, category_id: item.stream_id === 2025 || item.series_id === 3001 ? '5' : '6' })) });
    });
    const movie = { stream_id: 2025, category_id: '5', name: 'Private movie' };
    const episode = { show: { series_id: 3001, category_id: '5', name: 'Private show' }, series_id: 3001, category_id: '5', name: 'Private show', episode: { id: 4001 } };
    await boot(page, { storage: {
        'favorites:s1': { live: [channel(4), channel(1)], movies: [movie], series: [episode.show] },
        'recent:s1': { live: [channel(4), channel(1)], movies: [movie], series: [episode] },
        progress: { 'movie:2025': { position: 80, duration: 400 }, 'episode:4001': { position: 80, duration: 400 } },
    } });
    await setPin(page);
    await lockCategory(page);
    await page.evaluate(() => { ParentalLock.lock('s1', 'movies', '5'); ParentalLock.lock('s1', 'series', '5'); });
    await section(page, 'Home');
    await expect(page.locator('#home')).not.toContainText('Private');
    await expect(page.locator('#home')).not.toContainText('Channel 4 (cat all)');
    await expect(page.locator('#home')).toContainText('Channel 1 (cat all)');
    await section(page, 'Live TV');
    await category(page, 'Favorites');
    await expect(page.locator('#items .row .label')).toHaveCount(1);
    await expect(page.locator('#items .row .label')).toContainText('Channel 1 (cat all)');
    await category(page, 'Recently watched');
    await expect(page.locator('#items .row .label')).toHaveCount(1);
    await expect(page.locator('#items .row .label')).toContainText('Channel 1 (cat all)');
    await section(page, 'Movies');
    await expect(page.locator('#items .count')).toHaveText('1 / 24');
    await category(page, 'Continue watching');
    await expect(page.locator('#items .card, #items .row')).toHaveCount(0);
    await section(page, 'Series');
    await expect(page.locator('#items .count')).toHaveText('1 / 14');
    await category(page, 'Continue watching');
    await expect(page.locator('#items .card, #items .row')).toHaveCount(0);
    await section(page, 'Live TV');
    await category(page, 'get_live_categories cat 5');
    await press(page, 'Enter');
    await digits(page, '1234');
    await section(page, 'Home');
    await expect(page.locator('#home')).toContainText('Private movie');
    await expect(page.locator('#home')).toContainText('Private show');
    await expect(page.locator('#home')).toContainText('Channel 4 (cat all)');
    await section(page, 'Movies');
    await expect(page.locator('#items .count')).toHaveText('1 / 25');
    await section(page, 'Series');
    await expect(page.locator('#items .count')).toHaveText('1 / 15');
});

test('five wrong tries survive pad dismissal and refuse the correct PIN until 30 seconds pass', async ({ page }) => {
    await boot(page);
    await setPin(page);
    await lockCategory(page);
    await press(page, 'Enter');
    await page.clock.install();
    for (let i = 0; i < 5; i++) await digits(page, '0000');
    await expect(page.locator('.pin-message')).toHaveText('Wait 30 s');
    await back(page);
    await press(page, 'Enter');
    await digits(page, '1234');
    await expect(page.locator('.pin-dots')).toHaveText('○○○○');
    await page.clock.fastForward(30000);
    await digits(page, '1234');
    await expect(page.locator('#pin-pad')).toBeHidden();
});

test('re-lock closes the channel list, blocks PRE-CH and startup restore, and keeps source locks on reload', async ({ page }) => {
    await boot(page);
    await page.clock.install();
    await setPin(page);
    await lockCategory(page);
    await press(page, 'Enter');
    await digits(page, '1234');
    await press(page, 'Enter');
    await playing(page);
    await back(page);
    await section(page, 'Live TV');
    await category(page, 'get_live_categories cat 6');
    await enterItems(page);
    await press(page, 'ArrowDown');
    await press(page, 'Enter');
    await playing(page);
    await expect(page.locator('#pl-controls')).toBeHidden();
    await press(page, 'ArrowLeft');
    await expect(page.locator('#pl-channels')).toBeVisible();
    await page.clock.fastForward(900001);
    await expect(page.locator('#pl-channels')).toBeHidden();
    await sendKeyCode(page, 10190);
    await expect(page.locator('#pl-title')).toContainText('(cat 6)');
    await expect(page.locator('#pl-controls')).toBeHidden();
    await press(page, 'ArrowLeft');
    await expect(page.locator('#pl-channels')).toBeVisible();
    await expect(page.locator('.pl-channel-header')).toContainText('cat 6');
    await press(page, 'ArrowLeft');
    await expect(page.locator('.pl-channel-header')).toContainText('cat 5');
    await expect(page.locator('.pl-channel')).toHaveCount(0);
    await page.evaluate(() => Library.setLastChannel('s1', { stream_id: 1004, category_id: '5', name: 'Private channel' }));
    await page.reload();
    await expect(page.locator('#player')).toBeHidden();
    await section(page, 'Live TV');
    await category(page, 'get_live_categories cat 5');
    await press(page, 'Enter');
    await expect(page.locator('.pin-title')).toHaveText('Enter the PIN');
    await digits(page, '1234');
    await page.evaluate(() => Prefs.set('livePreview', true));
    await press(page, 'Enter');
    await playing(page);
    await expect(page.locator('#content')).toHaveClass(/previewing/);
    await page.clock.fastForward(900001);
    await expect(page.locator('#player')).toBeHidden();
    await expect(page.locator('#items .list-empty')).toContainText('Locked category');
});
