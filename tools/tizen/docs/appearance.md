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
| `--grid-cols`, `--grid-rows` | 4, 2 | 5, 2 |
| `--home-cols` | 5 | 6 |
| `--poster-w`, `--home-poster-w` | 232px, 232px | 204px, 218px (including padding and border) |
| `--poster-h` | 284px | 290px |
| `--row-h`, `--item-row-h` | 72px, 92px | 64px, 84px |
| `--settings-row-h`, `--settings-row-gap` | 92px, 12px | 72px, 8px |
| `--category-rows`, `--list-rows` | 9, 7 | 10, 8 |
| `--gap`, `--home-gap`, `--row-gap` | 24px, 24px, 12px | 16px, 22px, 6px |
| `--text-sm`, `--text-meaning`, `--text-body` | 22px, 24px, 30px | 20px, 24px, 28px |

Compact preserves item sizes; fewer visible rows and Home cards fit inside
the new safe area. Comfortable posters are wider and slightly shorter so
two rows and their scaled focus rings fit vertically. `--visible-rows` selects
the category or item count on each pane. `List` and `Home` read CSS counts through
`AppearanceLayout.count`, including after a density change. The library uses
these same lists rather than a separate grid. `AppearanceLayout.reveal` scrolls
the focused element into view; scroll margins and strip padding reserve room
for the ring and enlarged art.

Existing `.focus` and `.focused` classes define `--focus-shadow` locally so
the ring resolves against the element's palette, including inside the player.
Artwork cards scale to 1.08 with a dark 4px gap and an 8px outer ring. Rows,
chips and buttons use the same ring and a lighter surface without scaling.
Selection uses accent text or a left bar without the focus ring. Later screen
styles should reuse these tokens and class names.

`--safe-x` is 96px and `--safe-y` is 54px on the fixed 1920×1080 canvas.
The main rail is 264px wide, the header is 150px high, and hints sit 54px above
the bottom. The category pane narrows to preserve compact grid space. Player
geometry is unchanged.

New appearance translations live in `tests/i18n/appearance-translations.json`
as well as the shipped tables. The table builder retains them when desktop
translations are regenerated. Existing browser specs seed Compact in
`tests/specs/helpers.js`; `i18n-theme.spec.js` inspects the outer shadow ring
instead of the former translucent border. Real-TV verification is required.
