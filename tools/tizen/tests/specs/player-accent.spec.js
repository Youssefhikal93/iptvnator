const fs = require('fs');
const path = require('path');
const { test, expect, boot, openFirst, press, playing, moveTo } = require('./helpers');

// The player's highlights follow the accent chosen in Settings > Appearance (#57).
async function openEpisodes(page, settings) {
    await boot(page, { storage: { settings } });
    await openFirst(page, 'Series');
    await press(page, 'Enter');
    await playing(page);
    await press(page, 'ArrowDown');
    await moveTo(page, '#pl-buttons .focus', 'Episodes', 'ArrowRight');
    await press(page, 'Enter');
    await expect(page.locator('#pl-episodes')).toBeVisible();
}

const colours = el => {
    const style = getComputedStyle(el);
    return [style.backgroundColor, style.color];
};

test('the season pill keeps the overlay blue with the Blue accent', async ({ page }) => {
    await openEpisodes(page, { accent: 'blue' });
    await expect.poll(() => page.locator('.pl-ep-pill.active').evaluate(colours)).toEqual(['rgb(52, 116, 232)', 'rgb(255, 255, 255)']);
});

test('the season pill and progress bar use the chosen accent, in light theme too', async ({ page }) => {
    await openEpisodes(page, { accent: 'saffron', theme: 'light' });
    // Over video every accent uses its dark values.
    await expect.poll(() => page.locator('.pl-ep-pill.active').evaluate(colours)).toEqual(['rgb(241, 188, 80)', 'rgb(7, 18, 37)']);
    await expect.poll(() => page.locator('#pl-fill').evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(241, 188, 80)');
});

test('the overlay blue is set only in the player defaults', () => {
    const css = fs.readFileSync(path.join(__dirname, '../../tv-app/player.css'), 'utf8');
    const defaults = css.slice(0, css.indexOf('}'));
    const rest = css.slice(defaults.length);
    for (const blue of ['#4f8eff', '#3474e8', '79, 142, 255']) {
        expect(defaults).toContain(blue);
        expect(rest).not.toContain(blue);
    }
});
