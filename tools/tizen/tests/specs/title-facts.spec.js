const { test, expect, boot, press, back, section, enterItems, chooseView } = require('./helpers');

// A film's length and a show's seasons in Wide and Info boxes (#91): kept
// from the title's page, and looked up from TMDB for the boxes on screen.

async function view(page, label) {
    await enterItems(page);
    for (let i = 0; i < 8 && !await page.locator('#searchbar.focused, .view-btn.focused').count(); i++) await press(page, 'ArrowUp');
    await chooseView(page, label);
    await press(page, 'ArrowDown');
}

test('#91 a film\'s length and a show\'s seasons, learnt on its page, show in Info boxes and after a restart', async ({ page }) => {
    await boot(page);
    await section(page, 'Movies');
    await view(page, 'Info boxes');
    const film = page.locator('#items .card.box.info').first();
    await expect(film.locator('.box-meta')).not.toContainText('min');
    const title = await page.locator('#items .focused .card-title').innerText();
    await press(page, 'Enter');
    await expect(page.locator('#detail .dt-meta')).toContainText('1 h 52 min');
    await back(page);
    await expect(page.locator('#items .card.box.info').filter({ hasText: title }).locator('.box-meta')).toContainText('1 h 52 min');

    await section(page, 'Series');
    await view(page, 'Info boxes');
    const show = page.locator('#items .card.box.info').first();
    await expect(show).not.toContainText('season');
    const name = await page.locator('#items .focused .card-title').innerText();
    await press(page, 'Enter');
    await expect(page.locator('#detail .dt-ep-pill').first()).toBeVisible();
    await back(page);
    await expect(page.locator('#items .card.box.info').filter({ hasText: name }).locator('.box-meta')).toContainText('2 seasons');
    await page.screenshot({ path: 'C:/Users/YoussefHikal/Desktop/screenshots/movie-length/series-info-seasons.png' });

    await page.reload();
    await expect(page.locator('body')).toHaveAttribute('data-source', 'Regression TV');
    await section(page, 'Movies');
    await expect(page.locator('#items .card.box.info').filter({ hasText: title }).locator('.box-meta')).toContainText('1 h 52 min');
    await page.screenshot({ path: 'C:/Users/YoussefHikal/Desktop/screenshots/movie-length/movies-info-length.png' });
    await section(page, 'Series');
    await expect(page.locator('#items .card.box.info').filter({ hasText: name }).locator('.box-meta')).toContainText('2 seasons');
});

test('#91 with TMDB on, the boxes on screen fill in their length and seasons without opening them', async ({ page }) => {
    const asked = [];
    await page.route('https://image.tmdb.org/**', (route) => route.fulfill({ status: 404 }));
    await page.route('https://api.themoviedb.org/**', (route) => {
        const url = new URL(route.request().url());
        const endpoint = url.pathname.replace('/3', '');
        asked.push(endpoint);
        const query = url.searchParams.get('query') || '';
        const number = Number((/(\d+)$/.exec(query) || [])[1]);
        if (endpoint === '/search/movie') return route.fulfill({ json: { results: [{ id: 100 + number, title: query }] } });
        if (endpoint === '/search/tv') return route.fulfill({ json: { results: [{ id: 500 + number, name: query }] } });
        const film = /^\/movie\/(\d+)$/.exec(endpoint);
        if (film) return route.fulfill({ json: { id: Number(film[1]), title: 'Movie ' + (film[1] - 100), runtime: 60 + (film[1] - 100) } });
        const tv = /^\/tv\/(\d+)$/.exec(endpoint);
        if (tv) return route.fulfill({ json: { id: Number(tv[1]), name: 'Show ' + (tv[1] - 500), number_of_seasons: 3 } });
        return route.fulfill({ status: 404, json: { status_message: 'Not found' } });
    });
    const provider = [];
    page.on('request', (request) => { if (/get_vod_info|get_series_info/.test(request.url())) provider.push(request.url()); });
    await boot(page, { storage: { settings: { tmdbApiKey: 'test-key' } } });
    await section(page, 'Movies');
    await view(page, 'Info boxes');
    const metas = page.locator('#items .card.box.info:not(.peek) .box-meta');
    await expect(metas.first()).toContainText(/\d+ h \d+ min|\d+ min/, { timeout: 15000 });
    await expect.poll(async () => (await metas.allInnerTexts()).filter((text) => /min/.test(text)).length, { timeout: 20000 }).toBe(await metas.count());
    // TMDB was asked; the provider was not asked per film.
    expect(asked.some((endpoint) => /^\/movie\//.test(endpoint))).toBe(true);
    expect(provider).toEqual([]);

    await section(page, 'Series');
    await view(page, 'Wide boxes');
    await expect(page.locator('#items .card.box.wide .box-fact').first()).toHaveText('3 seasons', { timeout: 15000 });
    await view(page, 'Info boxes');
    await expect(page.locator('#items .card.box.info .box-meta').first()).toContainText('3 seasons');
    expect(provider).toEqual([]);
});
