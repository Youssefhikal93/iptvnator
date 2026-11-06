# Jotv releases

Every install keeps a copy of the app, so a known-good build can always go back on the TV.

## Where they are

`deploy-tv.ps1` copies each successful install to `Projects\jotv-releases\<version> <date> <time>\`, next to the repo and never committed:

- `iptvnator.wgt`: the signed app.
- `vendor\`: the 4 vendor scripts it was built with.

## Version rule

- Fix only: 1.0.1. New feature: 1.1.0. Big rework: 2.0.0.
- Bump `tv-app/config.xml` and `VERSION` in `tv-app/js/settings.js` (Settings → About) in the commit that closes the ticket.
- Tag `jotv-x.y.z` only versions called stable after the TV test.

## Reinstall a release

```powershell
C:\tizen-studio\tools\sdb.exe connect 192.168.0.18:26101
cd "..\jotv-releases\1.0.0 2026-11-06 07.30"
C:\tizen-studio\tools\ide\bin\tizen.bat install -n iptvnator.wgt -s 192.168.0.18:26101 -- .
```

Installing over Jotv keeps profiles, sources, favorites and PINs on the TV. After an uninstall they come back only from a backup ([JOTV-BACKUP.md](JOTV-BACKUP.md)).
