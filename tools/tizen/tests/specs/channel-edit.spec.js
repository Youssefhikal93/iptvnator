const { test, expect, boot, section, category, enterItems, press, back, holdOK, moveTo, sendKeyCode, menuSearch, playing } = require('./helpers');

async function menuChoice(page, label) {
    await moveTo(page, '#menu .focused', label);
    await press(page, 'Enter');
}

const providerName = 'UK| SKY SPORTS MAIN EVENT FHD ᴿᴬᵂ';
const editedName = 'Weekend sports from my TV';
const original = { name: providerName, stream_id: 1001, num: 1, category_id: '2' };

async function fixture(page, baseURL, settings = {}) {
    // Every request, including artwork, stays on this lane's fake server.
    await page.route(url => !['localhost', '127.0.0.1'].includes(url.hostname), route => route.abort());
    await page.route(url => url.pathname === '/player_api.php' && url.searchParams.get('action') === 'get_live_streams', async route => {
        const response = await route.fetch();
        const channels = await response.json();
        channels[0].name = providerName;
        channels[0].stream_icon = baseURL + '/img/poster.jpg';
        channels[1].name = 'UK| SKY SPORTS MAIN EVENT HD';
        channels[1].stream_icon = baseURL + '/img/backdrop.jpg';
        channels[2].name = 'US| SKY SPORTS MAIN EVENT HD';
        channels[2].stream_icon = baseURL + '/img/poster.jpg';
        await route.fulfill({ response, json: channels });
    });
    await page.route('**/channel-edit-guide.xml', route => route.fulfill({ contentType: 'application/xml', body:
        '<tv><channel id="ch1001.se"><display-name>Sports</display-name><icon src="' + baseURL + '/img/poster.jpg?guide=1"/></channel></tv>' }));
    const snapshot = { ...original, stream_icon: baseURL + '/img/poster.jpg' };
    await boot(page, { storage: {
        sources: [{ id: 's1', type: 'xtream', name: 'Regression TV', url: baseURL, user: 'tester', pass: 'secret', epgUrl: baseURL + '/channel-edit-guide.xml' }],
        settings,
        'favorites:s1': { live: [snapshot] }, 'recent:s1': { live: [snapshot] }, 'recent-channels:s1': [snapshot],
    } });
    await expect.poll(() => page.evaluate(() => (Stored.json('iptvnator-tv:guide:s1') || {}).state)).toBe('ready');
}

async function editor(page) {
    await holdOK(page);
    await menuChoice(page, 'Edit channel');
    await expect(page.locator('#menu .menu-title')).toHaveText('Edit channel');
}

async function rename(page, name) {
    await editor(page);
    await menuChoice(page, 'Name');
    await expect(page.locator('#profile-name')).toHaveValue(name === null ? editedName : providerName);
    if (name === null) return back(page);
    await page.locator('#profile-name').fill(name);
    await press(page, 'ArrowDown');
    await press(page, 'Enter');
    await expect(page.locator('#profile-dialog')).toHaveCount(0);
}

test('#96 remote editor chooses guide/copy artwork, persists, searches either name and resets both', async ({ page, baseURL }) => {
    await fixture(page, baseURL);
    await section(page, 'Live TV');
    await enterItems(page);
    await rename(page, editedName);
    await expect(page.locator('#items .focused .label')).toContainText(editedName);
    // A cancelled name leaves the saved edit intact.
    await rename(page, null);
    await editor(page);
    await menuChoice(page, 'Logo');
    // The same channel first; the same name from another country after it.
    await expect(page.locator('#menu .menu-row .menu-label')).toContainText(['Guide 1 logo', 'UK| SKY SPORTS MAIN EVENT HD', 'US| SKY SPORTS MAIN EVENT HD', 'Cancel']);
    await expect(page.locator('#menu .channel-edit-logo')).toHaveCount(3);
    await menuChoice(page, 'UK| SKY SPORTS MAIN EVENT HD');
    await expect(page.locator('#items .focused img').first()).toHaveAttribute('src', baseURL + '/img/backdrop.jpg');
    await editor(page);
    await menuChoice(page, 'Logo');
    await menuChoice(page, 'Guide 1 logo');
    await expect(page.locator('#items .focused img').first()).toHaveAttribute('src', baseURL + '/img/poster.jpg?guide=1');
    await page.reload();
    await section(page, 'Live TV');
    await enterItems(page);
    await expect(page.locator('#items .focused .label')).toContainText(editedName);
    for (const query of ['Weekend sports', 'SKY SPORTS']) {
        await menuSearch(page);
        await page.locator('#search-input').fill(query);
        await expect(page.locator('#items')).toContainText(editedName);
        await press(page, 'ArrowDown');
        await back(page);
    }
    await section(page, 'Live TV');
    await category(page, 'Favorites');
    await expect(page.locator('#items')).toContainText(editedName);
    await enterItems(page);
    await editor(page);
    await menuChoice(page, 'Logo');
    await expect(page.locator('#menu')).toContainText('Guide 1 logo');
    await back(page);
    await sendKeyCode(page, 458);
    await expect(page.locator('#guide .gd-name').first()).toContainText(editedName);
    await expect(page.locator('#guide .gd-plate img').first()).toHaveAttribute('src', baseURL + '/img/poster.jpg?guide=1');
    await back(page);
    await editor(page);
    await menuChoice(page, "Reset to provider's");
    await expect(page.locator('#items .focused .label')).toContainText(providerName);
    await expect(page.locator('#items .focused img').first()).toHaveAttribute('src', baseURL + '/img/poster.jpg');
    await page.reload();
    await section(page, 'Live TV');
    await expect(page.locator('#items')).not.toContainText(editedName);
});

test('#96 edited channels reach grid, banner, drawer, multi-view, recent/Home rows and Samsung tiles', async ({ page, baseURL }) => {
    await page.addInitScript(() => { window.__hubTilesSent = []; window.__hubTilesPlatform = { launch: (text, done) => { window.__hubTilesSent.push(JSON.parse(text)); done(); }, requested: () => null }; });
    await fixture(page, baseURL, { 'view:live': 'grid', homeTiles: true });
    await page.evaluate(({ editedName, baseURL }) => ChannelEdits.save('s1', { stream_id: 1001 }, { name: editedName, logo: baseURL + '/img/backdrop.jpg' }), { editedName, baseURL });
    await section(page, 'Home');
    await expect(page.locator('#home')).toContainText(editedName);
    await expect(page.locator('#home img[src$="/img/backdrop.jpg"]').first()).toBeVisible();
    await section(page, 'Live TV');
    await enterItems(page);
    await expect(page.locator('#items .card.focused')).toContainText(editedName);
    await press(page, 'Enter');
    await playing(page);
    await expect(page.locator('#pl-title')).toContainText(editedName);
    await expect.poll(() => page.evaluate(() => Player.canOpenChannelList())).toBe(true);
    await press(page, 'ArrowLeft');
    await expect(page.locator('.pl-channel-name').first()).toContainText(editedName);
    await expect(page.locator('.pl-channel-logo img').first()).toHaveAttribute('src', baseURL + '/img/backdrop.jpg');
    await back(page);
    await sendKeyCode(page, 427);
    await sendKeyCode(page, 428);
    await expect(page.locator('#pl-banner')).toContainText(editedName);
    await expect(page.locator('#pl-banner img').first()).toHaveAttribute('src', baseURL + '/img/backdrop.jpg');
    await playing(page);
    await expect.poll(() => page.evaluate(() => Player.canOpenChannelList())).toBe(true);
    await sendKeyCode(page, 406);
    await menuChoice(page, '2 tiles');
    await expect(page.locator('#multi-view .mv-label').first()).toContainText(editedName);
    await back(page);
    await back(page);
    await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
        document.dispatchEvent(new Event('visibilitychange'));
    });
    const tiles = await page.evaluate(() => window.__hubTilesSent.flatMap(payload => payload.sections.flatMap(section => section.tiles)));
    expect(tiles.some(tile => tile.title === editedName && tile.image_url === baseURL + '/img/backdrop.jpg')).toBe(true);
    await page.reload();
    await section(page, 'Live TV');
    await page.evaluate(() => Library.addRecentChannel('s1', { stream_id: 1001, name: 'Provider snapshot' }));
    // Recent channels is a saved-library path, separate from the catalogue grid.
    expect(await page.evaluate(() => Library.recentChannels('s1')[0].name)).toBe(editedName);
});

test('#96 real backup exports and full restore preserve edits, profile/source isolation and live-only options', async ({ page, baseURL }) => {
    await fixture(page, baseURL);
    const checks = await page.evaluate(async ({ editedName, baseURL }) => {
        const channel = { stream_id: 1001 };
        ChannelEdits.save('s1', channel, { name: editedName, logo: baseURL + '/img/backdrop.jpg' });
        const full = FullBackup.collect();
        const exported = await Backup.build();
        ChannelEdits.save('s1', channel, null);
        FullBackup.apply(FullBackup.parse(JSON.stringify(full)));
        const restored = ChannelEdits.view('s1', { ...channel, name: 'Provider' }).name;
        const other = ProfileStore.add('Other');
        ProfileStore.setActive(other.id);
        const profileName = ChannelEdits.view('s1', { ...channel, name: 'Provider' }).name;
        ProfileStore.setActive('default');
        ProfileStore.remove(other.id);
        const sourceName = ChannelEdits.view('s2', { ...channel, name: 'Provider' }).name;
        await Backup.apply(Backup.parse(JSON.stringify(exported)), 'replace');
        const id = Sources.all()[0].id;
        return { exported: exported.playlists[0].tvState.channelEdits['id:1001'], restored, profileName, sourceName,
            imported: ChannelEdits.view(id, { ...channel, name: 'Provider' }).name };
    }, { editedName, baseURL });
    expect(checks).toEqual({ exported: { name: editedName, logo: baseURL + '/img/backdrop.jpg' }, restored: editedName, imported: editedName, profileName: 'Provider', sourceName: 'Provider' });
    await page.reload();
    await section(page, 'Movies');
    await enterItems(page);
    await holdOK(page);
    await expect(page.locator('#menu')).not.toContainText('Edit channel');
});

test('#96 Arabic editor supports Return and empty-logo fallback', async ({ page, baseURL }) => {
    await page.route(url => !['localhost', '127.0.0.1'].includes(url.hostname), route => route.abort());
    await boot(page, { storage: { settings: { language: 'ar' } } });
    await section(page, 'تلفزيون مباشر');
    await expect(page.locator('#items .row').first()).toBeVisible();
    await expect(page.locator('#items .skeleton')).toHaveCount(0);
    await enterItems(page);
    await holdOK(page);
    await menuChoice(page, 'تعديل القناة');
    await menuChoice(page, 'الشعار');
    await expect(page.locator('#menu')).toContainText('لا توجد شعارات أخرى.');
    await expect(page.locator('#menu .focused')).toHaveText('إلغاء');
    await back(page);
    await expect(page.locator('#menu')).toBeHidden();
});

test('#96 M3U channels retain edits through Export/Replace and Reset restores the playlist values', async ({ page, baseURL }) => {
    await page.route('**/edit-playlist.m3u', route => route.fulfill({ contentType: 'audio/x-mpegurl', body:
        '#EXTM3U\n#EXTINF:-1 tvg-id="ch1001.se" tvg-logo="" group-title="Sport",Match One HD\n' + baseURL + '/live/tester/secret/1001.ts\n' +
        '#EXTINF:-1 tvg-id="ch1001.se" tvg-logo="' + baseURL + '/img/backdrop.jpg" group-title="Sport",Match One FHD\n' + baseURL + '/live/tester/secret/1002.ts' }));
    await boot(page, { storage: { sources: [{ id: 's1', type: 'm3u', name: 'Regression TV', url: baseURL + '/edit-playlist.m3u' }] } });
    await section(page, 'Live TV');
    await enterItems(page);
    await editor(page);
    await menuChoice(page, 'Name');
    await page.locator('#profile-name').fill('My match');
    await press(page, 'ArrowDown');
    await press(page, 'Enter');
    await editor(page);
    await menuChoice(page, 'Logo');
    await menuChoice(page, 'Match One FHD');
    await expect(page.locator('#items .focused .label')).toContainText('My match');
    await expect(page.locator('#items .focused img').first()).toHaveAttribute('src', baseURL + '/img/backdrop.jpg');
    const keys = await page.evaluate(async () => {
        const exported = await Backup.build();
        const edits = exported.playlists[0].tvState.channelEdits;
        await Backup.apply(Backup.parse(JSON.stringify(exported)), 'replace');
        return Object.keys(edits);
    });
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(/^m3u:[a-f0-9]+$/);
    await page.reload();
    await section(page, 'Live TV');
    await enterItems(page);
    await expect(page.locator('#items .focused .label')).toContainText('My match');
    await expect(page.locator('#items .focused img').first()).toHaveAttribute('src', baseURL + '/img/backdrop.jpg');
    await editor(page);
    await menuChoice(page, "Reset to provider's");
    await expect(page.locator('#items .focused .label')).toContainText('Match One HD');
    await expect(page.locator('#items .focused img')).toHaveCount(0);
});

test('#96 editing the playing preview refreshes its title and full-screen banner without a new stream', async ({ page }) => {
    await boot(page, { livePreview: true });
    await section(page, 'Live TV');
    await enterItems(page);
    await press(page, 'Enter');
    await playing(page);
    const played = await page.evaluate(() => Player.request().channel);
    let streams = 0;
    page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/live/')) streams++; });
    await editor(page);
    await menuChoice(page, 'Name');
    await page.locator('#profile-name').fill('My preview');
    await press(page, 'ArrowDown');
    await press(page, 'Enter');
    await expect(page.locator('.lp-title')).toHaveText('1. My preview');
    expect(streams).toBe(0);
    expect(await page.evaluate(() => Player.request().channel)).toBe(played);
    await press(page, 'Enter');
    await expect(page.locator('#pl-title')).toContainText('My preview');
    expect(streams).toBe(0);
});
