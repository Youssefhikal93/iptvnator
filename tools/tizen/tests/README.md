# Samsung TV browser regression tests

These Playwright tests run the unchanged app in `../tv-app` against the local
fake Xtream API and static host. They use system Google Chrome, a 1920×1080
viewport and real browser localStorage, IndexedDB and media playback. No TV,
provider account, browser download or external media is needed.

From this directory, with Node.js, the existing test dependencies, Google
Chrome and ffmpeg on PATH:

```sh
npm run media
npm test
```

Generate media once. The generator keeps existing files in the ignored
`media/` directory: a 400-second H.264/AAC MP4, a 60-second H.264 transport
stream, a poster and a backdrop. Delete a specific fixture to regenerate it.
On Windows PowerShell with script execution disabled, use `npm.cmd` and
`npx.cmd` for the commands here.

Run one area, or inspect discovery without launching Chrome:

```sh
npx playwright test specs/resume.spec.js
npx playwright test --list
```

Coverage is grouped by viewer journey:

| Spec | Coverage |
| --- | --- |
| `catalogue` | Live, movie and series categories/items; saved catalogue before network responses; search; persistent list/grid view |
| `now-next` | Guided and unguided live rows; player Now/Next and description |
| `movie-detail` | Plot, cast, actions, Return, Resume/Start over |
| `series-detail` | Seasons, episode rows, watched counts and progress-based main action |
| `home` | Continue watching hero/resume, favorites and recently added rows |
| `channel-list` | Drawer category/focus, preview vs playback, switching, previous-channel keys, Return ordering, startup last channel, return focus |
| `sorting` | Live sort visibility, newest, stable rating ties, oldest/undated, recently added count |
| `watched` | Movie, season and show watched actions; Continue watching removal; favorites add/remove |
| `new-episodes` | New episodes badge in lists and on Home, cleared on open or play, back after a catalogue refresh |
| `categories` | Hold-OK hide and hide-all-except, Manage categories screen, persistence, search/All channels/Home/channel list exclusion |
| `loading-errors` | Skeletons, source error/countdown/retry, playback error/focus/retry |
| `resume` | Restore and save progress; rejected seeks, real 30-second deadline and recovery |
| `settings` | Current values, programme guide requests, Showcase hero size and persistence |
| `sources` | Xtream form validation/add/switch, M3U groups, refresh, cancel and confirmed removal |
| `player` | Pause/play/seek/speed, track availability and stream info, intro skip, episode/season selection, next episode and autoplay/cancel |

Each test gets an empty browser context, seeds its own source/library state,
and resets the server failure switch before and after running. Remote actions
use keyboard events and visible focus; holding Enter opens options. Tests run
one at a time because the server failure switch is global. The resume failure
test deliberately waits for the app's real deadline. Failed tests retain a
trace and screenshot under `test-results/`.

Playwright starts `node fake-xtream/server.js` on port 8767 and reuses an
existing server there. Stop any unrelated server on that port first. To host
a different app copy or use a different port manually:

```sh
node fake-xtream/server.js /absolute/path/to/tv-app 8877
```

The root defaults to `../../tv-app` relative to `server.js`. The port comes
from the second argument after the script, then `PORT`, then 8767. Generated
image URLs follow that port. The suite itself uses port 8767.

The fake provider has a global failure switch:

- `GET /__fail?api=503` fails provider actions (login still succeeds).
- `GET /__fail?media=404` fails live, movie and episode streams.
- `GET /__fail?api=503&media=404` enables both failures.
- `GET /__fail` clears all failures.

Browser tests cover the HTML5/mpegts.js paths. Samsung AVPlay, physical remote
registration, TV installation and hardware-specific audio/subtitle tracks
still need TV validation. Trailer embedding depends on YouTube and is outside
this local suite.
