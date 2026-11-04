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
2. Connect the TV ([INSTALLATION-TO-TV.md](INSTALLATION-TO-TV.md) step 6).
3. Open the Certificate Manager (step 7), click **+**, choose **TV**, then
   **Select an existing certificate profile** → `iptvnator-tv`.
4. **Keep the existing author certificate.** It is the app's identity: with the
   same author, the new build installs over the old app and its data stays.
5. **Create a new distributor certificate.** Sign in with your Samsung account,
   keep privilege **Public**, and check that every TV's DUID is listed.
6. Check the new end dates (above), then install with `deploy-tv.ps1`.

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
