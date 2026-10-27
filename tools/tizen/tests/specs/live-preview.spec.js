const { test, expect, boot, section, enterItems, toolbar, press, sendKeyCode, back, playing, moveTo, setting } = require('./helpers');

const ON = { livePreview: true };
const label = page => page.locator('#items .focused > .label');

// Counts the live streams the page asked for and how many are open at once.
function trackStreams(page) {
    const streams = { started: 0, open: new Set(), most: 0 };
    const closed = request => streams.open.delete(request);
    page.on('request', request => {
        // The transport stream only: the HLS address the player asks for first is 404 here.
        const pathname = new URL(request.url()).pathname;
        if (!pathname.startsWith('/live/') || !pathname.endsWith('.ts')) return;
        streams.started++;
        streams.open.add(request);
        streams.most = Math.max(streams.most, streams.open.size);
    });
    page.on('requestfinished', closed);
    page.on('requestfailed', closed);
    return streams;
}

async function isPreview(page) {
    await expect(page.locator('#player')).toHaveClass(/preview/);
    await expect(page.locator('#content')).toHaveClass(/previewing/);
    const box = await page.locator('#player').boundingBox();
    const slot = await page.locator('.lp-screen').boundingBox();
    expect(box.width).toBeLessThan(800);
    expect(Math.abs(box.x - slot.x)).toBeLessThan(2);
    expect(Math.abs(box.y - slot.y)).toBeLessThan(2);
    expect(Math.abs(box.width - slot.width)).toBeLessThan(2);
    await expect(page.locator('#pl-controls')).toBeHidden();
}

async function isFullscreen(page) {
    await expect(page.locator('#player')).not.toHaveClass(/preview/);
    await expect.poll(async () => (await page.locator('#player').boundingBox()).width).toBe(1920);
}

const videoPlaying = page => page.locator('#video').evaluate(v => !v.paused && v.currentTime > 0);

async function startPreview(page) {
    await boot(page, ON);
    await section(page, 'Live TV');
    await enterItems(page);
    await press(page, 'Enter');
    await playing(page);
    await isPreview(page);
}

test('OK previews a channel beside the list with now and next; focus keeps the stream; OK on another channel switches it', async ({ page }) => {
    const streams = trackStreams(page);
    await startPreview(page);
    await expect(page.locator('.lp-title')).toHaveText('1. Channel 1 (cat all)');
    await expect(page.locator('.lp-tag')).toHaveText(['Now', 'Next']);
    await expect(page.locator('.lp-programme')).toContainText(['1001', '1001']);
    await expect(page.locator('#items .row')).not.toHaveCount(0);
    await expect(page.locator('#player')).toHaveCount(1);
    await expect(page.locator('video')).toHaveCount(1);
    expect(streams.started).toBe(1);

    await press(page, 'ArrowDown');
    await press(page, 'ArrowDown');
    await expect(label(page)).toContainText('3. Channel 3');
    // Negative network assertion: wait beyond the list's focus debounce.
    await page.waitForTimeout(1200);
    await expect(page.locator('.lp-title')).toHaveText('1. Channel 1 (cat all)');
    expect(streams.started).toBe(1);
    expect(await videoPlaying(page)).toBe(true);

    await press(page, 'Enter');
    await expect(page.locator('.lp-title')).toHaveText('3. Channel 3 (cat all)');
    await playing(page);
    await isPreview(page);
    await expect.poll(() => streams.started).toBe(2);
    expect(streams.most).toBeLessThanOrEqual(1);
    await expect(page.locator('video')).toHaveCount(1);
});

test('second OK goes fullscreen on the same stream; Return comes back to the preview; Return stops it', async ({ page }) => {
    const streams = trackStreams(page);
    await startPreview(page);
    await press(page, 'ArrowDown');
    await press(page, 'ArrowDown');
    await press(page, 'Enter');
    await expect(page.locator('.lp-title')).toHaveText('3. Channel 3 (cat all)');
    await playing(page);
    await expect.poll(() => streams.started).toBe(2);

    await press(page, 'Enter');
    await isFullscreen(page);
    await expect(page.locator('#pl-title')).toHaveText('3. Channel 3 (cat all)');
    await expect(page.locator('#pl-controls')).toBeVisible();
    await expect(page.locator('#pl-epg .pl-epg-title')).toContainText(['1003', '1003']);
    expect(await videoPlaying(page)).toBe(true);
    // The drawer still works in fullscreen once the controls hide.
    await expect(page.locator('#pl-controls')).toBeHidden();
    await press(page, 'ArrowLeft');
    await expect(page.locator('#pl-channels')).toBeVisible();
    await back(page);
    await expect(page.locator('#pl-channels')).toBeHidden();
    await expect(page.locator('#player')).not.toHaveClass(/preview/);

    await back(page);
    await isPreview(page);
    await expect(page.locator('.lp-title')).toHaveText('3. Channel 3 (cat all)');
    await expect(label(page)).toContainText('3. Channel 3');
    expect(await videoPlaying(page)).toBe(true);
    expect(streams.started).toBe(2); // fullscreen and back never reopened the stream

    await back(page);
    await expect(page.locator('#player')).toBeHidden();
    await expect(page.locator('#content')).not.toHaveClass(/previewing/);
    expect(await page.locator('#video').evaluate(v => v.paused)).toBe(true);
    await expect(label(page)).toContainText('3. Channel 3');
    // Back from the list goes to the menu (#50).
    await back(page);
    await expect(page.locator('#rail .focused')).toHaveText('Live TV');
    await expect(page.locator('#items .focused')).toHaveCount(0);
});

test('zapping in fullscreen then Return previews the channel that was zapped to', async ({ page }) => {
    await startPreview(page);
    await press(page, 'Enter');
    await isFullscreen(page);
    await press(page, 'ArrowUp'); // channel up: next channel
    await playing(page);
    await expect(page.locator('#pl-title')).toHaveText('2. Channel 2 (cat all)');
    await back(page);
    await expect(page.locator('#pl-controls')).toBeHidden();
    await isFullscreen(page);
    expect(await videoPlaying(page)).toBe(true);
    await back(page);
    await isPreview(page);
    await expect(page.locator('.lp-title')).toHaveText('2. Channel 2 (cat all)');
    await back(page);
    await expect(page.locator('#player')).toBeHidden();
});

test('STOP in fullscreen closes the preview too', async ({ page }) => {
    await startPreview(page);
    await press(page, 'Enter');
    await isFullscreen(page);
    await sendKeyCode(page, 413);
    await expect(page.locator('#player')).toBeHidden();
    await expect(page.locator('#content')).not.toHaveClass(/previewing/);
});

test('leaving Live TV stops the preview', async ({ page }) => {
    const streams = trackStreams(page);
    await startPreview(page);
    await press(page, 'ArrowLeft');
    await press(page, 'ArrowLeft'); // list, categories, then the rail
    await expect(page.locator('#player')).toBeVisible();
    await section(page, 'Movies');
    await expect(page.locator('#player')).toBeHidden();
    await expect(page.locator('#content')).not.toHaveClass(/previewing/);
    expect(await page.locator('#video').evaluate(v => v.paused)).toBe(true);
    await section(page, 'Live TV');
    await expect(page.locator('#player')).toBeHidden();
    expect(streams.started).toBe(1);
});

test('opening the TV guide stops the preview; OK on a programme on now goes straight to fullscreen', async ({ page }) => {
    await startPreview(page);
    await sendKeyCode(page, 458);
    await expect(page.locator('#guide')).toBeVisible();
    await expect(page.locator('#player')).toBeHidden();
    await expect(page.locator('#content')).not.toHaveClass(/previewing/);
    await expect(page.locator('#guide .gd-programme.focused')).toContainText('Program');
    await press(page, 'Enter');
    await playing(page);
    await isFullscreen(page);
    await expect(page.locator('#pl-title')).toHaveText('1. Channel 1 (cat all)');
    await back(page);
    await expect(page.locator('#pl-controls')).toBeHidden();
    await back(page);
    // Opened from the guide, so Return goes back to the guide, not a preview.
    await expect(page.locator('#guide')).toBeVisible();
    await expect(page.locator('#player')).toBeHidden();
});

test('the toolbar TV guide button stops the preview as well', async ({ page }) => {
    await startPreview(page);
    await toolbar(page, 'guide');
    await press(page, 'Enter');
    await expect(page.locator('#guide')).toBeVisible();
    await expect(page.locator('#player')).toBeHidden();
});

test('hiding the app stops the preview', async ({ page }) => {
    await startPreview(page);
    await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { value: true, configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(page.locator('#player')).toBeHidden();
    await expect(page.locator('#content')).not.toHaveClass(/previewing/);
    expect(await page.locator('#video').evaluate(v => v.paused)).toBe(true);
});

test('the Live preview setting defaults On; Off sends OK straight to fullscreen', async ({ page }) => {
    await boot(page, ON);
    await setting(page, 'Live preview');
    await expect(page.locator('.st-row.focused .st-value')).toHaveText('On');
    await press(page, 'Enter');
    await expect(page.locator('.st-row.focused .st-value')).toHaveText('Off');
    await section(page, 'Live TV');
    await enterItems(page);
    await press(page, 'Enter');
    await playing(page);
    await isFullscreen(page);
    await expect(page.locator('#content')).not.toHaveClass(/previewing/);
    await back(page);
    await expect(page.locator('#pl-controls')).toBeHidden();
    await back(page);
    await expect(page.locator('#player')).toBeHidden();
    await page.reload();
    await setting(page, 'Live preview');
    await expect(page.locator('.st-row.focused .st-value')).toHaveText('Off');
});

test('the grid view has no room for a preview, so OK opens fullscreen', async ({ page }) => {
    await boot(page, { ...ON, storage: { settings: { 'view:live': 'grid' } } });
    await section(page, 'Live TV');
    await enterItems(page);
    await press(page, 'Enter');
    await playing(page);
    await isFullscreen(page);
});
