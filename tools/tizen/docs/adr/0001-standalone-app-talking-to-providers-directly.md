# A standalone TV app that talks to providers directly

The TV app is a small plain-JavaScript web app packaged for Tizen (`tools/tizen/tv-app`), not a port of the Angular desktop app and not upstream's LG TV app. It calls Xtream and M3U providers straight from the TV, because the TV must work with the laptop off and the viewer has no always-on machine at home. A packaged Tizen app is not limited by CORS (`<access origin="*">`), so no proxy is needed.

## Considered options

- **Port the Angular app** (issue #18): too heavy for the TV's Chromium and its memory, and it brings Electron/desktop assumptions. Kept as a later phase.
- **Package upstream's LG webOS app** (`apps/tv`, 4gray/iptvnator#2003): it sends every provider request through IPTVnator's backend server, so a PC or NAS must stay on. Rejected for that reason; its features are copied one by one instead (see [upstream-lg-app.md](../upstream-lg-app.md)).

## Consequences

- Provider logic (Xtream URLs, M3U parsing) is written again in `js/xtream.js` and `js/m3u.js` instead of reusing the desktop libraries.
- Anything that needs a server (phone QR setup, sync between devices) is out of reach unless the viewer adds one (#28).
