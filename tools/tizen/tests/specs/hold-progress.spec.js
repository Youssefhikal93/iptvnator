const { test, expect, boot, resumeSeed, movie, press, back, section, enterItems, playing } = require('./helpers');

// Holding OK shows a bar on the pressed card that fills until the hold fires,
// so the viewer knows when to let go; a tap leaves nothing behind.
const SHOTS = 'C:/Users/YoussefHikal/Desktop/screenshots/hold-progress/';
const bar = page => page.locator('#hold-progress.on');

// Part-way through a hold, in one look inside the page so a slow test run
// cannot outlast the hold: the bar, its fill and the box of `selector`.
function midHold(page, selector) {
    return page.evaluate((target) => new Promise((resolve) => setTimeout(() => {
        const line = document.querySelector('#hold-progress.on');
        const fill = line && line.querySelector('i');
        const card = document.querySelector(target);
        resolve({
            line: line && line.getBoundingClientRect().toJSON(),
            fill: fill ? new DOMMatrix(getComputedStyle(fill).transform).a : 0,
            box: card && card.getBoundingClientRect().toJSON(),
        });
    }, 250)), selector);
}

// Holds OK, checks the bar part-way, then waits for what the hold opens.
async function holdWithBar(page, selector, opens, shot) {
    await page.keyboard.down('Enter');
    const seen = await midHold(page, selector);
    if (shot && process.env.HOLD_SHOTS) await page.screenshot({ path: SHOTS + shot });
    expect(seen.line).not.toBeNull();
    const { line, box } = seen;
    // A thin bar inside the pressed card (its poster when it has one).
    expect(line.height).toBeLessThanOrEqual(8);
    expect(line.x).toBeGreaterThanOrEqual(box.x);
    expect(line.x + line.width).toBeLessThanOrEqual(box.x + box.width + 1);
    expect(line.y).toBeGreaterThanOrEqual(box.y);
    expect(line.y + line.height).toBeLessThanOrEqual(box.y + box.height + 1);
    // Part-filled: grown, but not at the end yet.
    expect(seen.fill).toBeGreaterThan(0.1);
    expect(seen.fill).toBeLessThan(0.95);
    await page.waitForTimeout(550);
    await expect(page.locator(opens)).toBeVisible();
    await expect(bar(page)).toHaveCount(0);
    await page.keyboard.up('Enter');
    await expect(bar(page)).toHaveCount(0);
}

function twoUnfinished() {
    const seed = resumeSeed();
    seed.storage.progress['movie:2024'] = { position: 100, duration: 400, updatedAt: 50 };
    seed.storage['recent:s1'].movies.push(movie(24));
    return seed;
}

test('holding OK on a Continue watching card fills a bar on it until its details open; a tap leaves none', async ({ page }) => {
    await boot(page, twoUnfinished());
    await press(page, 'ArrowDown');
    const card = page.locator('.hm-card.focus');
    await expect(card).toContainText('Movie 24');
    await holdWithBar(page, '.hm-card.focus .hm-poster', '#detail', 'home-continue.png');
    await back(page);
    await expect(page.locator('#detail')).toBeHidden();
    await press(page, 'Enter');
    await playing(page);
    await expect(bar(page)).toHaveCount(0);
});

test('holding OK on a movie card fills the bar until the options open; Animations Off still fills it', async ({ page }) => {
    await boot(page, { storage: { settings: { motion: 'off' } } });
    await section(page, 'Movies');
    await enterItems(page);
    const card = page.locator('#items .card.focused');
    await expect(card).toBeVisible();
    await holdWithBar(page, '#items .card.focused .poster', '#menu', 'movies-grid.png');
    await back(page);
    await expect(page.locator('#menu')).toBeHidden();
    await press(page, 'Enter');
    await expect(page.locator('#detail')).toBeVisible();
    await expect(bar(page)).toHaveCount(0);
});

test('holding OK on live TV fills a bar at the bottom of the picture until the player menu opens', async ({ page }) => {
    await boot(page);
    await section(page, 'Live TV');
    await enterItems(page);
    await press(page, 'Enter');
    await playing(page);
    await holdWithBar(page, '#player', '#pl-menu', 'live-player.png');
});
