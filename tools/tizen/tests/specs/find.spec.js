const { test, expect, boot, section, press, moveTo, enterItems, toolbar, menuChoice } = require('./helpers');

// Search everything (#31): the icon at the top right of Home opens a bar;
// the results take the place of the rows, movies first.
test('Home search shows movies, series and Live TV results and Return closes it', async ({ page }) => {
    await boot(page);
    await expect(page.locator('.hm-search-icon')).toBeVisible();
    await press(page, 'ArrowUp');
    await expect(page.locator('.hm-search-icon')).toHaveClass(/focus/);
    await press(page, 'Enter');
    await expect(page.locator('.hm-search-bar')).toHaveClass(/typing/);
    await expect(page.locator('.hm-search-note')).toHaveText('Type a movie, series or channel name.');
    await page.keyboard.type('1');
    await press(page, 'Enter');
    const rows = page.locator('#home .hm-row');
    await expect(rows.locator('h2')).toHaveText(['Movies', 'Series', 'Live TV']);
    // Titles that start with the query come first; the focus is on them.
    await expect(page.locator('#home .hm-card.focus > span')).toHaveText('Movie 1');
    await press(page, 'Enter');
    await expect(page.locator('#detail')).toContainText('Movie 1');
    await press(page, 'Escape');
    await expect(page.locator('.hm-search-bar')).toBeVisible();
    await press(page, 'Escape');
    await expect(page.locator('.hm-search')).toHaveCount(0);
    await expect(page.locator('.hm-search-icon')).toBeVisible();
});

// Recently added holds every title; the genre button opens the menu.
async function genre(page, section_, name) {
    await section(page, section_);
    await moveTo(page, '#categories .row.focused .label', 'Recently added', 'ArrowUp');
    await enterItems(page);
    await toolbar(page, 'genre');
    await press(page, 'Enter');
    await expect(page.locator('#menu')).toBeVisible();
    if (name) await menuChoice(page, name);
}

test('the genre button beside the Series search bar narrows the list; Arabic and English names are one genre', async ({ page }) => {
    await boot(page);
    await genre(page, 'Series');
    await expect(page.locator('#menu')).toContainText('All');
    await expect(page.locator('#menu')).toContainText('Drama');
    await expect(page.locator('#menu')).not.toContainText('دراما');
    await menuChoice(page, 'Drama');
    // Show 2 is a Comedy; Show 1 is Drama in Arabic.
    const names = await page.locator('#items .card .card-title, #items .row .label').allTextContents();
    expect(names.length).toBe(10);
    expect(names).toContain('Show 1');
    expect(names).not.toContain('Show 2');
    await expect(page.locator('#genre-button')).toHaveClass(/chosen/);
    await expect(page.locator('#genre-button')).toContainText('Drama');
    // The menu marks the genre in use; All clears it.
    await toolbar(page, 'genre');
    await press(page, 'Enter');
    await expect(page.locator('#menu .focused')).toContainText('\u2713 Drama');
    await moveTo(page, '#menu .focused', 'All', 'ArrowUp');
    await press(page, 'Enter');
    await expect(page.locator('#genre-button')).not.toHaveClass(/chosen/);
});

// TMDB is on and says the odd-numbered movies are Thrillers; it is asked
// one title at a time and remembers what it said.
async function tmdbThrillers(page) {
    await page.evaluate(() => {
        const said = {};
        window.tmdbAsked = 0;
        Tmdb.enabled = () => true;
        Tmdb.cached = (item) => said[item.name] || null;
        Tmdb.match = (item) => {
            window.tmdbAsked++;
            const n = Number(String(item.name).replace(/\D/g, ''));
            said[item.name] = { genres: [{ id: n % 2 ? 53 : 18, name: n % 2 ? 'Thriller' : 'Drama' }] };
            return Promise.resolve(said[item.name]);
        };
    });
}

test('a picked genre checks the open list with TMDB twenty titles at a time and never asks the provider', async ({ page }) => {
    let pages = 0;
    page.on('request', req => { if (new URL(req.url()).searchParams.get('action') === 'get_vod_info') pages++; });
    await boot(page);
    await tmdbThrillers(page);
    await genre(page, 'Movies', 'Thriller');
    // Recently added has 24 movies; the first twenty are checked.
    await expect(page.locator('#status')).toContainText('check 20 more (4 left)', { timeout: 30000 });
    expect(await page.evaluate(() => window.tmdbAsked)).toBe(20);
    const first = await page.locator('#items .list-header .count').innerText();
    // ▼ past the last row checks the other four.
    for (let i = 0; i < 4; i++) await press(page, 'ArrowDown');
    await expect(page.locator('#status')).not.toContainText('check 20 more', { timeout: 30000 });
    expect(await page.evaluate(() => window.tmdbAsked)).toBe(24);
    expect(await page.locator('#items .list-header .count').innerText()).not.toBe(first);
    expect(pages).toBe(0);
});

test('without TMDB the genre menu offers only the genres the provider lists carry', async ({ page }) => {
    await boot(page);
    // The fake movie list has no genres: no genre button in Movies.
    await section(page, 'Movies');
    await enterItems(page);
    await press(page, 'ArrowUp');
    await expect(page.locator('#genre-button')).toBeHidden();
    // Series lists carry genres: the button is there.
    await section(page, 'Series');
    await enterItems(page);
    await press(page, 'ArrowUp');
    await expect(page.locator('#genre-button')).toBeVisible();
});

test('a provider that answers 429 is left alone: no retries every few seconds', async ({ page }) => {
    let calls = 0;
    await boot(page);
    await page.route(/action=get_series_categories/, (route) => {
        calls++;
        return route.fulfill({ status: 429, body: 'Too Many Requests' });
    });
    // Open Series by hand: its categories never load here.
    for (let i = 0; i < 12 && !await page.locator('#rail .focused').count(); i++) await press(page, 'Escape');
    await moveTo(page, '#rail .focused', 'Series', 'ArrowDown');
    await press(page, 'ArrowRight');
    await expect(page.locator('#load-message')).toHaveText('Too many requests');
    await expect(page.locator('#load-countdown')).toContainText(/Retrying in (59|60) s/);
    await page.waitForTimeout(6000);
    expect(calls).toBe(1);
});

test('a genre typed in a search finds titles of that genre, in English or Arabic', async ({ page }) => {
    await boot(page);
    await section(page, 'Series');
    await enterItems(page);
    await toolbar(page, 'search');
    await press(page, 'Enter');
    await page.keyboard.type('comedy');
    await press(page, 'Enter');
    // Show 2, 5, 8, 11 and 14 are the Comedy shows.
    const names = page.locator('#items .card .card-title, #items .row .label');
    await expect(names).toHaveCount(5);
    await expect(names.first()).toContainText('Show');
    // From Home: the Arabic name finds the same Drama shows as Drama.
    await section(page, 'Home');
    await press(page, 'ArrowUp');
    await press(page, 'Enter');
    await page.keyboard.type('دراما');
    await press(page, 'Enter');
    await expect(page.locator('#home .hm-row h2')).toHaveText(['Series']);
    await expect(page.locator('#home .hm-row .hm-aside')).toContainText('10');
});
