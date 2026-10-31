# Only one stream plays at a time

The app never opens a second stream while one is playing: changing channel or episode stops the current one first, and leaving the app (Home or Source button) stops playback. The viewer's Xtream account allows one connection (`max_connections: 1`), and a second stream makes the provider refuse or drop both. Features such as a live preview next to the list (#32) must keep to this. Reconnecting a dropped live stream (#14, `js/player-reconnect.js`) does: it closes the old stream, waits its backoff, then opens one new one, and Return or zapping cancels it.

## Exception: explicit Multi-view (#77)

The viewer may now choose Multi-view from the live player menu or Blue.
It releases the full-screen stream before opening independent HTML video
tiles. This explicit action permits simultaneous connections regardless of
the account's reported limit. A refused tile offers Retry; other tiles keep
their engines. Ordinary playback, live preview and reconnect retain the
single-stream rule. AVPlay is never used for tiles because it is a singleton.
