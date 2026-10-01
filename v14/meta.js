// Round 13: the meta layer. The title screen's icons (Base, Store, Settings) and cards (Depot, Hangar, Workshop),
// their panels, the Workshop multipliers, the bank of coins and stones, and Settings.
// It is loaded before game.js as its own module; game.js talks to it only through window.JCMETA.
const VER = new URL(import.meta.url).searchParams.get('v') || '';
const $ = (id) => document.getElementById(id);
const asset = (f) => `assets/${f}?v=${VER}`;
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rand = (a, b) => a + Math.random() * (b - a);

// ---------------------------------------------------------------- storage (every access guarded: a private window can throw)
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); if (v == null) return d; const o = JSON.parse(v); return o == null ? d : o; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { } },
};
const whole = (v) => { v = Math.floor(Number(v)); return isFinite(v) && v > 0 ? v : 0; };

// ---------------------------------------------------------------- the Workshop maths: one tunable table (prototype numbers)
// One level = WS.pips pips, then the milestone jump. Multiplier = 1 + pips x pip + milestones x jump.
// Pip coin cost = cost0 x growth^n (n = pips bought on that track), rounded to 2 significant figures.
// The milestone costs jumpGems x the level number in gems, plus jumpCoins x the next pip's coin cost.
const WS = {
  pips: 5, cost0: 250, growth: 1.35, jumpGems: 2, jumpCoins: 1.5,
  tracks: {
    rate: { name: 'FIRE RATE', pip: 0.05, jump: 0.25 },
    dmg: { name: 'DAMAGE', pip: 0.05, jump: 0.25 },
    rev: { name: 'REVENUE', pip: 0.10, jump: 0.50 },
  },
};
const TRACKS = Object.keys(WS.tracks);
const sig2 = (x) => { if (!(x > 0)) return 0; const p = Math.pow(10, Math.floor(Math.log10(x)) - 1); return Math.round(x / p) * p; };
const r2 = (x) => Math.round(x * 100) / 100;
function trackState(k, p) {
  if (p === undefined) p = ws[k] || 0;
  const per = WS.pips + 1, L = Math.floor(p / per), r = p % per, T = WS.tracks[k];
  const pips = L * WS.pips + Math.min(r, WS.pips), milestone = r === WS.pips, level = L + 1;
  const pipCost = sig2(WS.cost0 * Math.pow(WS.growth, pips));
  const cost = milestone ? { coins: sig2(pipCost * WS.jumpCoins), gems: WS.jumpGems * level } : { coins: pipCost, gems: 0 };
  return { k, p, level, filled: Math.min(r, WS.pips), pips, jumps: L, milestone, mult: r2(1 + pips * T.pip + L * T.jump), cost };
}

// ---------------------------------------------------------------- the bank, the Workshop and Settings (localStorage)
const clean = (b) => ({ coins: whole(b && b.coins), gems: whole(b && b.gems), rubies: whole(b && b.rubies), diamonds: whole(b && b.diamonds) });
let bank = store.get('jc.bank', null);
if (!bank || typeof bank !== 'object') { bank = clean({ coins: store.get('grokdemo.coins', 0) }); store.set('jc.bank', bank); }   // migrate the round 5 to 12 coin total, once
bank = clean(bank);
const saveBank = () => store.set('jc.bank', bank);
let ws = store.get('jc.workshop', {}); ws = { rate: whole(ws && ws.rate), dmg: whole(ws && ws.dmg), rev: whole(ws && ws.rev) };
const saveWs = () => store.set('jc.workshop', ws);
const settings = { music: true, sfx: true, vibe: true };
{ const s = store.get('jc.settings', {}); for (const k of Object.keys(settings)) if (s && typeof s[k] === 'boolean') settings[k] = s[k]; }
const MULT = { rate: 1, dmg: 1, rev: 1 };
let api = null;
function recalc() { for (const k of TRACKS) MULT[k] = trackState(k).mult; if (api && api.setMult) api.setMult({ ...MULT }); }
recalc();
const sfx = (n, a) => { if (api && api.sfx) api.sfx(n, a); };
const unlock = () => { if (api) { if (api.initAudio) api.initAudio(); if (api.applyAudio) api.applyAudio(); } };

// ---------------------------------------------------------------- art: every icon and illustration is drawn here as inline SVG
const O = '#14213d';   // the chunky dark outline
const svg = (vb, inner, cls = '') => `<svg${cls ? ` class="${cls}"` : ''} viewBox="${vb}" aria-hidden="true">${inner}</svg>`;
const P = (cx, cy, a, r) => `${(cx + Math.cos(a) * r).toFixed(1)} ${(cy + Math.sin(a) * r).toFixed(1)}`;
function gearPath(cx, cy, rOut, rIn, n, tip = 0.42, root = 0.64) {
  let d = ''; const p = TAU / n;
  for (let i = 0; i < n; i++) {
    const a = i * p - Math.PI / 2;
    d += (i ? 'L' : 'M') + P(cx, cy, a - p * root / 2, rIn) + 'L' + P(cx, cy, a - p * tip / 2, rOut) + 'L' + P(cx, cy, a + p * tip / 2, rOut) + 'L' + P(cx, cy, a + p * root / 2, rIn);
    d += `A${rIn} ${rIn} 0 0 1 ${P(cx, cy, a + p - p * root / 2, rIn)}`;
  }
  return d + 'Z';
}
function starPath(cx, cy, rO, rI, n = 5, rot = -Math.PI / 2) {
  let d = ''; for (let i = 0; i < n * 2; i++) d += (i ? 'L' : 'M') + P(cx, cy, rot + i * Math.PI / n, i % 2 ? rI : rO); return d + 'Z';
}
function burstPath(cx, cy, rO, rI, n) {
  let d = ''; for (let i = 0; i < n * 2; i++) d += (i ? 'L' : 'M') + P(cx, cy, i * Math.PI / n, i % 2 ? rI : rO * (0.8 + ((i * 37) % 7) / 28)); return d + 'Z';
}
// a gear with its hole and highlights
const gear = (cx, cy, rO, rI, n, hole, col = ['#eef3f9', '#aebdd0']) =>
  `<path d="${gearPath(cx, cy, rO, rI, n)}" fill="${col[0]}" stroke="${O}" stroke-width="3" stroke-linejoin="round"/>
   <path d="M${P(cx, cy, 0.3, rI - 3.5)} A${rI - 3.5} ${rI - 3.5} 0 0 1 ${P(cx, cy, 2.8, rI - 3.5)}" fill="none" stroke="${col[1]}" stroke-width="4" stroke-linecap="round"/>
   <circle cx="${cx}" cy="${cy}" r="${hole}" fill="#1b2f5a" stroke="${O}" stroke-width="3"/>
   <path d="M${P(cx, cy, 3.5, rI - 3.5)} A${rI - 3.5} ${rI - 3.5} 0 0 1 ${P(cx, cy, 4.9, rI - 3.5)}" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" opacity=".9"/>`;
// a coin seen face on
const coinF = (cx, cy, r) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#ffc21a" stroke="${O}" stroke-width="2.6"/><circle cx="${cx}" cy="${cy}" r="${(r * 0.68).toFixed(1)}" fill="#ffdb4d" stroke="#d98a00" stroke-width="${(r * 0.14).toFixed(1)}"/>
  <path d="M${(cx + r * 0.26).toFixed(1)} ${(cy - r * 0.3).toFixed(1)} A${(r * 0.38).toFixed(1)} ${(r * 0.38).toFixed(1)} 0 1 0 ${(cx + r * 0.26).toFixed(1)} ${(cy + r * 0.3).toFixed(1)}" fill="none" stroke="#c77700" stroke-width="${(r * 0.17).toFixed(1)}" stroke-linecap="round"/>
  <ellipse cx="${(cx - r * 0.4).toFixed(1)}" cy="${(cy - r * 0.42).toFixed(1)}" rx="${(r * 0.22).toFixed(1)}" ry="${(r * 0.13).toFixed(1)}" transform="rotate(-35 ${(cx - r * 0.4).toFixed(1)} ${(cy - r * 0.42).toFixed(1)})" fill="#fff" opacity=".9"/>`;
// a stack of coins seen from the side
function coinStack(cx, by, rx, n) {
  const ry = rx * 0.42, h = rx * 0.36; let s = '';
  for (let i = 0; i < n; i++) { const y = by - i * h; s += `<path d="M${cx - rx} ${(y - h).toFixed(1)} V${y.toFixed(1)} A${rx} ${ry.toFixed(1)} 0 0 0 ${cx + rx} ${y.toFixed(1)} V${(y - h).toFixed(1)}" fill="#e59a0c" stroke="${O}" stroke-width="2.4" stroke-linejoin="round"/>`; }
  const ty = by - n * h;
  return s + `<ellipse cx="${cx}" cy="${ty.toFixed(1)}" rx="${rx}" ry="${ry.toFixed(1)}" fill="#ffd23f" stroke="${O}" stroke-width="2.4"/><ellipse cx="${cx}" cy="${ty.toFixed(1)}" rx="${(rx * 0.6).toFixed(1)}" ry="${(ry * 0.55).toFixed(1)}" fill="#ffe57a"/>
    <ellipse cx="${(cx - rx * 0.4).toFixed(1)}" cy="${(ty - ry * 0.2).toFixed(1)}" rx="${(rx * 0.18).toFixed(1)}" ry="${(ry * 0.22).toFixed(1)}" fill="#fff" opacity=".9"/>`;
}
// a supply crate in three-quarter view: the front face, a lit top, a shaded side, planks, metal corners and an optional emblem
function crate(x, y, w, h, d, c = {}) {
  const f = c.front || '#d98a3f', t = c.top || '#f5b866', s = c.side || '#a65c25', pl = c.plank || '#9b541f', m = c.metal || '#b9c6d6', dy = d * 0.6;
  const cn = (cx, cy, sx, sy) => `<path d="M${cx} ${cy} h${sx * 9} v${sy * 3.6} h${-sx * 5.4} v${sy * 5.4} h${-sx * 3.6} Z" fill="${m}" stroke="${O}" stroke-width="1.8" stroke-linejoin="round"/>`;
  let planks = ''; for (let i = 1; i < 3; i++) planks += `<path d="M${x + 4} ${(y + h * i / 3).toFixed(1)} H${x + w - 4}" stroke="${pl}" stroke-width="2.2"/>`;
  return `<path d="M${x} ${y} L${x + d} ${y - dy} H${x + w + d} L${x + w} ${y} Z" fill="${t}" stroke="${O}" stroke-width="2.6" stroke-linejoin="round"/>
    <path d="M${x + w} ${y} L${x + w + d} ${y - dy} V${y + h - dy} L${x + w} ${y + h} Z" fill="${s}" stroke="${O}" stroke-width="2.6" stroke-linejoin="round"/>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${f}" stroke="${O}" stroke-width="2.6" stroke-linejoin="round"/>
    ${planks}<rect x="${x + 3.4}" y="${y + 3.4}" width="${w - 6.8}" height="${h - 6.8}" fill="none" stroke="${pl}" stroke-width="2.4"/>
    <path d="M${x + d * 0.5 + 3} ${(y - dy * 0.5).toFixed(1)} H${(x + w * 0.6).toFixed(1)}" stroke="#fff" stroke-width="2" opacity=".6" stroke-linecap="round"/>
    ${cn(x, y, 1, 1)}${cn(x + w, y, -1, 1)}${cn(x, y + h, 1, -1)}${cn(x + w, y + h, -1, -1)}${c.emblem || ''}`;
}
// a thick up chevron centred at (cx, cy)
const chev = (cx, cy, s, fill = '#ffd64a') => `<path d="M${cx - 10 * s} ${cy + 3 * s} L${cx} ${cy - 5 * s} L${cx + 10 * s} ${cy + 3 * s} L${cx + 10 * s} ${cy + 8 * s} L${cx} ${cy} L${cx - 10 * s} ${cy + 8 * s} Z" fill="${fill}" stroke="${O}" stroke-width="1.8" stroke-linejoin="round"/>`;
// a sparkle
const twinkle = (x, y, s) => `<path d="M${x} ${y - s} Q${x + s * 0.2} ${y - s * 0.2} ${x + s} ${y} Q${x + s * 0.2} ${y + s * 0.2} ${x} ${y + s} Q${x - s * 0.2} ${y + s * 0.2} ${x - s} ${y} Q${x - s * 0.2} ${y - s * 0.2} ${x} ${y - s}Z" fill="#fff"/>`;

const ART = {
  // the title icons (drawn inside the round buttons)
  base: svg('0 0 64 64', `<path d="M32 16 V3.5" stroke="${O}" stroke-width="3" stroke-linecap="round"/>
    <path d="M32 4.5 C36.5 2 40.5 7.5 46 5 V13 C40.5 15.5 36.5 10 32 12.5 Z" fill="#ff4a3a" stroke="${O}" stroke-width="2.6" stroke-linejoin="round"/>
    <path d="M34.5 6.5 C37 5.6 39.5 8.4 42.5 7.4" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" opacity=".85"/>
    <path d="M25.5 60 L28.6 31 H35.4 L38.5 60 Z" fill="#eef3fa"/><path d="M32.6 31 H35.4 L38.5 60 H34 Z" fill="#bccadc"/>
    <path d="M27 42 H37 M26.3 50.5 H37.7" stroke="#9fb0c6" stroke-width="2"/>
    <path d="M25.5 60 L28.6 31 H35.4 L38.5 60 Z" fill="none" stroke="${O}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M20.5 31.5 H43.5 L47 19.5 H17 Z" fill="#5fdcff" stroke="${O}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M25 20.5 L26.6 30.5 M32 20.5 V30.5 M39 20.5 L37.4 30.5" stroke="${O}" stroke-width="1.8"/>
    <path d="M20.2 22 L21.6 28.6" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".9"/>
    <path d="M15.5 20 H48.5 L44.5 13.8 H19.5 Z" fill="#2f5bb7" stroke="${O}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M21 16.2 H33" stroke="#8fb6ff" stroke-width="2" stroke-linecap="round"/>`),
  store: svg('0 0 64 64', `<path d="M9 33 H55 V51 Q55 56 50 56 H14 Q9 56 9 51 Z" fill="#c9692a" stroke="${O}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M9 33 V27 Q9 17.5 19 17.5 H45 Q55 17.5 55 27 V33 Z" fill="#e0853c" stroke="${O}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M12 44.5 H52" stroke="#8a4418" stroke-width="2.2"/><path d="M12.5 26 Q13 21 19 20.8 H27" stroke="#ffc58a" stroke-width="2.4" stroke-linecap="round" fill="none"/>
    <rect x="16" y="17.5" width="6" height="38.5" fill="#ffd64a" stroke="${O}" stroke-width="2.6"/><rect x="42" y="17.5" width="6" height="38.5" fill="#ffd64a" stroke="${O}" stroke-width="2.6"/>
    <rect x="27" y="28" width="10" height="12" rx="2" fill="#ffd64a" stroke="${O}" stroke-width="2.6"/><path d="M32 32 V36" stroke="${O}" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M22 9.5 L27 3.5 H37 L42 9.5 L32 22 Z" fill="#ff4fcf" stroke="${O}" stroke-width="2.6" stroke-linejoin="round"/>
    <path d="M22.5 9.5 H41.5 M27 3.8 L29.5 9.5 L32 21 M37 3.8 L34.5 9.5 L32 21" fill="none" stroke="#b0169a" stroke-width="1.4"/>
    <path d="M25.5 8 L28 5" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>${twinkle(51, 10, 4.5)}`),
  settings: svg('0 0 64 64', gear(32, 32, 25, 18.5, 8, 7.5)),
  // the three title cards
  depot: svg('0 0 100 100', `${crate(33, 28, 34, 25, 9, { emblem: `<path d="${starPath(50, 40.5, 7.5, 3.2)}" fill="#ffe27a" stroke="${O}" stroke-width="1.8" stroke-linejoin="round"/>` })}
    ${crate(9, 55, 44, 33, 9)}${crate(57, 60, 30, 28, 7, { front: '#7d9a4a', top: '#a9c46a', side: '#56702e', plank: '#56702e' })}
    ${coinStack(20, 97, 10, 3)}${coinStack(82, 98, 9, 2)}${coinF(46, 89, 9)}${coinF(62, 93, 7)}${twinkle(20, 22, 5)}${twinkle(84, 44, 3.5)}`),
  hangar: svg('0 0 100 100', `<defs><linearGradient id="hgIn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0c1730"/><stop offset="1" stop-color="#2a4c78"/></linearGradient>
      <linearGradient id="hgM" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#dfe9f4"/><stop offset="1" stop-color="#8ea6c0"/></linearGradient></defs>
    <path d="M-2 84 H102 V102 H-2 Z" fill="#5b6778"/><path d="M6 93 H18 M32 93 H44 M58 93 H70 M84 93 H96" stroke="#fff" stroke-width="2.6" opacity=".85"/>
    <path d="M6 84 V52 Q6 14 50 14 Q94 14 94 52 V84 Z" fill="url(#hgM)" stroke="${O}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M13 84 V54 Q13 21 50 21 Q87 21 87 54 V84" fill="none" stroke="#8098b2" stroke-width="2"/>
    <path d="M12 42 Q17 19.5 50 18" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".85"/>
    <path d="M20 84 V58 Q20 31 50 31 Q80 31 80 58 V84 Z" fill="url(#hgIn)" stroke="${O}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M23.5 84 V58.5 Q23.5 34.5 50 34.5 Q76.5 34.5 76.5 58.5 V84" fill="none" stroke="#ffd64a" stroke-width="2.2"/>
    <path d="M36 36 L30 84 H44 Z M64 36 L70 84 H56 Z" fill="#fff" opacity=".06"/>
    <image href="${asset('r2_plane.webp')}" x="22" y="42" width="56" height="50" preserveAspectRatio="xMidYMid meet"/>
    <path d="M82 17 V4" stroke="${O}" stroke-width="2.4" stroke-linecap="round"/><path d="M82 4.5 C85 3 87.5 6.5 91 5 V10.5 C87.5 12 85 8.5 82 10 Z" fill="#ff4a3a" stroke="${O}" stroke-width="2" stroke-linejoin="round"/>`),
  workshop: svg('0 0 100 100', `${gear(40, 50, 31, 24, 9, 9, ['#cfd9e5', '#98a9bd'])}
    <g transform="rotate(-42 50 52) translate(-6 2)">
      <path d="M14 45 H67 A13 13 0 0 1 89.3 43.5 L82 46 V54 L89.3 56.5 A13 13 0 0 1 67 55 H14 A5 5 0 0 1 14 45 Z" fill="#e3e9f1" stroke="${O}" stroke-width="3" stroke-linejoin="round"/>
      <path d="M16 47.6 H63" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/><path d="M18 52.6 H63" stroke="#a9b7c8" stroke-width="2.4" stroke-linecap="round"/>
      <circle cx="19" cy="50" r="2.4" fill="#1b2f5a"/></g>
    <path d="M70 92 V66 H60 L79 42 L98 66 H88 V92 Z" fill="#52d63e" stroke="${O}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M74 89 V63 H68 L79 49" fill="none" stroke="#c4ffab" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M85 89 V66" stroke="#2a9a2c" stroke-width="3" stroke-linecap="round"/>${twinkle(88, 30, 4.5)}`),
  // the Workshop track icons
  rate: svg('0 0 64 64', (() => {
    const b = (x, y) => `<g transform="translate(${x} ${y}) rotate(40)"><path d="M-5.5 -3 Q-5.5 -14 0 -19 Q5.5 -14 5.5 -3 Z" fill="#f08a3c" stroke="${O}" stroke-width="2.4" stroke-linejoin="round"/>
      <rect x="-5.5" y="-3" width="11" height="17" rx="1.2" fill="#ffcf3a" stroke="${O}" stroke-width="2.4"/><path d="M-5.5 10 H5.5" stroke="${O}" stroke-width="2"/><path d="M-2.6 -0.5 V8" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".85"/><path d="M-2.4 -6 Q-2.3 -12 0 -15" stroke="#ffd0a8" stroke-width="1.8" fill="none" stroke-linecap="round"/></g>`;
    return `<path d="M3 50 H15 M7 58 H21 M2 41 H10" stroke="#7fe0ff" stroke-width="3" stroke-linecap="round"/>${b(24, 44)}${b(36, 35)}${b(48, 26)}`;
  })()),
  dmg: svg('0 0 64 64', `<path d="${burstPath(44, 20, 19, 9, 9)}" fill="#ff5a2a" stroke="${O}" stroke-width="2.6" stroke-linejoin="round"/>
    <path d="${burstPath(44, 20, 11, 5.5, 7)}" fill="#ffe24a"/><circle cx="44" cy="20" r="3.5" fill="#fff"/>
    <g transform="translate(24 42) rotate(45)"><path d="M-7.5 -6 Q-7.5 -21 0 -27 Q7.5 -21 7.5 -6 Z" fill="#c9d3df" stroke="${O}" stroke-width="2.6" stroke-linejoin="round"/>
      <rect x="-7.5" y="-6" width="15" height="24" rx="1.5" fill="#ffcf3a" stroke="${O}" stroke-width="2.6"/><path d="M-7.5 13 H7.5" stroke="${O}" stroke-width="2.2"/>
      <path d="M-3.5 -2.5 V9.5" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/><path d="M-3.4 -10 Q-3 -18 0 -22" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round"/></g>
    <path d="M6 60 L12 54 M3 50 L9 47 M14 62 L17 56" stroke="#ff9a3a" stroke-width="2.6" stroke-linecap="round"/>`),
  rev: svg('0 0 64 64', `${coinStack(19, 60, 12, 4)}${coinStack(45, 60, 12, 2)}${coinF(37, 29, 13)}${coinF(53, 44, 8.5)}${twinkle(12, 12, 4.5)}`),
  // small icons
  close: svg('0 0 32 32', `<path d="M9 9 L23 23 M23 9 L9 23" stroke="${O}" stroke-width="9" stroke-linecap="round"/><path d="M9 9 L23 23 M23 9 L9 23" stroke="#fff" stroke-width="4.4" stroke-linecap="round"/>`),
  up: svg('0 0 32 32', `<path d="M16 4.5 L27.5 17 H21 V27.5 H11 V17 H4.5 Z" fill="#fff" stroke="${O}" stroke-width="2.6" stroke-linejoin="round"/>`),
  music: svg('0 0 32 32', `<path d="M12 23 V8 L26 5 V20" fill="none" stroke="${O}" stroke-width="5" stroke-linejoin="round"/><path d="M12 23 V8 L26 5 V20" fill="none" stroke="#ffd64a" stroke-width="2" stroke-linejoin="round"/>
    <ellipse cx="8.5" cy="23.5" rx="5" ry="4" fill="#ffd64a" stroke="${O}" stroke-width="2.4"/><ellipse cx="22.5" cy="20.5" rx="5" ry="4" fill="#ffd64a" stroke="${O}" stroke-width="2.4"/>`),
  sfx: svg('0 0 32 32', `<path d="M3.5 12 H9.5 L17.5 5 V27 L9.5 20 H3.5 Z" fill="#ffd64a" stroke="${O}" stroke-width="2.4" stroke-linejoin="round"/>
    <path d="M21.5 11 Q24.5 16 21.5 21 M25 7.5 Q30.5 16 25 24.5" fill="none" stroke="${O}" stroke-width="5" stroke-linecap="round"/><path d="M21.5 11 Q24.5 16 21.5 21 M25 7.5 Q30.5 16 25 24.5" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/>`),
  vibe: svg('0 0 32 32', `<rect x="10" y="4" width="12" height="24" rx="3" fill="#7fd0ff" stroke="${O}" stroke-width="2.4"/><rect x="12.6" y="8" width="6.8" height="14" rx="1" fill="#1b2f5a"/>
    <path d="M5 10 L3 13 L5 16 L3 19 L5 22 M27 10 L29 13 L27 16 L29 19 L27 22" fill="none" stroke="${O}" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M5 10 L3 13 L5 16 L3 19 L5 22 M27 10 L29 13 L27 16 L29 19 L27 22" fill="none" stroke="#ffd64a" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`),
  replay: svg('0 0 32 32', `<path d="M26 16 A10 10 0 1 1 20 6.8" fill="none" stroke="${O}" stroke-width="7" stroke-linecap="round"/><path d="M26 16 A10 10 0 1 1 20 6.8" fill="none" stroke="#7fe08a" stroke-width="3.2" stroke-linecap="round"/>
    <path d="M17 2.5 L25.5 6 L19 12.5 Z" fill="#7fe08a" stroke="${O}" stroke-width="2.2" stroke-linejoin="round"/><path d="M13.5 11.5 L21 16 L13.5 20.5 Z" fill="#fff" stroke="${O}" stroke-width="2" stroke-linejoin="round"/>`),
  history: svg('0 0 32 32', `<circle cx="17" cy="16" r="11" fill="#fff" stroke="${O}" stroke-width="2.6"/><path d="M17 9.5 V16 L21.5 19" fill="none" stroke="${O}" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M2.5 13 L6 19 L10.5 13.5 Z" fill="#ffd64a" stroke="${O}" stroke-width="2" stroke-linejoin="round"/>`),
  // Beacon's tower, small (the SHOT DOWN distance bar)
  beacon: svg('0 0 40 48', `<circle cx="20" cy="7" r="9" fill="#fff3a0" opacity=".5"/><path d="M15 46 L17 21 H23 L25 46 Z" fill="#eef3fa" stroke="${O}" stroke-width="2.4" stroke-linejoin="round"/>
    <path d="M11.5 21.5 H28.5 L31 13.5 H9 Z" fill="#5fdcff" stroke="${O}" stroke-width="2.4" stroke-linejoin="round"/><path d="M8 13.5 H32 L29 9.5 H11 Z" fill="#2f5bb7" stroke="${O}" stroke-width="2.4" stroke-linejoin="round"/>
    <circle cx="20" cy="6" r="3.6" fill="#ffe24a" stroke="${O}" stroke-width="2"/>`),
  reset: svg('0 0 32 32', `<path d="M16 3 L30 27 H2 Z" fill="#ff5a4a" stroke="${O}" stroke-width="2.6" stroke-linejoin="round"/><path d="M16 11 V19" stroke="#fff" stroke-width="3.4" stroke-linecap="round"/><circle cx="16" cy="23.2" r="2" fill="#fff"/>`),
};
// round 13: SHOT DOWN: one picture of what got you (by S.deathBy), with two or three words
const heart = (fill) => `<path d="M50 88 C24 70 10 58 10 40 C10 28 19 19 31 19 C40 19 46 24 50 31 C54 24 60 19 69 19 C81 19 90 28 90 40 C90 58 76 70 50 88Z" fill="${fill}" stroke="${O}" stroke-width="4" stroke-linejoin="round"/>`;
const CAUSE = {
  gate: { words: 'SHOOT IT BLUE', pic: svg('0 0 100 100', `<defs><linearGradient id="lcRg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff6e64" stop-opacity=".92"/><stop offset="1" stop-color="#d8283a" stop-opacity=".95"/></linearGradient>
      <linearGradient id="lcRp" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8a1a1a"/><stop offset=".35" stop-color="#ff7a6a"/><stop offset="1" stop-color="#d23a3a"/></linearGradient></defs>
    <rect x="18" y="24" width="64" height="56" fill="url(#lcRg)" stroke="${O}" stroke-width="3"/>
    <circle cx="30" cy="36" r="2.4" fill="#fff" opacity=".7"/><circle cx="66" cy="62" r="1.8" fill="#fff" opacity=".6"/><circle cx="72" cy="34" r="1.5" fill="#fff" opacity=".7"/><circle cx="26" cy="68" r="1.6" fill="#fff" opacity=".5"/>
    <rect x="9" y="16" width="12" height="70" rx="3" fill="url(#lcRp)" stroke="${O}" stroke-width="3"/><rect x="79" y="16" width="12" height="70" rx="3" fill="url(#lcRp)" stroke="${O}" stroke-width="3"/>
    <path d="M13 24 V50 M83 24 V50" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".6"/>
    <text x="50" y="62" text-anchor="middle" font-family="NunitoG,sans-serif" font-weight="900" font-size="30" fill="#fff" stroke="#4a0a0a" stroke-width="7" paint-order="stroke" stroke-linejoin="round">−50</text>`) },
  crash: { words: 'SHOOT IT OPEN', pic: `<img class="lc-pod" src="${asset('r2_pod.webp')}" alt="">` + svg('0 0 100 100', `<g fill="none" stroke-linecap="round"><circle cx="50" cy="50" r="30" stroke="${O}" stroke-width="9"/><circle cx="50" cy="50" r="30" stroke="#ff3b30" stroke-width="4.5"/>
      <path d="M50 8 V30 M50 70 V92 M8 50 H30 M70 50 H92" stroke="${O}" stroke-width="9"/><path d="M50 8 V30 M50 70 V92 M8 50 H30 M70 50 H92" stroke="#ff3b30" stroke-width="4.5"/></g><circle cx="50" cy="50" r="4" fill="#ff3b30" stroke="${O}" stroke-width="2.5"/>`, 'lc-cross') },
  beam: { words: 'SWIPE DOWN SOONER', pic: svg('0 0 100 100', `<defs><clipPath id="lcHc"><rect x="0" y="62" width="100" height="40"/></clipPath><linearGradient id="lcBm" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#4fb4ff" stop-opacity="0"/><stop offset=".5" stop-color="#e8f8ff"/><stop offset="1" stop-color="#4fb4ff" stop-opacity="0"/></linearGradient></defs>
    <rect x="4" y="4" width="22" height="92" rx="11" fill="url(#lcBm)"/><rect x="12" y="4" width="6" height="92" rx="3" fill="#fff"/>
    <g transform="translate(26 8) scale(.72)">${heart('#4a2a3a')}<g clip-path="url(#lcHc)">${heart('#ff4d5e')}</g><path d="M50 88 C24 70 10 58 10 40 C10 28 19 19 31 19 C40 19 46 24 50 31 C54 24 60 19 69 19 C81 19 90 28 90 40 C90 58 76 70 50 88Z" fill="none" stroke="${O}" stroke-width="4" stroke-linejoin="round"/>
    <path d="M22 62 H78" stroke="#ff9aa4" stroke-width="3" stroke-dasharray="6 5"/></g>
    <path class="lc-drip" d="M62 76 Q66 84 62 88 Q58 84 62 76Z" fill="#ff4d5e" stroke="${O}" stroke-width="2"/>`) },
  xora: { words: 'XORA GOT YOU', pic: svg('0 0 100 100', `<defs><linearGradient id="lcTg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f3ebff"/><stop offset="1" stop-color="#9c7fc8"/></linearGradient>
      <linearGradient id="lcPg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7b3fae"/><stop offset="1" stop-color="#2a0c40"/></linearGradient></defs>
    <g stroke-linecap="round"><path d="M4 60 L44 12 M12 80 L62 22 M28 94 L80 34" stroke="#ff2e4a" stroke-width="7" opacity=".7"/><path d="M4 60 L44 12 M12 80 L62 22 M28 94 L80 34" stroke="#ffd6dc" stroke-width="2"/></g>
    ${[[52, 34, 30, 1], [64, 42, 20, 1.1], [78, 50, 10, 1]].map(([x, y, r, k]) => `<g transform="translate(${x} ${y}) rotate(${r}) scale(${k})"><path d="M-8 0 C-8 22 -14 40 -28 56 C-6 46 6 26 8 0 Z" fill="url(#lcTg)" stroke="${O}" stroke-width="3" stroke-linejoin="round"/>
      <path d="M-3.5 5 C-4 20 -8 33 -17 45" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" opacity=".9"/></g>`).join('')}
    <path d="M44 30 L50 16 L58 22 L66 6 L74 16 L85 5 L88 17 L96 14 Q100 36 94 56 L90 58 Q80 62 72 54 Q62 50 54 44 Q44 40 44 30Z" fill="url(#lcPg)" stroke="${O}" stroke-width="3.4" stroke-linejoin="round"/>
    <path d="M54 30 L60 25 L66 28" fill="none" stroke="#b98aec" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`) },
};
// round 13: the rank emblems on the supply crates (chevrons rising to a winged star)
const EMBLEM = {
  private: (cx, cy) => chev(cx, cy + 2, 1),
  sergeant: (cx, cy) => chev(cx, cy - 2, 1) + chev(cx, cy + 6, 1),
  captain: (cx, cy) => chev(cx, cy - 6, 1) + chev(cx, cy + 2, 1) + chev(cx, cy + 10, 1),
  commander: (cx, cy) => `<path d="${starPath(cx, cy - 7, 7, 3)}" fill="#ffe27a" stroke="${O}" stroke-width="1.8" stroke-linejoin="round"/>` + chev(cx, cy + 3, 0.9) + chev(cx, cy + 10, 0.9),
  elite: (cx, cy) => `<path d="M${cx - 5} ${cy + 1} Q${cx - 20} ${cy - 2} ${cx - 22} ${cy - 10} Q${cx - 13} ${cy - 5} ${cx - 5} ${cy - 5} Z M${cx + 5} ${cy + 1} Q${cx + 20} ${cy - 2} ${cx + 22} ${cy - 10} Q${cx + 13} ${cy - 5} ${cx + 5} ${cy - 5} Z" fill="#ffe27a" stroke="${O}" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="${starPath(cx, cy - 1, 10, 4.2)}" fill="#fff3a0" stroke="${O}" stroke-width="2" stroke-linejoin="round"/>`,
};
const CRATES = [
  { k: 'private', name: 'PRIVATE', col: { front: '#7c8a55', top: '#a7b77a', side: '#57633a', plank: '#57633a', metal: '#b9c6d6' } },
  { k: 'sergeant', name: 'SERGEANT', col: { front: '#3faa4a', top: '#79d96f', side: '#257a31', plank: '#257a31', metal: '#c9d5e3' } },
  { k: 'captain', name: 'CAPTAIN', col: { front: '#2f7fe0', top: '#6fb2ff', side: '#1d56a8', plank: '#1d56a8', metal: '#dce6f2' } },
  { k: 'commander', name: 'COMMANDER', col: { front: '#8c45d8', top: '#bb82ff', side: '#5f2aa0', plank: '#5f2aa0', metal: '#ffd64a' } },
  { k: 'elite', name: 'ELITE', col: { front: '#2b2233', top: '#4a3d57', side: '#15101b', plank: '#e0a21a', metal: '#ffd64a' } },
];
const crateArt = (c) => svg('0 0 80 72', crate(10, 24, 52, 42, 10, { ...c.col, emblem: EMBLEM[c.k](36, 44) }));
// the jet roster by tier (PLAN.md section 7); the Tempest slot's name is undecided
const ROSTER = [
  ['X', ['Vanta', 'Orbital Knight', 'Comet', 'Khaos']],
  ['S', ['Hive Queen', 'Halo', 'Ghost', '???']],
  ['1', ['Raptor', 'Seraph', 'Jade Dragon', 'Nightjar', 'Lantern']],
  ['2', ['Tsar Bomba Jr', 'Storm Crow', 'Guillotine', 'Mule', 'Magpie']],
  ['3', ['Alley Cat', 'Talon', 'Viper Kiss', 'Red Bear', 'Wasp Killer']],
  ['4', ['Widowmaker', 'Needle', 'Poltergeist']],
  ['5', ['Lawnmower', 'Wild Horse', 'Blitzkite', 'Cutlass']],
];

// ---------------------------------------------------------------- number formats
const fmt = (n) => (n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M' : n >= 1e4 ? Math.round(n / 1000) + 'K' : n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K' : String(n));
const fmtBank = (n) => (n >= 1e6 ? fmt(n) : n.toLocaleString('en-GB'));
const fmtMult = (m) => '×' + (Number.isInteger(m) ? m.toFixed(1) : String(r2(m)));

// ---------------------------------------------------------------- the title screen: the bank bar, the icons and the cards
const shown = { coins: bank.coins, gems: bank.gems, rubies: bank.rubies, diamonds: bank.diamonds };   // what the bank bar shows
const tweens = {};
function setPill(k, v) {
  const el = $('tbk-' + k); if (!el) return; el.querySelector('b').textContent = fmtBank(v);
  if (k !== 'coins') el.classList.toggle('zero', v <= 0);
}
function tweenPill(k, to, ms = 450) {
  const from = shown[k]; cancelAnimationFrame(tweens[k]); if (from === to) { setPill(k, to); return; }
  const t0 = performance.now();
  const step = (t) => { const e = clamp((t - t0) / ms, 0, 1), v = Math.round(from + (to - from) * (1 - Math.pow(1 - e, 3))); shown[k] = v; setPill(k, v); if (e < 1) tweens[k] = requestAnimationFrame(step); };
  tweens[k] = requestAnimationFrame(step);
}
function bumpPill(k) { const el = $('tbk-' + k); if (!el) return; el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
function affordable() { return TRACKS.some((k) => { const c = trackState(k).cost; return bank.coins >= c.coins && bank.gems >= c.gems; }); }
function refreshBadge() { const b = $('tc-ws-badge'); if (b) b.classList.toggle('on', affordable()); }
function refreshTitle() { for (const k of Object.keys(shown)) setPill(k, shown[k]); refreshBadge(); }
// flying icons (coins into the bank bar, coins into a Workshop pip): small DOM elements animated by the compositor
const flying = [];   // round 13 arena: live fly animations, cancelled when a run starts
function flyIcons(kind, n, from, to, opt = {}) {
  const fx = $('mfx'); if (!fx || !from || !to) return 0;
  const W = fx.getBoundingClientRect(), dur = opt.dur || 620, spread = opt.spread || 70; let last = 0;
  for (let i = 0; i < n; i++) {
    const el = document.createElement('i'); el.className = 'ico ' + kind + ' mfly'; fx.appendChild(el);
    const x0 = from.x - W.left + rand(-spread, spread) * (opt.sx || 1), y0 = from.y - W.top + rand(-spread, spread) * 0.5, x1 = to.x - W.left, y1 = to.y - W.top;
    const mx = (x0 + x1) / 2 + rand(-60, 60), my = Math.min(y0, y1) - rand(20, 90), delay = (opt.delay || 0) + i * (opt.gap || 55);
    const a = el.animate([
      { transform: `translate(${x0}px,${y0}px) scale(.2)`, opacity: 0 },
      { transform: `translate(${x0}px,${y0 - 14}px) scale(1.15)`, opacity: 1, offset: 0.16 },
      { transform: `translate(${mx}px,${my}px) scale(1)`, offset: 0.55 },
      { transform: `translate(${x1}px,${y1}px) scale(.55)`, opacity: 1 },
    ], { duration: dur, delay, easing: 'cubic-bezier(.45,0,.7,1)', fill: 'both' });
    a.onfinish = () => { el.remove(); const j = flying.indexOf(a); if (j >= 0) flying.splice(j, 1); if (opt.each) opt.each(i); }; flying.push(a);
    last = delay + dur;
  }
  return last;
}
const centre = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
// round 13: coming home from a run is a reward moment: coins (and any stones) fly into the bank bar and it counts up
const ICO = { coins: 'coin', gems: 'gem', rubies: 'ruby', diamonds: 'dia' };
const SND = { coins: 'coin', gems: 'gem', rubies: 'ruby', diamonds: 'diamond' };
function homeReward() {
  const gain = {}; let any = false;
  for (const k of Object.keys(shown)) { cancelAnimationFrame(tweens[k]); gain[k] = bank[k] - shown[k]; if (gain[k] > 0) any = true; else { shown[k] = bank[k]; setPill(k, bank[k]); } }
  refreshBadge(); if (!any) return;
  const wrap = $('wrap').getBoundingClientRect(), from = { x: wrap.left + wrap.width / 2, y: wrap.top + wrap.height * 0.66 };
  let wait = 380;
  for (const k of Object.keys(ICO)) {
    if (gain[k] <= 0) continue;
    const pill = $('tbk-' + k); if (!pill) continue;
    const n = k === 'coins' ? clamp(Math.round(gain[k] / 40), 6, 16) : clamp(gain[k], 1, 6), to = centre(pill.querySelector('.ico')), start = shown[k], tot = gain[k];
    const end = flyIcons(ICO[k], n, from, to, { delay: wait, gap: k === 'coins' ? 60 : 110, dur: 640, sx: 1.6, each: (i) => {
      const v = i + 1 >= n ? bank[k] : Math.round(start + tot * (i + 1) / n); shown[k] = Math.min(bank[k], Math.max(shown[k], v)); setPill(k, shown[k]); bumpPill(k); sfx(SND[k]);
      if (i + 1 >= n) { sfx('pthud'); refreshBadge(); }
    } });
    wait = end - 250;
  }
}

// ---------------------------------------------------------------- panels (a full-screen sheet that slides up)
let cur = null, closing = 0;
const TITLES = { workshop: 'WORKSHOP', depot: 'DEPOT', hangar: 'HANGAR', store: 'STORE', base: 'BASE', settings: 'SETTINGS' };
function openPanel(id) {
  if (!TITLES[id]) return;
  if (api && api.S && api.S.mode !== 'title') return;   // round 13 arena: panels only open on the title screen, never over a run
  unlock(); clearTimeout(closing);
  const m = $('meta'), body = m.querySelector('.m-body');
  m.className = 'p-' + id; m.querySelector('.m-title').textContent = TITLES[id];
  body.innerHTML = PANELS[id](); body.scrollTop = 0; cur = id;
  if (WIRE[id]) WIRE[id](body);
  void m.offsetWidth; m.classList.add('in'); sfx('whoosh'); $('start').classList.add('m-open');
}
function closePanel() {
  if (!cur) return; const m = $('meta'); cur = null; m.classList.remove('in'); m.classList.add('out'); sfx('whooshDown'); $('start').classList.remove('m-open');
  closing = setTimeout(() => { if (!cur) { m.className = 'hidden'; m.querySelector('.m-body').innerHTML = ''; } }, 280);
  refreshTitle();
}
const soon = () => `<div class="m-soon"><span>COMING SOON</span></div>`;
const PANELS = {
  workshop() {
    return `<div class="m-in"><div class="m-hero ws-hero"><div class="hg-rays"></div><img class="wh-plane" src="${asset('r2_plane.webp')}" alt=""><span class="wh-art">${ART.workshop}</span></div><div class="ws-row">${TRACKS.map((k) => `<div class="ws-card ${k}" data-k="${k}"><div class="ws-head">${WS.tracks[k].name}</div><div class="ws-lvl"><b></b></div>
      <div class="ws-ico">${ART[k]}</div><div class="ws-pips">${'<i></i>'.repeat(WS.pips)}</div><div class="ws-mult"><b></b></div><div class="ws-next"><i></i><b></b></div>
      <button class="ws-buy"><span class="wb-l"></span><span class="wb-c"></span></button><i class="ws-flash"></i></div>`).join('')}</div>
      <div class="ws-key"><span class="wk-pips">${'<i></i>'.repeat(WS.pips)}</span><span class="wk-arrow">${ART.up}</span><span class="wk-lv">LEVEL UP</span></div></div>`;
  },
  settings() {
    const tog = (k, ico, name) => `<div class="st-row"><span class="st-ico">${ART[ico]}</span><span class="st-name">${name}</span><button class="st-tog${settings[k] ? ' on' : ''}" data-k="${k}" aria-label="${name}"><i></i></button></div>`;
    const vers = []; for (let v = 13; v >= 2; v--) vers.push(`<a class="st-ver" href="../v${v}/">${v}</a>`);
    return `<div class="st-list">${tog('music', 'music', 'MUSIC')}${tog('sfx', 'sfx', 'SOUND')}${tog('vibe', 'vibe', 'VIBRATION')}
      <div class="st-row"><span class="st-ico">${ART.replay}</span><span class="st-name">TUTORIALS</span><button class="st-btn" id="st-tut">REPLAY</button></div>
      <div class="st-row st-vers"><span class="st-ico">${ART.history}</span><span class="st-name">OLD ROUNDS</span><div class="st-verlist">${vers.join('')}</div></div>
      <div class="st-row st-reset"><span class="st-ico">${ART.reset}</span><span class="st-name">RESET</span><span class="st-rz"><button class="st-btn red" id="st-reset">RESET</button></span></div></div>`;
  },
  store() {
    const cr = CRATES.map((c, i) => `<div class="sc-tile r${i}"><div class="sc-glow"></div>${crateArt(c)}<b>${c.name}</b></div>`).join('');
    const sack = svg('0 0 60 44', `<path d="M17 10 Q4 18 4 30 Q4 42 30 42 Q56 42 56 30 Q56 18 43 10 Z" fill="#8c4fd0" stroke="${O}" stroke-width="2.6" stroke-linejoin="round"/>
      <path d="M11 22 Q9 30 14 35" fill="none" stroke="#c9a2ff" stroke-width="2.6" stroke-linecap="round"/><path d="M40 16 Q50 22 50 32" fill="none" stroke="#5f2aa0" stroke-width="2.4" stroke-linecap="round"/>
      <path d="M13 10 Q30 15 47 10" fill="none" stroke="${O}" stroke-width="6" stroke-linecap="round"/><path d="M13 10 Q30 15 47 10" fill="none" stroke="#ffd64a" stroke-width="2.4" stroke-linecap="round"/>
      <path d="M30 13 Q24 22 20 26 M30 13 Q36 22 41 25" fill="none" stroke="#ffd64a" stroke-width="2.2" stroke-linecap="round"/>`);
    const pack = (k, ico, n) => `<div class="sp-tile ${k}"><div class="sp-art"><div class="sp-sack">${sack}</div><div class="sp-pile n${n}">${Array.from({ length: n }, (_, i) => `<i class="ico ${ico} p${i}"></i>`).join('')}</div></div></div>`;
    return `${soon()}<div class="m-in"><div class="m-hero st-hero"><div class="hg-rays"></div>${crateArt(CRATES[4])}${ART.store}</div><div class="m-sec">SUPPLY CRATES</div><div class="sc-row">${cr}</div>
      <div class="m-sec">STONE PACKS</div><div class="sp-row">${pack('gems', 'gem', 4)}${pack('rubies', 'ruby', 3)}${pack('diamonds', 'dia', 2)}</div></div>`;
  },
  depot() {
    const ar = `<path d="M6 11 H30 M24 5 L31 11 L24 17 M34 21 H10 M16 15 L9 21 L16 27" fill="none" stroke-linecap="round" stroke-linejoin="round"`;
    const arrow = `<span class="dp-arrow">${svg('0 0 40 32', `${ar} stroke="${O}" stroke-width="6.5"/>${ar} stroke="#ffd64a" stroke-width="2.8"/>`)}</span>`;
    const cur4 = ['coin', 'gem', 'ruby', 'dia'].map((c) => `<span class="dp-cur"><i class="ico ${c}"></i></span>`).join(arrow);
    const pu = (sym, col) => `<div class="dp-pu">${svg('0 0 80 72', crate(10, 24, 52, 40, 10, { ...col, emblem: sym }))}</div>`;
    const bolt = `<path d="M40 30 L29 46 H37 L32 58 L46 40 H38 L43 30 Z" fill="#ffe24a" stroke="${O}" stroke-width="2.2" stroke-linejoin="round"/>`;
    const shield = `<path d="M36 30 L47 34 V43 Q47 53 36 58 Q25 53 25 43 V34 Z" fill="#7fd0ff" stroke="${O}" stroke-width="2.2" stroke-linejoin="round"/><path d="M36 34 V54" stroke="#fff" stroke-width="2" opacity=".8"/>`;
    const magnet = `<path d="M27 32 V45 A9 9 0 0 0 45 45 V32 H39.5 V45 A3.5 3.5 0 0 1 32.5 45 V32 Z" fill="#ff5a4a" stroke="${O}" stroke-width="2.2" stroke-linejoin="round"/><path d="M27 32 H32.5 V36.5 H27 Z M39.5 32 H45 V36.5 H39.5 Z" fill="#e3e9f1" stroke="${O}" stroke-width="2" stroke-linejoin="round"/>`;
    const rocket = `<g transform="rotate(35 36 44)"><path d="M36 28 Q42 34 42 44 V52 H30 V44 Q30 34 36 28 Z" fill="#eef3fa" stroke="${O}" stroke-width="2.2" stroke-linejoin="round"/><path d="M30 46 L25 54 H30 Z M42 46 L47 54 H42 Z" fill="#ff5a4a" stroke="${O}" stroke-width="2" stroke-linejoin="round"/><circle cx="36" cy="39" r="3" fill="#5fdcff" stroke="${O}" stroke-width="1.6"/><path d="M32 53 Q36 62 40 53" fill="#ffb03a" stroke="${O}" stroke-width="1.8" stroke-linejoin="round"/></g>`;
    const repair = `<path d="M36 58 C26 51 22 47 22 41 C22 37 25 34 29 34 C32 34 34 36 36 38 C38 36 40 34 43 34 C47 34 50 37 50 41 C50 47 46 51 36 58Z" fill="#ff4d5e" stroke="${O}" stroke-width="2.2" stroke-linejoin="round"/><path d="M36 40 V50 M31 45 H41" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>`;
    const double = `<circle cx="34" cy="44" r="10.5" fill="#ffc21a" stroke="${O}" stroke-width="2.2"/><circle cx="34" cy="44" r="6.5" fill="#ffdb4d" stroke="#d98a00" stroke-width="1.6"/><path d="M42 36 L50 30 M50 36 L42 30" stroke="${O}" stroke-width="5" stroke-linecap="round"/><path d="M42 36 L50 30 M50 36 L42 30" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/><path d="M46 44 Q50 41 51 45 Q52 48 47 52 H53" fill="none" stroke="${O}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="M46 44 Q50 41 51 45 Q52 48 47 52 H53" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`;
    const C1 = { front: '#3a6fd0', top: '#6fa3ff', side: '#244a94', plank: '#244a94' }, C2 = { front: '#2f9a8a', top: '#62d0bd', side: '#1d6a5e', plank: '#1d6a5e' }, C3 = { front: '#d9892f', top: '#f5b866', side: '#a65c25', plank: '#9b541f' };
    return `${soon()}<div class="m-in"><div class="m-hero dp-hero"><div class="hg-rays"></div>${ART.depot}</div><div class="m-sec">TRADE</div><div class="dp-trade">${cur4}</div>
      <div class="m-sec">POWER-UPS</div><div class="dp-row">${pu(bolt, C1)}${pu(shield, C2)}${pu(magnet, C3)}</div><div class="dp-row">${pu(rocket, C3)}${pu(repair, C1)}${pu(double, C2)}</div></div>`;
  },
  hangar() {
    const lock = svg('0 0 16 18', `<path d="M4.5 8 V5.5 A3.5 3.5 0 0 1 11.5 5.5 V8" fill="none" stroke="${O}" stroke-width="4.4"/><path d="M4.5 8 V5.5 A3.5 3.5 0 0 1 11.5 5.5 V8" fill="none" stroke="#c9d3df" stroke-width="2"/><rect x="2" y="8" width="12" height="9" rx="2" fill="#ffd64a" stroke="${O}" stroke-width="1.8"/><circle cx="8" cy="12.2" r="1.5" fill="${O}"/>`, 'hg-lock');
    const tile = (name) => `<div class="hg-jet${name === 'Lawnmower' ? ' own' : ''}${name === '???' ? ' q' : ''}"><div class="hg-pic"><i class="hg-plane"></i>${name === 'Lawnmower' ? '' : lock}</div><b>${name}</b></div>`;
    const rows = ROSTER.map(([t, names]) => `<div class="hg-row t${t}"><span class="hg-tier">${t}</span><div class="hg-jets">${names.map(tile).join('')}</div></div>`).join('');
    return `${soon()}<div class="hg-hero"><div class="hg-rays"></div><img class="hg-big" src="${asset('r2_plane.webp')}" alt=""><div class="hg-plate"><b>LAWNMOWER</b><span class="hg-eq">EQUIPPED</span></div>
      <div class="hg-stat"><i class="ico drone"></i><span>×0.4</span></div></div><div class="hg-list">${rows}</div>`;
  },
  base() {
    let stars = '', s = 7;
    const sr = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let i = 0; i < 70; i++) stars += `<circle cx="${(sr() * 320).toFixed(0)}" cy="${(-150 + sr() * 400).toFixed(0)}" r="${(0.6 + sr() * 1.4).toFixed(1)}" fill="#fff"${i % 4 ? '' : ` class="tw" style="animation-delay:${(sr() * 3).toFixed(2)}s"`}/>`;
    let lights = '';
    for (let i = 0; i < 8; i++) { const k = i / 7, e = Math.pow(k, 1.5), y = 304 + e * 112, r = 1.1 + e * 3.2; lights += `<circle cx="${(175 - e * 98).toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="#ffd66a"/><circle cx="${(191 + e * 98).toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="#ffd66a"/>`; }
    let dash = ''; for (let i = 0; i < 6; i++) { const k = i / 5, y0 = 308 + Math.pow(k, 1.5) * 100; dash += `<path d="M183 ${y0.toFixed(1)} v${(3 + k * 12).toFixed(1)}" stroke="#cfd6ff" stroke-width="${(1.5 + k * 3).toFixed(1)}" opacity=".5"/>`; }
    const scene = svg('0 -160 320 580', `<defs><linearGradient id="bsSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#050a24"/><stop offset=".5" stop-color="#18215c"/><stop offset=".78" stop-color="#48307a"/><stop offset="1" stop-color="#8a456e"/></linearGradient>
        <radialGradient id="bsGlow"><stop offset="0" stop-color="#fffbe0"/><stop offset=".22" stop-color="#ffe27a" stop-opacity=".95"/><stop offset="1" stop-color="#ffd24a" stop-opacity="0"/></radialGradient>
        <linearGradient id="bsBeam" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff6c8" stop-opacity=".85"/><stop offset="1" stop-color="#fff6c8" stop-opacity="0"/></linearGradient></defs>
      <rect y="-160" width="320" height="464" fill="url(#bsSky)"/>${stars}
      <mask id="bsMoon"><rect x="0" y="-160" width="320" height="464" fill="#fff"/><circle cx="76" cy="89" r="17.5" fill="#000"/></mask><circle cx="66" cy="96" r="20" fill="#fff3c8" mask="url(#bsMoon)"/>
      <g class="bs-beam"><path d="M248 116 L420 88 L420 146 Z" fill="url(#bsBeam)"/></g>
      <path d="M0 286 Q40 262 86 276 Q132 252 184 272 Q236 256 270 272 Q298 262 320 270 V304 H0 Z" fill="#141c48"/>
      <path d="M0 302 H320 V420 H0 Z" fill="#0a1030"/>
      <path d="M176 302 H190 L292 420 H74 Z" fill="#1a2352"/>${dash}${lights}
      <path d="M8 302 V276 Q8 250 40 250 Q72 250 72 276 V302 Z M78 302 V282 Q78 262 104 262 Q130 262 130 282 V302 Z" fill="#060a20"/>
      <path d="M40 252 V262 M104 264 V272" stroke="#ffd66a" stroke-width="2" opacity=".7"/>
      <path d="M238 302 L242 160 H254 L258 302 Z" fill="#060a20"/><path d="M230 160 H266 L270 140 H226 Z" fill="#060a20"/>
      <path d="M232 143 H264 L267 157 H229 Z" fill="#ffd66a"/><path d="M237 143 V157 M244 143 V157 M252 143 V157 M259 143 V157" stroke="#060a20" stroke-width="2.4"/>
      <path d="M224 140 H272 L266 132 H230 Z" fill="#060a20"/><path d="M248 132 V118" stroke="#060a20" stroke-width="3.5"/>
      <path d="M268 302 V282 H300 V302 Z M196 302 V290 H214 V302 Z M150 302 V292 H160 V302 Z" fill="#060a20"/><path d="M272 288 H278 M286 288 H292" stroke="#ffd66a" stroke-width="3" opacity=".8"/>
      <circle cx="248" cy="116" r="34" fill="url(#bsGlow)" class="bs-glow"/><circle cx="248" cy="116" r="5" fill="#fffbe0"/>`);
    return `${soon()}<div class="bs-card">${scene.replace('<svg', '<svg preserveAspectRatio="xMidYMax slice"')}<div class="bs-name">BEACON</div></div>`;
  },
};
// wiring per panel
const WIRE = {
  workshop(body) {
    for (const card of body.querySelectorAll('.ws-card')) { drawTrack(card); card.querySelector('.ws-buy').addEventListener('click', () => onBuy(card)); }
  },
  settings(body) {
    for (const b of body.querySelectorAll('.st-tog')) b.addEventListener('click', () => {
      const k = b.dataset.k; unlock(); JCMETA.set(k, !settings[k]);
      if (k === 'vibe' && settings.vibe) try { if (navigator.vibrate) navigator.vibrate(30); } catch (e) { }
      sfx(settings[k] ? 'plus' : 'tick');
    });
    const tut = body.querySelector('#st-tut');
    tut.addEventListener('click', () => {
      store.del('grokdemo.tut'); sfx('power');
      const ok = !!(api && api.tutReset && api.tutReset());
      if (ok) { tut.textContent = 'DONE'; tut.classList.add('done'); } else { tut.textContent = '...'; setTimeout(() => location.reload(), 250); }   // a game build without TUT.reset reads the key only at load
    });
    const rz = body.querySelector('.st-rz');
    const ask = () => {
      rz.innerHTML = `<button class="st-btn" id="st-no">NO</button><button class="st-btn red" id="st-yes">YES</button>`; sfx('warn');
      rz.querySelector('#st-no').addEventListener('click', () => { rz.innerHTML = `<button class="st-btn red" id="st-reset">RESET</button>`; rz.querySelector('#st-reset').addEventListener('click', ask); });
      rz.querySelector('#st-yes').addEventListener('click', () => { JCMETA.reset(); rz.innerHTML = `<button class="st-btn done">DONE</button>`; sfx('bad'); });
    };
    rz.querySelector('#st-reset').addEventListener('click', ask);
  },
};
// ---------------------------------------------------------------- the Workshop cards
function drawTrack(card, st) {
  st = st || trackState(card.dataset.k);
  card.querySelector('.ws-lvl b').textContent = st.level;
  card.querySelectorAll('.ws-pips i').forEach((p, i) => p.classList.toggle('on', i < st.filled));
  card.classList.toggle('ms', st.milestone);
  card.querySelector('.ws-mult b').textContent = fmtMult(st.mult);
  card.querySelector('.ws-next b').textContent = fmtMult(trackState(st.k, st.p + 1).mult);
  const b = card.querySelector('.ws-buy'), c = st.cost, okC = bank.coins >= c.coins, okG = bank.gems >= c.gems;
  b.querySelector('.wb-l').textContent = st.milestone ? 'LEVEL UP' : 'UPGRADE';
  b.querySelector('.wb-c').innerHTML = (c.gems ? `<span class="${okG ? '' : 'no'}"><i class="ico gem"></i><b>${c.gems}</b></span>` : '') + `<span class="${okC ? '' : 'no'}"><i class="ico coin"></i><b>${fmt(c.coins)}</b></span>`;
  b.classList.toggle('off', !(okC && okG));
}
function drawAllTracks() { if (cur !== 'workshop') return; document.querySelectorAll('#meta .ws-card').forEach((c) => { if (!c.classList.contains('busy')) drawTrack(c); }); }
const replay = (el, cls) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };
function onBuy(card) {
  unlock();
  const k = card.dataset.k, b = card.querySelector('.ws-buy');
  if (card.classList.contains('busy')) return;
  const before = trackState(k), r = JCMETA.buy(k);
  if (!r) { replay(b, 'nope'); sfx('bad'); return; }
  card.classList.add('busy');
  const pip = card.querySelectorAll('.ws-pips i')[Math.min(before.filled, WS.pips - 1)];
  const to = before.milestone ? centre(card.querySelector('.ws-lvl')) : centre(pip);
  const end = flyIcons('coin', before.milestone ? 8 : 5, centre(b), to, { gap: 45, dur: 380, spread: 16, each: () => sfx('coin') });
  setTimeout(() => {
    card.classList.remove('busy');
    if (before.milestone) {
      replay(card, 'shkBig'); replay(card.querySelector('.ws-flash'), 'go'); replay(card.querySelector('.ws-lvl'), 'pop'); burst(card, 26);
      sfx('punch'); setTimeout(() => sfx('fanfare'), 120);
    } else { replay(card, 'shk'); replay(pip, 'thud'); sfx('pthud'); sfx('rsurge', r.after.filled / WS.pips); }
    drawTrack(card, r.after); replay(card.querySelector('.ws-mult'), before.milestone ? 'punchBig' : 'punch');
    drawAllTracks();
  }, end + 10);
  drawAllTracks();
}
// a burst of sparks from the middle of a card (the milestone celebration)
function burst(card, n) {
  const fx = $('mfx'), c = centre(card.querySelector('.ws-ico')), W = fx.getBoundingClientRect();
  for (let i = 0; i < n; i++) {
    const s = document.createElement('i'); s.className = 'mspark' + (i % 3 ? '' : ' w'); fx.appendChild(s);
    const a = i / n * TAU + rand(-0.2, 0.2), d = rand(60, 130), x = c.x - W.left, y = c.y - W.top;
    s.animate([{ transform: `translate(${x}px,${y}px) scale(1.3)`, opacity: 1 }, { transform: `translate(${(x + Math.cos(a) * d).toFixed(1)}px,${(y + Math.sin(a) * d).toFixed(1)}px) scale(.2)`, opacity: 0 }],
      { duration: rand(500, 800), easing: 'cubic-bezier(.1,.8,.3,1)', fill: 'both' }).onfinish = () => s.remove();
  }
}
// ---------------------------------------------------------------- drag to scroll inside a panel (the page blocks native touch scrolling)
function dragScroll(el) {
  let y0 = 0, s0 = 0, id = null, v = 0, lt = 0, ly = 0, raf = 0;
  el.addEventListener('pointerdown', (e) => { id = e.pointerId; y0 = ly = e.clientY; s0 = el.scrollTop; v = 0; lt = performance.now(); cancelAnimationFrame(raf); });
  window.addEventListener('pointermove', (e) => {
    if (e.pointerId !== id) return; el.scrollTop = s0 - (e.clientY - y0);
    const t = performance.now(), dt = Math.max(1, t - lt); v = 0.8 * ((ly - e.clientY) / dt) + 0.2 * v; lt = t; ly = e.clientY;
  });
  const up = (e) => {
    if (e.pointerId !== id) return; id = null; if (performance.now() - lt > 80) v = 0;
    const glide = () => { if (Math.abs(v) < 0.02) return; el.scrollTop += v * 16; v *= 0.94; raf = requestAnimationFrame(glide); };
    raf = requestAnimationFrame(glide);
  };
  window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
}

// ---------------------------------------------------------------- build the title chrome once (the markup lives in index.html)
function build() {
  document.querySelectorAll('[data-art]').forEach((el) => { el.innerHTML = ART[el.dataset.art] || ''; });
  const wsb = $('tc-ws-badge'); if (wsb) wsb.innerHTML = ART.up;
  const m = $('meta'); m.querySelector('.m-close').innerHTML = ART.close;
  // taps on the title's icons, cards, bank bar and panels never reach the game's tap to fly (its listener is on #wrap)
  const stop = (e) => { e.stopPropagation(); unlock(); };
  document.querySelectorAll('.t-ui, #meta, #upg').forEach((el) => el.addEventListener('pointerdown', stop));
  document.querySelectorAll('[data-open]').forEach((el) => el.addEventListener('click', () => { sfx('pthud'); openPanel(el.dataset.open); }));
  m.querySelector('.m-scrim').addEventListener('click', closePanel);
  m.querySelector('.m-close').addEventListener('click', closePanel);
  dragScroll(m.querySelector('.m-body'));
  // SHOT DOWN: UPGRADE goes home and opens the Workshop
  const upg = $('upg'); if (upg) upg.addEventListener('click', () => { if (api && api.goHome) api.goHome(); openPanel('workshop'); });
  // while a panel is open the keyboard belongs to it (Escape closes it; Space and Enter do not start a run)
  window.addEventListener('keydown', (e) => { if (!cur) return; e.stopPropagation(); if (e.key === 'Escape') closePanel(); }, true);
  // the cards idle on their own timers so they never move in step
  document.querySelectorAll('.t-card').forEach((c, i) => { c.style.setProperty('--gd', (-rand(0, 6)).toFixed(2) + 's'); c.style.setProperty('--gt', (5.5 + i * 1.3).toFixed(1) + 's'); c.style.setProperty('--bd', (-rand(0, 3)).toFixed(2) + 's'); });
  refreshTitle();
}
build();

const JCMETA = {
  api: null,
  init(a) { api = a; this.api = a; recalc(); if (a.applyAudio) a.applyAudio(); refreshTitle(); },   // called once at the end of boot() with the game's hooks
  onHome() { if (cur) closePanel(); homeReward(); },   // the title screen is showing again after a run
  // round 13 arena: a run is starting: stop the title's reward effects (flying coins, count-ups, their sounds) and settle the bar
  onStart() { if (cur) closePanel(); for (const a of flying.splice(0)) { try { a.cancel(); } catch (e) { } } const fx = $('mfx'); if (fx) fx.innerHTML = ''; for (const k of Object.keys(shown)) { cancelAnimationFrame(tweens[k]); shown[k] = bank[k]; setPill(k, bank[k]); } },
  open(id) { openPanel(id); },   // open a panel: 'workshop' | 'depot' | 'hangar' | 'store' | 'base' | 'settings'
  close() { closePanel(); },
  get panel() { return cur; },
  mult(kind) { return MULT[kind] || 1; },   // Workshop multipliers: 'rev' (coins per Xora), 'dmg' (damage), 'rate' (fire rate)
  bankAdd(haul) {   // add a run's haul to the bank: { coins, gems, rubies, diamonds }; the bank bar counts it up on the way home
    if (haul) { for (const k of Object.keys(bank)) bank[k] += whole(haul[k]); saveBank(); }
    return { ...bank };
  },
  bank() { return { ...bank }; },
  cause(by) { return CAUSE[by] || CAUSE.xora; },   // SHOT DOWN: { pic, words } for S.deathBy
  settings,
  set(k, v) {   // change one setting (Settings and the in-game mute button), save it and apply it to the audio
    if (!(k in settings)) return; settings[k] = !!v; store.set('jc.settings', { ...settings });
    const t = document.querySelector(`#meta .st-tog[data-k="${k}"]`); if (t) t.classList.toggle('on', settings[k]);
    if (api && api.applyAudio) api.applyAudio();
  },
  // round 13: the Workshop (the panel and the tests use these)
  WS, track: (k) => trackState(k), workshop: () => ({ ...ws }),
  buy(k) {
    if (!WS.tracks[k]) return null;
    const st = trackState(k), c = st.cost;
    if (bank.coins < c.coins || bank.gems < c.gems) return null;   // never negative
    bank.coins -= c.coins; bank.gems -= c.gems; ws[k] = st.p + 1; saveBank(); saveWs(); recalc(); refreshBadge();
    tweenPill('coins', bank.coins, 420); if (c.gems) tweenPill('gems', bank.gems, 420);
    return { before: st, after: trackState(k) };
  },
  reset() {   // Settings: reset progress (the bank and the Workshop)
    for (const k of Object.keys(bank)) { bank[k] = 0; cancelAnimationFrame(tweens[k]); shown[k] = 0; }
    for (const k of TRACKS) ws[k] = 0;
    saveBank(); saveWs(); recalc(); refreshTitle(); drawAllTracks();
  },
};
window.JCMETA = JCMETA;
