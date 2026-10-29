# Downloaded subtitles (#30)

In **Settings → Subtitles download**, enter your own **OpenSubtitles API key**
with the TV keyboard and choose **Save**. The input is masked. **Test key**
runs a search without downloading anything and reports **Key works**, a bad key,
or no connection. **Remove key** stops new searches and downloads; already
cached subtitles can still play. No OpenSubtitles login or password is needed.

**Subtitle languages** cycles through English, Arabic, Arabic + English and
the current app language when different (an older language choice stays available
after changing the app language). The API key is shared by all profiles;
the language choice belongs to each profile.

While watching a movie or episode, press **UP**, then select **Download
subtitles…**. Choose a result with **UP/DOWN → OK**; each result shows its
language, release name, download count ("⬇ 48,213"), reason marks and a
hearing-impaired label when supplied.
There are at most ten results, best fit first (see Ranking below). **Return**
cancels the dialog. Live TV has no
download option. Searches use a known TMDB id, then IMDb id, then title and
year; episodes use the show's identity with season and episode numbers.

## Ranking and the movie hash

The search asks for up to 60 results, ranks them on the TV and shows the best ten.
Score, highest weight first: (1) a movie-hash match (`moviehash_match`), (2) a subtitle
frame rate equal to the video's (within 0.01, so 23.976 and 23.98 match), (3) release-name
words matching the video's resolution (2160p, 1080p, 720p, 480p) and codec (x264/h264/avc
or x265/h265/hevc), (4) more downloads and `from_trusted`, (5) `ai_translated` or
`machine_translated` results last (listed, never hidden). The first row is labelled
**★ Recommended** and has focus when the list opens; nothing is ever chosen
automatically, and a machine translation is never recommended. Marks (hash, fps,
resolution, codec with ✓) show why a row ranked. The container (mkv/mp4) is not a signal.
Scoring lives in `js/subtitle-rank.js`.

Video facts come from the provider's `get_vod_info` / `get_series_info` (`info.video`
width, height, codec_name, r_frame_rate or avg_frame_rate). Every field is optional;
missing facts simply do not score.

The movie hash (`js/movie-hash.js`) is the OpenSubtitles hash: file size plus the 64-bit
little-endian words of the first and last 64 KiB, modulo 2^64, as 16 hex digits. It is
computed only for movies and episodes and only when an API key is saved, in the pre-play
stage next to the redirect lookup, before AVPlay or HTML video opens, so it never overlaps
the stream (ADR 0006). Two range requests (`bytes=0-65535`, then the last 64 KiB) go to the
provider only, with a 2 s total budget; on a timeout, a server that ignores ranges, an
error or a file under 64 KiB the hash is skipped and playback continues unchanged. The hash
is cached per title in memory and in `iptvnator-tv:movie-hashes` (newest 200), so replays
skip the requests. The log says only `moviehash ok` or `moviehash skipped <reason>`.

The same pre-play stage reads each new movie or episode's sound tracks for AVPlay's
Audio list (#55, `js/media-sniff.js`): codec, language and channels from the Matroska
Tracks element or the MP4 trak boxes in the first 64 KiB, reusing the block the hash just
read (Matroska files without the list there also have their last 64 KiB read). Same 2 s budget;
the result, or "no list found", is kept per title in `iptvnator-tv:sniff-tracks` (newest 50).
Tracks AVPlay leaves out (DTS, TrueHD) show as "Not supported on this TV". The language
picked there is kept per show and as the latest pick (`js/audio-choice.js`, per profile),
and the next episode or movie starts in it when the file has it.

Subtitles follow the current playback position on AVPlay and HTML video,
including pause and seek, in the same subtitle style set in Settings. The player
menu's **Off** hides them. Selecting an embedded subtitle track also turns
downloaded subtitles off. **Subtitle delay −0.5 s / +0.5 s** adjusts their timing;
a positive offset makes subtitles appear later. The menu shows the current offset.

The API's free allowance is 100 downloads per day (owner-verified API contract,
2026-10-27). A successful download shows the remaining allowance when fewer than
ten remain. A quota error shows its reset date/time or duration when supplied.
Searches and **Test key** do not call the download endpoint.

Downloaded SRT or VTT text is cached by OpenSubtitles file id in shared TV
localStorage, capped at 750,000 serialized characters (about 1.5 MB), evicting
oldest downloads first. Individual files above 500,000 characters are refused.
The selected file and delay are saved per profile, source and Progress id for
the most recently changed 200 titles. Reopening a title uses its cached text
without an API request or quota use. After eviction, select a result again to
download it. Storage being full can prevent remembering a download.

The key is stored locally in `iptvnator-tv:shared-settings` as
`opensubtitlesApiKey`, without encryption, like the TMDB key. Remove it before
giving the TV to someone else. Searches send the title's identifiers or name,
year and episode numbers, chosen languages and, when computed, the 16-digit movie hash
to OpenSubtitles. The hash requests go to your provider only; OpenSubtitles receives the
hash, never the file or any part of it. Downloads send
the file id; the temporary file host receives no API key. No source credentials
or video links are sent to OpenSubtitles. Keys, temporary download links and
full URLs are never logged or cached. Subtitle requests do not open a video
stream. Requests send an app-named User-Agent and X-User-Agent; the app never
changes the TV engine's own User-Agent, which providers' servers also see.
Automated checks use fixtures.
