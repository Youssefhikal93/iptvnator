# Each stream tries a chain of players

A playback request carries an ordered list of players to try. Live channels try mpegts.js, then hls.js, then Samsung's AVPlay; movies and episodes try AVPlay first (it reads MKV audio and subtitle tracks), then hls.js for `.m3u8`, then the browser's `<video>`. No single player handles every provider stream on Tizen, and falling through keeps playback working when one fails.

## Consequences

- On the TQ55Q60C (Tizen 9), AVPlay currently fails `prepare` for every movie, so they play in `<video>` without MKV audio or subtitle choice (#29).
- The player shows what is available for the player that won, so track menus differ between streams.
