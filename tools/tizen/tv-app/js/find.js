// Search everything (#31), from the box on Home: one query over Live TV,
// Movies and Series, a row for each section that has matches. Titles that
// start with the query come before those that contain it.
//
// api: sections() -> the sections the source has, in order
//      title(section) -> the row title for a section
//      items(section) -> Promise of the section's items, without hidden or
//      locked ones
window.Find = (api) => {
    'use strict';

    const ROW_MAX = 60;

    const match = (list, needle) => {
        const starts = [];
        const contains = [];
        list.forEach((item) => {
            const at = String(item.name || '').toLowerCase().indexOf(needle);
            if (at === 0) starts.push(item);
            else if (at > 0) contains.push(item);
        });
        return starts.concat(contains).slice(0, ROW_MAX);
    };

    // Promise of [{ id, title, live, entries }] for the sections with matches.
    const search = (query) => {
        const needle = query.trim().toLowerCase();
        return Promise.all(api.sections().map((section) => api.items(section)
            .then((list) => match(list, needle))
            .catch(() => [])
            .then((found) => ({ id: 'find-' + section, title: api.title(section), live: section === 'live', entries: found.map((item) => ({ item, section })) }))))
            .then((rows) => rows.filter((row) => row.entries.length));
    };

    return { search };
};
