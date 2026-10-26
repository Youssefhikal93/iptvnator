const { test, expect, boot, section, enterItems, press, playing, sendKeyCode, back, channel } = require('./helpers');

test('channel drawer previews focus, switches on OK, recalls previous and returns to last watched row', async ({ page }) => {
    await boot(page);
    await section(page, 'Live TV');
    await enterItems(page);
    await press(page, 'Enter');
    await playing(page);
    await expect(page.locator('#pl-title')).toHaveText('1. Channel 1 (cat all)');
    await expect(page.locator('#pl-controls')).toBeHidden();
    await press(page, 'ArrowLeft');
    await expect(page.locator('#pl-channels')).toBeVisible();
    await expect(page.locator('.pl-channel-header')).toContainText('get_live_categories cat 2');
    await expect(page.locator('.pl-channel.focused .pl-channel-name')).toHaveText('Channel 1 (cat 2)');
    await press(page, 'ArrowDown');
    await expect(page.locator('.pl-channel.focused .pl-channel-name')).toHaveText('Channel 2 (cat 2)');
    await expect(page.locator('#pl-title')).toHaveText('1. Channel 1 (cat all)');
    await press(page, 'ArrowUp');
    await expect(page.locator('#pl-title')).toHaveText('1. Channel 1 (cat all)');
    await press(page, 'ArrowDown');
    await press(page, 'Enter');
    await playing(page);
    await expect(page.locator('#pl-title')).toHaveText('2. Channel 2 (cat 2)');
    await expect(page.locator('#pl-channels')).toBeHidden();
    await sendKeyCode(page, 404);
    await playing(page);
    await expect(page.locator('#pl-title')).toHaveText('1. Channel 1 (cat all)');
    await sendKeyCode(page, 10190);
    await playing(page);
    await expect(page.locator('#pl-title')).toHaveText('2. Channel 2 (cat 2)');
    await expect(page.locator('#pl-controls')).toBeHidden();
    await press(page, 'ArrowLeft');
    await expect(page.locator('.pl-channel.focused .pl-channel-name')).toHaveText('Channel 2 (cat 2)');
    await back(page);
    await expect(page.locator('#pl-channels')).toBeHidden();
    await expect(page.locator('#player')).toBeVisible();
    await back(page);
    await expect(page.locator('#player')).toBeHidden();
    await expect(page.locator('#items .focused > .label')).toContainText('2. Channel 2 (cat all)');
});

test('default Last channel startup opens the saved channel', async ({ page }) => {
    await boot(page, { storage: { 'last-channel:s1': channel(7) } });
    await playing(page);
    await expect(page.locator('#pl-title')).toHaveText('7. Channel 7 (cat all)');
});
