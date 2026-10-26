const fs = require('node:fs');
const path = require('node:path');
const { test, expect, boot, section, enterItems, press, playing, back, sendKeyCode } = require('./helpers');

// The first 800 transport-stream packets (about 10 s) of the fixture: a live
// stream that plays for a while, then goes quiet without any error.
const SHORT_STREAM = fs.readFileSync(path.join(__dirname, '..', 'media', 'live.ts')).subarray(0, 188 * 800);
const TS_HEADERS = { 'content-type': 'video/mp2t', 'access-control-allow-origin': '*' };

// Production waits 1 to 15 s per try and 10 s for a stall; tests shorten both.
async function shorten(page, delays = [200, 200, 200], stallMs = 1500) {
    await page.addInitScript(({ delays, stallMs }) => {
        window.TV_TEST_RECONNECT = { delays, stallMs, stableMs: 800, checkMs: 250 };
        // Record every status the viewer could have seen, however briefly.
        window.__seen = [];
        document.addEventListener('DOMContentLoaded', () => {
            const note = () => {
                const text = document.getElementById('pl-status-text').textContent;
                const frozen = !document.getElementById('pl-freeze').classList.contains('hidden');
                const entry = text + (frozen ? ' [frame kept]' : '');
                if (text && window.__seen[window.__seen.length - 1] !== entry) window.__seen.push(entry);
            };
            new MutationObserver(note).observe(document.getElementById('player'), { subtree: true, childList: true, attributes: true, characterData: true });
        });
    }, { delays, stallMs });
}

// Counts live requests, and how many were open at the same moment.
function trackLive(page) {
    const log = { urls: [], open: 0, max: 0 };
    const isLive = (request) => request.url().includes('/live/');
    page.on('request', (request) => {
        if (!isLive(request)) return;
        log.urls.push(request.url());
        log.max = Math.max(log.max, ++log.open);
    });
    const closed = (request) => {
        if (isLive(request)) log.open--;
    };
    page.on('requestfinished', closed);
    page.on('requestfailed', closed);
    return log;
}

// Request 1 is cut short; later ones follow `then` ('pass' or 'abort').
async function dropAfterFirst(page, then) {
    const state = { served: 0, failing: then === 'abort' };
    await page.route('**/live/**', async (route) => {
        state.served++;
        if (state.served === 1) return route.fulfill({ status: 200, headers: TS_HEADERS, body: SHORT_STREAM });
        if (state.failing) return route.abort('failed');
        return route.continue();
    });
    return state;
}

async function openFirstChannel(page) {
    await boot(page);
    await section(page, 'Live TV');
    await enterItems(page);
    await press(page, 'Enter');
    await playing(page);
}

test('a live stream that stalls shows Reconnecting, keeps the last frame and resumes on one connection', async ({ page }) => {
    await shorten(page);
    const live = trackLive(page);
    await dropAfterFirst(page, 'pass');
    await openFirstChannel(page);
    await expect.poll(() => page.evaluate(() => window.__seen.join('|')), { timeout: 40_000 }).toContain('Reconnecting…');
    expect(await page.evaluate(() => window.__seen.join('|'))).toContain('Reconnecting… [frame kept]');
    await playing(page);
    await expect(page.locator('#pl-title')).toHaveText('1. Channel 1 (cat all)');
    await expect(page.locator('#pl-freeze')).toBeHidden();
    await expect(page.locator('#pl-status')).toBeHidden();
    const resumedAt = await page.locator('#video').evaluate((v) => v.currentTime);
    await expect.poll(() => page.locator('#video').evaluate((v) => v.currentTime)).toBeGreaterThan(resumedAt);
    expect(live.urls.length).toBeGreaterThanOrEqual(2);
    expect(live.max).toBe(1);
    await back(page);
    await expect(page.locator('#player')).toBeHidden();
});

test('a live stream that errors keeps failing: after the tries the Retry screen appears, and Retry playback works', async ({ page }) => {
    await shorten(page);
    const live = trackLive(page);
    const state = await dropAfterFirst(page, 'abort');
    await openFirstChannel(page);
    await expect(page.locator('#pl-status')).toHaveClass(/error/, { timeout: 40_000 });
    await expect(page.locator('#pl-status-text')).toContainText('could not reconnect');
    await expect(page.locator('#pl-error-actions')).toBeVisible();
    await expect(page.locator('#pl-error-actions button').first()).toBeFocused();
    expect(await page.evaluate(() => window.__seen.join('|'))).toContain('Reconnecting…');
    expect(live.max).toBe(1);
    // The give-up is final: nothing keeps reopening the stream behind the error.
    const settled = live.urls.length;
    await page.waitForTimeout(2500);
    expect(live.urls.length).toBe(settled);
    // The provider is back: Retry playback gets a fresh set of tries.
    state.failing = false;
    await press(page, 'Enter');
    await playing(page);
    expect(live.max).toBe(1);
});

test('Return during Reconnecting closes the player and nothing reopens the stream', async ({ page }) => {
    await shorten(page, [3000, 3000, 3000]);
    const live = trackLive(page);
    await dropAfterFirst(page, 'pass');
    await openFirstChannel(page);
    await expect(page.locator('#pl-status-text')).toContainText('Reconnecting…', { timeout: 40_000 });
    const before = live.urls.length;
    await back(page);
    await expect(page.locator('#player')).toBeHidden();
    await expect(page.locator('#pl-freeze')).toBeHidden();
    await page.waitForTimeout(4500);
    expect(live.urls.length).toBe(before);
    expect(live.max).toBe(1);
});

test('zapping during Reconnecting cancels it and plays only the new channel', async ({ page }) => {
    await shorten(page, [3000, 3000, 3000]);
    const live = trackLive(page);
    await dropAfterFirst(page, 'pass');
    await openFirstChannel(page);
    await expect(page.locator('#pl-status-text')).toContainText('Reconnecting…', { timeout: 40_000 });
    const before = live.urls.length;
    await press(page, 'ArrowUp');
    await playing(page);
    await expect(page.locator('#pl-title')).toHaveText('2. Channel 2 (cat all)');
    await page.waitForTimeout(4500);
    const after = live.urls.slice(before);
    expect(after.length).toBe(1);
    expect(after[0]).toContain('1002.ts');
    expect(live.max).toBe(1);
});

test('a movie that fails still shows the error screen at once and never reconnects', async ({ page }) => {
    await shorten(page);
    await boot(page);
    await section(page, 'Movies');
    await enterItems(page);
    await press(page, 'Enter');
    await press(page, 'Enter');
    await playing(page);
    await page.locator('#video').evaluate((v) => v.dispatchEvent(new Event('error')));
    await expect(page.locator('#pl-status')).toHaveClass(/error/);
    await expect(page.locator('#pl-status-text')).toContainText('Playback stopped.');
    await expect(page.locator('#pl-error-actions')).toBeVisible();
    expect(await page.evaluate(() => window.__seen.join('|'))).not.toContain('Reconnecting');
    await sendKeyCode(page, 10009);
    await expect(page.locator('#player')).toBeHidden();
});
