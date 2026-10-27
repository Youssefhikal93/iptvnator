# Upstream's LG TV app compared with ours

Upstream (4gray/iptvnator) merged a TV app for LG webOS in PR #2003
(`apps/tv`, `libs/tv/*`, `apps/tv-setup`; architecture in
`docs/architecture/tv-application.md`). It sends every provider request
through IPTVnator's backend server, so we do not package it (see
[ADR 0001](./adr/0001-standalone-app-talking-to-providers-directly.md)).
Instead we copy its features one by one. This table maps each one to our app
and backlog; the concrete upstream details are in comments on those issues.

Compared on 2026-10-26 against upstream `master` (36 commits after our
branch point). Read upstream files with `git show upstream/master:<path>`.

| Upstream feature | Ours | Issue | Possible without a server |
|---|---|---|---|
| Continue hero on Home: up to 3 titles, Previous/Next, Continue watching + Details | Done (not yet tested on the TV) | #5 | Yes |
| Full-width backdrop on Home and details, gradients, no blur | Done | #3, #4, #5 | Yes |
| TMDB artwork and description (optional key, 8 s limit, session cache) | Done (not yet tested on the TV): viewer key only, separate seven-day cache, cast, Actor screen, catalogue-only similar titles and Discover genres | #20 | Yes, the TV calls TMDB |
| Catalogue sort: Recently added (default), Title A–Z, Provider order | Done (not yet tested on the TV): six orders and a Recently added category | #9 | Yes |
| Live category browser with restored focus per category | Partial | #8 | Yes |
| Live preview: OK previews beside the list, OK again fullscreen | Done (not yet tested on the TV): list view only, Settings On/Off | #32 | Yes, one stream at a time |
| Channel drawer over fullscreen live (◀), Channels / Programme / TV Guide buttons | Drawer done (not yet tested on the TV); buttons missing | #8 | Yes |
| Single-channel programme list (dates, Now, descriptions) | Missing (now and next only) | #1, #6 | Yes |
| Multi-channel guide grid (2-hour window, Watch live button) | Missing | #6 | Yes |
| Resume confirmed by retrying the seek; progress protected on failure | Done (not yet tested on the TV) | #33 | Yes |
| Automatic retry (2, 5, 10, 30 s), Retry buttons, recovery screens | Done (not yet tested on the TV); live streams reconnect after 1, 2, 4, 8, 15 s (#14) | #17, #14 | Yes |
| Remote Stop returns to where playback started | Done | — | Yes |
| Long lists with focus restored after details | Done | — | Yes |
| Settings: Home layout **Cinema** (tall hero) or **Showcase** (compact hero, more rows) | Done (not yet tested on the TV) | #10 | Yes |
| Settings: programme guide on/off | Done (not yet tested on the TV) | #10 | Yes |
| Subtitle style and picture aspect in Settings and the player menu | Done (not yet tested on the TV): AVPlay text and HTML/hls.js cues; live preview uses Fit | #26 | Yes |
| Visual refinement: compact header, 2:3 posters, TV icon for missing logos, favorites split into Movies / Series / TV | Partial (Home has separate favorite rows; optional favorites and recents across sources with source-name chips, not yet tested on the TV; missing logos show initials) | #31, #24 | Yes |
| History kept apart when a source's account changes | Partial (not yet tested on the TV); source account edits separate source ids and restore the old id when edited back; progress still uses a shared per-profile store | #34 | Yes |
| Desktop-compatible backup and restore | Done (not yet tested on the TV): import link, Replace/Merge, password warning and PUT/POST export; QR encoding unavailable | #25 | Yes, with a viewer-supplied HTTP endpoint for phone export |
| Phone QR setup for sources and settings | Not planned | #28 | No, needs the backend session |
| Server source library and backend discovery | Not planned | #28 | No |

Stalker-only changes (watchdog, MAG identity, episode files) are left out: the
TV app supports Xtream and M3U only.

## Checking again after a fork sync

```powershell
git fetch upstream
git log --oneline <last-checked>..upstream/master -- apps/tv libs/tv apps/tv-setup .changes
```

New `.changes/tv-*.md` notes describe user-visible TV features; add rows here
and issues or comments for anything worth copying.
