# Only one stream plays at a time

The app never opens a second stream while one is playing: changing channel or episode stops the current one first, and leaving the app (Home or Source button) stops playback. The viewer's Xtream account allows one connection (`max_connections: 1`), and a second stream makes the provider refuse or drop both. Features such as a live preview next to the list (#32) must keep to this. Reconnecting a dropped live stream (#14, `js/player-reconnect.js`) does: it closes the old stream, waits its backoff, then opens one new one, and Return or zapping cancels it.
