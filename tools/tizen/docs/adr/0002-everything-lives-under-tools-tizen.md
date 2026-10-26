# Everything for the TV lives under tools/tizen

All TV code, docs and scripts stay inside `tools/tizen` on the `feat/samsung-tizen-tv` branch of the fork, and nothing outside it is changed. The rest of the repository is upstream's (4gray/iptvnator), and the fork is synced from it; keeping to one folder means a sync never conflicts with our work.

## Consequences

- The root `.gitignore` ignores names such as `menu.js` and `api.js`; new files in `tv-app/js` must be checked with `git check-ignore` and added with `git add -f`.
- The repository's Nx, lint, test and release-note rules (AGENTS.md) are for upstream's apps; the TV app is plain files with no build step and is checked in a browser and on the TV instead.
- Docs for the TV app go in `tools/tizen/docs`, not in the root `docs/`.
