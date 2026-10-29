const { test, expect, boot, resumeSeed, movie, press, section } = require('./helpers');

// The focused item's whole ring stays visible (#56): a grown tile's ring
// (its box + 8 px) stays clear of the next tile and the row title, and a
// scrolled list stops with the ring inside its visible area.
const RING = 8;

const ringTrouble = () => {
    const el = document.querySelector('.hm-card.focus, .card.focused, .st-row.focused');
    const r = el.getBoundingClientRect();
    const ring = { left: r.left - 8, top: r.top - 8, right: r.right + 8, bottom: r.bottom + 8 };
    const name = node => node.tagName === 'H2' ? 'title' : node.className;
    const trouble = [];
    const others = [...el.parentElement.children].filter(c => c !== el);
    const title = el.parentElement.parentElement.querySelector(':scope > h2');
    if (title) others.push(title);
    for (const other of others) {
        const b = other.getBoundingClientRect();
        const x = Math.min(ring.right, b.right) - Math.max(ring.left, b.left);
        const y = Math.min(ring.bottom, b.bottom) - Math.max(ring.top, b.top);
        // Touching the title's line box is fine; reaching its text is not.
        if (x > 0 && y > (other === title ? 2 : 0)) trouble.push(`overlaps ${name(other)} by ${Math.round(x)}x${Math.round(y)}`);
    }
    for (let p = el.parentElement; p; p = p.parentElement) {
        if (getComputedStyle(p).overflowY === 'visible') continue;
        const b = p.getBoundingClientRect();
        if (ring.top < b.top || ring.bottom > b.bottom) trouble.push(`cut by ${p.id || p.className}`);
    }
    return trouble;
};

function homeSeed(density, homeLayout) {
    const seed = resumeSeed();
    seed.storage.progress['movie:2024'] = { position: 100, duration: 400, updatedAt: 50 };
    seed.storage.progress['movie:2023'] = { position: 100, duration: 400, updatedAt: 40 };
    seed.storage['recent:s1'].movies.push(movie(24), movie(23));
    seed.storage.settings = { density, homeLayout };
    return seed;
}

for (const density of ['comfortable', 'compact']) {
    test(`a big Continue watching tile and a Home row tile keep their ring clear (${density})`, async ({ page }) => {
        await boot(page, homeSeed(density, 'bigrow'));
        await expect(page.locator('.hm-card.big.focus')).toHaveCount(1);
        await expect.poll(() => page.evaluate(ringTrouble)).toEqual([]);
        await press(page, 'ArrowRight');
        await expect.poll(() => page.evaluate(ringTrouble)).toEqual([]);
        await press(page, 'ArrowDown');
        await expect(page.locator('.hm-card.focus:not(.big)')).toHaveCount(1);
        await expect.poll(() => page.evaluate(ringTrouble)).toEqual([]);
    });

    test(`a Movies grid card keeps its ring clear of its neighbours (${density})`, async ({ page }) => {
        await boot(page, { storage: { settings: { density } } });
        await section(page, 'Movies');
        await press(page, 'ArrowRight');
        await press(page, 'ArrowRight');
        await expect(page.locator('.card.focused')).toHaveCount(1);
        await expect.poll(() => page.evaluate(ringTrouble)).toEqual([]);
    });

    test(`a scrolled Settings list keeps the focused row's ring in view (${density})`, async ({ page }) => {
        await page.setViewportSize({ width: 1920, height: 1080 });
        await boot(page, { storage: { settings: { density } } });
        await section(page, 'Settings');
        // Display is the fifth group and longer than the screen.
        for (let i = 0; i < 4; i++) await press(page, 'ArrowDown');
        await press(page, 'ArrowRight');
        for (let i = 0; i < 12; i++) await press(page, 'ArrowDown');
        await expect.poll(() => page.locator('.st-panes').evaluate(p => p.scrollTop)).toBeGreaterThan(0);
        await expect.poll(() => page.evaluate(ringTrouble)).toEqual([]);
    });
}

test('the ring width the checks assume matches the focus style', async ({ page }) => {
    await boot(page);
    await section(page, 'Movies');
    await press(page, 'ArrowRight');
    const shadow = await page.locator('.card.focused').evaluate(el => getComputedStyle(el).boxShadow);
    expect(shadow).toContain(`0px 0px 0px ${RING}px`);
});
