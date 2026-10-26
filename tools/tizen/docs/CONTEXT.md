# IPTVnator for Samsung TV

A standalone IPTV app for Samsung (Tizen) TVs, built from the IPTVnator
desktop app's look and features. It talks to the viewer's providers directly
from the TV; no laptop or server is needed once it is installed.

Start here, then read the decisions in [adr/](./adr/) and the comparison with
upstream's LG TV app in [upstream-lg-app.md](./upstream-lg-app.md). Installing
and updating are in [../INSTALLATION-TO-TV.md](../INSTALLATION-TO-TV.md).

## Language

### Sources and what they offer

**Source**:
One saved provider login on the TV: an Xtream account or an M3U playlist link.
_Avoid_: Playlist (for Xtream), provider, account

**Section**:
One kind of content a source offers: Live TV, Movies or Series. M3U sources only offer Live TV.
_Avoid_: Tab, type, mode

**Category**:
A named group of items inside a section, supplied by the source or the app.
_Avoid_: Group (except for M3U `group-title`), genre, folder

**Hidden category**:
A category the viewer chose not to see, kept per source and section; Favorites, Recently added and All channels are never hidden.
_Avoid_: Disabled, removed category

**Recently added**:
The newest dated movies or shows added to a source's catalogue, regardless of release year; the category holds up to 50 items.
_Avoid_: New releases, recently watched

**Item**:
One channel, movie or show in a category list.
_Avoid_: Stream, entry (see Entry), content

**Channel**:
A live TV item.
_Avoid_: Stream, station

**Show**:
A series item; it holds seasons of episodes.
_Avoid_: Series (for one title), serial

**Episode**:
One playable part of a show, numbered within a season.

**Catalogue**:
A source's categories, items and show details as last fetched, kept on the TV so the app can start from them.
_Avoid_: Cache, playlist

**Refresh**:
Fetching a source's catalogue again in the background, or from scratch with "Refresh source".
_Avoid_: Sync, reload

### What the viewer keeps

**Library**:
Everything kept for the viewer per source: favorites, recently watched and progress.
_Avoid_: History (for all of it), profile

**Favorite**:
An item the viewer marked to find again quickly. Episodes are favorited through their show.

**Recently watched**:
The items the viewer last played in a section, newest first.
_Avoid_: History

**Progress**:
How far the viewer got in a movie or episode.
_Avoid_: Position (alone), bookmark

**Watched**:
A movie or episode played to the end; its progress stays at 100 %.
_Avoid_: Finished, completed, seen

**New episodes**:
The badge, and the Home row, for a favorite or recently watched show that has episodes added since the viewer last watched or opened it.
_Avoid_: Unwatched episodes, updates

**Continue watching**:
Movies and episodes with progress that are not watched yet.
_Avoid_: In progress, resume list

### Screens

**Home**:
The start screen: a hero and rows of items from the library and the catalogue.
_Avoid_: Dashboard, start page

**Hero**:
The large banner at the top of Home for up to three continue-watching items.
_Avoid_: Banner, spotlight, carousel

**Row**:
A horizontal list of items on Home, such as "Favorite movies".
_Avoid_: Rail (the rail is the section menu), shelf, carousel

**Rail**:
The menu of sections on the left edge.
_Avoid_: Sidebar, nav

**Settings**:
App-wide playback, display and start-up choices, available from the bottom of the rail even without a source.
_Avoid_: Preferences, configuration

**Detail page**:
The full-screen page for one movie or show: artwork, facts, plot and its buttons; a show's page also lists its episodes.
_Avoid_: Info page, details screen

**Options menu**:
The list of actions that opens when the viewer holds OK on an item.
_Avoid_: Context menu, long-press menu

### Watching

**Player**:
The full-screen playback screen for a channel, movie or episode.

**Channel list**:
The see-through list over live playback: browse channels and categories, then press OK to watch.
_Avoid_: Drawer, sidebar

**Now and next**:
The programme on a channel now and the one after it.
_Avoid_: EPG (for this), guide

**Guide**:
Programmes over time for the current Live TV category, opened with the TV guide button or the remote's Guide key.
_Avoid_: EPG grid (use TV guide only for the button label)

**Guide link**:
An optional XMLTV file link saved per source, supplying programmes with a viewer-set time offset.
_Avoid_: Custom EPG, external playlist

**Up next**:
The card near the end of an episode that offers, and then plays, the next episode.
_Avoid_: Autoplay card, next-episode popup

**Skip intro**:
A jump of a fixed length near the start of an episode; providers do not mark intros.
