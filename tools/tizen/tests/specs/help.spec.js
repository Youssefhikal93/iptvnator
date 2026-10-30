const { test, expect, boot, section, enterItems, press, back, moveTo, toolbar, setting, playing } = require('./helpers');

// #89: Help on every screen and every coloured-key action without coloured
// keys. These tests use only arrows, OK and Return, like a 2023 Smart Remote.
const help = page => page.locator('#menu.key-help');

async function expectHelp(page, line, colours = []) {
    await expect(help(page)).toBeVisible();
    await expect(help(page).locator('.menu-title')).toHaveText('Help');
    await expect(help(page)).toContainText(line);
    await expect(help(page)).toContainText('Coloured buttons: press 123 on your remote');
    for (const colour of colours) await expect(help(page).locator('.kh-key .key-dot-' + colour)).toHaveCount(1);
    await expect(help(page).locator('.menu-row.focused')).toHaveText('Close');
    await back(page);
    await expect(page.locator('#menu')).toBeHidden();
}

async function holdOk(page) {
    await page.keyboard.down('Enter');
    await page.waitForTimeout(800); // The app's hold is 600 ms.
    await page.keyboard.up('Enter');
}

test('the top bar ? beside TV guide opens Help for the list, with arrows only', async ({ page }) => {
    await boot(page);
    await section(page, 'Live TV');
    await enterItems(page);
    await toolbar(page, 'help');
    await expect(page.locator('#view-toggle .view-btn:not(.hidden)').last()).toHaveAttribute('data-mode', 'help');
    await press(page, 'Enter');
    await expectHelp(page, 'Options: favorites, hide, details');
    await expect(page.locator('.view-btn.focused')).toHaveAttribute('data-mode', 'help');
});

test('the TV guide header reaches Search programmes, Reminders and Help without Blue or Yellow', async ({ page }) => {
    await boot(page);
    await section(page, 'Live TV');
    await enterItems(page);
    await toolbar(page, 'guide');
    await press(page, 'Enter');
    await expect(page.locator('#guide .gd-programme.focused')).toBeVisible();
    await expect(page.locator('#guide .gd-hints .key-dot-yellow')).toHaveCount(1);
    await expect(page.locator('#guide .gd-hints .key-dot-blue')).toHaveCount(1);
    await expect(page.locator('#guide .gd-hints')).not.toContainText(/Yellow|Blue/);
    await press(page, 'ArrowUp');
    const action = page.locator('#guide .gd-action.focused');
    await expect(action).toHaveAttribute('data-action', 'search');
    await expect(action.locator('.key-dot-blue')).toHaveCount(1);
    await expect(page.locator('#guide .gd-programme.focused')).toHaveCount(1);
    await expect(page.locator('#guide')).toHaveClass(/on-actions/);
    await press(page, 'Enter');
    await expect(page.locator('#programme-search')).toBeVisible();
    await back(page);
    await back(page);
    await expect(page.locator('#programme-search')).toBeHidden();
    await expect(page.locator('#guide')).toBeVisible();
    await press(page, 'ArrowRight');
    await expect(action).toHaveAttribute('data-action', 'reminders');
    await press(page, 'Enter');
    await expect(page.locator('#menu .menu-title')).toHaveText('Reminders');
    await back(page);
    await expect(page.locator('#menu')).toBeHidden();
    await press(page, 'ArrowRight');
    await expect(action).toHaveAttribute('data-action', 'help');
    await press(page, 'Enter');
    await expectHelp(page, 'Search programmes', ['yellow', 'blue']);
    // ▼ hands the focus back to the grid; Return then leaves the guide.
    await press(page, 'ArrowDown');
    await expect(page.locator('#guide .gd-action.focused')).toHaveCount(0);
    await expect(page.locator('#guide')).not.toHaveClass(/on-actions/);
    await press(page, 'ArrowDown');
    await expect(page.locator('#guide .gd-row.selected')).toHaveAttribute('data-index', '1');
    await back(page);
    await expect(page.locator('#guide')).toBeHidden();
});

test('Home has Help left of its search icon, and its search reaches Search programmes with ▶', async ({ page }) => {
    await boot(page);
    await section(page, 'Home');
    await press(page, 'ArrowUp');
    await expect(page.locator('#home .hm-search-icon')).toHaveClass(/focus/);
    await press(page, 'ArrowLeft');
    await expect(page.locator('#home .hm-help-icon')).toHaveClass(/focus/);
    await press(page, 'Enter');
    await expectHelp(page, 'In search: Search programmes', ['blue']);
    await press(page, 'ArrowRight');
    await expect(page.locator('#home .hm-search-icon')).toHaveClass(/focus/);
    await press(page, 'Enter');
    await expect(page.locator('#home .hm-search-bar')).toHaveClass(/typing/);
    await press(page, 'ArrowDown');
    await expect(page.locator('#home .hm-search-bar')).toHaveClass(/focused/);
    await press(page, 'ArrowRight');
    await expect(page.locator('#home .hm-search .dt-btn')).toHaveClass(/focus/);
    await expect(page.locator('#home .hm-search-bar')).not.toHaveClass(/focused/);
    await press(page, 'Enter');
    await expect(page.locator('#programme-search')).toBeVisible();
});

test('Settings has a Help row in About', async ({ page }) => {
    await boot(page);
    await setting(page, 'Help');
    await press(page, 'Enter');
    await expectHelp(page, 'Open the group, change or run the setting');
    await expect(page.locator('#settings .st-row.focused .st-label')).toHaveText('Help');
});

test('on live TV, hold OK opens the menu with Previous channel and Help; a tap still shows the info', async ({ page }) => {
    await boot(page);
    await section(page, 'Live TV');
    await enterItems(page);
    const first = (await page.locator('#items .focused .label').innerText()).replace(/^\d+\.\s*/, '').split('\n')[0].trim();
    await press(page, 'Enter');
    await playing(page);
    await expect(page.locator('#pl-controls')).toBeHidden({ timeout: 10000 });
    await press(page, 'Enter');
    await expect(page.locator('#pl-controls')).toBeVisible();
    await expect(page.locator('#pl-menu')).toBeHidden();
    await expect(page.locator('#pl-hint .key-dot-green')).toHaveCount(1);
    await expect(page.locator('#pl-hint .key-dot-yellow')).toHaveCount(1);
    await expect(page.locator('#pl-hint')).not.toContainText(/Yellow|Green/);
    // Change channel, then go back to the first one from the menu, not with Green.
    await press(page, 'ArrowUp');
    await playing(page);
    await expect(page.locator('#pl-title')).not.toContainText(first);
    await holdOk(page);
    await expect(page.locator('#pl-menu')).toBeVisible();
    await expect(page.locator('#menu')).toBeHidden();
    await moveTo(page, '#pl-menu .pl-menu-item.focus', 'Help');
    await press(page, 'Enter');
    await expectHelp(page, 'Menu: audio, subtitles, settings, Help', ['green', 'yellow']);
    await expect(page.locator('#pl-menu')).toBeVisible();
    await moveTo(page, '#pl-menu .pl-menu-item.focus', 'Previous channel: ' + first, 'ArrowUp');
    await press(page, 'Enter');
    await playing(page);
    await expect(page.locator('#pl-title')).toContainText(first);
    await expect(page.locator('#pl-menu')).toBeHidden();
});
