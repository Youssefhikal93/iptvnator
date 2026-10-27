const { test, expect, boot, section, press, moveTo, openFirst, playing, back, enterItems, sendKeyCode } = require('./helpers');

const setting = (page, label) => page.locator('.st-row').filter({ has: page.locator('.st-label', { hasText: new RegExp('^' + label + '$') }) }).locator('.st-value');
const menuLabel = '#pl-menu .pl-menu-item.focus span:last-child';

test('Settings subtitle and picture rows cycle choices and survive a reload', async ({ page }) => {
    await boot(page);
    await section(page, 'Settings');
    expect((await page.locator('.st-group').allTextContents()).slice(0, 5)).toEqual(['Profiles', 'Playback', 'Subtitles', 'Picture', 'Display']);
    const scenarios = [
        ['Size', 'Medium', ['Large', 'Extra large', 'Small', 'Medium', 'Large']],
        ['Text colour', 'White', ['Yellow']],
        ['Background', 'Shadow', ['Box', 'Off', 'Shadow', 'Box']],
        ['Position', 'Bottom', ['Higher']],
        ['Aspect', 'Auto', ['Fit', 'Fill', '16:9', '4:3', 'Auto', 'Fit', 'Fill']],
    ];
    for (const [label, initial, choices] of scenarios) {
        await expect(setting(page, label)).toHaveText(initial);
        await moveTo(page, '.st-row.focused .st-label', label);
        for (const value of choices) {
            await press(page, 'Enter');
            await expect(setting(page, label)).toHaveText(value);
        }
    }
    await page.reload();
    await section(page, 'Settings');
    for (const [label, , choices] of scenarios) await expect(setting(page, label)).toHaveText(choices.at(-1));
});

test('player menu updates subtitle classes, native cues and the same Settings values immediately', async ({ page }) => {
    await boot(page);
    await openFirst(page, 'Movies');
    await press(page, 'Enter');
    await playing(page);
    // Native text tracks are the browser boundary used by HTML video and hls.js.
    await page.locator('#video').evaluate(video => {
        const track = video.addTextTrack('subtitles', 'Test subtitles', 'en');
        track.mode = 'showing';
        track.addCue(new VTTCue(video.currentTime, video.currentTime + 100, 'Visible subtitle'));
    });
    await expect.poll(() => page.locator('#video').evaluate(video => video.textTracks[0].activeCues[0]?.line)).toBe(90);
    await press(page, 'ArrowUp');
    expect((await page.locator('.pl-menu-head').allTextContents()).slice(0, 4)).toEqual(['Audio', 'Subtitles', 'Subtitle style', 'Picture']);
    for (const [before, after] of [['Size: Medium', 'Size: Large'], ['Colour: White', 'Colour: Yellow'], ['Background: Shadow', 'Background: Box'], ['Position: Bottom', 'Position: Higher'], ['Aspect: Auto', 'Aspect: Fit'], ['Aspect: Fit', 'Aspect: Fill']]) {
        await moveTo(page, menuLabel, before);
        await press(page, 'Enter');
        await expect(page.locator(menuLabel)).toHaveText(after);
    }
    await expect(page.locator('#player')).toHaveClass(/sub-size-l sub-colour-yellow sub-bg-box sub-pos-high/);
    await expect(page.locator('#video')).toHaveCSS('object-fit', 'cover');
    const cueColour = await page.evaluate(() => Array.from(document.styleSheets).flatMap(sheet => Array.from(sheet.cssRules))
        .find(rule => rule.selectorText && rule.selectorText.includes('.sub-colour-yellow video::cue')).style.color);
    expect(cueColour).toBe('rgb(255, 255, 0)');
    await expect.poll(() => page.locator('#video').evaluate(video => video.textTracks[0].activeCues[0]?.line)).toBe(75);
    await page.locator('#video').evaluate(video => {
        video.textTracks[0].addCue(new VTTCue(video.currentTime, video.currentTime + 50, 'A later cue'));
    });
    await expect.poll(() => page.locator('#video').evaluate(video => Array.from(video.textTracks[0].activeCues).map(cue => cue.line).join(','))).toBe('75,75');
    expect(await page.locator('#video').evaluate(video => video.textTracks[0].activeCues[1].snapToLines)).toBe(false);
    await moveTo(page, menuLabel, 'Position: Higher', 'ArrowUp');
    await press(page, 'Enter');
    await expect.poll(() => page.locator('#video').evaluate(video => video.textTracks[0].activeCues[0]?.line)).toBe(90);
    await back(page);
    await back(page);
    await expect(page.locator('#pl-controls')).toBeHidden();
    await back(page);
    await section(page, 'Settings');
    for (const [label, value] of [['Size', 'Large'], ['Text colour', 'Yellow'], ['Background', 'Box'], ['Position', 'Bottom'], ['Aspect', 'Fill']]) {
        await expect(setting(page, label)).toHaveText(value);
    }
});

test('live preview uses Fit and fullscreen restores the saved aspect without opening another stream', async ({ page }) => {
    let streams = 0;
    // The transport stream only: the HLS address the player asks for first is 404 here.
    page.on('request', request => { const p = new URL(request.url()).pathname; if (p.startsWith('/live/') && p.endsWith('.ts')) streams++; });
    await boot(page, { livePreview: true, storage: { settings: { pictureAspect: '4:3' } } });
    await section(page, 'Live TV');
    await enterItems(page);
    await press(page, 'Enter');
    await playing(page);
    await expect(page.locator('#player')).toHaveClass(/preview/);
    await expect(page.locator('#video')).toHaveCSS('object-fit', 'contain');
    const preview = await page.locator('#player').boundingBox();
    expect((await page.locator('#video').boundingBox()).width).toBe(preview.width);
    await press(page, 'Enter');
    await expect(page.locator('#video')).toHaveCSS('object-fit', 'fill');
    await expect(page.locator('#video')).toHaveCSS('left', '240px');
    await expect(page.locator('#video')).toHaveCSS('width', '1440px');
    await sendKeyCode(page, 405); // Yellow opens the live player menu.
    await moveTo(page, menuLabel, 'Aspect: 4:3');
    await press(page, 'Enter');
    await expect(page.locator('#video')).toHaveCSS('object-fit', 'contain');
    await expect(page.locator('#video')).toHaveCSS('left', '0px');
    await expect(page.locator('#video')).toHaveCSS('width', '1920px');
    await back(page);
    await back(page);
    await expect(page.locator('#pl-controls')).toBeHidden();
    await back(page);
    await expect(page.locator('#player')).toHaveClass(/preview/);
    await press(page, 'Enter');
    await expect(page.locator('#player')).not.toHaveClass(/preview/);
    expect(streams).toBe(1);
});

test('AVPlay applies picture choices on start and preview transitions, and styles subtitle callbacks', async ({ page }) => {
    await page.addInitScript(() => {
        // Only the Samsung SDK is substituted; the real player and Prefs run.
        const av = {
            state: 'NONE', rect: [], method: '', listener: null,
            open() { this.state = 'IDLE'; },
            close() { this.state = 'NONE'; },
            stop() { this.state = 'IDLE'; },
            play() { this.state = 'PLAYING'; },
            getState() { return this.state; },
            setListener(listener) { this.listener = listener; },
            prepareAsync(done) { this.state = 'READY'; done(); },
            setDisplayRect(...rect) { this.rect = rect; },
            setDisplayMethod(method) { this.method = method; },
            setSilentSubtitle() {},
            getDuration() { return 400000; },
            getCurrentTime() { return 1000; },
        };
        window.webapis = { avplay: av };
    });
    await boot(page, { storage: { settings: { pictureAspect: '4:3', subtitleColour: 'yellow', subtitleBackground: 'box', subtitleSize: 'l', subtitlePosition: 'high' } } });
    await openFirst(page, 'Movies');
    await press(page, 'Enter');
    await expect(page.locator('#pl-status')).toBeHidden();
    await expect(page.locator('#player')).toHaveClass(/av/);
    expect(await page.evaluate(() => webapis.avplay.rect)).toEqual([240, 0, 1440, 1080]);
    expect(await page.evaluate(() => webapis.avplay.method)).toBe('PLAYER_DISPLAY_MODE_FULL_SCREEN');
    await page.evaluate(() => webapis.avplay.listener.onsubtitlechange(10000, 'AV subtitle'));
    await expect(page.locator('#pl-subs')).toHaveText('AV subtitle');
    await expect(page.locator('#pl-subs')).toHaveCSS('font-size', '56px');
    await expect(page.locator('#pl-subs')).toHaveCSS('color', 'rgb(255, 255, 0)');
    await expect(page.locator('#pl-subs')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0.8)');
    await expect(page.locator('#pl-subs')).toHaveCSS('bottom', '380px');
    await page.evaluate(() => Player.preview({ x: 1100, y: 180, w: 640, h: 360 }));
    expect(await page.evaluate(() => webapis.avplay.rect)).toEqual([1100, 180, 640, 360]);
    expect(await page.evaluate(() => webapis.avplay.method)).toBe('PLAYER_DISPLAY_MODE_LETTER_BOX');
    await page.evaluate(() => Player.fullscreen());
    expect(await page.evaluate(() => webapis.avplay.rect)).toEqual([240, 0, 1440, 1080]);
    await back(page);
    await expect(page.locator('#pl-controls')).toBeHidden();
    await back(page);
    await press(page, 'Enter');
    await expect(page.locator('#pl-status')).toBeHidden();
    expect(await page.evaluate(() => webapis.avplay.rect)).toEqual([240, 0, 1440, 1080]);
});
