# Grok Demo: Mission 1, "Get to Beacon" (round 12)

A portrait, touch-first sky shooter for mobile browsers, and a prototype of *Jetcraft: Invasion Earth*. Atlas flies the biplane across the Channel coast to **Beacon**, the base. On the way you build a drone squad, shoot gates positive, crack weapon canisters, smash loot crates, rescue a cocooned pilot and bring down the **Xora Queen**. The alien race is the **Xora**.

**Play:** https://okbupe.github.io/grok-demo/
Earlier rounds are kept frozen for comparison: **Round 11** at https://okbupe.github.io/grok-demo/v11/, **Round 10** at https://okbupe.github.io/grok-demo/v10/, **Round 9** at https://okbupe.github.io/grok-demo/v9/, **Round 8** at https://okbupe.github.io/grok-demo/v8/, **Round 7** at https://okbupe.github.io/grok-demo/v7/, **Round 6** at https://okbupe.github.io/grok-demo/v6/, **Round 5** at https://okbupe.github.io/grok-demo/v5/, **Round 4** at https://okbupe.github.io/grok-demo/v4/, **Round 3** at https://okbupe.github.io/grok-demo/v3/ and **Round 2** at https://okbupe.github.io/grok-demo/v2/. The title screen links to all ten on one line ("Previous versions: 11 · 10 · 9 · 8 · 7 · 6 · 5 · 4 · 3 · 2", 264 px wide at 390 px).

## Controls
All gestures work **anywhere on the screen**.
- **Steer:** drag left or right. Firing is automatic from the first frame.
- **Beam** (after you collect the BEAM canister): **swipe up** to switch it on, **swipe down** to switch it off. The first 5 s are free. After that it drains your health and the plane smokes. The drain eases off as you get close to the 12 HP cut-off, where it shuts off by itself.
- **Omega Beam:** when the purple HUD bar is full, **double-tap** to fire a screen-wide beam.
- **Shake off clinging Xora:** steer hard left and right.
- **Desktop:** arrow keys or A/D to steer, W/↑ for beam on, S/↓ for beam off, Space or E for Omega, Enter to continue an explainer.
- **Gesture rules (`CFG`):**
  - **Swipe:** must travel at least 55 px (`swipeMinPx`) within 300 ms of touch-down (`swipeMaxMs`).
  - It must be mostly vertical, with |dy| > 2.2·|dx| (`swipeRatio`), and move at least 0.45 px/ms (`swipeMinV`).
  - It must have less than 34 px of sideways travel before it (`swipeMaxPathX`). The flick's own few px of steering are handed back.
  - **Tap:** under 200 ms (`tapMs`) and under 12 px of movement (`tapPx`).
  - **Double tap:** the second tap starts within 300 ms of the first ending (`dblTapMs`) and within 70 px of it (`dblTapPx`).
  - A single tap does nothing in play. Steering drags, slow or diagonal drags, and a drag that ends in an upward flick never count as a swipe or a tap.

## New in round 12
- **Bullet-time tutorials** replace every tutorial bubble.
  - **How it looks:** the game eases into near-frozen slow motion (down to 3 % speed over 0.7 s). Everything except your plane turns grey and dims, with a soft vignette. The cameras push in toward the plane with a little parallax. It eases back out over 0.5 s.
  - **Order:**
    1. Omega full: a hand double-taps, "DOUBLE TAP".
    2. About 2 s after the first Omega ends: a hand points at the Omega bar, with pictures of what fills it (orb +++, MAX gate ++, elite kill ×3) and a meter filling in steps.
    3. First BEAM pickup: a hand swipes up.
    4. After the 5 s free beam: a hand swipes down.
    5. About 2 s after the beam goes off: beam + stopwatch 5 → smoking, flashing plane, and a heart with a draining health bar that slows before its cut-off mark.
  - **Continuing:** doing the gesture continues the game (and also fires the Omega or toggles the beam). The two explainers continue on a tap.
  - **Repeats:** each tutorial shows once (localStorage `grokdemo.tut`). `?tut=1` resets them and `?tut=0` turns them off.
  - **Autoplay:** the bot performs each gesture after 1.4 s (`&btbot=N` changes the delay).
- **New controls:** Omega is a double-tap anywhere, and the beam is a swipe up/down anywhere (see Controls).
- **Title screen:** the instructions are gone. A cartoon hand now sways left/right over the plane between two pulsing arrows, above TAP TO FLY, the threat card and the Previous versions link.
- **Boss warning:** "B-RANK THREAT APPROACHING" is now a dark plate hanging under the hazard tape. B-RANK is in the B badge's red-orange and the rest is in white. It pulses with the tape.
  - The old "WARNING! XORA QUEEN INBOUND" banner and the Queen's name banner on arrival are gone. The tape shows once per boss approach.
- **Pickup popups:** RAPID FIRE, ORANGE/BLUE ROUNDS, BEAM!, ROCKETS, BAZOOKA!, PILOT RESCUED!, OVERHEAT! and LOW HP! are now compact popups above the plane instead of full-screen banners.
- **Gates:** no more "Shoot the gates" bubble, and a gate now inflates up to +40 % (`gateGrow`).
- **HUD:** the full Omega bar shows two blinking tap dots instead of "TAP THE PLANE!".
- Round 11 (commit 91fa01f) is frozen at `/v11/`.

## New in round 11
Round 10's results screen is kept, with these fixes:
- **DRONES row:** the ×0.4 chip is slimmer (22 px tall, was 28 px) and the drone count is taller (Luckiest Guy 60 px, was 52 px; about 50 px of digit ink). The DRONES + chip stack (47 px) is about as tall as the digits, and the icon, number and stack are vertically centred on each other. The row is centred in the card as a group.
- **No flying drones in the drain:** only the drone number counts down. The coin total still ticks up with the tick sound and the bumps.
- **Coin row:** the coin and the number are centred as a group in the card and vertically centred on each other. Luckiest Guy sits its digits high in the line box, so the number is nudged down 5 px (8 px for the drone count) based on the measured ink.
- **Star sticker:** the purple ★ ×N chip now lives in a wrapper around the coin number. It always hangs off the last digit, overlapping its bottom-right corner by a fixed 24 px (the chip is anchored by its left edge, so ×1.25 and ×1.5 overlap the same), and tracks the number's width as it grows (3, 4, 5 digits) through the count-up, the punch and the landing. It has a hard, unblurred offset drop shadow and an 8° tilt, so it reads as a sticker.
- Round 10 (commit 2ea8b58) is frozen at `/v10/`.

## New in round 10
The round-9 sequence, sizes and impact are kept, with these changes:
- **BEACON IN SIGHT** is exactly the round-6 title again: Lilita One 28 px, normal letter spacing, gold `#ffd64a` with a 2 px brown `#3a2208` outline and a 4 px drop. It sits at the top of the card as in round 6 (16 px card padding).
- **Coin number:** the round-6 coin-number format (Luckiest Guy, normal spacing, `#ffe066`, brown outline and drop), scaled from 30 px to 56 px so the digits (42 px cap height plus outline) are a little shorter than the 55 px coin. The coin stays on the left, and the star sticker works as before.
- **DRONES row, rebuilt:** a bigger drone icon (70×58 px) and a bigger count (Luckiest Guy 52 px, the same style as the coin number in light blue), then the word DRONES with the **×0.4 chip directly under it, left-aligned**. The coin row and the drones row share one left edge and one 70 px icon column, so the two numbers line up. When the drain reaches 0, only the icon and the number fade.
- **Stones idle shine,** each on its own random timers so they never sync: **gems** get a light glint sweeping across the stone every 2.2–5.2 s; **rubies** get the same glint plus a soft, slow red glow; **diamonds** get the glint plus small twinkling star sparkles popping around them every 0.2–0.6 s. It's subtle. The old big halo and holy rays still only appear for extraordinary runs (`CFG.results`, `&shine=1`). `window.__AUDIT.stoneFx` logs every glint and sparkle with its time.
- Round 9 (commit 0cbb2ac) is frozen at `/v9/`.

## New in round 9
- **Results font:** the Mission Complete sequence (mission name, coin and drone numbers, labels, the ×0.4 chip, the star sticker, stone counts, CONTINUE, BANK) is back in **Lilita One**, the font of the round 5/6 results card. Round 7 had switched it to Luckiest Guy. Luckiest Guy stays on the HUD, the Omega bar and the boss warning.
- **Medium size:** the whole results screen is scaled to roughly midway between round 6 and round 8. Measured at 390×844 (round 8 → round 9; font sizes unless marked): banner 336 → 280 px wide, mission name 36 → 32 px, coin number 80 → 55 px, coin icon 80 → 55 px, drone number 56 → 42 px, drone icon 60 → 44 px, DRONES label 26 → 19 px, ×0.4 chip 22 → 17 px, star sticker 28 → 21 px, stone icons 66 → 40 px, stone counts 30 → 23 px, CONTINUE 34 px (264×63 button) → 31 px (242×58), card 329×560 → 315×500. The stomp, thuds, shakes, surges, punch and landing are unchanged.
- **No shine on normal runs:** the spinning halo behind the coin total, the holy light rays behind rubies and diamonds, and the glows on the coin, the numbers and the stones are gone. They only come back for an **extraordinary** run (`CFG.results`): a final total of at least `typicalFinal` (1900) × `coinX` (2.5), a coin boost (`S.coinBoost`, for future artifacts or boosters) of at least ×2, or a stone haul of at least 12 gems, 3 rubies or 3 diamonds. `window.__AUDIT.results.shine` and `shineWhy` say whether it shone and why. Debug: `&shine=1` forces the shine, `&shine=0` forbids it. The star celebration (badge rays, confetti, fireworks, PERFECT!) is unchanged.
- **Stone counts beside the icons:** each stone shows its icon with the **×N** to its right, on the same row.
- **Boss warning:** a red and black diagonal **hazard tape** (deep crimson and black bands, scrolling) runs across the screen at a slight tilt. On it is the boss's name, **XORA QUEEN**, in chunky 3D letters (Luckiest Guy with an 8-step extruded shadow) that are taller than the tape, so they spill over its top and bottom edges. A small "B-RANK THREAT APPROACHING" line sits under the tape. The whole warning flashes in contrast and brightness about three times a second for its 3.8 s. The siren and the dark music shift are unchanged.
- Round 8 (commit eb1161c) is frozen at `/v8/`.

## New in round 8
- **Unchanged:** plane position and size, drone size, camera and player row.
- **Smaller Xora with a perspective approach:** crawlers are **0.66×** their round-7 size near the squad (`CFG.bugScale`). On top of the camera's own perspective, each Xora is drawn at **0.55×** (`CFG.farScale`) when it enters at the top and grows smoothly (smoothstep) to full size by `CFG.nearZ`, so they read as approaching rather than growing. Elites, brutes, wasps, spitters and the cocoon carrier use the same factors. The Queen keeps her size. Hit radii follow the drawn scale every frame.
- **No dull moments:** a **filler stream** (`CFG.filler`) keeps at least 3 to 5 Xora on screen or about to enter between hordes, so the sky is never empty. Filler crawlers spawn off-screen at the top and their HP grows with mission time. The only lull is right after an Omega Beam: the stream pauses for `filler.lull` (2.0 s) after the beam ends. Hordes are **1.7× denser** (`hordeMul`) with slightly tighter spacing and 0.8× HP per bug. Coins come out a bit higher than in round 7 (about 1,090 stage coins vs 890 in an autoplay run).
- **Longer bullet reach:** bullets now travel to **0.88 of the screen height** above the plane (`CFG.bulletReach`, was 0.75), so fights happen further up the screen. The colour ladder is unchanged. Tracers are 15% thinner (`CFG.tracerW`).
- **Omega Beam reaches the top edge.** It damages everything visible that its cone touches, all the way to the top of the screen: Xora, the Queen, gates, crates, canisters, the cocoon and its carrier. Clinging Xora are always hit. The rumble and HUD shake are unchanged. `window.__AUDIT.omegaHit` logs hits by kind and the highest hit (`topY`, 0 = top edge).
- **Who clings:** only wasps and fast red spiders hunt and latch (`CFG.clingTypes`). Basic crawlers and the other types advance in crowds to a front line just ahead of the squad and bite from there. They never pass the player. All spawns stay off-screen at the top.
- The title's "Previous versions" link now shows just the numbers (7 · 6 · 5 · 4 · 3 · 2) and stays on one line. Round 7 (commit e003488) is frozen at `/v7/`.

## New in round 7
- **Mission Complete is now a timed, visual payout sequence** with very few words. The gold banner stomp, the star thuds and the celebration by star count are unchanged. Times are from the end of the mission (3 stars, 45 drones):
  1. **0.33 s** the banner stomps; the stars thud at about 1.1, 1.5 and 1.9 s (as before).
  2. **0.56 s** the mission name **BEACON IN SIGHT** drops in. **0.78 s** a big coin pops in. From the first star thud the number **counts up the stage coins** (Xora kills plus crate loot) in surges, one per star thud. Coins fly into the icon, every tick raises the pitch and bumps the number.
  3. **+0.26 s** after the count, the **DRONES** block slides in: the drones left as a big number, with a **×0.4** chip under it (the Lawnmower's `droneCoinMult`). The drones then **count down to 0**. Each one flies into the coin total and adds `CFG.droneCoinBase` (10) × the multiplier. The drain takes about 1.5 s, whatever the squad size.
  4. **Star bonus:** the stars pulse, a pink **★★ ×1.25** sticker streaks down from them (1★ ×1.0, 2★ ×1.25, 3★ ×1.5, from `CFG.starBonus`). 0.7 s later the total multiplies with a punch, a flash and a big shake.
  5. **Stones:** only the ones you got, one by one: **GEMS** (green), **RUBIES** (red) and **DIAMONDS**. Each pops in with a thud. Rubies and diamonds get a heavenly glow with light rays and a choir shimmer.
  6. The **final total lands** with a big thud, a gold burst and a fanfare. Then **CONTINUE** slides in (it restarts the mission for now) with a tiny `BANK` line. The whole sequence is about 9 to 10 s.
  - **Tap anywhere** (not the button) to skip straight to the end. The totals are the same because the sequence is a single timeline.
  - **Maths:** `final = round((stageCoins + round(drones × droneCoinBase × droneCoinMult)) × starBonus[stars])`. `window.__AUDIT.results` logs every term, the timeline and the value shown.
  - The time, the Xora kill count, the per-enemy breakdown and the star checklist are gone from the win screen. The SHOT DOWN screen is unchanged.
  - Sound (all procedural): rising-pitch count ticks, surges on the star thuds, whooshes, drone zips and coin pings, a riser and a punch for the bonus, stone thuds, a choir pad for rare stones, a landing thud and a fanfare.
- **Rubies** are a new rare loot type, rarer than gems. They can come from any crate (4%), an elite kill (beetle or spitter, 15%) or a carrier kill (30%) (`CFG.loot.ruby`). There is a red HUD counter between gems and diamonds. Debug: `&ruby=1` makes every roll succeed.
- **Warning banners are only for bosses now:** the B-rank Xora Queen threat banner (with its siren and mood shift) and the Queen's arrival stay. The "XORA SWARM INCOMING!", "ELITES!", "SPITTER!" and "ENRAGED!" banners are gone. Weapon pickups and "PILOT RESCUED!" still get banners.
- **HELP!** A bobbing cartoon speech bubble in the comic font sits over the trapped pilot's cocoon. It goes away the moment the pilot is freed, and then the usual rescue plays.
- Round 6 is frozen at `/v6/`.

## New in round 6
- **Snug squad:** the round-5 keep-out box around the main plane is gone. At boot every spot of the same staggered formation is tested against the plane's real silhouette (its alpha mask, as seen through the gameplay camera). The first drones tuck in right beside the wingtips, then behind the wings, beside the nose and behind the tail, and the rest pack outward. No hollow ring, cap still **50**. `CFG.droneHug` and `CFG.droneHugPad` set how tight.
- **Shake overhaul (trauma model):** events add *trauma*, the visible shake is trauma², and trauma decays fast (`CFG.shake.decay`). Offsets come from smooth noise plus a little roll. They are applied to the cameras with **parallax**: the ground layer moves most, the far clouds less (`clouds` 0.6) and the gameplay layer (plane, squad, Xora) slightly (`game` 0.3). The HUD stays still, **except during the Omega Beam**, when it rumbles with the world.
  - Breaking a crate, canister or power box: a strong thud, like the Mission Complete star thud.
  - Elite or big Xora death: medium. Pickups (weapon icons landing, Omega orbs, gems, the rescued pilot): small. Gate MAX: small.
  - **Omega Beam:** a continuous strong earthquake for the whole beam, ending with a burst.
  - **Queen's death:** a chain of explosions at random, irregular intervals (quick doubles, normal beats and pauses, 0.12 to 0.6 s apart). They vary in size and are spread across her body. Each one is a sharp burst that settles before the next, the final blast is the biggest, and the chain lasts about 2.5 to 3.5 s.
  - The Mission Complete stomp and star thuds stay.
  - `navigator.vibrate` gives short buzzes on thuds, Omega and the boss explosions. It only fires after a user gesture and is always wrapped in try/catch.
- **RAPID FIRE canister** (lightning bolt over triple bullets): the fire rate goes ×1.5, then ×2 (`CFG.rapidMul`) for the plane **and every drone**. You get a banner, and the HUD shows ⚡RAPID. It is separate from the orange/blue damage tiers. There are two in the mission.
- **Crates are loot now:** a big icon on each crate shows what's inside (a coin pile, a gem or a diamond). When a crate breaks, the loot bursts out and flies to the HUD counters. Crates hold mostly coins, sometimes gems and rarely a diamond (with a sparkle). Drones now come only from gates, cocoons and drone canisters.
- **Coins:** every Xora kill pays by type (`CFG.coins`: crawler 1, wasp 2, brute 5, elites 12, the Queen 300). The HUD has coin, gem and diamond counters. The results card shows a coin count-up with the breakdown (Xora × value, plus crate loot) and the gems and diamonds collected. The running total is kept in `localStorage` (optional "Bank").
- **Threat ranks (a first taste):** the title card says *"This mission is filled with C-RANK threats. Ready?"*. About 15 s before the Queen appears, a hazard-striped **B-RANK THREAT: XORA QUEEN APPROACHING** banner slams in with a siren. The ambience then turns dark (a lower drone plus a slow heavy pulse) and stays that way through the boss fight.
- The alien race is the **Xora** in all player-facing text (the results label is "XORA", the boss is the **Xora Queen**, and a "XORA SWARM INCOMING!" banner opens the first big wave).

## New in round 5
- **Packed squad:** drones fill the space closest to the plane first, in the same staggered formation style. The cap is **50** everywhere, including gate gains.
- **Drone spawn effect:** each new drone pops in scaled up and stretched away from the squad, then eases into its slot inside a glowing sparkle swirl, with a chunky gold comic **+1** (Luckiest Guy font, vendored in `fonts/`).
- **Hunters:** the Xora come from ahead and never fly past the plane or off the bottom. When they get close they chase the squad, swing wide of the guns, and latch onto the plane or a drone, clawing it for damage over time until they are shot or shaken off. Drones shoot clinging Xora first. Hunter packs (fast red spiders) dive in from the top corners. Only gates, canisters, crates and orbs scroll past.
- **Cocoon rescue** (about 50 s): a wasp brings a pilot's amber cocoon in from the side and holds it ahead of you. Its HP shows under the glass. It cracks at half HP. At 0 it shatters, the pilot flies to the squad and you get **+8 drones** and "PILOT RESCUED!". You can shoot the carrier too. If you don't free the pilot within 12 s, the carrier escapes with the cocoon.
- **Gates inflate:** a gate grows linearly with its value, up to **+20% at MAX 1000**. Negative gates stay at their base size. A gate that starts positive stays at base size until its first hit. Every hit gives a short "feeding" pulse. Blue gates restore health, which matters now that the beam costs HP.
- **Omega Beam:** the bar fills from kills (faster with combos and while you avoid damage), from maxed gates, and from **Omega orbs** (glowing purple-white pickups that scroll past). All players have the Omega tier for now. The code already has `ORB_TIERS` (Delta, Beta, Gamma, Alpha, Omega) with only Omega active.
- **Screen shake only where it matters:** pickups (small), big or elite kills (medium), gate MAX (small), Omega, and the Queen's death as a rolling chain of 12 bombs over about 2.5 s, each with its own pulse. Normal shooting never shakes.
- **Mission Complete:** the gold strip stomps in with a shake and a dust ring. The stars are cartoon style and each lands with a thud. **3 stars:** rays, glow, confetti, fireworks and "PERFECT!". **2 stars:** rays and a little confetti. **1 star:** the star simply appears.
- **Star rules** (shown on the results card): ★ complete the mission; ★★ finish with at least 50% health **or** rescue the pilot; ★★★ at least 50% health **and** the pilot rescued **and** at least 15 drones at the end.
- The base is now called **Beacon** ("BEACON IN SIGHT").

## Rules of the sky
- Open sky: no lanes, dots or dividers. Nothing casts a shadow. Bullets reach about 0.88 of the screen height above the plane. The Omega Beam reaches the top edge.
- One gate per row, with a canister, crate or Xora beside it. No Xora sit directly behind a gate.
- **Gates:** every bullet adds +1 (rockets and shells add more). At **1000** a gate turns gold and shows **MAX**. A blue gate gives drones and restores health. A red gate takes drones.
- **Bullet tiers:** standard, then orange, then blue.
- Health bars change colour. Something happens every 1 to 2 seconds.

## Tuning
All sizes, speeds, camera, gesture thresholds, shake (trauma decay, layer amplitudes, Omega rumble), rapid-fire steps, coin values, loot (including ruby chances), the drone payout (`droneCoinBase`, per-plane `planes.*.droneCoinMult`) and the star bonus (`starBonus`), the results shine rule (`results`), bullet time (`bt`: ease in/out, slowest speed, dim, per-layer zoom, bot delay), the beam's low-HP drain easing (`beamDrainLow`) live in the **`CFG` block at the top of `game.js`**: plane, drone, gate, Xora, boss, cocoon and orb sizes; scroll, object and Xora speed; hunter speed and radius; camera position and FOV; drone spacing; beam grace and drain; Omega damage; tap and swipe thresholds. Star rules are in `CFG_STARS`.

## Tech
- Three.js is vendored at build time, so there is no CDN at runtime. A 2D canvas overlay draws numbers, bars, badges, sparkles and beams. The HUD is HTML/CSS, and the sound is WebAudio.
- Sprites are stored as `art/*.webp.b64`. `tools/cut_cocoon.py` cuts the three cocoon stages from the reference sheet with the shared alpha matte from `tools/cut_art.py`, so there is no white halo.
- `tools/build.sh` builds the site, stamps a cache-busting version, copies `fonts/`, and copies the frozen `v2/`, `v3/`, `v4/`, `v5/`, `v6/`, `v7/`, `v8/`, `v9/`, `v10/` and `v11/` builds (v5 = commit f19e5cd, v6 = commit b4f3de1, v7 = commit e003488, v8 = commit eb1161c, v9 = commit 0cbb2ac, v10 = commit 2ea8b58, v11 = commit 91fa01f). `.github/workflows/pages.yml` publishes to `gh-pages`.
- Font: Luckiest Guy by Astigmatic, from Google Fonts, vendored as `fonts/luckiest.woff2` (Apache License 2.0, see `fonts/LICENSE-LuckiestGuy.txt`).
- **Debug URL flags** (all off by default): `?autoplay` (a bot flies the mission), `&ts=2`, `&warp=60`, `&drones=20`, `&tier=0|1|2`, `&weapon=beam|gun`, `&beamon=1`, `&rockets=1`, `&bazooka=1`, `&bosshp=`, `&hp=`, `&omega=0..1` (starting charge), `&cocoon=T` (cocoon time in seconds), `&rapid=0|1|2`, `&ruby=1` (every ruby roll succeeds).
- **Audit:** `window.__AUDIT` records spawns (`seen`, `maxY`, `viol` for mid-screen pop-ins, `brood`, `gatePairs`, `minGap`), hunters (`bottomExit`, `bugMaxScreenY`, `removedOffscreen`, `latchTotal`, `latchPlaneMax`, `flung`), the cocoon event log (`cocoon`, `carriers`), Omega (`omegaFires`, `omegaHits`, `orbs`), the beam (`beamOn`, `beamOff`, `beamDrainHp`, `beamSmoke`), gates (`gateMaxScale`, `gateScaleAtMax`), `shakes` by kind (`{n, peak}`), `shakeLog`, `omegaRumble` (per-frame shake during Omega), `bossChain` and `bossTrace` (the death chain), `shotsPlane`/`shotsDrone`, `rapid`, `loot`, `coins` by type, `results`, `threat`, `vibrate`, `slots`, `maxDrones`, `bombs`, `stars`, `rubies` (ruby drops), `omegaHit` and `deathY` (round 8: Omega hits by kind with the highest hit, and the screen y of each Xora death) and `results` (round 7: stage, drones, droneBonus, starMult, final, shown, skipped, timeline). `window.__G.GLOG` logs every gesture decision.

Local build: `pip install numpy scipy opencv-python-headless pillow && bash tools/build.sh _site`, then serve `_site/`.
