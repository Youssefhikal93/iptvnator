# Shared appearance foundation

Ticket #31's screen changes reuse `tv-app/theme-accents.css` and
`tv-app/appearance.css`, loaded after the base palette and screen styles
respectively. Keep screen layouts in their own stylesheets; these files own
the shared tokens, focus language and main-screen safe area.

`Prefs` stores `theme`, `accent` and `density` in the active profile's settings,
through the same path as Language. `Appearance` applies them at startup, on
changes and on profile switches. Missing or unknown values display Dark,
Blue and Comfortable without rewriting saved settings.

Blue inherits the original accent tokens. Other accents override only the
selection, focus-ring and panel-outline tokens. `#player` always gets the dark
palette and dark accent values, including when the surrounding app is Light.

| Token | Comfortable | Compact |
|---|---|---|
| `--grid-cols`, `--grid-rows` | 5, 2 | 6, 2 |
| `--home-cols` | 6 | 7 |
| `--poster-h`, `--home-poster-h` | 300px, 286px | 250px, 262px |
| `--home-row-h` | 452px | 440px |
| `--settings-row-h`, `--settings-row-gap` | 92px, 12px | 72px, 8px |
| `--gap`, `--home-gap` | 20px, 22px | 16px, 22px |
| `--text-sm`, `--text-meaning`, `--text-body` | 22px, 24px, 30px | 20px, 24px, 28px |

Grid and Home columns share the row width (`minmax(0, 1fr)`), so both
densities reach the right edge. Lists keep today's rows in both densities
(`--row-h` 64px, `--item-row-h` 84px, 11 category and 9 item rows): source
details and guide rows must fit. `List` and `Home` read the counts through
`AppearanceLayout.count`, including after a density change. Nothing scrolls a
container into view: the virtual lists render only the visible window, and an
earlier `scrollIntoView` shifted whole screens on the TV.

Existing `.focus` and `.focused` classes define `--focus-shadow` locally so
the ring resolves against the element's palette, including inside the player.
Artwork cards scale to 1.08 with a dark 4px gap and an 8px outer ring. Rows,
chips and buttons use the same ring and a lighter surface without scaling.
Selection uses accent text or a left bar without the focus ring. Later screen
styles should reuse these tokens and class names.

The rail (168px), header and content keep their full-width geometry; only the
hint bar moved up to 24px from the bottom edge. Player geometry is unchanged.

Theme, Accent colour and Density render as pills (`pills: true` on a Settings
row): every choice is visible, LEFT/RIGHT move between them and stop at the
ends, OK cycles. `js/rail-profile.js` draws the active profile above the rail;
UP from the first section focuses it and OK opens the switch menu.

New appearance translations live in `tests/i18n/appearance-translations.json`
as well as the shipped tables. The table builder retains them when desktop
translations are regenerated. Existing browser specs seed Compact in
`tests/specs/helpers.js`; `i18n-theme.spec.js` inspects the outer shadow ring
instead of the former translucent border. Real-TV verification is required.
