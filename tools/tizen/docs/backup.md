# Desktop-compatible backups on the TV

Settings has a Backup group immediately before About. Import from link accepts
an HTTP(S) raw JSON link, validates the complete archive, and previews counts
before Replace / Merge / Cancel. Cancel starts focused. Invalid files, failed
downloads and cancellation do not write saved data. Network requests time out
after 15 seconds; JSON responses over 5 MiB are rejected after reading them.
The endpoint must permit requests from the TV app (CORS).

Replace overwrites sources, favorites, recently watched and progress, and clears
old last-channel snapshots. Merge matches source type, normalized server/URL and
Xtream username (case sensitive), retains existing source metadata and passwords,
unions favorites, and keeps the newer timestamp for recents and progress. Ties
keep the existing entry, even if the incoming position is further along.
Writes are checked, with an in-memory snapshot used to roll back a failed write.
Successful imports restart the app to discard the old source and library views.
Existing settings, guide configuration and catalogue rows are retained.

The format is the desktop version 1 `iptvnator-playlist-backup` manifest; the
desktop contract remains [the upstream backup document](../../../docs/architecture/playlist-backup-restore.md).
`Backup.parse(desktopJson)` returns mapped TV state without writing.
`Backup.apply(state, 'replace' | 'merge')` writes library state synchronously,
then returns a Promise that waits for best-effort raw M3U catalogue storage.
`Backup.build()` returns a Promise of the desktop manifest object. It includes
passwords. A newly added M3U source needs a reachable playlist during export;
an imported source can reuse the original raw M3U until its URL changes.

## Field mapping

Library keys below use `ProfileStore.key` under `iptvnator-tv:p:<profileId>:`;
sources stay shared under `iptvnator-tv:`. `sourceId` is generated on
Replace or first import; Merge retains a matching source's existing ID.

| Desktop field | TV destination / export behavior |
| --- | --- |
| `kind`, `version` | Validate exact kind and version 1; export the same constants. |
| `exportedAt`, `includeSecrets` | Informational on import; export current ISO time and `true`. |
| `playlists[].portalType`, `title` | `sources[].type`, `name`. |
| Xtream `connection.serverUrl`, `username`, `password` | `sources[].url`, `user`, `pass`; omitted passwords become empty. |
| M3U `source.kind`, `source.url` | Only `kind: 'url'` is supported; `url` becomes `sources[].url`. |
| M3U `source.rawM3u` | IndexedDB catalogue key `sourceId\|backup:m3u` with `{ url, text }`; used to resolve saved URL identities and re-export canonical raw text without filling localStorage. |
| Xtream `userState.favorites[].contentType`, `xtreamId` | `favorites:sourceId.live/movies/series`; `movie` maps to `movies`, ID to `stream_id` or `series_id`. |
| Favorite `snapshot.title`, `posterUrl` | Library snapshot `name`, `stream_icon` / `cover`; exported back in `snapshot`. |
| Browser `collectionItems` or recent `collectionItem` title/name, posterUrl/poster_url/stream_icon/cover, container_extension | Fallback library title, artwork and playback extension; these cache objects are not preserved wholesale. |
| Xtream `recentlyViewed[].contentType`, `xtreamId`, `viewedAt` | `recent:sourceId` section snapshots, typed identity and `watchedAt` in milliseconds; export ISO timestamp. |
| `playbackPositions[].contentXtreamId`, `contentType` | `progress:sourceId['movie:ID']` for `vod`, `progress:sourceId['episode:ID']` for `episode`; IDs also retained in `backup:sourceId.progressIds` for attribution. |
| `positionSeconds`, `durationSeconds`, `updatedAt` | Progress record `position`, `duration`, `updatedAt` in milliseconds. Missing duration becomes 0; unknown duration cannot resume or imply watched. |
| `seriesXtreamId`, `seasonNumber`, `episodeNumber` | Optional fields retained on imported progress records; also reconstruct an episode recent snapshot under its show. Export back with current playlist ID. |
| Watched state | No separate desktop flag or TV watched store. The shared `Progress.finished` rule converts near-end imported records to full duration; `watched.js` reads the same progress. |
| M3U `userState.favorites[]` | Channel URLs resolve through the existing M3U parser into `favorites:sourceId` sections, including stable M3U movie/show IDs. A show exports its known episode URLs. |
| M3U `recentlyViewed[].url`, `title`, `poster_url`, `added_at` | Parsed item/episode identity, `name`, `logo`, `watchedAt` in `recent:sourceId`; `group` comes from raw M3U. Export `source: 'm3u'`, URL as `id`, `category_id: 'live'`, title/artwork/group and timestamp. |

Progress records are scoped by profile and source, so colliding numeric ids
stay separate. Merge chooses the newer timestamp within each source. Export
reads each source's standard Xtream positions using imported progress IDs,
library snapshots and known IndexedDB movie/episode rows. Records without those
references are retained in the TV extension for the current source.
The catalogue scan does not
download a source or open any stream. Native playback saves may replace optional
episode metadata; known catalogue episode rows restore it during export.

## Fields skipped

- `settings.epgUrls`: TV guide links are per source, so a global desktop list
  has no equivalent.
- All Stalker entries, and M3U `file` / `text` entries. A nonempty archive with
  no supported sources is rejected instead of clearing the TV.
- `exportedId` as a storage ID (a fresh TV ID is generated), `autoRefresh` and
  playlist `position` (array order is retained; export sets `autoRefresh: false`).
- M3U `userAgent`, `referrer`, `origin`, `filePathHint`; hidden/locked group
  titles. Recent `id`, `channel_id`, `tvg_id`, `tvg_name`, `group_title` and
  `category_id` do not override identities/sections from the raw playlist.
- Xtream hidden/locked categories, source pins, favorite `addedAt` / `position`,
  recent `backdropUrl`, playback `sessionId`, and the original `playlistId`.
  Other snapshot fields (backdrop, TMDB ID, year, original title and catalogue
  availability evidence) and unrecognized collection fields are ignored.
- Other unknown fields are ignored. Export writes required empty desktop
  hidden-category/group arrays, omits pins/locks/settings and session state,
  and remaps playback `playlistId` to the TV source ID.

Desktop M3U v1 has no progress field or show-favorite identity. To retain TV
state for another TV, exports add optional top-level `tvState.progress` for the
current source and per-M3U `tvState.favorites` / `tvState.recent` section snapshots. These fields
are validated on TV import and ignored by the desktop importer. Desktop
re-export does not retain this extension; M3U progress therefore cannot round
trip through the desktop. The top-level extension keeps its record format and
imports into the resulting current source (the existing current source on Merge,
or the first restored source on Replace). Explicit playlist positions take
precedence over colliding ids in this extension. It does not represent other sources'
M3U progress; standard Xtream positions remain attached to their own source.

## Export transport

Export first shows **Contains your passwords**, with Cancel focused, before
building a JSON Blob and a device-local download link. A Blob/data URL is not
reachable from a phone, and the TV runs no HTTP server, so no local phone link
is invented. This implementation deliberately skips a QR encoder; small
exports say **QR code unavailable**, while exports over the 2,953-byte byte-mode
QR limit say **Too big for a QR code: N KB**. Both offer **Copy to a link…**.

Copy to a link accepts a trusted HTTP(S) endpoint and lets the viewer select
PUT or POST (`Content-Type: application/json`). Cookies and referrers are omitted.
After success, it tries GET on the response's `Location` header (which must be
CORS-exposed), or the entered endpoint. Only an exact JSON read-back is shown
as a verified phone link; known loopback addresses are never offered as phone
links. Otherwise it explains that the endpoint accepted the
backup but a readable link could not be verified. Cancelling an upload cannot
undo a request already received by the endpoint. No URL, credentials or JSON
are logged; import previews contain counts only.
