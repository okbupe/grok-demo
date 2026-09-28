# Grok Demo: Jetcraft: Invasion Earth

A mobile-first sky lane-runner you play in the browser. Fly a rusty yellow WWII prop plane and its wingman squad over the coast, pick the right gates, crack weapon pods, and shoot down the Chitin Queen.

**Play:** https://okbupe.github.io/grok-demo/

## Controls
- **Phone:** drag left/right anywhere on the screen to steer. Firing is automatic.
- **Desktop:** Arrow keys or A/D (dragging with the mouse also works).

## Gameplay
- **Blue gates** add wingmen (+N, ×2). **Red gates** take them away. Shooting a blue "+N" gate raises its number.
- **Metal pods** show their hit points. Break one to get the weapon on its badge: twin/heavy guns, homing missiles, or +5 drones.
- Spiders that reach your formation destroy a wingman. With no wingmen left, you lose a heart (you have 3).
- The run lasts about 60 s and ends with a boss fight against the Chitin Queen. When a lane flashes red, get out of it before the acid volley comes.

## Tech
- Three.js (vendored at build time, no CDN at runtime) and a 2D canvas overlay for numbers and badges.
- Sprites are cut from the concept art (`art/*.b64`). The terrain, clouds and smoke are generated procedurally by `tools/build_assets.py`.
- `.github/workflows/pages.yml` builds the site with `tools/build.sh` and publishes it to the `gh-pages` branch.

Local build: `pip install numpy scipy opencv-python-headless pillow && bash tools/build.sh _site`, then serve `_site/`.
