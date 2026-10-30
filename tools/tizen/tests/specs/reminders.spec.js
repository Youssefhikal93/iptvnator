const { test, expect, boot, section, setting, openFirst, press, sendKeyCode, back, playing } = require('./helpers');

const MINUTE = 60000;
const focused = page => page.locator('#guide .gd-programme.focused');
const popup = page => page.locator('#reminder-popup');

async function openGuide(page) {
    await sendKeyCode(page, 458);
    await expect(focused(page)).toContainText('Program');
}

// The guide's focus on the first programme that has not started, with its details open.
async function openFutureProgramme(page) {
    await openGuide(page);
    for (let i = 0; i < 6 && Number(await focused(page).getAttribute('data-start')) <= await page.evaluate(() => Date.now()); i++) await press(page, 'ArrowRight');
    await press(page, 'Enter');
    await expect(page.locator('.gd-popup .gd-remind')).toBeVisible();
}

// A reminder for channel 3, `minutes` from now, set through the same API the guide uses.
async function remindLater(page, minutes) {
    return page.evaluate((minutes) => {
        const start = Date.now() + minutes * 60000;
        Reminders.add('s1', { name: 'Channel 3 (cat all)', stream_id: 1003, num: 3, category_id: '4' }, { title: 'Late film', start, end: start + 3600000 });
        return start;
    }, minutes);
}

async function jumpTo(page, start, beforeMs) {
    const now = await page.evaluate(() => Date.now());
    await page.clock.fastForward(Math.max(1, start - beforeMs - now));
    await page.clock.runFor(1500);
}

test('Remind me and Remove reminder in a programme\'s details mark it with a bell, and it survives a restart', async ({ page }) => {
    await boot(page);
    await section(page, 'Live TV');
    await openFutureProgramme(page);
    const start = await focused(page).getAttribute('data-start');
    await expect(page.locator('.gd-remind')).toHaveText('Remind me');
    await press(page, 'Enter');
    await expect(page.locator('.gd-remind')).toHaveText('Remove reminder');
    await expect(focused(page).locator('.gd-bell')).toHaveCount(1);
    expect(await page.evaluate(() => Reminders.list().map(entry => entry.start))).toEqual([Number(start)]);
    await back(page);
    await expect(page.locator('.gd-popup')).toBeHidden();
    await expect(focused(page).locator('.gd-bell')).toHaveCount(1);
    // A programme that is on now has no reminder to set.
    await press(page, 'ArrowLeft');
    await expect(focused(page).locator('.gd-bell')).toHaveCount(0);
    await back(page);
    await page.reload();
    await expect(page.locator('body')).toHaveAttribute('data-source', 'Regression TV');
    await section(page, 'Live TV');
    await openGuide(page);
    await expect(page.locator(`#guide .gd-programme[data-start="${start}"] .gd-bell`)).toHaveCount(1);
    await press(page, 'ArrowRight');
    await press(page, 'Enter');
    await expect(page.locator('.gd-remind')).toHaveText('Remove reminder');
    await press(page, 'Enter');
    await expect(page.locator('.gd-remind')).toHaveText('Remind me');
    await expect(page.locator('#guide .gd-bell')).toHaveCount(0);
    expect(await page.evaluate(() => Reminders.list().length)).toBe(0);
});

test('a programme that is on now or ended offers no reminder', async ({ page }) => {
    await boot(page);
    await section(page, 'Live TV');
    await openGuide(page);
    await press(page, 'ArrowLeft');
    await press(page, 'Enter');
    await expect(page.locator('.gd-popup')).toBeVisible();
    await expect(page.locator('.gd-remind')).toHaveCount(0);
    expect(await page.evaluate(() => Reminders.list().length)).toBe(0);
});

test('a pop-up shows over the player a minute before the start; Watch now switches to the channel', async ({ page }) => {
    await boot(page);
    await page.clock.install();
    await section(page, 'Live TV');
    await openGuide(page);
    await press(page, 'Enter');
    await playing(page);
    await expect(page.locator('#pl-title')).toHaveText('1. Channel 1 (cat all)');
    const start = await remindLater(page, 10);
    await jumpTo(page, start, 2 * MINUTE);
    await expect(popup(page)).toBeHidden();
    await jumpTo(page, start, 59 * 1000);
    await expect(popup(page)).toBeVisible();
    await expect(popup(page).locator('h2')).toHaveText('Late film starts on Channel 3 (cat all) in 1 min');
    await expect(popup(page).getByRole('button', { name: 'Watch now' })).toBeFocused();
    await press(page, 'Enter');
    await expect(popup(page)).toBeHidden();
    await expect(page.locator('#pl-title')).toHaveText('3. Channel 3 (cat all)');
});

test('Dismiss closes the pop-up and changes nothing; the reminder is announced once', async ({ page }) => {
    await boot(page);
    await page.clock.install();
    await section(page, 'Live TV');
    await openGuide(page);
    await press(page, 'Enter');
    await playing(page);
    const start = await remindLater(page, 10);
    await jumpTo(page, start, 59 * 1000);
    await expect(popup(page)).toBeVisible();
    await press(page, 'ArrowRight');
    await expect(popup(page).getByRole('button', { name: 'Dismiss' })).toBeFocused();
    await press(page, 'Enter');
    await expect(popup(page)).toBeHidden();
    await expect(page.locator('#pl-title')).toHaveText('1. Channel 1 (cat all)');
    await page.clock.runFor(5000);
    await expect(popup(page)).toBeHidden();
});

test('a pop-up nobody answers closes when the programme starts, and the past reminder goes', async ({ page }) => {
    await boot(page);
    await page.clock.install();
    const start = await remindLater(page, 10);
    await jumpTo(page, start, 59 * 1000);
    await expect(popup(page)).toBeVisible();
    await page.clock.runFor(61 * 1000);
    await expect(popup(page)).toBeHidden();
    expect(await page.evaluate(() => Reminders.list().length)).toBe(0);
});

test('the pop-up shows over Home and a detail page, and Return dismisses it', async ({ page }) => {
    await boot(page);
    await page.clock.install();
    await section(page, 'Home');
    const first = await remindLater(page, 10);
    await jumpTo(page, first, 59 * 1000);
    await expect(popup(page)).toBeVisible();
    await back(page);
    await expect(popup(page)).toBeHidden();
    await openFirst(page, 'Movies');
    const second = await remindLater(page, 10);
    await jumpTo(page, second, 59 * 1000);
    await expect(popup(page)).toBeVisible();
    await back(page);
    await expect(popup(page)).toBeHidden();
    await expect(page.locator('#detail')).toBeVisible();
});

test('Watch now keeps the PIN: a locked channel does not play', async ({ page }) => {
    await boot(page);
    await page.clock.install();
    await section(page, 'Live TV');
    await page.evaluate(() => {
        ParentalLock.setPin('1234');
        ParentalLock.lock('s1', 'live', '4');
    });
    const start = await remindLater(page, 10);
    await jumpTo(page, start, 59 * 1000);
    await expect(popup(page)).toBeVisible();
    await press(page, 'Enter');
    await expect(popup(page)).toBeHidden();
    await expect(page.locator('#toast')).toHaveText('This channel is not available to this profile right now');
    await expect(page.locator('#player')).toBeHidden();
});

test('the Reminders list in Settings and the guide says it works while the app is open, and removes a reminder', async ({ page }) => {
    await boot(page);
    await remindLater(page, 10);
    await setting(page, 'Reminders');
    await expect(page.locator('#settings .st-row.focused')).toContainText('1 reminder');
    await press(page, 'Enter');
    await expect(page.locator('#menu')).toContainText('Reminders only work while Jo-TV is open');
    await expect(page.locator('#menu')).toContainText('Late film');
    await expect(page.locator('#menu')).toContainText('Channel 3 (cat all)');
    await press(page, 'Enter');
    await expect(page.locator('#menu')).toContainText('No reminders yet');
    await back(page);
    await expect(page.locator('#menu')).toBeHidden();
    await expect(page.locator('#settings .st-row.focused')).toContainText('0 reminders');
    // Yellow opens the same list from the guide.
    await remindLater(page, 20);
    await section(page, 'Live TV');
    await openGuide(page);
    await sendKeyCode(page, 405);
    await expect(page.locator('#menu')).toContainText('Late film');
    await back(page);
    await expect(page.locator('#menu')).toBeHidden();
    await expect(page.locator('#guide')).toBeVisible();
});
