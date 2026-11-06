// #102: the player's Intro group sets a season's intro by hand and turns the
// show's Skip intro button off.
const { test, expect, boot, openFirst, press, sendKeyCode, back, playing, playerMenu, playerGroup, teachIntro, learntIntro } = require('./helpers');

const skip = page => page.locator('#pl-skip');
const rows = page => page.locator('#pl-menu .pl-menu-rows .pl-menu-item');
const focused = page => page.locator('#pl-menu .pl-menu-item.focus');
const pills = page => page.locator('#pl-menu .pl-menu-pill');
const seek = (page, at) => page.locator('#video').evaluate((v, t) => { v.pause(); v.currentTime = t; }, at);
const digits = async (page, text) => { for (const d of text) await sendKeyCode(page, 48 + Number(d)); };

async function introMenu(page) {
    await playerMenu(page);
    await playerGroup(page, 'Intro');
}

async function startShow(page) {
    await boot(page);
    await openFirst(page, 'Series');
    await press(page, 'Enter');
    await playing(page);
    await seek(page, 60);
}

test('the times are set by hand on the pills, kept over a skip, and Skip intro shows there', async ({ page }) => {
    await startShow(page);
    await playerMenu(page);
    await expect(page.locator('#pl-menu .pl-menu-group', { hasText: 'Intro' }).locator('.value')).toHaveText('Not set');
    await playerGroup(page, 'Intro');
    await expect(rows(page)).toHaveCount(3);
    await expect(focused(page)).toContainText('Skip intro button');
    await expect(rows(page).nth(1)).toContainText('Skip the intro with ▶ or set the times');
    await expect(pills(page)).toHaveText(['Starts --:--', 'Ends --:--']);

    // Starts: OK opens it, 0–9 type 01:30, OK keeps it until Ends is set.
    await press(page, 'ArrowDown');
    await expect(page.locator('#pl-menu .pl-menu-keys')).toContainText('OK: edit');
    await press(page, 'Enter');
    await expect(page.locator('#pl-menu .pl-menu-pill.editing')).toHaveCount(1);
    await digits(page, '0130');
    await press(page, 'Enter');
    await expect(pills(page).first()).toHaveText('Starts 01:30');
    await expect(rows(page).nth(1)).toContainText('Now set Ends');
    expect(await learntIntro(page)).toBe(0);

    // The focus moved on to Ends, which opens on 01:30; ▶ to the next digit and ▲ make it 02:30.
    await expect(page.locator('#pl-menu .pl-menu-pill.focus')).toHaveText('Ends --:--');
    await press(page, 'Enter');
    await press(page, 'ArrowRight');
    await press(page, 'ArrowUp');
    await expect(page.locator('#pl-menu .pl-menu-pill.editing')).toHaveText(/Ends\s*0\s*2\s*:\s*3\s*0/);
    await press(page, 'Enter');
    await expect(pills(page)).toHaveText(['Starts 01:30', 'Ends 02:30']);
    await expect(rows(page).nth(1)).toContainText('Season 1 · Set by you');
    expect(await learntIntro(page)).toEqual({ from: 90000, to: 150000, hand: true });

    // A skip by hand no longer changes the season.
    await back(page);
    await back(page);
    await expect(page.locator('#pl-menu')).toBeHidden();
    await teachIntro(page, 15);
    expect(await learntIntro(page)).toEqual({ from: 90000, to: 150000, hand: true });
    // The button shows from 1:30.
    await seek(page, 91);
    await expect(skip(page)).toBeVisible();
});

test('Ends before Starts is not saved, and Return leaves a pill as it was', async ({ page }) => {
    await startShow(page);
    await introMenu(page);
    await press(page, 'ArrowDown');
    await press(page, 'Enter');
    await digits(page, '0200');
    await press(page, 'Enter');
    await press(page, 'ArrowRight');
    await press(page, 'Enter');
    await digits(page, '0100');
    await press(page, 'Enter');
    await expect(page.locator('#toast')).toContainText('Ends must be after Starts');
    await expect(page.locator('#pl-menu .pl-menu-pill.editing')).toHaveCount(1);
    await back(page);
    await expect(page.locator('#pl-menu .pl-menu-pill.editing')).toHaveCount(0);
    await expect(pills(page)).toHaveText(['Starts 02:00', 'Ends --:--']);
    expect(await learntIntro(page)).toBe(0);
});

test('a start past the learnt end moves on to Ends, and both are kept as set by hand', async ({ page }) => {
    await startShow(page);
    await teachIntro(page, 15);
    await seek(page, 60);
    await introMenu(page);
    await expect(pills(page)).toHaveText(['Starts 00:15', 'Ends 00:35']);
    await press(page, 'ArrowDown');
    await press(page, 'Enter');
    await digits(page, '0100');
    await press(page, 'Enter');
    await expect(pills(page)).toHaveText(['Starts 01:00', 'Ends 00:35']);
    await expect(page.locator('#pl-menu .pl-menu-pill.focus')).toHaveText('Ends 00:35');
    await expect(rows(page).nth(1)).toContainText('Now set Ends');
    expect(await learntIntro(page)).toEqual({ from: 15000, to: 35000 });
    await press(page, 'Enter');
    await digits(page, '0140');
    await press(page, 'Enter');
    await expect(pills(page)).toHaveText(['Starts 01:00', 'Ends 01:40']);
    expect(await learntIntro(page)).toEqual({ from: 60000, to: 100000, hand: true });
});

test('turning the button off hides Skip intro and greys the times; on again brings both back', async ({ page }) => {
    await startShow(page);
    await teachIntro(page, 15);
    await seek(page, 16);
    await expect(skip(page)).toBeVisible();
    await seek(page, 60);
    await introMenu(page);
    await expect(rows(page).nth(1)).toContainText('Learnt from your skip');
    await press(page, 'Enter');
    await expect(page.locator('#pl-menu .st-switch')).not.toHaveClass(/on/);
    await expect(rows(page).nth(1)).toHaveClass(/disabled/);
    await expect(rows(page).nth(2)).toHaveClass(/disabled/);
    await expect(page.locator('#pl-menu')).toContainText('The button is off for this show');
    // ▼ passes over the greyed rows: the focus stays on the switch.
    await press(page, 'ArrowDown');
    await expect(focused(page)).toContainText('Skip intro button');
    await back(page);
    await expect(page.locator('#pl-menu .pl-menu-group', { hasText: 'Intro' }).locator('.value')).toHaveText('Off');
    await back(page);
    await seek(page, 16);
    await page.waitForTimeout(700);
    await expect(skip(page)).toBeHidden();
    // The times are kept.
    expect(await learntIntro(page)).toEqual({ from: 15000, to: 35000 });

    await seek(page, 60);
    await introMenu(page);
    await press(page, 'Enter');
    await expect(page.locator('#pl-menu .st-switch')).toHaveClass(/on/);
    await back(page);
    await back(page);
    await seek(page, 17);
    await expect(skip(page)).toBeVisible();
});
