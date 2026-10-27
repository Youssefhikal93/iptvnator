# Optional TMDB metadata

The viewer opts in by saving their own TMDB v3 API key in Settings. `Prefs`
keeps `tmdbApiKey` in the existing localStorage settings object. Without a
key, `Tmdb` sends no requests, builds no TMDB image URLs and offers no Discover
category. Never pass a TMDB URL or the key to `Log`; failures log the path only.

`js/tmdb.js` limits all TMDB REST requests to three in flight, coalesces
identical requests and aborts a fetch after eight seconds. Provider TMDB ids
take priority; otherwise a title search accepts one normalized title with a
compatible year. Ambiguous search results are left unmatched. Movie and TV
identities stay separate when intersecting similar titles or person credits
with the current source's catalogue.

`js/tmdb-store.js` owns IndexedDB `iptvnator-tv-tmdb`, version 1, store
`responses`. Requests are keyed by path, sorted parameters and a fingerprint
of the viewer key, without the secret itself. Successful responses expire
after seven days; failures after one hour. Test key bypasses stored responses.
Unavailable storage falls back to session memory. Catalogue and guide database
versions and records stay unchanged.

`js/tmdb-detail.js` enriches a provider detail page asynchronously. It fills
an empty plot and improves artwork, rating, genre and runtime when TMDB supplies
them, keeping provider values for missing TMDB fields. Stale page responses
are discarded. Cast is limited to 12 people. `js/actor.js` opens person details
and combined movie/TV credits; the displayed titles must exist in this source.
Provider and TMDB trailers share `js/youtube.js`: OK opens the video in the TV's
YouTube app, after stopping IPTVnator playback. Return/Back in YouTube returns
to the same detail page. The launcher tries an implicit view control with the
watch URL first, then Samsung's YouTube app (`111299001912`) with a `PAYLOAD`
deep link. Neither detail page creates an embedded player. Availability is
checked once per session by a matching view control or installed YouTube app;
unsupported TVs hide the button. Browser builds keep the button and show
"YouTube is not available on this TV" on OK, also shown if both TV launches fail.

`js/discover.js` loads genres and checks a page of 12 catalogue titles only
after the viewer chooses a genre. Cached matches can be filtered again without
another request. CH keys move between pages; it never scans the whole catalogue
automatically. Return closes Discover, while closing a detail page opened from
Discover restores its genre and title selection.

Network fixtures and browser checks are in `tests/specs/tmdb.spec.js` and
`tests/fixtures/tmdb/`; matching, opt-in, request limits and expiry are checked
by `tests/unit/tmdb.test.js`. Real TV checks must cover the Samsung keyboard,
YouTube app discovery/launch, Return, and CH paging.
