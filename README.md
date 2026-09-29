# Grok Demo: Mission 1, "Get to Beacon" (round 5)

A portrait, touch-first sky shooter for mobile browsers, and a prototype of *Jetcraft: Invasion Earth*. Atlas flies the biplane across the Channel coast to **Beacon**, the base. On the way you build a drone squad, shoot gates positive, crack weapon canisters, rescue a cocooned pilot and bring down the **Chitin Queen**.

**Play:** https://okbupe.github.io/grok-demo/
Earlier rounds are kept frozen for comparison: **Round 4** at https://okbupe.github.io/grok-demo/v4/, **Round 3** at https://okbupe.github.io/grok-demo/v3/ and **Round 2** at https://okbupe.github.io/grok-demo/v2/. The title screen links to all three under "Previous versions".

## Controls
- **Steer:** drag left or right anywhere. Firing is automatic from the first frame.
- **Beam** (after you collect the BEAM canister): flick **up** from the plane to switch it on, and flick **down** to switch it off. The first 5 s are free. After that it drains your health and the plane smokes. It shuts off by itself at 12 HP.
- **Omega Beam:** when the purple HUD bar is full, the plane's nose soaks up energy. **Tap the plane** (a quick touch and release) to fire a screen-wide beam.
- **Shake off clinging bugs:** steer hard left and right.
- **Desktop:** arrow keys or A/D to steer, W/↑ for beam on, S/↓ for beam off, Space or E for Omega. Mouse drag and clicking the plane also work.
- **Gesture rules:** a flick must start within 115 px of the plane, last under 320 ms, travel at least 45 px, be mostly vertical (|dy| > 2·|dx|) and move at least 0.35 px/ms. A tap must start within 72 px of the plane, last under 180 ms and move under 10 px. Steering drags, resting your thumb, and lifting then putting it down to drag never count as a flick or a tap.

## New in round 5
- **Packed squad:** drones fill the space closest to the plane first, in the same staggered formation style. The cap is **50** everywhere, including gate gains.
- **Drone spawn effect:** each new drone pops in scaled up and stretched away from the squad, then eases into its slot inside a glowing sparkle swirl, with a chunky gold comic **+1** (Luckiest Guy font, vendored in `fonts/`).
- **Hunters:** bugs come from ahead and never fly past the plane or off the bottom. When they get close they chase the squad, swing wide of the guns, and latch onto the plane or a drone, clawing it for damage over time until they are shot or shaken off. Drones shoot clinging bugs first. Hunter packs (fast red spiders) dive in from the top corners. Only gates, canisters, crates and orbs scroll past.
- **Cocoon rescue** (about 50 s): a wasp brings a pilot's amber cocoon in from the side and holds it ahead of you. Its HP shows under the glass. It cracks at half HP. At 0 it shatters, the pilot flies to the squad and you get **+8 drones** and "PILOT RESCUED!". You can shoot the carrier too. If you don't free the pilot within 12 s, the carrier escapes with the cocoon.
- **Gates inflate:** a gate grows linearly with its value, up to **+20% at MAX 1000**. Negative gates stay at their base size. A gate that starts positive stays at base size until its first hit. Every hit gives a short "feeding" pulse. Blue gates restore health, which matters now that the beam costs HP.
- **Omega Beam:** the bar fills from kills (faster with combos and while you avoid damage), from maxed gates, and from **Omega orbs** (glowing purple-white pickups that scroll past). All players have the Omega tier for now. The code already has `ORB_TIERS` (Delta, Beta, Gamma, Alpha, Omega) with only Omega active.
- **Screen shake only where it matters:** pickups (small), big or elite kills (medium), gate MAX (small), Omega, and the Queen's death as a rolling chain of 12 bombs over about 2.5 s, each with its own pulse. Normal shooting never shakes.
- **Mission Complete:** the gold strip stomps in with a shake and a dust ring. The stars are cartoon style and each lands with a thud. **3 stars:** rays, glow, confetti, fireworks and "PERFECT!". **2 stars:** rays and a little confetti. **1 star:** the star simply appears.
- **Star rules** (shown on the results card): ★ complete the mission; ★★ finish with at least 50% health **or** rescue the pilot; ★★★ at least 50% health **and** the pilot rescued **and** at least 15 drones at the end.
- The base is now called **Beacon** ("BEACON IN SIGHT").

## Rules of the sky
- Open sky: no lanes, dots or dividers. Nothing casts a shadow. Bullets reach three quarters of the way up the screen.
- One gate per row, with a canister, crate or bugs beside it. No bugs sit directly behind a gate.
- **Gates:** every bullet adds +1 (rockets and shells add more). At **1000** a gate turns gold and shows **MAX**. A blue gate gives drones and restores health. A red gate takes drones.
- **Bullet tiers:** standard, then orange, then blue.
- Health bars change colour. Something happens every 1 to 2 seconds.

## Tuning
All sizes, speeds, camera, gesture thresholds and shake amplitudes live in the **`CFG` block at the top of `game.js`**: plane, drone, gate, bug, boss, cocoon and orb sizes; scroll, object and bug speed; hunter speed and radius; camera position and FOV; drone spacing; beam grace and drain; Omega damage; tap and swipe thresholds. Star rules are in `CFG_STARS`.

## Tech
- Three.js is vendored at build time, so there is no CDN at runtime. A 2D canvas overlay draws numbers, bars, badges, sparkles and beams. The HUD is HTML/CSS, and the sound is WebAudio.
- Sprites are stored as `art/*.webp.b64`. `tools/cut_cocoon.py` cuts the three cocoon stages from the reference sheet with the shared alpha matte from `tools/cut_art.py`, so there is no white halo.
- `tools/build.sh` builds the site, stamps a cache-busting version, copies `fonts/`, and copies the frozen `v2/`, `v3/` and `v4/` builds. `.github/workflows/pages.yml` publishes to `gh-pages`.
- Font: Luckiest Guy by Astigmatic, from Google Fonts, vendored as `fonts/luckiest.woff2` (Apache License 2.0, see `fonts/LICENSE-LuckiestGuy.txt`).
- **Debug URL flags** (all off by default): `?autoplay` (a bot flies the mission), `&ts=2`, `&warp=60`, `&drones=20`, `&tier=0|1|2`, `&weapon=beam|gun`, `&beamon=1`, `&rockets=1`, `&bazooka=1`, `&bosshp=`, `&hp=`, `&omega=0..1` (starting charge), `&cocoon=T` (cocoon time in seconds).
- **Audit:** `window.__AUDIT` records spawns (`seen`, `maxY`, `viol` for mid-screen pop-ins, `brood`, `gatePairs`, `minGap`), hunters (`bottomExit`, `bugMaxScreenY`, `removedOffscreen`, `latchTotal`, `latchPlaneMax`, `flung`), the cocoon event log (`cocoon`, `carriers`), Omega (`omegaFires`, `omegaHits`, `orbs`), the beam (`beamOn`, `beamOff`, `beamDrainHp`, `beamSmoke`), gates (`gateMaxScale`, `gateScaleAtMax`), `shakes` by kind, `maxDrones`, `bombs` and `stars`. `window.__G.GLOG` logs every gesture decision.

Local build: `pip install numpy scipy opencv-python-headless pillow && bash tools/build.sh _site`, then serve `_site/`.
