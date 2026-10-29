# Shared appearance foundation

Ticket #31's screen changes reuse `tv-app/theme-accents.css` and
`tv-app/appearance.css`, loaded after the base palette and screen styles
respectively. Keep screen layouts in their own stylesheets; these files own
the shared tokens, focus language and main-screen safe area.

`Prefs` stores `theme`, `accent` and `density` in the active profile's settings,
through the same path as Language. `Appearance` applies them at startup, on
changes and on profile switches. Missing or unknown values display Dark blue,
Blue and Comfortable without rewriting saved settings.

Blue inherits the original accent tokens. Other accents override only the
selection, focus-ring and panel-outline tokens. `#player` always gets the dark
blue palette and dark accent values in every theme. Display > Theme offers
Dark blue (`dark`, default), Dark black (`black`), Dark grey (`grey`) and Light (`light`).

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

Movies and Series also offer Wide picture boxes (`wide`, 3 a row, 4 when
compact) and Info boxes (`info`, 2 a row) beside List and Grid (#66). They are
the same virtual grid with their own `--grid-cols`/`--grid-rows` on
`#items.boxes-wide` / `#items.boxes-info` (`boxes.css`). `BoxCards` builds their
text from the list item, or from a TMDB match already in memory: a box costs no
request and no storage read.

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

Moving along the rail moves only its focus: the section opens once the focus
rests on it for 200 ms, or at once with RIGHT/OK, so passing Live TV and
Movies on the way to Settings loads neither (#53).

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
view buttons) is hidden on screens without tools (Home, Settings),
which then start at the top edge. Settings > Appearance > Top bar (`topBar`,
On by default) Off hides it everywhere; ▲ at the top of a list still brings it
up over the list while the remote is on it (`body.no-bar`, `body.bar-off`).

## Menu position and Back (#50)

Settings > Appearance > Menu position (`menuPosition`, per profile) is Side
(default) or Top. Side is the 208px rail with its items 28px in from the edge;
Top turns the same `#rail` into a 96px bar (`body.menu-top`, `menu.css`) with
the profile first and Settings at the far end. The header, content, load error
and hints start after the menu through `--menu-w` and `--menu-h`; the hints sit
in a 54px bottom margin (`--hint-h`). On top, lists show one row fewer and the
Home hero is 484px with a one-line plot, so the first row stays in view.

Along the menu ▲/▼ (Side) or ◀/▶ (Top) move, and ▲ or ◀ past the first section
reaches the profile; ▶ (Side) or ▼ (Top) enters the screen. From a screen, the
edge that faces the menu leads to it: ◀ on the side, ▲ on top (Home and
Settings report the edge they left by, `'left'` or `'up'`). Back from a list, a
category, the toolbar, Home or Settings goes straight to the menu; ◀ in a list
still steps to the categories. Back on the menu exits as before.

## Detail page (#46)

The movie and show pages (`js/detail.js`, `js/detail-episodes.js`, styles in
`detail.css`) put the artwork full-bleed under a scrim that is solid on the
left and fades to the bottom. Over it: the poster (300 x 450, 240 x 360 for a
show), an eyebrow (Movies or Series and the first genre), a 76px title, the
facts as chips in `.dt-meta` (year, length, a coloured ★ rating chip, up to
three genres, then the page's `badges`, such as New episodes for a show opened
from its badge), the plot (3 lines, 2 for a show), cast and director on one
line, and the buttons. Buttons are 88px pills; the first is filled with the
accent and a resume line sits under it. The Home hero shares the pill style.

A show's episodes are a strip under the buttons, on the first screen: season
pills (56px, the shown season filled), "N of M watched", then 16:9 tiles
(400 x 225, 352 x 198 in Compact) with the number, length, watched tick and
progress on the picture and the title and plot under it. An episode without
a picture shows the show's artwork, dimmed. ◀/▶ move along the strip, ▲ goes
to the season pills and then the buttons, ▼ goes on to the TMDB rows, which
take the screen while they have the focus.

## Sources in Settings (#51)

Sources are set up once, so they have no item in the menu any more (Home,
Live TV, Movies, Series, Settings). They are the first group of Settings
(`js/source-settings.js`): one row per source with its state under the name
(active, guide, saved channel count, expiry) and a chip on the right (type,
or a red problem chip), then "+ Add Xtream account" and "+ Add M3U playlist".
OK on a source opens its options in the menu dialog: Watch or Switch,
Refresh, Edit, the guide actions and Remove (Remove asks once more), then
the account details as lines the focus passes over (`note` options).
With no source the app opens Settings on Add Xtream account; Go to Sources
on the account screen opens Settings on the source with the problem.

## Settings groups (#49)

Settings (`js/settings.js`, styles in `settings.css`) shows its groups down
the left with their row counts and the chosen group's rows on the right. A
row that names a `group` starts one. ▲▼ pick a group and show its rows at
once; ▶ or OK enters the rows; Return or ◀ at the first choice goes back to
the groups, and Return there goes to the menu. Rows are 96px cards with the
label and, where a row has a `hint`, a line that says what it does
(`describe.*`, in every language). On/off rows are a switch next to the word;
other choices show ‹ value ›; Appearance keeps its pills. Every group is in
the page and only the chosen one is shown, so tests can read any row's value;
the `setting(page, label)` helper opens a row through its group. Sources are
cards with a status dot, and the add rows are dashed.

## Rows under the detail page (#47)

Under the buttons (a show: under its episodes) the detail page has rows of
titles: "More in <category>" first, then TMDB's Cast and Similar in your
library when a TMDB key is set. The first row comes from the section's saved
list (`relatedTitles` in `browser.js`), so it needs no request and no key and
is there before the details load; hidden and locked categories stay out. The
rows are placed at a fixed height, so arriving rows never move the page.
`js/detail-rows.js` keeps the focus across them; a row is `{ label, cards,
open(index) }` and `TmdbDetail.rows()` returns its rows in that shape. ▼ from
the buttons enters the rows, ▲ from the first row or Return goes back, and OK
opens the title or the actor page.

## Player controls and side panels (#48)

Movie and episode controls have a transport row: -10, play/pause and +10
circles, with the ▼ buttons (Skip intro, Next episode, Episodes, Audio &
subtitles) on its right. The keys are unchanged: OK pauses, so the middle
circle shows what OK does next and carries the focus ring until the ▼
buttons take it; ◀ ▶ seek and light the circle on their side. The bar is
16 px with the time left on its right, and the top right shows the clock and
"Ends HH:MM" at the current speed. Live channels keep their guide instead.

The ▲ menu (`js/player-menu.js`) is a panel down the right edge. The player
hands it entries on every render (`head` starts a group, `item` adds a
choice, `note` and `info` add lines); its groups show their current value,
OK or ▶ opens a group, ◀ or Return goes back and Return on the groups closes
it. Specs open a group with `playerGroup(page, name)`.

Hold-OK options (`Menu`) are a sheet down the right that dims the rest of
the screen. An item's options show its artwork, title and section; rows can
carry a `glyph` that CSS draws before the label, so a row's text is still
its label; Return closes the sheet, so there is no Cancel row. The profile
switcher keeps its small list under the avatar.

Up next sits at the top right on the 96 px edge with the next episode's
still, moves under the clock while the controls are up, and runs a bar down
with the autoplay countdown.
