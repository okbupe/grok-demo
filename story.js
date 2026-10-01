// Round 15: the comic story scenes (Bupé's proposal v). A scene is a few panels: a picture, a portrait card and two or
// three words in a speech bubble. Tap (or Space) for the next panel; SKIP ends the scene. game.js calls
// window.JCSTORY.play(id, done, data) and gets done() once the scene is over.
// The portraits are placeholder silhouettes until Bupé's art lands: put assets/portrait_<name>.webp in art/ (as .b64)
// and add the name to PORTRAITS so the card uses it (no request is made for a portrait that is not listed).
const VER = new URL(import.meta.url).searchParams.get('v') || '';
const asset = (f) => `assets/${f}?v=${VER}`;
const PORTRAITS = [];   // e.g. ['atlas', 'doc', 'ashford', 'haldane'] once the files exist
const WHO = {
  atlas: { name: 'ATLAS', col: '#3d8bff', hair: 'M22 30 Q20 12 40 10 Q60 12 58 30 Q52 20 40 20 Q28 20 22 30Z', helmet: true },
  doc: { name: 'DOC', col: '#ff9a2a', hair: 'M20 34 Q18 10 40 9 Q62 10 60 34 Q56 22 48 20 L40 26 L32 20 Q24 22 20 34Z', goggles: true },
  ashford: { name: 'CMDR ASHFORD', col: '#3fbf4a', hair: 'M20 28 H60 L56 16 Q40 6 24 16Z', cap: true },
  haldane: { name: 'HALDANE', col: '#b77bff', hair: 'M22 32 Q22 12 40 11 Q58 12 58 32 L54 24 H26Z' },
};
function portrait(k) {
  const w = WHO[k]; if (!w) return '';
  const pic = PORTRAITS.includes(k) ? `<img src="${asset('portrait_' + k + '.webp')}" alt="">`
    : `<svg viewBox="0 0 80 92" aria-hidden="true"><defs><linearGradient id="sp${k}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${w.col}"/><stop offset="1" stop-color="#101a33"/></linearGradient></defs>
      <rect width="80" height="92" fill="url(#sp${k})"/><path d="M8 92 Q10 64 40 62 Q70 64 72 92Z" fill="#0b1226"/><circle cx="40" cy="38" r="19" fill="#0b1226"/><path d="${w.hair}" fill="#0b1226"/>
      ${w.cap ? '<path d="M16 26 H64 V30 H16Z" fill="#0b1226"/>' : ''}${w.goggles ? '<rect x="24" y="30" width="32" height="9" rx="4" fill="#ffd64a" opacity=".85"/>' : ''}${w.helmet ? '<path d="M24 22 Q40 4 56 22" fill="none" stroke="#0b1226" stroke-width="8"/>' : ''}
      <text x="40" y="52" text-anchor="middle" font-family="LuckiestG,sans-serif" font-size="22" fill="${w.col}" opacity=".9">?</text></svg>`;
  return `<div class="sy-port ${k}">${pic}<b>${w.name}</b></div>`;
}
// the scene pictures (simple SVG backdrops plus the game's own art)
const SKY = (a, b) => `background:linear-gradient(${a},${b})`;
const PIC = {
  sign: () => `<div class="sy-bg" style="${SKY('#7fc8ff', '#d9f0ff')}"></div><svg class="sy-svg" viewBox="0 0 200 140"><path d="M0 110 Q60 96 120 106 T200 100 V140 H0Z" fill="#5f9a3a"/>
    <rect x="96" y="64" width="6" height="50" fill="#6b4a2a"/><path d="M60 50 H150 L162 62 L150 74 H60Z" fill="#ffd64a"/><text x="106" y="67" text-anchor="middle" font-family="LuckiestG,sans-serif" font-size="13" fill="#3a2208">BEACON ➜</text>
    <path d="M40 74 H92 V92 H40 L30 83Z" fill="#c9d3df"/><text x="63" y="87" text-anchor="middle" font-family="LuckiestG,sans-serif" font-size="9" fill="#3a2208">RIDGEBACK</text></svg>`,
  attack: () => `<div class="sy-bg" style="${SKY('#3a0f2a', '#b2342a')}"></div><img class="sy-img xora" src="${asset('r2_spider.webp')}" alt=""><img class="sy-img xora b" src="${asset('r2_spider.webp')}" alt=""><i class="sy-boom"></i>`,
  hangar: () => `<div class="sy-bg" style="${SKY('#060a18', '#1c2a48')}"></div><i class="sy-lamp"></i><img class="sy-img pw dark" src="${asset('patchwork.webp')}" alt="">`,
  sky: () => `<div class="sy-bg" style="${SKY('#ff8a3a', '#5a2a6a')}"></div><img class="sy-img lm" src="${asset('r2_plane.webp')}" alt="">`,
  wreck: () => `<div class="sy-bg" style="${SKY('#cfd6e0', '#8a7a6a')}"></div><img class="sy-img wk" src="${asset('wreck.webp')}" alt=""><i class="sy-smoke"></i><i class="sy-smoke s2"></i>`,
  weld: () => `<div class="sy-bg" style="${SKY('#0b1020', '#2a3550')}"></div><img class="sy-img pw" src="${asset('patchwork.webp')}" alt=""><i class="sy-spark"></i>`,
  shout: () => `<div class="sy-bg" style="${SKY('#ff5a3a', '#7a1a2a')}"></div>`,
  salvage: () => `<div class="sy-bg" style="${SKY('#2a3550', '#5a6a88')}"></div><img class="sy-img crate" src="${asset('crate1.webp')}" alt="">`,
  truck: () => `<div class="sy-bg" style="${SKY('#ffd9a0', '#9ad0ff')}"></div><svg class="sy-svg" viewBox="0 0 200 140"><path d="M0 112 H200 V140 H0Z" fill="#7a6a52"/>
    <rect x="50" y="70" width="70" height="36" rx="3" fill="#5f7a3a"/><path d="M120 80 H146 L158 94 V106 H120Z" fill="#7c8a55"/><rect x="128" y="84" width="16" height="9" fill="#bfe6ff"/>
    <circle cx="70" cy="108" r="9" fill="#1a1a1a"/><circle cx="140" cy="108" r="9" fill="#1a1a1a"/><path d="M14 98 Q26 92 40 98" stroke="#d8c8a8" stroke-width="5" fill="none" stroke-linecap="round"/></svg>`,
  report: () => `<div class="sy-bg" style="${SKY('#1c2a48', '#3a4a6a')}"></div><img class="sy-img pw small" src="${asset('patchwork.webp')}" alt="">`,
};
// the scenes: [picture, who, words, extra]. Few words (Bupé: picture first)
const SCENES = {
  m1end: [['sign', 'ashford', 'BEACON. FINALLY.'], ['attack', 'atlas', 'I NEED A BETTER JET!'], ['attack', 'ashford', 'THE PLANS ARE GONE.'], ['hangar', 'doc', "IT WON'T START."], ['sky', 'atlas', "I'LL BUY YOU TIME."]],
  reset: [['wreck', 'atlas', '...OW.'], ['weld', 'doc', 'HOLD STILL.'], ['shout', 'atlas', 'BARE BONES?!', 'shake'], ['shout', 'doc', "IT'S ALL I'VE GOT!", 'shake'], ['salvage', 'doc', 'HERE. SALVAGE.', 'salvage']],
  haldane: [['truck', 'haldane', 'SALVAGE IN!'], ['report', 'haldane', 'MORE OUT THERE.'], ['report', 'atlas', "THEN WE GO."]],
};
let root = null, cur = null;
function el() { root = root || document.getElementById('story'); return root; }
function draw() {
  const r = el(), [pic, who, words, fx] = cur.panels[cur.i], d = cur.data || {};
  const extra = fx === 'salvage' && d.salvage ? `<div class="sy-loot"><i class="ico coin"></i><b>+${(d.salvage.coins || 0).toLocaleString('en-GB')}</b>${d.salvage.gems ? `<i class="ico gem"></i><b>+${d.salvage.gems}</b>` : ''}</div>` : '';
  r.innerHTML = `<div class="sy-panel${fx === 'shake' ? ' shake' : ''}">${PIC[pic]()}${portrait(who)}<div class="sy-say"><b>${words}</b></div>${extra}</div>
    <div class="sy-dots">${cur.panels.map((_, i) => `<i class="${i === cur.i ? 'on' : ''}"></i>`).join('')}</div><button class="sy-skip" aria-label="Skip">SKIP ▸▸</button>`;
  r.querySelector('.sy-skip').addEventListener('pointerdown', (e) => { e.stopPropagation(); finish(true); });
  if (window.__AUDIT) (window.__AUDIT.story = window.__AUDIT.story || []).push([cur.id, cur.i]);
}
function next() { if (!cur) return; if (performance.now() - cur.t < 260) return; cur.t = performance.now(); cur.i++; if (cur.i >= cur.panels.length) finish(false); else draw(); }
function finish(skipped) {
  if (!cur) return; const c = cur; cur = null; const r = el(); r.className = 'hidden'; r.innerHTML = '';
  if (window.__AUDIT) window.__AUDIT.storyEnd = { id: c.id, skipped };
  try { c.done && c.done(); } catch (e) { console.error(e); }
}
function key(e) { if (!cur) return; if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); next(); } if (e.key === 'Escape') { e.stopPropagation(); finish(true); } }
window.addEventListener('keydown', key, true);
window.JCSTORY = {
  SCENES, PORTRAITS,
  play(id, done, data) {
    const panels = SCENES[id]; if (!panels || !el()) { if (done) done(); return; }
    if (cur) finish(true);
    cur = { id, panels, i: 0, done, data, t: performance.now() };
    const r = el(); r.className = 'show'; draw();
    if (!r.dataset.wired) { r.dataset.wired = '1'; r.addEventListener('pointerdown', (e) => { e.stopPropagation(); next(); }); }
  },
  next, skip: () => finish(true), get playing() { return cur ? { id: cur.id, i: cur.i, n: cur.panels.length } : null; },
};
