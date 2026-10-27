// Search everything (#31), from the box on Home: one query over Live TV,
// Movies and Series, a row for each section that has matches. Titles that
// start with the query come first, then those that contain it, then those
// whose genre it names. Find.rank is the same ordering for one list, used by
// the search bar in a section.
//
// api: sections() -> the sections the source has, in order
//      title(section) -> the row title for a section
//      items(section) -> Promise of the section's items, without hidden or
//      locked ones
window.Find = (api) => {
    'use strict';

    const ROW_MAX = 60;

    // Promise of [{ id, title, live, entries }] for the sections with matches.
    const search = (query) => {
        return Promise.all(api.sections().map((section) => api.items(section)
            .then((list) => Find.rank(list, section, query, ROW_MAX))
            .catch(() => [])
            .then((found) => ({ id: 'find-' + section, title: api.title(section), live: section === 'live', entries: found.map((item) => ({ item, section })) }))))
            .then((rows) => rows.filter((row) => row.entries.length));
    };

    return { search };
};

// The items of `list` that match `query`, best first: titles starting with it,
// then titles containing it, then titles whose genre it names. `max` caps the
// result; leave it out for all matches.
window.Find.rank = (list, section, query, max) => {
    'use strict';

    const needle = String(query).trim().toLowerCase();
    const starts = [];
    const contains = [];
    const genre = [];
    list.forEach((item) => {
        const at = String(item.name || '').toLowerCase().indexOf(needle);
        if (at === 0) starts.push(item);
        else if (at > 0) contains.push(item);
        else if (Genres.matches(item, section, query)) genre.push(item);
    });
    const ranked = starts.concat(contains, genre);
    return max === undefined ? ranked : ranked.slice(0, max);
};
