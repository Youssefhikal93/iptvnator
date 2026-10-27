const { test, expect, boot, press, back, section, category, moveTo, sources, sourceMenu, openFirst, playing } = require('./helpers');

// Adds an M3U source through Settings > Sources, like a viewer would.
async function addPlaylist(page, file) {
    await boot(page);
    await sources(page, '+  Add M3U playlist');
    await press(page, 'Enter');
    await page.locator('#form-name').fill('VOD playlist');
    await page.locator('#form-url').fill(new URL(page.url()).origin + file);
    await page.locator('#form-save').click();
    await expect(page.locator('#form')).toBeHidden();
    await expect(page.locator('body')).toHaveAttribute('data-source', 'VOD playlist');
}

const railItem = (page, name) => page.locator('#rail .rail-item').filter({ hasText: name });

// Progress ids saved by this playlist are based on the stream address.
const savedIds = (page, prefix) => page.evaluate(prefix => Object.keys(JSON.parse(localStorage.getItem(ProfileStore.key('progress:' + Sources.current().id)) || '{}')).filter(id => id.startsWith(prefix)), prefix);

test('playlist with movies and episodes adds Movies and Series; live channels stay in Live TV', async ({ page }) => {
    await addPlaylist(page, '/playlist-vod.m3u');
    await expect(railItem(page, 'Movies')).not.toHaveClass(/disabled/);
    await expect(railItem(page, 'Series')).not.toHaveClass(/disabled/);
    await section(page, 'Live TV');
    await expect(page.locator('#items .count')).toHaveText('1 / 3');
    await section(page, 'Movies');
    await expect(page.locator('#items .count')).toHaveText('1 / 2');
    await expect(page.locator('#items .card-title').first()).toHaveText('Heist Night (2019)');
    await section(page, 'Series');
    await expect(page.locator('#items .count')).toHaveText('1 / 2');
    await expect(page.locator('#items .card-title')).toHaveText(['Show A', 'Show B']);
    await sourceMenu(page, 'VOD playlist');
    await expect(page.locator('#menu')).toContainText('2 movies');
    await expect(page.locator('#menu')).toContainText('2 shows');
});

test('a movie opens its detail from the playlist data, plays, seeks and saves progress', async ({ page }) => {
    await addPlaylist(page, '/playlist-vod.m3u');
    await openFirst(page, 'Movies');
    await expect(page.locator('.dt-title')).toHaveText('Heist Night (2019)');
    await expect(page.locator('.dt-meta')).toContainText('2019');
    await expect(page.locator('.dt-meta')).toContainText('Movies');
    await expect(page.locator('.dt-btn.primary')).toContainText('Play');
    await press(page, 'Enter');
    await playing(page);
    await page.locator('#video').evaluate(v => { v.currentTime = 60; });
    await expect.poll(() => page.locator('#video').evaluate(v => v.currentTime)).toBeGreaterThanOrEqual(60);
    await expect(page.locator('#pl-controls')).toBeHidden({ timeout: 10000 });
    await back(page);
    await expect(page.locator('#player')).toBeHidden();
    await expect.poll(() => savedIds(page, 'movie:m3u:')).toHaveLength(1);
    // The unfinished movie is under Continue watching and offers Resume.
    await expect(page.locator('#detail .dt-btn.primary')).toContainText('Resume from');
    await back(page);
    await press(page, 'ArrowLeft'); // ◀ from the list to the categories (Back goes to the menu, #50)
    await category(page, 'Continue watching');
    await expect(page.locator('#items .card-title')).toHaveText('Heist Night (2019)');
    await section(page, 'Home');
    await expect(page.locator('.hm-hero-title')).toHaveText('Heist Night (2019)');
});

test('a show opens with seasons, plays an episode, offers the next one and saves progress', async ({ page }) => {
    await addPlaylist(page, '/playlist-vod.m3u');
    await openFirst(page, 'Series');
    await expect(page.locator('.dt-title')).toHaveText('Show A');
    await expect(page.locator('.dt-meta')).toContainText('Series');
    await expect(page.locator('.dt-ep-pill')).toHaveText(['Season 1', 'Season 2']);
    await expect(page.locator('.dt-ep-title')).toHaveText(['1. Pilot', '2. Second']);
    await expect(page.locator('.dt-btn.primary')).toContainText('Play S1 E1');
    await press(page, 'Enter');
    await playing(page);
    await expect(page.locator('#pl-subtitle')).toContainText('S1 E1');
    await page.locator('#video').evaluate(v => { v.currentTime = 60; });
    await expect.poll(() => page.locator('#video').evaluate(v => v.currentTime)).toBeGreaterThanOrEqual(60);
    await press(page, 'ArrowDown');
    await moveTo(page, '#pl-buttons .focus', 'Next episode', 'ArrowRight');
    await press(page, 'Enter');
    await playing(page);
    await expect(page.locator('#pl-subtitle')).toContainText('S1 E2');
    await page.locator('#video').evaluate(v => { v.currentTime = 30; });
    // Under load the seek can land late; confirm it before leaving so progress saves.
    await expect.poll(() => page.locator('#video').evaluate(v => v.currentTime)).toBeGreaterThanOrEqual(30);
    await expect(page.locator('#pl-controls')).toBeHidden({ timeout: 10000 });
    await back(page);
    await expect(page.locator('#player')).toBeHidden();
    await expect.poll(() => savedIds(page, 'episode:m3u:')).toHaveLength(2);
    await expect(page.locator('#detail .dt-btn.primary')).toContainText('Continue S1 E2');
    await back(page);
    await press(page, 'ArrowLeft'); // ◀ from the list to the categories (Back goes to the menu, #50)
    await category(page, 'Continue watching');
    await expect(page.locator('#items .card-title').first()).toHaveText('Show A · S1 E2 Second');
    await section(page, 'Home');
    await expect(page.locator('.hm-hero-title')).toHaveText('Show A');
});

test('favorites work for playlist movies and shows', async ({ page }) => {
    await addPlaylist(page, '/playlist-vod.m3u');
    for (const name of ['Movies', 'Series']) {
        await openFirst(page, name);
        await moveTo(page, '#detail .dt-btn.focus', 'Add to Favorites', 'ArrowRight');
        await press(page, 'Enter');
        await expect(page.locator('#detail .dt-buttons')).toContainText('Remove from Favorites');
        await back(page);
        await press(page, 'ArrowLeft'); // ◀ from the list to the categories (Back goes to the menu, #50)
        await category(page, 'Favorites');
        await expect(page.locator('#items .card-title')).toHaveCount(1);
    }
});

test('the plain playlist still has only Live TV', async ({ page }) => {
    await addPlaylist(page, '/playlist.m3u');
    await expect(railItem(page, 'Movies')).toHaveClass(/disabled/);
    await expect(railItem(page, 'Series')).toHaveClass(/disabled/);
    await section(page, 'Live TV');
    await expect(page.locator('#items .count')).toHaveText('1 / 12');
});

test('Movies and Series come back after a restart once the playlist has loaded', async ({ page }) => {
    await addPlaylist(page, '/playlist-vod.m3u');
    await page.reload();
    await expect(page.locator('body')).toHaveAttribute('data-source', 'VOD playlist');
    await expect(railItem(page, 'Series')).not.toHaveClass(/disabled/);
    await openFirst(page, 'Movies');
    await expect(page.locator('.dt-title')).toHaveText('Heist Night (2019)');
});
