// Round 13: the meta layer. The title screen's icons (Base, Store, Settings) and cards (Depot, Hangar, Workshop),
// their panels, the Workshop multipliers, the bank of coins and stones, and Settings.
// It is loaded before game.js as its own module; game.js talks to it only through window.JCMETA.
const JCMETA = {
  init(api) { this.api = api; },   // called once at the end of boot() with the game's hooks
  onHome() { },                     // the title screen is showing again after a run
  open(id) { },                     // open a panel: 'workshop' | 'depot' | 'hangar' | 'store' | 'base' | 'settings'
  mult(kind) { return 1; },         // Workshop multipliers: 'rev' (coins per Xora), 'dmg' (damage), 'rate' (fire rate)
  bankAdd(haul) { },                // add a run's haul to the bank: { coins, gems, rubies, diamonds }
  bank() { return { coins: 0, gems: 0, rubies: 0, diamonds: 0 }; },
  settings: { music: true, sfx: true, vibe: true },
};
window.JCMETA = JCMETA;
