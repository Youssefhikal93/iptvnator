const { test, expect, boot, section, enterItems, press, sendKeyCode, playing, back, moveTo, playerGroup, channel, category } = require('./helpers');

const tiles = page => page.locator('#multi-view .mv-tile');
const tile = (page, index) => tiles(page).nth(index);

async function live(page) {
    await section(page, 'Live TV');
    await enterItems(page);
    await press(page, 'Enter');
    await playing(page);
}

async function row(page, label) {
    const labels = await page.locator('#pl-menu .pl-menu-item .label').allTextContents();
    const current = await page.locator('#pl-menu .focus .label').innerText();
    await moveTo(page, '#pl-menu .focus .label', label, labels.indexOf(label) < labels.indexOf(current) ? 'ArrowUp' : 'ArrowDown');
    await press(page, 'Enter');
}

async function choice(page, label) {
    await moveTo(page, '#menu .focused', label);
    await press(page, 'Enter');
}

async function layout(page, count) {
    await expect(page.locator('#menu .menu-title')).toHaveText('Layout');
    await expect(page.locator('#menu .menu-row')).toHaveText(['2 tiles', '3 tiles', '4 tiles']);
    await choice(page, count + ' tiles');
    await expect(tiles(page)).toHaveCount(count);
}

async function tilePlaying(page, index) {
    await expect(tile(page, index).locator('.mv-status')).toHaveCount(0, { timeout: 30000 });
    await expect.poll(() => tile(page, index).locator('video').evaluate(v => !v.paused && v.currentTime > 0)).toBe(true);
}

async function addSecond(page) {
    await press(page, 'ArrowRight');
    await press(page, 'Enter');
    await expect(page.locator('#pl-channels')).toBeVisible();
    await expect(page.locator('#pl-channels .pl-channel.focused')).toContainText('Channel 1');
    await press(page, 'ArrowDown');
    await press(page, 'Enter');
    await expect(page.locator('#pl-channels')).toBeHidden();
    await expect(tile(page, 1).locator('.mv-label')).toContainText('Channel 2');
    await tilePlaying(page, 1);
}

test('menu and Blue open layouts; focused sound, channel list, CH+, options, main, remove and Return', async ({ page }) => {
    await boot(page);
    await live(page);
    await sendKeyCode(page, 405);
    await row(page, 'Multi-view');
    await layout(page, 3);
    await tilePlaying(page, 0);
    await expect(tile(page, 0).locator('.mv-label')).toContainText('Channel 1');
    await expect(tile(page, 1)).toContainText('+ Add channel');
    await addSecond(page);
    expect(await tiles(page).locator('video').evaluateAll(videos => videos.map(v => v.muted))).toEqual([true, false, true]);
    await sendKeyCode(page, 427);
    await expect(tile(page, 1).locator('.mv-label')).toContainText('Channel 3');
    await tilePlaying(page, 1);
    await expect(tile(page, 1).locator('.mv-now')).not.toBeEmpty();
    await press(page, 'ArrowLeft');
    expect(await tiles(page).locator('video').evaluateAll(videos => videos.map(v => v.muted))).toEqual([false, true, true]);
    await press(page, 'ArrowRight');
    await expect(tile(page, 0).locator('.mv-label')).toContainText('Channel 1');
    await tilePlaying(page, 0);
    await press(page, 'Enter');
    await expect(page.locator('#menu .menu-row')).toHaveText(['Full screen', 'Change channel', 'Make main', 'Remove']);
    await choice(page, 'Make main');
    await expect(tile(page, 0)).toHaveClass(/focused/);
    await expect(tile(page, 0).locator('.mv-label')).toContainText('Channel 3');
    await tilePlaying(page, 0);
    await tilePlaying(page, 1);
    await press(page, 'ArrowRight');
    await press(page, 'Enter');
    await choice(page, 'Remove');
    await expect(tile(page, 1)).toContainText('+ Add channel');
    await press(page, 'ArrowLeft');
    await back(page);
    await expect(tiles(page)).toHaveCount(0);
    await playing(page);
    await expect(page.locator('#pl-title')).toContainText('Channel 3');
    await sendKeyCode(page, 406);
    await layout(page, 2);
    await expect(tile(page, 0)).toContainText('Channel 3');
});

test('Hold OK menu switches layout, exposes focused tracks and Help, and Leave goes full screen', async ({ page }) => {
    await boot(page);
    await live(page);
    await sendKeyCode(page, 406);
    await layout(page, 4);
    await tilePlaying(page, 0);
    await addSecond(page);
    await page.keyboard.down('Enter');
    await page.waitForTimeout(800);
    await page.keyboard.up('Enter');
    await expect(page.locator('#pl-menu')).toBeVisible();
    await expect(page.locator('#pl-menu')).toContainText('Audio');
    await expect(page.locator('#pl-menu')).toContainText('Subtitles');
    await row(page, 'Help');
    await expect(page.locator('#menu.key-help')).toContainText('Move focus and sound between tiles');
    await expect(page.locator('#menu.key-help')).toContainText('CH +/−');
    await back(page);
    await row(page, 'Layout');
    await layout(page, 2);
    await expect(tile(page, 1)).toContainText('Channel 2');
    await sendKeyCode(page, 405);
    await row(page, 'Leave multi-view');
    await playing(page);
    await expect(page.locator('#pl-title')).toContainText('Channel 2');
});

test('refusing one channel leaves other video playing; tile options retry only the failed tile', async ({ page }) => {
    await boot(page);
    await live(page);
    await sendKeyCode(page, 406);
    await layout(page, 2);
    await tilePlaying(page, 0);
    await page.route('**/live/**/1002.*', route => route.fulfill({ status: 503, body: '' }));
    await press(page, 'ArrowRight');
    await press(page, 'Enter');
    await expect(page.locator('#pl-channels .pl-channel.focused')).toContainText('Channel 1');
    await press(page, 'ArrowDown');
    await press(page, 'Enter');
    await expect(tile(page, 1)).toContainText('Provider refused (connection limit?)', { timeout: 30000 });
    await expect(tile(page, 1)).toContainText('Retry');
    const before = await tile(page, 0).locator('video').evaluate(v => v.currentTime);
    await expect.poll(() => tile(page, 0).locator('video').evaluate(v => v.currentTime)).toBeGreaterThan(before);
    await page.unroute('**/live/**/1002.*');
    await press(page, 'Enter');
    await expect(page.locator('#menu .menu-row')).toHaveText(['Retry', 'Full screen', 'Change channel', 'Make main', 'Remove']);
    await expect(page.locator('#menu .menu-row').first().locator('.menu-icon')).toBeVisible();
    await press(page, 'Enter');
    await tilePlaying(page, 1);
    await tilePlaying(page, 0);
});

test('resume restores layout and channels after reload and OK Full screen uses the focused tile', async ({ page }) => {
    await boot(page);
    await live(page);
    await sendKeyCode(page, 406);
    await layout(page, 3);
    await addSecond(page);
    await page.reload();
    await expect(page.locator('#rail .rail-item:not(.rail-search)')).toHaveCount(5);
    await live(page);
    await sendKeyCode(page, 405);
    await row(page, 'Resume multi-view');
    await expect(tiles(page)).toHaveCount(3);
    await expect(tile(page, 0)).toContainText('Channel 1');
    await expect(tile(page, 1)).toContainText('Channel 2');
    await tilePlaying(page, 0);
    await tilePlaying(page, 1);
    await press(page, 'ArrowRight');
    await press(page, 'Enter');
    await choice(page, 'Full screen');
    await playing(page);
    await expect(page.locator('#pl-title')).toContainText('Channel 2');
});

test('adding from a locked category asks for the PIN and cancelling keeps existing tiles', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { ParentalLock.setPin('1234'); ParentalLock.lock(Sources.current().id, 'live', '3'); });
    await live(page);
    await sendKeyCode(page, 406);
    await layout(page, 2);
    await tilePlaying(page, 0);
    await press(page, 'ArrowRight');
    await press(page, 'Enter');
    await expect(page.locator('#pl-channels .pl-channel.focused')).toContainText('Channel 1');
    await moveTo(page, '.pl-channel-header', '◀ get_live_categories cat 3 ▶', 'ArrowRight');
    await expect(page.locator('#pin-pad')).toBeVisible();
    await back(page);
    // A cancelled PIN says why the list is empty instead of "Loading…".
    await expect(page.locator('#pl-channels')).toContainText('Locked category');
    await expect(page.locator('#pl-channels')).not.toContainText('Loading');
    await back(page); // close the channel list
    await expect(tile(page, 1)).toContainText('+ Add channel');
    await tilePlaying(page, 0);
    await press(page, 'Enter');
    await expect(page.locator('#pl-channels .pl-channel.focused')).toContainText('Channel 1');
    await moveTo(page, '.pl-channel-header', '◀ get_live_categories cat 3 ▶', 'ArrowRight');
    for (const digit of '1234') await press(page, digit);
    await expect(page.locator('#pin-pad')).toBeHidden();
    await expect(page.locator('#pl-channels .pl-channel.focused')).toContainText('Channel 1');
    await press(page, 'Enter');
    await tilePlaying(page, 1);
});

test('CH + while picking a channel for a tile leaves the tile behind the list alone', async ({ page }) => {
    await boot(page);
    await live(page);
    await sendKeyCode(page, 406);
    await layout(page, 2);
    await tilePlaying(page, 0);
    await press(page, 'Enter');
    await choice(page, 'Change channel');
    await expect(page.locator('#pl-channels')).toBeVisible();
    await sendKeyCode(page, 427);
    await sendKeyCode(page, 427);
    await expect(page.locator('#pl-channels')).toBeVisible();
    await expect(tile(page, 0).locator('.mv-label')).toContainText('Channel 1 (cat all)');
});

test('sleep timer keeps running across multi-view and the screen saver stays off', async ({ page }) => {
    await page.clock.install();
    await boot(page, { screenSaver: true, storage: { settings: { screenSaverMs: 60000 } } });
    await live(page);
    await sendKeyCode(page, 405);
    await playerGroup(page, 'Sleep timer');
    await moveTo(page, '#pl-menu .focus span:last-child', '15 min');
    await press(page, 'Enter');
    await back(page);
    await back(page);
    await sendKeyCode(page, 406);
    await layout(page, 2);
    await addSecond(page);
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
    await page.clock.fastForward(61000);
    await expect(page.locator('#screen-saver')).toHaveCount(0);
    await sendKeyCode(page, 405);
    await playerGroup(page, 'Sleep timer');
    await expect(page.locator('#pl-menu .active')).toContainText('15 min');
    await back(page);
    await back(page);
    await page.clock.fastForward(13 * 60000);
    await expect(page.locator('#pl-sleep-warning')).toBeVisible();
    await expect(page.locator('#screen-saver')).toHaveCount(0);
    await page.clock.fastForward(60000);
    await expect(tiles(page)).toHaveCount(0);
    await expect(page.locator('#player')).toBeHidden();
    expect(await page.evaluate(() => Player.isOpen())).toBe(false);
});

test('locked resume asks before replacing playback; cancelling preserves the saved layout', async ({ page }) => {
    await boot(page);
    await live(page);
    await page.evaluate(() => {
        MultiViewStore.save(Sources.current().id, { tiles: [
            { stream_id: 1001 }, { stream_id: 1002 }, null,
        ] });
        ParentalLock.setPin('1234');
        ParentalLock.lock(Sources.current().id, 'live', '3');
    });
    const saved = await page.evaluate(() => Stored.text(ProfileStore.key('multi-view:' + Sources.current().id)));
    await sendKeyCode(page, 405);
    await row(page, 'Resume multi-view');
    await expect(page.locator('#pin-pad')).toBeVisible();
    await back(page);
    await expect(tiles(page)).toHaveCount(0);
    await playing(page);
    expect(await page.evaluate(() => Stored.text(ProfileStore.key('multi-view:' + Sources.current().id)))).toBe(saved);
    await sendKeyCode(page, 405);
    await row(page, 'Resume multi-view');
    await expect(page.locator('#pin-pad')).toBeVisible();
    for (const digit of '1234') await press(page, digit);
    await expect(tiles(page)).toHaveCount(3);
    await tilePlaying(page, 0);
    await tilePlaying(page, 1);
});

test('four HLS tiles play without AVPlay; Change channel and a smaller layout release only the dropped tile', async ({ page }) => {
    await page.route('**/live/**/*.m3u8', route => route.fulfill({
        contentType: 'application/vnd.apple.mpegurl',
        body: '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:60\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:60,\n' + route.request().url().replace('.m3u8', '.ts') + '\n#EXT-X-ENDLIST\n',
    }));
    await boot(page);
    await live(page);
    await sendKeyCode(page, 406);
    await layout(page, 4);
    await addSecond(page);
    for (const [direction, previous, next] of [['ArrowDown', 2, 3], ['ArrowLeft', 3, 4]]) {
        await press(page, direction);
        await press(page, 'Enter');
        await expect(page.locator('#pl-channels .pl-channel.focused')).toContainText('Channel ' + previous);
        await press(page, 'ArrowDown');
        await press(page, 'Enter');
        await expect(page.locator('#multi-view .focused .mv-label')).toContainText('Channel ' + next);
    }
    for (let index = 0; index < 4; index++) await tilePlaying(page, index);
    await press(page, 'ArrowRight');
    await press(page, 'Enter');
    await choice(page, 'Change channel');
    await expect(page.locator('#pl-channels .pl-channel.focused')).toContainText('Channel 3');
    await press(page, 'ArrowDown');
    await press(page, 'ArrowDown');
    await press(page, 'Enter');
    await expect(tile(page, 3)).toContainText('Channel 5');
    await tilePlaying(page, 3);
    const ids = await tiles(page).locator('video').evaluateAll(videos => videos.map(v => v.dataset.slot));
    const dropped = await tile(page, 3).locator('video').elementHandle();
    await sendKeyCode(page, 405);
    await row(page, 'Layout');
    await layout(page, 3);
    expect(await tiles(page).locator('video').evaluateAll(videos => videos.map(v => v.dataset.slot))).toEqual(ids.slice(0, 3));
    expect(await dropped.evaluate(v => v.paused && !v.getAttribute('src'))).toBe(true);
    for (let index = 0; index < 3; index++) await tilePlaying(page, index);
});

async function sheetOnTop(page) {
    return page.locator('#menu .menu-row.focused').evaluate(row => {
        const box = row.getBoundingClientRect();
        return row.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
    });
}

test('#77 round1 layout and tile sheets paint above the player', async ({ page }) => {
    await boot(page);
    await live(page);
    await sendKeyCode(page, 406);
    expect.soft(await sheetOnTop(page), 'initial layout sheet').toBe(true);
    await layout(page, 3);
    await press(page, 'Enter');
    expect.soft(await sheetOnTop(page), 'tile options sheet').toBe(true);
    await back(page);
    await sendKeyCode(page, 405);
    await row(page, 'Layout');
    expect.soft(await sheetOnTop(page), 'layout switch sheet').toBe(true);
});

test('#77 rapid real-key picks fill tiles 2 and 4 without losing a channel', async ({ page }) => {
    await boot(page);
    await live(page);
    await sendKeyCode(page, 406);
    await moveTo(page, '#menu .focused', '4 tiles');
    await press(page, 'Enter');
    await expect(tiles(page)).toHaveCount(4);
    await press(page, 'ArrowRight');
    await press(page, 'Enter');
    await expect(page.locator('#pl-channels')).toBeVisible();
    await press(page, 'ArrowDown');
    await press(page, 'Enter');
    await expect(page.locator('#pl-channels')).toBeHidden();
    await press(page, 'ArrowDown');
    await press(page, 'Enter');
    await expect(page.locator('#pl-channels')).toBeVisible();
    await press(page, 'ArrowDown');
    await press(page, 'Enter');
    await expect.poll(() => tiles(page).evaluateAll(nodes => nodes.map(node =>
        (node.classList.contains('focused') ? '*' : '') + (node.querySelector('.mv-label')
            ? node.querySelector('.mv-label').innerText.split('\n')[0] : node.innerText.trim())))).toEqual([
        'Channel 1 (cat all)', 'Channel 2 (cat 2)', '+ Add channel', '*Channel 3 (cat 2)',
    ]);
});

test('#77 Return cancels a channel pick queued while the list is loading', async ({ page }) => {
    await boot(page);
    await live(page);
    await sendKeyCode(page, 406);
    await layout(page, 4);
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const categoryRequest = response => {
        const url = new URL(response.url());
        return url.searchParams.get('action') === 'get_live_streams' && url.searchParams.get('category_id') === '2';
    };
    await page.route('**/player_api.php?**', async route => {
        if (categoryRequest(route.request())) await gate;
        await route.continue();
    });
    const requested = page.waitForRequest(categoryRequest);
    await press(page, 'ArrowRight');
    await press(page, 'Enter');
    await expect(page.locator('#pl-channels')).toBeVisible();
    await requested;
    await press(page, 'ArrowDown');
    await press(page, 'Enter');
    await back(page);
    await expect(page.locator('#pl-channels')).toBeHidden();
    const response = page.waitForResponse(categoryRequest);
    release();
    await response;
    await press(page, 'ArrowDown');
    await expect(tile(page, 1)).toContainText('+ Add channel');
    await expect(tile(page, 3)).toContainText('+ Add channel');
    await expect(page.locator('#pl-channels')).toBeHidden();
});

test('#77 round1 rapid picks keep their own target tile and channel while streams load', async ({ page }) => {
    await boot(page);
    await live(page);
    await sendKeyCode(page, 406);
    await layout(page, 4);
    // Keep both additions loading so the second cannot depend on engine readiness.
    await page.route(/\/live\/.*\/100[23]\./, async route => {
        await new Promise(resolve => setTimeout(resolve, 1500));
        await route.continue();
    });
    await press(page, 'ArrowRight');
    await press(page, 'Enter');
    await expect(page.locator('#pl-channels .focused')).toContainText('Channel 1');
    await press(page, 'ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page.locator('#pl-channels')).toBeHidden();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page.locator('#pl-channels .focused')).toContainText('Channel 2');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(tile(page, 1).locator('.mv-label')).toContainText('Channel 2');
    await expect(tile(page, 2)).toContainText('+ Add channel');
    await expect(tile(page, 3).locator('.mv-label')).toContainText('Channel 3');
    await tilePlaying(page, 1);
    await tilePlaying(page, 3);
    expect(await page.evaluate(() => MultiViewStore.read('s1').tiles)).toEqual(['1001', '1002', null, '1003']);
});

for (const sheet of ['layout', 'options', 'Help']) {
    test('#77 round1 backgrounding cancels owned ' + sheet + ' and stale actions', async ({ page }) => {
        await boot(page);
        await live(page);
        await sendKeyCode(page, 406);
        if (sheet !== 'layout') {
            await layout(page, 2);
            if (sheet === 'options') await press(page, 'Enter');
            else {
                await sendKeyCode(page, 405);
                await row(page, 'Help');
            }
        }
        await expect(page.locator('#menu')).toBeVisible();
        await page.evaluate(() => {
            Object.defineProperty(document, 'hidden', { configurable: true, value: true });
            document.dispatchEvent(new Event('visibilitychange'));
        });
        expect.soft(await page.evaluate(() => Menu.isOpen())).toBe(false);
        await page.evaluate(() => Menu.onKey(Keys.ENTER));
        await expect(tiles(page)).toHaveCount(0);
        await expect(page.locator('#player')).toBeHidden();
        expect(await page.locator('video').evaluateAll(videos => videos.every(video => video.paused))).toBe(true);
    });
}

for (const list of ['Favorites', 'My TV']) {
    test('#77 round1 focused tiles keep ' + list + ' order for zapping and the picker', async ({ page }) => {
        await boot(page, { storage: {
            'favorites:s1': { live: [channel(3), channel(1), channel(2)] },
            'channel-groups:s1': [{ id: '__group_mv', name: 'My TV', channels: [channel(3), channel(1), channel(2)] }],
        } });
        await section(page, 'Live TV');
        if (list === 'Favorites') await category(page, list);
        else {
            await moveTo(page, '#categories .focused .label', list, 'ArrowUp');
            await expect(page.locator('#items .list-header')).toContainText(list);
            await expect(page.locator('#items .skeleton')).toHaveCount(0);
        }
        await enterItems(page);
        await press(page, 'Enter');
        await playing(page);
        await sendKeyCode(page, 406);
        await layout(page, 2);
        await press(page, 'ArrowRight');
        await press(page, 'Enter');
        await expect(page.locator('.pl-channel-header')).toContainText(list);
        await expect(page.locator('#pl-channels .focused')).toContainText('Channel 3');
        await press(page, 'ArrowDown');
        await press(page, 'Enter');
        await expect(tile(page, 1)).toContainText('Channel 1');
        await press(page, 'ArrowLeft');
        await press(page, 'ArrowRight');
        await sendKeyCode(page, 427);
        await expect(tile(page, 1).locator('.mv-label')).toContainText('Channel 2');
        await press(page, 'ArrowLeft');
        await sendKeyCode(page, 427);
        await expect(tile(page, 0).locator('.mv-label')).toContainText('Channel 1');
        await expect(tile(page, 1).locator('.mv-label')).toContainText('Channel 2');
        await back(page);
        await playing(page);
        await sendKeyCode(page, 427);
        await expect(page.locator('#pl-title')).toContainText('Channel 2');
    });
}

test('#77 round1 all labels retain a visible pill over dark letterboxing', async ({ page }) => {
    await boot(page);
    await live(page);
    await sendKeyCode(page, 406);
    await layout(page, 3);
    await addSecond(page);
    const styles = await page.locator('.mv-label').evaluateAll(labels => labels.map(label => {
        const css = getComputedStyle(label);
        const rect = label.getBoundingClientRect();
        return { background: css.backgroundColor, border: css.borderTopColor,
            width: parseFloat(css.borderTopWidth), onTop: label.contains(document.elementFromPoint(rect.x + 2, rect.y + 2)) };
    }));
    expect(styles).toHaveLength(2);
    expect(styles[0]).toEqual(styles[1]);
    expect(styles[0].width, 'a visible edge separates the pill from the same dark letterbox surface').toBeGreaterThan(0);
    expect(styles[0].onTop).toBe(true);
    expect(styles[0].background).not.toBe('rgba(0, 0, 0, 0)');
});

test('#77 round1 resume resolves each saved group and Favorites order before zapping', async ({ page }) => {
    await boot(page, { storage: {
        'favorites:s1': { live: [channel(3), channel(1), channel(2)] },
        'channel-groups:s1': [{ id: '__group_mv', name: 'My TV', channels: [channel(3), channel(1), channel(2)] }],
        'p:default:multi-view:s1': { channels: ['1003', '1001'], categories: ['__group_mv', '__fav'] },
    } });
    await live(page);
    await sendKeyCode(page, 405);
    await row(page, 'Resume multi-view');
    await tilePlaying(page, 0);
    await sendKeyCode(page, 427);
    await expect(tile(page, 0).locator('.mv-label')).toContainText('Channel 1');
    await press(page, 'ArrowRight');
    await sendKeyCode(page, 428);
    await expect(tile(page, 1).locator('.mv-label')).toContainText('Channel 3');
    await expect(tile(page, 0).locator('.mv-label')).toContainText('Channel 1');
});

for (const [name, categoryId] of [['Favorites', '__fav'], ['My TV', '__group_mv']]) {
    test('#77 round2 Return from an empty first tile restores ' + name + ' zapping', async ({ page }) => {
        await boot(page, { storage: {
            'favorites:s1': { live: [channel(3), channel(1), channel(2)] },
            'channel-groups:s1': [{ id: '__group_mv', name: 'My TV', channels: [channel(3), channel(1), channel(2)] }],
            'p:default:multi-view:s1': { channels: [null, '1003'], categories: [null, categoryId] },
        } });
        await live(page);
        await sendKeyCode(page, 405);
        await row(page, 'Resume multi-view');
        await expect(tile(page, 0)).toHaveClass(/focused/);
        await expect(tile(page, 0)).toContainText('+ Add channel');
        await back(page);
        await playing(page);
        await expect(page.locator('#pl-title')).toContainText('Channel 3');
        await sendKeyCode(page, 427);
        await expect(page.locator('#pl-title')).toContainText('Channel 1');
        await playing(page);
        await press(page, 'ArrowLeft');
        await expect(page.locator('.pl-channel-header')).toContainText(name);
    });
}

test('#77 round2 sleep warning closes the initial layout picker and owns the visible dialog', async ({ page }) => {
    await page.clock.install();
    await boot(page);
    await live(page);
    await sendKeyCode(page, 405);
    await playerGroup(page, 'Sleep timer');
    await moveTo(page, '#pl-menu .focus span:last-child', '15 min');
    await press(page, 'Enter');
    await back(page);
    await back(page);
    await sendKeyCode(page, 406);
    await expect(page.locator('#menu .menu-title')).toHaveText('Layout');
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
    await page.clock.fastForward(14 * 60000);
    await expect(page.locator('#pl-sleep-warning')).toBeVisible();
    await expect(page.locator('#menu')).toBeHidden();
    expect(await page.locator('#pl-sleep-keep').evaluate(button => {
        const box = button.getBoundingClientRect();
        return button.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
    })).toBe(true);
    await press(page, 'Enter');
    await expect(page.locator('#pl-sleep-warning')).toBeHidden();
    await expect(tiles(page)).toHaveCount(0);
    await expect(page.locator('#player')).toBeVisible();
});

async function icons(page, selector) {
    const rows = page.locator(selector);
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
    await expect(rows.locator('.menu-icon')).toHaveCount(count);
    const drawn = await rows.locator('.menu-icon').evaluateAll(nodes => nodes.map(node => {
        const box = node.getBoundingClientRect();
        return { x: box.x, width: box.width, glyph: node.querySelector('svg') ? 'svg' : getComputedStyle(node, '::before').content };
    }));
    for (const icon of drawn) {
        expect(icon.width).toBeGreaterThan(0);
        expect(icon.x).toBe(drawn[0].x);
        expect(icon.glyph).not.toMatch(/^(none|normal|"")$/);
    }
}

test('#77 round2 multi-view action rows draw aligned glyph icons', async ({ page }) => {
    await boot(page, { storage: {
        'p:default:multi-view:s1': { channels: ['1001', '1002'] },
    } });
    await live(page);
    await sendKeyCode(page, 405);
    await icons(page, '#pl-menu .pl-menu-action:has-text("Multi-view"), #pl-menu .pl-menu-action:has-text("Resume multi-view")');
    await row(page, 'Multi-view');
    await icons(page, '#menu .menu-row');
    await layout(page, 3);
    await press(page, 'Enter');
    await icons(page, '#menu .menu-row');
    await back(page);
    await sendKeyCode(page, 405);
    await icons(page, '#pl-menu .pl-menu-action:has-text("Layout"), #pl-menu .pl-menu-action:has-text("Leave multi-view")');
});
