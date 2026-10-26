# Only one stream plays at a time

The app never opens a second stream while one is playing: changing channel or episode stops the current one first, and leaving the app (Home or Source button) stops playback. The viewer's Xtream account allows one connection (`max_connections: 1`), and a second stream makes the provider refuse or drop both. Features such as a live preview next to the list (#32) or reconnecting a dropped stream (#14) must keep to this.
