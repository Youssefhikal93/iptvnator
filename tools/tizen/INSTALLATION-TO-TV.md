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
`package.json`) are not committed; download them once:

```powershell
cd <repo>\tools\tizen\tv-app; mkdir vendor -Force
curl.exe -sSfL -o vendor\hls.min.js https://cdn.jsdelivr.net/npm/hls.js@1.7.3/dist/hls.min.js
curl.exe -sSfL -o vendor\mpegts.js https://cdn.jsdelivr.net/npm/mpegts.js@1.8.2/dist/mpegts.js
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

- **Loading and failures**: grey rows and cards pulse while a list loads.
  Empty lists explain how to add or find items. If a source cannot load,
  Retry takes the focus; press OK to try the same load again. The app also
  retries after 2, 5, 10 and 30 seconds, pausing while you watch or the app
  is hidden. A successful load returns to the same list position. Playback
  failures offer Retry playback and Back; LEFT/RIGHT chooses a button, OK
  presses it, and Return goes back. Unreadable saved sources stay untouched;
  Retry reads them again.

- **Home** (opens on start unless resuming a channel): a banner for up to 3 things you are watching
  (Continue watching, Details, ‹ › to switch), then rows: Continue
  watching, Live now on your favorite channels, Favorite movies and series,
  Recently added movies and series, Recently watched channels. ◀ ▶ within
  a row, ▲ ▼ between rows, OK opens, hold OK for options.
- **Sources** (left rail): add an Xtream account or an M3U link, switch
  between them, or remove one (press OK twice).
- **Settings** (bottom of the rail, available without a source): UP/DOWN
  selects a row, RIGHT or OK picks the next choice, LEFT the previous one.
  LEFT at the first choice or Return goes back to the rail. Changes save
  immediately for all sources: autoplay (Off, 5, 8 or 15 s), Skip intro
  length (60, 75, 90 or 120 s), now and next On/Off, Cinema or compact
  Showcase Home layout, List/Grid for each section, default Movies/Series
  sort, and Last channel/Home on start. Turning now and next off stops
  programme fetching and hides programme lines everywhere. Default sort
  applies only where no sort has been chosen for that source and section.
  About shows the app version and the install guide name.
- **▲ at the top of a list** reaches the search bar and the list / grid
  buttons. Results follow the typing; the SmartThings phone app keyboard is
  easier than the remote.
- **OK** opens or plays; **hold OK** opens the options menu (favorites,
  remove from Continue watching or Recently watched).
- **Sort in Movies and Series**: at the top of an item list, press Up, then
  Right three times to reach Sort and OK to choose Newest, Oldest, Name A-Z,
  Name Z-A, Top rated or Provider order. The current choice is marked; choosing
  one returns focus to the first item. Newest is the initial default (change
  it in Settings), and the choice is saved separately for each source and
  section, including search and
  Favorites. The header shows the order. Recently added is the first category
  when dated items exist: up to 50, always newest first by catalogue date,
  regardless of release year. Sort is hidden there, in Recently watched and
  Continue watching, and for Live TV and M3U sources.
- **Movies**: OK opens a detail page (artwork, year, rating, genre, length,
  plot, cast) with Play or Resume from X / Start over, Favorites, Trailer
  (when the provider has one; it plays from YouTube) and More for a long
  plot. Return goes back to the list. Hold OK → Play skips the page.
- **Series**: OK opens the show's page. The main button continues the
  last episode watched, or plays the next one. ▼ goes to the episodes
  (thumbnail, length, plot, progress); ▲ from the first episode reaches the
  season pills (◀ ▶), which show how many episodes of the season are
  watched.
- **Watched**: hold OK on a movie or show in a list or on Home to mark it
  watched or unwatched. A show applies the change to all its episodes.
  On a show's detail page, hold OK on an episode for episode and season
  actions. A tick marks watched items; season counts and the next episode
  button update immediately. Watched items leave Continue watching.
- **Player**: OK pauses, ◀ ▶ seek (faster when repeated), ▲ audio,
  subtitles and speed, ▼ the buttons row (Skip intro, Next episode,
  Episodes, Audio & subtitles). Episodes show an Up next card near the end
  and by default the next one plays 8 s after the current one ends.
  Settings can change the countdown or turn autoplay off; Up next still
  offers OK to play. Skip intro jumps 90 s by default, adjustable in
  Settings: Xtream has no intro markers. Live TV: ▲▼ or CH change channel,
  OK shows now and next with times, description and progress when enabled.
- **Resume**: saved progress is kept until playback confirms the jump, including
  when you seek with LEFT/RIGHT. If the jump cannot be confirmed within 30 seconds,
  playback pauses: LEFT/RIGHT chooses Retry or Start over, OK runs it, and Return
  leaves the player. Retry reads the saved progress again; Start over plays from
  the beginning.
- **Live TV rows** (Xtream) show the programme on now and its progress,
  fetched for the channels on screen once scrolling stops.
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
