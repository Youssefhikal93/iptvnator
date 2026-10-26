# Catalogue in IndexedDB, library in localStorage, saved lists shown first

The catalogue (categories, items, show details) is kept per source in IndexedDB and shown at once on start, then refreshed in the background once per session; the new list replaces the old one only if it changed, keeping the viewer's focus. The library (sources, favorites, recently watched, progress, view choices) stays in localStorage. A large Xtream account has about 12,600 channels, which does not fit localStorage's ~5 MB, while the library is small and simpler to read synchronously.

## Consequences

- A refresh never touches the library, and "Refresh source" or removing a source drops only that source's catalogue.
- Lists can be one session out of date until the background refresh finishes ("Updating…" next to the source name).
