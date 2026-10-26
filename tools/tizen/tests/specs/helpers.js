const { test: base, expect } = require('@playwright/test');

// Playwright's page fixture gives every test a new context, including a new
// localStorage and IndexedDB. Reset the server's global failure switch too.
const test = base.extend({
    page: async ({ page, request }, use) => {
        await request.get('/__fail');
        try {
            await use(page);
        } finally {
            await request.get('/__fail');
        }
    },
});

const movie = (n = 25) => ({ name: 'Movie ' + n, stream_id: 2000 + n, container_extension: 'mkv' });
const show = (n = 4) => ({ name: 'Show ' + n, series_id: 3000 + n });
const channel = (n = 1) => ({ name: 'Channel ' + n + ' (cat all)', stream_id: 1000 + n, num: n, category_id: String(1 + n % 30) });

async function boot(page, seed = {}) {
    // Seed once per context; a reload must exercise the app's persisted state.
    await page.addInitScript((seed) => {
        if (localStorage.getItem('tv-tests:seeded')) return;
        const prefix = 'iptvnator-tv:';
        const sources = [{ id: 's1', type: 'xtream', name: 'Regression TV', url: location.origin, user: 'tester', pass: 'secret' }];
        localStorage.setItem(prefix + 'sources', JSON.stringify(sources));
        localStorage.setItem(prefix + 'current', JSON.stringify('s1'));
        for (const [key, value] of Object.entries(seed.storage || {})) {
            localStorage.setItem(prefix + key, JSON.stringify(value));
        }
        localStorage.setItem('tv-tests:seeded', '1');
    }, seed);
    await page.goto('/');
    await expect(page.locator('#rail .rail-item')).toHaveCount(6);
    await expect(page.locator('#source-name')).toHaveText('Regression TV');
}

async function press(page, key) {
    await page.keyboard.press(key);
    // Allow a remote key's render to settle without outrunning keyup/hold logic.
    await page.waitForTimeout(60);
}

async function sendKeyCode(page, keyCode) {
    await page.evaluate((keyCode) => document.dispatchEvent(new KeyboardEvent('keydown', { keyCode, which: keyCode, bubbles: true })), keyCode);
}

async function back(page) { await sendKeyCode(page, 10009); }

async function holdOK(page) {
    await page.keyboard.down('Enter');
    await page.waitForTimeout(800); // App's long-press threshold is 600 ms.
    await page.keyboard.up('Enter');
    await expect(page.locator('#menu')).toBeVisible();
}

async function moveTo(page, selector, text, key = 'ArrowDown', limit = 50) {
    const normalized = value => value.replace(/\s+/g, ' ').trim();
    for (let i = 0; i < limit; i++) {
        const node = page.locator(selector);
        if (await node.count() && normalized(await node.innerText()) === normalized(text)) return;
        await press(page, key);
    }
    throw new Error('Focus did not reach ' + JSON.stringify(text) + ' at ' + selector);
}

async function section(page, name) {
    // Return/LEFT through content zones until the rail owns focus.
    for (let i = 0; i < 12 && !await page.locator('#rail .focused').count(); i++) await back(page);
    await expect(page.locator('#rail .focused')).toHaveCount(1);
    const labels = await page.locator('#rail .rail-item').allTextContents();
    const current = (await page.locator('#rail .focused').innerText()).trim();
    await moveTo(page, '#rail .focused', name, labels.findIndex(t => t.trim() === name) < labels.findIndex(t => t.trim() === current) ? 'ArrowUp' : 'ArrowDown');
    await press(page, 'ArrowRight');
    if (['Live TV', 'Movies', 'Series'].includes(name)) {
        await expect(page.locator('#categories .row.focused')).toHaveCount(1);
        await expect(page.locator('#items .row, #items .card').first()).toBeVisible();
        await expect(page.locator('#items .skeleton')).toHaveCount(0);
    }
}

async function category(page, name) {
    const label = '#categories .focused .label';
    const current = (await page.locator(label).innerText()).trim();
    // Provider category 1 is selected on section entry. Virtual categories precede it.
    const virtual = ['Recently added', 'Favorites', 'Recently watched', 'Continue watching'];
    const up = virtual.includes(name) && (!virtual.includes(current) || virtual.indexOf(name) < virtual.indexOf(current));
    await moveTo(page, label, name, up ? 'ArrowUp' : 'ArrowDown');
    await expect(page.locator('#items .list-header')).toContainText(name);
    await expect(page.locator('#items .skeleton')).toHaveCount(0);
}

async function enterItems(page) {
    await press(page, 'ArrowRight');
    await expect(page.locator('#items .focused')).toHaveCount(1);
}

async function openFirst(page, name) {
    await section(page, name);
    await enterItems(page);
    await press(page, 'Enter');
    await expect(page.locator('#detail')).toBeVisible();
    await expect(page.locator('#detail .dt-meta')).not.toContainText('Loading');
}

async function menuChoice(page, label) {
    await moveTo(page, '#menu .focused', label);
    await press(page, 'Enter');
    await expect(page.locator('#menu')).toBeHidden();
}

async function toolbar(page, name) {
    // Call from the first item (or the top category).
    await press(page, 'ArrowUp');
    await expect(page.locator('#searchbar')).toHaveClass(/focused/);
    if (name !== 'search') {
        for (let i = 0; i < 4; i++) {
            const focused = page.locator('.view-btn.focused');
            if (await focused.count() && await focused.getAttribute('data-mode') === name) return;
            await press(page, 'ArrowRight');
        }
        throw new Error('Toolbar focus did not reach ' + name);
    }
}

async function playing(page) {
    await expect(page.locator('#player')).toBeVisible();
    await expect(page.locator('#pl-status')).toBeHidden({ timeout: 30_000 });
    await expect.poll(() => page.locator('#video').evaluate(v => !v.paused && v.currentTime > 0)).toBe(true);
}

async function savedProgress(page, id) {
    return page.evaluate(id => JSON.parse(localStorage.getItem('iptvnator-tv:progress') || '{}')[id], id);
}

const resumeSeed = (id = 2025) => ({ storage: {
    progress: { ['movie:' + id]: { position: 200, duration: 400, updatedAt: 100 } },
    'recent:s1': { movies: [movie(id - 2000)] },
} });

module.exports = { test, expect, boot, movie, show, channel, press, sendKeyCode, back, holdOK, moveTo, section, category, enterItems, openFirst, menuChoice, toolbar, playing, savedProgress, resumeSeed };
