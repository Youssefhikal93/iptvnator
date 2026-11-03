# IPTVnator for Samsung TV (Tizen widget)

Phase 0 (feasibility) of issue #18: the real IPTVnator web build, wrapped as a
Samsung Tizen web app (`.wgt`) that installs **next to** Jo-TV with its own
id. Nothing here changes the web, PWA or Electron apps.

|                           |                                                                                          |
| ------------------------- | ---------------------------------------------------------------------------------------- |
| App name                  | IPTVnator                                                                                |
| Package / app id          | `IPTVnSmTV` / `IPTVnSmTV.IPTVnator` (Jo-TV is `IPTVnTVApp`)                              |
| Profile, minimum platform | `tv-samsung`, `required_version="7.0"` (2023 TVs)                                        |
| Privileges                | `internet`, `tv.inputdevice`; `<access origin="*">` so providers can be reached directly |
| Icon                      | `apps/web/src/assets/icons/favicon.512x512.png` (the app icon)                           |

## How the wrapper works

1. `web:build:tizen` (a configuration in `apps/web/project.json`) builds the
   production Angular app into `dist/apps/web-tizen` with **no service
   worker**, `<base href="index.html">` and **hash routing**
   (`router-location.providers.tizen.ts` replaces
   `router-location.providers.ts`). A widget runs from a `file:` origin,
   where `history.replaceState` rejects path changes; `index.html#/route`
   keeps the document path. Nx caches the configuration's own output directory;
   other builds are unchanged.
2. `tizen:wrap` copies that output to `dist/apps/tizen/widget`, removes any
   service-worker files, adds `config.xml` (version from `package.json`) and
   `icon.png`, and injects the startup and scroll probes as the first
   `<head>` scripts. `--backend-url` additionally writes
   `assets/app-config.js` (phase 0 TV test aid, see below).
3. `tizen:package` zips the widget into
   `dist/apps/tizen/IPTVnator-unsigned.wgt`. TVs install only signed
   packages; `deploy-tv.ps1` signs with the Tizen CLI.

The PWA pieces that must stay off on the TV: the Angular service worker
(`serviceWorker: false`; the app also never registers it on `file:`, see
`shouldEnableServiceWorker`). The web manifest link is harmless and kept.

## Commands

Run from the repository root (`pnpm` is `corepack pnpm` when it is not on
PATH).

```powershell
pnpm nx run tizen:package            # build web (tizen), wrap, unsigned .wgt
pnpm nx run tizen:file-origin-check  # boot the widget from file:// in Chromium
pnpm nx run tizen:compat-scan        # features newer than Chromium 94 (Tizen 7.0)
pnpm nx run tizen:measure-local      # local proxy numbers (needs tizen:wrap)
pnpm nx run tizen:test               # unit tests of the scripts
pnpm nx run tizen:lint
```

`measure-local` serves the widget and a fake 12k-channel M3U on 127.0.0.1,
aborts every other request (no provider or public backend is contacted),
imports the M3U through the file input (parsed in the browser, no backend),
reads both probes and writes `dist/apps/tizen/perf/local-results.json`. Options:
`-- --rates 1,4,6 --channels 12000`. It uses Playwright's Chromium, or the
installed Chrome when that is not downloaded.

## Sign, install and start on the TV (owner only)

Prerequisites are the Jo-TV ones: Tizen Studio with the TV and Samsung
Certificate extensions, Developer Mode pointing at the PC, and the
`iptvnator-tv` certificate profile whose distributor certificate lists the
TV's DUID (`tools/tizen/INSTALLATION-TO-TV.md` steps 1-7 on the Jo-TV
branch). The same profile signs this app; no new certificate is needed.

```powershell
.\apps\tizen\deploy-tv.ps1                         # TV at 192.168.0.18, profile iptvnator-tv
.\apps\tizen\deploy-tv.ps1 -TvIp 192.168.0.50 -CertProfile iptvnator-tv
.\apps\tizen\deploy-tv.ps1 -SkipBuild -NoRun       # reuse dist/apps/tizen/widget, do not start
```

The script runs `tizen:wrap`, signs a copy in `%TEMP%\iptvnator-samsungtv`
(`tizen package -t wgt -s <profile>`), then `sdb connect`, `tizen install`
and `tizen run -p IPTVnSmTV.IPTVnator`. Reinstalling the same package keeps
the app's data. Nothing is committed: no certificates, no `.wgt`.

By hand, the same steps are:

```powershell
pnpm nx run tizen:wrap
$build = "$env:TEMP\iptvnator-samsungtv"
Remove-Item -Recurse -Force $build -ErrorAction SilentlyContinue
Copy-Item -Recurse dist\apps\tizen\widget $build
C:\tizen-studio\tools\ide\bin\tizen.bat package -t wgt -s iptvnator-tv -- $build
Get-ChildItem $build -Filter *.wgt | Rename-Item -NewName iptvnator-samsungtv.wgt
C:\tizen-studio\tools\sdb.exe connect <TV-IP>:26101
cd $build
C:\tizen-studio\tools\ide\bin\tizen.bat install -n iptvnator-samsungtv.wgt -s <TV-IP>:26101 -- .
C:\tizen-studio\tools\ide\bin\tizen.bat run -p IPTVnSmTV.IPTVnator -s <TV-IP>:26101
```

## Reading the startup timing on the TV

`src/tizen-startup-probe.js` runs before the app (plain ES5, so it reports
even when the engine cannot run the app). Times are from navigation start:

- **first render**: Angular has bootstrapped and replaced the splash.
- **ready**: the first screen (dashboard, playlist...) is in the DOM and
  nothing changed for 1 s. This is the go/no-go number (8 s or less).
- **heap**: used JS heap at ready; **errors**: resource, script and rejection
  counts with details omitted. It never logs URLs or credentials.

Ways to read it:

1. **On screen**: a badge in the bottom-right corner for 20 s after every
   start: engine (e.g. `Chromium 94`), Tizen version, first render, ready,
   heap, error count. Photograph it.
2. **Web Inspector** (when the TV allows debugging): `tizen run` is not
   enough; start with `C:\tizen-studio\tools\sdb.exe -s <TV-IP>:26101 shell 0
debug IPTVnSmTV.IPTVnator`, forward the printed port
   (`sdb -s <TV-IP>:26101 forward tcp:<port> tcp:<port>`) and open
   `http://localhost:<port>` in Chrome. The console has the line
   `[tizen-startup] {...}` and `localStorage["iptvnator-tizen-startup"]`
   keeps the last five runs.

The probe starts at navigation start, so the time the TV needs to launch the
web runtime before that is not included: time one cold start with a
stopwatch as well (press the app tile, stop when the dashboard shows).

Turn the badges off with `localStorage.setItem('iptvnator-tizen-startup-badge',
'off')` in the inspector.

### The long-list check (scroll probe)

`src/tizen-scroll-probe.js` (also injected) benchmarks the channel list by
itself, once per app start: when a list with 5,000 rows or more is open and
the page has been idle for 3 s, it scrolls it for 4 s like a fast scroll,
4 s like a held remote arrow (one row per 100 ms), then jumps to the end. The
badge then shows `Scroll 12000 rows: no freeze` (or `FREEZE`: a frame gap of
500 ms or more), the frame rates and the longest frame. Console line:
`[tizen-scroll] {...}`; last five runs in
`localStorage["iptvnator-tizen-scroll"]`. Off: set
`iptvnator-tizen-scroll-bench` to `off`. Do not press keys while it runs.

The TV cannot import an M3U by URL on its own yet: the web build sends
playlist URLs through `apps/web-backend` (phase 1 removes that). For the
phase 0 check, run that backend and the fake 12k playlist on the PC (no
real provider is involved) and build the widget pointing at it:

```powershell
# PC terminal 1: web-backend on port 3333, reachable from the TV
$env:PORT='3333'; $env:CLIENT_URL='*'; $env:IPTVNATOR_PROXY_ALLOW_PRIVATE_NETWORKS='1'
$env:TSX_TSCONFIG_PATH='tsconfig.base.json'; corepack pnpm tsx apps/web-backend/src/main.ts
# PC terminal 2: fake playlist at http://<PC-IP>:8899/fake.m3u
node apps/tizen/scripts/serve-fake-playlist.mjs --host <PC-IP>
# PC terminal 3: build, sign, install with BACKEND_URL=http://<PC-IP>:3333
.\apps\tizen\deploy-tv.ps1 -BackendUrl http://<PC-IP>:3333
```

On the TV: **Add playlist → M3U URL**, enter `http://<PC-IP>:8899/fake.m3u`,
**Add playlist**; the channel list opens and the scroll probe runs 3 s
later. Without a mouse this needs the on-screen keyboard and arrow keys;
phase 3 brings remote navigation. Allow Node through the Windows firewall
when asked. Build without `-BackendUrl` for any later install.

### What to send back for the go/no-go

1. Photo of the startup badge after a cold start (power the TV off and on, or
   start the app after it was closed for a while), and the stopwatch time from
   pressing the tile to the dashboard.
2. Photo of the startup badge on a second start with the 12k playlist saved.
3. Photo of the scroll badge.

Go: ready (plus the runtime launch from the stopwatch) at 8 s or less, and
`no freeze`.

## Phase 0 results (local proxy, no TV)

Measured 2026-10-30 on a Windows desktop, Chrome 155 headless, 1920x1080,
CDP `Emulation.setCPUThrottlingRate`, widget served over HTTP from
127.0.0.1, fake 12,000-channel M3U (60 groups, local logos). Ranges cover
four runs for startup and two for scrolling. Throttling slows the CPU only,
not the GPU, memory or storage of a TV: a proxy, not the verdict. A 2023
Samsung TV CPU is expected somewhere around the 4x-6x rows; the TV probes
give the real numbers.

| Measure                                                    | 1x             | 4x                 | 6x                 |
| ---------------------------------------------------------- | -------------- | ------------------ | ------------------ |
| Cold start: first render (splash replaced)                 | 0.3-0.6 s      | 1.0-1.5 s          | 1.6-2.4 s          |
| Cold start: **ready** (dashboard settled)                  | 0.8-1.7 s      | 3.7-6.5 s          | **7.0-9.5 s**      |
| Start with the 12k playlist saved: ready (warm HTTP cache) | 0.5-0.6 s      | 2.2-2.9 s          | 4.1-5.2 s          |
| JS heap at ready (cold)                                    | 17 MB          | 17 MB              | 17 MB              |
| Import 12k M3U file (parse + save + open list)             | 0.6-0.7 s      | 3.9-5.4 s          | 6.8-10.3 s         |
| JS heap after import and scrolling                         | 40 MB          | 68-69 MB           | 68-69 MB           |
| Fling scroll: fps (longest frame)                          | 119 (17-33 ms) | 15-25 (92-142 ms)  | 8-16 (142-234 ms)  |
| Remote pace, 1 row / 100 ms: fps (longest frame)           | 119 (10-17 ms) | 82-105 (50-167 ms) | 67-89 (117-167 ms) |
| Jump to end of list                                        | 16 ms          | 74-114 ms          | 122-194 ms         |
| Freeze (frame gap 500 ms or more)                          | none           | none               | none               |
| Requests to other hosts                                    | none           | none               | none               |

Post-rebase smoke (2026-11-03, Chrome 156, 1x): first render 389 ms, ready
1,001 ms, saved-playlist ready 594 ms, import 747 ms; 12,000 rows, no freeze
and no external requests. The historical 4x/6x ranges above were not rerun.

Bundle remeasured 2026-11-03 (production `web:build:tizen`, probes included;
MB/KB below use binary units):

|                                                                                          | Size                                                                                             |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Initial path (`renderer.initialBytes`: index, scripts, styles, preloads, static imports) | 1,215,662 B (1.16 MB)                                                                            |
| JavaScript loaded during cold start                                                      | 5.6 MB in 57 files (largest: 2.9 MB shared chunk with the player engines, 0.8 MB, 0.3 MB `main`) |
| All JavaScript                                                                           | 7.84 MB in 179 files (2.17 MB gzip)                                                              |
| CSS                                                                                      | 280 KB                                                                                           |
| Widget / unsigned `.wgt`                                                                 | 15.93 MB / 7.03 MB                                                                               |

Reading: startup is CPU-bound in parsing and compiling JavaScript, and
grows almost linearly with throttling; at 6x it straddles the 8 s limit. A
long list never freezes; a fast fling stutters at 4x and above, while
scrolling at remote speed stays fluid. The 2.9 MB chunk on the startup path
is the first thing to cut if the TV is slow (phase 5).

`file-origin-check`: the widget boots from `file://` to the dashboard with
the route in the fragment (`#/workspace/dashboard`), no probe or console
errors and uncapped readiness. Before the rebase, importing the fake playlist
by URL through a web-backend (the TV check above) was also run from `file://`:
12,000 rows, scroll probe ran, no freeze.

## Blockers and work for phases 1-3

Found while building phase 0, roughly in the order they can stop the TV run:

1. **Web engine version (decides the size of everything else).** Tizen 7.0
   ships Chromium M94; Tizen OS upgrades ship a newer engine (the owner's
   Q60C reported Tizen 9.0 after updates). The badge prints the real engine.
   `tizen:compat-scan` lists what the current build uses that M94 lacks:
   `color-mix()` in 723 places (Material 3 colours: wrong or missing colours),
   container queries (54), `:has()` (29), `text-wrap` (17), cascade layers (7),
   dynamic viewport units (3), `AbortSignal.timeout` (7, source sync),
   `structuredClone` (2, one in the playlists service on the startup path) and
   `Promise.withResolvers`
   (37, shaka-player supplies a feature-guarded polyfill). The scan covers
   180 JS/CSS files; ES2022 syntax is fine.
   On M94 the JS gaps need polyfills (small) and the CSS needs a lowering
   step or overrides (large). On M108+ only `color-mix()`/`text-wrap` remain,
   on M120+ nothing material.
2. **ES modules from the widget.** The Angular build is ES modules with
   dynamic imports. Desktop Chromium refuses module scripts from `file://`
   unless file access from files is allowed (`file-origin-check` runs with
   it). Tizen's runtime is expected to allow it for packaged widgets, but
   only the TV can confirm: if not, the badge reports resource/script errors
   and `splash never removed`.
3. **Routing on `file:`.** Fixed in phase 0: path routing threw
   `SecurityError` in `history.replaceState`; the tizen build uses hash
   routing and `<base href="index.html">`.
4. **Backend dependency (phase 1).** M3U-by-URL, Xtream and Stalker go
   through `apps/web-backend` (`/parse`, `/xtream`, `/stalker`); the
   production default `BACKEND_URL` is a public parser service. A TV runtime
   capability with a direct data service (Jo-TV proves direct provider
   requests work from a widget with `<access origin="*">`) replaces it. M3U
   file import already parses in the browser. XMLTV stays off as in the PWA.
5. **Service worker.** Off in the tizen build and never registered on
   `file:`; nothing else needed. The manifest link is harmless.
6. **Storage.** IndexedDB and localStorage as in the PWA; quotas on the TV
   unknown (a 12k playlist adds about 25-50 MB of JS heap locally). Data
   survives reinstalls of the same package; check after a TV restart.
7. **Player (phase 2).** hls.js/mpegts.js via MSE as on the web; an AVPlay
   adapter for what MSE cannot play; stop on `visibilitychange` so only one
   provider connection is open. The startup path loads a 2.9 MB shared chunk
   that includes the player engines (esbuild merges them with code the
   dashboard needs): the main lever for startup time (phase 5).
8. **Focus and remote (phase 3).** No spatial navigation: Material UI is
   mouse/keyboard-tab driven; Return must map to back (`hwkey-event` is on);
   media keys need `tizen.tvinputdevice.registerKey`; text sizes are desktop
   sizes on a 1920x1080 TV.
9. **Fling scrolling** drops to 8-25 fps under 4-6x throttling, while the
   remote pace (one row per 100 ms) stays at 67-105 fps with no freeze.

Size estimates (one developer, after a go): phase 1 direct data and
IndexedDB about 1.5-2 weeks; phase 2 player with AVPlay about 1.5-2 weeks;
phase 3 remote navigation across the whole Material UI about 3-4 weeks (the
largest). If the engine is M94, add about 1 week of compatibility work
(polyfills plus CSS lowering/overrides) before phase 1.
