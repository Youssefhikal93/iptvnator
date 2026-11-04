# Renew the Samsung certificate

Jo-TV is signed with the `iptvnator-tv` profile in
`%USERPROFILE%\SamsungCertificate\iptvnator-tv\`. Both of its certificates expire
**25 Oct 2027**. Renew them in **September 2027**.

## What expiry means

- After it, `deploy-tv.ps1` cannot sign builds: no updates and no reinstalls.
- It is not known whether the installed app keeps opening, so renew before the date.

## Check the dates

```bash
cd ~/SamsungCertificate/iptvnator-tv
openssl x509 -in author.crt -noout -enddate
openssl x509 -in distributor.crt -noout -enddate
```

## Renew, keeping your settings

1. Take a Jo-TV backup first ([JOTV-BACKUP.md](JOTV-BACKUP.md)).
2. Turn on the TV and connect it, so the Certificate Manager picks up its DUID:

   ```powershell
   C:\tizen-studio\tools\sdb.exe connect <TV-IP>:26101
   C:\tizen-studio\tools\sdb.exe devices
   ```

3. Open the Certificate Manager through its script (the `.exe` started from
   another folder exits silently):

   ```powershell
   Start-Process cmd.exe -ArgumentList '/c','C:\tizen-studio\tools\certificate-manager\CertificateManager.bat' `
     -WorkingDirectory C:\tizen-studio\tools\certificate-manager -WindowStyle Hidden
   ```

4. In the Certificate Manager window:
   1. Click **+** (top right). Device type: **TV**, **Next**.
   2. Choose **Select an existing certificate profile** → `iptvnator-tv`, **Next**.
   3. Author certificate: **Select an existing author certificate** (keep it).
      It is the app's identity: with the same author, the new build installs
      over the old app and its data stays. If asked, sign in with your Samsung
      account and enter the author password.
   4. Distributor certificate: **Create a new distributor certificate**, keep
      privilege **Public**, and check that every TV's DUID is listed (add it
      from `sdb.exe -s <TV-IP>:26101 shell 0 getduid` if not). Sign in again
      if the browser opens. **Next**.
   5. **Finish**. The profile shows a check mark; the distributor certificate
      shows its new expiry date.
5. Check the new end dates (above), then install with
   `.\tools\tizen\deploy-tv.ps1`. Your settings should still be there; if not,
   restore the backup from step 1.

If the author certificate itself has expired and Samsung will not renew it, you
must create a new author certificate. The TV then rejects the update
(signature mismatch). Uninstall Jo-TV, which deletes its data, install the new
build, and restore the backup from step 1.

## Keep in mind

- The distributor certificate is tied to the TV's DUID. A new TV needs a new
  distributor certificate listing all your TVs (INSTALLATION-TO-TV.md,
  *Installing on another TV*).
- The folder holds private keys and passwords (`.p12`, `.pri`, `.pwd`). Never
  put it in git or a shared cloud folder; keep one private copy. Losing it means
  a new author certificate, with the uninstall above.
