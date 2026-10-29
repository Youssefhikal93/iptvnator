const { test: base, expect } = require('@playwright/test');

// Playwright's page fixture gives every test a new context, including a new
// localStorage and IndexedDB. Reset the server's global failure switch too.
// Saved records are shared between their readers (Stored, #53), so every
// test also checks that no code changed one without saving it.
const test = base.extend({
    page: async ({ page, request }, use) => {
        await request.get('/__fail');
        await page.addInitScript(() => { window.__storedCheck = true; });
        try {
            await use(page);
            const drift = await page.evaluate(() => window.__storedDrift || []).catch(() => []);
            expect([...new Set(drift)], 'saved records changed without being saved').toEqual([]);
        } finally {
            await request.get('/__fail');
        }
    },
});

const movie = (n = 25) => ({ name: 'Movie ' + n, stream_id: 2000 + n, container_extension: 'mkv' });
const show = (n = 4) => ({ name: 'Show ' + n, series_id: 3000 + n });
const channel = (n = 1) => ({ name: 'Channel ' + n + ' (cat all)', stream_id: 1000 + n, num: n, category_id: String(1 + n % 30) });

async function boot(page, seed = {}) {
    // Live preview is off unless a spec opts in with { livePreview: true }, so
    // the specs that press OK on a channel keep expecting full screen.
    const storage = { ...seed.storage };
    // Keep existing grid moves and size assertions on the original density.
    storage.settings = { density: 'compact', ...storage.settings };
    if (!seed.livePreview) storage.settings = { livePreview: false, ...storage.settings };
    // The screen saver (#61) is off unless a spec opts in with { screenSaver:
    // true }, so specs that fast-forward the clock keep their next key.
    if (!seed.screenSaver) storage.settings = { screenSaverMs: 0, ...storage.settings };
    seed = { ...seed, storage };
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
    await expect(page.locator('#rail .rail-item')).toHaveCount(5);
    // Seeded with no source, the app opens Settings > Sources instead (#51).
    if (seed.storage.sources && !seed.storage.sources.length) return;
    await expect(page.locator('body')).toHaveAttribute('data-source', 'Regression TV');
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
    // A section turns on once the source's lists say it has content; requests
    // are paced, so give it a moment (a section that stays off is skipped).
    await expect(page.locator('#rail .rail-item').filter({ hasText: name })).not.toHaveClass(/disabled/, { timeout: 5000 }).catch(() => {});
    const labels = await page.locator('#rail .rail-item').allTextContents();
    const current = (await page.locator('#rail .focused').innerText()).trim();
    // The menu runs down the side or along the top (#50).
    const top = await page.locator('body.menu-top').count();
    const earlier = labels.findIndex(t => t.trim() === name) < labels.findIndex(t => t.trim() === current);
    await moveTo(page, '#rail .focused', name, top ? (earlier ? 'ArrowLeft' : 'ArrowRight') : (earlier ? 'ArrowUp' : 'ArrowDown'));
    await press(page, top ? 'ArrowDown' : 'ArrowRight');
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

// Opens the group of the player's ▲ menu whose row starts with `group` (#48).
async function playerGroup(page, group) {
    const rows = page.locator('#pl-menu .pl-menu-item');
    await expect(rows.first()).toBeVisible();
    const where = await rows.evaluateAll((items, group) => items.findIndex((item) => {
        const label = item.querySelector('.label');
        return label && label.textContent.trim().startsWith(group);
    }), group);
    if (where < 0) throw new Error('No player menu group ' + JSON.stringify(group));
    const now = await rows.evaluateAll((items) => items.findIndex((item) => item.classList.contains('focus')));
    for (let i = now; i !== where; i += where > now ? 1 : -1) await press(page, where > now ? 'ArrowDown' : 'ArrowUp');
    await expect(rows.nth(where)).toHaveClass(/focus/);
    await press(page, 'Enter');
    await expect(page.locator('#pl-menu .pl-menu-title')).toContainText(group);
}

// Opens Settings on the row labelled `label` (#49): picks its group on the
// left, then moves to the row on the right.
async function setting(page, label, settings = 'Settings') {
    await section(page, settings);
    const want = label.replace(/\s+/g, ' ').trim();
    const where = await page.locator('#settings .st-section').evaluateAll((sections, want) => {
        const text = (node) => node.textContent.replace(/\s+/g, ' ').trim();
        for (let group = 0; group < sections.length; group++) {
            const labels = [...sections[group].querySelectorAll('.st-label')].map(text);
            if (labels.includes(want)) return group;
        }
        return -1;
    }, want);
    if (where < 0) throw new Error('No Settings row ' + JSON.stringify(label));
    const now = await page.locator('#settings .st-group-item').evaluateAll((items) => items.findIndex((item) => item.classList.contains('selected')));
    for (let i = now; i !== where; i += where > now ? 1 : -1) await press(page, where > now ? 'ArrowDown' : 'ArrowUp');
    await expect(page.locator('#settings .st-group-item').nth(where)).toHaveClass(/focused/);
    await press(page, 'ArrowRight');
    await moveTo(page, '#settings .st-row.focused .st-label', want);
}

// Settings > Sources (#51): the row named `name`, or the first source.
async function sources(page, name) {
    if (name === undefined) {
        await section(page, 'Settings');
        name = await page.locator('#settings .st-source .st-label').first().innerText();
    }
    await setting(page, name);
}

// A source's options, opened with OK on its row in Settings.
async function sourceMenu(page, name) {
    await sources(page, name);
    await press(page, 'Enter');
    await expect(page.locator('#menu')).toBeVisible();
}

async function menuChoice(page, label) {
    await moveTo(page, '#menu .focused', label);
    await press(page, 'Enter');
    await expect(page.locator('#menu')).toBeHidden();
}

// On a focused Settings row, OK opens its choices (the current one ticked)
// and `value` is chosen from them.
async function choose(page, value) {
    await press(page, 'Enter');
    await expect(page.locator('#menu')).toBeVisible();
    // Where the wanted choice sits from the focused one, among the focused one's siblings.
    const steps = await page.locator('#menu .focused').evaluate((focused, value) => {
        const plain = text => text.replace(/^✓\s*/, '').replace(/\s+/g, ' ').trim();
        const options = [...focused.parentElement.children];
        const at = options.findIndex(option => plain(option.textContent) === plain(value));
        return at < 0 ? null : at - options.indexOf(focused);
    }, value);
    if (steps === null) throw new Error('No choice ' + JSON.stringify(value));
    for (let i = 0; i < Math.abs(steps); i++) await press(page, steps > 0 ? 'ArrowDown' : 'ArrowUp');
    await expect(page.locator('#menu .focused')).toHaveText(new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'));
    await press(page, 'Enter');
    await expect(page.locator('#menu')).toBeHidden();
}

// Settings row `label` set to `value`.
async function pick(page, label, value) {
    await setting(page, label);
    await choose(page, value);
}

// ▲ from the player's buttons goes to the timeline, ▲ again opens the menu.
async function playerMenu(page) {
    for (let i = 0; i < 3 && !await page.locator('#pl-menu').isVisible(); i++) await press(page, 'ArrowUp');
    await expect(page.locator('#pl-menu')).toBeVisible();
}

// Teaches the playing show its intro the way a viewer does: from `from`
// seconds, ▲ onto the timeline and ▶ ▶ (+20 s). Waits for the jump to land
// unless the page clock is held (then the caller runs it).
async function teachIntro(page, from = 15, { clock = false } = {}) {
    await page.locator('#video').evaluate((v, at) => { v.currentTime = at; }, from);
    if (!await page.locator('#pl-seekbox.focus').count()) await press(page, 'ArrowUp');
    await expect(page.locator('#pl-seekbox')).toHaveClass(/focus/);
    await press(page, 'ArrowRight');
    await press(page, 'ArrowRight');
    if (clock) await page.clock.runFor(600);
    else await page.waitForTimeout(700);
}

async function toolbar(page, name) {
    // Call from the first item (or the top category).
    await press(page, 'ArrowUp');
    await expect(page.locator('#searchbar')).toHaveClass(/focused/);
    if (name !== 'search') {
        for (let i = 0; i < 10; i++) {
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
    return page.evaluate(id => JSON.parse(localStorage.getItem(ProfileStore.key('progress:' + Sources.current().id)) || '{}')[id], id);
}

const resumeSeed = (id = 2025) => ({ storage: {
    progress: { ['movie:' + id]: { position: 200, duration: 400, updatedAt: 100 } },
    'recent:s1': { movies: [movie(id - 2000)] },
} });

module.exports = { test, expect, boot, movie, show, channel, press, sendKeyCode, back, holdOK, moveTo, section, category, enterItems, openFirst, setting, choose, pick, playerGroup, playerMenu, teachIntro, sources, sourceMenu, menuChoice, toolbar, playing, savedProgress, resumeSeed };
