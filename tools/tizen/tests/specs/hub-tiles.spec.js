const { test, expect, boot, movie, channel, playing } = require('./helpers');

// The TV's application calls (#91): what the app hands to the home-screen
// service, and which tile the TV says was picked.
async function fakeTv(page) {
    await page.addInitScript(() => {
        window.__tilesSent = [];
        window.__tilePicked = null;
        window.__hubTilesPlatform = {
            launch: (text, done) => { window.__tilesSent.push(JSON.parse(text)); done(); },
            requested: () => window.__tilePicked,
        };
    });
}

function seed() {
    return { storage: {
        progress: { 'movie:2025': { position: 200, duration: 400, updatedAt: 100 } },
        'recent:s1': {
            movies: [{ ...movie(25), stream_icon: 'http://posters.test/25.jpg' }],
            live: [{ ...channel(1), stream_icon: 'http://logos.test/1.png' }],
        },
    } };
}

async function sentTiles(page) {
    await page.clock.fastForward(31_000);
    await expect.poll(() => page.evaluate(() => window.__tilesSent.length)).toBe(1);
    return page.evaluate(() => window.__tilesSent[0]);
}

test('#91 Continue watching and recent channels go to the Samsung home screen, and a picked tile resumes the movie', async ({ page }) => {
    await fakeTv(page);
    await page.clock.install();
    await boot(page, seed());
    const preview = await sentTiles(page);
    expect(preview.sections.map((part) => part.title)).toEqual(['Continue watching', 'Recently watched channels']);
    const film = preview.sections[0].tiles[0];
    expect(film).toMatchObject({ title: 'Movie 25', subtitle: '3 min left', image_url: 'http://posters.test/25.jpg', image_ratio: '16by9' });
    expect(JSON.parse(film.action_data)).toEqual({ s: 's1', sec: 'movies', key: '2025' });
    expect(preview.sections[1].tiles[0]).toMatchObject({ title: 'Channel 1 (cat all)', image_ratio: '16by9' });

    // The TV wakes the running app with the tile's action_data.
    await page.evaluate((action) => {
        window.__tilePicked = { data: [{ key: 'PAYLOAD', value: [JSON.stringify({ values: action })] }] };
        window.dispatchEvent(new Event('appcontrol'));
    }, film.action_data);
    await page.clock.resume();
    await playing(page);
    await expect(page.locator('#resume-prompt, .resume-prompt')).toHaveCount(0);
    await expect.poll(() => page.locator('#video').evaluate((v) => v.currentTime)).toBeGreaterThan(150);
});

test('#91 a channel of a locked category never becomes a tile, even while the PIN is open', async ({ page }) => {
    await fakeTv(page);
    await page.clock.install();
    await boot(page, seed());
    await page.evaluate(() => {
        ParentalLock.setPin('1234');
        ParentalLock.lock('s1', 'live', '2');
    });
    const preview = await sentTiles(page);
    expect(preview.sections.map((part) => part.title)).toEqual(['Continue watching']);
});

test('#91 Samsung home screen tiles Off leaves the home screen empty', async ({ page }) => {
    await fakeTv(page);
    await page.clock.install();
    await boot(page, { storage: { ...seed().storage, settings: { homeTiles: false } } });
    expect(await sentTiles(page)).toEqual({ sections: [] });
});
