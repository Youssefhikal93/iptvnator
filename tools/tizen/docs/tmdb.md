# Optional TMDB metadata

The viewer opts in by saving their own TMDB v3 API key in Settings. `Prefs`
keeps `tmdbApiKey` in the existing localStorage settings object. Without a
key, `Tmdb` sends no requests, builds no TMDB image URLs and offers no TMDB genres in the genre filter
category. Never pass a TMDB URL or the key to `Log`; failures log the path only.

`js/tmdb.js` limits all TMDB REST requests to three in flight, coalesces
identical requests and aborts a fetch after eight seconds. Provider TMDB ids
take priority; otherwise a title search accepts one normalized title with a
compatible year. Ambiguous search results are left unmatched. Movie and TV
identities stay separate when intersecting similar titles or person credits
with the current source's catalogue.

`js/tmdb-language.js` maps all 19 app language codes to TMDB tags for the
`language` query parameter, using `I18n.language()` when a lookup starts.
Belarusian (`by`) uses `be-BY`, Portuguese
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
versions and records stay unchanged. A failure keeps its HTTP status, so a 404
(no such title) is told apart from a request that failed.

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

The genre filter in Movies and Series (the button beside the search bar)
checks the open list with TMDB twenty titles at a time, only after the viewer
picks a genre. Cached matches filter again without another request; ▼ past the
end, CH▼ or **Check 20 more** checks the next twenty. It never asks the provider
and never scans the whole catalogue by itself. It replaced Discover.

## Collections (#58)

A film's detail page shows its collection first under the plot, and Movies has
a **Collections** category after Recently added. With a key they come from
TMDB's `belongs_to_collection` and `/collection/{id}`; without one,
`js/name-groups.js` groups the provider's film names (a sequel number, Roman
numeral, "Part II" or a subtitle after ":"), sends nothing, and drops a name
shared by more than twelve films (a word such as "Movie", not a series).

`js/collection-lookup.js` is the only background TMDB work. It asks about one
film at a time with the same search and detail requests as a detail page, so a
film already matched costs nothing, and waits 500 ms per request it caused
(at most two a second). It runs only while the remote has rested for three
seconds and nothing plays, stops when the key is removed or the source changes,
and waits 30 seconds after a 429 (a 429 is not cached, so it is asked again).
`js/collection-index.js` keeps each film's collection, or none, in the
`responses` store under `collections|v1|<source>` with no expiry, so a film is
asked once even across restarts; a failed answer is not kept and is retried
at most three times a session. Collection parts are fetched once per
collection and again after 30 days or in another language; a collection whose
id TMDB no longer knows is kept as none. The Movies search bar filters the
Collections list by name with no request; a film's detail page may ask for its
collection's parts once when the look-up has not reached it yet.

Network fixtures and browser checks are in `tests/specs/tmdb.spec.js` and
`tests/fixtures/tmdb/`; matching, opt-in, request limits and expiry are checked
by `tests/unit/tmdb.test.js`. Language tags, fallback, trailer order and cache
compatibility are checked by `tests/unit/tmdb-language.test.js`. Collections
are checked by `tests/unit/collections.test.js` and `tests/specs/collections.spec.js`
(request counts, no repeats after a reload, the no-key grouping).
Real TV checks must cover changing language and reopening the same detail,
an untranslated plot, translated Cast navigation, the Samsung keyboard,
YouTube app discovery/launch, Return, and CH paging.
