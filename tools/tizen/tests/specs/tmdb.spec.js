const path = require('node:path');
const { test, expect, boot, section, press, back, moveTo, openFirst, sendKeyCode, setting } = require('./helpers');
const catalogue = require('../fixtures/tmdb/catalogue.json');
const configuration = require('../fixtures/tmdb/configuration.json');
const genres = require('../fixtures/tmdb/genres.json');
const person = require('../fixtures/tmdb/person.json');
const refused = require('../fixtures/tmdb/refused.json');
const failure = require('../fixtures/tmdb/failure.json');
const seed = { storage: { settings: { tmdbApiKey: 'viewer-test-key' } } };

async function routes(page, options = {}) {
    const seen = [];
    await page.route('https://image.tmdb.org/**', route => route.fulfill({ path: path.join(__dirname, '../media/poster.jpg'), contentType: 'image/jpeg' }));
    await page.route('https://api.themoviedb.org/**', async route => {
        const url = new URL(route.request().url());
        seen.push(url.pathname);
        if (options.delay) await new Promise(resolve => setTimeout(resolve, options.delay));
        const endpoint = url.pathname.replace('/3', '');
        if (options.status) return route.fulfill({ status: options.status, json: options.status === 401 ? refused : failure });
        if (endpoint === '/configuration') return route.fulfill({ json: configuration });
        if (endpoint.startsWith('/genre/')) return route.fulfill({ json: genres });
        if (endpoint === '/person/71') return route.fulfill({ json: person });
        if (endpoint.startsWith('/search/')) {
            const type = endpoint.split('/')[2];
            const results = Object.entries(catalogue).filter(([key, movie]) => key.startsWith(type + '/') && (movie.title || movie.name) === url.searchParams.get('query')).map(([, movie]) => movie);
            return route.fulfill({ json: { results } });
        }
        return route.fulfill({ status: catalogue[endpoint.slice(1)] ? 200 : 404, json: catalogue[endpoint.slice(1)] || failure });
    });
    return seen;
}

async function emptyPlot(page, series = false) {
    await page.route('**/player_api.php*', async route => {
        const action = new URL(route.request().url()).searchParams.get('action');
        if (action !== (series ? 'get_series_info' : 'get_vod_info')) return route.continue();
        const response = await route.fetch();
        const body = await response.json();
        body.info.plot = '';
        await route.fulfill({ response, json: body });
    });
}

async function discover(page, name = 'Movies') {
    await section(page, name);
    await moveTo(page, '#categories .focused .label', 'Discover', 'ArrowUp');
    await press(page, 'Enter');
    await expect(page.locator('#discover .tm-chip').first()).toHaveText('Drama');
}

test('without a viewer key movie and show browsing sends no TMDB requests', async ({ page }) => {
    const seen = await routes(page);
    await boot(page);
    await openFirst(page, 'Movies');
    await expect(page.locator('#detail .dt-plot')).toContainText('retired detective');
    await back(page);
    await openFirst(page, 'Series');
    await expect(page.locator('#detail .dt-plot')).toContainText('small town');
    await back(page);
    await setting(page, 'Test key');
    await press(page, 'Enter');
    await expect(page.locator('#toast')).toHaveText('Set a TMDB API key first');
    await page.waitForTimeout(600);
    expect(seen).toHaveLength(0);
    await section(page, 'Movies');
    await expect(page.locator('#categories')).not.toContainText('Discover');
});

for (const status of [200, 401]) {
    test('entering a viewer key and testing it shows ' + (status === 200 ? 'Key works' : 'Key refused'), async ({ page }) => {
        const seen = await routes(page, status === 401 ? { status } : {});
        await boot(page);
        await setting(page, 'TMDB API key');
        await expect(page.locator('.st-row.focused .st-value')).toHaveText('Not set');
        await press(page, 'Enter');
        await page.locator('#tmdb-key-entry input').fill('own-free-key-1234');
        await press(page, 'ArrowDown');
        await press(page, 'Enter');
        await expect(page.locator('#tmdb-key-entry')).toHaveCount(0);
        await expect(page.locator('.st-row.focused .st-value')).toHaveText('Set ••••1234');
        expect(seen).toHaveLength(0);
        await press(page, 'ArrowDown');
        await press(page, 'Enter');
        await expect(page.locator('.st-row.focused .st-value')).toHaveText(status === 200 ? 'Key works' : 'Key refused');
        expect(seen).toEqual(['/3/configuration']);
        await page.reload();
        await setting(page, 'TMDB API key');
        await expect(page.locator('.st-row.focused .st-value')).toHaveText('Set ••••1234');
    });
}

test('provider page renders first, then TMDB fills plot and cast; OK opens actor credits', async ({ page }, testInfo) => {
    await routes(page, { delay: 250 });
    await emptyPlot(page);
    await boot(page, seed);
    await openFirst(page, 'Movies');
    await expect(page.locator('#detail .dt-title')).toContainText('Movie 25');
    await expect(page.locator('#detail .dt-plot')).toHaveText('A TMDB detective follows the missing clue.');
    await expect(page.locator('#detail .tm-row').first()).toContainText('Cast');
    await expect(page.locator('#detail .tm-card').first()).toContainText('Alex Example');
    await expect(page.locator('#detail .dt-poster')).toHaveAttribute('src', /\/w342\/poster.jpg$/);
    await expect(page.locator('#detail .dt-backdrop')).toHaveAttribute('src', /\/w1280\/backdrop.jpg$/);
    await expect(page.locator('#detail .dt-btn', { hasText: 'Trailer' })).toHaveCount(1);
    await press(page, 'ArrowDown');
    await expect(page.locator('#detail .tm-card.focus')).toContainText('Alex Example');
    await page.screenshot({ path: testInfo.outputPath('cast.png') });
    await press(page, 'Enter');
    await expect(page.locator('#actor')).toBeVisible();
    await expect(page.locator('#actor h1')).toHaveText('Alex Example');
    await expect(page.locator('#actor .tm-bio')).toContainText('screen actor');
    await expect(page.locator('#actor h2')).toHaveText('In your library');
    await expect(page.locator('#actor .tm-card')).toHaveCount(2);
    await expect(page.locator('#actor')).not.toContainText('Absent movie');
    await page.screenshot({ path: testInfo.outputPath('actor.png') });
    await press(page, 'ArrowRight');
    await press(page, 'Enter');
    await expect(page.locator('#actor')).toHaveCount(0);
    await expect(page.locator('#detail .dt-title')).toHaveText('Show 4');
});

test('series enrichment preserves provider plot and episodes, with cast and library-only similar shows', async ({ page }) => {
    await routes(page);
    await boot(page, seed);
    await openFirst(page, 'Series');
    await expect(page.locator('#detail .tm-row').first()).toContainText('Alex Example');
    await expect(page.locator('#detail .dt-plot')).toHaveText('A small town hides a big secret.');
    await expect(page.locator('#detail .tm-row').nth(1)).toContainText('Similar in your library');
    // A show's episodes come first, then the TMDB rows (#46).
    await press(page, 'ArrowDown');
    await expect(page.locator('#detail .dt-ep.focus')).toBeVisible();
    await press(page, 'ArrowDown');
    await press(page, 'ArrowDown');
    await expect(page.locator('#detail .tm-card.focus')).toHaveText('Show 3');
    await press(page, 'Enter');
    await expect(page.locator('#detail .dt-title')).toHaveText('Show 3');
});

test('Discover matches visible catalogue titles for a genre with at most three requests in flight', async ({ page }, testInfo) => {
    const seen = await routes(page, { delay: 40 });
    let active = 0;
    let peak = 0;
    page.on('request', request => {
        if (request.url().startsWith('https://api.themoviedb.org/')) { active++; peak = Math.max(peak, active); }
    });
    page.on('requestfinished', request => { if (request.url().startsWith('https://api.themoviedb.org/')) active--; });
    await boot(page, seed);
    await discover(page);
    expect(seen).toEqual(['/3/genre/movie/list']);
    await press(page, 'Enter');
    await expect(page.locator('#discover')).not.toContainText('Matching visible');
    await expect(page.locator('#discover .tm-card')).toHaveCount(6);
    await expect(page.locator('#discover .tm-card').first()).toHaveText('Movie 1');
    await page.screenshot({ path: testInfo.outputPath('discover.png') });
    expect(seen.filter(endpoint => endpoint === '/3/search/movie')).toHaveLength(12);
    expect(peak).toBeLessThanOrEqual(3);
    await press(page, 'ArrowRight');
    await press(page, 'Enter');
    await expect(page.locator('#discover .tm-card').first()).toHaveText('Movie 2');
    // Cached matches change genre without sending the same requests again.
    expect(seen.filter(endpoint => endpoint === '/3/search/movie')).toHaveLength(12);
    await press(page, 'ArrowDown');
    await press(page, 'Enter');
    await expect(page.locator('#detail .dt-title')).toContainText('Movie 2');
    expect(await page.locator('#detail .dt-title').evaluate(node => {
        const rect = node.getBoundingClientRect();
        return node.contains(document.elementFromPoint(rect.x + 10, rect.y + 10));
    })).toBe(true);
    await back(page);
    await expect(page.locator('#discover')).toBeVisible();
    await sendKeyCode(page, 428);
    await expect(page.locator('#discover')).toContainText('Titles 13–24');
    await expect(page.locator('#discover')).not.toContainText('Matching visible');
    await expect(page.locator('#discover .tm-card').first()).toHaveText('Movie 14');
});

test('TMDB 500 leaves provider artwork, facts, plot and actions intact', async ({ page }) => {
    const seen = await routes(page, { status: 500 });
    await boot(page, seed);
    await openFirst(page, 'Movies');
    await expect.poll(() => seen.length).toBe(1);
    await expect(page.locator('#detail .dt-title')).toContainText('Movie 25');
    await expect(page.locator('#detail .dt-plot')).toContainText('retired detective');
    await expect(page.locator('#detail .dt-chip')).toContainText(['Crime', 'Drama']);
    await expect(page.locator('#detail .dt-poster')).toHaveAttribute('src', /\/img\/poster.jpg$/);
    await expect(page.locator('#detail .dt-btn').first()).toContainText('Play');
    await expect(page.locator('#detail .tm-card')).toHaveCount(0);
});

test('removing a key stops enrichment and removes Discover, including after reload', async ({ page }) => {
    const seen = await routes(page);
    await boot(page, seed);
    await openFirst(page, 'Movies');
    await expect(page.locator('#detail .tm-card').first()).toBeVisible();
    await back(page);
    await setting(page, 'Remove key');
    await press(page, 'Enter');
    const count = seen.length;
    await page.reload();
    await openFirst(page, 'Movies');
    await page.waitForTimeout(500);
    expect(seen).toHaveLength(count);
    await expect(page.locator('#detail .tm-card')).toHaveCount(0);
    await back(page);
    await expect(page.locator('#categories')).not.toContainText('Discover');
});

test('YouTube trailers launch an implicit view control and never an iframe', async ({ page }) => {
    await page.addInitScript(() => {
        window.tizen = {
            ApplicationControl: function (operation, uri) { this.operation = operation; this.uri = uri; },
            application: {
                findAppControl: function (control, success) { success([{ id: 'youtube.tv', name: 'YouTube' }]); },
                launchAppControl: function (control, id) { window.launchedTrailer = { uri: control.uri, id }; },
            },
        };
    });
    await routes(page);
    await boot(page, seed);
    await openFirst(page, 'Movies');
    await expect(page.locator('#detail .dt-btn', { hasText: 'Trailer' })).toHaveCount(1);
    await moveTo(page, '#detail .dt-btn.focus', 'Trailer', 'ArrowRight');
    await press(page, 'Enter');
    await expect.poll(() => page.evaluate(() => window.launchedTrailer)).toEqual({ uri: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', id: null });
    await expect(page.locator('#detail iframe')).toHaveCount(0);
    await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, value: true });
        document.dispatchEvent(new Event('visibilitychange'));
        Object.defineProperty(document, 'hidden', { configurable: true, value: false });
        document.dispatchEvent(new Event('visibilitychange'));
        delete window.tizen;
    });
    await expect(page.locator('#detail .dt-btn.focus')).toHaveText('Trailer');
    await press(page, 'Enter');
    await expect(page.locator('#toast')).toHaveText('YouTube is not available on this TV');
    await expect(page.locator('#detail')).toBeVisible();
    await expect(page.locator('#detail .dt-btn.focus')).toHaveText('Trailer');
    await expect(page.locator('#detail iframe')).toHaveCount(0);
});

test('responses persist in the separate TMDB database and are reused after reload', async ({ page }) => {
    const seen = await routes(page);
    await boot(page, seed);
    await openFirst(page, 'Movies');
    await expect(page.locator('#detail .tm-card').first()).toBeVisible();
    const count = seen.length;
    await page.reload();
    await openFirst(page, 'Movies');
    await expect(page.locator('#detail .tm-card').first()).toBeVisible();
    expect(seen).toHaveLength(count);
    const databases = await page.evaluate(() => indexedDB.databases());
    expect(databases.some(database => database.name === 'iptvnator-tv-tmdb' && database.version === 1)).toBe(true);
});

test('key editor supports deleting characters and Return cancels without opting in', async ({ page }) => {
    const seen = await routes(page);
    await boot(page);
    await setting(page, 'TMDB API key');
    await press(page, 'Enter');
    await page.locator('#tmdb-key-entry input').fill('unfinished');
    await press(page, 'Backspace');
    await expect(page.locator('#tmdb-key-entry input')).toHaveValue('unfinishe');
    await back(page);
    await expect(page.locator('#tmdb-key-entry')).toHaveCount(0);
    await expect(page.locator('.st-row.focused .st-value')).toHaveText('Not set');
    expect(seen).toHaveLength(0);
});

test('provider TMDB id bypasses title search; late enrichment cannot replace the next detail page', async ({ page }) => {
    const seen = await routes(page, { delay: 400 });
    await page.route('**/player_api.php*', async route => {
        if (new URL(route.request().url()).searchParams.get('action') !== 'get_vod_info') return route.continue();
        const response = await route.fetch();
        const body = await response.json();
        body.info.tmdb_id = 125;
        await route.fulfill({ response, json: body });
    });
    await boot(page, seed);
    await openFirst(page, 'Movies');
    await expect.poll(() => seen.includes('/3/movie/125')).toBe(true);
    await back(page);
    await openFirst(page, 'Series');
    await expect(page.locator('#detail .dt-meta')).toContainText('8.8');
    await expect(page.locator('#detail .dt-title')).toHaveText('Show 4');
    await expect(page.locator('#detail .dt-plot')).toHaveText('A small town hides a big secret.');
    expect(seen).not.toContain('/3/search/movie');
});

test('expired IndexedDB responses refetch and a failed detail request keeps provider data', async ({ page }) => {
    const options = {};
    const seen = await routes(page, options);
    await boot(page, seed);
    await openFirst(page, 'Movies');
    await expect(page.locator('#detail .tm-card').first()).toBeVisible();
    const count = seen.length;
    await page.evaluate(() => new Promise((resolve, reject) => {
        const request = indexedDB.open('iptvnator-tv-tmdb', 1);
        request.onsuccess = () => {
            const database = request.result;
            const tx = database.transaction('responses', 'readwrite');
            const cursor = tx.objectStore('responses').openCursor();
            cursor.onsuccess = () => {
                if (!cursor.result) return;
                cursor.result.update({ ...cursor.result.value, expires: Date.now() - 1 });
                cursor.result.continue();
            };
            tx.oncomplete = () => { database.close(); resolve(); };
            tx.onerror = reject;
        };
        request.onerror = reject;
    }));
    await page.route('https://api.themoviedb.org/3/movie/**', route => route.fulfill({ status: 500, json: failure }));
    const failed = page.waitForResponse(response => response.url().includes('api.themoviedb.org/3/movie/') && response.status() === 500);
    await page.reload();
    await openFirst(page, 'Movies');
    await failed;
    await expect.poll(() => seen.length).toBeGreaterThan(count);
    await expect(page.locator('#detail .dt-plot')).toContainText('retired detective');
    await expect(page.locator('#detail .dt-chip')).toContainText(['Crime', 'Drama']);
    await expect(page.locator('#detail .tm-card')).toHaveCount(0);
});
