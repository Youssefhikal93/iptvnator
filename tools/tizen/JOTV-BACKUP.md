# Jo-TV full backup

Copies everything Jo-TV keeps on the TV (sources and passwords, profiles, PIN, settings, favorites, Continue watching, progress, subtitle timing) to this computer, and back. Use it before reinstalling Jo-TV or to move to a new TV.

Backups go to `Projects\jotv-backup\` (next to the repo, never committed). They contain your passwords: keep them there.

## Export (TV → computer)

1. On the computer:
   ```powershell
   node tools\tizen\backup-receiver.js
   ```
   It prints an **address** (like `192.168.0.21:8766`) and a **code**.
2. On the TV: Settings → Backup → **Send everything to computer…**, enter the address and code, choose **Send**.
3. The computer prints `Saved jotv-backup-<date>.json`. Stop the receiver with Ctrl+C.

## Import (computer → TV)

1. On the computer, run the receiver again (new code each time).
2. On the TV: Settings → Backup → **Restore from computer…**, enter the address and code, choose **Restore**, then confirm.
3. Jo-TV restarts with everything as it was. It restores the newest file in the folder.

## Notes

- TV and computer must be on the same home network; the receiver only answers while it runs and only with its code.
- Restore replaces everything Jo-TV has on that TV.
- Movie lists and the TV guide are not in the file; they download again.
