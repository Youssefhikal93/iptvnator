const { test, expect, boot, channel, movie, section, category, enterItems, press, back, holdOK, menuChoice, moveTo, playing } = require('./helpers');

async function twoSources(page, options = {}) {
    await boot(page, { livePreview: options.preview, storage: {
        settings: { ...(options.all === false ? {} : { librarySources: 'all' }), onStart: 'home' },
        'favorites:s1': { live: [channel(1)], movies: [movie(1)] },
        'recent:s1': { live: [{ ...channel(1), watchedAt: 100 }] },
        // Matching ids must still belong to two different sources.
        'favorites:s2': { live: [{ ...channel(1), name: 'Other channel' }], movies: [movie(2)] },
        'recent:s2': { live: [{ ...channel(1), name: 'Other channel', watchedAt: 200 }] },
    } });
    await page.evaluate(() => {
        const sources = Sources.all();
        sources.push({ id: 's2', type: 'xtream', name: 'Second TV', url: location.origin, user: 'second', pass: 'secret' });
        localStorage.setItem('iptvnator-tv:sources', JSON.stringify(sources));
    });
    await page.reload();
    await expect(page.locator('#source-name')).toHaveText('Regression TV');
}

const homeRow = (page, title) => page.locator('.hm-row').filter({ has: page.locator('.hm-row-title', { hasText: title }) });

async function mergedFavorites(page) {
    await category(page, 'Favorites');
    // Programme redraws can update the heading before the category debounce.
    await expect(page.locator('#items .source-chip')).toHaveText('Second TV');
}

test('This source stays isolated; the Display choice merges categories and Home rows and survives reload', async ({ page }) => {
    await twoSources(page, { all: false });
    await expect(homeRow(page, 'Live now').locator('.hm-card')).toHaveCount(1);
    await section(page, 'Live TV');
    await category(page, 'Favorites');
    await expect(page.locator('#items .row')).toHaveCount(1);
    await expect(page.locator('#items .source-chip')).toHaveCount(0);
    await category(page, 'Recently watched');
    await expect(page.locator('#items .row')).toHaveCount(1);
    await section(page, 'Settings');
    const labels = await page.locator('.st-label').allTextContents();
    expect(labels[labels.indexOf('Home layout') + 1]).toBe('Favorites and recents from');
    await moveTo(page, '.st-row.focused .st-label', 'Favorites and recents from');
    await expect(page.locator('.st-row.focused .st-value')).toHaveText('This source');
    await press(page, 'Enter');
    await expect(page.locator('.st-row.focused .st-value')).toHaveText('All sources');
    await section(page, 'Live TV');
    await mergedFavorites(page);
    await expect(page.locator('#items .row')).toHaveCount(2);
    await expect(page.locator('#items .row').first().locator('.source-chip')).toHaveCount(0);
    await expect(page.locator('#items .row').nth(1).locator('.source-chip')).toHaveText('Second TV');
    await category(page, 'Recently watched');
    await expect(page.locator('#items .row > .label')).toContainText(['1. Other channel', '1. Channel 1 (cat all)']);
    await section(page, 'Home');
    await expect(homeRow(page, 'Live now').locator('.hm-card')).toHaveCount(2);
    await expect(homeRow(page, 'Live now').locator('.source-chip')).toHaveText('Second TV');
    await expect(homeRow(page, 'Favorite movies').locator('.hm-card')).toHaveCount(2);
    // Move down until the later recent row is drawn by Home's window.
    await moveTo(page, '.hm-row:has(.hm-card.focus) .hm-row-title', 'Recently watched channels');
    await expect(homeRow(page, 'Recently watched channels').locator('.hm-card')).toHaveCount(2);
    await expect(homeRow(page, 'Recently watched channels').locator('.source-chip')).toHaveText('Second TV');
    await page.reload();
    await section(page, 'Settings');
    await expect(page.locator('.st-row').filter({ hasText: 'Favorites and recents from' }).locator('.st-value')).toHaveText('All sources');
});

test('OK on another source channel switches quietly, plays its stream and Return keeps Favorites', async ({ page }) => {
    await twoSources(page);
    const requests = [];
    const streams = [];
    page.on('request', request => {
        const url = new URL(request.url());
        if (url.pathname === '/player_api.php' && url.searchParams.get('username') === 'second') requests.push(url.searchParams.get('action'));
        if (url.pathname.startsWith('/live/')) streams.push(url.pathname);
    });
    await section(page, 'Live TV');
    await mergedFavorites(page);
    await enterItems(page);
    await press(page, 'ArrowDown');
    await press(page, 'Enter');
    await playing(page);
    await expect(page.locator('#source-name')).toHaveText('Second TV');
    await expect(page.locator('#rail .active')).toHaveText('Live TV');
    expect(await page.evaluate(() => Sources.current().id)).toBe('s2');
    expect(streams.length).toBeGreaterThan(0);
    expect(streams.every(path => path.startsWith('/live/second/'))).toBe(true);
    await expect(page.locator('#pl-controls')).toBeHidden({ timeout: 10000 });
    await back(page);
    await expect(page.locator('#player')).toBeHidden();
    await expect(page.locator('#items .list-header')).toContainText('Favorites');
    await expect(page.locator('#items .focused > .label')).toContainText('1. Other channel');
    await expect(page.locator('#items .focused .source-chip')).toHaveCount(0);
    await expect(page.locator('#items .source-chip')).toHaveText('Regression TV');
    await expect.poll(() => requests.includes('get_short_epg')).toBe(true);
    expect(requests).toContain('get_live_categories');
    expect(await page.evaluate(() => Library.recent('s2', 'live')[0].watchedAt)).toBeGreaterThan(200);
});

test('hold OK removes favorites and recents from the tagged source even with identical ids', async ({ page }) => {
    await twoSources(page);
    await section(page, 'Live TV');
    await mergedFavorites(page);
    await enterItems(page);
    await press(page, 'ArrowDown');
    await holdOK(page);
    await menuChoice(page, 'Remove from Favorites');
    await expect(page.locator('#items .row')).toHaveCount(1);
    expect(await page.evaluate(() => Library.favorites('s1', 'live').length)).toBe(1);
    expect(await page.evaluate(() => Library.favorites('s2', 'live').length)).toBe(0);
    await press(page, 'ArrowLeft');
    await category(page, 'Recently watched');
    await enterItems(page);
    await expect(page.locator('#items .focused .source-chip')).toHaveText('Second TV');
    await holdOK(page);
    await menuChoice(page, 'Remove from Recently watched');
    await expect(page.locator('#items .row')).toHaveCount(1);
    expect(await page.evaluate(() => Library.recent('s1', 'live').length)).toBe(1);
    expect(await page.evaluate(() => Library.recent('s2', 'live').length)).toBe(0);
    await expect(page.locator('#source-name')).toHaveText('Regression TV');
});

test('movie grid chips open the other source detail page and preserve its Favorites after playback', async ({ page }) => {
    await twoSources(page);
    await section(page, 'Movies');
    await mergedFavorites(page);
    await expect(page.locator('#items .card')).toHaveCount(2);
    await expect(page.locator('#items .card').nth(1).locator('.source-chip')).toHaveText('Second TV');
    await enterItems(page);
    await press(page, 'ArrowRight');
    await press(page, 'Enter');
    await expect(page.locator('#detail')).toBeVisible();
    await expect(page.locator('#detail .dt-meta')).not.toContainText('Loading');
    await expect(page.locator('#source-name')).toHaveText('Second TV');
    await expect(page.locator('#detail')).toContainText('Movie 2');
    await press(page, 'Enter');
    await playing(page);
    expect(await page.locator('#video').evaluate(video => new URL(video.currentSrc).pathname)).toContain('/movie/second/');
    await back(page);
    await back(page);
    await expect(page.locator('#items .list-header')).toContainText('Favorites');
    await expect(page.locator('#items .focused .card-title')).toHaveText('Movie 2');
    await expect(page.locator('#items .focused .source-chip')).toHaveCount(0);
});

test('a cross-source pick stops the live preview before checking the new account', async ({ page }) => {
    await twoSources(page, { preview: true });
    let stoppedBeforeAccount = false;
    await page.route('**/player_api.php?**', async route => {
        const url = new URL(route.request().url());
        if (url.searchParams.get('username') === 'second' && !url.searchParams.get('action')) {
            stoppedBeforeAccount = await page.locator('#video').evaluate(video => video.paused && !video.getAttribute('src'));
        }
        await route.continue();
    });
    await section(page, 'Live TV');
    await mergedFavorites(page);
    await enterItems(page);
    await press(page, 'Enter');
    await playing(page);
    await expect(page.locator('#content')).toHaveClass(/previewing/);
    await press(page, 'ArrowDown');
    await press(page, 'Enter');
    await expect(page.locator('#source-name')).toHaveText('Second TV');
    await playing(page);
    expect(stoppedBeforeAccount).toBe(true);
    await expect(page.locator('#content')).not.toHaveClass(/previewing/);
    await expect(page.locator('#player')).not.toHaveClass(/preview/);
});

test('Home card OK switches source and returns to the same Home row with chips reversed', async ({ page }) => {
    await twoSources(page);
    await section(page, 'Home');
    await moveTo(page, '.hm-row:has(.hm-card.focus) .hm-row-title', 'Recently watched channels');
    await expect(page.locator('.hm-card.focus .source-chip')).toHaveText('Second TV');
    await press(page, 'Enter');
    await playing(page);
    await expect(page.locator('#source-name')).toHaveText('Second TV');
    await back(page);
    await expect(page.locator('#rail .active')).toHaveText('Home');
    await expect(page.locator('.hm-row:has(.hm-card.focus) .hm-row-title')).toHaveText('Recently watched channels');
    await expect(homeRow(page, 'Recently watched channels').locator('.source-chip')).toHaveText('Regression TV');
});

test('other-source shows open details and saved episodes play directly from Recently watched', async ({ page }) => {
    await twoSources(page);
    await page.evaluate(() => {
        const show = { series_id: 3004, name: 'Show 4' };
        Library.toggleFavorite('s2', 'series', show);
        Library.addRecent('s2', 'series', {}, show, { id: 4001, label: 'S1 E1 Pilot 1', container_extension: 'mp4' });
    });
    await section(page, 'Series');
    await category(page, 'Favorites');
    await expect(page.locator('#items .source-chip')).toHaveText('Second TV');
    await enterItems(page);
    await press(page, 'Enter');
    await expect(page.locator('#detail')).toBeVisible();
    await expect(page.locator('#detail')).toContainText('Pilot 1');
    await expect(page.locator('#source-name')).toHaveText('Second TV');
    await page.evaluate(() => Sources.setCurrent('s1'));
    await page.reload();
    await section(page, 'Series');
    await category(page, 'Recently watched');
    await enterItems(page);
    await press(page, 'Enter');
    await playing(page);
    await expect(page.locator('#detail')).toBeHidden();
    await expect(page.locator('#source-name')).toHaveText('Second TV');
    expect(await page.locator('#video').evaluate(video => new URL(video.currentSrc).pathname)).toContain('/series/second/');
    await back(page);
    await expect(page.locator('#items .list-header')).toContainText('Recently watched');
    await expect(page.locator('#items .focused .source-chip')).toHaveCount(0);
});

test('a failed source switch waits about a second before LoadScreen and Retry finishes the pick', async ({ page }) => {
    await twoSources(page);
    let fail = true;
    await page.route('**/player_api.php?**', async route => {
        const url = new URL(route.request().url());
        if (fail && url.searchParams.get('username') === 'second' && !url.searchParams.get('action')) {
            return route.fulfill({ status: 503, body: '' });
        }
        await route.continue();
    });
    await section(page, 'Live TV');
    await mergedFavorites(page);
    await enterItems(page);
    await press(page, 'ArrowDown');
    await press(page, 'Enter');
    // Observe the quiet period before the one-second recovery-screen gate.
    await page.waitForTimeout(400);
    await expect(page.locator('#load-error')).toBeHidden();
    await expect(page.locator('#load-error')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('#load-message')).toHaveText('Source not responding');
    fail = false;
    await press(page, 'Enter');
    await playing(page);
    await expect(page.locator('#load-error')).toBeHidden();
    await expect(page.locator('#source-name')).toHaveText('Second TV');
});

test('an M3U movie pick waits for the playlist to discover its sections before restoring Favorites', async ({ page }) => {
    await twoSources(page);
    await page.evaluate(async () => {
        const source = { id: 's2', type: 'm3u', name: 'Second TV', url: location.origin + '/playlist-vod.m3u' };
        Sources.update(source);
        const adapter = M3uSource(source);
        const movies = await adapter.items('movies');
        Library.toggleFavorite('s2', 'movies', { stream_id: 2002 });
        Library.toggleFavorite('s2', 'movies', movies[0]);
    });
    await section(page, 'Movies');
    await mergedFavorites(page);
    await enterItems(page);
    await press(page, 'ArrowRight');
    await press(page, 'Enter');
    await expect(page.locator('#detail')).toBeVisible();
    await expect(page.locator('#detail .dt-title')).toHaveText('Heist Night (2019)');
    await expect(page.locator('#source-name')).toHaveText('Second TV');
    await press(page, 'Enter');
    await playing(page);
    await back(page);
    await back(page);
    await expect(page.locator('#items .list-header')).toContainText('Favorites');
    await expect(page.locator('#items .focused .card-title')).toHaveText('Heist Night (2019)');
});
