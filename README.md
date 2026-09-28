# Grok Demo: Mission 1, "Get to Ridgeback" (round 4)

A portrait, touch-first sky shooter for mobile browsers. Atlas flies the biplane across the Channel coast to Ridgeback. On the way you build a drone squad, shoot gates positive, crack weapon canisters and bring down the **Chitin Queen**.

**Play:** https://okbupe.github.io/grok-demo/
Earlier rounds, kept frozen for comparison: **Round 3** at https://okbupe.github.io/grok-demo/v3/ and **Round 2** at https://okbupe.github.io/grok-demo/v2/. The title screen has a small "Previous versions" link to both.

## Controls
- **Phone:** drag left or right anywhere to steer. Firing is automatic from the first frame.
- **Desktop:** Arrow keys or A/D. Dragging with the mouse also works.

## What round 4 is
Round 4 mixes the round-2 feel with the round-3 mission structure:
- **Plane and drones:** round 2's plane and drones, with round 2's banking, tilt, bob, propeller and contrails. The round-3 plane sprite is no longer used.
- **Gates:** round 2's glass gates, flattened and made smaller, so three would fit side by side. A row never has more than one gate. Next to a gate there may be a canister, a crate, some bugs or nothing. Round 3's propeller gate banners stay in `art/` but are not used.
- **Enemies:** round 2's yellow-eyed spiders (and the bigger brute) are the main enemies. Round 3's red spider, beetle, wasp and spitter only show up as two short elite moments.
- **Spawning:** every enemy spawns above the top edge of the screen and flies in from ahead. Bugs keep clear sky behind gates: they stay at least about 1.5 gate-heights back or move to one side of the gate.
- **Boss:** round 2's stationary **Chitin Queen**. Her brood emerges from her body, and she fires telegraphed acid volleys. Kingsting's code and config stay dormant in the `BOSSES` table as `stinger`, ready for a later mission.
- **Pickups:** round 2's canisters are back, with a big gold icon on top that shows the weapon: POWER, ROCKETS, BAZOOKA, **BEAM** (restored) or DRONES. The glass weapon orb is about twice as big as before, and its icon fills most of it. Crates are used sparingly.
- **Bullet tiers (as in Last War):** bullets start in the standard pale gold. The first power pickup makes them **ORANGE** with more damage, and the second makes them **BLUE** with even more damage. Every round already in the air changes colour at once, with a flash and an UP ring. Drones copy the tier. The beam and rockets are coloured by tier too.

## Rules of the sky
- Open sky: no lanes, dots or dividers. Nothing casts a shadow. Bullets reach three quarters of the way up the screen.
- **Gates:** every bullet that hits a gate adds +1, and rockets and shells add more. Gates start negative and can be shot positive. At **1000** a gate turns gold and shows **MAX**. A blue gate gives you drones and restores health. A red gate takes that many drones, and flying through a red gate with no drones kills you.
- **Drones:** the cap is 40, and they fly in formation around the plane. They fire ahead and only aim at bugs close to the plane.
- Health bars change colour. The screen only shakes at key moments. Something happens every 1 to 2 seconds.

## Mission 1 (about 90 s)
The mission opens with a +2 gate beside the first swarm. Next come a choice of gates, then build-up rows with rising negative gates and tougher bugs. The first POWER canister turns the bullets orange (about 16 s). A ROCKETS canister follows, then a weapon orb that turns them blue (about 38 s), a BEAM canister, an elite moment, a spitter moment and an optional bazooka canister. The Chitin Queen arrives at about 66 s. After her you get the Mission Complete badge with the biplane and "RIDGEBACK IN SIGHT".

## Tech
- Three.js is vendored at build time, so there is no CDN at runtime. A 2D canvas overlay draws numbers, bars and badges. The HUD is HTML/CSS, and the sound is WebAudio.
- Sprites are stored as `art/*.webp.b64`. The `r2_*` files are the round-2 plane, spider, boss and canister. The round-3 art stays in the repo for later stages.
- `tools/build.sh` builds the site, stamps a cache-busting version and copies the frozen `v2/` and `v3/` builds into the output. `.github/workflows/pages.yml` publishes to `gh-pages`.
- Debug URL flags, all off by default: `?autoplay` (a bot flies the mission), `&ts=2` (time scale), `&warp=60` (skip ahead), `&drones=20`, `&tier=0|1|2`, `&weapon=beam|gun`, `&rockets=1`, `&bazooka=1`, `&bosshp=`, `&hp=`.
- **Spawn audit:** `window.__AUDIT` records each enemy's first visible position (`seen`, `maxY` as a fraction of screen height from the top, `viol` for anything first seen below 5%), the boss brood separately, gate pairs per row (`gatePairs`), the closest bug behind a gate (`minGap`), the tier timeline and the time of the first shot.

Local build: `pip install numpy scipy opencv-python-headless pillow && bash tools/build.sh _site`, then serve `_site/`.
