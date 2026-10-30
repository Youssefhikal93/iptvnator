const { test, expect, boot, openFirst, press, back, playerMenu, playerGroup, moveTo, section, enterItems, sendKeyCode } = require('./helpers');

// #55: the file holds Arabic AAC 2.0, English AC-3 5.1 and English DTS 5.1
// (fixtures/audio/tracks.mkv.head). Like a Samsung TV, the fake AVPlay lists
// only the first two: it cannot decode DTS. With dts-only.mkv.head it lists
// no sound track at all, like the TV did for #54's episode.
async function samsungPlayer(page, request, file = 'tracks.mkv.head', seed = {}) {
    await request.get('/__fail?file=' + file);
    await page.addInitScript(({ dtsOnly, text }) => {
        const extra = (info) => JSON.stringify(info);
        const sound = dtsOnly ? [] : [
            { type: 'AUDIO', index: 1, extra_info: extra({ language: 'ara', fourCC: 'AAC' }) },
            { type: 'AUDIO', index: 2, extra_info: extra({ language: 'eng', fourCC: 'AC3' }) },
        ];
        window.nativePlayback = { state: 'NONE', audio: 1, text: -1, selected: [] };
        window.webapis = { avplay: {
            open: () => { nativePlayback.state = 'IDLE'; nativePlayback.audio = 1; nativePlayback.text = -1; },
            setListener: () => {},
            setDisplayRect: () => {},
            prepareAsync: success => success(),
            setSilentSubtitle: silent => { if (silent) nativePlayback.text = -1; },
            play: () => { nativePlayback.state = 'PLAYING'; },
            pause: () => { nativePlayback.state = 'PAUSED'; },
            getState: () => nativePlayback.state,
            getCurrentTime: () => 40000,
            getDuration: () => 3600000,
            getTotalTrackInfo: () => [{ type: 'VIDEO', index: 0, extra_info: extra({ fourCC: 'H264' }) }].concat(sound, text ? [{ type: 'TEXT', index: 3, extra_info: extra({ language: 'eng' }) }] : []),
            getCurrentStreamInfo: () => [{ type: 'AUDIO', index: nativePlayback.audio, extra_info: '{}' }],
            // Like AVPlay, sound can only be switched while playing (window.__strictTracks).
            setSelectTrack: (type, index) => { if (window.__strictTracks && type === 'AUDIO' && nativePlayback.state !== 'PLAYING') throw new DOMException('not playing', 'InvalidStateError'); nativePlayback.selected.push(type + ':' + index); nativePlayback[type === 'AUDIO' ? 'audio' : 'text'] = index; },
            stop: () => { nativePlayback.state = 'IDLE'; },
            close: () => { nativePlayback.state = 'NONE'; },
        } };
    }, { dtsOnly: file === 'dts-only.mkv.head', text: file === 'language-tracks.mkv.head' });
    await boot(page, seed);
}

async function playFocused(page) {
    await press(page, 'Enter');
    await expect(page.locator('#detail')).toBeVisible();
    await press(page, 'Enter');
    await expect(page.locator('#player')).toHaveClass(/av/);
    await expect(page.locator('#pl-status')).toBeHidden();
}

const choices = page => page.locator('#pl-menu .pl-menu-item');
const selected = page => page.evaluate(() => nativePlayback.selected.slice());

for (const scenario of [
    { name: 'preferred sound overrides last', sound: 'en', subtitles: '', expected: ['AUDIO:2'] },
    { name: 'preferred subtitles select a file track', sound: '', subtitles: 'en', expected: ['TEXT:3'] },
    { name: 'Off leaves file subtitles off', sound: '', subtitles: '', expected: [] },
]) {
    test('#60 ' + scenario.name, async ({ page, request }) => {
        const providerRequests = [];
        page.on('request', req => {
            if (/opensubtitles|subdl|subsource|deepl/.test(new URL(req.url()).hostname)) providerRequests.push(req.url());
        });
        await samsungPlayer(page, request, 'language-tracks.mkv.head', { storage: {
            settings: { preferredSound: scenario.sound, preferredSubtitles: { language: scenario.subtitles, when: 'always' } },
            'audio-choice': { shows: {}, last: 'ar' },
        } });
        await openFirst(page, 'Movies');
        await press(page, 'Enter');
        await expect(page.locator('#player')).toHaveClass(/av/);
        await expect(page.locator('#pl-status')).toBeHidden();
        expect(await selected(page)).toEqual(scenario.expected);
        expect(await page.evaluate(() => nativePlayback.text)).toBe(scenario.subtitles ? 3 : -1);
        expect(providerRequests).toEqual([]);
    });
}

test('#60 a show pick beats preferred sound for the next episode', async ({ page, request }) => {
    await samsungPlayer(page, request, 'tracks.mkv.head', { storage: { settings: { preferredSound: 'en' } } });
    await page.evaluate(async () => {
        const episodes = { show: 's1|3001', index: 1, items: [{ title: 'First', season: 1 }, { title: 'Next', season: 1 }] };
        AudioChoice.remember({ episodes }, 'ar');
        await Player.play({ id: 'episode:2', title: 'Next episode', episodes,
            sources: [{ via: 'avplay', url: location.origin + '/series/tester/secret/4002.mkv' }] });
    });
    await expect(page.locator('#player')).toHaveClass(/av/);
    await expect(page.locator('#pl-status')).toBeHidden();
    expect(await selected(page)).toEqual([]);
    expect(await page.evaluate(() => nativePlayback.audio)).toBe(1);
});

test('the Audio list shows every track in the file, the DTS one marked and not selectable', async ({ page, request }) => {
    await samsungPlayer(page, request);
    await openFirst(page, 'Movies');
    await press(page, 'Enter');
    await expect(page.locator('#player')).toHaveClass(/av/);
    await expect(page.locator('#pl-status')).toBeHidden();
    await playerMenu(page);
    await playerGroup(page, 'Audio');
    await expect(choices(page)).toHaveText(['●Arabic · AAC 2.0', 'English · AC-3 5.1', 'English · DTS 5.1Not supported on this TV', 'Converted sound (provider)']);
    await expect(choices(page).nth(2)).toHaveClass(/unavailable/);
    await expect(choices(page).nth(0)).toHaveClass(/active/);

    // OK on the DTS track changes nothing.
    await press(page, 'ArrowDown');
    await press(page, 'ArrowDown');
    await expect(choices(page).nth(2)).toHaveClass(/focus/);
    await press(page, 'Enter');
    expect(await selected(page)).toEqual([]);
    await expect(choices(page).nth(0)).toHaveClass(/active/);

    // English AC-3 switches AVPlay's track.
    await press(page, 'ArrowUp');
    await press(page, 'Enter');
    expect(await selected(page)).toEqual(['AUDIO:2']);
    await expect(choices(page).nth(1)).toHaveClass(/active/);
});

test('a file whose only sound is DTS shows that track as unsupported, not "Only one audio track"', async ({ page, request }) => {
    await samsungPlayer(page, request, 'dts-only.mkv.head');
    await openFirst(page, 'Movies');
    await press(page, 'Enter');
    await expect(page.locator('#player')).toHaveClass(/av/);
    // The provider's converted addresses have no sound either here (#54): 4 s each.
    await expect(page.locator('#pl-status')).toBeHidden({ timeout: 20_000 });
    await playerMenu(page);
    await playerGroup(page, 'Audio');
    await expect(choices(page)).toHaveText(['English · DTS 5.1Not supported on this TV', 'Converted sound (provider)']);
    await expect(page.locator('#pl-menu .pl-menu-empty')).toHaveCount(0);
});

test('the language picked last is where the next movie starts', async ({ page, request }) => {
    await samsungPlayer(page, request);
    await openFirst(page, 'Movies');
    await press(page, 'Enter');
    await expect(page.locator('#player')).toHaveClass(/av/);
    await expect(page.locator('#pl-status')).toBeHidden();
    await playerMenu(page);
    await playerGroup(page, 'Audio');
    await press(page, 'ArrowDown');
    await press(page, 'Enter');
    expect(await selected(page)).toEqual(['AUDIO:2']);

    // Back to the grid and on to another movie.
    for (let i = 0; i < 6 && await page.locator('#player').isVisible(); i++) await back(page);
    await expect(page.locator('#player')).toBeHidden();
    await back(page);
    await expect(page.locator('#detail')).toBeHidden();
    await press(page, 'ArrowRight');
    await playFocused(page);
    expect(await selected(page)).toEqual(['AUDIO:2', 'AUDIO:2']);
    await playerMenu(page);
    await playerGroup(page, 'Audio');
    await expect(choices(page).nth(1)).toHaveClass(/active/);
});

test('#60 preferred sound is switched once AVPlay plays, as AVPlay refuses it before', async ({ page, request }) => {
    await page.addInitScript(() => { window.__strictTracks = true; });
    await samsungPlayer(page, request, 'language-tracks.mkv.head', { storage: {
        settings: { preferredSound: 'en', preferredSubtitles: { language: '', when: 'always' } },
        'audio-choice': { shows: {}, last: 'ar' },
    } });
    await openFirst(page, 'Movies');
    await press(page, 'Enter');
    await expect(page.locator('#player')).toHaveClass(/av/);
    await expect(page.locator('#pl-status')).toBeHidden();
    await expect.poll(() => selected(page)).toEqual(['AUDIO:2']);
});

for (const subtitlesOff of [false, true]) {
    test('#83 show subtitles ' + (subtitlesOff ? 'Off' : 'language') + ' follow Next and later visits', async ({ page, request }) => {
        await samsungPlayer(page, request, 'language-tracks.mkv.head', { storage: {
            settings: { preferredSubtitles: { language: subtitlesOff ? 'en' : '', when: 'always' } },
        } });
        await openFirst(page, 'Series');
        await press(page, 'Enter');
        await expect(page.locator('#pl-status')).toBeHidden();
        await expect(page.locator('#pl-subtitle')).toContainText('S1 E1');
        await playerMenu(page);
        await playerGroup(page, 'Subtitles');
        await press(page, subtitlesOff ? 'ArrowUp' : 'ArrowDown');
        await press(page, 'Enter');
        await expect(choices(page).nth(subtitlesOff ? 0 : 1)).toHaveClass(/active/);
        await back(page);
        await back(page);
        await press(page, 'ArrowDown');
        await moveTo(page, '#pl-buttons .focus', 'Next', 'ArrowRight');
        await press(page, 'Enter');
        await expect(page.locator('#pl-subtitle')).toContainText('S1 E2');
        await expect(page.locator('#pl-status')).toBeHidden();
        expect(await page.evaluate(() => nativePlayback.text)).toBe(subtitlesOff ? -1 : 3);
        await page.reload();
        await expect(page.locator('#rail .rail-item')).toHaveCount(5);
        await openFirst(page, 'Series');
        await press(page, 'Enter');
        await expect(page.locator('#pl-status')).toBeHidden();
        expect(await page.evaluate(() => nativePlayback.text)).toBe(subtitlesOff ? -1 : 3);
    });
}

test('#83 live audio and subtitles belong to the channel and Off survives a restart', async ({ page, request }) => {
    // Force the Samsung route for live too; the fake device never opens a real stream.
    await page.addInitScript(() => Object.defineProperty(window, 'Hls', { get: () => undefined, set: () => {} }));
    await samsungPlayer(page, request, 'language-tracks.mkv.head');
    await section(page, 'Live TV');
    await enterItems(page);
    await press(page, 'Enter');
    await expect(page.locator('#player')).toHaveClass(/av/);
    await expect(page.locator('#pl-status')).toBeHidden();
    await sendKeyCode(page, 405);
    // The catch-up row arrives late and redraws the menu.
    await expect(choices(page).first()).toContainText('Start over');
    await playerGroup(page, 'Audio');
    await press(page, 'ArrowDown');
    await press(page, 'Enter');
    await expect(choices(page).nth(1)).toHaveClass(/active/);
    expect(await page.evaluate(() => nativePlayback.audio)).toBe(2);
    await back(page);
    await playerGroup(page, 'Subtitles');
    await press(page, 'ArrowDown');
    await press(page, 'Enter');
    expect(await page.evaluate(() => [nativePlayback.audio, nativePlayback.text])).toEqual([2, 3]);
    await sendKeyCode(page, 405);
    await sendKeyCode(page, 427);
    await expect(page.locator('#pl-title')).toContainText('2. Channel 2');
    await expect(page.locator('#pl-status')).toBeHidden();
    expect(await page.evaluate(() => [nativePlayback.audio, nativePlayback.text])).toEqual([1, -1]);
    await sendKeyCode(page, 404);
    await expect(page.locator('#pl-title')).toContainText('1. Channel 1');
    await expect(page.locator('#pl-status')).toBeHidden();
    expect(await page.evaluate(() => [nativePlayback.audio, nativePlayback.text])).toEqual([2, 3]);
    await sendKeyCode(page, 405);
    await playerGroup(page, 'Subtitles');
    await press(page, 'ArrowUp');
    await press(page, 'Enter');
    await page.reload();
    await expect(page.locator('#player')).toHaveClass(/av/);
    await expect(page.locator('#pl-status')).toBeHidden();
    expect(await page.evaluate(() => [nativePlayback.audio, nativePlayback.text])).toEqual([2, -1]);
});
