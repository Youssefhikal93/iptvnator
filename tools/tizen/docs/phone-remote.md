# Jotv phone remote (#93)

The independent `IPTVnTVApp.PhoneRemote` service listens on port 8778 while
Jotv is open. Add from phone remains on its own service and port 8777.
`js/phone-remote.js` connects the app, `js/remote-app.js` maps app state and
commands, and `js/remote-settings.js` owns pairing management.

Settings > General draws each paired phone's name and last-used time beside
Rename and Forget pills (#95). Left/Right select an action and OK runs it;
Up/Down move to the next row. Forget all phones remains below the list and
still asks for confirmation. The phone page uses the same rounded controls
and filled accent focus, with its D-pad geometry and script CSP unchanged.

The service resolves Tizen's `wgt-private` directory and atomically saves
`phone-remote.json` there, outside ProfileStore. It contains random 256-bit
phone keys, independent IDs, names and last-used timestamps. It survives app
restarts and profile changes, and is removed on uninstall. Filesystem read
and write privileges are declared in `config.xml`. The local tests supply a
temporary file and run the same HTTP server and session implementation.

## Protocol

The page and JSON payloads disable caching. Loopback `/app/*` requests accept the app's
opaque origin and local browser test origins; other origins get 404. Literal
IP hostnames prevent DNS rebinding into the loopback control endpoints.

| Endpoint | Caller and behavior |
| --- | --- |
| `POST /app/state` | TV publishes a sanitized snapshot and renews its heartbeat. |
| `GET /app/events?since=N` | TV holds one request for commands, up to 20 seconds; responses include pairing metadata. |
| `POST /app/pair` | TV creates a new, single-use, ten-minute code and QR URL. |
| `GET /app/phones` | TV reads names, IDs and last-used times; no phone keys. |
| `POST /app/rename` | TV renames an ID. |
| `POST /app/forget` | TV revokes an ID, or `all`, including held phone requests and queued commands. |
| `GET /` | Self-contained phone shell, with the TV's words and a hashed script CSP. |
| `POST /pair` | Redeems a code for a phone key; a sixth phone receives 409. |
| `GET /events?since=N` | Authenticated phone holds for state changes, up to 20 seconds. |
| `POST /command` | Authenticated phone sends a key, jump, context action or text update. |

The QR carries its code in `#pair=…`, then the phone removes it after pairing.
The browser stores its key in localStorage. Rescanning in a paired browser reuses
its key without taking another pairing slot. Authenticated requests carry
`Authorization: Bearer …`; unknown or forgotten keys get 404. Phone requests
are same-origin only. No external scripts, fonts, artwork or other resources
are loaded. The service logs no requests, keys, text, codes or addresses.

Phone commands are ordered and immediately release the held TV request.
State is broadcast separately to every phone. DOM, input and focus changes
schedule a state update after 25 ms; playback progress is sampled each second.
A five-second heartbeat keeps the service alive even on an unchanged screen.
A browser preview without the Tizen launch capability probes once and stays
quiet when no local remote service exists; opening Pair a phone can connect it.
A broken TV command connection immediately marks the app offline and discards
queued commands. The service closes itself after 30 seconds without the app. Page exit sends
an offline snapshot when the browser permits it; network failure retries on
the phone every 1.5 seconds. A page already open can reconnect after the
service restarts. Reloading a page while the TV's server is down cannot load
it; reopen the bookmark once Jotv is open.

`RemoteApp` dispatches the physical key codes as bubbling, cancelable keydown
and keyup events through Jotv's existing document handlers, including held-OK
menus and tap completion and screen-saver handling. Synthetic Enter activates a native
button only when the key handler did not consume it. Volume codes additionally
use Tizen's `tizen.tvaudiocontrol` API and the `tv.audio` privilege, since synthetic events cannot trigger the
firmware's volume handling. Seek uses the player's existing rewind/fast-forward
codes and accelerating steps.

Context actions reuse player, detail and menu action closures, checking
availability again on receipt. Jumps use Browser's section, search, guide and
library functions. Favorites selects the current section's Favorites category,
or Live TV when outside a catalogue section. Playing films/episodes and detail
pages retain their Movies/Series scope even when opened from Home. Remote text carries a focus
identity, so delayed text cannot enter a different field. Password values are
never sent back to phones. Phone keyboard opening remains subject to mobile
browser focus policies; tapping its text box opens the native keyboard.

## Validation

From `tools/tizen/tests`, with the Node version in `.nvmrc`, the ignored vendor
scripts and generated local media installed as described in the TV setup docs:

```powershell
node --test unit
$env:TV_TEST_PORT='8251'; $env:NO_COLOR='1'
npx playwright test --trace=off --reporter=line specs/phone-remote.spec.js specs/phone-source.spec.js specs/settings.spec.js
npx playwright test --trace=off --reporter=line
```

These cover the real local service and a second phone browser page against the
fake provider. Device installation, Tizen service storage, Samsung volume and
mobile keyboard policies need hardware validation; no TV deployment is part
of the local suite.

Samsung API references: [TV audio control](https://developer.samsung.com/smarttv/develop/api-references/tizen-web-device-api-references/tvaudiocontrol-api.html) and [private file storage](https://developer.samsung.com/smarttv/develop/guides/data-handling/managing-file-operations.html).
