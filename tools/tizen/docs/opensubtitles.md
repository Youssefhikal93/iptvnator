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
language, release name, download count and a hearing-impaired label when supplied.
There are at most ten results. **Return** cancels the dialog. Live TV has no
download option. Searches use a known TMDB id, then IMDb id, then title and
year; episodes use the show's identity with season and episode numbers.

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
year and episode numbers plus chosen languages to OpenSubtitles. Downloads send
the file id; the temporary file host receives no API key. No source credentials
or video links are sent to OpenSubtitles. Keys, temporary download links and
full URLs are never logged or cached. Subtitle requests do not open a video
stream. Requests send an app-named User-Agent and X-User-Agent; the app never
changes the TV engine's own User-Agent, which providers' servers also see.
Automated checks use fixtures.
