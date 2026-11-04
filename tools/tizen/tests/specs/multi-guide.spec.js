const { test, expect, typeIn, boot, section, press, back, sourceMenu, moveTo, holdOK, enterItems } = require('./helpers');

// A second guide that names its channels the way the provider does, plus one
// channel no provider channel is called, for choosing by hand (#90).
function namesGuide() {
    const stamp = (ms) => new Date(ms).toISOString().replace(/[-:T]/g, '').slice(0, 14) + ' +0000';
    const from = stamp(Date.now() - 3600000);
    const to = stamp(Date.now() + 7200000);
    return '<?xml version="1.0" encoding="UTF-8"?>\n<tv>\n'
        + '<channel id="two.guide"><display-name>Channel 2 (cat all) HD</display-name></channel>\n'
        + '<channel id="elsewhere.guide"><display-name>Somewhere else</display-name></channel>\n'
        + '<programme start="' + from + '" stop="' + to + '" channel="two.guide"><title>Named guide show</title></programme>\n'
        + '<programme start="' + from + '" stop="' + to + '" channel="elsewhere.guide"><title>Picked guide show</title></programme>\n'
        + '</tv>\n';
}

function liveRow(page, n) {
    return page.locator('#items .row').filter({ has: page.locator('.label', { hasText: new RegExp('^' + n + '\\. Channel ' + n + ' ') }) });
}

async function chooseRow(page, label) {
    await moveTo(page, '#menu .focused', label);
    await press(page, 'Enter');
}

test('two guide links pair by name, follow the chosen order, and a channel takes a guide channel by hand (#90)', async ({ page }) => {
    await page.route('**/names.xml', route => route.fulfill({ contentType: 'application/xml', body: namesGuide() }));
    await boot(page);
    const origin = new URL(page.url()).origin;
    await sourceMenu(page);
    await chooseRow(page, 'Guide link…');
    await expect(page.locator('#form-epg-url3')).toBeVisible();
    await expect(page.locator('label[for="form-epg-url"]')).toHaveText('Guide link 1 (optional)');
    await expect(page.locator('#form-guide-hint')).toContainText('XMLTV links');
    await expect(page.locator('#form-epg-prefer option')).toHaveText(['After my guides', 'Before my guides']);
    await typeIn(page, '#form-epg-url', origin + '/names.xml');
    await typeIn(page, '#form-epg-url2', origin + '/epg.xml.gz');
    await typeIn(page, '#form-epg-url3', 'ftp://not-a-guide');
    await page.locator('#form-save').click();
    await expect(page.locator('#form-msg')).toHaveText('The guide link must start with http:// or https://');
    await typeIn(page, '#form-epg-url3', '');
    await page.locator('#form-save').click();
    await expect(page.locator('#form')).toBeHidden();
    // Each guide link gets its own line under the source: updated, then the next update.
    const lines = page.locator('#settings .st-source .st-line');
    await expect(lines).toHaveCount(2);
    await expect(lines.nth(0)).toContainText(/^Guide 1 · updated .+/);
    await expect(lines.nth(1)).toContainText(/^Guide 2 · updated .+/);

    // Guide 1 pairs "Channel 2 (cat all)" by name; guide 2 has every channel by id.
    await section(page, 'Live TV');
    await expect(liveRow(page, 2).locator('.epg-now')).toHaveText('Named guide show');
    await expect(liveRow(page, 1).locator('.epg-now')).toContainText('XMLTV show');

    // Guide 2 moved first wins for channel 2 too.
    await sourceMenu(page);
    await chooseRow(page, 'Guide order');
    await expect(page.locator('#menu .menu-title')).toHaveText('Guide order');
    await expect(page.locator('#menu .menu-row')).toHaveText([/^1\. Guide 1 · /, /^2\. Guide 2 · /, "3. Provider's guide"]);
    await chooseRow(page, '2. Guide 2 · localhost');
    await chooseRow(page, 'Move up');
    await expect(page.locator('#menu .menu-row')).toHaveText([/^1\. Guide 2 · /, /^2\. Guide 1 · /, "3. Provider's guide"]);
    await expect(page.locator('#menu .focused')).toContainText('1. Guide 2');
    await back(page);
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('iptvnator-tv:sources'))[0].epgOrder)).toEqual(['2', '1', 'provider']);
    await section(page, 'Live TV');
    await expect(liveRow(page, 2).locator('.epg-now')).toContainText('XMLTV show');

    // Channel 1 takes guide 1's "Somewhere else" by hand, then goes back to Automatic.
    await enterItems(page);
    await holdOK(page);
    await chooseRow(page, 'Guide channel: Automatic');
    await expect(page.locator('#menu .menu-title')).toHaveText('Guide for Channel 1 (cat all)');
    await expect(page.locator('#menu .focused')).toHaveText('✓ Automatic');
    // Guide channels with a similar name come first, by name and id; the rest are under Show all.
    // The guide's name, with its id and guide on a line under it.
    await expect(page.locator('#menu .menu-row').nth(1).locator('.menu-label')).toHaveText('Channel 2 (cat all) HDtwo.guide · Guide 1');
    await expect(page.locator('#menu .menu-row').nth(1).locator('.menu-row-sub')).toHaveText('two.guide · Guide 1');
    await expect(page.locator('#menu .menu-row').nth(2)).toHaveText(/^Show all guide channels \(\d+\)$/);
    // Up onto the search field only highlights it; OK opens the keyboard.
    await press(page, 'ArrowUp');
    await expect(page.locator('#menu .menu-search')).toHaveClass(/focused/);
    await expect(page.locator('#menu .menu-search input')).not.toBeFocused();
    await press(page, 'ArrowDown');
    await expect(page.locator('#menu .focused')).toHaveText('✓ Automatic');
    await press(page, 'ArrowUp');
    await press(page, 'Enter');
    await expect(page.locator('#menu .menu-search input')).toBeFocused();
    await page.keyboard.type('elsewhere');
    await expect(page.locator('#menu .menu-row .menu-label')).toHaveText(['Somewhere elseelsewhere.guide · Guide 1']);
    await press(page, 'Enter');
    await expect(page.locator('#menu .menu-search input')).not.toBeFocused();
    await expect(page.locator('#menu .focused .menu-label')).toContainText('Somewhere else');
    await back(page);
    await holdOK(page);
    await chooseRow(page, 'Guide channel: Automatic');
    await press(page, 'ArrowDown');
    await press(page, 'ArrowDown');
    await press(page, 'Enter');
    // Every guide channel by name, the first 300 of the 514 in both guides.
    await expect(page.locator('#menu .menu-row')).toHaveCount(301);
    await expect(page.locator('#menu .menu-row').last()).toHaveText('Showing the first 300 of 514');
    await back(page);
    await page.evaluate(() => {
        const source = Sources.all()[0];
        GuidePick.set(source.id, { stream_id: 1001 }, { n: 1, id: 'elsewhere.guide' });
    });
    await expect(liveRow(page, 1).locator('.epg-now')).toHaveText('Picked guide show');
    await holdOK(page);
    await chooseRow(page, 'Guide channel: elsewhere.guide');
    // The chosen row is focused; Automatic is above it.
    await expect(page.locator('#menu .focused .menu-label')).toHaveText('✓ Somewhere elseelsewhere.guide · Guide 1');
    await moveTo(page, '#menu .focused', 'Automatic', 'ArrowUp');
    await press(page, 'Enter');
    await expect(page.locator('#menu')).toBeHidden();
    await expect(liveRow(page, 1).locator('.epg-now')).toContainText('XMLTV show');
});
