# Installation to a Samsung TV

How to install the IPTVnator Tizen app on a Samsung smart TV from a Windows
PC. It was written while setting up a 2023 QLED (`Q60C`, Tizen 9.0 after
updates); other Tizen TVs from 2017 onwards follow the same flow.

> Status: all steps are verified on a `TQ55Q60CAUXXC`: the TV logs in to an
> Xtream provider directly and plays live TS through `mpegts.js` (the
> library IPTVnator's web player uses).
>
> Two apps live here: `tools/tizen/tv-app` is the standalone **IPTVnator TV
> app** (Xtream and M3U sources, live TV, movies, series, favorites, continue
> watching), and `tools/tizen/probe` is a small connectivity test. Steps 8–9
> install the TV app; step 10 covers the probe.
>
> For developers: the app's vocabulary, past decisions and the comparison
> with upstream's LG TV app are in [docs/](./docs/CONTEXT.md).

## Testing in a browser

The [browser regression suite](./tests/README.md) runs the TV app against a
local fake provider in system Chrome. From `tools/tizen/tests`, run
`npm run media` once (ffmpeg must be on PATH), then `npm test`.

## What you need

- A Windows PC on the **same Wi-Fi/network** as the TV. It is only needed to
  install the app; afterwards the TV runs the app without it.
- A **Samsung account** (free) for the signing certificate.
- The **SmartThings** phone app or a USB keyboard if the TV remote has no
  number buttons.

## 1. Install Tizen Studio with IDE (PC)

Use the **IDE** installer, not the CLI-only one (see Troubleshooting).

1. Download it from the official Tizen site:
   <https://download.tizen.org/sdk/Installer/tizen-studio_6.1/web-ide_Tizen_Studio_6.1_windows-64.exe>
   (about 660 MB; newer versions live in <https://download.tizen.org/sdk/Installer/>).
2. Run it, accept the licence, keep `C:\tizen-studio` and
   `C:\tizen-studio-data`, click **Install**.

## 2. Install the Samsung TV extensions (PC)

1. When the installer finishes, open **Package Manager**. Do not click
   **Updates available** and install nothing on the **Main SDK** tab.
2. Open the **Extension SDK** tab and click **install** on:
   - **TV Extensions** (highest version listed, e.g. `TV Extensions-10.0`)
   - **Samsung Certificate Extension** (not the Wearable one)
3. Accept licences and wait until the Progress tab shows 100%. Close
   Package Manager.

## 3. Find the PC's IP address

```powershell
(Get-NetIPAddress -AddressFamily IPv4 | Where-Object PrefixOrigin -eq Dhcp).IPAddress
```

Example: `192.168.0.21`. The TV needs it in the next step.

## 4. Turn on Developer Mode on the TV

1. Make sure the TV is online and the Smart Hub terms are accepted
   (**Settings → General & Privacy → Terms & Privacy**). Signing in to a
   Samsung account on the TV also helps.
2. Press **Home** and open **Apps**. Wait until the store page fully loads.
   Do not put the cursor in the search box.
3. Type **1 2 3 4 5**. Remotes without number buttons: use the number pad in
   the **SmartThings** phone app (TV → Remote → **123**), or a USB keyboard.
   The on-screen number pad of the TV often does **not** work.
4. In the **Developer Mode** window: switch **On**, enter the PC IP from step
   3 as **Host PC IP**, press **OK**.
5. **Unplug the TV for 30 seconds** and plug it back in. Turning it off with
   the remote is not enough (Instant On keeps it running).
6. Open **Apps** again: it now shows **Developer Mode** at the top.

## 5. Find the TV's IP address

Either read it on the TV (**Settings → General & Privacy → Network → Network
Status → IP Settings**) or let the PC find it. Samsung TVs answer on port
8001 with their model and Developer Mode state:

```powershell
1..254 | ForEach-Object { $ip = "192.168.0.$_"
  try { $r = Invoke-RestMethod -TimeoutSec 1 "http://${ip}:8001/api/v2/"
        "$ip $($r.device.modelName) developerMode=$($r.device.developerMode) developerIP=$($r.device.developerIP)" } catch {} }
```

Adjust `192.168.0.` to your network. Before the restart in step 4 the TV
reports `developerMode=0`; afterwards `developerMode=1` and `developerIP` is
the PC's address.

## 6. Connect the PC to the TV

```powershell
C:\tizen-studio\tools\sdb.exe connect <TV-IP>
C:\tizen-studio\tools\sdb.exe devices
```

`devices` lists the TV, for example `192.168.0.18:26101  device  TQ55Q60CAUXXC`.
Useful checks:

```powershell
# Tizen version and whether a Samsung certificate is required (secure_protocol:enabled)
C:\tizen-studio\tools\sdb.exe -s <TV-IP>:26101 capability
# The TV's DUID, which the Samsung distributor certificate must include
C:\tizen-studio\tools\sdb.exe -s <TV-IP>:26101 shell 0 getduid
```

## 7. Create a Samsung certificate (PC, once)

TVs with `secure_protocol:enabled` only install apps signed with a Samsung
certificate that lists the TV's DUID.

1. Keep the TV connected (step 6) so its DUID is picked up automatically.
2. Start the Certificate Manager through its script; `certificate-manager.exe`
   started directly from another folder exits silently:

   ```powershell
   Start-Process cmd.exe -ArgumentList '/c','C:\tizen-studio\tools\certificate-manager\CertificateManager.bat' `
     -WorkingDirectory C:\tizen-studio\tools\certificate-manager -WindowStyle Hidden
   ```

3. Click **+**. Device type: **TV** (Samsung is implied), **Next**.
4. **Create a new certificate profile** named `iptvnator-tv`.
5. Author certificate: create a new one (name and password of your choice),
   then sign in with your Samsung account when the browser opens.
6. Distributor certificate: **Create a new distributor certificate**, keep
   privilege **Public**, check that the TV's DUID is in the list (add it
   from step 6 if not), sign in again if asked.
7. Finish. The main window shows the profile with a check mark, an author
   certificate "Verified by: Samsung VD Author CA" and a distributor
   certificate "Verified by: VD DEVELOPER Public CA Class". Both expire
   after one year; recreate the profile then. Certificates are stored in
   `%USERPROFILE%\SamsungCertificate\iptvnator-tv\`. The profile is listed by:

   ```powershell
   C:\tizen-studio\tools\ide\bin\tizen.bat security-profiles list
   ```

## 8. Package the app (PC)

The `vendor/` scripts (`hls.js` 1.7.3, `mpegts.js` 1.8.2, same versions as
`package.json`; `preact` 10.24.3 and `htm` 3.1.1 for the screens, see
[ADR 0009](docs/adr/0009-screens-in-preact-with-htm.md)) are not committed;
download them once:

```powershell
cd <repo>\tools\tizen\tv-app; mkdir vendor -Force
curl.exe -sSfL -o vendor\hls.min.js https://cdn.jsdelivr.net/npm/hls.js@1.7.3/dist/hls.min.js
curl.exe -sSfL -o vendor\mpegts.js https://cdn.jsdelivr.net/npm/mpegts.js@1.8.2/dist/mpegts.js
curl.exe -sSfL -o vendor\preact.umd.js https://cdn.jsdelivr.net/npm/preact@10.24.3/dist/preact.umd.js
curl.exe -sSfL -o vendor\htm.umd.js https://cdn.jsdelivr.net/npm/htm@3.1.1/dist/htm.umd.js
```

Package a copy so signature files and the `.wgt` stay out of the repo:

```powershell
$build = "$env:TEMP\iptvnator-tv"
Remove-Item -Recurse -Force $build -ErrorAction SilentlyContinue
Copy-Item -Recurse <repo>\tools\tizen\tv-app $build
Remove-Item "$build\*.wgt" -ErrorAction SilentlyContinue
C:\tizen-studio\tools\ide\bin\tizen.bat package -t wgt -s iptvnator-tv -- $build
Get-ChildItem $build -Filter *.wgt | Rename-Item -NewName iptvnator.wgt
```

No password prompt: the profile stores it. The rename matters: `tizen install`
fails on file names with spaces.

## 9. Install and start the app on the TV

```powershell
cd $build
C:\tizen-studio\tools\ide\bin\tizen.bat install -n iptvnator.wgt -s <TV-IP>:26101 -- .
C:\tizen-studio\tools\ide\bin\tizen.bat run -p IPTVnTVApp.IPTVnator -s <TV-IP>:26101
```

Expected output: `Tizen application is successfully installed.` and
`Tizen application is successfully launched.`

The app appears under **Apps** on the TV and starts from there; the PC can be
off. Saved sources, favorites and progress stay on the TV across updates.

### Updating the TV app

With the TV on and in Developer Mode (step 4), run from the repository root:

```powershell
git pull
.\tools\tizen\deploy-tv.ps1                       # TV at 192.168.0.18
.\tools\tizen\deploy-tv.ps1 -TvIp 192.168.0.50    # another TV
```

The script connects to the TV (step 6), then runs steps 8 and 9: it packages
a copy of `tools\tizen\tv-app`, signs it with the `iptvnator-tv` profile
(`-CertProfile` to change), installs it and starts it. The `vendor` scripts
from step 8 must already be downloaded.

### Using the TV app

- **Downloaded subtitles (optional)**: save your own **OpenSubtitles API key**
  in **Settings → Subtitles download**, use **Test key**, and choose **Subtitle
  languages** with **OK/RIGHT**. While watching a movie or episode, press **UP →
  Download subtitles…**, then **UP/DOWN → OK** on a match. **Return** cancels;
  the player menu's **Off** hides subtitles. **Subtitle delay −0.5 s / +0.5 s**
  adjusts timing and remembers it for the title. Reopening restores a cached
  subtitle without another download. Results are ranked: the best fit is
  labelled **★ Recommended** and focused first (it is never chosen for you);
  rows show downloads as **⬇ 48,213** and ✓ marks for a file-hash, frame-rate,
  resolution or codec match, and machine translations sit last. The key is shared; language and title
  choices belong to each profile. See [OpenSubtitles](docs/opensubtitles.md)
  for quota, storage and privacy details.
- **Backup** (Settings, before About): **Import from link…** downloads a desktop
  backup JSON from an HTTP(S) link and previews source, favorite and progress
  counts. **Cancel** starts focused; choose **Replace** to overwrite the TV's
  sources and library, or **Merge** to keep sources and combine the library.
  **Export** warns **Contains your passwords** before preparing the backup.
  QR encoding is unavailable; **Copy to a link…** sends it to your trusted
  PUT/POST endpoint. A phone link is shown only after a successful read-back.
  The endpoint must allow CORS requests. See [backup compatibility](docs/backup.md)
  for the exact desktop fields supported and the M3U progress limitation.
- **TMDB (optional)**: in **Settings → TMDB**, press **OK** on **TMDB API key**
  to enter your own free TMDB v3 API key with the TV keyboard, then choose
  **Save**. **Test key** shows **Key works** or **Key refused**; **Remove key**
  turns it off. No TMDB requests are sent without a saved key. Movie and show
  detail pages display the source's information first, then matching TMDB
  artwork, facts and missing plots. Press **DOWN** from the buttons to **Cast**;
  **LEFT/RIGHT** selects a person and **OK** opens their biography and **In your
  library** titles. Press **DOWN** again for **Similar in your library**, then
  again for a show's episodes. **Discover**, at the top of Movies and Series
  categories, offers genre chips: choose with **LEFT/RIGHT**, press **OK**,
  then **DOWN** to matched titles. **CH ▲▼** checks another page of 12 catalogue
  titles, with at most three TMDB requests at once. **Return** goes back.
  Metadata is kept separately for seven days (failed requests for one hour).
- **TMDB language**: TMDB titles, genres, similar titles and missing source
  plots follow **Settings → Language** the next time you open a detail page.
  A missing translation of a plot falls back to English when available;
  source plots already present stay as supplied. TMDB trailers prefer your
  language, then English. Changing language keeps each language's saved
  metadata separately, including existing English metadata.
- **Sleep timer**: open the player menu with **UP** (or **Yellow** on Live TV),
  then choose Off, 15, 30, 60 or 90 minutes, or **End of episode/movie**.
  The controls show the minutes left. During the final minute, **Keep watching**
  adds the chosen duration again (or turns an end choice Off); **Return** does
  the same. LEFT/RIGHT selects **Stop now**, and OK confirms. Expiry saves
  progress, releases playback and closes the TV app; a browser returns to its
  browsing screen with a toast. Changing channels or episodes keeps the timer;
  leaving the player with Return cancels it, including a return to live preview.
  The timer is never saved across app restarts.

- **Guide link**: when adding an Xtream or M3U source, optionally enter a
  **Guide link (XMLTV)** (`.xml` or `.xml.gz`) and a time offset from -12 to
  +12 hours (LEFT/RIGHT adjusts it). For an existing source, hold **OK** on
  press **OK** on it in **Settings > Sources**, then choose **Guide link…** to edit or clear it;
  **Return** or **Cancel** leaves it unchanged. **Prefer my guide** is on
  by default for Xtream; turn it off to ask the provider first and fill
  missing channels from your link. M3U sources use the link for now and
  next. The source subtitle shows guide freshness, updating or failure.
  Guides older than 12 hours download in the background when that source
  becomes current; **Refresh guide** downloads again, keeping the saved
  guide if it fails. **Remove guide link** deletes its saved guide.

- **Loading and failures**: grey rows and cards pulse while a list loads.
  Empty lists explain how to add or find items. If a source cannot load,
  Retry takes the focus; press OK to try the same load again. The app also
  retries after 2, 5, 10 and 30 seconds, pausing while you watch or the app
  is hidden. A successful load returns to the same list position. Playback
  failures offer Retry playback and Back; LEFT/RIGHT chooses a button, OK
  presses it, and Return goes back. Unreadable saved sources stay untouched;
  Retry reads them again.
- **Dropped live streams reconnect**: when a live channel stops (a network
  blip or a provider hiccup) or freezes for about 10 seconds, the picture stays
  and "Reconnecting…" shows over it. The app closes the old stream first, then
  reopens the channel after 1, 2, 4, 8 and 15 seconds. When it plays again the
  message goes away. After the fifth failed try the Retry playback / Back
  screen appears. Return or changing channel while reconnecting cancels it.
  Movies and episodes are unchanged.

- **Home** (opens on start unless resuming a channel): a banner for up to 3 things you are watching
  (Continue watching, Details, ‹ › to switch), then rows: Continue
  watching, Live now on your favorite channels, Favorite movies and series,
  Recently added movies and series, Recently watched channels. ◀ ▶ within
  a row, ▲ ▼ between rows, OK opens, hold OK for options.
- **Sources** (the first group of **Settings**; there is no Sources item in
  the menu): add an Xtream account or an M3U link, switch
  between them, or remove one (Remove, then OK once more). OK on a source opens
  its options; with no source yet, the app opens here on Add Xtream account. Each row shows its type, the
  channel count when the saved catalogue knows it, an Xtream account's expiry
  ("Expires in 3 days" inside the last seven) and a red badge for a problem:
  **Expired**, **Inactive**, **Login failed** or **Not responding**. Opening
  Settings checks every Xtream account in the background. Under a source's
  options its details list its status, expiry date, connections in use / allowed and the output
  formats the provider allows. M3U sources show type and channel count only.
- **Account expiry**: when the Xtream account in use ends within seven days,
  a notice appears once per start (and again if the date changes). If the
  account has expired, is inactive or the login is wrong, a screen says which
  (with the expiry date), offers **Retry** and **Go to Sources** (RIGHT moves
  to it, LEFT back; it opens Settings > Sources on that source), and retries a
  few times in the background.
- **Edit source**: choose **Edit source…** in a source's options (OK on its
  row in Settings > Sources). The same form as adding opens with the name, link, username and
  password filled in. A new name or guide link only saves; a new link or
  login is checked first, then the source in use reloads. An account
  that has lapsed can still be saved, because its login works.
- **Source account**: changing the server (scheme, host or port), Xtream
  username, or M3U playlist link keeps the source's name, guide settings and
  list position, with separate favorites, recently watched lists and catalogue.
  Editing back to the previous source account restores those lists, including
  in **All sources**.
  A rename, Xtream password change or guide edit keeps the same library;
  Xtream server host case, trailing slashes and server paths do too.
- **Resume points and watched marks** also follow the source account, separately
  for each profile. Another source or a changed source account starts empty;
  editing back restores its progress. The first update copies older shared
  progress to every existing source to keep the viewer's resume points.
- **M3U movies and series**: a playlist that holds movies or episodes gets
  Movies and Series in the rail after it has downloaded; a playlist with only
  channels still shows Live TV alone. An entry counts as a movie or episode
  when its link has /movie/ or /series/, ends in .mp4, .mkv, .avi or .mov, or
  sits in a group named like VOD, Movies, Series or TV Shows. Episodes named
  like "Show S01E02", "Show 1x02" or "Show - S01 E02" are grouped into a show
  with seasons. A playlist has no plot or cast, so a movie's page shows its
  name, logo and group. Favorites, Continue watching, resume and Next episode
  work as with Xtream.
- **Profiles**: several people can share the TV. With two or more profiles the app
  starts on **Who's watching?**: LEFT/RIGHT picks a tile, OK opens that profile,
  Return exits the app. Each profile has its own favorites, recently watched,
  Continue watching, watched marks, new-episode badges, hidden and locked
  categories, PIN and settings; sources and the TMDB key are shared. The
  active profile's avatar sits above the rail: UP from Home reaches it and OK
  opens a menu to switch profiles. In
  **Settings > Profiles** (the first group): **Current profile** (OK opens
  Who's watching? to switch), **Add profile…** (up to 6; the new profile starts
  empty and opens at once), **Rename profile…**, **Delete profile** (asks to
  confirm; the last profile cannot be deleted) and **Ask who's watching on
  start** On/Off (On by default; with one profile it is never asked). Switching
  stops playback and reloads Home from the new profile. Data saved before profiles
  existed moves to the first profile, **Me**, on the first start. Backup
  export and import use the current profile.
- **Settings** (bottom of the rail, available without a source): UP/DOWN
  selects a row, RIGHT or OK picks the next choice, LEFT the previous one.
  LEFT at the first choice or Return goes back to the rail. Changes save
  immediately for all sources: autoplay (Off, 5, 8 or 15 s), Skip intro
  length (60, 75, 90 or 120 s), now and next On/Off, Cinema or compact
  Showcase Home layout, List/Grid for each section, default Movies/Series
  sort, Live preview On/Off and Last channel/Home on start. Turning now and next off stops
  programme fetching and hides programme lines everywhere. Default sort
  applies only where no sort has been chosen for that source and section.
  About shows the app version and the install guide name.
- **Language and theme** (Settings, group **Appearance**): **Language** lists
  English plus every language the desktop app translates, each by its own
  name (Deutsch, Français, 日本語, …); press OK on the row, choose one with
  UP/DOWN and OK. **Theme** switches **Dark** (default) and **Light** with OK.
  Both apply at once, are kept for all sources and survive a restart. Text the
  desktop translation lacks stays English; provider names, channel names and
  descriptions are never translated. Times and dates follow the language.
  The translation tables are `tv-app/js/i18n/<code>.js`; rebuild them from the
    desktop files with `node tests/i18n/build-tables.js` (TV appearance terms
    are kept in `tests/i18n/appearance-translations.json`).
- **Accent colour and density** (Settings, group **Appearance**): use UP/DOWN
    to reach either row, then OK or RIGHT to cycle its choices. **Accent colour**
    offers **Blue** (default), **Saffron**, **Asphalt**, **Violet** and **Pink**
    with either Dark or Light theme. **Density** offers **Comfortable** (default,
    larger rows and text, four posters across in grids and five on Home) and
    **Compact** (the original item sizes). Both apply immediately, survive a
    restart and belong to the current profile. Focused artwork grows slightly
    with a clear ring; selected categories keep accent text when focus leaves.
    The main screen keeps controls and key hints inside the TV's 5% safe area.
- **▲ at the top of a list** reaches the search bar and the list / grid
  buttons. Results follow the typing; the SmartThings phone app keyboard is
  easier than the remote.
- **OK** opens or plays; **hold OK** opens the options menu (favorites,
  remove from Continue watching or Recently watched).
- **Favorites and recents from** in Settings, under Display after Home layout:
  **This source** is the default. Choose **All sources** to merge Favorites,
  Recently watched and their Home rows. Favorites group the current source
  first; recently watched items sort by last play, with older saved items
  without a date afterwards. A source-name chip marks items from another
  source. OK switches to that source and opens the item; Return keeps that
  list in the new source. Hold OK removes the item from its own source.
- **Sort in Movies and Series**: at the top of an item list, press Up, then
  Right three times to reach Sort and OK to choose Newest, Oldest, Name A-Z,
  Name Z-A, Top rated or Provider order. The current choice is marked; choosing
  one returns focus to the first item. Newest is the initial default (change
  it in Settings), and the choice is saved separately for each source and
  section, including search and
  Favorites. The header shows the order. Recently added is the first category
  when dated items exist: up to 50, always newest first by catalogue date,
  regardless of release year. Sort is hidden there, in Recently watched and
  Continue watching, merged All sources Favorites, and for Live TV and M3U sources.
- **Trailer**: on a movie or show detail page, select **Trailer** with
  **LEFT/RIGHT** and press **OK** to open that video in the TV's YouTube app.
  Playback in IPTVnator stops first. **Return/Back** in YouTube returns to the
  same detail page. The button appears only for a trailer with YouTube available
  on the TV. In a browser, OK shows **YouTube is not available on this TV**.
- **Movies**: OK opens a detail page (artwork, year, rating, genre, length,
  plot, cast) with Play or Resume from X / Start over, Favorites, Trailer
  (when available) and More for a long
  plot. Return goes back to the list. Hold OK → Play skips the page.
- **Series**: OK opens the show's page. The main button continues the
  last episode watched, or plays the next one. ▼ goes to the episodes
  (thumbnail, length, plot, progress); ▲ from the first episode reaches the
  season pills (◀ ▶), which show how many episodes of the season are
  watched.
- **New episodes**: a favorite or recently watched show that got episodes
  since you last watched or opened it carries a **New episodes** badge in
  lists and on Home, and Home gets a **New episodes** row while any exist.
  Opening the show (or playing one of its episodes) clears the badge. It is
  decided from the provider's date for the show, so it also appears after the
  background refresh finds newer dates. Providers without dates show none.
- **Hide categories**: hold OK on a category for **Hide category**, **Hide all
  except this** or **Manage categories**. Manage categories (also under
  **Settings > Categories**, one row per section) lists every category with
  Shown / Hidden; OK toggles it, ▲ at the top reaches the search box (OK, type,
  OK again) and **Show all**. Hidden categories leave the category list, search
  results, All channels, Recently added, the Home rows (not Continue watching)
  and the channel list while watching. Favorites, Recently watched and All
  channels cannot be hidden. The choice is kept per source and section.
- **Parental lock**: set a four-digit PIN under **Settings > Parental lock >
  PIN**, then hold OK on a category and choose **Lock category**. A lock icon
  marks it. Open it with OK or RIGHT and enter the PIN using the remote's
  digits, or arrows and OK on the number pad (Clear erases; Back cancels).
  One correct PIN opens all locked categories for **Re-lock after**: 5 min,
  15 min (default), 1 hour, or until the app closes. While locked, their items
  leave Home, search, All lists, Favorites, Recently watched, Continue watching
  and the player's channel list; PRE-CH cannot return to them. Five wrong
  attempts require a 30-second wait. Change PIN, Remove PIN and Unlock category
  ask for the current PIN; Remove PIN also clears locks for every source.
- **Watched**: hold OK on a movie or show in a list or on Home to mark it
  watched or unwatched. A show applies the change to all its episodes.
  On a show's detail page, hold OK on an episode for episode and season
  actions. A tick marks watched items; season counts and the next episode
  button update immediately. Watched items leave Continue watching.
- **Progress near the end**: movies and episodes count as watched at 95 % or
  with fewer than 30 seconds left. Continue watching, watched ticks and Resume
  use the same rule, including progress saved by an older version.
- **Player**: OK pauses, ◀ ▶ seek (faster when repeated), ▲ audio,
  subtitles and speed, ▼ the buttons row (Skip intro, Next episode,
  Episodes, Audio & subtitles). Episodes show an Up next card near the end
  and by default the next one plays 8 s after the current one ends.
  Settings can change the countdown or turn autoplay off; Up next still
  offers OK to play. Skip intro jumps 90 s by default, adjustable in
  Settings: Xtream has no intro markers. Live TV: ▲▼ or CH change channel,
  OK shows now and next with times, description and progress when enabled.
- **Return while watching**: first hides visible controls, including the Live TV
  info bar after changing channel; press again with controls hidden to leave the
  player. A paused movie or episode stays paused and its controls stay hidden
  until a normal player key shows them again. Menus and other overlays handle
  Return first. **STOP** leaves playback directly; live preview keeps its usual
  Return behaviour.
- **Subtitle style and picture**: in **Settings**, the **Subtitles** group
  offers Size (Small, Medium, Large, Extra large), Text colour (White, Yellow),
  Background (Off, Shadow, Box, Cover) and Position (Bottom, Higher). **Picture**
  offers Aspect (Auto, Fit, Fill, 16:9, 4:3). Defaults are Medium, White,
  Shadow, Bottom and Auto. While watching, press **UP** (movies or episodes)
  or **Yellow** (Live TV), then select a **Subtitle style** or **Picture**
  item and press **OK** to cycle it. Changes apply immediately and are saved
  across restarts; Settings and the player menu share the same choices.
  Fit keeps the whole picture; Fill fills the screen; 16:9 and 4:3 stretch
  into a centred box of that shape. Live preview always uses Fit, restoring
  the saved aspect in full screen. Styles apply wherever subtitles appear.
  **Cover** hides subtitles burned into a provider's picture: a nearly solid
  band across the bottom 16 % of the screen appears while any subtitle (a
  downloaded or embedded track) is on, with our text centred inside it; with
  Position **Higher** the band moves up. It never shows with subtitles Off.
  Most movies currently use HTML video because of AVPlay issue #29, so
  embedded MKV subtitles do not appear there.
- **Resume**: saved progress is kept until playback confirms the jump, including
  when you seek with LEFT/RIGHT. If the jump cannot be confirmed within 30 seconds,
  playback pauses: LEFT/RIGHT chooses Retry or Start over, OK runs it, and Return
  leaves the player. Retry reads the saved progress again; Start over plays from
  the beginning.
- **Live TV rows** (Xtream) show the programme on now and its progress,
  fetched for the channels on screen once scrolling stops.
- **Catch-up** (Xtream): channels offering past programmes show a **Catch-up N days**
  badge in the list and grid. In the Guide, LEFT browses back through those days
  (up to seven); past programmes marked **↺** offer **Watch from start** when
  you press OK. Press OK again to watch. While watching live, Yellow or Info
  opens the player menu with **Watch from start** for the current programme.
  Catch-up has pause and LEFT/RIGHT seeking, with programme clock times on the
  timeline. Return goes back to the Guide or live player where you opened it;
  **Back to live** in the player menu watches the channel live. Catch-up is
  never saved to Continue watching or marked watched.
- **TV guide**: in Live TV, choose **TV guide** in the top toolbar or press
  the remote's Guide key. It opens the current category, including Favorites.
  UP/DOWN changes channel focus; LEFT/RIGHT browses programmes from two hours
  ago to 24 hours ahead. CH+/CH- or Page Up/Down jumps a screen of channels.
  OK on a programme on now watches that channel; Return from playback reopens
  the Guide. OK on another programme shows its details; OK or Return closes
  those details, except for the catch-up action above. Return from the Guide
  focuses its channel in the Live TV list.
  The button is available when the programme guide setting is On and the
  source has a guide. Rows without programmes say "No programme information".
- **Live preview**: in Live TV (list view), OK on a channel plays it in a
  box beside the list, with its now and next under it. Moving through the
  list does not change the stream; OK on another channel switches the box
  to it. OK on the playing channel goes full screen on the same stream, and
  Return from full screen with controls hidden comes back to the box. Return
  in the list stops the preview first; a second Return does what it always did.
  The preview also stops when you leave Live TV, open the TV guide, change source or
  leave the app. Turn it off in **Settings → Live preview** and OK opens
  full screen directly, as does the grid view.
- **Channel list while watching**: with live player controls hidden, press
  LEFT to open a see-through channel list on the playing channel. UP/DOWN
  move focus without changing channel; OK watches the focused channel.
  LEFT/RIGHT switch category from anywhere in the list. CH+/CH- still change
  channel and keep the list on the playing channel. Return closes the list;
  another Return stops playback and returns to Home. The list closes after
  10 seconds without a key.
- **Previous channel**: PRE-CH or Green switches between the current and
  previously watched live channel. Yellow still opens Audio & subtitles.
- **Last channel on start**: the last live channel is saved per source and
  plays on the next start if it is still in the catalogue. This is on by
  default; choose **Settings → On start open → Home** to disable it.
  Return stops playback and opens Home.
- **Start-up**: the app opens on the lists saved on the TV and refreshes
  them in the background ("Updating…" next to the source name); new
  channels, movies and episodes then appear by themselves. **Sources →
  Refresh source** throws the saved lists away and reloads them.

- **Switching sources**: each source keeps its own saved catalogue; a refresh
  finishing for the previous source does not replace the source now on screen.

### Installing on another TV

Every TV needs its own setup, but the PC part is done once:

1. On the new TV, do step 4 (Developer Mode with this PC's IP, then unplug
   for 30 s) and find its IP (step 5).
2. Connect it (step 6) and read its DUID with `getduid`.
3. The distributor certificate must list **every** TV the app goes on. Open
   the Certificate Manager (step 7), click **+**, choose **TV**, **Select an
   existing certificate profile** → `iptvnator-tv`, keep the existing author
   certificate, and **create a new distributor certificate** with the DUIDs
   of all your TVs (the old one and the new one). Without the new DUID the
   install fails with a certificate error; without the old one, later
   updates to the first TV fail.
4. Package and install with the new TV's IP (steps 8–9).

Developer Mode allows only one host PC IP; if the PC's address changes, set it
again on the TV (step 4). The remote log in `js/log.js` posts to the PC
address it was written for; on another network it fails silently and the app
works normally.

## 10. Use the probe app on the TV

Package and install it like the TV app (steps 8–9) from `tools\tizen\probe`,
with the file `probe.wgt` and the app id `IPTVnProbe.Probe`. It needs the same
`vendor/` scripts in `tools\tizen\probe\vendor`.


- **Arrow keys** move between fields and buttons, **OK** types or presses,
  **Return** stops the video or exits.
- Enter the Xtream server URL, username and password, then **Test Xtream**;
  enter an M3U link, then **Test M3U**.
- Enter a channel that plays elsewhere in **Channel name or id** (e.g.
  `bein sport hd 1`). Without it the first channel of the list is tried,
  and those are often dead.
- Green lines mean the TV reached the provider directly and played the
  stream; red lines show what failed. Typed values are remembered on the TV
  only.

### Reading the probe log on the PC

The probe also posts every (redacted) line to `REMOTE_LOG_URL` in
`probe.js` (`http://<PC-IP>:8765/log`). Run a small receiver on the PC that
appends POST bodies to a file and allows CORS; allow Node through the
Windows firewall when asked. When it is reachable, the probe runs the
Xtream test once on launch, so `tizen run` alone produces a full log.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| Developer Mode window never opens | Use the SmartThings number pad or a USB keyboard on the loaded Apps page; accept Smart Hub terms; unplug the TV for 5 minutes and retry. |
| `developerMode=0` after enabling | Unplug the TV for 30 seconds; the remote's power button keeps it in standby. |
| CLI installer + command-line package manager fails (`Cannot install updates`, `Cannot install the Tizen Studio package`, `jvm.cfg` missing, `JAXBException`) | The 6.1 CLI route migrates to the new `tizen-core` layout, deletes the bundled Java while running and cannot install the certificate extension. Delete `C:\tizen-studio` and `C:\tizen-studio-data` and use the IDE installer with the graphical Package Manager (steps 1–2). |
| Certificate Manager does not open | Start it with `CertificateManager.bat` from its own folder (step 7). |
| `tizen install` prints its help text | The `.wgt` name contains spaces; rename it (step 8). |
| Install fails with a certificate error | The distributor certificate does not include the TV's DUID; recreate it with the TV connected (step 7). |
| Every stream returns HTTP 503 | The channel is not broadcasting (common at the top of big lists) or the account's single connection is in use elsewhere (`connections 1/1`). Test a channel that plays on another device, with that device stopped. Avoid rapid retries: panels' flood protection then drops all requests (`Failed to fetch`). |
| `<video>` fails with media error 4 | Expected: the TV's native `<video>` source does not play these streams. Use `mpegts.js`/`hls.js` (as IPTVnator does) or Samsung AVPlay. |
| `sdb connect` fails | PC and TV must be on the same network and the Developer Mode Host PC IP must be this PC's current IP. |

Official reference: [Connecting a Samsung TV for development](https://developer.samsung.com/smarttv/develop/getting-started/using-sdk/tv-device.html).
