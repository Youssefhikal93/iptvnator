const { test, expect, boot, resumeSeed, movie, press, back, section, enterItems, playing } = require('./helpers');

// Holding OK shows a small ring on the pressed card that fills until the hold
// fires, so the viewer knows when to let go; a tap leaves nothing behind.
const SHOTS = 'C:/Users/YoussefHikal/Desktop/screenshots/hold-progress/';
const ring = page => page.locator('#hold-progress.on');

// Part-way through a hold, in one look inside the page so a slow test run
// cannot outlast the hold: the ring, how far its arc has filled and the box of `selector`.
function midHold(page, selector) {
    return page.evaluate((target) => new Promise((resolve) => setTimeout(() => {
        const line = document.querySelector('#hold-progress.on');
        const arc = line && line.querySelector('.hp-arc');
        const card = document.querySelector(target);
        resolve({
            line: line && line.getBoundingClientRect().toJSON(),
            fill: arc ? 1 - parseFloat(getComputedStyle(arc).strokeDashoffset) / 113.1 : 0,
            box: card && card.getBoundingClientRect().toJSON(),
        });
    }, 250)), selector);
}

// Holds OK, checks the ring part-way, then waits for what the hold opens.
async function holdWithRing(page, selector, opens, shot, corner) {
    await page.keyboard.down('Enter');
    const seen = await midHold(page, selector);
    if (shot && process.env.HOLD_SHOTS) await page.screenshot({ path: SHOTS + shot });
    expect(seen.line).not.toBeNull();
    const { line, box } = seen;
    // A small round ring inside the pressed card (its poster when it has one).
    expect(line.width).toBe(line.height);
    expect(line.width).toBeLessThanOrEqual(72);
    expect(line.x).toBeGreaterThanOrEqual(box.x);
    expect(line.x + line.width).toBeLessThanOrEqual(box.x + box.width + 1);
    expect(line.y).toBeGreaterThanOrEqual(box.y);
    expect(line.y + line.height).toBeLessThanOrEqual(box.y + box.height + 1);
    // Cards: in the top-right corner; the player: centred.
    // (A card just focused may still be growing to its focus size.)
    if (corner) {
        expect(line.y - box.y).toBeLessThanOrEqual(30);
        expect(box.x + box.width - (line.x + line.width)).toBeLessThanOrEqual(30);
    } else expect(Math.abs(line.x + line.width / 2 - (box.x + box.width / 2))).toBeLessThanOrEqual(2);
    // Part-filled: the arc has grown, but not round to the start yet.
    expect(seen.fill).toBeGreaterThan(0.1);
    expect(seen.fill).toBeLessThan(0.95);
    await page.waitForTimeout(550);
    await expect(page.locator(opens)).toBeVisible();
    await expect(ring(page)).toHaveCount(0);
    await page.keyboard.up('Enter');
    await expect(ring(page)).toHaveCount(0);
}

function twoUnfinished() {
    const seed = resumeSeed();
    seed.storage.progress['movie:2024'] = { position: 100, duration: 400, updatedAt: 50 };
    seed.storage['recent:s1'].movies.push(movie(24));
    return seed;
}

test('holding OK on a Continue watching card fills a ring on it until its details open; a tap leaves none', async ({ page }) => {
    await boot(page, twoUnfinished());
    await press(page, 'ArrowDown');
    const card = page.locator('.hm-card.focus');
    await expect(card).toContainText('Movie 24');
    await holdWithRing(page, '.hm-card.focus .hm-poster', '#detail', 'home-continue.png', true);
    await back(page);
    await expect(page.locator('#detail')).toBeHidden();
    await press(page, 'Enter');
    await playing(page);
    await expect(ring(page)).toHaveCount(0);
});

test('holding OK on a movie card fills the ring until the options open; Animations Off still fills it', async ({ page }) => {
    await boot(page, { storage: { settings: { motion: 'off' } } });
    await section(page, 'Movies');
    await enterItems(page);
    const card = page.locator('#items .card.focused');
    await expect(card).toBeVisible();
    await holdWithRing(page, '#items .card.focused .poster', '#menu', 'movies-grid.png', true);
    await back(page);
    await expect(page.locator('#menu')).toBeHidden();
    await press(page, 'Enter');
    await expect(page.locator('#detail')).toBeVisible();
    await expect(ring(page)).toHaveCount(0);
});

test('holding OK on live TV fills a larger ring near the bottom of the picture until the player menu opens', async ({ page }) => {
    await boot(page);
    await section(page, 'Live TV');
    await enterItems(page);
    await press(page, 'Enter');
    await playing(page);
    await holdWithRing(page, '#player', '#pl-menu', 'live-player.png');
});
