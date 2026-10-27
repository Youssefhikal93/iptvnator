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

`js/tmdb-language.js` maps all 20 app language codes to TMDB tags for the
`language` query parameter, using `I18n.language()` when a lookup starts.
Moroccan Arabic (`ary`) uses `ar`, Belarusian (`by`) uses `be-BY`, Portuguese
uses `pt-PT`, and unknown codes use `en-US`. Search stays in English for title
matching; details, similar titles, genres and person requests use the app
language. Changing Settings language applies to the next opened detail page;
an already open page need not refresh.

If a non-English detail response has no overview, one additional English
detail request supplies its plot when available. Both responses are cached;
translated facts and artwork stay intact even when English is unavailable.
An empty translated title uses the original title, then the English fallback
title when that request supplied one, then the source's title on the detail page.
Videos request `include_video_language=<language code>,en,null`, with the
language part of the TMDB tag (for example `de`). Local-language trailers sort
before English trailers. Posters and backdrops still use the detail response's
paths; there is no separate images request or image-list selection.

`js/tmdb-store.js` owns IndexedDB `iptvnator-tv-tmdb`, version 1, store
`responses`. Requests are keyed by path, sorted parameters and a fingerprint
of the viewer key, without the secret itself. The parameters include language;
in-memory matches are also separated by language. Old keys without language
are read only for `en-US`, preserving their original expiry without clearing
or rewriting the database. Successful responses expire
after seven days; failures after one hour. Test key bypasses stored responses.
Unavailable storage falls back to session memory. Catalogue and guide database
versions and records stay unchanged.

`js/tmdb-detail.js` enriches a provider detail page asynchronously. It fills
an empty plot and improves title, artwork, rating, genre and runtime when TMDB supplies
them, keeping provider values for missing TMDB fields. Stale page responses
are discarded. Cast is limited to 12 people. `js/actor.js` opens person details
and combined movie/TV credits; the displayed titles must exist in this source.
Similar cards show the TMDB title in the app language when available, while
opening the source's original item. Catalogue matching also accepts TMDB's
original title and still checks the year and media type. Source catalogue
names and non-empty source plots stay unchanged.
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
by `tests/unit/tmdb.test.js`. Language tags, fallback, trailer order and cache
compatibility are checked by `tests/unit/tmdb-language.test.js`.
Real TV checks must cover changing language and reopening the same detail,
an untranslated plot, translated Cast navigation, the Samsung keyboard,
YouTube app discovery/launch, Return, and CH paging.
