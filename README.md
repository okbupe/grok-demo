# Grok Demo: Mission 1, "Get to Ridgeback"

A portrait, touch-first sky shooter that runs in a mobile browser. Atlas flies the **Lawnmower**, a rusty mango-yellow biplane, across the Channel coast to Ridgeback. On the way you build a drone squad, crack weapon capsules and bring down **Kingsting**, a colossal hornet.

**Play:** https://okbupe.github.io/grok-demo/

## Controls
- **Phone:** drag left or right anywhere to steer. Firing is automatic.
- **Desktop:** Arrow keys or A/D. Dragging with the mouse also works.

## The mission (about 95 s)
1. **Opening:** your guns stay cold until you fly through a single **+2** gate that you cannot miss. Two drones snap into formation beside you, and speech bubbles explain what to do.
2. **First choice:** a red drone gate that you shoot blue, or a **FIRE RATE** gate.
3. **Build-up:** a row arrives every 1 to 2 seconds. Plus gates always come with a cost next to them (a red gate, a crate or a swarm). Some red gates can be flipped, such as −30, −60 and −78, and a few go into the hundreds (−150, −260) so you may not flip them in time. Crates, capsules and bugs get tougher as the mission goes on.
4. **Weapon capsules:** capsule 1 gives the **MINIGUN** and capsule 2 gives **ROCKETS**. An optional **BAZOOKA** capsule sits just before the boss.
5. **Mid-points:** elites. The **armoured beetle** is slow and soaks up damage. The **alien wasp** is fast and swoops. The **spitter** hangs back and lobs slow green acid at the spot where you were, and a green ring marks where it will land.
6. **Final third: Kingsting.** It hovers at the top of the screen over a carpet of spiders and has a big health bar and a name banner. It keeps hatching spiders and fires fans of slow red stingers and acid lobs. Once it is below 70% it also makes a **telegraphed charge** down a line marked with red chevrons. About a dozen drones plus rockets is enough to beat it.
7. **Mission Complete:** the badge pops in with a shine and up to three stars. You get stars for winning, for finishing with at least half your armour and for finishing with 12 or more drones.

## Rules of the sky
- Open sky: no lanes or dividers. Each gate is about half the play width, and incoming objects show where the edges are.
- Everything is airborne, so nothing casts a shadow. Bullets reach three quarters of the way up the screen.
- **Gates:** every bullet that hits a gate adds +1. Rockets add +2 and bazooka shells add +4. Gates flash white on each hit and snap from red to blue at zero. At **1000** a gate turns gold and shows **MAX**. A blue gate gives you drones and restores some health. A red gate takes that many drones, and flying into a red gate with no drones kills you.
- **Drones:** the cap is **40**, and they fly the round-2 formation around the plane. A new drone pops in with a scale-up and a golden +1, and a gold **UP** ring marks big gains. Drones fire straight ahead and only turn to aim at bugs that are right on top of the main plane. They copy the jet's ammunition: bullets, mini rockets or mini shells.
- **Weapons:** when a capsule breaks, every round in the air changes at once. The standard gun fires white-blue tracers. The minigun fires a fast orange stream. Rockets are slower and red, with smoke trails and splash damage. The bazooka has a huge splash.
- **Crates:** wooden crates break into splinters and give drones or health. The green hazard crate is much tougher and gives more drones. The glass capsule shatters and changes your weapon. The tall glass cocoon holds a rescued pilot and gives drones.
- **Armour:** the Lawnmower has two armour segments and trails smoke when it is damaged. Health bars change colour from green to red.
- The screen only shakes at key moments: Kingsting's arrival and death, and big explosions.

## Tech
- Three.js is vendored at build time, so there is no CDN at runtime. A 2D canvas overlay draws gate propellers, numbers, health bars, badges and speech bubbles. The HUD is HTML/CSS, and all sound is synthesised with WebAudio.
- The sprites are Bupé's round-3 concept art. The top-down views were cut from the white sheets with `tools/cut_art.py` using a soft alpha matte, colour un-premultiplied against the paper so there is no halo, and colour bled outwards for clean GPU filtering. They are stored as `art/*.webp.b64`. Kingsting has no art yet, so it is the wasp scaled up, tinted red and given a glow.
- `tools/build_assets.py` generates the terrain, clouds and smoke procedurally.
- `.github/workflows/pages.yml` builds the site with `tools/build.sh`, which stamps a cache-busting version on each build, and publishes it to the `gh-pages` branch.
- Debug URL flags, all off by default: `?autoplay` (a bot flies the mission), `&ts=2` (time scale), `&warp=70&drones=12&weapon=rockets` (skip ahead), `&bosshp=`.

Local build: `pip install numpy scipy opencv-python-headless pillow && bash tools/build.sh _site`, then serve `_site/`.
