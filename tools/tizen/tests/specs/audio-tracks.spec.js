const { test, expect, boot, openFirst, press, back, playerMenu, playerGroup } = require('./helpers');

// #55: the file holds Arabic AAC 2.0, English AC-3 5.1 and English DTS 5.1
// (fixtures/audio/tracks.mkv.head). Like a Samsung TV, the fake AVPlay lists
// only the first two: it cannot decode DTS. With dts-only.mkv.head it lists
// no sound track at all, like the TV did for #54's episode.
async function samsungPlayer(page, request, file = 'tracks.mkv.head') {
    await request.get('/__fail?file=' + file);
    await page.addInitScript((dtsOnly) => {
        const extra = (info) => JSON.stringify(info);
        const sound = dtsOnly ? [] : [
            { type: 'AUDIO', index: 1, extra_info: extra({ language: 'ara', fourCC: 'AAC' }) },
            { type: 'AUDIO', index: 2, extra_info: extra({ language: 'eng', fourCC: 'AC3' }) },
        ];
        window.nativePlayback = { state: 'NONE', audio: 1, selected: [] };
        window.webapis = { avplay: {
            open: () => { nativePlayback.state = 'IDLE'; nativePlayback.audio = 1; },
            setListener: () => {},
            setDisplayRect: () => {},
            prepareAsync: success => success(),
            setSilentSubtitle: () => {},
            play: () => { nativePlayback.state = 'PLAYING'; },
            pause: () => { nativePlayback.state = 'PAUSED'; },
            getState: () => nativePlayback.state,
            getCurrentTime: () => 40000,
            getDuration: () => 3600000,
            getTotalTrackInfo: () => [{ type: 'VIDEO', index: 0, extra_info: extra({ fourCC: 'H264' }) }].concat(sound),
            getCurrentStreamInfo: () => [{ type: 'AUDIO', index: nativePlayback.audio, extra_info: '{}' }],
            setSelectTrack: (type, index) => { nativePlayback.selected.push(type + ':' + index); nativePlayback.audio = index; },
            stop: () => { nativePlayback.state = 'IDLE'; },
            close: () => { nativePlayback.state = 'NONE'; },
        } };
    }, file === 'dts-only.mkv.head');
    await boot(page);
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

test('the Audio list shows every track in the file, the DTS one marked and not selectable', async ({ page, request }) => {
    await samsungPlayer(page, request);
    await openFirst(page, 'Movies');
    await press(page, 'Enter');
    await expect(page.locator('#player')).toHaveClass(/av/);
    await expect(page.locator('#pl-status')).toBeHidden();
    await playerMenu(page);
    await playerGroup(page, 'Audio');
    await expect(choices(page)).toHaveText(['●Arabic · AAC 2.0', 'English · AC-3 5.1', 'English · DTS 5.1Not supported on this TV']);
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
    await expect(page.locator('#pl-status')).toBeHidden();
    await playerMenu(page);
    await playerGroup(page, 'Audio');
    await expect(choices(page)).toHaveText(['English · DTS 5.1Not supported on this TV']);
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
