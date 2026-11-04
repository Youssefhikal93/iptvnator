const { test, expect, boot, press, back, setting, openFirst, section, moveTo } = require('./helpers');

const switches = [
    ['Details and facts', 'tmdbDetails'], ['Artwork', 'tmdbArtwork'], ['Cast and actor pages', 'tmdbCast'],
    ['Collections look-up', 'tmdbCollections'], ['Similar and Because you watched', 'tmdbSimilar'],
    ['Genre check', 'tmdbGenres'], ['Facts in Wide and Info boxes', 'tmdbBoxes'],
    ['OpenSubtitles', 'opensubtitlesOn'], ['SubDL', 'subdlOn'], ['SubSource', 'subsourceOn'],
    ['DeepL translation', 'deeplOn'], ['YouTube trailer button', 'youtubeOn'],
];

for (const [label, key] of switches) {
    test('#98 ' + label + ': Cancel keeps On, Turn off saves Off, On needs no warning', async ({ page }) => {
        await boot(page);
        await setting(page, label);
        const value = page.locator('.st-row.focused .st-value');
        await expect(value).toHaveText('On');
        await press(page, 'Enter');
        await expect(page.locator('#profile-dialog h1')).toHaveText('Turn off ' + label + '?');
        await expect(page.locator('#profile-dialog-message')).not.toBeEmpty();
        // Cancel owns focus, so OK leaves the setting alone.
        await press(page, 'Enter');
        await expect(page.locator('#profile-dialog')).toHaveCount(0);
        await expect(value).toHaveText('On');
        await press(page, 'Enter');
        await press(page, 'ArrowLeft');
        await press(page, 'Enter');
        await expect(value).toHaveText('Off');
        expect(await page.evaluate(key => Prefs.get(key), key)).toBe(false);
        await page.reload();
        await setting(page, label);
        await expect(value).toHaveText('Off');
        await press(page, 'Enter');
        await expect(page.locator('#profile-dialog')).toHaveCount(0);
        await expect(value).toHaveText('On');
    });
}

test('#98 details Off retains provider facts while independently enabled cast stays available', async ({ page }) => {
    const catalogue = require('../fixtures/tmdb/catalogue.json');
    let calls = 0;
    await page.route('https://api.themoviedb.org/**', route => {
        calls++;
        const url = new URL(route.request().url());
        if (url.pathname.includes('/search/')) return route.fulfill({ json: { results: [catalogue['movie/125']] } });
        return route.fulfill({ json: catalogue['movie/125'] });
    });
    await boot(page, { storage: { settings: { tmdbApiKey: 'fixture-key', tmdbDetails: false, tmdbCollections: false } } });
    await openFirst(page, 'Movies');
    await expect(page.locator('#detail .tm-row', { hasText: 'Cast' }).first()).toBeVisible();
    await expect(page.locator('#detail .dt-plot')).toContainText('retired detective');
    await expect(page.locator('#detail .dt-chip')).toContainText(['Crime', 'Drama']);
    expect(calls).toBeGreaterThan(0);
    await back(page);
    // With every detail-page TMDB consumer Off, nothing is requested even with a key.
    await page.evaluate(() => ['tmdbArtwork', 'tmdbCast', 'tmdbSimilar', 'youtubeOn'].forEach(key => Prefs.set(key, false)));
    const before = calls;
    await openFirst(page, 'Movies');
    await expect(page.locator('#detail .dt-poster')).toHaveAttribute('src', /\/img\/poster.jpg$/);
    await expect(page.locator('#detail .tm-row:not(.related):not(.collection)')).toHaveCount(0);
    await expect(page.locator('#detail .dt-btn', { hasText: 'Trailer' })).toHaveCount(0);
    await page.waitForTimeout(500);
    expect(calls).toBe(before);
});

test('#98 Collections look-up Off groups film names and hides Refresh despite a saved key', async ({ page }) => {
    let calls = 0;
    await page.route('https://api.themoviedb.org/**', route => { calls++; return route.abort(); });
    await page.route('**/player_api.php*', async route => {
        if (new URL(route.request().url()).searchParams.get('action') !== 'get_vod_streams') return route.continue();
        const response = await route.fetch();
        const films = await response.json();
        films.slice(0, 3).forEach((film, index) => { film.name = ['Toy Story', 'Toy Story 2', 'Toy Story 3'][index]; });
        await route.fulfill({ response, json: films });
    });
    await boot(page, { storage: { settings: { tmdbApiKey: 'fixture-key', tmdbCollections: false } } });
    await section(page, 'Movies');
    await expect(page.locator('#categories .label', { hasText: /^Collections$/ })).toHaveCount(1);
    await moveTo(page, '#categories .focused .label', 'Collections', 'ArrowUp');
    await expect(page.locator('#items .list-header')).toContainText('Collections');
    await expect(page.locator('#items .card')).toHaveCount(1);
    await expect(page.locator('#items')).toContainText('Toy Story');
    await expect(page.locator('#items .list-action', { hasText: 'Refresh' })).toHaveCount(0);
    await page.waitForTimeout(3500);
    expect(calls).toBe(0);
});

test('#98 Arabic switches and warning use translated text with RTL layout', async ({ page }) => {
    await boot(page, { storage: { settings: { language: 'ar' } } });
    const label = 'البحث عن مجموعات الأفلام';
    await setting(page, label, 'الإعدادات');
    expect(await page.locator('#settings').evaluate(node => getComputedStyle(node).direction)).toBe('rtl');
    await press(page, 'Enter');
    await expect(page.locator('#profile-dialog h1')).toHaveText('إيقاف ' + label + '؟');
    await expect(page.locator('#profile-dialog-message')).toContainText('حسب أسمائها');
});

test('#98 Artwork Off also blocks provider-supplied TMDB posters but keeps channel logos', async ({ page }) => {
    const seen = [];
    await page.route('https://image.tmdb.org/**', route => { seen.push(route.request().url()); return route.abort(); });
    await page.route('**/player_api.php*', async route => {
        const action = new URL(route.request().url()).searchParams.get('action');
        if (!['get_vod_streams', 'get_vod_info', 'get_live_streams'].includes(action)) return route.continue();
        const response = await route.fetch();
        const body = await response.json();
        if (Array.isArray(body)) body.forEach(item => { item.stream_icon = 'https://image.tmdb.org/t/p/w342/provider.jpg'; });
        else {
            body.info.movie_image = 'https://image.tmdb.org/t/p/w342/detail.jpg';
            body.info.backdrop_path = ['https://image.tmdb.org/t/p/w1280/backdrop.jpg'];
        }
        await route.fulfill({ response, json: body });
    });
    await boot(page, { storage: { settings: { tmdbArtwork: false } } });
    await openFirst(page, 'Movies');
    await expect(page.locator('#detail .dt-poster')).not.toHaveAttribute('src', /image\.tmdb\.org/);
    await page.waitForTimeout(400);
    expect(seen).toEqual([]);
    await back(page);
    await section(page, 'Live TV');
    await expect.poll(() => seen.length).toBeGreaterThan(0);
});
