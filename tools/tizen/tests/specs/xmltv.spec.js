const { test, expect, boot, section, press, back, sources, sourceMenu, menuChoice, enterItems, playing } = require('./helpers');

async function guideLink(page, path, prefer = 'yes') {
    await sourceMenu(page);
    await menuChoice(page, 'Guide link…');
    await expect(page.locator('#form-title')).toHaveText('Guide link');
    await page.locator('#form-epg-url').fill(new URL(page.url()).origin + path);
    await page.locator('#form-epg-prefer').selectOption(prefer);
    await page.locator('#form-save').click();
    await expect(page.locator('#form')).toBeHidden();
}

function liveRow(page, n) {
    return page.locator('#items .row').filter({ has: page.locator('.label', { hasText: new RegExp('^' + n + '\\. Channel ' + n + ' ') }) });
}

test('own gzip guide, provider-first fallback, player, saved reload and removal', async ({ page }) => {
    // The fixture omits multiples of 3 (1002); ticket #7 also exercises 1003.
    await page.route('**/player_api.php?*', route => {
        const url = new URL(route.request().url());
        if (url.searchParams.get('action') === 'get_short_epg' && url.searchParams.get('stream_id') === '1003') return route.fulfill({ json: { epg_listings: [] } });
        return route.continue();
    });
    let downloads = 0;
    page.on('request', req => { if (new URL(req.url()).pathname === '/epg.xml.gz') downloads++; });
    await boot(page);
    await guideLink(page, '/epg.xml.gz');
    await expect(page.locator('#settings')).toContainText('Active · Guide: updated');
    await section(page, 'Live TV');
    await expect(liveRow(page, 1).locator('.epg-now')).toContainText('XMLTV show');
    await expect(liveRow(page, 3).locator('.epg-now')).toContainText('XMLTV show');

    await sourceMenu(page);
    await menuChoice(page, 'Prefer my guide: On');
    await section(page, 'Live TV');
    await expect(liveRow(page, 1).locator('.epg-now')).toHaveText('Nyheter på svenska 1001');
    await expect(liveRow(page, 3).locator('.epg-now')).toContainText('XMLTV show');
    await enterItems(page);
    await press(page, 'ArrowDown');
    await press(page, 'ArrowDown');
    await press(page, 'Enter');
    await playing(page);
    await expect(page.locator('#pl-epg')).toContainText('XMLTV show');
    await expect(page.locator('#pl-epg')).toContainText('Next');
    await expect(page.locator('#pl-controls')).toBeHidden({ timeout: 10000 });
    await back(page);

    await page.reload();
    // Startup may reopen the last channel; section() returns through playback.
    await section(page, 'Live TV');
    await expect(liveRow(page, 3).locator('.epg-now')).toContainText('XMLTV show');
    expect(downloads).toBe(1);
    await sourceMenu(page);
    await menuChoice(page, 'Remove guide link');
    await expect(page.locator('#settings')).not.toContainText('Guide:');
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('iptvnator-tv:sources'))[0].epgUrl)).toBe('');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('iptvnator-tv:guide:s1'))).toBe(null);
    await section(page, 'Live TV');
    await expect(liveRow(page, 1).locator('.epg-now')).toHaveText('Nyheter på svenska 1001');
    await expect(liveRow(page, 3).locator('.epg-now')).toHaveCount(0);
});

test('M3U add form accepts a guide and exposes XMLTV now/next on live rows and player', async ({ page }) => {
    await page.route('**/playlist.m3u', async route => {
        const response = await route.fetch();
        const origin = new URL(page.url()).origin;
        // Keep the fixture's tvg-id and groups, but play the local media fixture.
        const body = (await response.text()).replace(/http:\/\/example\.test\/(\d+)\.m3u8/g, origin + '/live/tester/secret/$1.ts');
        await route.fulfill({ response, body });
    });
    await boot(page);
    await sources(page, '+  Add M3U playlist');
    await press(page, 'Enter');
    await expect(page.locator('#form-title')).toHaveText('Add M3U playlist');
    await expect(page.locator('#form-epg-preference')).toBeHidden();
    const origin = new URL(page.url()).origin;
    await page.locator('#form-name').fill('Guided playlist');
    await page.locator('#form-url').fill(origin + '/playlist.m3u');
    await page.locator('#form-epg-url').fill(origin + '/epg.xml');
    await page.locator('#form-save').click();
    await expect(page.locator('#form')).toBeHidden();
    await section(page, 'Live TV');
    await expect(page.locator('#items .row').first().locator('.epg-now')).toContainText('XMLTV show');
    await enterItems(page);
    await press(page, 'Enter');
    await playing(page);
    await expect(page.locator('#pl-epg')).toContainText('m3u1.se');
    await expect(page.locator('#pl-epg')).toContainText('Next');
    await expect(page.locator('#pl-controls')).toBeHidden({ timeout: 10000 });
    await back(page);
    await sources(page, 'Guided playlist');
    await expect(page.locator('#settings')).toContainText('Active · Guide: updated');
});

test('404 guide reports failure while catalogue and provider guide remain usable', async ({ page }) => {
    await boot(page);
    await guideLink(page, '/missing-guide.xml');
    await expect(page.locator('#settings')).toContainText('Guide: failed');
    await section(page, 'Live TV');
    await expect(liveRow(page, 1).locator('.epg-now')).toHaveText('Nyheter på svenska 1001');
    await enterItems(page);
    await press(page, 'Enter');
    await playing(page);
});

test('a truncated refresh preserves the previous guide; stale startup retries it', async ({ page }) => {
    await boot(page);
    await guideLink(page, '/epg.xml');
    await expect(page.locator('#settings')).toContainText('Guide: updated');
    await page.route('**/epg.xml', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: (await response.text()).replace('</tv>', '') });
    });
    await sourceMenu(page);
    await menuChoice(page, 'Refresh guide');
    await expect(page.locator('#settings')).toContainText('Guide: failed');
    await section(page, 'Live TV');
    await expect(liveRow(page, 3).locator('.epg-now')).toContainText('XMLTV show');
    await page.unroute('**/epg.xml');
    await page.evaluate(() => {
        const key = 'iptvnator-tv:guide:s1';
        const status = JSON.parse(localStorage.getItem(key));
        status.updatedAt = Date.now() - 13 * 3600000;
        localStorage.setItem(key, JSON.stringify(status));
    });
    await page.reload();
    await sources(page);
    await expect(page.locator('#settings')).toContainText('Guide: updated');
});

test('guide edit remote fields clamp offsets and Return or Cancel preserves the saved source', async ({ page }) => {
    await boot(page);
    await sourceMenu(page);
    await menuChoice(page, 'Guide link…');
    await expect(page.locator('#form-epg-url')).toBeFocused();
    await press(page, 'ArrowDown');
    await expect(page.locator('#form-epg-offset')).toBeFocused();
    await page.locator('#form-epg-offset').fill('12');
    await press(page, 'ArrowRight');
    await expect(page.locator('#form-epg-offset')).toHaveValue('12');
    await page.locator('#form-epg-offset').fill('-12');
    await press(page, 'ArrowLeft');
    await expect(page.locator('#form-epg-offset')).toHaveValue('-12');
    await press(page, 'ArrowDown');
    await press(page, 'ArrowLeft');
    await expect(page.locator('#form-epg-prefer')).toHaveValue('no');
    await back(page);
    await expect(page.locator('#form')).toBeHidden();
    await expect(page.locator('#settings')).not.toContainText('Guide:');
    await sourceMenu(page);
    await menuChoice(page, 'Guide link…');
    await page.locator('#form-epg-url').fill('bad link');
    await page.locator('#form-save').click();
    await expect(page.locator('#form-msg')).toContainText('The guide link must start');
    await page.locator('#form-cancel').click();
    await expect(page.locator('#form')).toBeHidden();
});
