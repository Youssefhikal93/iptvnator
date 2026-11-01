# Jotv tiles on the Samsung home screen

Press **Home** on the remote and move to the **Jotv** icon: Continue watching and recent channels show as tiles. Pick one to play it.

## Install

Nothing extra. The tiles are part of Jotv and are installed with it:

```powershell
powershell -ExecutionPolicy Bypass -File tools\tizen\deploy-tv.ps1
```

On a new TV, install Jotv the usual way (INSTALLATION-TO-TV.md), open it once, watch something, then press Home.

## Turn off or remove

- **Off:** Settings → Playback → Samsung home screen tiles → Off. The tiles disappear at the next update.
- **Remove:** the tiles go when Jotv is removed from the TV.

## Good to know

- Tiles update when you leave Jotv, at most once every 10 minutes (Samsung's limit).
- They show the active source and profile only. Titles from a locked category never show.
- The row title is the app name the TV saved at first install. If it still says IPTVnator, reinstall Jotv (back up first: JOTV-BACKUP.md).

## How it works

`service/hub-preview.js` (a Tizen service inside the Jotv package) hands the tiles that `js/hub-tiles.js` built to Samsung's Smart Hub Preview (`webapis.preview.setPreviewData`). `config.xml` declares the service, the `use.preview` metadata and the `eden_resume` app control that opens Jotv from a tile.
