# Catalogue in IndexedDB, library in localStorage, saved lists shown first

The catalogue (categories, items, show details) is kept per source in IndexedDB and shown at once on start, then refreshed in the background once per session; the new list replaces the old one only if it changed, keeping the viewer's focus. The library (sources, favorites, recently watched, progress, view choices) stays in localStorage. A large Xtream account has about 12,600 channels, which does not fit localStorage's ~5 MB, while the library is small and simpler to read synchronously.

## Consequences

- A source's library id follows its source account: editing the server origin or Xtream username, or the M3U playlist link, changes the id; editing back restores it. The shared `iptvnator-tv:source-accounts` localStorage map stores short hashed account fingerprints and ids, without plain logins or passwords; it is not scoped by profile.
- A refresh never touches the library, and "Refresh source" or removing a source drops only that source's catalogue.
- Lists can be one session out of date until the background refresh finishes ("Updating…" next to the source name).
- Since profiles (#23), every per-viewer library and settings key is also scoped by profile: `iptvnator-tv:p:<profileId>:<name>`, built only by `ProfileStore.key`. Sources and the IndexedDB caches stay shared by all profiles.
