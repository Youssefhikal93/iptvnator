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

## Motion (#42)

Artwork goes through `js/art.js`: an image starts transparent over its
placeholder box and fades in once loaded, while an address already loaded this
session shows at once, so lists that rebuild on every key press do not flash.
Lists preload the next page's artwork and Home the tiles RIGHT scrolls to and
the row DOWN brings up. TMDB images are requested at the size they are drawn
(poster `w342`, cast `w185`, actor photo `h632`, backdrop `w1280`). Focused
tiles grow to 1.1 with a 0.15 s transform; TMDB rows on Detail fade in. Only
transform and opacity animate. Settings > Appearance > Animations (`motion`,
On by default) sets `data-motion="off"`, which removes every transition and
animation for TVs where they stutter. Vanilla screens rebuild their tiles on
each key press, so the focus growth animates only on Preact screens until
Home and the lists move to Preact (#44, #45).

## Profile avatars (#43)

`js/avatars.js` exposes 24 animal IDs through `Avatars.ids`, `has(id)` and
`art(id)`. Artwork ships in `tv-app/avatars/` as 320 x 320 WebPs, each under
40 KB, all transparent: 15 3D characters (portraits and full bodies) and nine
illustrated characters from the Klar website, whose pale backgrounds were cut
out by flooding inward from the edges.
Retired saved IDs remain supported: `princess` resolves to `unicorn`, `wizard`
to `owl` and `pig` to `monkey`,
without rewriting profile storage. `Kit.Avatar` draws a profile's
`avatar` on its colour, or its initial when it has none. Settings > Profiles >
Avatar and ▲ on Who's watching open `AvatarPicker`; `ProfileStore.setAvatar`
saves the choice in the profile list. Who's watching follows design review
13: 220 px avatars that grow 10% inside a ring, a bold name for the focused
profile, a PIN chip on protected profiles and an accent glow. The rail's
profile menu lists every profile with its avatar, its name and a check on the
active one. The new strings are English until a person checks translations
(see the table builder).

## Channel plates (#44)

Channels are drawn as 16:9 plates (`Kit.Plate`, `channels.css`) in the Live
TV list and grid, the Home live row, the player drawer and the guide. The logo
sits on a light plate (`--plate`) because provider logos are mostly
transparent PNGs; a dark outline (`drop-shadow`) keeps white logos readable on
it. A channel without a logo, or whose logo fails, shows its name on a colour
taken from the name (`--h`), never initials. A failed logo address is not
requested again while the app runs (up to 400 addresses).

| Live TV | Comfortable | Compact |
|---|---|---|
| List rows, plate | 7 rows of 104px, 150px plate | 9 rows of 84px, 120px plate |
| Grid | 4 x 3 | 5 x 4 |

`#items.channels` sets these on the list itself, so `List` reads them with
`AppearanceLayout.count(name, el)`; movies and series keep the poster sizes.
Rows show the time left (`epg.minLeft`) and a live progress bar in
`--now-line`. Grid tiles move the logo above the programme caption with
`:has(.epg-now)`.

## Home and the top bar (#45)

Home is drawn with Preact (`js/home.js`, styles in `home.css`) from
`Kit.Row` and `Kit.Tile` (`cls="hm"`: `hm-row > h2`, `hm-cards`, `hm-card` with
a poster box, a `span` title and a `small` second line). The hero is 580px over
full-bleed artwork: eyebrow, 84px title, chips (episode, year, genre, runtime,
rating), a two-line plot, progress with time left, the buttons and dots for
the other continue-watching titles. It shows only while it has the focus;
further down, the focused row moves to the top. The Continue watching row
leaves out the title the hero is showing. Live tiles use the channel plate.

The source pill is gone; sources are switched in Settings > Sources and the
page keeps the current name in `body[data-source]` (tests read it). A
catalogue refresh shows "Updating…" in the hint bar. The top bar (search and
view buttons) is hidden on screens without tools (Home, Settings, Sources),
which then start at the top edge. Settings > Appearance > Top bar (`topBar`,
On by default) Off hides it everywhere; ▲ at the top of a list still brings it
up over the list while the remote is on it (`body.no-bar`, `body.bar-off`).
