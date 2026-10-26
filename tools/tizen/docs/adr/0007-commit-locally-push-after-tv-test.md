# Changes are pushed only after a test on the TV

New features are tested in a desktop browser against a fake Xtream server, committed on the laptop, and pushed to the fork only after the viewer has tried them on the real TV; issues are closed then too. A browser test does not prove the TV works (different Chromium, AVPlay, remote keys, speed), and the pushed branch is what other TVs install from.
