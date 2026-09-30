# Headless test scripts (round 12)

Copied from the working folder on the agent box (`/workspace/r12/`), where every round was checked before it was pushed. They are not part of the build and are not run by CI. They drive the game in headless Chrome at a 390x844 phone viewport through Playwright and read `window.__G` and `window.__AUDIT`.

Setup: `pip install playwright && playwright install chromium`. Set `CHROME=/path/to/chrome` to use an installed Chrome instead of Playwright's own. WebGL runs on SwiftShader, so everything is slow: allow a few minutes for a full mission.

| Script | What it checks | Example |
|---|---|---|
| `loadchk.py` | The current build and every frozen `/vN/` load with `?autoplay`, the game clock runs, no console errors, page errors or HTTP errors | `python loadchk.py https://okbupe.github.io/grok-demo/ /tmp/out` |
| `gest.py` | Round 12 gestures with synthetic touches: steering drags never become swipes, swipe up/down toggles the beam anywhere, single and slow taps do not fire Omega, a double tap does | `python gest.py "http://localhost:8000/?tut=0"` |
| `res.py` | Plays the whole mission with the bot, screenshots each Mission Complete beat (`seq`) or a tap-to-skip (`skip:MS`), and checks the payout maths against `__AUDIT.results` (prints OK or MISMATCH) | `python res.py "http://localhost:8000/?autoplay&tut=0" /tmp/out/r seq` |
| `tut.py` | Screenshots each bullet-time tutorial and prints `AUD.tut` / `AUD.bt` | `python tut.py "http://localhost:8000/?autoplay&tut=1" /tmp/out 400` |
| `threat.py` | Waits for the boss hazard-tape warning, screenshots four frames and prints the tape, name and B-RANK plate boxes | `python threat.py "http://localhost:8000/?autoplay&tut=0" /tmp/out/thr` |

To test a local build: `bash tools/build.sh _site && python3 -m http.server 8000 -d _site`. When a new round is frozen, add it to `PATHS` in `loadchk.py`.
