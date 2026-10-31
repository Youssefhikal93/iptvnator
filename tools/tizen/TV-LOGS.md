# Reading the TV app's log on the PC

The TV app sends every log line to the PC while it runs. Use it to see why a
channel, movie or provider fails on the TV. Installing the app is covered in
[INSTALLATION-TO-TV.md](INSTALLATION-TO-TV.md).

## How it works

- `tv-app/js/log.js` posts each line to `REMOTE_LOG_URL`
  (`http://192.168.0.21:8765/log`).
- `log-receiver.js` (this folder) listens on port 8765 on the PC and appends
  each line, with the time, to a file.
- If the receiver is not running or the PC is unreachable, the app works
  normally and the lines are lost.
- Lines are redacted: no passwords, PINs, keys or full provider links.

## 1. Check the PC address

The TV sends to the address in `REMOTE_LOG_URL`. Find the PC's address:

```powershell
ipconfig
```

Look for **IPv4 Address** under the Wi-Fi or Ethernet adapter. If it is not
`192.168.0.21`, change `REMOTE_LOG_URL` in `tv-app/js/log.js` and install the
app again (INSTALLATION-TO-TV.md, steps 8–9). The TV and PC must be on the
same network.

## 2. Start the receiver

From the repository root:

```powershell
node tools\tizen\log-receiver.js
```

It prints `Listening on port 8765, writing to ...` and keeps running; leave
the window open. The first time, Windows asks to allow Node through the
firewall: allow it on **private** networks, or the TV cannot reach it.

To write to another file, pass its path:

```powershell
node tools\tizen\log-receiver.js C:\temp\dexter.log
```

Stop it with **Ctrl+C**.

## 3. Where the log goes

Default file: `tools\tizen\logs\tv.log`. Each run appends to it; delete the
file to start clean. The `logs` folder is ignored by git, so logs are never
committed.

Each line starts with the PC's UTC time:

```text
14:03:27.512 INFO AVPlay redirect check refused (HTTP 401) example-host, opening the link itself
```

## 4. Reproduce and read

1. Start the receiver (step 2).
2. Open the app on the TV and do what fails (play the channel or movie).
3. Follow the log live in a second window:

   ```powershell
   Get-Content tools\tizen\logs\tv.log -Wait -Tail 50
   ```

4. Search it afterwards:

   ```powershell
   Select-String -Path tools\tizen\logs\tv.log -Pattern 'ERROR|failed|HTTP'
   ```

## Troubleshooting

| Problem | Fix |
| --- | --- |
| The file stays empty | The PC address changed (step 1), the firewall blocks Node (allow it on private networks), or the TV is on another network. |
| `EADDRINUSE` on start | A receiver already runs on port 8765; use that one or close it. |
| Lines from an old session | Each run appends; delete `tv.log` before reproducing. |

The probe app (`tools\tizen\probe`) posts to the same port, so the same
receiver collects its log too.
