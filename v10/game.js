import * as THREE from './vendor/three.module.min.js';

// Round 10: round-6 BEACON IN SIGHT title and coin-number format, a rebuilt DRONES row (x0.4 under the label), idle stone glints/glow/sparkles.
// Round 9: medium-size Mission Complete in Lilita One, shine only for extraordinary runs (CFG.results, &shine=1),
// stone counts beside their icons, and a hazard-tape boss warning with the boss name in 3D letters.
// Grok Demo, round 8: Mission 1 "Get to Beacon" (round-7 base + smaller Xora with a perspective approach scale,
// denser hordes and a filler stream so the sky is never empty, longer bullet reach, a full-height Omega Beam that
// hits everything it touches, and front-line crawlers: only wasps and red skitterers cling).
const Q = new URLSearchParams(location.search);
const VER = new URL(import.meta.url).searchParams.get('v') || '';   // cache-bust assets per build
const BOT = Q.has('bot') || Q.has('autoplay');   // debug autoplay, off by default
const TS = Number(Q.get('ts') || 1);             // debug time scale
const $ = (id) => document.getElementById(id);
const wrap = $('wrap'), glc = $('gl'), uic = $('ui'), ctx = uic.getContext('2d');
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    r = Math.min(typeof r === 'number' ? r : 0, w / 2, h / 2);
    this.moveTo(x + r, y); this.arcTo(x + w, y, x + w, y + h, r); this.arcTo(x + w, y + h, x, y + h, r); this.arcTo(x, y + h, x, y, r); this.arcTo(x, y, x + w, y, r); this.closePath(); return this;
  };
}
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;
const easeBack = (k) => { const c = 1.9; k = clamp(k, 0, 1) - 1; return 1 + (c + 1) * k * k * k + c * k * k; };
// seeded RNG so the mission layout is the same every run
let seed = 20260928;
const srand = (a, b) => { seed = (seed * 1664525 + 1013904223) >>> 0; return a + (seed / 4294967296) * (b - a); };

// ================================================================ CONFIG (tune sizes and speeds here)
// One place for proportions, speeds, camera and feel. World units: at the plane (z = 0) one unit is
// about 26 CSS px on a 390-px-wide phone. Bug sizes live in BUG[] below but are all scaled by bugScale.
const CFG = {
  // --- sizes (world units)
  planeW: 2.8, droneW: 1.2, gateW: 2.6, bugScale: 0.66, bossW: 5.6, podScale: 1.0,   // round 8: Xora at 0.66x near the plane (the boss keeps its size)
  cocoonW: 2.3, carrierW: 2.6, omegaOrbW: 1.6, cocoonHoldZ: -10,
  // --- speeds (world units per second)
  scroll: 12,          // ground scroll (the plane flies flat out)
  objV: 5,             // gates, canisters, pickups and incoming bugs approach at this speed
  steerRange: 3.3,     // how far left/right the plane can go
  bugSpeed: 1.0,       // multiplier on every bug's approach speed
  huntSpeed: 6.5,      // how fast hunters close in on the squad once near
  huntRadius: 13,      // clinging types (wasps, red skitterers) closer than this (in z) stop scrolling and hunt the squad
  // --- round 8: perspective approach. Xora far away at the top edge are farScale x their near size and grow
  // smoothly (smoothstep) to full size by nearZ, so they read as approaching. Hit radii follow the visual scale.
  farScale: 0.55, nearZ: -7,
  clingTypes: ['wasp', 'redspider'],   // only these latch on; everything else fights at the squad's front line
  crawlScroll: 0.6,    // front-line types drift with only this fraction of the scroll, so crowds come on slower and die higher up
  // --- round 8: denser hordes (smaller Xora) and a filler stream so the sky is never empty
  hordeMul: 1.7, hordeHp: 0.8, hordeSpacing: 0.78,   // crowd counts x hordeMul, hp x hordeHp, spacing x hordeSpacing
  filler: { min: 3, max: 5, every: 0.28, lull: 2.0, hp0: 5, hpPerS: 0.32 },   // keep >= min Xora on screen; pause lull s after an Omega Beam ends
  // --- camera (gameplay tele camera)
  camPos: [0, 16, 12], camLook: [0, 0, -8], camFov: 21,
  // --- squad
  maxDrones: 50, droneDX: 0.92, droneDZ: 0.7,
  droneHug: 0.16,      // how much of a drone may tuck under the main plane's silhouette (0..1); slots hug the real art
  droneHugPad: 1,      // extra clearance (mask pixels) kept between drone and plane silhouettes
  // --- gates
  gateMax: 1000, gateGrow: 0.20,   // +20% size at MAX, linear from 0
  // --- weapons
  bulletReach: 0.88,   // bullets fade out at this fraction of the screen height (from the bottom); round 8: 0.75 -> 0.88
  tracerW: 0.85,       // round 8: tracers a little thinner (x this width)
  beamGrace: 5, beamDrain: 7, beamMinHp: 12,   // seconds free, then hp per second; the beam shuts off at beamMinHp
  omegaDmg: 900, omegaBossDmg: 1500, omegaTime: 1.3,
  rapidMul: [1, 1.5, 2],   // RAPID FIRE canister: fire-rate multiplier per level (plane and drones); separate from the bullet tiers
  // --- hunters that latch on
  ambushSpeed: 1.6, ambushArmour: 0.3,   // hunter packs dive in faster and shrug off most damage until they reach the squad
  shakeOffV: 9, grip: 0.55,        // steer faster than this (units/s) for `grip` seconds to fling clingers off
  // --- touch gestures (CSS px / ms)
  tapMs: 180, tapPx: 10, tapRadius: 72,
  swipeMinPx: 45, swipeMaxMs: 320, swipeMinV: 0.35, swipeRatio: 2.0, swipeRadius: 115,
  // --- screen shake (round 6): trauma model. Events add trauma (0..1), shake = trauma^2, trauma decays fast.
  // Offsets come from smooth noise plus a little roll, applied to the cameras with parallax: the ground layer
  // moves most, the cloud layer less, the gameplay layer (plane, squad, Xora) slightly. The HUD never shakes,
  // except during the Omega Beam, when it rumbles with the world.
  shake: {
    decay: 2.7,          // trauma lost per second (a 0.85 burst is calm again in ~0.3 s)
    ground: 34,          // max ground offset in CSS px at shake = 1
    clouds: 0.6, game: 0.3,   // layer factors relative to the ground
    roll: 0.045,         // max roll (radians) at shake = 1 (ground layer; other layers scale by their factor)
    freq: 16, rumbleFreq: 24,   // noise speed (Hz) for bursts and for the Omega rumble
    omegaRumble: 0.78,   // trauma floor held for the whole Omega Beam (earthquake)
    hud: 9,              // HUD rumble during Omega only (CSS px at shake = 1)
    add: { pickup: 0.4, medium: 0.6, gateMax: 0.4, thud: 0.9, omega: 0.85, omegaEnd: 0.95, bomb: 0.62, bossFinal: 1.0, death: 0.9, stomp: 0.8, star: 0.62 },
  },
  // --- coins per Xora killed (by type) and loot inside crates
  coins: { spider: 1, redspider: 1, wasp: 2, brute: 5, beetle: 12, spitter: 12, carrier: 6, queen: 300 },
  loot: { coins: [18, 26], gems: [1, 2], gemCoins: 10, diamondCoins: 25,
    ruby: { crate: 0.04, elite: 0.15, carrier: 0.3 } },   // round 7: RUBIES, a rare stone (rarer than gems): chance per crate, elite kill (beetle, spitter), carrier kill
  // --- Mission Complete payout (round 7): stage coins (kills + crate loot), then every drone left cashes in
  // droneCoinBase x the plane's droneCoinMult, then the whole total is multiplied by the star bonus.
  plane: 'lawnmower',
  planes: { lawnmower: { name: 'Lawnmower', droneCoinMult: 0.4 } },   // per-plane drone value multiplier (Lawnmower = base plane)
  droneCoinBase: 10,                       // coins per drone before the plane multiplier (45 drones x 10 x 0.4 = 180)
  starBonus: { 1: 1.0, 2: 1.25, 3: 1.5 },   // coin multiplier by stars earned
  // --- round 9: results look. The shine (coin halo, holy rays behind rare stones, glows) is only for extraordinary runs:
  // final >= typicalFinal x coinX, or a coin boost (artifact/booster, S.coinBoost) >= boost, or an exceptional stone haul. Debug: &shine=1 forces it, &shine=0 forbids it.
  results: { shineOnlyIfExtraordinary: true, typicalFinal: 1900, coinX: 2.5, boost: 2, stones: { gem: 12, ruby: 3, diamond: 3 } },
};
// Orb tiers (future design ladder). Only OMEGA is active for now: every player has the Omega Beam.
const ORB_TIERS = {
  delta: { name: 'DELTA', active: false, col: [0.4, 0.9, 0.6] },
  beta: { name: 'BETA', active: false, col: [0.4, 0.7, 1] },
  gamma: { name: 'GAMMA', active: false, col: [1, 0.7, 0.3] },
  alpha: { name: 'ALPHA', active: false, col: [1, 0.35, 0.35] },
  omega: { name: 'OMEGA', active: true, col: [0.78, 0.55, 1], core: [1, 0.95, 1] },
};
const ORB_TIER = Object.keys(ORB_TIERS).find((k) => ORB_TIERS[k].active);
const XMAX = CFG.steerRange;
const SPEED = CFG.scroll;
const OBJ_V = CFG.objV;
const G = 36;                // ground depth below play level
const TILE = 170;            // world units per terrain tile
const MAXD = CFG.maxDrones;  // drone cap (everywhere, including gate gains)
const GATE_MAX = CFG.gateMax;
const PLANE_W = CFG.planeW, WING_W = CFG.droneW;   // round-2 plane and drones
const GW_PX = 512, GH_PX = 300;               // round-2 glass gate, flattened
const GATE_W = CFG.gateW, GATE_H = GATE_W * GH_PX / GW_PX;   // three would fit side by side, but a row never has more than one
const GAP_Z = 6.5;           // bugs never sit closer than this behind a gate (about 1.5 gate-heights of clear sky on screen)
const SPAWN_D0 = 50;         // nominal spawn distance used by the level script (just beyond the top edge on a phone)
let RANGE_Z = -20;           // bullets fade out here (~3/4 up the screen), computed in resize()
let TOP_Z = -44;             // world z of the top edge of the screen (for anything up to 1 unit high), computed in resize()
let SPAWN_D = 50;            // everything spawns beyond the top edge and flies in
let HW0 = 3.8, HW40 = 9;     // visible half-width at z = 0 and z = -40
let BOT_Z = 3.2;             // world z of the bottom edge of the screen (computed in resize)

// ---------------------------------------------------------------- renderer
const renderer = new THREE.WebGLRenderer({ canvas: glc, antialias: true, powerPreference: 'high-performance' });
renderer.setClearColor(0xb8d3e8);
renderer.autoClear = false;
const world = new THREE.Scene();   // far ground and smoke columns (wide camera)
const cloudScene = new THREE.Scene();   // far clouds: same wide view, its own camera so it can shake less than the ground
const scene = new THREE.Scene();   // gameplay (steep tele camera)
const HAZE = new THREE.Color(0xbcd6ea);
world.fog = new THREE.Fog(HAZE, 90, 460); cloudScene.fog = world.fog;
const wcam = new THREE.PerspectiveCamera(70, 0.5, 0.5, 1200);
const ccam = new THREE.PerspectiveCamera(70, 0.5, 0.5, 1200);
const camera = new THREE.PerspectiveCamera(38, 0.5, 1, 400);
const GCAM_POS = new THREE.Vector3(...CFG.camPos);
const GCAM_LOOK = new THREE.Vector3(...CFG.camLook);
const GFOV = CFG.camFov;
const CAM_POS = new THREE.Vector3(0, 7.0, 8.2);
const CAM_LOOK = new THREE.Vector3(0, 0, -6);
const FOVV = 33;
let W = 1, H = 1, DPR = 1, pxScale = 1;

// ---------------------------------------------------------------- textures
const loader = new THREE.TextureLoader();
const TEX = {};
function loadTex(name, file) {
  return new Promise((res) => {
    loader.load(file, (t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; TEX[name] = t; res(t); }, undefined, () => { console.warn('missing', file); res(null); });
  });
}
function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.canvas = c;
  return t;
}
function radial(g, w, h, stops) {
  const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  stops.forEach(([o, c]) => gr.addColorStop(o, c)); g.fillStyle = gr; g.fillRect(0, 0, w, h);
}
const T_GLOW = canvasTex(64, 64, (g, w, h) => radial(g, w, h, [[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,.8)'], [0.6, 'rgba(255,255,255,.18)'], [1, 'rgba(255,255,255,0)']]), false);
const T_PUFF = canvasTex(64, 64, (g, w, h) => radial(g, w, h, [[0, 'rgba(255,255,255,1)'], [0.5, 'rgba(255,255,255,.7)'], [1, 'rgba(255,255,255,0)']]), false);
const T_TRACER = canvasTex(32, 128, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.beginPath(); g.ellipse(w / 2, h / 2, w / 2 - 2, h / 2 - 1, 0, 0, TAU); g.fill();
}, false);
const T_RING = canvasTex(128, 128, (g, w, h) => radial(g, w, h, [[0, 'rgba(255,255,255,0)'], [0.72, 'rgba(255,255,255,0)'], [0.86, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0)']]), false);
const T_ROCKET = canvasTex(48, 144, (g, w, h) => {
  const c = w / 2;
  g.fillStyle = '#d8dde2'; g.beginPath(); g.moveTo(c, 6); g.quadraticCurveTo(c + 10, 22, c + 9, 44); g.lineTo(c + 9, 116); g.lineTo(c - 9, 116); g.lineTo(c - 9, 44); g.quadraticCurveTo(c - 10, 22, c, 6); g.fill();
  g.strokeStyle = '#2a1414'; g.lineWidth = 3; g.stroke();
  g.fillStyle = '#e8321e'; g.beginPath(); g.moveTo(c, 6); g.quadraticCurveTo(c + 9, 18, c + 9, 40); g.lineTo(c - 9, 40); g.quadraticCurveTo(c - 9, 18, c, 6); g.fill();
  g.fillStyle = '#e8321e'; g.fillRect(c - 9, 78, 18, 10);
  g.fillStyle = '#8a1c14'; g.beginPath(); g.moveTo(c - 9, 92); g.lineTo(c - 21, 128); g.lineTo(c - 9, 116); g.moveTo(c + 9, 92); g.lineTo(c + 21, 128); g.lineTo(c + 9, 116); g.fill();
  g.fillStyle = '#ffd36a'; g.beginPath(); g.ellipse(c, 128, 7, 14, 0, 0, TAU); g.fill();
});
const T_SHELL = canvasTex(64, 96, (g, w, h) => {
  const c = w / 2;
  g.fillStyle = '#3b4148'; g.strokeStyle = '#111'; g.lineWidth = 4;
  g.beginPath(); g.moveTo(c, 6); g.quadraticCurveTo(c + 20, 18, c + 18, 50); g.lineTo(c + 18, 80); g.lineTo(c - 18, 80); g.lineTo(c - 18, 50); g.quadraticCurveTo(c - 20, 18, c, 6); g.fill(); g.stroke();
  g.fillStyle = '#f2b829'; g.fillRect(c - 18, 56, 36, 8);
  g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(c - 12, 20, 5, 50);
});
const T_PLANK = canvasTex(16, 64, (g, w, h) => {
  g.fillStyle = '#fff'; g.fillRect(2, 0, w - 4, h); g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(2, 0, 3, h); g.fillRect(2, h - 8, w - 4, 8);
});
const T_SHARD = canvasTex(64, 64, (g, w, h) => {
  g.fillStyle = 'rgba(255,255,255,.9)'; g.beginPath(); g.moveTo(32, 2); g.lineTo(60, 58); g.lineTo(10, 46); g.closePath(); g.fill();
  g.fillStyle = 'rgba(255,255,255,1)'; g.beginPath(); g.moveTo(32, 8); g.lineTo(38, 40); g.lineTo(22, 36); g.closePath(); g.fill();
}, false);
const T_STRIP = canvasTex(64, 256, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.15, 'rgba(255,255,255,.9)'); gr.addColorStop(0.5, 'rgba(255,255,255,.35)'); gr.addColorStop(0.85, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 32) { g.fillStyle = 'rgba(255,255,255,.5)'; g.beginPath(); g.moveTo(8, y + 24); g.lineTo(w / 2, y + 6); g.lineTo(w - 8, y + 24); g.lineTo(w - 8, y + 30); g.lineTo(w / 2, y + 12); g.lineTo(8, y + 30); g.fill(); }
}, false);
const T_BEAM = canvasTex(64, 16, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.3, 'rgba(255,255,255,.5)'); gr.addColorStop(0.5, 'rgba(255,255,255,1)'); gr.addColorStop(0.7, 'rgba(255,255,255,.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
}, false);

// Omega orb pickup: a glowing purple-white cosmic orb (drawn additively)
function makeOmegaOrbTex() {
  return canvasTex(256, 256, (g, w, h) => {
    const c = w / 2;
    radial(g, w, h, [[0, 'rgba(255,255,255,1)'], [0.16, 'rgba(250,235,255,1)'], [0.34, 'rgba(190,120,255,.95)'], [0.55, 'rgba(110,50,230,.55)'], [0.78, 'rgba(70,20,160,.18)'], [1, 'rgba(40,0,90,0)']]);
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {   // swirling nebula arms
      g.strokeStyle = `rgba(${i === 1 ? '140,200,255' : '230,180,255'},.55)`; g.lineWidth = 7 - i * 2; g.beginPath();
      for (let k = 0; k <= 40; k++) { const t = k / 40, a = i * TAU / 3 + t * 4.2, r = 14 + t * 70; g.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r); }
      g.stroke();
    }
    for (let i = 0; i < 40; i++) { const a = Math.random() * TAU, r = Math.random() * 90, s = Math.random() * 2.2 + 0.6; g.fillStyle = 'rgba(255,255,255,.9)'; g.beginPath(); g.arc(c + Math.cos(a) * r, c + Math.sin(a) * r, s, 0, TAU); g.fill(); }
    g.fillStyle = '#fff'; for (const [a, l] of [[0, 110], [Math.PI / 2, 80]]) { g.save(); g.translate(c, c); g.rotate(a); g.beginPath(); g.moveTo(-l, 0); g.lineTo(0, -5); g.lineTo(l, 0); g.lineTo(0, 5); g.fill(); g.restore(); }
  });
}
function makeSky() {
  const v = new THREE.Vector3(0, -G, -4000).project(wcam);
  const hy = clamp((1 - (v.y * 0.5 + 0.5)), 0.02, 0.9);
  return canvasTex(4, 512, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#4f93dc'); gr.addColorStop(Math.max(0.001, hy * 0.55), '#79b3e6');
    gr.addColorStop(Math.max(0.002, hy - 0.004), '#c2dcef'); gr.addColorStop(Math.min(0.999, hy + 0.01), '#bcd6ea'); gr.addColorStop(1, '#bcd6ea');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
}

// ---------------------------------------------------------------- batches
class FlatBatch {
  constructor(tex, max, blending, order, opacity = 1) {
    const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending, depthWrite: false, depthTest: false, fog: false, opacity });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = order; this.n = 0; this.max = max;
    this.a = this.mesh.instanceMatrix.array; this.c = this.mesh.instanceColor.array;
    scene.add(this.mesh);
  }
  begin() { this.n = 0; }
  add(x, y, z, sx, sz, rot, r, g, b) {
    if (this.n >= this.max) return; const i = this.n++, o = i * 16, a = this.a;
    const c = Math.cos(rot), s = Math.sin(rot);
    a[o] = c * sx; a[o + 1] = 0; a[o + 2] = -s * sx; a[o + 3] = 0; a[o + 4] = 0; a[o + 5] = 1; a[o + 6] = 0; a[o + 7] = 0;
    a[o + 8] = s * sz; a[o + 9] = 0; a[o + 10] = c * sz; a[o + 11] = 0; a[o + 12] = x; a[o + 13] = y; a[o + 14] = z; a[o + 15] = 1;
    const k = i * 3; this.c[k] = r; this.c[k + 1] = g; this.c[k + 2] = b;
  }
  end() { this.mesh.count = this.n; this.mesh.instanceMatrix.needsUpdate = true; this.mesh.instanceColor.needsUpdate = true; }
}

class Particles {
  constructor(max, blending, tex, order, sc = scene) {
    this.max = max; this.list = []; this.imm = [];
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 4); this.siz = new Float32Array(max);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('pcolor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('psize', new THREE.BufferAttribute(this.siz, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = geo;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: tex }, uScale: { value: 500 } },
      vertexShader: 'attribute vec4 pcolor; attribute float psize; varying vec4 vC; uniform float uScale; void main(){ vC=pcolor; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=min(psize*uScale/-mv.z, 480.0); gl_Position=projectionMatrix*mv; }',
      fragmentShader: 'uniform sampler2D map; varying vec4 vC; void main(){ vec4 t=texture2D(map, gl_PointCoord); gl_FragColor=vec4(vC.rgb*t.rgb, vC.a*t.a); }',
      transparent: true, depthWrite: false, depthTest: false, blending,
    });
    this.pts = new THREE.Points(geo, this.mat); this.pts.frustumCulled = false; this.pts.renderOrder = order; sc.add(this.pts);
  }
  spawn(o) { if (this.list.length < this.max) { o.t = 0; this.list.push(o); } }
  draw(x, y, z, s, r, g, b, a) { this.imm.push(x, y, z, s, r, g, b, a); }
  update(dt, worldV) {
    let n = 0; const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i]; p.t += dt;
      if (p.t >= p.life) { L[i] = L[L.length - 1]; L.pop(); continue; }
      const dr = Math.pow(p.drag || 1, dt * 60);
      p.vx *= dr; p.vy *= dr; p.vz *= dr; p.vy -= (p.grav || 0) * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += (p.vz + (p.world ? worldV : 0)) * dt;
    }
    for (const p of L) {
      if (n >= this.max) break; const k = p.t / p.life;
      this.pos[n * 3] = p.x; this.pos[n * 3 + 1] = p.y; this.pos[n * 3 + 2] = p.z;
      this.siz[n] = lerp(p.s0, p.s1, k);
      const fade = p.fadeIn ? Math.min(1, k * 5) * (1 - k) : (1 - k * k);
      this.col[n * 4] = p.r; this.col[n * 4 + 1] = p.g; this.col[n * 4 + 2] = p.b; this.col[n * 4 + 3] = p.a * fade; n++;
    }
    const I = this.imm;
    for (let i = 0; i < I.length && n < this.max; i += 8) {
      this.pos[n * 3] = I[i]; this.pos[n * 3 + 1] = I[i + 1]; this.pos[n * 3 + 2] = I[i + 2]; this.siz[n] = I[i + 3];
      this.col[n * 4] = I[i + 4]; this.col[n * 4 + 1] = I[i + 5]; this.col[n * 4 + 2] = I[i + 6]; this.col[n * 4 + 3] = I[i + 7]; n++;
    }
    this.imm.length = 0;
    this.geo.setDrawRange(0, n);
    for (const k of ['position', 'pcolor', 'psize']) this.geo.attributes[k].needsUpdate = true;
  }
}

// ---------------------------------------------------------------- world objects
let ground, groundTex, tracers, bulletsB, fx, smokeFx, planeSprite, rocketsB, shellsB, ringFx, worldFx, planksB, shardsB, flats, beams, beamsN;
const clouds = [], smokes = [];
function sprite(tex, w, cx = 0.5, cy = 0.5, order = 0, sc = scene) {
  const m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const s = new THREE.Sprite(m); const img = tex.image;
  s.scale.set(w, w * (img.height / img.width), 1); s.center.set(cx, cy); s.renderOrder = order; s.userData.w = w;
  sc.add(s); return s;
}
function setupWorld() {
  groundTex = TEX.terrain;
  groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping;
  groundTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const GW = 1600, GD = 1600;
  ground = new THREE.Mesh(new THREE.PlaneGeometry(GW, GD), new THREE.MeshBasicMaterial({ map: groundTex }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, -G, -GD / 2 + 60);
  groundTex.repeat.set(GW / TILE, GD / TILE);
  const fr = (GW / TILE * 0.5) % 1; groundTex.offset.x = 0.47 - fr;
  world.add(ground);
  worldFx = new Particles(40, THREE.AdditiveBlending, T_GLOW, 6, world);
  flats = new FlatBatch(T_STRIP, 8, THREE.AdditiveBlending, 1);
  bulletsB = new FlatBatch(T_TRACER, 1400, THREE.NormalBlending, 4.9);   // tier colour body (reads on a bright sky)
  tracers = new FlatBatch(T_TRACER, 1600, THREE.AdditiveBlending, 5);    // hot cores, stingers, shells
  beamsN = new FlatBatch(T_BEAM, 4, THREE.NormalBlending, 4.9);
  beams = new FlatBatch(T_BEAM, 8, THREE.AdditiveBlending, 5);
  rocketsB = new FlatBatch(T_ROCKET, 80, THREE.NormalBlending, 4);
  shellsB = new FlatBatch(T_SHELL, 40, THREE.NormalBlending, 4);
  planksB = new FlatBatch(T_PLANK, 260, THREE.NormalBlending, 4);
  shardsB = new FlatBatch(T_SHARD, 200, THREE.AdditiveBlending, 5);
  smokeFx = new Particles(1400, THREE.NormalBlending, T_PUFF, 3);
  fx = new Particles(1800, THREE.AdditiveBlending, T_GLOW, 6);
  ringFx = new FlatBatch(T_RING, 40, THREE.AdditiveBlending, 5);
  planeSprite = sprite(TEX.plane, PLANE_W, 0.5, 0.5, 3);
  for (let i = 0; i < 9; i++) spawnCloud(rand(-420, 10));
  for (let i = 0; i < 5; i++) spawnSmoke(rand(-420, -40));
}
function spawnCloud(z) {
  const big = Math.random() < 0.4;
  const side = Math.random() < 0.5 ? -1 : 1;
  const tex = TEX['cloud' + (1 + Math.floor(Math.random() * 3))];
  let c;
  if (big) {
    c = sprite(tex, rand(18, 26), 0.5, 0.5, 0.5); // below every flyer
    c.position.set(side * rand(9.5, 13), rand(-2, 2), z);
    c.material.opacity = 0.93;
  } else {
    c = sprite(tex, rand(14, 30), 0.5, 0.5, -2, cloudScene);
    c.position.set(side * rand(9, 24), rand(-G * 0.75, -5), z);
  }
  if (Math.random() < 0.5) c.scale.x *= -1;
  clouds.push(c);
}
function spawnSmoke(z) {
  const s = sprite(TEX.smoke, rand(5, 8), 0.5, 0.02, -3, world);
  s.scale.y *= rand(0.9, 1.3);
  s.position.set((Math.random() < 0.5 ? -1 : 1) * rand(4, 60), -G, z);
  s.userData.ph = rand(0, 10); smokes.push(s);
}

// ---------------------------------------------------------------- gate art (round-2 glass gates, flattened)
// Bupé's propeller gate banners (art/gate_*.webp.b64) stay in the repo for a later stage; they are not loaded here.
const FONT = 'NunitoG, "Arial Rounded MT Bold", system-ui, sans-serif';
const GATE_STYLE = {
  blue: { glow: 'rgba(150,225,255,', a: '90,175,255', b: '30,110,235', post: ['#2f7de0', '#5fb4ff', '#1d56b0'], stroke: '#0b2a5a' },
  red: { glow: 'rgba(255,170,160,', a: '255,110,100', b: '220,40,50', post: ['#d23a3a', '#ff7a6a', '#8a1a1a'], stroke: '#4a0a0a' },
  gold: { glow: 'rgba(255,232,150,', a: '255,215,80', b: '235,150,20', post: ['#d99a10', '#ffe27a', '#8a5a00'], stroke: '#5a3300' },
};
const GATE_BG = {};
function gateBg(kind) {
  if (GATE_BG[kind]) return GATE_BG[kind];
  const w = GW_PX, h = GH_PX;
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); const C = GATE_STYLE[kind];
  g.save(); g.shadowColor = C.glow + '1)'; g.shadowBlur = kind === 'gold' ? 26 : 16; g.strokeStyle = C.glow + '.95)'; g.lineWidth = kind === 'gold' ? 9 : 6;
  g.beginPath(); g.roundRect(10, 10, w - 20, h - 24, 8); g.stroke(); g.restore();
  const gx = 44, gy = 28, gw = w - 88, gh = h - 62;
  const gr = g.createLinearGradient(0, gy, 0, gy + gh);
  gr.addColorStop(0, `rgba(${C.a},.84)`); gr.addColorStop(0.5, `rgba(${C.a},.66)`); gr.addColorStop(1, `rgba(${C.b},.88)`);
  g.fillStyle = gr; g.fillRect(gx, gy, gw, gh);
  const hl = g.createRadialGradient(w * 0.35, gy + gh * 0.3, 10, w * 0.35, gy + gh * 0.3, gw * 0.7);
  hl.addColorStop(0, 'rgba(255,255,255,.35)'); hl.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = hl; g.fillRect(gx, gy, gw, gh);
  for (let i = 0; i < 50; i++) {
    const x = gx + Math.random() * gw, y = gy + Math.random() * gh, r = Math.random() * 3 + 0.8;
    g.fillStyle = `rgba(255,255,255,${0.3 + Math.random() * 0.6})`; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  }
  for (const px of [gx - 18, gx + gw - 8]) {
    const pg = g.createLinearGradient(px, 0, px + 26, 0); pg.addColorStop(0, C.post[2]); pg.addColorStop(0.35, C.post[1]); pg.addColorStop(1, C.post[0]);
    g.fillStyle = pg; g.beginPath(); g.roundRect(px, gy - 12, 26, gh + 20, 6); g.fill();
    g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(px + 8, gy + 14, 4, gh * 0.45);
  }
  g.fillStyle = 'rgba(20,30,50,.85)'; g.fillRect(gx - 20, gy + gh + 4, gw + 40, 9);
  GATE_BG[kind] = c; return c;
}
function drawGate(g, label, kind) {
  g.clearRect(0, 0, GW_PX, GH_PX); g.drawImage(gateBg(kind), 0, 0);
  const gy = 28, gh = GH_PX - 62, n = label.length;
  g.font = `900 ${n <= 2 ? 158 : n === 3 ? 138 : n === 4 ? 112 : 94}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineJoin = 'round'; g.lineWidth = 20; g.strokeStyle = GATE_STYLE[kind].stroke; g.strokeText(label, GW_PX / 2, gy + gh * 0.54);
  g.fillStyle = kind === 'gold' ? '#fff6c8' : '#fff'; g.fillText(label, GW_PX / 2, gy + gh * 0.54);
}
function gateLabel(gt) { return gt.val >= GATE_MAX ? 'MAX' : gt.val > 0 ? '+' + gt.val : gt.val === 0 ? '0' : '\u2212' + Math.abs(gt.val); }
function gateKind(gt) { return gt.val >= GATE_MAX ? 'gold' : gt.val >= 0 ? 'blue' : 'red'; }

// ---------------------------------------------------------------- pickup badges (round-2 speech-bubble badge, drawn big and crisp)
function laserIcon() {
  const c = document.createElement('canvas'); c.width = 300; c.height = 248; const g = c.getContext('2d'); g.scale(2, 2);
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.save(); g.translate(75, 62); g.rotate(-0.55);
  g.fillStyle = 'rgba(90,190,255,.45)'; g.beginPath(); g.roundRect(-72, -20, 144, 40, 20); g.fill();
  g.fillStyle = '#4fb4ff'; g.beginPath(); g.roundRect(-66, -10, 132, 20, 10); g.fill();
  g.fillStyle = '#ffffff'; g.beginPath(); g.roundRect(-62, -4, 124, 8, 4); g.fill();
  g.fillStyle = '#3a4250'; g.strokeStyle = '#11161d'; g.lineWidth = 4; g.beginPath(); g.roundRect(-76, -22, 36, 44, 8); g.fill(); g.stroke();
  g.fillStyle = '#9fe0ff'; g.beginPath(); g.arc(-40, 0, 7, 0, TAU); g.fill(); g.restore();
  return c;
}
// RAPID FIRE icon: a fat lightning bolt over three stacked bullets
function rapidIcon() {
  const c = document.createElement('canvas'); c.width = 300; c.height = 248; const g = c.getContext('2d'); g.scale(2, 2);
  g.lineJoin = 'round'; g.lineCap = 'round';
  for (let i = 0; i < 3; i++) {   // triple bullets, fanned
    g.save(); g.translate(40 + i * 35, 70 - (i === 1 ? 10 : 0)); g.rotate((i - 1) * 0.16);
    g.fillStyle = '#ffcf3a'; g.strokeStyle = '#4a2a00'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(0, -44); g.quadraticCurveTo(13, -30, 12, -8); g.lineTo(12, 34); g.lineTo(-12, 34); g.lineTo(-12, -8); g.quadraticCurveTo(-13, -30, 0, -44); g.fill(); g.stroke();
    g.fillStyle = '#c9861a'; g.fillRect(-12, 20, 24, 14); g.strokeRect(-12, 20, 24, 14);
    g.fillStyle = 'rgba(255,255,255,.7)'; g.fillRect(-6, -24, 4, 36); g.restore();
  }
  g.save(); g.translate(92, 64); g.rotate(0.12);   // lightning bolt
  g.beginPath(); g.moveTo(10, -58); g.lineTo(-30, 8); g.lineTo(-4, 8); g.lineTo(-16, 58); g.lineTo(32, -12); g.lineTo(6, -12); g.lineTo(22, -58); g.closePath();
  g.fillStyle = '#fff36a'; g.strokeStyle = '#2a1a00'; g.lineWidth = 6; g.stroke(); g.fill();
  g.fillStyle = 'rgba(255,255,255,.85)'; g.beginPath(); g.moveTo(8, -48); g.lineTo(-18, 2); g.lineTo(-8, 2); g.lineTo(14, -48); g.fill(); g.restore();
  return c;
}
// loot icons (crates show what's inside): a coin, a coin pile, a gem, a diamond
function coinIcon(size = 64) {
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'), r = size / 2 - 3;
  const gr = g.createRadialGradient(size * 0.38, size * 0.34, 2, size / 2, size / 2, r); gr.addColorStop(0, '#fff6c0'); gr.addColorStop(0.45, '#ffd23a'); gr.addColorStop(1, '#d88a00');
  g.fillStyle = gr; g.strokeStyle = '#6a3a00'; g.lineWidth = size * 0.07; g.beginPath(); g.arc(size / 2, size / 2, r, 0, TAU); g.fill(); g.stroke();
  g.strokeStyle = 'rgba(160,90,0,.7)'; g.lineWidth = size * 0.05; g.beginPath(); g.arc(size / 2, size / 2, r * 0.68, 0, TAU); g.stroke();
  g.fillStyle = '#9a5a00'; g.font = `900 ${size * 0.5}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('C', size / 2, size / 2 + size * 0.03);
  return c;
}
function pileIcon() {
  const c = document.createElement('canvas'); c.width = 300; c.height = 240; const g = c.getContext('2d'), co = coinIcon(96);
  const spots = [[40, 150], [100, 160], [160, 158], [220, 150], [70, 110], [130, 116], [190, 110], [100, 70], [160, 72], [130, 30]];
  for (const [x, y] of spots) { g.save(); g.translate(x + 18, y + 18); g.scale(1, 0.62); g.drawImage(co, -48, -48); g.restore(); }
  return c;
}
function gemIcon(col = ['#7dffb0', '#18c46a', '#06703a']) {
  const c = document.createElement('canvas'); c.width = 200; c.height = 200; const g = c.getContext('2d');
  g.lineJoin = 'round'; g.strokeStyle = '#063a1e'; g.lineWidth = 8;
  const P = [[100, 18], [168, 70], [140, 176], [60, 176], [32, 70]];
  g.fillStyle = col[1]; g.beginPath(); P.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = col[0]; g.beginPath(); g.moveTo(100, 18); g.lineTo(130, 72); g.lineTo(70, 72); g.closePath(); g.fill();
  g.fillStyle = col[2]; g.beginPath(); g.moveTo(70, 72); g.lineTo(130, 72); g.lineTo(140, 176); g.lineTo(60, 176); g.closePath(); g.globalAlpha = 0.55; g.fill(); g.globalAlpha = 1;
  g.fillStyle = 'rgba(255,255,255,.8)'; g.beginPath(); g.moveTo(92, 34); g.lineTo(108, 34); g.lineTo(84, 70); g.lineTo(62, 70); g.closePath(); g.fill();
  return c;
}
function diamondIcon() {
  const c = document.createElement('canvas'); c.width = 220; c.height = 200; const g = c.getContext('2d');
  g.lineJoin = 'round'; g.strokeStyle = '#0a3a5a'; g.lineWidth = 7;
  const top = [[50, 40], [170, 40], [206, 80], [14, 80]];
  const body = g.createLinearGradient(0, 40, 0, 190); body.addColorStop(0, '#f4feff'); body.addColorStop(0.5, '#9fe8ff'); body.addColorStop(1, '#3aa8e8');
  g.fillStyle = body; g.beginPath(); g.moveTo(50, 40); g.lineTo(170, 40); g.lineTo(206, 80); g.lineTo(110, 190); g.lineTo(14, 80); g.closePath(); g.fill(); g.stroke();
  g.strokeStyle = 'rgba(10,60,100,.55)'; g.lineWidth = 3; g.beginPath(); g.moveTo(14, 80); g.lineTo(206, 80);
  for (const x of [80, 140]) { g.moveTo(x, 40); g.lineTo(x < 110 ? 60 : 160, 80); g.lineTo(110, 190); }
  g.moveTo(110, 40); g.lineTo(80, 80); g.moveTo(110, 40); g.lineTo(140, 80); g.stroke();
  g.fillStyle = 'rgba(255,255,255,.9)'; g.beginPath(); g.moveTo(58, 48); g.lineTo(84, 48); g.lineTo(64, 76); g.lineTo(34, 76); g.closePath(); g.fill();
  return c;
}
// round 7: the ruby, a red cushion-cut stone (clearly not the green pentagon gem)
function rubyIcon() {
  const c = document.createElement('canvas'); c.width = 200; c.height = 200; const g = c.getContext('2d');
  g.lineJoin = 'round'; g.strokeStyle = '#4a0010'; g.lineWidth = 8;
  const O = [], I = [];
  for (let i = 0; i < 8; i++) { const a = -Math.PI / 2 + Math.PI / 8 + i * TAU / 8; O.push([100 + Math.cos(a) * 84, 104 + Math.sin(a) * 80]); I.push([100 + Math.cos(a) * 44, 100 + Math.sin(a) * 40]); }
  const body = g.createRadialGradient(80, 70, 6, 100, 104, 92); body.addColorStop(0, '#ffb3c0'); body.addColorStop(0.45, '#ff2d55'); body.addColorStop(1, '#8a0020');
  g.fillStyle = body; g.beginPath(); O.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill(); g.stroke();
  g.lineWidth = 3; g.strokeStyle = 'rgba(90,0,20,.55)'; g.beginPath();
  for (let i = 0; i < 8; i++) { g.moveTo(O[i][0], O[i][1]); g.lineTo(I[i][0], I[i][1]); }
  I.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.stroke();
  g.fillStyle = 'rgba(255,120,150,.55)'; g.beginPath(); I.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill();
  g.fillStyle = 'rgba(255,255,255,.85)'; g.beginPath(); g.moveTo(60, 50); g.lineTo(92, 36); g.lineTo(84, 62); g.lineTo(58, 76); g.closePath(); g.fill();
  g.beginPath(); g.arc(128, 72, 6, 0, TAU); g.fill();
  return c;
}
const LOOT_IMG = {};
const ICON_IMG = {};
const BADGES = {};
function makeBadge(name, tint) {
  const c = document.createElement('canvas'); c.width = 440; c.height = 480; const g = c.getContext('2d'); g.scale(2, 2);
  g.save(); g.shadowColor = tint[0]; g.shadowBlur = 22;
  g.beginPath(); g.roundRect(22, 18, 176, 150, 20); g.moveTo(90, 168); g.lineTo(110, 200); g.lineTo(130, 168);
  const gr = g.createLinearGradient(0, 18, 0, 200); gr.addColorStop(0, tint[1]); gr.addColorStop(1, tint[2]);
  g.fillStyle = gr; g.fill(); g.restore();
  g.lineWidth = 6; g.strokeStyle = tint[3]; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(42, 18); g.lineTo(178, 18); g.arcTo(198, 18, 198, 38, 20); g.lineTo(198, 148); g.arcTo(198, 168, 178, 168, 20); g.lineTo(130, 168); g.lineTo(110, 200); g.lineTo(90, 168); g.lineTo(42, 168); g.arcTo(22, 168, 22, 148, 20); g.lineTo(22, 38); g.arcTo(22, 18, 42, 18, 20); g.stroke();
  const img = ICON_IMG[name]; const s = Math.min(168 / img.width, 134 / img.height);
  g.drawImage(img, 110 - img.width * s / 2, 93 - img.height * s / 2, img.width * s, img.height * s);
  BADGES[name] = c;
}
function setupIcons() {
  ICON_IMG.power = TEX.icon_minigun.image; ICON_IMG.rockets = TEX.icon_rockets.image; ICON_IMG.bazooka = TEX.icon_bazooka.image;
  ICON_IMG.beam = laserIcon(); ICON_IMG.drones = TEX.plane.image; ICON_IMG.rapid = rapidIcon();
  LOOT_IMG.coin = coinIcon(64); LOOT_IMG.coins = pileIcon(); LOOT_IMG.gems = gemIcon(); LOOT_IMG.diamond = diamondIcon(); LOOT_IMG.ruby = rubyIcon();
  const root = document.documentElement.style;   // the HUD counters and the results card use the same art
  root.setProperty('--coin', `url(${coinIcon(96).toDataURL()})`); root.setProperty('--gem', `url(${LOOT_IMG.gems.toDataURL()})`); root.setProperty('--dia', `url(${LOOT_IMG.diamond.toDataURL()})`); root.setProperty('--ruby', `url(${LOOT_IMG.ruby.toDataURL()})`);
  root.setProperty('--drone', `url(${ICON_IMG.drones.src})`);
  const blue = ['rgba(120,220,255,1)', 'rgba(150,215,255,.8)', 'rgba(70,150,235,.8)', '#d8f6ff'];
  const gold = ['rgba(255,210,90,1)', 'rgba(255,226,140,.82)', 'rgba(235,150,30,.82)', '#fff3c0'];
  makeBadge('power', gold); makeBadge('rockets', blue); makeBadge('bazooka', gold); makeBadge('beam', blue); makeBadge('drones', blue);
  makeBadge('rapid', ['rgba(190,255,90,1)', 'rgba(200,255,150,.85)', 'rgba(60,170,40,.85)', '#efffd8']);
}

// ---------------------------------------------------------------- audio (all synthesised)
let ac = null, master = null, noiseBuf = null, muted = false;
function initAudio() {
  if (ac) { if (ac.state !== 'running') ac.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  ac = new AC(); master = ac.createGain(); master.gain.value = muted ? 0 : 0.55; master.connect(ac.destination);
  noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate); const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const o = ac.createOscillator(), f = ac.createBiquadFilter(), gn = ac.createGain();
  o.type = 'sawtooth'; o.frequency.value = 62; f.type = 'lowpass'; f.frequency.value = 240; gn.gain.value = 0.035;
  const lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = 26; lg.gain.value = 0.022; lfo.connect(lg); lg.connect(gn.gain);
  o.connect(f); f.connect(gn); gn.connect(master); o.start(); lfo.start();
  amb = { o, f, gn, lfo, lg };
  if (moodOn) setMood(true, true);
}
// music/ambience mood shift for the boss approach (round 6): the drone drops and darkens and a slow heavy pulse
// (a heartbeat under everything) comes in. It carries on through the boss fight.
let amb = null, moodOn = false, moodNodes = null;
function setMood(on, force) {
  if (on === moodOn && !force) return; moodOn = on;
  if (!ac || !amb) return; const t = ac.currentTime;
  amb.o.frequency.setTargetAtTime(on ? 46 : 62, t, 0.9); amb.f.frequency.setTargetAtTime(on ? 170 : 240, t, 0.9);
  amb.gn.gain.setTargetAtTime(on ? 0.05 : 0.035, t, 0.9); amb.lfo.frequency.setTargetAtTime(on ? 13 : 26, t, 0.9);
  if (on && !moodNodes) {
    const p = ac.createOscillator(), pg = ac.createGain(), l = ac.createOscillator(), lg = ac.createGain();
    p.type = 'sine'; p.frequency.value = 41; pg.gain.value = 0.0; l.type = 'sine'; l.frequency.value = 1.35; lg.gain.value = 0.11;
    l.connect(lg); lg.connect(pg.gain); pg.gain.setTargetAtTime(0.1, t, 1.2);
    const d = ac.createOscillator(), df = ac.createBiquadFilter(), dg = ac.createGain();   // a tense detuned second drone
    d.type = 'sawtooth'; d.frequency.value = 48.9; df.type = 'lowpass'; df.frequency.value = 150; dg.gain.value = 0; dg.gain.setTargetAtTime(0.03, t, 1.5);
    p.connect(pg); pg.connect(master); d.connect(df); df.connect(dg); dg.connect(master); p.start(); l.start(); d.start();
    moodNodes = { p, pg, l, d, dg };
  } else if (!on && moodNodes) {
    const m = moodNodes; moodNodes = null; m.pg.gain.setTargetAtTime(0, t, 0.3); m.dg.gain.setTargetAtTime(0, t, 0.3);
    for (const n of [m.p, m.l, m.d]) n.stop(t + 1.5);
  }
}
function noise(dur, f0, f1, vol, type = 'lowpass', q = 1, when = 0) {
  if (!ac) return; const t = ac.currentTime + when;
  const s = ac.createBufferSource(); s.buffer = noiseBuf; const f = ac.createBiquadFilter(); f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  const g = ac.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
}
function tone(freq, dur, vol, type = 'square', when = 0, slide = 0) {
  if (!ac) return; const t = ac.currentTime + when; const o = ac.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
  const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
}
const last = {};
const gap = (k, s) => { if (!ac || ac.currentTime - (last[k] || 0) < s) return true; last[k] = ac.currentTime; return false; };
const SFX = {
  shoot() { if (gap('shoot', 0.07)) return; noise(0.05, 3500, 900, 0.07, 'bandpass', 2); },
  mini() { if (gap('shoot', 0.05)) return; noise(0.04, 4200, 1400, 0.06, 'bandpass', 2); },
  hit() { if (gap('hit', 0.05)) return; tone(rand(900, 1300), 0.03, 0.03, 'square'); },
  tick() { if (gap('tick', 0.06)) return; tone(rand(1400, 1700), 0.03, 0.025, 'triangle'); },
  rocket() { if (gap('rocket', 0.09)) return; noise(0.25, 700, 2600, 0.06, 'bandpass', 1); },
  bazooka() { noise(0.35, 700, 60, 0.3); tone(80, 0.3, 0.14, 'sine', 0, 0.5); },
  pop() { if (gap('pop', 0.03)) return; noise(0.22, 1800, 200, 0.22); tone(180, 0.15, 0.07, 'triangle', 0, 0.4); },
  boom() { noise(0.6, 1400, 60, 0.5); tone(90, 0.5, 0.2, 'sine', 0, 0.3); },
  big() { noise(1.4, 900, 40, 0.7); tone(60, 1.2, 0.3, 'sine', 0, 0.3); },
  wood() { noise(0.25, 2400, 300, 0.35, 'bandpass', 1.5); tone(140, 0.12, 0.1, 'triangle', 0, 0.6); },
  glass() { for (let i = 0; i < 5; i++) tone(rand(2200, 4200), 0.18, 0.04, 'sine', i * 0.025); noise(0.3, 6000, 2500, 0.2, 'highpass', 1); },
  gate() { [660, 880, 1175, 1568].forEach((f, i) => tone(f, 0.16, 0.08, 'triangle', i * 0.06)); },
  plus() { if (gap('plus', 0.045)) return; tone(rand(1300, 1500), 0.06, 0.035, 'triangle'); },
  flip() { tone(700, 0.08, 0.06, 'square'); tone(1050, 0.12, 0.06, 'square', 0.06); },
  bad() { [440, 330, 247].forEach((f, i) => tone(f, 0.2, 0.08, 'sawtooth', i * 0.08)); },
  power() { [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.14, 0.07, 'square', i * 0.05)); },
  max() { [784, 988, 1175, 1568, 1976].forEach((f, i) => tone(f, 0.22, 0.08, 'triangle', i * 0.07)); },
  hurt() { noise(0.35, 600, 80, 0.5); tone(200, 0.35, 0.15, 'sawtooth', 0, 0.3); },
  lose() { tone(160, 0.3, 0.12, 'sawtooth', 0, 0.8); },
  roar() { tone(70, 1.1, 0.25, 'sawtooth', 0, 0.6); tone(95, 1.0, 0.15, 'sawtooth', 0.05, 0.5); noise(1.0, 500, 100, 0.2); },
  warn() { tone(880, 0.12, 0.08, 'square'); tone(880, 0.12, 0.08, 'square', 0.2); },
  spit() { if (gap('spit', 0.1)) return; noise(0.18, 900, 300, 0.12, 'bandpass', 3); },
  sting() { if (gap('sting', 0.1)) return; tone(1600, 0.12, 0.04, 'sawtooth', 0, 0.5); },
  laser() { if (gap('laser', 0.14)) return; noise(0.14, 3200, 1600, 0.035, 'bandpass', 6); tone(rand(620, 700), 0.12, 0.02, 'sawtooth'); },
  win() { [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => tone(f, 0.25, 0.09, 'triangle', i * 0.12)); },
  scratch() { if (gap('scratch', 0.18)) return; noise(0.12, 2600, 900, 0.1, 'bandpass', 3); },
  crack() { noise(0.2, 3000, 800, 0.25, 'highpass', 1); for (let i = 0; i < 3; i++) tone(rand(1800, 2600), 0.08, 0.04, 'square', i * 0.03); },
  beamOn() { tone(300, 0.35, 0.08, 'sawtooth', 0, 4); noise(0.3, 1200, 5000, 0.08, 'bandpass', 2); },
  beamOff() { tone(1200, 0.25, 0.06, 'sawtooth', 0, 0.25); },
  charge() { [392, 523, 659, 784, 1046].forEach((f, i) => tone(f, 0.18, 0.06, 'sine', i * 0.06)); },
  omega() { noise(1.6, 400, 6000, 0.5, 'bandpass', 0.7); tone(55, 1.5, 0.35, 'sawtooth', 0, 0.5); tone(880, 1.2, 0.1, 'sine', 0, 2); },
  orb() { [880, 1320, 1760].forEach((f, i) => tone(f, 0.2, 0.06, 'sine', i * 0.05)); },
  thud() { noise(0.3, 500, 50, 0.6); tone(70, 0.3, 0.3, 'sine', 0, 0.5); },
  star() { noise(0.2, 700, 60, 0.45); tone(90, 0.22, 0.25, 'sine', 0, 0.5); tone(1568, 0.3, 0.05, 'triangle', 0.02); },
  siren() { for (let i = 0; i < 3; i++) { tone(620, 0.42, 0.07, 'sawtooth', i * 0.84, 1.75); tone(1085, 0.42, 0.07, 'sawtooth', i * 0.84 + 0.42, 0.57); } noise(2.4, 300, 120, 0.12, 'lowpass', 1); },
  coin() { if (gap('coin', 0.035)) return; tone(rand(1850, 2150), 0.07, 0.03, 'square'); tone(2800, 0.09, 0.02, 'triangle', 0.03); },
  gem() { [1568, 2093, 2637].forEach((f, i) => tone(f, 0.14, 0.05, 'triangle', i * 0.04)); },
  diamond() { [1318, 1760, 2349, 3136, 4186].forEach((f, i) => tone(f, 0.22, 0.05, 'sine', i * 0.05)); noise(0.4, 9000, 5000, 0.06, 'highpass', 1); },
  count() { if (gap('count', 0.045)) return; tone(rand(1500, 1700), 0.04, 0.03, 'square'); },
  firework() { noise(0.5, 3000, 200, 0.25); for (let i = 0; i < 4; i++) tone(rand(1500, 3000), 0.12, 0.02, 'sine', 0.05 + i * 0.05); },
};
// round 7: results-sequence sounds (ticks with a rising pitch, whooshes, thuds, a choir shimmer and a fanfare)
function pad(freq, dur, vol, type = 'sine', when = 0, att = 0.12, vib = 0) {
  if (!ac) return; const t = ac.currentTime + when; const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
  if (vib) { const l = ac.createOscillator(), lg = ac.createGain(); l.frequency.value = 5.2 + Math.random(); lg.gain.value = freq * vib; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + dur + 0.05); }
  const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + att); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
}
Object.assign(SFX, {
  ruby() { [988, 1318, 1976, 2637].forEach((f, i) => tone(f, 0.2, 0.05, 'triangle', i * 0.045)); tone(660, 0.3, 0.05, 'sine', 0, 1.5); },
  rtick(k = 0) { if (gap('rtick', 0.028)) return; const f = 520 * Math.pow(2, clamp(k, 0, 1) * 1.6); tone(f, 0.05, 0.05, 'square'); tone(f * 2, 0.07, 0.025, 'triangle', 0.012); },
  rsurge(k = 0) { const f = 700 * Math.pow(2, clamp(k, 0, 1) * 1.2); [1, 1.25, 1.5].forEach((m, i) => tone(f * m, 0.12, 0.05, 'triangle', i * 0.03)); },
  whoosh() { noise(0.34, 300, 3200, 0.2, 'bandpass', 1.2); },
  whooshDown() { noise(0.3, 2600, 250, 0.2, 'bandpass', 1.2); },
  zip() { if (gap('zip', 0.03)) return; noise(0.07, 2400, 5200, 0.06, 'bandpass', 4); },
  dcoin(k = 0) { if (gap('dcoin', 0.028)) return; const f = 900 * Math.pow(2, clamp(k, 0, 1) * 1.3); tone(f, 0.06, 0.045, 'square'); tone(f * 1.5, 0.08, 0.02, 'triangle', 0.02); },
  pthud() { noise(0.22, 800, 60, 0.4); tone(110, 0.2, 0.22, 'sine', 0, 0.5); },
  riser() { tone(220, 0.6, 0.06, 'sawtooth', 0, 4); noise(0.6, 400, 6000, 0.08, 'bandpass', 2); },
  punch() { noise(0.5, 1200, 50, 0.7); tone(65, 0.45, 0.35, 'sine', 0, 0.4); [523, 659, 784, 1046].forEach((f) => tone(f, 0.35, 0.05, 'sawtooth')); noise(0.8, 9000, 4000, 0.12, 'highpass', 1); },
  choir() { [523.3, 659.3, 784, 1046.5, 1318.5].forEach((f, i) => { pad(f, 1.6, 0.035, 'sine', i * 0.04, 0.18, 0.006); pad(f * 1.004, 1.5, 0.02, 'triangle', i * 0.04 + 0.02, 0.22, 0.008); });
    for (let i = 0; i < 7; i++) tone(rand(2600, 4600), 0.25, 0.018, 'sine', 0.1 + i * 0.09); noise(1.2, 9000, 6000, 0.04, 'highpass', 1); },
  land() { noise(0.6, 900, 40, 0.8); tone(55, 0.6, 0.4, 'sine', 0, 0.4); tone(110, 0.3, 0.12, 'triangle', 0, 0.5); },
  fanfare() { const N = [[392, 0, 0.12], [392, 0.12, 0.12], [392, 0.24, 0.12], [523, 0.36, 0.5], [659, 0.36, 0.5], [784, 0.36, 0.7], [1046, 0.36, 0.9]];
    for (const [f, w, d] of N) { tone(f, d, 0.05, 'sawtooth', w); tone(f, d, 0.06, 'triangle', w); } noise(0.9, 8000, 3000, 0.06, 'highpass', 1, 0.36); },
});
function sfx(n, arg) { try { SFX[n](arg); } catch (e) { } }

// ---------------------------------------------------------------- state
const S = {};
let bugs = [], pods = [], gates = [], shots = [], shells = [], missiles = [], acids = [], drops = [], stings = [], wingmen = [], pops = [], level = [], levelIdx = 0, tips = [], debris = [];
let cocoons = [], pilots = [], orbFx = [], bombs = [];
let boss = null, trauma = 0, shakePh = 0, flashRed = 0, slowmo = 1, godMode = false, upRing = null, weaponFlash = 0, omegaFlash = 0;
// debug audit for automated runs: where each enemy first became visible, gate rows, bullet tiers, round-5 checks
const AUD = { bugs: 0, seen: 0, maxY: 0, worst: '', viol: [], brood: 0, broodMaxY: 0, gates: 0, gatePairs: 0, minGap: 99, tiers: [], firstShotT: -1,
  bottomExit: 0, bottomExitWho: [], bugMaxScreenY: 0, removedOffscreen: 0, latchPlaneMax: 0, latchTotal: 0, flung: 0, carriers: [], cocoon: [],
  omegaFires: 0, omegaHits: 0, orbs: 0, beamOn: 0, beamOff: 0, beamDrainHp: 0, beamSmoke: 0, gateMaxScale: 0, gateScaleAtMax: [], shakes: {}, maxDrones: 0, stars: -1,
  shakeLog: [], omegaRumble: [], bossChain: [], bossTrace: [], hudMove: { still: 0, omega: 0 }, shotsPlane: 0, shotsDrone: 0, rapid: [], loot: [], rubies: [], coins: {}, threat: null, vibrate: 0 };
// drone formation around the main plane: the same staggered-block style as rounds 4-5 (rows of CFG.droneDX,
// alternate rows offset by half), handed out closest-first. Round 6: instead of a big rectangular keep-out box,
// every lattice spot is tested against the plane's real silhouette (its alpha mask, as seen through the gameplay
// camera), so the first drones tuck in right beside the wingtips, the nose and the tail with no hollow ring.
let SLOTS = [];
function computeSlots() {
  const iw = 64, ih = Math.max(8, Math.round(64 * PLANE_AR));
  const c = document.createElement('canvas'); c.width = iw; c.height = ih; const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(TEX.plane.image, 0, 0, iw, ih);
  const d = g.getImageData(0, 0, iw, ih).data, M = new Uint8Array(iw * ih), pad = CFG.droneHugPad;
  for (let i = 0; i < iw * ih; i++) M[i] = d[i * 4 + 3] > 60 ? 1 : 0;
  const D = new Uint8Array(iw * ih);   // plane mask dilated by `pad` pixels
  for (let y = 0; y < ih; y++) for (let x = 0; x < iw; x++) if (M[y * iw + x]) for (let yy = -pad; yy <= pad; yy++) for (let xx = -pad; xx <= pad; xx++) { const X = x + xx, Y = y + yy; if (X >= 0 && Y >= 0 && X < iw && Y < ih) D[Y * iw + X] = 1; }
  const dronePts = [], planePts = [];
  for (let y = 0; y < ih; y++) for (let x = 0; x < iw; x++) if (M[y * iw + x]) { dronePts.push([(x + 0.5) / iw - 0.5, (y + 0.5) / ih - 0.5]); planePts.push([(x + 0.5) / iw - 0.5, (y + 0.5) / ih - 0.5]); }
  const [pcx, pcy] = toScreen(0, 0.55, 0), pu = unitPx(0, 0.55, 0), pw = PLANE_W * pu, ph = PLANE_W * PLANE_AR * pu;
  const planeScr = planePts.filter((_, i) => i % 3 === 0).map(([u, v]) => [pcx + u * pw, pcy + v * ph]);
  const inPlane = (sx, sy) => { const x = Math.floor(((sx - pcx) / pw + 0.5) * iw), y = Math.floor(((sy - pcy) / ph + 0.5) * ih); return x >= 0 && y >= 0 && x < iw && y < ih && D[y * iw + x] === 1; };
  const dx = CFG.droneDX, dz = CFG.droneDZ;
  const build = (z0) => {
    const pts = [];
    for (let r = -9; r <= 9; r++) {
      const z = r * dz + z0; if (z < -3.2 || z > 2.45) continue;
      const odd = ((r % 2) + 2) % 2 === 1;
      for (let cc = -6; cc <= 6; cc++) {
        const x = cc * dx + (odd ? dx / 2 : 0); if (Math.abs(x) > 3.75) continue;
        const [sx, sy] = toScreen(x, 0.45, z), du = unitPx(x, 0.45, z), dw = WING_W * du, dh = WING_W * PLANE_AR * du;
        let hit = 0; for (const [u, v] of dronePts) if (inPlane(sx + u * dw, sy + v * dh)) hit++;
        const ov = hit / dronePts.length; if (ov > CFG.droneHug || inPlane(sx, sy)) continue;
        let sil = 1e9; for (const [qx, qy] of planeScr) { const q = Math.hypot(sx - qx, sy - qy); if (q < sil) sil = q; }
        // small squads fill beside the wingtips first; the spots right in front of the nose come a little later
        pts.push({ x, z, sil: sil / pu, cen: Math.hypot(sx - pcx, (sy - pcy) * 1.1) / pu, ov, pen: z < -0.8 && Math.abs(x) < 0.8 ? 0.3 : 0 });
      }
    }
    pts.sort((a, b) => (a.sil + a.cen * 0.3 + a.pen) - (b.sil + b.cen * 0.3 + b.pen) || Math.abs(a.x) - Math.abs(b.x) || a.x - b.x);
    return pts.slice(0, MAXD);
  };
  // pick the row phase that packs the squad in tightest (smallest total clearance for the first slots)
  let best = null, bs = 1e9;
  for (let z0 = 0; z0 < dz * 2 - 1e-6; z0 += 0.05) {
    const p = build(+z0.toFixed(3)); if (p.length < MAXD) continue;
    const sc = p.slice(0, 16).reduce((a, s) => a + s.sil, 0) + p.reduce((a, s) => a + s.cen, 0) * 0.05;
    if (sc < bs) { bs = sc; best = p; }
  }
  SLOTS = best.map((s) => [+s.x.toFixed(3), +s.z.toFixed(3)]);
  AUD.slots = { first: best.slice(0, 12).map((s) => [+s.x.toFixed(2), +s.z.toFixed(2), +s.sil.toFixed(2), +s.ov.toFixed(2)]), maxClear16: +Math.max(...best.slice(0, 16).map((s) => s.sil)).toFixed(2) };
}

// bullet tiers, Last War style: standard -> ORANGE -> BLUE. Each power pickup swaps every round in the air at once.
const TIERS = [
  { name: 'STANDARD GUN', col: [1, 0.9, 0.5], core: [1, 0.95, 0.75], dmg: 3, rate: 9, w: 0.24, len: 1.45, twin: false, dDmg: 1, hud: '#ffe9a0', beam: [1, 0.85, 0.4], beamDps: 60 },
  { name: 'ORANGE ROUNDS', col: [1, 0.45, 0.05], core: [1, 0.8, 0.45], dmg: 5, rate: 11, w: 0.34, len: 1.8, twin: true, dDmg: 2, hud: '#ffa040', beam: [1, 0.45, 0.1], beamDps: 90 },
  { name: 'BLUE ROUNDS', col: [0.12, 0.5, 1], core: [0.75, 0.92, 1], dmg: 8, rate: 13, w: 0.44, len: 2.15, twin: true, dDmg: 3, hud: '#7cc4ff', beam: [0.25, 0.6, 1], beamDps: 130 },
];
const T_ = () => TIERS[S.tier];
function updateWeaponHud() {
  const t = T_();
  const name = S.primary === 'beam' ? 'BEAM' : t.name;
  const ic = S.primary === 'beam' ? '' : `<img src="assets/icon_minigun.webp?v=${VER}" alt="">`;
  let h = `${ic}<b style="color:${t.hud}">${name}</b>`;
  if (S.beamOwned && !S.beamOn) h += ` <i class="bm">BEAM \u2191 swipe up</i>`;
  if (S.beamOn) { const left = CFG.beamGrace - S.beamT; h += left > 0 ? ` <i class="bm">${Math.ceil(left)}s \u00b7 \u2193 stop</i>` : ` <i class="bm drain">DRAINING HP \u00b7 \u2193 stop</i>`; }
  if (S.rapidLv) h += ` <i class="rf">\u26a1RAPID \u00d7${CFG.rapidMul[S.rapidLv]}</i>`;
  if (S.rocketLv) h += ` <i>ROCKETS \u00d7${S.rocketLv * 2}</i>`;
  if (S.bazookaLv) h += ` <i>BAZOOKA</i>`;
  $('weap').innerHTML = h;
}
function hpColor(f) { return `hsl(${Math.round(clamp(f, 0, 1) * 120)},90%,48%)`; }
function updateHP() {
  const f = S.hp / S.hpMax; const el = $('hpfill');
  el.style.width = clamp(f * 100, 0, 100) + '%'; el.style.background = hpColor(f);
}

// ---------------------------------------------------------------- Mission 1: Get to Beacon
// Times are when an object appears at the top edge (seconds). Gates and canisters reach the plane ~10 s later,
// bugs a little sooner because they fly at you. Each row holds at most ONE gate.
const BOSS_T = 66;
function buildLevel() {
  seed = 20260928;
  const L = [];
  const D = (T) => T * OBJ_V + SPAWN_D0;
  const gate = (T, x, val, o = {}) => L.push({ d: D(T), k: 'gate', x, val, ...o });
  const can = (T, x, hp, reward) => L.push({ d: D(T), k: 'pod', x, hp, reward, kind: 'can' });
  const orb = (T, x, hp, reward) => L.push({ d: D(T), k: 'pod', x, hp, reward, kind: 'orb' });
  const crate = (T, x, hp, reward, kind = 'crate1') => L.push({ d: D(T), k: 'pod', x, hp, reward, kind });
  // round 6: crates are LOOT (mostly coins, sometimes gems, rarely a diamond); RAPID FIRE comes in canisters
  const loot = (T, x, hp, what) => crate(T, x, hp, { loot: what });
  const rapid = (T, x, hp) => can(T, x, hp, { rapid: 1 });
  const bug = (T, x, type, hp) => L.push({ d: D(T), k: 'bug', x, type, hp });
  const omegaOrb = (T, x) => L.push({ d: D(T), k: 'pod', x, hp: 10, reward: { omega: 0.34 }, kind: 'omega' });
  // cocoon rescue: a carrier bug brings a pilot in from the side and holds station ahead of the plane
  const cocoon = (T, x, side, hp, drones) => L.push({ t: T, k: 'cocoon', x, side, hp, drones });
  const at = (T, k, o = {}) => L.push({ t: T, k, ...o });
  // hunter packs: fast skitterers that dive in from the top corners, swing wide of the guns and try to latch on
  const ambush = (T, n, hp) => L.push({ t: T, k: 'ambush', n, hp });
  // round-2 swarms: staggered rows of yellow-eyed spiders
  const rows = (T, xc, n, cols, hp, sp = 1.1) => {
    // round 8: smaller Xora, denser crowds (CFG.hordeMul more of them, a bit tighter and a bit weaker each)
    n = Math.round(n * CFG.hordeMul); cols = Math.max(cols, Math.round(cols * 1.3)); sp *= CFG.hordeSpacing; hp = Math.max(3, Math.round(hp * CFG.hordeHp));
    for (let i = 0; i < n; i++) {
      const r = Math.floor(i / cols), c = i % cols, inRow = Math.min(cols, n - r * cols);
      const x = xc + (c - (inRow - 1) / 2) * sp + (r % 2 ? sp * 0.3 : 0) + srand(-0.15, 0.15);
      bug(T + r * 0.3 + srand(-0.05, 0.05), clamp(x, -4, 4), 'spider', hp);
    }
  };
  const wedge = (T, xc, n, hp) => { n = Math.round(n * CFG.hordeMul); hp = Math.max(3, Math.round(hp * CFG.hordeHp)); for (let i = 0; i < n; i++) { const r = Math.ceil(i / 2), s = i % 2 ? 1 : -1; bug(T + r * 0.2, clamp(xc + s * r * 0.8 * CFG.hordeSpacing, -4, 4), 'spider', hp); } };
  const brutes = (T, n, hp) => { for (let i = 0; i < n; i++) bug(T + i * 0.5, (i % 2 ? 1 : -1) * srand(0.8, 2.6), 'brute', hp); };
  const wasps = (T, n) => { for (let i = 0; i < n; i++) bug(T + i * 0.55, (i % 2 ? 1 : -1) * srand(2.4, 3.6), 'wasp', 16); };

  // -- opening: guns hot from the first frame, a first wave to shoot, one +2 gate you cannot miss
  at(0.3, 'tip', { text: 'Drag to steer!', target: 'plane', dur: 2.6 });
  rows(-1.0, 0, 5, 5, 5);
  gate(1.6, 0, 2);
  at(4.2, 'tip', { text: 'Shoot the gates to raise them!', target: 'gate', dur: 3 });
  rows(3.0, -2.2, 6, 3, 6);
  rows(4.2, 2.2, 3, 3, 6);
  // first choice: a red drone gate on one side, spiders on the other
  gate(6.0, 2.0, -24); rows(6.0, -2.3, 4, 2, 6);
  rows(7.8, 0, 8, 4, 8);
  // canister #1: bullets turn ORANGE
  at(11.6, 'tip', { text: 'Shoot the canister for more power!', target: 'can', dur: 3 });
  can(9.4, -2.1, 40, { power: 1 }); rows(9.8, 2.4, 4, 2, 8);
  rows(11.4, 0, 10, 5, 9);
  loot(8.4, -2.5, 30, 'coins');
  gate(12.8, -2.0, -60); loot(12.8, 2.2, 45, 'coins');
  wedge(14.6, 0, 9, 11); brutes(15.2, 1, 70);
  gate(16.4, 1.6, 3); rows(16.4, -2.4, 5, 2, 12);
  omegaOrb(18.0, -2.1);
  rows(18.2, 0, 12, 6, 13);
  // canister #2: homing rockets join the guns
  can(20.2, 2.2, 110, { rockets: 1 }); gate(20.2, -2.0, -110);
  rows(22.0, 0, 14, 7, 15); brutes(22.6, 1, 110);
  gate(24.2, 0, -150); loot(24.2, 2.6, 80, 'gems');
  ambush(24.6, 4, 22);
  rows(25.8, 0, 16, 8, 17);
  rapid(26.6, -2.3, 120);   // RAPID FIRE #1
  // mid-point: a small elite moment (the round-3 bugs appear only here and later, briefly)
  bug(28.0, 0, 'beetle', 260); wasps(28.6, 2); bug(29.4, -2.6, 'redspider', 26); bug(29.4, 2.6, 'redspider', 26);
  // the big glass orb: bullets turn BLUE
  orb(31.0, -2.0, 220, { power: 1 }); gate(31.0, 2.0, -90);
  rows(33.0, 0, 18, 9, 22); brutes(33.6, 2, 150);
  gate(35.0, 1.8, -240); rows(35.0, -2.4, 6, 3, 24);
  omegaOrb(36.4, -2.0);
  rows(37.0, 0, 20, 8, 26);
  // canister #3: the BEAM
  can(39.0, -2.2, 170, { weapon: 'beam' }); gate(39.0, 2.0, 5);
  rows(41.0, 0, 22, 8, 28); brutes(41.6, 2, 180);
  ambush(42.4, 5, 30); gate(43.0, -1.6, -320); can(43.0, 2.3, 260, { drones: 8 });
  rows(45.0, 0, 24, 8, 30); loot(44.6, -2.5, 130, 'coins');
  bug(46.8, 0, 'spitter', 140); wasps(47.4, 2);
  rapid(48.0, 2.3, 220);    // RAPID FIRE #2 (max)
  gate(49.0, 0, -600);
  rows(50.6, 0, 26, 9, 32); brutes(51.2, 3, 200);
  cocoon(Number(Q.get('cocoon') || 49.6), -2.5, -1, 260, 8);
  gate(52.8, 2.0, -200); loot(52.8, -2.3, 170, 'coins');
  at(BOSS_T - 15, 'threat');   // B-rank warning ~15 s before the Queen appears
  rows(54.6, 0, 28, 9, 34);
  // the second orb: a big gun before the boss
  orb(56.4, -2.0, 380, { bazooka: 1 }); gate(56.4, 2.0, 10);
  omegaOrb(59.6, 0); loot(61.0, 2.4, 190, 'diamond');
  ambush(57.2, 6, 38);
  rows(58.2, 0, 24, 8, 36); brutes(58.8, 2, 240);
  // final: the Xora Queen (round-2 boss)
  at(BOSS_T - 3, 'warn');
  at(BOSS_T, 'boss');
  // never park a bug directly behind a gate: push it back to leave clear sky
  const gs = L.filter((e) => e.k === 'gate');
  for (const e of L) {
    if (e.k !== 'bug') continue;
    const r = BUG[e.type].r;
    for (const g of gs) if (Math.abs(e.x - g.x) < GATE_W / 2 + r + 0.3 && e.d > g.d - 2.5 && e.d < g.d + GAP_Z + 1.5) e.d = g.d + GAP_Z + 1.5;
  }
  const key = (e) => e.t ?? (e.d - SPAWN_D0) / OBJ_V;
  L.sort((a, b) => key(a) - key(b));
  L.forEach((e) => { e.key = key(e); });
  return L;
}

function resetGame(play) {
  for (const a of [bugs, pods, gates]) for (const o of a) { scene.remove(o.sprite); if (o.glow) scene.remove(o.glow); }
  for (const w of wingmen) scene.remove(w.sprite);
  for (const c of cocoons) { scene.remove(c.sprite); if (c.carrier) scene.remove(c.carrier.sprite); }
  if (boss) { scene.remove(boss.sprite); if (boss.glow) scene.remove(boss.glow); }
  bugs = []; pods = []; gates = []; shots = []; shells = []; missiles = []; acids = []; drops = []; stings = []; wingmen = []; pops = []; tips = []; debris = []; boss = null; upRing = null;
  cocoons = []; pilots = []; orbFx = []; bombs = [];
  Object.assign(S, { mode: play ? 'play' : 'title', t: 0, dist: 0, hp: 100, hpMax: 100, barT: 0, drones: 0, px: 0, tx: 0, vx: 0, inv: 0, kills: 0,
    tier: 0, primary: 'gun', rocketLv: 0, bazookaLv: 0, fireT: 0, missileT: 0.8, cannonT: 1, laserT: 0, gunSide: 0, smokeT: 0, endT: 0, maxDrones: 0, ended: false, deathBy: '',
    beamOwned: false, beamOn: false, beamT: 0, beamHintShown: false, beamStopHint: false, beamSmokeT: 0,
    omega: 0, omegaT: 0, omegaHint: false, combo: 0, comboT: 0, cleanT: 0, rescued: false, shakeT: 0, shakeHint: false, drainHurt: 0, latched: 0,
    rapidLv: 0, fillT: 0, lullUntil: 0, visBugs: 0, coins: 0, coinsShown: 0, killCoins: 0, lootCoins: 0, gems: 0, gemsShown: 0, rubies: 0, rubiesShown: 0, diamonds: 0, diamondsShown: 0, killsBy: {} });
  coinFx = []; setMood(false); $('threat').className = ''; updateLootHud(true);
  slowmo = 1; trauma = 0; flashRed = 0; weaponFlash = 0; omegaFlash = 0;
  level = buildLevel(); levelIdx = 0;
  setDrones(play ? 2 : 0, 0, 0, true);
  const warp = Number(Q.get('warp') || 0); // debug: skip ahead (seconds)
  if (play && warp > 0) {
    S.t = warp; S.dist = warp * OBJ_V;
    while (levelIdx < level.length && level[levelIdx].key < warp) levelIdx++;
    setDrones(Number(Q.get('drones') || 14), 0, 0, true);
    S.tier = warp > 31 ? 2 : warp > 9 ? 1 : 0; if (warp > 20) S.rocketLv = 1; if (warp > 39) { S.beamOwned = true; S.beamHintShown = true; }
  }
  if (play) {
    if (Q.get('drones') && !warp) setDrones(Number(Q.get('drones')), 0, 0, true);
    if (Q.get('tier')) S.tier = clamp(Number(Q.get('tier')), 0, 2);
    if (Q.get('weapon') === 'beam') { S.beamOwned = true; if (Q.get('beamon')) setBeam(true, true); }
    if (Q.get('weapon') === 'gun') { S.beamOwned = false; setBeam(false, true); }
    if (Q.get('omega')) S.omega = clamp(Number(Q.get('omega')), 0, 1);
    if (Q.get('rockets')) S.rocketLv = Number(Q.get('rockets'));
    if (Q.get('bazooka')) S.bazookaLv = Number(Q.get('bazooka'));
    if (Q.get('hp')) S.hp = Number(Q.get('hp'));
    if (Q.get('rapid')) S.rapidLv = clamp(Number(Q.get('rapid')), 0, 2);
  }
  updateHP(); updateWeaponHud();
}

// ---------------------------------------------------------------- wingmen (round-2 drones)
function setDrones(n, fromX, fromZ, quiet) {
  n = clamp(Math.round(n), 0, MAXD);
  let k = 0;
  while (wingmen.length < n) {
    const s = sprite(TEX.plane, WING_W, 0.5, 0.5, 2);
    // a new drone pops in just outside its slot (pushed away from the squad), big and stretched, then eases in
    const [sx, sz] = SLOTS[wingmen.length] || [0, 2];
    const dl = Math.hypot(sx, sz - 0.05) || 1, ox = sx / dl, oz = (sz - 0.05) / dl;
    const w = { sprite: s, x: S.px + sx + ox * 1.1, z: sz + oz * 1.1, ox, oz, ph: rand(0, TAU), fireT: rand(0, 0.4), spawn: quiet ? 1 : 0, delay: quiet ? 0 : k * 0.045, hp: 10, max: 10, barT: 0, aim: 0, aimT: 0, plus: !quiet && k < 14 };
    s.position.set(w.x, 0.45, w.z); wingmen.push(w);
    if (w.delay > 0) s.visible = false;
    k++;
  }
  while (wingmen.length > n) {
    const w = wingmen.pop(); explode(w.sprite.position.x, 0.45, w.sprite.position.z, 0.7, false); scene.remove(w.sprite);
  }
  S.drones = n; S.maxDrones = Math.max(S.maxDrones, n); AUD.maxDrones = Math.max(AUD.maxDrones, n);
}
function gainDrones(v, x, z) {
  const before = S.drones; setDrones(S.drones + v, x, z);
  if (v >= 5) upRing = { t: 0, col: '#ffd84a' };
  if (before + v > MAXD) pop('SQUAD FULL \u00b7 ' + MAXD, S.px, 1.6, -3.4, '#ffe066', 0.7, '#3a2a00', 0, true);
  if (v > 0) sfx('plus');
  return S.drones - before;
}
function removeWingman(j) {
  const w = wingmen[j]; if (!w) return;
  explode(w.x, 0.45, w.z, 0.8, true); scene.remove(w.sprite); wingmen.splice(j, 1); S.drones = wingmen.length;
  pop('\u22121', w.x, 1.2, w.z, '#ff6a5a', 0.75, '#3a0b0b');
}
function damageWingman(j, dmg) {
  const w = wingmen[j]; if (!w) return;
  w.hp -= dmg; w.barT = 1.6;
  if (w.hp <= 0) removeWingman(j);
}

// ---------------------------------------------------------------- spawning
// spider/brute = round-2 enemies (yellow eyes). The round-3 bugs are kept for later stages and only cameo here.
// Every bug is a hunter: it flies in from ahead, homes in on the plane and the squad, then latches on and claws
// (pdmg on contact, dps / ddps per second to the plane / a drone) until it is shot off or flung off.
const BUG = {
  spider: { tex: 'spider', w: 1.75, cy: 0.1, r: 0.8, spd: [1.3, 2.1], turn: 2.2, pdmg: 4, ddmg: 5, dps: 4, ddps: 4, hunt: 1, r2: true, anim: 11 },
  brute: { tex: 'boss', w: 2.7, cy: 0.1, r: 1.15, spd: [0.9, 1.2], turn: 1.3, pdmg: 8, ddmg: 10, dps: 8, ddps: 8, hunt: 0.95, r2: true, anim: 7, big: true },
  redspider: { tex: 'redspider', w: 1.45, cy: 0.4, r: 0.7, spd: [1.8, 2.6], turn: 2.2, pdmg: 5, ddmg: 5, dps: 5, ddps: 5, hunt: 1.2, anim: 11, hover: 0.35 },
  beetle: { tex: 'beetle', w: 2.6, cy: 0.4, r: 1.25, spd: [0.55, 0.7], turn: 1.0, pdmg: 12, ddmg: 10, dps: 10, ddps: 10, hunt: 0.8, elite: true, anim: 6, hover: 0.35 },
  wasp: { tex: 'wasp', w: 2.0, cy: 0.4, r: 0.85, spd: [4.2, 5.0], turn: 4.0, pdmg: 6, ddmg: 10, dps: 6, ddps: 6, hunt: 1.5, anim: 30, hover: 0.9 },
  spitter: { tex: 'spitter', w: 2.0, cy: 0.4, r: 0.95, spd: [1.0, 1.2], turn: 1.5, pdmg: 8, ddmg: 10, dps: 6, ddps: 6, hunt: 0.8, elite: true, anim: 11, hover: 0.35 },
};
const bugW = (B) => B.w * CFG.bugScale;
// round 8: perspective approach scale (farScale at the top edge -> 1 at CFG.nearZ, smoothstep); also used for hit radii
function persp(z) { const k = clamp((z - TOP_Z) / (CFG.nearZ - TOP_Z), 0, 1), e = k * k * (3 - 2 * k); return CFG.farScale + (1 - CFG.farScale) * e; }
const clings = (type) => CFG.clingTypes.includes(type);
function newBug(x, z, type, hp, src = 'wave') {
  const B = BUG[type];
  const s = sprite(TEX[B.tex], bugW(B), 0.5, B.cy, type === 'wasp' ? 1.6 : 1);
  const o = { sprite: s, type, x, z, hp, max: hp, r0: B.r * CFG.bugScale, r: B.r * CFG.bugScale * persp(z), ps: persp(z), cling: clings(type), fx: rand(-1, 1), vx: 0, vz: 0, spd: rand(B.spd[0], B.spd[1]) * CFG.bugSpeed, ph: rand(0, TAU), flash: 0, barT: 0, elite: !!B.elite, t: 0,
    state: 'in', holdT: 0, spitT: rand(0.6, 1.2), bx: x, src, seen: false, host: null, slot: -1, grip: CFG.grip, lx: 0, lz: 0, claw: rand(0, TAU) };
  s.position.set(x, 0.3, z);
  bugs.push(o); AUD.bugs++; return o;
}
const POD = { can: { tex: 'pod', w: 2.3, cy: 0.05 }, orb: { tex: 'capsule', w: 3.2, cy: 0.32 }, crate1: { tex: 'crate1', w: 1.95, cy: 0.32 }, omega: { tex: 'omegaorb', w: CFG.omegaOrbW, cy: 0.5 } };
function spawnEvent(e) {
  // everything with a position spawns beyond the top edge, even if the script is running late
  const z = e.d !== undefined ? Math.min(-(e.d - S.dist), TOP_Z - 2) : 0;
  if (e.k === 'bug') newBug(e.x, z, e.type, e.hp);
  else if (e.k === 'pod') {
    const P = POD[e.kind];
    const pw = P.w * (e.kind === 'omega' ? 1 : CFG.podScale);
    const s = sprite(TEX[P.tex], pw, 0.5, P.cy, 1);
    if (e.kind === 'omega') { s.material.blending = THREE.AdditiveBlending; s.renderOrder = 1.5; }
    pods.push({ sprite: s, kind: e.kind, x: e.x, z, hp: e.hp, max: e.hp, reward: e.reward, flash: 0, jolt: 0, w: pw, ph: rand(0, TAU) });
  } else if (e.k === 'gate') {
    AUD.gates++;
    if (gates.some((o) => !o.passed && Math.abs(o.z - z) < 3)) AUD.gatePairs++;
    const tex = canvasTex(GW_PX, GH_PX, () => { });
    const g = { x: e.x, z, val: e.val, tex, passed: false, bump: 0, dirty: false, redrawT: 0, flash: 0, kind: '', gs: 1, pulse: 0, grown: e.val <= 0 };
    redrawGate(g);
    const m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
    g.sprite = new THREE.Sprite(m); g.sprite.center.set(0.5, 0.02); g.sprite.scale.set(GATE_W, GATE_H, 1); g.sprite.renderOrder = 1.2; scene.add(g.sprite);
    g.sprite.position.set(g.x, 0, z);
    gates.push(g);
  } else if (e.k === 'tip') tips.push({ text: e.text, target: e.target, t: 0, dur: e.dur || 3 });
  else if (e.k === 'banner') banner(e.text, e.sub, e.warn, 2);
  else if (e.k === 'warn') {
    banner('WARNING!', BOSSES[MISSION_BOSS].name + ' INBOUND', true, 2.8); sfx('warn'); setTimeout(() => sfx('warn'), 450); setTimeout(() => sfx('warn'), 900);
  } else if (e.k === 'threat') showThreat();
  else if (e.k === 'boss') spawnBoss(MISSION_BOSS);
  else if (e.k === 'cocoon') spawnCocoon(e);
  else if (e.k === 'ambush') spawnAmbush(e.n, e.hp);
}
function spawnAmbush(n, hp) {
  for (let i = 0; i < n; i++) {
    const side = i % 2 ? 1 : -1, b = newBug(side * rand(2.6, 3.6), TOP_Z - 2 - Math.floor(i / 2) * 0.9, 'redspider', hp, 'ambush');
    b.state = 'hunt'; b.dash = true; b.fside = side; b.vz = 4;
  }
}
function redrawGate(g) {
  const kind = gateKind(g);
  drawGate(g.tex.canvas.getContext('2d'), gateLabel(g), kind);
  g.tex.needsUpdate = true; g.dirty = false; g.kind = kind;
}

// ---------------------------------------------------------------- fx helpers
function explode(x, y, z, size = 1, sound = true, color) {
  const n = Math.round(10 * size) + 4;
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU), sp = rand(1, 5) * size;
    fx.spawn({ x, y: y + rand(0, 0.5) * size, z, vx: Math.cos(a) * sp, vy: rand(1, 4) * size, vz: Math.sin(a) * sp, life: rand(0.25, 0.55), s0: rand(0.6, 1.1) * size, s1: rand(1.2, 1.8) * size, r: 1, g: rand(0.5, 0.8), b: 0.2, a: 0.85, drag: 0.9, world: true });
  }
  fx.spawn({ x, y: y + 0.4 * size, z, vx: 0, vy: 0, vz: 0, life: 0.14, s0: 1.8 * size, s1: 2.8 * size, r: 1, g: 0.85, b: 0.5, a: 0.7, world: true });
  for (let i = 0; i < n * 0.7; i++) {
    const a = rand(0, TAU), sp = rand(0.5, 2.5) * size;
    smokeFx.spawn({ x, y: y + rand(0, 0.5), z, vx: Math.cos(a) * sp, vy: rand(0.5, 2), vz: Math.sin(a) * sp, life: rand(0.5, 1.0), s0: size * 0.8, s1: rand(1.6, 2.6) * size, r: 0.25, g: 0.22, b: 0.22, a: 0.5, drag: 0.93, world: true, fadeIn: true });
  }
  if (color) for (let i = 0; i < n; i++) {
    const a = rand(0, TAU), sp = rand(2, 7) * size;
    smokeFx.spawn({ x, y: y + 0.3, z, vx: Math.cos(a) * sp, vy: rand(2, 6), vz: Math.sin(a) * sp, life: rand(0.4, 0.8), s0: 0.35 * size, s1: 0.2 * size, r: color[0], g: color[1], b: color[2], a: 1, grav: 12, world: true });
  }
  rings.push({ x, z, t: 0, s: size * 2.4 });
  if (sound) sfx(size > 2 ? 'big' : size > 1.1 ? 'boom' : 'pop');
}
const rings = [];
function spark(x, y, z, big, c) {
  fx.spawn({ x, y, z, vx: rand(-2, 2), vy: rand(0, 2), vz: rand(-1, 3), life: 0.12, s0: big ? 1.3 : 0.8, s1: 0.2, r: c ? c[0] : 1, g: c ? c[1] : 0.9, b: c ? c[2] : 0.55, a: 1, world: true });
}
// wood splinters / glass shards / metal bits: flat spinning pieces with gravity
function burst(x, z, kind, n) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU), sp = rand(2, 8);
    const glass = kind === 'glass' || kind === 'amber' || kind === 'omega';
    const c = kind === 'amber' ? [1, rand(0.55, 0.78), rand(0.08, 0.2)] : kind === 'omega' ? [rand(0.7, 0.9), rand(0.5, 0.7), 1] : glass ? [rand(0.5, 0.8), rand(0.8, 0.95), 1] : kind === 'metal' ? [rand(0.45, 0.65), rand(0.48, 0.66), rand(0.52, 0.7)] : kind === 'green' ? [rand(0.3, 0.45), rand(0.42, 0.55), rand(0.25, 0.35)] : [rand(0.55, 0.8), rand(0.33, 0.48), rand(0.16, 0.26)];
    debris.push({ glass, x: x + rand(-0.6, 0.6), y: rand(0.4, 1.6), z: z + rand(-0.4, 0.4), vx: Math.cos(a) * sp, vy: rand(2, 7), vz: Math.sin(a) * sp * 0.7 - 1, rot: rand(0, TAU), vr: rand(-14, 14), sx: glass ? rand(0.25, 0.55) : rand(0.14, 0.24), sz: glass ? rand(0.25, 0.55) : rand(0.5, 1.0), c, t: 0, life: rand(0.7, 1.2) });
  }
}
function pop(text, x, y, z, color = '#fff', size = 1, stroke = '#0b2440', delay = 0, comic = false) { pops.push({ text, x, y, z, t: -delay, color, size, stroke, comic }); }
// screen shake (round 6): impulse bursts on a trauma value; the visible shake is trauma^2 and decays fast.
// Only things that matter shake: crate/canister thuds, big kills, pickups, gate MAX, Omega, the Queen's death chain.
function addShake(kind, mul = 1) {
  const a = (CFG.shake.add[kind] || 0.4) * mul;
  trauma = Math.min(1, Math.max(trauma + a * 0.35, a));
  const pk = +(trauma * trauma).toFixed(3), A = AUD.shakes[kind] || (AUD.shakes[kind] = { n: 0, peak: 0 });
  A.n++; A.peak = Math.max(A.peak, pk);
  if (AUD.shakeLog.length < 400) AUD.shakeLog.push([+S.t.toFixed(2), kind, pk]);
}
// smooth 1D value noise in [-1, 1] (one channel per seed)
function vnoise(t, s) {
  const i = Math.floor(t), f = t - i, u = f * f * (3 - 2 * f);
  const h = (n) => { const x = Math.sin(n * 127.1 + s * 311.7) * 43758.5453; return (x - Math.floor(x)) * 2 - 1; };
  return lerp(h(i), h(i + 1), u);
}
// phone vibration on big thuds, Omega and the boss explosions (only after a user gesture; always guarded)
let userGestured = false, buzzLast = 0;
function buzz(p) {
  if (!userGestured || !navigator.vibrate) return;
  const n = performance.now(); if (n - buzzLast < 70) return; buzzLast = n;
  try { navigator.vibrate(p); AUD.vibrate++; } catch (e) { }
}
let bannerT = 0;
function banner(text, sub, warn, dur = 1.6) {
  const b = $('banner'); b.innerHTML = text + (sub ? `<small>${sub}</small>` : ''); b.className = 'show' + (warn ? ' warn' : ''); bannerT = dur;
}

// ---------------------------------------------------------------- damage & rewards
function hurtPlayer(dmg = 20, by = '') {
  if (S.inv > 0 || godMode || S.mode !== 'play') return;
  S.hp = Math.max(0, S.hp - dmg); S.inv = 0.6; S.barT = 2.2; flashRed = 1; updateHP(); sfx('hurt'); S.cleanT = 0;
  if (navigator.vibrate && navigator.userActivation && navigator.userActivation.hasBeenActive) try { navigator.vibrate(80); } catch (e) { }
  if (S.hp <= 0) { S.deathBy = by; killPlayer(); }
}
// damage over time (clinging bugs, beam drain): no invulnerability frames, a soft red pulse instead of a flash
function drainPlayer(dmg, by = '') {
  if (godMode || S.mode !== 'play' || dmg <= 0) return;
  S.hp = Math.max(0, S.hp - dmg); S.barT = 2.2; S.cleanT = 0; flashRed = Math.max(flashRed, 0.22);
  S.drainHurt += dmg; if (S.drainHurt > 3) { S.drainHurt = 0; updateHP(); sfx('scratch'); }
  if (S.hp <= 0) { updateHP(); S.deathBy = by; killPlayer(); }
}
function killPlayer() {
  if (S.mode !== 'play') return;
  explode(S.px, 0.5, 0, 2.2); addShake('death'); flashRed = 1; planeSprite.visible = false; setDrones(0);
  S.hp = 0; updateHP(); S.mode = 'dead'; S.endT = 1.6; sfx('lose');
}
function loseDrones(n, x, z) {
  if (S.drones <= 0) { hurtPlayer(35, 'crash'); return; }
  setDrones(S.drones - n); pop('\u2212' + n, x, 1.2, z, '#ff6a5a', 0.9, '#3a0b0b'); sfx('bad');
}
function killBug(s, i) {
  const B = BUG[s.type];
  if (i < 0 || bugs[i] !== s) { i = bugs.indexOf(s); if (i < 0) return; }
  explode(s.x, 0.4, s.z, B.big ? 1.6 : s.type === 'beetle' ? 1.7 : s.elite ? 1.3 : 0.85, true, s.type === 'spitter' ? [0.4, 0.95, 0.2] : [0.75, 0.1, 0.08]);
  if (B.big || s.elite) addShake('medium');
  scene.remove(s.sprite); bugs.splice(i, 1); S.kills++;
  { const y = toScreen(s.x, 0.3, s.z)[1] / H, A = AUD.deathY || (AUD.deathY = { n: 0, sum: 0, hist: new Array(10).fill(0) }); if (y >= 0 && y <= 1) { A.n++; A.sum += y; A.hist[Math.min(9, Math.floor(y * 10))]++; A.mean = +(A.sum / A.n).toFixed(3); } }
  awardKill(s.src === 'carrier' ? 'carrier' : s.type, s.x, s.z);
  // Omega charge: every kill feeds it, more during a combo and while you stay clean
  S.combo = S.comboT > 0 ? S.combo + 1 : 1; S.comboT = 1.4;
  omegaGain(0.0034 * (1 + Math.min(S.combo, 24) * 0.05) * (S.cleanT > 6 ? 1.5 : 1) * (B.big || s.elite ? 3 : 1));
}
function breakPod(p, i) {
  const k = p.kind;
  if (i < 0 || pods[i] !== p) { i = pods.indexOf(p); if (i < 0) return; }
  if (k === 'omega') { collectOmegaOrb(p); scene.remove(p.sprite); pods.splice(i, 1); return; }
  if (k === 'orb') { burst(p.x, p.z, 'glass', 36); sfx('glass'); explode(p.x, 0.9, p.z, 1.4, false); }
  else if (k === 'can') { burst(p.x, p.z, 'metal', 16); explode(p.x, 1, p.z, 1.6, true, [0.6, 0.62, 0.66]); }
  else { burst(p.x, p.z, 'wood', 26); sfx('wood'); sfx('thud'); explode(p.x, 0.8, p.z, 1.3, false); }
  addShake('thud'); buzz(45);   // round 6: breaking a crate, canister or power box lands like the Mission Complete star thud
  scene.remove(p.sprite); pods.splice(i, 1);
  giveReward(p.reward, p.x, p.z);
}
function setTier(n, x, z) {
  n = clamp(n, 0, 2); if (n === S.tier) { flyIcons.push({ name: 'power', x, z, t: 0 }); sfx('power'); return; }
  S.tier = n; const T = T_();
  // every round already in the air changes colour and hits harder at once (drones copy the jet)
  for (const b of shots) if (b.kind === 'bullet') { b.dmg = b.drone ? T.dDmg : T.dmg; b.w = T.w * CFG.tracerW * (b.drone ? 0.72 : 1); b.len = T.len * (b.drone ? 0.72 : 1); }
  AUD.tiers.push({ t: +S.t.toFixed(2), tier: n, name: T.name, inAir: shots.length });
  weaponFlash = 1; upRing = { t: 0, col: n === 2 ? '#7cc4ff' : '#ffa040' };
  flyIcons.push({ name: 'power', x, z, t: 0 });
  banner(n === 1 ? 'ORANGE ROUNDS!' : 'BLUE ROUNDS!', n === 1 ? 'Hotter bullets, more damage' : 'Maximum firepower', false, 1.6);
  updateWeaponHud(); sfx('power');
}
function giveReward(R, x = S.px, z = -6) {
  if (R.power) { setTier(S.tier + R.power, x, z); return; }
  if (R.rapid) { setRapid(S.rapidLv + R.rapid, x, z); return; }
  if (R.loot) { dropLoot(R.loot, x, z); return; }
  if (R.weapon === 'beam') {
    S.beamOwned = true; weaponFlash = 1; upRing = { t: 0, col: '#9fe0ff' }; flyIcons.push({ name: 'beam', x, z, t: 0 });
    banner('BEAM!', 'Swipe up from the plane to fire', false, 1.8); updateWeaponHud(); sfx('power');
    if (!S.beamHintShown) { S.beamHintShown = true; tips.push({ text: 'Swipe up to fire beam', target: 'plane', t: 0, dur: 4, arrow: -1 }); }
    return;
  }
  if (R.rockets) {
    S.rocketLv = Math.min(2, S.rocketLv + 1); upRing = { t: 0, col: '#ffd84a' }; flyIcons.push({ name: 'rockets', x, z, t: 0 });
    banner('ROCKETS!', 'Homing salvo \u00d7' + S.rocketLv * 2, false, 1.6); updateWeaponHud(); sfx('power'); return;
  }
  if (R.bazooka) {
    S.bazookaLv = Math.min(2, S.bazookaLv + 1); weaponFlash = 1; upRing = { t: 0, col: '#ffd84a' }; flyIcons.push({ name: 'bazooka', x, z, t: 0 });
    banner('BAZOOKA!', 'Huge explosive shells', false, 1.6); updateWeaponHud(); sfx('power'); return;
  }
  if (R.drones) {
    const got = gainDrones(R.drones, x, z);
    if (R.pilot) {
      pop('+' + R.drones, S.px, 2.6, -2.6, '#ffe066', 1.7, '#3a1d00', 0, true);
      pop('PILOT RESCUED!', S.px, 3.4, -4.4, '#ffe066', 0.95, '#3a1d00', 0.12, true);
      banner('PILOT RESCUED!', '+' + got + ' drones join up', false, 1.8); S.rescued = true; upRing = { t: 0, col: '#ffd84a' };
    } else pop('+' + R.drones, x, 2.4, z, '#ffe066', 1.2, '#4a2e00', 0, true);
    sfx('gate');
  }
  if (R.omega) omegaGain(R.omega);
  if (R.hp) {
    const heal = Math.min(S.hpMax - S.hp, R.hp); S.hp += heal; S.barT = 2.2; updateHP();
    pop('+' + R.hp + ' HP', x, 2.4, z, '#8dff7a', 1, '#0b3a10'); sfx('power');
  }
}
const flyIcons = [];
// RAPID FIRE (round 6): more bullets per second for the plane and every drone; stacks in CFG.rapidMul steps.
// It is separate from the bullet colour tiers (standard / orange / blue), which set damage.
const rapidMul = () => CFG.rapidMul[S.rapidLv] || 1;
function setRapid(n, x, z) {
  const was = S.rapidLv; S.rapidLv = clamp(n, 0, CFG.rapidMul.length - 1);
  flyIcons.push({ name: 'rapid', x, z, t: 0 }); upRing = { t: 0, col: '#c8ff5a' }; weaponFlash = 0.8; sfx('power');
  const m = CFG.rapidMul[S.rapidLv];
  banner(S.rapidLv === was ? 'RAPID FIRE MAX!' : 'RAPID FIRE!', `Fire rate \u00d7${m}${S.rapidLv >= CFG.rapidMul.length - 1 ? ' \u00b7 MAX' : ''} \u00b7 drones too`, false, 1.8);
  pop('\u26a1 \u00d7' + m, S.px, 2.6, -2.6, '#d8ff6a', 1.2, '#1f3a00', 0.1, true);
  AUD.rapid.push({ t: +S.t.toFixed(2), lv: S.rapidLv, mul: m }); updateWeaponHud();
}
// ---------------------------------------------------------------- coins and loot (round 6)
// Every Xora kill pays coins by type (CFG.coins). Crates hold loot: a burst of coins, gems or a diamond,
// which pop out and fly to the HUD counters. The results card tallies it all.
let coinFx = [];
function lootTarget(kind) {
  const el = $(kind === 'coin' ? 'coinico' : kind === 'gem' ? 'gemico' : kind === 'ruby' ? 'rbico' : 'diaico'); const r = el.getBoundingClientRect(), w = wrap.getBoundingClientRect();
  return [r.left - w.left + r.width / 2, r.top - w.top + r.height / 2];
}
function spawnCoins(kind, n, total, x, y, z, power = 1) {
  const [sx, sy] = toScreen(x, y, z); const per = Math.floor(total / n);
  for (let i = 0; i < n; i++) {
    const a = rand(-Math.PI, 0) + rand(-0.4, 0.4), sp = rand(90, 260) * power;
    coinFx.push({ kind, x: sx, y: sy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - rand(60, 180) * power, t: 0, hold: rand(0.3, 0.55) + (kind === 'coin' ? 0 : 0.15), fly: rand(0.4, 0.6), val: i === 0 ? total - per * (n - 1) : per, ph: rand(0, TAU) });
  }
}
const RUBY_FORCE = Q.get('ruby') === '1';   // debug: every ruby roll succeeds
function rollRuby(src, x, y, z) {
  const ch = CFG.loot.ruby[src] || 0; if (!(RUBY_FORCE || Math.random() < ch)) return false;
  S.rubies += 1; spawnCoins('ruby', 1, 1, x, y, z, 1.0); pop('RUBY!', x, 2.9, z, '#ff8a9a', 1.1, '#4a0010', 0.05, true); sfx('ruby'); $('rbBox').classList.remove('hidden');
  for (let k = 0; k < 30; k++) { const a = rand(0, TAU), sp = rand(2, 6); fx.spawn({ x, y, z, vx: Math.cos(a) * sp, vy: rand(1, 4), vz: Math.sin(a) * sp, life: rand(0.4, 0.8), s0: 0.55, s1: 0.1, r: 1, g: 0.3, b: 0.4, a: 1, world: true }); }
  AUD.rubies.push({ t: +S.t.toFixed(2), src, rubies: S.rubies }); return true;
}
function awardKill(type, x, z) {
  if (type === 'carrier' || type === 'beetle' || type === 'spitter') rollRuby(type === 'carrier' ? 'carrier' : 'elite', x, 0.8, z);
  const v = CFG.coins[type] || 1; S.coins += v; S.killCoins += v; S.killsBy[type] = (S.killsBy[type] || 0) + 1;
  AUD.coins[type] = (AUD.coins[type] || 0) + v;
  if (coinFx.length < 140) spawnCoins('coin', v >= 5 ? 3 : 1, v, x, 0.6, z, v >= 5 ? 0.9 : 0.5); else { S.coinsShown += v; updateLootHud(); }
}
function dropLoot(what, x, z) {
  const L = CFG.loot; let c = 0;
  if (what === 'coins') { const n = Math.round(rand(L.coins[0], L.coins[1])); c = n * 2; spawnCoins('coin', n, c, x, 0.9, z, 1.25); pop('+' + c, x, 2.2, z, '#ffd84a', 1.1, '#3a1d00', 0, true); }
  else if (what === 'gems') { const n = Math.round(rand(L.gems[0], L.gems[1])); S.gems += n; c = L.gemCoins; spawnCoins('gem', n, n, x, 0.9, z, 1.1); spawnCoins('coin', 6, c, x, 0.9, z, 1.1); pop('GEM \u00d7' + n, x, 2.3, z, '#7dffb0', 1.0, '#063a1e', 0, true); sfx('gem'); $('gemBox').classList.remove('hidden'); }
  else { S.diamonds += 1; c = L.diamondCoins; spawnCoins('diamond', 1, 1, x, 0.9, z, 1.0); spawnCoins('coin', 10, c, x, 0.9, z, 1.2); pop('DIAMOND!', x, 2.4, z, '#bff4ff', 1.15, '#0a3a5a', 0, true); sfx('diamond'); $('diaBox').classList.remove('hidden');
    for (let k = 0; k < 40; k++) { const a = rand(0, TAU), sp = rand(2, 7); fx.spawn({ x, y: 0.9, z, vx: Math.cos(a) * sp, vy: rand(1, 4), vz: Math.sin(a) * sp, life: rand(0.4, 0.8), s0: 0.6, s1: 0.1, r: 0.8, g: 0.95, b: 1, a: 1, world: true }); } }
  S.coins += c; S.lootCoins += c; AUD.loot.push({ t: +S.t.toFixed(2), what, coins: c, gems: S.gems, diamonds: S.diamonds });
  rollRuby('crate', x, 1.0, z);
}
let lootKey = '';
function updateLootHud(force) {
  const k = S.coinsShown + '|' + S.gemsShown + '|' + S.rubiesShown + '|' + S.diamondsShown; if (k === lootKey && !force) return; lootKey = k;
  $('coinN').textContent = S.coinsShown || 0; $('gemN').textContent = S.gemsShown || 0; $('rbN').textContent = S.rubiesShown || 0; $('diaN').textContent = S.diamondsShown || 0;
  if (force) { $('gemBox').classList.toggle('hidden', !(S.gems > 0)); $('rbBox').classList.toggle('hidden', !(S.rubies > 0)); $('diaBox').classList.toggle('hidden', !(S.diamonds > 0)); }
}
function bumpHud(id) { const el = $(id); el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
function updateCoins(dt) {
  if (!coinFx.length) return;
  const tg = { coin: lootTarget('coin'), gem: lootTarget('gem'), ruby: lootTarget('ruby'), diamond: lootTarget('diamond') };
  for (let i = coinFx.length - 1; i >= 0; i--) {
    const c = coinFx[i]; c.t += dt; c.ph += dt * 12;
    if (c.t < c.hold) { c.vy += 700 * dt; c.vx *= Math.pow(0.9, dt * 60); c.x += c.vx * dt; c.y += c.vy * dt; c.x0 = c.x; c.y0 = c.y; continue; }
    const k = Math.min(1, (c.t - c.hold) / c.fly), e = k * k, [tx, ty] = tg[c.kind];
    c.x = lerp(c.x0, tx, e) + Math.sin(k * Math.PI) * 30 * (c.vx > 0 ? 1 : -1); c.y = lerp(c.y0, ty, e) - Math.sin(k * Math.PI) * 40;
    if (k >= 1) {
      coinFx.splice(i, 1);
      if (c.kind === 'coin') { S.coinsShown += c.val; sfx('coin'); bumpHud('coinBox'); }
      else if (c.kind === 'gem') { S.gemsShown += c.val; sfx('gem'); bumpHud('gemBox'); addShake('pickup', 0.7); }
      else if (c.kind === 'ruby') { S.rubiesShown += c.val; sfx('ruby'); bumpHud('rbBox'); addShake('pickup', 0.8); }
      else { S.diamondsShown += c.val; sfx('diamond'); bumpHud('diaBox'); addShake('pickup'); }
      updateLootHud();
    }
  }
}
// ---------------------------------------------------------------- threat ranks (round 6, a first taste)
// The title card sets the mission's threat level (C-rank); ~15 s before the boss a B-rank warning slams in with a
// siren and the ambience turns dark (setMood) for the rest of the fight.
const THREAT = { mission: 'C', boss: 'B' };
function showThreat() {
  const name = BOSSES[MISSION_BOSS].name, el = $('threat');
  // round 9: hazard tape across the screen, the boss's name in chunky 3D letters overhanging the tape, pulsing in contrast
  el.innerHTML = `<div class="tape"></div><div class="tr-name">${name}</div><div class="tr-sub">${THREAT.boss}-RANK THREAT APPROACHING</div>`;
  el.className = ''; void el.offsetWidth; el.className = 'show';
  sfx('siren'); setMood(true); flashRed = Math.max(flashRed, 0.5); addShake('medium', 0.8);
  AUD.threat = { t: +S.t.toFixed(2), text: `${THREAT.boss}-RANK THREAT: ${name} APPROACHING`, bossT: BOSS_T, mood: moodOn, audio: !!ac };
  setTimeout(() => { if (el.className === 'show') el.className = 'out'; }, 3800);
}
function hitGate(t, tick) {
  t.bump = Math.min(1, t.bump + 0.35); t.pulse = 1;   // every hit 'feeds' the gate: a short pulse, negative or positive
  if (t.val >= GATE_MAX) return;
  const was = t.val; t.val = Math.min(GATE_MAX, t.val + tick); t.dirty = true; t.flash = 1; t.grown = true;
  if ((was < 0) !== (t.val < 0)) { t.redrawT = 0; sfx('flip'); for (let k = 0; k < 24; k++) fx.spawn({ x: t.x + rand(-1.2, 1.2), y: rand(0.3, 1.6), z: t.z, vx: rand(-3, 3), vy: rand(0, 3), vz: rand(-1, 2), life: rand(0.3, 0.6), s0: 0.6, s1: 0.1, r: 0.5, g: 0.85, b: 1, a: 1, world: true }); }
  if (t.val >= GATE_MAX) {
    t.redrawT = 0; sfx('max'); addShake('gateMax'); omegaGain(0.1);
    pop('MAX!', t.x, 2.2, t.z, '#ffe066', 1.1, '#3a1d00', 0, true);
    for (let k = 0; k < 50; k++) fx.spawn({ x: t.x + rand(-1.3, 1.3), y: rand(0.3, 1.8), z: t.z, vx: rand(-4, 4), vy: rand(0, 4), vz: rand(-2, 3), life: rand(0.4, 0.9), s0: 0.7, s1: 0.1, r: 1, g: 0.85, b: 0.3, a: 1, world: true });
  } else sfx('tick');
}
function damage(t, kind, dmg, i, tick = 1) {
  if (kind === 's') { if (t.dash) dmg *= CFG.ambushArmour; t.hp -= dmg; t.flash = 1; t.barT = 1.4; if (t.hp <= 0) killBug(t, i < 0 ? bugs.indexOf(t) : i); }
  else if (kind === 'p') { t.hp -= dmg; t.flash = 1; t.jolt = 1; if (t.hp <= 0) breakPod(t, i < 0 ? pods.indexOf(t) : i); }
  else if (kind === 'g') hitGate(t, tick);
  else if (kind === 'c') hitCocoon(t, dmg);
  else if (kind === 'k') hitCarrier(t, dmg);
  else if (kind === 'b') {
    if (t.state === 'enter' || t.state === 'dying') return; t.hp -= dmg; t.flash = 1;
    if (t.hp <= 0) { t.hp = 0; t.state = 'dying'; t.t = 0; t.bombI = 0; sfx('roar'); slowmo = 0.55; }
  }
}
function passGate(g) {
  const v = g.val, gold = v >= GATE_MAX;
  if (v > 0) {
    gainDrones(v, g.x, g.z);
    const heal = Math.min(S.hpMax - S.hp, 15 + Math.min(35, v));
    pop(gold ? 'MAX!' : '+' + v, S.px, 2.4, -1.5, gold ? '#ffe066' : '#9fe8ff', 1.6, gold ? '#5a3300' : '#0b2a5a');
    if (heal > 0) { S.hp += heal; S.barT = 2.2; pop('+' + Math.round(heal) + ' HP', S.px, 1.2, 0.8, '#8dff7a', 0.9, '#0b3a10', 0, true); updateHP(); }
    sfx(gold ? 'max' : 'gate');
  } else if (v < 0) {
    pop('\u2212' + Math.abs(v), S.px, 2.4, -1.5, '#ff6a5a', 1.6, '#3a0b0b');
    if (S.drones <= 0) { S.deathBy = 'gate'; killPlayer(); return; }
    setDrones(S.drones + v); sfx('bad'); flashRed = 0.6;
  }
  const c = gold ? [1, 0.85, 0.3] : v >= 0 ? [0.5, 0.85, 1] : [1, 0.4, 0.35];
  for (let k = 0; k < 40; k++) fx.spawn({ x: g.x + rand(-1.2, 1.2), y: rand(0.3, 1.8), z: g.z, vx: rand(-3, 3), vy: rand(-1, 3), vz: rand(-2, 4), life: rand(0.3, 0.7), s0: 0.5, s1: 0.1, r: c[0], g: c[1], b: c[2], a: 1, world: true });
}

// ---------------------------------------------------------------- input
// Steering: drag left/right anywhere. Gestures on the plane (round 5):
//  - SWIPE UP from near the plane opens the beam, SWIPE DOWN closes it: a fast (< swipeMaxMs), mostly vertical
//    (|dy| > swipeRatio * |dx|) flick of at least swipeMinPx that starts within swipeRadius px of the plane.
//  - TAP on the plane fires the Omega Beam when it is charged: touch and release within tapMs, moving < tapPx,
//    starting within tapRadius px of the plane. Resting a thumb (too long) or dragging (too far) never fires.
let dragging = false, lastX = 0, keyL = false, keyR = false;
const gest = { id: null, x0: 0, y0: 0, t0: 0, maxD: 0, nearSwipe: false, nearTap: false, used: false };
const GLOG = [];   // gesture log for automated tests
function planeScreen() { return toScreen(S.px, 0.55, -0.15); }
function localXY(e) { const r = wrap.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
function onDown(e) {
  initAudio(); userGestured = true;
  dragging = true; lastX = e.clientX;
  if (S.mode === 'title' && ready) { startGame(); gest.id = null; return; }
  if (S.mode !== 'play') return;
  const [x, y] = localXY(e), [px, py] = planeScreen(), d = Math.hypot(x - px, y - py);
  Object.assign(gest, { id: e.pointerId, x0: x, y0: y, t0: e.timeStamp || performance.now(), maxD: 0, nearSwipe: d < CFG.swipeRadius, nearTap: d < CFG.tapRadius, used: false, d0: d });
}
function checkSwipe(e) {
  if (gest.id !== e.pointerId || gest.used || !gest.nearSwipe || S.mode !== 'play') return;
  const [x, y] = localXY(e), dt = (e.timeStamp || performance.now()) - gest.t0, dx = x - gest.x0, dy = y - gest.y0;
  if (dt > CFG.swipeMaxMs || Math.abs(dy) < CFG.swipeMinPx || Math.abs(dy) < Math.abs(dx) * CFG.swipeRatio || Math.abs(dy) / Math.max(dt, 1) < CFG.swipeMinV) return;
  gest.used = true;
  const dir = dy < 0 ? 'up' : 'down', r = dir === 'up' ? setBeam(true) : setBeam(false);
  GLOG.push({ g: 'swipe-' + dir, t: +S.t.toFixed(2), dx: Math.round(dx), dy: Math.round(dy), ms: Math.round(dt), changed: r, beamOn: S.beamOn });
}
wrap.addEventListener('pointerdown', onDown);
wrap.addEventListener('touchend', () => initAudio());
wrap.addEventListener('click', () => initAudio());
window.addEventListener('pointermove', (e) => {
  if (!dragging) return; const dx = e.clientX - lastX; lastX = e.clientX;
  if (S.mode === 'play') S.tx = clamp(S.tx + dx * (2 * XMAX) / (W * 0.62), -XMAX, XMAX);
  if (gest.id === e.pointerId) { const [x, y] = localXY(e); gest.maxD = Math.max(gest.maxD, Math.hypot(x - gest.x0, y - gest.y0)); checkSwipe(e); }
});
const up = (e) => {
  dragging = false;
  if (e && e.type === 'pointerup' && gest.id === e.pointerId && S.mode === 'play') {
    const [x, y] = localXY(e); gest.maxD = Math.max(gest.maxD, Math.hypot(x - gest.x0, y - gest.y0));
    checkSwipe(e);
    const ms = (e.timeStamp || performance.now()) - gest.t0;
    if (!gest.used) {
      const isTap = gest.nearTap && ms < CFG.tapMs && gest.maxD < CFG.tapPx;
      const fired = isTap ? fireOmega() : false;
      GLOG.push({ g: isTap ? 'tap' : 'release', t: +S.t.toFixed(2), ms: Math.round(ms), moved: Math.round(gest.maxD), d0: Math.round(gest.d0), fired, omega: +S.omega.toFixed(2) });
    }
  }
  gest.id = null;
};
window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());
window.addEventListener('keydown', (e) => {
  userGestured = true;
  if (['ArrowLeft', 'a', 'A'].includes(e.key)) keyL = true;
  if (['ArrowRight', 'd', 'D'].includes(e.key)) keyR = true;
  if (S.mode === 'play' && ['ArrowUp', 'w', 'W'].includes(e.key)) setBeam(true);
  if (S.mode === 'play' && ['ArrowDown', 's', 'S'].includes(e.key)) setBeam(false);
  if (S.mode === 'play' && (e.key === ' ' || e.key === 'e' || e.key === 'E')) fireOmega();
  if ((e.key === ' ' || e.key === 'Enter') && S.mode === 'title' && ready) { initAudio(); startGame(); }
});
window.addEventListener('keyup', (e) => {
  if (['ArrowLeft', 'a', 'A'].includes(e.key)) keyL = false;
  if (['ArrowRight', 'd', 'D'].includes(e.key)) keyR = false;
});
$('mute').addEventListener('pointerdown', (e) => {
  e.stopPropagation(); initAudio(); muted = !muted; if (master) master.gain.value = muted ? 0 : 0.55; $('mute').textContent = muted ? '\ud83d\udd07' : '\ud83d\udd0a';
});
$('again').addEventListener('pointerdown', (e) => { e.stopPropagation(); initAudio(); startGame(); });

function startGame() {
  $('start').classList.add('hidden'); $('end').classList.add('hidden'); $('hud').classList.remove('hidden'); $('bossbar').classList.add('hidden');
  planeSprite.visible = true; resetGame(true);
  if (!Q.get('warp')) banner('MISSION 1', 'Get to Beacon', false, 1.8);
}
// ---------------------------------------------------------------- Mission Complete (round 5): stomp, cartoon stars, celebration
// Star rules: 1 = complete the mission; 2 = finish with >= 50% health OR rescue the pilot;
// 3 = >= 50% health AND the pilot AND at least CFG_STARS.drones drones at the end.
const CFG_STARS = { hp: 0.5, drones: 15 };
const STAR_D = (() => { let d = ''; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 21 : 45; d += (i ? 'L' : 'M') + (50 + Math.cos(a) * r).toFixed(1) + ' ' + (54 + Math.sin(a) * r).toFixed(1); } return d + 'Z'; })();
const starSvg = (on) => `<svg viewBox="0 0 100 100"><path d="${STAR_D}" fill="${on ? 'url(#sgOn)' : 'url(#sgOff)'}" stroke="${on ? '#5a2e00' : '#2a3040'}" stroke-width="8" stroke-linejoin="round"/>${on ? '<ellipse cx="38" cy="36" rx="9" ry="5.5" transform="rotate(-30 38 36)" fill="#fff" opacity=".85"/><circle cx="52" cy="30" r="3" fill="#fff" opacity=".8"/>' : ''}</svg>`;
let endTimers = [];
function endLater(ms, f) { endTimers.push(setTimeout(f, ms)); }
function shakeEnd(kind) { const e = $('end'); e.classList.remove('shk-big', 'shk-small'); void e.offsetWidth; e.classList.add(kind === 'big' ? 'shk-big' : 'shk-small'); }
let celTimers = [], celebrated = false;
// the celebration scales with the stars: 3 = glow, confetti, fireworks; 2 = a little confetti; 1 = nothing extra
function celebrate(stars) {
  if (celebrated) return; celebrated = true; const e = $('end');
  const later = (ms, f) => celTimers.push(setTimeout(f, ms));
  if (stars === 3) {
    e.classList.add('mega'); EFX.confetti(200); sfx('win'); EFX.perfect();
    for (let k = 0; k < 9; k++) later(150 + k * 420, () => { EFX.firework(); sfx('firework'); });
    later(1600, () => EFX.confetti(120));
  } else if (stars === 2) { e.classList.add('nice'); EFX.confetti(70); }
}
function endGame(win) {
  endTimers.forEach(clearTimeout); endTimers = []; celTimers.forEach(clearTimeout); celTimers = []; celebrated = false; EFX.reset(); RES.stop();
  const e = $('end'); e.classList.remove('hidden', 'mega', 'nice', 'shk-big', 'shk-small', 'landed', 'win', 'skipped', 'shine'); e.classList.toggle('lose', !win); e.classList.toggle('win', !!win); e.classList.remove('play'); void e.offsetWidth; e.classList.add('play');
  $('badgewrap').classList.remove('shown');
  const hpF = S.hp / S.hpMax, okHp = hpF >= CFG_STARS.hp, okD = S.drones >= CFG_STARS.drones;
  const r = [win, win && (okHp || S.rescued), win && okHp && S.rescued && okD];
  const stars = r.filter(Boolean).length;
  AUD.stars = stars; AUD.starInfo = { hp: Math.round(hpF * 100), rescued: S.rescued, drones: S.drones };
  const els = [...document.querySelectorAll('.bstar')];
  els.forEach((el, i) => { el.innerHTML = starSvg(i < stars); el.className = 'bstar s' + (i + 1) + (i < stars ? ' on' : ' off'); });
  $('hud').classList.add('hidden'); $('bossbar').classList.add('hidden'); setMood(false);
  if (!win) {   // shot down: the round-6 card, unchanged
    $('endtitle').textContent = 'SHOT DOWN';
    $('endsub').textContent = ({ gate: 'A negative gate with no drones is fatal. Shoot it blue first!', crash: 'Flying into a canister with no drones hurts. Shoot it open!', beam: 'The beam drained you dry. Swipe down sooner!' }[S.deathBy] || 'The Xora got you. Regroup, pilot!');
    $('st-kills').textContent = S.kills; $('st-drones').textContent = S.maxDrones; $('st-time').textContent = Math.round(S.t) + 's';
    $('rules').innerHTML = ''; coinTally(false); return;
  }
  // 1) the gold strip STOMPS down: huge -> impact (shake + dust ring)
  const bw = $('badgewrap'); bw.classList.remove('stomp'); void bw.offsetWidth; bw.classList.add('stomp');
  endLater(330, () => { shakeEnd('big'); sfx('thud'); addShake('stomp'); EFX.dust(); e.classList.add('landed'); });
  // 2) each earned star drops into its slot with a thud and a small shake
  for (let i = 0; i < stars; i++) {
    const t0 = 850 + i * 430;
    endLater(t0, () => els[i].classList.add(stars === 1 ? 'pop' : 'land'));
    endLater(t0 + (stars === 1 ? 120 : 230), () => { sfx('star'); shakeEnd('small'); addShake('star'); EFX.starPuff(els[i], stars); });
  }
  // 3) the celebration by star count (as in round 5/6)
  endLater(850 + stars * 430 + 250, () => celebrate(stars));
  // 4) round 7: the payout sequence runs alongside (RES)
  RES.start(stars);
}
// tap anywhere on the results (not the button) to fast-forward the sequence to its end
function skipEnd() {
  const e = $('end'); if (!e.classList.contains('win') || e.classList.contains('hidden') || !RES.running()) return;
  endTimers.forEach(clearTimeout); endTimers = [];
  if (!e.classList.contains('landed')) { e.classList.add('landed'); $('badgewrap').classList.add('shown'); }
  document.querySelectorAll('.bstar.on').forEach((el) => { if (!el.classList.contains('land') && !el.classList.contains('pop')) el.classList.add('shown'); });
  e.classList.add('skipped'); celebrate(AUD.stars); RES.skip();
}
$('end').addEventListener('pointerdown', (ev) => { if (ev.target.closest && ev.target.closest('button')) return; initAudio(); skipEnd(); });
$('again2').addEventListener('pointerdown', (e) => { e.stopPropagation(); initAudio(); startGame(); });

// ---------------------------------------------------------------- Mission Complete payout sequence (round 7)
// One timeline (ms from the end of the mission), driven by a single rAF loop so tap-to-skip can jump straight to the
// end with exactly the same totals:
//   stage coins count up in surges on the star thuds -> drones cash in (count down, coins up by
//   drones x CFG.droneCoinBase x plane droneCoinMult) -> star bonus (x CFG.starBonus[stars]) -> stones -> final land.
const RES = (() => {
  let P = null, raf = 0, t0 = 0, ei = 0, skipped = false, lastTick = -1, lastSeg = -1, lastLaunch = 0, lastArr = 0, shown = { c: -1, d: -1 }, bump = 0, dBump = 0, done = false;
  const q = (id) => $(id);
  const TICK = 55;   // ms between count-up ticks
  function plan(stars) {
    const stage = S.coins, D = S.drones, plane = CFG.planes[CFG.plane] || { droneCoinMult: 1 }, mult = plane.droneCoinMult;
    const per = CFG.droneCoinBase * mult, droneBonus = Math.round(D * per), sm = CFG.starBonus[stars] || 1, pre = stage + droneBonus, final = Math.round(pre * sm);
    const thuds = []; for (let i = 0; i < stars; i++) thuds.push(850 + i * 430 + (stars === 1 ? 120 : 230));
    const T = { name: 560, coinIn: 780 };
    T.segs = thuds.map((a, i) => [a, i + 1 < stars ? thuds[i + 1] : a + 620]); T.c0 = T.segs[0][0]; T.c1 = T.segs[T.segs.length - 1][1];
    T.dIn = T.c1 + 260; T.mult = T.dIn + 330; T.d0 = T.dIn + 760; T.dTick = D ? clamp(1500 / D, 32, 110) : 0; T.fly = 380;
    T.d1 = D ? T.d0 + (D - 1) * T.dTick + T.fly : T.d0; T.s0 = T.d1 + 380; T.s1 = T.s0 + 720;
    const stones = [['gem', S.gems], ['ruby', S.rubies], ['diamond', S.diamonds]].filter(([, n]) => n > 0);
    let tt = T.s1 + 760; const st = stones.map(([k, n]) => { const o = { k, n, at: tt, rare: k !== 'gem' }; tt += o.rare ? 780 : 500; return o; });
    T.stones = st.map((o) => o.at); T.f = st.length ? tt + 80 : T.s1 + 720; T.btn = T.f + 520; T.end = T.btn + 450;
    const RC = CFG.results, boost = S.coinBoost || 1, why = [];
    if (final >= RC.typicalFinal * RC.coinX) why.push('coins'); if (boost >= RC.boost) why.push('boost');
    for (const [k, n] of stones) if (n >= RC.stones[k]) why.push(k);
    const fq = Q.get('shine'), shine = fq === '1' ? true : fq === '0' ? false : (!RC.shineOnlyIfExtraordinary || why.length > 0);
    return { stage, killCoins: S.killCoins, lootCoins: S.lootCoins, D, base: CFG.droneCoinBase, mult, per, droneBonus, stars, sm, pre, final, T, stones: st, plane: CFG.plane, shine, why: fq === '1' ? ['forced'] : why };
  }
  function coinAt(t) {
    const T = P.T;
    if (t < T.c0) return 0;
    if (t < T.c1) { let F = 0; const n = T.segs.length; for (const [a, b] of T.segs) { if (t >= b) F += 1 / n; else if (t >= a) { const k = (t - a) / (b - a); F += (1 - (1 - k) * (1 - k)) / n; } } return Math.min(P.stage, Math.round(P.stage * F)); }
    if (t < T.s1) return P.stage + Math.round(arrivedAt(t) * P.per);
    if (t < T.s1 + 300) { const k = (t - T.s1) / 300; return Math.round(P.pre + (P.final - P.pre) * (1 - Math.pow(1 - k, 3))); }
    return P.final;
  }
  const launchedAt = (t) => (!P.D || t < P.T.d0 ? 0 : clamp(Math.floor((t - P.T.d0) / P.T.dTick) + 1, 0, P.D));
  const arrivedAt = (t) => (!P.D || t < P.T.d0 + P.T.fly ? 0 : clamp(Math.floor((t - P.T.d0 - P.T.fly) / P.T.dTick) + 1, 0, P.D));
  const cls = (id, c, on = true) => q(id).classList.toggle(c, on);
  function starText(n) { return '\u2605'.repeat(n); }
  function events() {
    const T = P.T, E = [];
    E.push({ at: T.name, fn: (f) => { cls('r-name', 'rin'); if (!f) sfx('whooshDown'); } });
    E.push({ at: T.coinIn, fn: (f) => { cls('r-coins', 'rin'); if (!f) { sfx('whoosh'); sfx('pthud'); } } });
    E.push({ at: T.dIn, fn: (f) => { cls('r-drones', 'rin'); if (!f) { sfx('whoosh'); setTimeout(() => sfx('pthud'), 120); } } });
    E.push({ at: T.mult, fn: (f) => { cls('r-mult', 'rin'); if (!f) { sfx('pthud'); sfx('rsurge', 0.2); } } });
    E.push({ at: T.s0, fn: (f) => {
      const b = q('r-bonus'); b.innerHTML = `<span class="bs">${starText(P.stars)}</span><b>\u00d7${P.sm.toFixed(P.sm % 1 ? 2 : 1).replace(/0$/, '').replace(/\.$/, '.0')}</b>`; b.classList.add('rin');
      if (f) return; sfx('riser');
      document.querySelectorAll('.bstar.on').forEach((el, i) => { setTimeout(() => { el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse'); sfx('rsurge', 0.5 + i * 0.2); EFX.starPuff(el, 3); }, i * 140); });
      const src = document.querySelector('.bstar.s2.on') || document.querySelector('.bstar.on'); if (src) EFX.streak(src, b);
    } });
    E.push({ at: T.s1, fn: (f) => { if (f) return; cls('r-coins', 'punch', false); void q('r-coins').offsetWidth; cls('r-coins', 'punch'); cls('r-bonus', 'used');
      sfx('punch'); shakeEnd('big'); addShake('stomp'); vib(40); const fl = q('r-flash'); fl.classList.remove('go'); void fl.offsetWidth; fl.classList.add('go'); EFX.coinBurst(q('r-coinico'), P.stars >= 2 ? 36 : 22); bump = 0.55; } });
    P.stones.forEach((o, i) => E.push({ at: o.at, fn: (f) => { const el = q('r-stones').children[i]; el.classList.add('rin'); idle(el, o.k);
      if (f) return; sfx('pthud'); sfx(o.k === 'gem' ? 'gem' : o.k === 'ruby' ? 'ruby' : 'diamond'); shakeEnd('small');
      const col = o.k === 'ruby' ? '#ff9aae' : o.k === 'diamond' ? '#dff8ff' : '#8dffb8';
      if (o.rare) sfx('choir'); if (o.rare && P.shine) EFX.holy(el, col); else EFX.sparkAt(el, col, 18); } }));
    E.push({ at: T.f, fn: () => { q('r-coinN').textContent = P.final; shown.c = P.final; cls('r-coins', 'land', false); void q('r-coins').offsetWidth; cls('r-coins', 'land'); cls('r-coins', 'final');
      sfx('land'); setTimeout(() => sfx('fanfare'), 140); shakeEnd('big'); addShake('stomp'); vib(60); EFX.coinBurst(q('r-coinico'), 60, true); cls('r-bank', 'rin'); bump = 0;
      AUD.results.shown = Number(q('r-coinN').textContent); AUD.results.skipped = skipped; AUD.results.landedAt = Math.round(performance.now() - t0); } });
    E.push({ at: T.btn, fn: (f) => { cls('again2', 'rin'); if (!f) sfx('whoosh'); } });
    E.push({ at: T.end, fn: () => { done = true; } });
    return E.sort((a, b) => a.at - b.at);
  }
  const vib = (ms) => buzz(ms);
  // round 10: subtle idle life for the stones, each on its own random timers (never in sync)
  let idleT = [];
  const later = (ms, f) => idleT.push(setTimeout(f, ms));
  function idle(el, k) {
    const ico = el.querySelector('.ico'), gl = el.querySelector('.gl'); if (!ico || !gl) return;
    if (k === 'ruby') ico.style.setProperty('--rd', (-rand(0, 3.4)).toFixed(2) + 's');
    const glint = () => { gl.classList.remove('go'); void gl.offsetWidth; gl.classList.add('go'); AUD.stoneFx.push([k, 'glint', Math.round(performance.now() - t0)]); later(rand(2200, 5200), glint); };
    later(rand(600, 2600), glint);
    if (k === 'diamond') {
      const spark = () => {
        const sp = document.createElement('span'); sp.className = 'spk'; const a = rand(0, TAU), r = rand(0.38, 0.7);
        sp.style.left = (50 + Math.cos(a) * r * 100).toFixed(1) + '%'; sp.style.top = (50 + Math.sin(a) * r * 100).toFixed(1) + '%';
        sp.style.setProperty('--ss', rand(0.55, 1.15).toFixed(2)); sp.style.setProperty('--sd', rand(0.7, 1.25).toFixed(2) + 's');
        sp.addEventListener('animationend', () => sp.remove()); ico.appendChild(sp); AUD.stoneFx.push([k, 'spark', Math.round(performance.now() - t0)]);
        later(rand(180, 620), spark);
      };
      later(rand(200, 700), spark);
    }
  }
  function step(t) {
    const T = P.T;
    // count-up ticks (rising pitch), surges on the star thuds, coins flying in
    if (!skipped && t >= T.c0 && t < T.c1 + TICK) {
      const seg = T.segs.findIndex(([a, b]) => t >= a && t < b);
      if (seg >= 0 && seg !== lastSeg) { lastSeg = seg; sfx('rsurge', seg / 3); bump = Math.max(bump, 0.32); EFX.coinsIn(q('r-coinico'), 8); }
      const k = Math.floor((t - T.c0) / TICK); if (k !== lastTick && t < T.c1) { lastTick = k; sfx('rtick', (t - T.c0) / (T.c1 - T.c0)); bump = Math.max(bump, 0.14); EFX.coinsIn(q('r-coinico'), 1); }
    }
    // drones: one launches every dTick and flies into the coin total
    const L = launchedAt(t), A = arrivedAt(t);
    if (!skipped) {
      while (lastLaunch < L) { lastLaunch++; sfx('zip'); dBump = 0.2; EFX.droneIn(q('r-droneico'), q('r-coinico'), T.fly / 1000); }
      if (A > lastArr) { lastArr = A; sfx('dcoin', A / Math.max(1, P.D)); bump = Math.max(bump, 0.16); }
    } else { lastLaunch = L; lastArr = A; }
    const c = coinAt(t); if (c !== shown.c) { shown.c = c; q('r-coinN').textContent = c; }
    const d = P.D - L; if (d !== shown.d) { shown.d = d; q('r-droneN').textContent = d; if (d === 0 && P.D > 0) cls('r-drones', 'empty'); }
    while (ei < P.ev.length && P.ev[ei].at <= t) P.ev[ei++].fn(skipped);
    bump *= 0.86; dBump *= 0.84;
    q('r-coinN').style.transform = `scale(${(1 + bump).toFixed(3)})`; q('r-coinico').style.transform = `scale(${(1 + bump * 0.7).toFixed(3)}) rotate(${(bump * 40).toFixed(1)}deg)`;
    q('r-droneN').style.transform = `scale(${(1 + dBump).toFixed(3)})`;
  }
  function frame(now) { if (!P) return; const t = now - t0; step(t); if (done && t > P.T.end + 600) { raf = 0; return; } raf = requestAnimationFrame(frame); }
  return {
    start(stars) {
      idleT.forEach(clearTimeout); idleT = []; AUD.stoneFx = []; P = plan(stars); P.ev = events(); ei = 0; skipped = false; done = false; lastTick = -1; lastSeg = -1; lastLaunch = 0; lastArr = 0; shown = { c: -1, d: -1 }; bump = 0; dBump = 0;
      S.coinsShown = S.coins; S.gemsShown = S.gems; S.rubiesShown = S.rubies; S.diamondsShown = S.diamonds; coinFx = []; updateLootHud(true);
      for (const id of ['r-name', 'r-coins', 'r-drones', 'r-mult', 'r-bonus', 'again2', 'r-bank']) q(id).className = '';
      q('again2').className = 'againbtn'; q('r-flash').className = '';
      q('r-mult').textContent = '\u00d7' + P.mult; q('r-bonus').innerHTML = '';
      q('r-stones').innerHTML = P.stones.map((o) => `<div class="stone ${o.k}${o.rare ? ' rare' : ''}"><div class="rays"></div><i class="ico ${o.k === 'diamond' ? 'dia' : o.k}"><span class="gl"></span></i><b>\u00d7${o.n}</b></div>`).join('');
      $('end').classList.toggle('shine', P.shine);   // round 9: the shine only for extraordinary runs (CFG.results)
      q('r-stones').classList.toggle('none', !P.stones.length);
      let bank = 0; try { bank = Number(localStorage.getItem('grokdemo.coins') || 0) + P.final; localStorage.setItem('grokdemo.coins', String(bank)); } catch (e) { }
      q('r-bank').textContent = bank ? `BANK ${bank}` : '';
      AUD.results = { stage: P.stage, killCoins: P.killCoins, lootCoins: P.lootCoins, drones: P.D, droneCoinBase: P.base, droneCoinMult: P.mult, plane: P.plane, droneBonus: P.droneBonus,
        stars: P.stars, starMult: P.sm, shine: P.shine, shineWhy: P.why, preStar: P.pre, final: P.final, expected: Math.round((P.stage + Math.round(P.D * P.base * P.mult)) * P.sm), gems: S.gems, rubies: S.rubies, diamonds: S.diamonds,
        kills: S.kills, killsBy: { ...S.killsBy }, bank, timeline: { ...P.T, segs: P.T.segs }, shown: null, skipped: false, coins: S.coins, t0: 0 };
      q('r-coinN').textContent = '0'; q('r-droneN').textContent = P.D;
      t0 = performance.now(); AUD.results.t0 = t0; if (raf) cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
    },
    skip() {
      if (!P || done) return; skipped = true; AUD.results.skipAt = Math.round(performance.now() - t0);
      t0 = performance.now() - P.T.end - 1; step(P.T.end + 1); bump = 0; if (!raf) raf = requestAnimationFrame(frame);
    },
    stop() { if (raf) cancelAnimationFrame(raf); raf = 0; P = null; idleT.forEach(clearTimeout); idleT = []; },
    running() { return !!P && !done; },
    get P() { return P; },
  };
})();
// results: coins earned (Xora kills x value, plus loot), gems and diamonds, with a count-up
function coinTally(win) {
  S.coinsShown = S.coins; S.gemsShown = S.gems; S.rubiesShown = S.rubies; S.diamondsShown = S.diamonds; coinFx = []; updateLootHud(true);
  const kinds = Object.keys(S.killsBy).filter((k) => S.killsBy[k] > 0).sort((a, b) => (CFG.coins[b] || 0) - (CFG.coins[a] || 0));
  const NAME = { spider: 'Crawlers', redspider: 'Skitterers', wasp: 'Wasps', brute: 'Brutes', beetle: 'Beetles', spitter: 'Spitters', carrier: 'Carriers', queen: 'Queen' };
  $('cs-rows').innerHTML = `<div class="grid">${kinds.map((k) => `<div><span>${NAME[k] || k} ${S.killsBy[k]}\u00d7${CFG.coins[k] || 1}</span><b>${S.killsBy[k] * (CFG.coins[k] || 1)}</b></div>`).join('')}</div>` +
    `<div class="sum">Xora <b>${S.killCoins}</b> + crate loot <b>${S.lootCoins}</b></div>`;
  $('st-gems').textContent = S.gems; $('st-dia').textContent = S.diamonds;
  let bank = 0; try { bank = Number(localStorage.getItem('grokdemo.coins') || 0) + S.coins; localStorage.setItem('grokdemo.coins', String(bank)); } catch (e) { }
  $('cs-bank').textContent = bank ? `Bank ${bank}` : '';
  AUD.results = { coins: S.coins, killCoins: S.killCoins, lootCoins: S.lootCoins, gems: S.gems, diamonds: S.diamonds, killsBy: { ...S.killsBy }, kills: S.kills, bank };
  const el = $('st-coins'); el.textContent = '0'; const t0 = performance.now() + (win ? 2300 : 700), dur = 1500, total = S.coins;
  const step = (t) => {
    const k = clamp((t - t0) / dur, 0, 1), v = Math.round(total * (1 - Math.pow(1 - k, 3)));
    if (t >= t0) { if (el.textContent !== String(v)) { el.textContent = v; sfx('count'); } }
    if (k < 1) requestAnimationFrame(step); else { el.textContent = total; $('coinsum').classList.remove('done'); void el.offsetWidth; $('coinsum').classList.add('done'); sfx('gate'); AUD.results.shown = total; }
  };
  $('coinsum').classList.remove('done'); requestAnimationFrame(step);
}
// end-screen effects canvas: dust ring, star puffs, confetti, fireworks
const EFX = (() => {
  let cv, g, parts = [], rings = [], texts = [], run = false, lastT = 0;
  const cols = ['#ffd84a', '#ff5a7a', '#5ad8ff', '#7cff6a', '#ffffff', '#c78bff', '#ff9a3a'];
  function ensure() {
    if (!cv) { cv = $('endfx'); g = cv.getContext('2d'); }
    const w = cv.clientWidth, h = cv.clientHeight; if (cv.width !== Math.round(w * DPR)) { cv.width = Math.round(w * DPR); cv.height = Math.round(h * DPR); }
    if (!run) { run = true; lastT = performance.now(); requestAnimationFrame(tick); }
  }
  function rel(el) { const a = el.getBoundingClientRect(), b = cv.getBoundingClientRect(); return [a.left - b.left + a.width / 2, a.top - b.top + a.height / 2, a.width, a.height]; }
  function tick(t) {
    const dt = Math.min(0.05, (t - lastT) / 1000); lastT = t;
    const w = cv.clientWidth, h = cv.clientHeight; g.setTransform(DPR, 0, 0, DPR, 0, 0); g.clearRect(0, 0, w, h);
    for (let i = rings.length - 1; i >= 0; i--) { const r = rings[i]; r.t += dt; const k = r.t / r.life; if (k >= 1) { rings.splice(i, 1); continue; } if (k < 0) continue;
      g.globalAlpha = (1 - k) * r.a; g.strokeStyle = r.col; g.lineWidth = r.lw * (1 - k) + 1; g.beginPath(); g.ellipse(r.x, r.y, r.r0 + (r.r1 - r.r0) * (1 - (1 - k) * (1 - k)), (r.r0 + (r.r1 - r.r0) * (1 - (1 - k) * (1 - k))) * r.sq, 0, 0, TAU); g.stroke(); }
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.t += dt;
      if (p.kind === 'fly') {   // round 7: an icon flying along a curve into a target (coins, drones, star bonus)
        if (p.t < 0) continue; const k = Math.min(1, p.t / p.life);
        if (k >= 1) { parts.splice(i, 1); if (p.cb) p.cb(); if (p.pop) for (let j = 0; j < 5; j++) { const a = rand(0, TAU), sp = rand(60, 140); parts.push({ kind: 'spark', x: p.x1, y: p.y1, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, grav: 0, drag: 0.9, s: 2.4, col: p.pop, t: 0, life: 0.3, rot: 0, vr: 0 }); } continue; }
        const e = p.ease === 'in' ? k * k : k * k * (3 - 2 * k), u = 1 - e, x = u * u * p.x0 + 2 * u * e * p.cx + e * e * p.x1, y = u * u * p.y0 + 2 * u * e * p.cy + e * e * p.y1;
        const sc = p.s * (p.s1 ? lerp(1, p.s1, k) : 1) * (k < 0.15 ? 0.4 + k / 0.15 * 0.6 : 1);
        g.globalAlpha = 1; g.save(); g.translate(x, y); g.rotate(p.rot + p.vr * k); if (p.spin) g.scale(Math.abs(Math.cos(p.t * 14 + p.ph)) * 0.8 + 0.2, 1);
        if (p.glow) { g.shadowColor = p.glow; g.shadowBlur = 12; }
        if (p.img) g.drawImage(p.img, -sc / 2, -sc * p.img.height / p.img.width / 2, sc, sc * p.img.height / p.img.width);
        else { g.fillStyle = p.col; g.beginPath(); g.arc(0, 0, sc / 2, 0, TAU); g.fill(); }
        g.restore(); continue;
      }
      if (p.t >= p.life || p.y > h + 40) { parts.splice(i, 1); continue; }
      if (p.kind === 'rocket') { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 260 * dt; if (p.vy > -60) { burstAt(p.x, p.y, p.col); parts.splice(i, 1); continue; } g.globalAlpha = 1; g.fillStyle = '#fff6c0'; g.beginPath(); g.arc(p.x, p.y, 3, 0, TAU); g.fill(); continue; }
      const dr = Math.pow(p.drag, dt * 60); p.vx *= dr; p.vy = p.vy * dr + p.grav * dt; p.x += p.vx * dt + (p.sway ? Math.sin(p.t * 5 + p.ph) * 30 * dt : 0); p.y += p.vy * dt; p.rot += p.vr * dt;
      const k = p.t / p.life; g.globalAlpha = p.kind === 'conf' ? Math.min(1, (1 - k) * 4) : 1 - k * k;
      g.fillStyle = p.col;
      if (p.kind === 'conf') { g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.scale(1, Math.abs(Math.cos(p.t * 7 + p.ph))); g.fillRect(-p.s, -p.s * 0.45, p.s * 2, p.s * 0.9); g.restore(); }
      else if (p.kind === 'dust') { g.beginPath(); g.arc(p.x, p.y, p.s * (0.6 + k * 1.2), 0, TAU); g.fill(); }
      else { g.beginPath(); g.arc(p.x, p.y, p.s * (1 - k * 0.6), 0, TAU); g.fill(); }
    }
    for (let i = texts.length - 1; i >= 0; i--) { const x = texts[i]; x.t += dt; if (x.t > 3.2) { texts.splice(i, 1); continue; }
      const sc = x.t < 0.3 ? easeBack(x.t / 0.3) : 1, a = Math.min(1, (3.2 - x.t) * 2);
      g.save(); g.globalAlpha = a; g.translate(x.x, x.y); g.rotate(-0.06); g.scale(sc, sc); g.font = `44px ${COMIC}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
      g.lineWidth = 13; g.strokeStyle = '#3a1d00'; g.strokeText(x.s, 0, 3); g.strokeText(x.s, 0, 0);
      const gr = g.createLinearGradient(0, -22, 0, 20); gr.addColorStop(0, '#fffbd6'); gr.addColorStop(0.45, '#ffd84a'); gr.addColorStop(1, '#e27700'); g.fillStyle = gr; g.fillText(x.s, 0, 0); g.restore(); }
    g.globalAlpha = 1;
    if (parts.length || rings.length || texts.length) requestAnimationFrame(tick); else { run = false; g.clearRect(0, 0, w, h); }
  }
  function burstAt(x, y, col) {
    for (let i = 0; i < 70; i++) { const a = rand(0, TAU), sp = rand(60, 260); parts.push({ kind: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, grav: 120, drag: 0.96, s: rand(2, 3.6), col: Math.random() < 0.3 ? '#fff' : col, t: 0, life: rand(0.9, 1.5), rot: 0, vr: 0 }); }
    rings.push({ x, y, t: 0, life: 0.5, r0: 5, r1: 90, sq: 1, col, lw: 5, a: 0.9 });
  }
  return {
    reset() { parts = []; rings = []; texts = []; },
    dust() { ensure(); const [x, y, w, h] = rel($('badgewrap')), by = y + h * 0.38;
      for (let i = 0; i < 46; i++) { const a = rand(-0.25, Math.PI + 0.25), sp = rand(120, 340); parts.push({ kind: 'dust', x: x + rand(-w * 0.35, w * 0.35), y: by, vx: Math.cos(a) * sp * (Math.random() < 0.5 ? -1 : 1), vy: -Math.abs(Math.sin(a)) * sp * 0.35, grav: 60, drag: 0.9, s: rand(6, 13), col: `rgba(${rand(225, 255) | 0},${rand(215, 240) | 0},${rand(190, 215) | 0},.8)`, t: 0, life: rand(0.6, 1.0), rot: 0, vr: 0 }); }
      rings.push({ x, y: by, t: 0, life: 0.55, r0: w * 0.2, r1: w * 0.75, sq: 0.28, col: '#fff3c8', lw: 10, a: 0.95 });
      for (let i = 0; i < 20; i++) { const a = rand(0, TAU); parts.push({ kind: 'spark', x: x + Math.cos(a) * w * 0.3, y: y + Math.sin(a) * h * 0.3, vx: Math.cos(a) * 220, vy: Math.sin(a) * 160, grav: 200, drag: 0.94, s: 3, col: '#ffe27a', t: 0, life: 0.6, rot: 0, vr: 0 }); } },
    starPuff(el, stars) { ensure(); const [x, y, w] = rel(el); const n = stars === 1 ? 8 : 16;
      for (let i = 0; i < n; i++) { const a = i / n * TAU, sp = rand(90, 180); parts.push({ kind: stars === 1 ? 'dust' : 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, grav: 150, drag: 0.92, s: stars === 1 ? 5 : 3.2, col: stars === 1 ? 'rgba(255,240,200,.8)' : '#ffe27a', t: 0, life: 0.55, rot: 0, vr: 0 }); }
      rings.push({ x, y, t: 0, life: 0.4, r0: w * 0.3, r1: w * 0.9, sq: 1, col: '#fff3c0', lw: 6, a: 0.9 }); },
    confetti(n) { ensure(); const w = cv.clientWidth;
      for (let i = 0; i < n; i++) parts.push({ kind: 'conf', x: rand(0, w), y: rand(-160, -10), vx: rand(-40, 40), vy: rand(80, 200), grav: 60, drag: 0.99, s: rand(4, 7), col: cols[i % cols.length], t: 0, life: rand(3, 5), rot: rand(0, TAU), vr: rand(-6, 6), ph: rand(0, TAU), sway: true }); },
    firework() { ensure(); const w = cv.clientWidth, h = cv.clientHeight; parts.push({ kind: 'rocket', x: rand(w * 0.15, w * 0.85), y: h + 10, vx: rand(-30, 30), vy: -rand(560, 700), col: cols[(Math.random() * cols.length) | 0], t: 0, life: 3 }); },
    perfect() { ensure(); const [x, y, w, h] = rel($('badgewrap')); texts.push({ s: 'PERFECT!', x, y: y - h * 0.62, t: 0 }); },
    // round 7: results-sequence effects
    coinsIn(target, n) { ensure(); const [tx, ty] = rel(target), w = cv.clientWidth, h = cv.clientHeight;
      for (let i = 0; i < n; i++) { const side = Math.random(), x0 = side < 0.35 ? rand(-20, 30) : side < 0.7 ? rand(w - 30, w + 20) : rand(0, w), y0 = side < 0.7 ? rand(h * 0.25, h * 0.95) : h + 20;
        parts.push({ kind: 'fly', img: LOOT_IMG.coin, x0, y0, cx: (x0 + tx) / 2 + rand(-120, 120), cy: Math.min(y0, ty) - rand(40, 160), x1: tx, y1: ty, s: rand(20, 30), s1: 0.6, t: -rand(0, 0.12), life: rand(0.38, 0.55), rot: 0, vr: 0, spin: true, ph: rand(0, TAU), ease: 'in', pop: '#ffe27a' }); } },
    droneIn(src, target, dur) { ensure(); const [x0, y0] = rel(src), [tx, ty] = rel(target);
      parts.push({ kind: 'fly', img: ICON_IMG.drones, x0: x0 + rand(-8, 8), y0, cx: x0 + rand(-110, 110), cy: (y0 + ty) / 2 - rand(20, 70), x1: tx, y1: ty, s: 34, s1: 0.45, t: 0, life: dur, rot: 0, vr: rand(-1.5, 1.5), ease: 'in', glow: '#9fe8ff', pop: '#bff0ff' }); },
    streak(src, target) { ensure(); const [x0, y0] = rel(src), [tx, ty] = rel(target);
      for (let i = 0; i < 14; i++) parts.push({ kind: 'fly', x0: x0 + rand(-20, 20), y0: y0 + rand(-10, 10), cx: (x0 + tx) / 2 + rand(-80, 80), cy: (y0 + ty) / 2 + rand(-40, 40), x1: tx + rand(-14, 14), y1: ty + rand(-8, 8), s: rand(6, 11), s1: 0.3, col: i % 3 ? '#ffe27a' : '#ffffff', t: -i * 0.025, life: 0.45, rot: 0, vr: 0, glow: '#ffd84a', pop: '#fff3c0' }); },
    coinBurst(el, n, big) { ensure(); const [x, y] = rel(el);
      for (let i = 0; i < n; i++) { const a = rand(0, TAU), sp = rand(120, big ? 420 : 300); parts.push({ kind: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (big ? 80 : 40), grav: 380, drag: 0.95, s: rand(2.6, 4.6), col: Math.random() < 0.3 ? '#fff' : '#ffd84a', t: 0, life: rand(0.6, 1.1), rot: 0, vr: 0 }); }
      rings.push({ x, y, t: 0, life: 0.5, r0: 20, r1: big ? 170 : 120, sq: 1, col: '#ffe27a', lw: big ? 12 : 8, a: 1 });
      if (big) rings.push({ x, y, t: -0.08, life: 0.7, r0: 10, r1: 240, sq: 0.9, col: '#fff6c8', lw: 6, a: 0.8 }); },
    sparkAt(el, col, n) { ensure(); const [x, y] = rel(el); for (let i = 0; i < n; i++) { const a = i / n * TAU, sp = rand(80, 170); parts.push({ kind: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, grav: 120, drag: 0.92, s: 3, col: i % 2 ? '#fff' : col, t: 0, life: 0.55, rot: 0, vr: 0 }); }
      rings.push({ x, y, t: 0, life: 0.4, r0: 12, r1: 60, sq: 1, col, lw: 5, a: 0.9 }); },
    holy(el, col) { ensure(); const [x, y] = rel(el);
      for (let i = 0; i < 36; i++) { const a = rand(0, TAU), sp = rand(40, 200); parts.push({ kind: 'spark', x: x + rand(-8, 8), y: y + rand(-8, 8), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, grav: -30, drag: 0.94, s: rand(2, 4), col: Math.random() < 0.5 ? '#ffffff' : col, t: 0, life: rand(0.9, 1.6), rot: 0, vr: 0 }); }
      rings.push({ x, y, t: 0, life: 0.6, r0: 16, r1: 110, sq: 1, col: '#fffbe0', lw: 9, a: 1 }); rings.push({ x, y, t: -0.15, life: 0.8, r0: 10, r1: 150, sq: 1, col, lw: 5, a: 0.8 }); },
  };
})();

// ---------------------------------------------------------------- bot (debug autoplay: ?autoplay)
function botThink() {
  const cands = [-3, -2.4, -1.8, -1.2, -0.6, 0, 0.6, 1.2, 1.8, 2.4, 3];
  const T = T_();
  let best = S.px, bestScore = -1e9;
  for (const c of cands) {
    let sc = -Math.abs(c - S.px) * 0.4;
    for (const g of gates) {
      if (g.passed || g.z > 0 || g.z < -36 || Math.abs(g.x - c) > GATE_W / 2 - 0.3) continue;
      const tLeft = -g.z / OBJ_V, inRange = Math.min(tLeft, -RANGE_Z / OBJ_V);
      const hps = (S.primary === 'beam' ? 18 : T.rate * rapidMul() * (T.twin ? 2 : 1)) + Math.min(S.drones, 7) * 3 * rapidMul();
      const proj = Math.min(GATE_MAX, g.val + inRange * hps * 0.6);
      const near = g.z > -12 ? 3 : 1;
      if (proj < 0) sc += (S.drones + proj <= 0 && S.drones <= 3 ? -400 : proj * 1.5) * near;
      else sc += Math.min(proj, MAXD - S.drones + 5) * near;
    }
    for (const p of pods) {
      if (Math.abs(p.x - c) > p.w * 0.4 + 0.2) continue;
      if (p.z < -6 && p.z > -34) sc += p.reward.drones ? 10 : 34;
      if (p.z >= -6 && p.z < 1.5) sc -= 70;
    }
    for (const s of bugs) {
      if (s.z > -9 && s.z < 1 && Math.abs(s.x - c) < 1.5) sc -= s.elite ? 8 : BUG[s.type].big ? 3 : 1.2;
      else if (s.z > RANGE_Z && s.z < -9 && Math.abs(s.x - c) < 1) sc += 0.5;
    }
    for (const k of cocoons) if ((k.state === 'hold' || k.state === 'drop') && k.stage < 2 && Math.abs(k.x - c) < 0.9) sc += 140;
    for (const p of pods) if (p.kind === 'omega' && p.z > -12 && p.z < 1 && Math.abs(p.x - c) < 1.2) sc += 30;
    for (const a of acids) if (Math.abs(a.x1 - c) < 1.4 && a.T - a.t < 1.2) sc -= 60;
    for (const a of drops) if (Math.abs(a.x - c) < 1.3 && a.z > -14) sc -= 40;
    for (const a of stings) if (Math.abs(a.x + a.vx * (-a.z / Math.max(1, a.vz)) - c) < 1.2 && a.z > -12) sc -= 30;
    if (boss) {
      if (boss.type === 'queen') {
        if ((boss.tele > 0 || boss.volley > 0) && Math.abs(c - boss.teleX) < 2.6) sc -= 300;
        else if (boss.state === 'fight') sc -= Math.abs(c - boss.x) * 2;
      } else if (boss.state === 'tele' || boss.state === 'charge') { if (Math.abs(c - boss.chargeX) < boss.bw * 0.35 + 1) sc -= 300; }
      else if (boss.state !== 'enter') sc -= Math.abs(c - boss.x) * 3;
    }
    if (sc > bestScore) { bestScore = sc; best = c; }
  }
  S.tx = clamp(best, -XMAX, XMAX);
  // clingers on the plane: wiggle hard to shake them off
  if (S.latched > 0) { S.botWig = (S.botWig || 0) + 1; S.tx = clamp(S.px + (Math.floor(S.t * 5) % 2 ? 2.4 : -2.4), -XMAX, XMAX); }
  // beam: swipe it on when there is something to shoot and health to spare, off before the drain hurts too much
  const ahead = bugs.filter((s) => s.z < -2 && s.z > RANGE_Z && Math.abs(s.x - S.px) < 1.5).length + (boss && boss.state === 'fight' ? 4 : 0);
  if (S.beamOwned && !S.beamOn && S.hp > 60 && ahead >= 3) setBeam(true);
  if (S.beamOn && (S.beamT > CFG.beamGrace + 1.2 || S.hp < 45)) setBeam(false);
  // Omega: tap the plane when charged and there is a crowd, a boss, or clingers
  if (S.omega >= 1 && ((boss && boss.state === 'fight') || bugs.filter((s) => s.z > TOP_Z + 4).length >= 14 || S.latched >= 3)) fireOmega();
}

// ---------------------------------------------------------------- weapons
function fire(x, z, vx, vz, drone) {
  const T = T_();
  const b = { kind: 'bullet', x, z, vx, vz, dmg: drone ? T.dDmg : T.dmg, tick: 1, w: T.w * CFG.tracerW * (drone ? 0.72 : 1), len: T.len * (drone ? 0.72 : 1), drone };
  shots.push(b); return b;
}
function firePrimary(dt) {
  if (S.primary === 'beam') return;   // the beam is drawn and applied in update()
  const T = T_(); S.fireT -= dt;
  while (S.fireT <= 0) {
    S.fireT += 1 / (T.rate * rapidMul());
    if (AUD.firstShotT < 0) AUD.firstShotT = +S.t.toFixed(3);
    const guns = T.twin ? [-0.55, 0.55] : [S.gunSide ? 0.55 : -0.55]; S.gunSide ^= 1;
    AUD.shotsPlane += guns.length;
    for (const gx of guns) {
      fire(S.px + gx, -0.9, 0, -62, false);
      fx.spawn({ x: S.px + gx, y: 0.55, z: -1.1, vx: 0, vy: 0, vz: 0, life: 0.06, s0: 1.0 + S.tier * 0.35, s1: 0.6, r: T.core[0], g: T.core[1], b: T.core[2], a: 1 });
    }
    sfx('shoot');
  }
}
function fireWingmen(dt) {
  const T = T_();
  for (const w of wingmen) {
    w.fireT -= dt;
    if (w.fireT > 0) continue;
    w.fireT += 1 / (3 * rapidMul()); AUD.shotsDrone++;
    // straight ahead, unless a bug is right on top of the main plane: then nearby drones turn to shoot it
    // clinging bugs first (drones shoot them off the plane and each other), then bugs close to the plane
    let tgt = null, best = 1e9;
    for (const s of bugs) {
      const cl = s.state === 'latch';
      if (!cl && (s.z < -6.5 || s.z > 2.6 || Math.hypot(s.x - S.px, s.z) > 4.6)) continue;
      const dw = Math.hypot(s.x - w.x, s.z - w.z);
      if (dw < 5.5 && dw - (cl ? 3 : 0) < best) { best = dw - (cl ? 3 : 0); tgt = s; }
    }
    let vx = 0, vz = -58;
    if (tgt) {
      const dx = tgt.x - w.x, dzz = tgt.z - w.z - 0.2, d = Math.hypot(dx, dzz) || 1;
      vx = dx / d * 58; vz = dzz / d * 58; w.aimT = clamp(-Math.atan2(dx, -dzz), -1.4, 1.4); w.aimHold = 0.5;
    }
    fire(w.x, w.z - 0.4, vx, vz, true);
    fx.spawn({ x: w.x, y: 0.45, z: w.z - 0.55, vx: 0, vy: 0, vz: 0, life: 0.05, s0: 0.6, s1: 0.3, r: T.core[0], g: T.core[1], b: T.core[2], a: 1 });
  }
}
const FLAME = [[1, 0.6, 0.2], [1, 0.45, 0.1], [0.4, 0.7, 1]];
function fireSecondary(dt) {
  if (S.rocketLv > 0) {
    S.missileT -= dt;
    if (S.missileT <= 0) {
      S.missileT = 1.4;
      const targets = [...bugs.filter((s) => s.z > RANGE_Z - 1 && s.z < -2), ...pods.filter((p) => p.z > RANGE_Z - 1 && p.z < -2)];
      if (boss && boss.state !== 'enter' && boss.state !== 'dying') targets.push(boss, boss);
      if (targets.length) {
        for (let i = 0; i < S.rocketLv * 2; i++) {
          const side = i % 2 ? 1 : -1; const t = targets[Math.floor(Math.random() * targets.length)];
          missiles.push({ x: S.px + side * 1.2, y: 0.75, z: 0.1, vx: side * rand(6, 9), vz: -rand(2, 5), t, life: 2.6, delay: Math.floor(i / 2) * 0.12 });
        }
        sfx('rocket');
      }
    }
  }
  if (S.bazookaLv > 0) {
    S.cannonT -= dt;
    if (S.cannonT <= 0) {
      S.cannonT = S.bazookaLv >= 2 ? 0.9 : 1.25;
      shells.push({ x: S.px, z: -1.4, vz: -30, dmg: 30 * S.bazookaLv * (1 + S.tier * 0.5) });
      fx.spawn({ x: S.px, y: 0.6, z: -1.5, vx: 0, vy: 0, vz: 0, life: 0.12, s0: 2.6, s1: 1, r: 1, g: 0.6, b: 0.2, a: 1 });
      smokeFx.spawn({ x: S.px, y: 0.6, z: -1.4, vx: 0, vy: 0.4, vz: 1, life: 0.6, s0: 0.6, s1: 1.8, r: 0.5, g: 0.48, b: 0.46, a: 0.5 });
      sfx('bazooka');
    }
  }
}
function splash(x, z, r, dmg) {
  for (let j = bugs.length - 1; j >= 0; j--) { const s = bugs[j]; if (s && Math.hypot(s.x - x, s.z - z) < r + s.r * 0.4) damage(s, 's', dmg, j); }
  for (let j = pods.length - 1; j >= 0; j--) { const p = pods[j]; if (p && Math.hypot(p.x - x, p.z - z) < r + 0.5) damage(p, 'p', dmg, j); }
  if (boss && Math.abs(boss.x - x) < boss.hitW + r * 0.4 && Math.abs(boss.z - z) < boss.hitD + r * 0.6) { damage(boss, 'b', dmg); pop(String(Math.round(dmg)), x, 2.6, z, '#ffd64a', 0.8); }
}
function gateShadowOf(x, z, r) {
  for (const g of gates) if (!g.passed && g.z - z > 0 && g.z - z < GAP_Z && Math.abs(x - g.x) < GATE_W / 2 + r * 0.5 + 0.1) return g;
  return null;
}
function inGateShadow(x, z, r) {
  for (const g of gates) if (!g.passed && g.z - z > 0 && g.z - z < GAP_Z && Math.abs(x - g.x) < GATE_W / 2 + r * 0.5 + 0.1) return true;
  return false;
}
function hwAt(z) { return Math.min(4.4, lerp(HW0, HW40, clamp(-z / 40, 0, 1.3)) - 0.8); }

// ---------------------------------------------------------------- update
function update(dt) {
  const play = S.mode === 'play';
  S.t += play ? dt : 0;
  const v = OBJ_V * (S.mode === 'win' ? 1.6 : 1);
  const dz = v * dt;           // gameplay objects approach steadily
  const gdz = SPEED * dt;      // ground and clouds race past
  if (play || S.mode === 'win' || S.mode === 'dead') S.dist += dz;
  groundTex.offset.y += gdz / TILE;

  // steering
  if (play) {
    if (keyL) S.tx = clamp(S.tx - 9 * dt, -XMAX, XMAX);
    if (keyR) S.tx = clamp(S.tx + 9 * dt, -XMAX, XMAX);
    if (BOT) botThink();
  } else if (S.mode === 'title') S.tx = Math.sin(performance.now() * 0.0004) * 1.2;
  const prev = S.px; S.px = lerp(S.px, S.tx, 1 - Math.exp(-dt * 12)); S.vx = (S.px - prev) / Math.max(dt, 1e-4);
  S.inv = Math.max(0, S.inv - dt); S.barT = Math.max(0, S.barT - dt);
  const now = performance.now();
  // round-2 plane motion: bob, bank into the turn, narrow a little while banking
  const bob = Math.sin(now * 0.003) * 0.08;
  planeSprite.position.set(S.px, 0.55 + bob, 0);
  planeSprite.material.rotation = clamp(-S.vx * 0.035, -0.35, 0.35);
  planeSprite.scale.x = PLANE_W * (1 - Math.min(0.18, Math.abs(S.vx) * 0.015));
  planeSprite.material.opacity = S.inv > 0 ? (Math.sin(S.inv * 30) > 0 ? 1 : 0.45) : 1;

  // damage smoke: the lower the health, the thicker the trail
  if (play && planeSprite.visible && S.hp < 65) {
    const k = 1 - S.hp / 65; S.smokeT -= dt;
    while (S.smokeT <= 0) {
      S.smokeT += 0.07 - k * 0.045;
      const ex = S.px + (Math.random() < 0.5 ? -0.72 : 0.72) + rand(-0.1, 0.1), gray = 0.7 - k * 0.42 + rand(-0.05, 0.05);
      smokeFx.spawn({ x: ex, y: 0.64, z: -0.1, vx: rand(-0.25, 0.25), vy: rand(0.1, 0.4), vz: rand(4, 6), life: rand(0.7, 1.1), s0: 0.35 + k * 0.3, s1: 1.1 + k * 1.7, r: gray, g: gray * 0.97, b: gray * 0.95, a: 0.6 + k * 0.35, drag: 0.98 });
      if (S.hp < 35 && Math.random() < 0.7) fx.spawn({ x: ex, y: 0.62, z: 0.05, vx: rand(-0.3, 0.3), vy: 0.3, vz: rand(2, 4), life: 0.22, s0: 0.8, s1: 0.2, r: 1, g: 0.5, b: 0.12, a: 1 });
    }
  }

  // level events: positional ones as soon as they are one spawn distance away (beyond the top edge)
  if (play) while (levelIdx < level.length) {
    const e = level[levelIdx];
    if (e.t !== undefined ? S.t >= e.t : e.d - S.dist <= SPAWN_D) { spawnEvent(e); levelIdx++; } else break;
  }

  // round-2 wingmen: fly in from where they were won, then hold their slot with a gentle bob
  // new drones pop in big and stretched just outside their slot, then shrink and ease in (with a sparkle swirl)
  wingmen.forEach((w, i) => {
    const [sx, sz] = SLOTS[i] || [0, 2.2];
    if (w.delay > 0) { w.delay -= dt; w.x = S.px + sx + w.ox * 1.1; w.z = sz + w.oz * 1.1; if (w.delay <= 0) { w.sprite.visible = true; if (w.plus) { pop('+1', w.x, 1.4, w.z - 0.2, '#ffd84a', 1.0, '#3a1d00', 0, true); sfx('plus'); } } else return; }
    const spawning = w.spawn < 1;
    w.spawn = Math.min(1, w.spawn + dt / 0.6); w.barT = Math.max(0, w.barT - dt);
    const k = 1 - Math.exp(-dt * (spawning ? 6 : 7));
    w.x = lerp(w.x, S.px + sx, k); w.z = lerp(w.z, sz, k);
    w.aimHold = Math.max(0, (w.aimHold || 0) - dt); if (w.aimHold <= 0) w.aimT = 0;
    w.aim = lerp(w.aim, w.aimT, 1 - Math.exp(-dt * 12));
    const wb = Math.sin(now * 0.004 + w.ph) * 0.1;
    w.sprite.position.set(w.x, 0.45 + wb, w.z);
    w.sprite.material.rotation = clamp(-(S.px + sx - w.x) * 0.25, -0.4, 0.4) + w.aim;
    const e = 1 - w.spawn, big = 1 + 0.5 * e * e, st = 0.55 * e * e;   // scaled up + stretched away from the squad
    w.sprite.scale.set(WING_W * big * (1 + st * Math.abs(w.ox)), WING_W * PLANE_AR * big * (1 + st * Math.abs(w.oz)), 1);
    w.sprite.material.color.setScalar(1 + e * 0.8);
  });

  if (play) { firePrimary(dt); fireWingmen(dt); fireSecondary(dt); }
  if (play) {
    S.comboT = Math.max(0, S.comboT - dt); S.cleanT += dt;
    if (S.cleanT > 6) omegaGain(0.006 * dt);   // flying clean slowly charges the Omega Beam too
  }
  updateOmega(dt, now);

  // bugs are HUNTERS: they fly in from ahead ('in'), then home in on the plane and the squad ('hunt'),
  // latch on and claw ('latch') until shot or flung off. They never fly past the plane or off the bottom.
  const zFloor = BOT_Z - 0.7;
  let onPlane = 0;
  // round 8: the squad's front line (crawlers, brutes and elites stop here and fight; only wasps/red skitterers cling)
  let sqHW = 1.6, frontZ = -1.3;
  for (const w of wingmen) { if (w.delay > 0) continue; sqHW = Math.max(sqHW, Math.abs(w.x - S.px) + 0.8); frontZ = Math.min(frontZ, w.z - 0.7); }
  for (let i = bugs.length - 1; i >= 0; i--) {
    const s = bugs[i]; s.t += dt; const B = BUG[s.type];
    s.ps = persp(s.z); s.r = s.r0 * s.ps;
    if (!play && s.state !== 'flee') { s.state = 'flee'; s.host = null; }
    if (s.state === 'in' || s.state === 'hold') {
      let hx = S.px, turn = B.turn, spd = s.spd, extraZ = 0, held = false;
      if (s.type === 'wasp' && s.z < -15) { hx = s.bx + Math.sin(s.t * 2.3 + s.ph) * 2.6; spd = s.spd * 0.8; }
      if (s.type === 'spitter') {
        if (s.state === 'in' && s.z > -16 && !s.didHold) { s.state = 'hold'; s.holdT = 0; s.didHold = true; }
        if (s.state === 'hold') {
          s.holdT += dt; extraZ = -dz * (s.cling ? 1 : CFG.crawlScroll); // hangs back: keeps its distance
          s.vx = lerp(s.vx, clamp((S.px - s.x) * 0.5, -1.2, 1.2), 1 - Math.exp(-dt * 2)); s.vz = lerp(s.vz, 0, 1 - Math.exp(-dt * 3));
          s.spitT -= dt;
          if (play && s.spitT <= 0) { s.spitT = 2.0; lob(s.x, s.z + 0.6, S.px + S.vx * 0.25, 1.7); sfx('spit'); }
          if (s.holdT > 7.5) s.state = s.cling ? 'hunt' : 'in';
        }
      }
      // never close in on a gate from behind: hold station and slide round it
      for (const g of gates) {
        if (g.passed) continue;
        const gap = g.z - s.z;
        if (gap > 0 && gap < GAP_Z && Math.abs(s.x - g.x) < GATE_W / 2 + s.r) { held = true; hx = g.x + (s.x < g.x ? -1 : 1) * (GATE_W / 2 + s.r + 0.8); }
      }
      if (s.state === 'in') {
        if (!s.cling && !held) {   // round 8: crowds come straight down, then converge on the squad's width (y ~ 0.4-0.6)
          const near = clamp((s.z + 22) / 12, 0, 1);
          hx = lerp(s.bx, S.px + s.fx * sqHW, near); turn = B.turn * (0.35 + near);
        }
        const dx = hx - s.x, dzz = (s.cling ? 0.2 : frontZ) - s.z, d = Math.hypot(dx, dzz) || 1;
        const k = 1 - Math.exp(-dt * turn);
        s.vx = lerp(s.vx, dx / d * spd, k); s.vz = lerp(s.vz, dzz / d * spd, k);
      }
      if (held && s.vz > 0) s.vz = 0;
      const lim = hwAt(s.z);
      s.x = clamp(s.x + (s.vx + Math.sin(s.ph * 0.3) * 0.2) * dt, -lim, lim); s.z += dz * (s.cling ? 1 : CFG.crawlScroll) + extraZ + s.vz * dt;
      if (s.state === 'in' && s.cling && s.z > -CFG.huntRadius) { s.state = 'hunt'; s.vz = Math.max(0, s.vz - dz * 0.5); }
      else if (s.state === 'in' && !s.cling && s.z >= frontZ - 0.4) { s.state = 'front'; AUD.frontArrivals = (AUD.frontArrivals || 0) + 1; }
    } else if (s.state === 'front') {
      // round 8: hold the squad's front line and fight there: bite the nearest plane/drone in reach, never pass it
      let bx = S.px, bz = -0.2, bw = null, bd = Math.hypot(S.px - s.x, (-0.2 - s.z) * 0.7);
      for (const w of wingmen) { if (w.delay > 0) continue; const d = Math.hypot(w.x - s.x, (w.z - s.z) * 0.7); if (d < bd) { bd = d; bw = w; bx = w.x; bz = w.z; } }
      const tx = bx + s.fx * 0.35, tz = bz - 0.75 - s.r * 0.5;
      const k = 1 - Math.exp(-dt * 4), sp = s.spd * 1.3 + 1;
      const dx = tx - s.x, dzz = tz - s.z, d = Math.hypot(dx, dzz) || 1;
      s.vx = lerp(s.vx, dx / d * Math.min(sp, d * 4), k); s.vz = lerp(s.vz, dzz / d * Math.min(sp, d * 4), k);
      s.x += s.vx * dt; s.z = Math.min(s.z + s.vz * dt, tz + 0.2);
      if (play && bd < 1.05 + s.r) {
        s.claw += dt * 13;
        if (!bw) { drainPlayer(B.dps * 0.6 * dt, 'bug'); if (Math.random() < dt * 4) spark(s.x, 0.7, s.z + 0.3, false, [1, 0.8, 0.4]); }
        else { bw.hp -= B.ddps * dt; bw.barT = 1.6; if (bw.hp <= 0) removeWingman(wingmen.indexOf(bw)); }
      }
    } else if (s.state === 'hunt') {
      // chase: keep pace with the plane (no more scrolling) and home in on a clinging spot
      if (s.host && s.host !== 'plane' && !wingmen.includes(s.host)) s.host = null;
      s.retarget = (s.retarget || 0) - dt;
      if ((!s.host || s.slot === -2) && s.retarget <= 0) { assignHost(s); s.retarget = 0.6; }
      let [tx, tz] = hostPos(s);
      // hunters don't fly down the gun lanes: they swing wide of the squad and come in from the side
      if (s.z < tz - 1.2 && s.slot !== -2) {
        const side = s.fside || (s.fside = (s.x < tx ? -1 : 1)), wide = s.host === 'plane' ? 2.6 : 1.5;
        tx = tx + side * wide; tz = tz - 0.5;
      }
      const dx = tx - s.x, dzz = tz - s.z, d = Math.hypot(dx, dzz) || 1;
      if (s.dash && d < 2.2) s.dash = false;
      const sp = CFG.huntSpeed * B.hunt * (d < 2.5 ? 1.25 : 1) * (s.src === 'boss' ? 1.1 : 1) * (s.dash ? CFG.ambushSpeed : 1);
      const k = 1 - Math.exp(-dt * Math.max(3, B.turn * 1.8));
      const weave = d > 1.6 ? Math.sin(s.t * 4 + s.ph) * 2.2 : 0;   // zig-zag while closing in
      s.vx = lerp(s.vx, dx / d * sp + S.vx * 0.35 + weave, k); s.vz = lerp(s.vz, dzz / d * sp, k);
      s.x += s.vx * dt; s.z += s.vz * dt;
      if (play && d < 0.5 && s.slot !== -2 && s.host) latchOn(s);
    } else if (s.state === 'latch') {
      if (s.host !== 'plane' && !wingmen.includes(s.host)) { s.state = 'hunt'; s.host = null; s.sprite.renderOrder = 1; }
      else {
        s.claw += dt * 13;
        const [tx, tz] = hostPos(s);
        s.x = tx + Math.sin(s.claw) * 0.07; s.z = tz + Math.cos(s.claw * 1.3) * 0.06; s.vx = S.vx; s.vz = 0;
        if (s.host === 'plane') { onPlane++; drainPlayer(B.dps * dt, 'bug'); if (Math.random() < dt * 6) spark(s.x + rand(-0.3, 0.3), 0.7, s.z, false, [1, 0.8, 0.4]); }
        else { const w = s.host; w.hp -= B.ddps * dt; w.barT = 1.6; if (w.hp <= 0) { removeWingman(wingmen.indexOf(w)); s.state = 'hunt'; s.host = null; s.sprite.renderOrder = 1; } }
        // shake them off: steer hard left/right
        if (Math.abs(S.vx) > CFG.shakeOffV) s.grip -= dt; else s.grip = Math.min(CFG.grip, s.grip + dt * 0.4);
        if (s.grip <= 0 && s.state === 'latch') flingOff(s, i);
      }
    } else if (s.state === 'fling') {
      s.stun -= dt; s.vx *= Math.pow(0.9, dt * 60); s.vz *= Math.pow(0.92, dt * 60); s.x += s.vx * dt; s.z += s.vz * dt;
      if (s.stun <= 0) { s.state = 'hunt'; s.host = null; }
    } else if (s.state === 'flee') {
      s.vz = lerp(s.vz, -7, 1 - Math.exp(-dt * 2)); s.z += s.vz * dt; s.x += s.vx * dt;
    }
    s.ph += dt * B.anim; s.barT = Math.max(0, s.barT - dt);
  }
  // round 8: FILLER STREAM. Between hordes a trickle of crawlers keeps coming in from beyond the top edge, so the
  // sky is never empty (>= CFG.filler.min on screen or about to enter). Paused for CFG.filler.lull s after an Omega Beam.
  if (play) {
    const F = CFG.filler; let vis = 0, pend = 0; S.fillT -= dt;
    for (const b of bugs) { if (b.state === 'flee') continue; if (b.z < TOP_Z) { if (b.z > TOP_Z - 9) pend++; } else if (b.z < BOT_Z) vis++; }
    S.visBugs = vis;
    const quiet = S.t < S.lullUntil || (boss && boss.state === 'dying') || S.t < 1.2;
    if (!quiet && vis + pend < F.min && S.fillT <= 0) {
      const n = vis === 0 ? 2 : 1, hw = hwAt(TOP_Z) * 0.8;
      for (let k = 0; k < n; k++) { const b = newBug(rand(-hw, hw), TOP_Z - rand(0.3, 1.8), 'spider', Math.round(F.hp0 + S.t * F.hpPerS), 'filler'); b.bx = b.x; }
      S.fillT = F.every; AUD.filler = (AUD.filler || 0) + n;
    }
  }
  S.latched = onPlane; AUD.latchPlaneMax = Math.max(AUD.latchPlaneMax, onPlane);
  if (onPlane > 0 && !S.shakeHint && play) { S.shakeHint = true; tips.push({ text: 'Wiggle hard to shake them off!', target: 'plane', t: 0, dur: 3 }); }
  // keep swarms from collapsing into one blob (clinging bugs stay put)
  for (let i = 0; i < bugs.length; i++) {
    const a = bugs[i]; if (a.z < -50) continue;
    for (let j = i + 1; j < bugs.length; j++) {
      const b = bugs[j]; const dx = b.x - a.x, dzz = b.z - a.z; const min = (a.r + b.r) * 0.55;
      if (dx > min || dx < -min || dzz > min || dzz < -min) continue;
      const d = Math.hypot(dx, dzz) || 0.01; if (d >= min) continue;
      const la = a.state === 'latch', lb = b.state === 'latch'; if (la && lb) continue;
      const push = (min - d) * (la || lb ? 1 : 0.5) / d;
      if (!la) { a.x -= dx * push; a.z -= dzz * push; } if (!lb) { b.x += dx * push; b.z += dzz * push; }
    }
  }
  // clear sky behind gates: a bug may not move into the zone just behind a gate (within GAP_Z and overlapping it)
  for (const s of bugs) {
    if (s.state === 'latch' || s.state === 'flee') { s.okx = s.x; s.okz = s.z; continue; }
    const sdz = s.state === 'in' || s.state === 'hold' ? dz * (s.cling ? 1 : CFG.crawlScroll) : 0;
    if (inGateShadow(s.x, s.z, s.r)) {
      if (s.okx !== undefined && !inGateShadow(s.okx, s.okz + sdz, s.r)) { s.x = s.okx; s.z = s.okz + sdz; if (s.vz > 0) s.vz = 0; }
      else {   // no safe previous spot (e.g. a gate appeared in front of it): step sideways out of the gate's lane
        const g = gateShadowOf(s.x, s.z, s.r);
        if (g) { const side = s.x < g.x ? -1 : 1, hw = hwAt(s.z) - s.r * 0.5; let nx = g.x + side * (GATE_W / 2 + s.r * 0.5 + 0.15);
          if (Math.abs(nx) > hw) nx = g.x - side * (GATE_W / 2 + s.r * 0.5 + 0.15);
          if (Math.abs(nx) <= hw + 0.01) { s.x = nx; s.bx = nx; } else s.z = Math.min(s.z, g.z - GAP_Z - 0.05); }
      }
    }
    // the hard rule: hunters never pass the plane's squad or leave through the bottom of the screen
    if (s.z > zFloor) { s.z = zFloor; if (s.vz > 0) s.vz = 0; }
    if (s.state !== 'in') { const lim = hwAt(s.z) + 0.4; s.x = clamp(s.x, -lim, lim); }
    s.okx = s.x; s.okz = s.z;
  }
  for (let i = bugs.length - 1; i >= 0; i--) {
    const s = bugs[i]; const B = BUG[s.type];
    const sp = s.sprite, w0 = bugW(B) * s.ps * (s.state === 'latch' ? 0.82 : 1), img = sp.material.map.image;
    if (B.r2) {   // round-2 scuttle
      sp.position.set(s.x, 0.25 + Math.abs(Math.sin(s.ph)) * 0.12 + (s.state === 'latch' ? 0.35 : 0), s.z);
      sp.scale.set(w0 * (1 + Math.sin(s.ph * 2) * 0.03), w0 * img.height / img.width * (1 - Math.sin(s.ph * 2) * 0.05), 1);
      sp.material.rotation = s.state === 'latch' ? Math.sin(s.claw) * 0.22 + (s.host === 'plane' ? clamp((S.px - s.x) * 0.3, -0.5, 0.5) : 0) : clamp(-s.vx * 0.14, -0.35, 0.35) + Math.sin(s.ph) * 0.05;
    } else {
      sp.position.set(s.x, B.hover + Math.abs(Math.sin(s.ph)) * 0.1 + (s.state === 'latch' ? 0.3 : 0), s.z);
      const pulse = s.type === 'wasp' ? Math.sin(s.ph) * 0.06 : Math.sin(s.ph * 2) * 0.03;
      sp.scale.set(w0 * (1 + pulse), w0 * img.height / img.width * (1 - pulse * 0.6), 1);
      sp.material.rotation = s.state === 'latch' ? Math.sin(s.claw) * 0.2 : s.type === 'spitter' && s.state === 'hold' ? Math.sin(s.t * 3) * 0.06 : clamp(-Math.atan2(s.vx, Math.max(0.5, s.vz)) * 0.8, -0.6, 0.6);
    }
    s.flash = Math.max(0, s.flash - dt * 8); sp.material.color.setScalar(1 + s.flash * 1.6);
    if (s.z > 6) { AUD.removedOffscreen++; scene.remove(s.sprite); bugs.splice(i, 1); continue; }
    if (s.state === 'flee' && s.z < TOP_Z - 6) { scene.remove(s.sprite); bugs.splice(i, 1); }
  }

  // canisters, orbs and crates
  for (let i = pods.length - 1; i >= 0; i--) {
    const p = pods[i]; p.z += dz; p.ph += dt;
    p.flash = Math.max(0, p.flash - dt * 8); p.jolt = Math.max(0, p.jolt - dt * 10);
    const jx = (Math.random() - 0.5) * p.jolt * 0.1;
    if (p.kind === 'can') { p.sprite.position.set(p.x + jx, 0.15 + Math.sin(S.dist * 0.5 + p.x) * 0.06, p.z); }
    else {
      p.sprite.position.set(p.x + jx, 0.35 + Math.sin(p.ph * 1.6) * 0.08, p.z);
      p.sprite.material.rotation = p.kind === 'orb' ? Math.sin(p.ph * 0.8) * 0.08 : Math.sin(p.ph * 1.3) * 0.05;
    }
    p.sprite.material.color.setScalar(1 + p.flash * 0.9);
    if (p.kind === 'omega') {
      p.sprite.material.rotation = p.ph * 0.6; const ps = p.w * (1 + Math.sin(p.ph * 5) * 0.08); p.sprite.scale.set(ps, ps, 1);
      if (Math.random() < dt * 20) fx.spawn({ x: p.x + rand(-0.6, 0.6), y: 0.4 + rand(0, 0.6), z: p.z + rand(-0.4, 0.4), vx: 0, vy: rand(0.3, 1), vz: 0, life: 0.5, s0: 0.45, s1: 0.05, r: 0.85, g: 0.7, b: 1, a: 1, world: true });
      const hitW = play && p.z > -1.6 && p.z < 3 && wingmen.some((w) => Math.abs(w.x - p.x) < 0.9 && Math.abs(w.z - p.z) < 0.8);
      if (play && ((p.z > -1 && p.z < 1 && Math.abs(S.px - p.x) < 1.5) || hitW)) { breakPod(p, i); continue; }
      if (p.z > BOT_Z + 3) { scene.remove(p.sprite); pods.splice(i, 1); }
      continue;
    }
    if (play && p.z > -0.8 && p.z < 1 && Math.abs(S.px - p.x) < p.w * 0.4 + 0.6) {
      burst(p.x, p.z, p.kind === 'orb' || p.kind === 'cocoon' ? 'glass' : p.kind === 'can' ? 'metal' : 'wood', 14); explode(p.x, 0.8, p.z, 1.3);
      scene.remove(p.sprite); pods.splice(i, 1); loseDrones(3, p.x, p.z); continue;
    }
    if (p.z > 6) { scene.remove(p.sprite); pods.splice(i, 1); }
  }

  // gates
  for (let i = gates.length - 1; i >= 0; i--) {
    const g = gates[i]; g.z += dz; g.bump = Math.max(0, g.bump - dt * 4); g.flash = Math.max(0, g.flash - dt * 9);
    g.redrawT -= dt; if (g.dirty && g.redrawT <= 0) { redrawGate(g); g.redrawT = 0.06; }
    // inflate: 0..MAX grows linearly to +gateGrow; negatives stay at base size; a gate that starts positive
    // stays at base size until its first hit, then snaps to its proportional size
    const tgt = g.val > 0 && g.grown ? 1 + CFG.gateGrow * Math.min(g.val, GATE_MAX) / GATE_MAX : 1;
    g.gs = lerp(g.gs, tgt, 1 - Math.exp(-dt * 16)); g.pulse = Math.max(0, g.pulse - dt * 7);
    AUD.gateMaxScale = Math.max(AUD.gateMaxScale, g.gs);
    if (g.val >= GATE_MAX) { g.maxT = (g.maxT || 0) + dt; if (g.maxT > 0.5 && !g.logged) { g.logged = true; AUD.gateScaleAtMax.push(+g.gs.toFixed(3)); } }
    const sc = g.gs * (1 + g.bump * 0.035 + g.pulse * 0.06 * (0.7 + 0.3 * Math.sin(now * 0.06))) + (g.val >= GATE_MAX ? Math.sin(now * 0.012) * 0.02 : 0);
    g.sprite.position.set(g.x, 0, g.z); g.sprite.scale.set(GATE_W * sc, GATE_H * sc, 1);
    g.sprite.material.color.setScalar(1 + g.flash * 0.6);
    if (g.val >= GATE_MAX && Math.random() < dt * 20) fx.spawn({ x: g.x + rand(-1.3, 1.3), y: rand(0.2, 1.7), z: g.z, vx: 0, vy: rand(0.5, 1.5), vz: 0, life: 0.5, s0: 0.5, s1: 0.1, r: 1, g: 0.85, b: 0.35, a: 1, world: true });
    if (play && !g.passed && g.z >= -0.2) {
      g.passed = true;
      if (Math.abs(S.px - g.x) < GATE_W / 2) {
        if (g.dirty) redrawGate(g);
        passGate(g);
        scene.remove(g.sprite); gates.splice(i, 1); continue;
      }
    }
    if (g.z > 5) { scene.remove(g.sprite); gates.splice(i, 1); }
  }

  if (boss) { if (boss.type === 'stinger') updateStinger(dt, dz); else updateQueen(dt, dz); }
  updateCocoons(dt, dz);
  updatePilots(dt);

  // targets inside bullet range
  const targets = [];
  for (const g of gates) if (!g.passed && g.z < -1 && g.z > RANGE_Z - 0.5) targets.push([g, 'g', GATE_W / 2 - 0.05, 0.4]);
  for (const s of bugs) if (s.z > RANGE_Z - 1) targets.push([s, 's', s.r, s.elite || BUG[s.type].big ? 1 : 0.7]);
  for (const p of pods) if (p.z > RANGE_Z - 1) targets.push([p, 'p', p.w * 0.42, 0.8]);
  if (boss && boss.state !== 'enter' && boss.state !== 'dying' && boss.z > RANGE_Z - 1.5) targets.push([boss, 'b', boss.hitW, boss.hitD]);
  for (const c of cocoons) {
    if (c.stage < 2 && c.state !== 'leave' && c.z > RANGE_Z - 1) targets.push([c, 'c', CFG.cocoonW * 0.36, 1.0]);
    if (c.carrier.alive && c.state !== 'leave' && c.carrier.z > RANGE_Z - 1) targets.push([c.carrier, 'k', CFG.carrierW * 0.46 * (c.carrier.ks || 1), 0.55]);
  }
  const alive = (t, k) => k === 's' ? bugs.includes(t) : k === 'p' ? pods.includes(t) : k === 'b' ? boss === t && t.state !== 'dying' : k === 'c' ? t.stage < 2 && cocoons.includes(t) : k === 'k' ? t.alive : !t.passed;

  // bullets: coloured body (normal blend) + hot core (additive). Colour always follows the current tier.
  const T = T_();
  tracers.begin(); bulletsB.begin(); rocketsB.begin(); shellsB.begin(); beams.begin(); beamsN.begin();
  for (let i = shots.length - 1; i >= 0; i--) {
    const b = shots[i]; const nz = b.z + b.vz * dt, nx = b.x + b.vx * dt;
    const lo = Math.max(Math.min(b.z, nz), RANGE_Z), hi = Math.max(b.z, nz), mx = (b.x + nx) / 2;
    let hit = null, hz = b.vz < 0 ? -1e9 : 1e9;
    for (const tg of targets) {
      const t = tg[0]; if (t.hp !== undefined && t.hp <= 0) continue;
      if (Math.abs(mx - t.x) < tg[2] && t.z - tg[3] <= hi && t.z + tg[3] >= lo && (b.vz < 0 ? t.z > hz : t.z < hz)) { hit = tg; hz = t.z; }
    }
    if (hit && alive(hit[0], hit[1])) {
      const t = hit[0];
      damage(t, hit[1], b.dmg, -1, b.tick);
      if (Math.random() < (b.drone ? 0.35 : 0.7)) spark(mx, hit[1] === 'g' ? rand(0.4, 1.4) : hit[1] === 'b' ? rand(1, 3) : 0.6, t.z + 0.3, S.tier > 0, T.core);
      if (Math.random() < 0.25) sfx('hit');
      shots.splice(i, 1); continue;
    }
    b.z = nz; b.x = nx;
    if (b.z <= RANGE_Z || b.z > 6 || Math.abs(b.x) > 9) { shots.splice(i, 1); continue; }
    const fade = clamp((b.z - RANGE_Z) / 4, 0.2, 1), rot = (b.vx || b.vz > 0) ? Math.atan2(-b.vx, -b.vz) : 0, y = b.drone ? 0.45 : 0.5;
    bulletsB.add(b.x, y, b.z, b.w, b.len, rot, T.col[0], T.col[1], T.col[2]);
    tracers.add(b.x, y + 0.02, b.z, b.w * 0.4, b.len * 0.7, rot, T.core[0] * fade * 0.8, T.core[1] * fade * 0.8, T.core[2] * fade * 0.8);
  }

  // BEAM (round 2): pierces everything in a narrow column up to the range limit. Wider and bluer at higher tiers.
  if (play && S.beamOn) {
    S.beamT += dt;
    if (S.beamT > 1.4 && !S.beamStopHint) { S.beamStopHint = true; tips.push({ text: 'Swipe down to stop', target: 'plane', t: 0, dur: 3.2, arrow: 1 }); }
    if (S.beamT > CFG.beamGrace) {
      const d = CFG.beamDrain * dt; drainPlayer(d, 'beam'); AUD.beamDrainHp += d;
      // the plane smokes while the beam eats its health
      S.beamSmokeT -= dt;
      while (S.beamSmokeT <= 0) {
        S.beamSmokeT += 0.028; AUD.beamSmoke++;
        const ex = S.px + rand(-0.9, 0.9), gr = rand(0.1, 0.26);
        smokeFx.spawn({ x: ex, y: 0.8, z: rand(-0.5, 0.4), vx: rand(-0.5, 0.5), vy: rand(0.6, 1.2), vz: rand(1.5, 3.2), life: rand(1.0, 1.5), s0: 0.8, s1: rand(2.2, 3.2), r: gr, g: gr * 0.95, b: gr * 1.05, a: 0.85, drag: 0.97 });
        if (Math.random() < 0.4) fx.spawn({ x: ex, y: 0.7, z: rand(-0.4, 0.2), vx: rand(-0.3, 0.3), vy: 0.4, vz: rand(2, 3), life: 0.25, s0: 0.9, s1: 0.2, r: 1, g: 0.45, b: 0.1, a: 1 });
      }
      if (S.hp <= CFG.beamMinHp && S.mode === 'play') { setBeam(false); banner('BEAM OVERHEAT!', 'Fly through blue gates to heal', true, 1.8); }
    }
  }
  if (play && S.primary === 'beam' && planeSprite.visible) {
    const hw = 0.35 + S.tier * 0.12, z0 = -1.3, len = z0 - RANGE_Z, zc = (z0 + RANGE_Z) / 2;
    const pulse = 0.85 + 0.15 * Math.sin(now * 0.04), col = T.beam;
    beamsN.add(S.px, 0.55, zc, hw * 2.4 * pulse, len, 0, col[0], col[1], col[2]);
    beamsN.add(S.px, 0.555, zc, hw * 1.5, len, 0, col[0] * 0.8, col[1] * 0.8, col[2] * 0.9);
    beams.add(S.px, 0.56, zc, hw * 3.6 * pulse, len, 0, col[0] * 0.3, col[1] * 0.3, col[2] * 0.3);
    beams.add(S.px, 0.57, zc, hw * 0.55, len, 0, 0.9, 0.95, 1);
    fx.draw(S.px, 0.6, z0, 1.7 * pulse, col[0], col[1], col[2], 1);
    fx.draw(S.px, 0.6, RANGE_Z, 1.3 * pulse, col[0], col[1], col[2], 0.8);
    S.laserT -= dt; sfx('laser');
    if (AUD.firstShotT < 0) AUD.firstShotT = +S.t.toFixed(3);
    while (S.laserT <= 0) {
      S.laserT += 0.05;
      const tick = T.beamDps * 0.05;
      for (const tg of targets) {
        const t = tg[0]; if (!alive(t, tg[1])) continue;
        if (t.z > z0 || t.z < RANGE_Z || Math.abs(t.x - S.px) > tg[2] * 0.6 + hw) continue;
        damage(t, tg[1], tick, -1, 1);
        if (Math.random() < 0.3) spark(S.px + rand(-0.3, 0.3), tg[1] === 'b' ? rand(1, 3) : 0.7, t.z + 0.3, true, col);
      }
    }
  }
  // bazooka shells (round-2 cannon)
  for (let i = shells.length - 1; i >= 0; i--) {
    const s = shells[i]; const nz = s.z + s.vz * dt;
    let hit = false;
    for (const tg of targets) {
      if (tg[1] === 'g') continue; const t = tg[0];
      if (alive(t, tg[1]) && Math.abs(s.x - t.x) < tg[2] + 0.3 && t.z - tg[3] <= s.z && t.z + tg[3] >= nz) { hit = true; break; }
    }
    s.z = nz;
    if (hit || s.z <= RANGE_Z) {
      explode(s.x, 0.6, s.z, 1.4, true); splash(s.x, s.z, 2.4 + S.tier * 0.3, s.dmg);
      shells.splice(i, 1); continue;
    }
    shellsB.add(s.x, 0.6, s.z, 0.62, 0.95, 0, 1, 1, 1);
    fx.draw(s.x, 0.6, s.z + 0.5, 1.7, FLAME[S.tier][0], FLAME[S.tier][1], FLAME[S.tier][2], 0.9);
    if (Math.random() < 0.6) smokeFx.spawn({ x: s.x, y: 0.6, z: s.z + 0.5, vx: rand(-0.3, 0.3), vy: 0.4, vz: 0, life: 0.8, s0: 0.5, s1: 1.6, r: 0.45, g: 0.43, b: 0.42, a: 0.5, world: true });
  }
  // homing rockets (round-2 missiles), bigger with a hotter flame at higher tiers
  const rs = 1 + S.tier * 0.15, fl = FLAME[S.tier];
  for (let i = missiles.length - 1; i >= 0; i--) {
    const m = missiles[i];
    if (m.delay > 0) { m.delay -= dt; continue; }
    m.life -= dt;
    const ok = m.t && (m.t === boss ? boss && boss.state !== 'dying' && boss.state !== 'enter' : (bugs.includes(m.t) || pods.includes(m.t)));
    const tx = ok ? m.t.x : m.x + m.vx * 0.1, tz = ok ? m.t.z : m.z - 10;
    const dx = tx - m.x, dzz = tz - m.z, d = Math.hypot(dx, dzz) || 1;
    const sp = 24; m.vx = lerp(m.vx, dx / d * sp, 1 - Math.exp(-dt * 4)); m.vz = lerp(m.vz, dzz / d * sp, 1 - Math.exp(-dt * 4));
    m.x += m.vx * dt; m.z += m.vz * dt;
    smokeFx.spawn({ x: m.x - m.vx / sp * 0.7, y: m.y, z: m.z - m.vz / sp * 0.7, vx: rand(-0.3, 0.3), vy: 0.3, vz: 0, life: 0.75, s0: 0.35, s1: 1.15, r: 0.92, g: 0.92, b: 0.95, a: 0.6, world: true });
    fx.draw(m.x - m.vx / sp * 0.75, m.y, m.z - m.vz / sp * 0.75, 1.3 * rs, fl[0], fl[1], fl[2], 1);
    rocketsB.add(m.x, m.y, m.z, 0.45 * rs, 1.35 * rs, Math.atan2(-m.vx, -m.vz), 1, 1, 1);
    if ((ok && d < (m.t === boss ? 2.2 : 0.8)) || m.life <= 0 || m.z < RANGE_Z - 4) {
      explode(m.x + m.vx / sp * 0.7, 0.6, m.z + m.vz / sp * 0.7, 1.0 * rs, false); sfx('pop'); splash(m.x, m.z, 1.9 * rs, 16 * (1 + S.tier * 0.5));
      missiles.splice(i, 1);
    }
  }

  // acid blobs lobbed by spitters (they land where you were: keep moving)
  for (let i = acids.length - 1; i >= 0; i--) {
    const a = acids[i]; a.t += dt; const k = Math.min(1, a.t / a.T);
    a.x = lerp(a.x0, a.x1, k); a.z = lerp(a.z0, a.z1, k); a.y = 0.5 + Math.sin(k * Math.PI) * a.peak;
    const s = 1 + Math.sin(k * Math.PI) * 0.6;
    fx.draw(a.x, a.y, a.z, 1.5 * s, 0.45, 1, 0.2, 0.9); fx.draw(a.x, a.y, a.z, 0.6 * s, 0.9, 1, 0.7, 1);
    if (Math.random() < 0.5) smokeFx.spawn({ x: a.x, y: a.y, z: a.z, vx: 0, vy: -0.3, vz: 0, life: 0.4, s0: 0.45, s1: 0.15, r: 0.35, g: 0.85, b: 0.15, a: 0.7 });
    if (k >= 1) {
      for (let n = 0; n < 14; n++) smokeFx.spawn({ x: a.x, y: 0.5, z: a.z, vx: rand(-3, 3), vy: rand(1, 4), vz: rand(-2, 2), life: rand(0.3, 0.6), s0: 0.4, s1: 0.1, r: 0.4, g: 0.95, b: 0.2, a: 1, grav: 10 });
      if (play) {
        let hitW = -1;
        wingmen.forEach((w, j) => { if (Math.abs(w.x - a.x) < 0.8 && Math.abs(w.z - a.z) < 0.9) hitW = j; });
        if (hitW >= 0) damageWingman(hitW, 6);
        if (Math.abs(S.px - a.x) < 1.0 && Math.abs(a.z) < 1.0) hurtPlayer(22, 'acid');
      }
      acids.splice(i, 1);
    }
  }
  // the Queen's acid volleys (round 2): straight down the marked strip
  for (let i = drops.length - 1; i >= 0; i--) {
    const a = drops[i]; a.z += a.vz * dt; a.y = Math.max(0.3, a.y - dt * 2);
    fx.draw(a.x, a.y, a.z, 1.4, 0.55, 1, 0.25, 0.9);
    fx.draw(a.x, a.y, a.z, 0.6, 1, 1, 0.8, 1);
    if (Math.random() < 0.4) smokeFx.spawn({ x: a.x, y: a.y, z: a.z, vx: 0, vy: 0.2, vz: 0, life: 0.4, s0: 0.5, s1: 0.2, r: 0.4, g: 0.8, b: 0.2, a: 0.6 });
    if (play && a.z > -1 && a.z < 1.2) {
      let hitW = -1;
      wingmen.forEach((w, j) => { if (Math.abs(w.x - a.x) < 0.7 && Math.abs(w.z - a.z) < 0.8) hitW = j; });
      if (hitW >= 0) { damageWingman(hitW, 10); drops.splice(i, 1); continue; }
      if (Math.abs(S.px - a.x) < 1.0 && Math.abs(a.z) < 0.8) { hurtPlayer(18, 'acid'); drops.splice(i, 1); continue; }
    }
    if (a.z > 5) drops.splice(i, 1);
  }
  // Kingsting's stinger volleys (dormant boss, kept for a later stage)
  for (let i = stings.length - 1; i >= 0; i--) {
    const a = stings[i]; a.x += a.vx * dt; a.z += a.vz * dt;
    const rot = Math.atan2(-a.vx, -a.vz);
    tracers.add(a.x, 0.7, a.z, 0.34, 1.3, rot, 1, 0.18, 0.1); tracers.add(a.x, 0.72, a.z, 0.12, 0.9, rot, 1, 0.8, 0.6);
    fx.draw(a.x, 0.7, a.z, 0.9, 1, 0.2, 0.1, 0.7);
    if (play && a.z > -1 && a.z < 1.2) {
      let hitW = -1;
      wingmen.forEach((w, j) => { if (Math.abs(w.x - a.x) < 0.5 && Math.abs(w.z - a.z) < 0.6) hitW = j; });
      if (hitW >= 0) { damageWingman(hitW, 5); stings.splice(i, 1); continue; }
      if (Math.abs(S.px - a.x) < 0.8 && Math.abs(a.z) < 0.7) { hurtPlayer(20, 'sting'); stings.splice(i, 1); continue; }
    }
    if (a.z > 6 || Math.abs(a.x) > 9) stings.splice(i, 1);
  }
  tracers.end(); bulletsB.end(); rocketsB.end(); shellsB.end(); beams.end(); beamsN.end();

  // splinters and shards
  planksB.begin(); shardsB.begin();
  for (let i = debris.length - 1; i >= 0; i--) {
    const d = debris[i]; d.t += dt; if (d.t > d.life) { debris.splice(i, 1); continue; }
    d.vy -= 14 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.z += (d.vz + v) * dt; d.rot += d.vr * dt;
    const f = 1 - Math.pow(d.t / d.life, 3);
    if (d.glass) shardsB.add(d.x, d.y, d.z, d.sx, d.sz, d.rot, d.c[0] * f, d.c[1] * f, d.c[2] * f);
    else planksB.add(d.x, d.y, d.z, d.sx, d.sz, d.rot, d.c[0], d.c[1], d.c[2]);
  }
  planksB.end(); shardsB.end();

  // ambient: clouds, smoke columns
  for (let i = clouds.length - 1; i >= 0; i--) {
    const c = clouds[i]; c.position.z += gdz;
    if (c.position.z > (c.renderOrder > 0 ? 34 : 30)) { c.parent.remove(c); clouds.splice(i, 1); spawnCloud(rand(-460, -380)); }
  }
  for (let i = smokes.length - 1; i >= 0; i--) {
    const s = smokes[i]; s.position.z += gdz; s.userData.ph += dt;
    s.material.rotation = Math.sin(s.userData.ph * 0.7) * 0.03;
    worldFx.draw(s.position.x, -G + 0.6, s.position.z, 3 + Math.sin(s.userData.ph * 9) * 0.6, 1, 0.5, 0.15, 0.9);
    if (s.position.z > 40) { world.remove(s); smokes.splice(i, 1); spawnSmoke(rand(-460, -400)); }
  }

  // the Queen's attack telegraph: a flashing red strip where the volley will fall
  flats.begin();
  if (boss && boss.type === 'queen' && boss.tele > 0) {
    const a = 0.5 + 0.5 * Math.sin(now * 0.03);
    flats.add(boss.teleX, 0.03, (boss.z + 3) / 2, 4.2, Math.abs(boss.z - 3), 0, 0.9 * a, 0.15 * a, 0.1 * a);
  }
  flats.end();
  ringFx.begin();
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i]; r.t += dt; r.z += dz; if (r.t > 0.45) { rings.splice(i, 1); continue; }
    const k = r.t / 0.45, s = r.s * (0.3 + k); ringFx.add(r.x, 0.1, r.z, s, s * 0.8, 0, (1 - k) * 0.6, (1 - k) * 0.45, (1 - k) * 0.25);
  }
  ringFx.end();

  for (let i = flyIcons.length - 1; i >= 0; i--) { const f = flyIcons[i]; f.t += dt * 1.4; if (f.t >= 1) { flyIcons.splice(i, 1); addShake('pickup'); } }
  updateCoins(dt);
  for (let i = pops.length - 1; i >= 0; i--) { const p = pops[i]; p.t += dt; if (p.t > 0) p.z += dz * 0.2; if (p.t > 1.1) pops.splice(i, 1); }
  for (let i = tips.length - 1; i >= 0; i--) { const t = tips[i]; t.t += dt; if (t.t > t.dur) tips.splice(i, 1); }
  if (upRing) { upRing.t += dt; if (upRing.t > 0.9) upRing = null; }
  weaponFlash = Math.max(0, weaponFlash - dt * 1.6);

  fx.update(dt, v); smokeFx.update(dt, v); worldFx.update(dt, v);

  if (S.mode === 'dead' || S.mode === 'win') { S.endT -= dt / Math.max(slowmo, 0.3); if (S.endT <= 0 && !S.ended) { S.ended = true; endGame(S.mode === 'win'); } }
  if (play) $('progfill').style.width = clamp(S.t / BOSS_T * 100, 0, 100) + '%';
  if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) $('banner').className = ''; }
  trauma = Math.max(0, trauma - dt * CFG.shake.decay);
  if (S.omegaT > 0) trauma = Math.max(trauma, CFG.shake.omegaRumble);   // Omega: a continuous earthquake under everything
  flashRed = Math.max(0, flashRed - dt * 2.5); omegaFlash = Math.max(0, omegaFlash - dt * 1.4);
}
function lob(x0, z0, x1, T) {
  acids.push({ x0, z0, x1: clamp(x1, -4, 4), z1: 0.2, t: 0, T, peak: 3.2, x: x0, z: z0, y: 0.5 });
}


// ---------------------------------------------------------------- hunters: clinging (round 5)
let PLANE_AR = 198 / 320;   // plane sprite aspect, set from the texture at boot
// where bugs grab the main plane (x, z offsets from its centre): wings, tail, nose
const PLANE_LATCH = [[-0.95, 0.2], [0.95, 0.2], [-0.5, 0.85], [0.5, 0.85], [-1.4, 0.45], [1.4, 0.45], [0, 0.95], [-1.25, -0.2], [1.25, -0.2]];
function assignHost(s) {
  const usedP = new Set(), usedW = new Set();
  for (const b of bugs) if (b !== s && b.host && (b.state === 'hunt' || b.state === 'latch')) { if (b.host === 'plane') usedP.add(b.slot); else usedW.add(b.host); }
  let best = null, bd = 1e9, slot = -1;
  PLANE_LATCH.forEach(([ox, oz], k) => { if (usedP.has(k)) return; const d = Math.hypot(S.px + ox - s.x, oz - s.z) * 0.8; if (d < bd) { bd = d; best = 'plane'; slot = k; } });
  for (const w of wingmen) { if (usedW.has(w) || w.delay > 0) continue; const d = Math.hypot(w.x - s.x, w.z - s.z); if (d < bd) { bd = d; best = w; slot = -1; } }
  if (!best) { best = 'plane'; slot = -2; s.orbit = rand(0, TAU); }   // everything taken: circle the squad and wait
  s.host = best; s.slot = slot; s.lx = rand(-0.25, 0.25); s.lz = -0.42;
}
function hostPos(s) {
  if (s.host === 'plane') {
    if (s.slot >= 0) { const [ox, oz] = PLANE_LATCH[s.slot]; return [S.px + ox, oz]; }
    s.orbit = (s.orbit || 0) + 0.02; return [S.px + Math.cos(s.orbit) * 3.2, -1.6 + Math.sin(s.orbit) * 1.2];
  }
  if (s.host) return [s.host.x + s.lx, s.host.z + s.lz];
  return [S.px, -1.5];
}
function latchOn(s) {
  s.state = 'latch'; s.grip = CFG.grip; AUD.latchTotal++;
  s.sprite.renderOrder = s.host === 'plane' ? 3.5 : 2.5;
  if (s.host === 'plane') { drainPlayer(BUG[s.type].pdmg, 'bug'); sfx('hurt'); flashRed = Math.max(flashRed, 0.5); }
  else { s.host.hp -= BUG[s.type].ddmg * 0.5; s.host.barT = 1.6; }
}
function flingOff(s, i) {
  s.state = 'fling'; s.stun = 0.7; s.host = null; s.sprite.renderOrder = 1; AUD.flung++;
  s.vx = Math.sign(s.x - S.px || 1) * rand(5, 8) + S.vx * 0.25; s.vz = -rand(6, 9);
  pop('SHAKEN OFF!', s.x, 1.6, s.z, '#ffffff', 0.55, '#0b2440', 0, true);
  damage(s, 's', s.max * 0.3, i);
}

// ---------------------------------------------------------------- beam gesture (round 5)
function setBeam(on, quiet) {
  if (on && !S.beamOwned) return false;
  if (on === S.beamOn) return false;
  if (on && S.hp <= CFG.beamMinHp + 2) { banner('TOO DAMAGED', 'Heal at a blue gate first', true, 1.2); return false; }
  S.beamOn = on; S.primary = on ? 'beam' : 'gun'; S.beamT = 0; S.beamSmokeT = 0;
  if (!quiet) { if (on) { AUD.beamOn++; sfx('beamOn'); weaponFlash = 0.6; } else { AUD.beamOff++; sfx('beamOff'); } }
  tips = tips.filter((t) => !(on && t.arrow === -1) && !(!on && t.arrow === 1));
  updateWeaponHud(); return true;
}

// ---------------------------------------------------------------- Omega Beam (round 5; ORB_TIERS.omega is active)
function omegaGain(a) {
  if (S.mode !== 'play' || S.omega >= 1 || a <= 0) return;
  S.omega = Math.min(1, S.omega + a);
  if (S.omega >= 1) {
    sfx('charge'); pop(ORB_TIERS[ORB_TIER].name + ' READY!', S.px, 2.4, -2.2, '#e8d0ff', 0.8, '#2a0a4a', 0, true);
    if (!S.omegaHint) { S.omegaHint = true; tips.push({ text: 'Tap the plane to fire OMEGA!', target: 'plane', t: 0, dur: 3.5 }); }
  }
}
function collectOmegaOrb(p) {
  AUD.orbs++; omegaGain(p.reward.omega || 0.34); addShake('pickup'); sfx('orb');
  burst(p.x, p.z, 'omega', 18);
  for (let k = 0; k < 30; k++) { const a = rand(0, TAU), sp = rand(2, 6); fx.spawn({ x: p.x, y: 0.7, z: p.z, vx: Math.cos(a) * sp, vy: rand(0, 2), vz: Math.sin(a) * sp, life: rand(0.3, 0.6), s0: 0.7, s1: 0.1, r: 0.85, g: 0.7, b: 1, a: 1, world: true }); }
  pop('+OMEGA', p.x, 1.8, p.z, '#e6c8ff', 0.9, '#2a0a4a', 0, true);
}
function fireOmega() {
  if (S.mode !== 'play' || S.omega < 1 || S.omegaT > 0 || !planeSprite.visible) return false;
  S.omega = 0; S.omegaT = CFG.omegaTime; S.omegaTick = 0; AUD.omegaFires++; S.lullUntil = S.t + CFG.omegaTime + CFG.filler.lull;
  omegaFlash = 1; addShake('omega'); buzz([90, 40, 90, 40, 90, 40, 90, 40, 160]); sfx('omega'); banner(ORB_TIER.toUpperCase() + ' BEAM!', '', false, 1.2);
  omegaStrike(1);
  return true;
}
// round 8: the Omega Beam reaches the top edge of the screen and hits EVERYTHING visible that its cone touches
// (Xora, the boss, crates, canisters, orbs, gates, the cocoon and its carrier), plus a blast around the nose that
// knocks clingers off. The footprint is the drawn cone: 34 px wide at the nose, 1.5x the screen width at the top.
function omegaTouches(x, y, z, rw) {
  const [sx, sy] = toScreen(x, y, z), rp = rw * unitPx(x, y, z), [nx, ny] = toScreen(S.px, 0.6, -1.3);
  if (sy < -rp || sy > H + rp || sx < -rp || sx > W + rp) return false;   // only what is on screen
  if (Math.hypot(sx - nx, sy - ny) < 130 + rp) return sy;                  // the nose blast
  if (sy > ny) return false;
  const hw = lerp(W * 0.75, 34, clamp(sy / Math.max(1, ny), 0, 1));
  return Math.abs(sx - nx) <= hw + rp ? Math.max(sy, 0.0001) : false;
}
function omegaLog(kind, sy) { if (sy === false) return false; const f = sy / H, A = AUD.omegaHit || (AUD.omegaHit = { n: 0, topY: 1, topKind: '', byKind: {} }); A.n++; A.byKind[kind] = (A.byKind[kind] || 0) + 1; if (f < A.topY) { A.topY = +f.toFixed(4); A.topKind = kind; } return true; }
function omegaStrike(mul) {
  let n = 0;
  for (let j = bugs.length - 1; j >= 0; j--) { const s = bugs[j]; if (!s) continue; if (s.state === 'latch' || omegaLog('xora:' + s.type, omegaTouches(s.x, 0.4, s.z, s.r))) { damage(s, 's', CFG.omegaDmg * mul, j); n++; } }
  for (let j = pods.length - 1; j >= 0; j--) { const p = pods[j]; if (p && p.z < -0.8 && omegaLog('pod:' + p.kind, omegaTouches(p.x, 0.5, p.z, p.w * 0.42))) damage(p, 'p', CFG.omegaDmg * mul, j); }
  for (const c of cocoons.slice()) {
    if (c.carrier.alive && omegaLog('carrier', omegaTouches(c.carrier.x, 1.2, c.carrier.z, CFG.carrierW * 0.46 * (c.carrier.ks || 1)))) hitCarrier(c.carrier, CFG.omegaDmg * mul);
    if (c.stage < 2 && omegaLog('cocoon', omegaTouches(c.x, 0.6, c.z, CFG.cocoonW * 0.36))) hitCocoon(c, CFG.omegaDmg * mul);
  }
  for (const g of gates) if (!g.passed && g.z < -1 && omegaLog('gate', omegaTouches(g.x, 0.6, g.z, GATE_W / 2))) hitGate(g, Math.round(150 * mul));
  if (boss && boss.state !== 'enter' && boss.state !== 'dying' && omegaLog('boss', omegaTouches(boss.x, 1.5, boss.z, boss.hitW))) { damage(boss, 'b', CFG.omegaBossDmg * mul); if (mul >= 1) pop(String(Math.round(CFG.omegaBossDmg * mul)), boss.x, 3, boss.z, '#f0d8ff', 1.3, '#2a0a4a', 0, true); }
  AUD.omegaHits += n;
}
let hudBeamKey = '';
function updateOmega(dt, now) {
  const full = S.omega >= 1, el = $('omega');
  $('omegafill').style.width = (S.omega * 100).toFixed(1) + '%';
  if (el.classList.contains('full') !== full) el.classList.toggle('full', full);
  const nz = -1.2;
  if (S.mode === 'play' && full && planeSprite.visible) {
    // charged: energy is drawn into the plane's nose, which glows
    if (Math.random() < dt * 70) orbFx.push({ a: rand(0, TAU), r: rand(1.8, 3.2), t: 0, life: rand(0.35, 0.6), s: rand(0.3, 0.6) });
    const p = 0.5 + 0.5 * Math.sin(now * 0.018);
    fx.draw(S.px, 0.62, nz, 2.2 + p * 0.8, 0.7, 0.45, 1, 0.9); fx.draw(S.px, 0.63, nz, 0.9 + p * 0.3, 1, 1, 1, 1);
  }
  for (let i = orbFx.length - 1; i >= 0; i--) {
    const o = orbFx[i]; o.t += dt; if (o.t >= o.life) { orbFx.splice(i, 1); continue; }
    const k = o.t / o.life, r = o.r * Math.pow(1 - k, 1.6), a = o.a + k * 2.2;
    fx.draw(S.px + Math.cos(a) * r, 0.62, nz + Math.sin(a) * r * 0.75, o.s * (0.6 + k), 0.8, 0.6, 1, Math.min(1, k * 3));
  }
  if (S.omegaT > 0) {
    S.omegaT -= dt; S.omegaTick -= dt;
    if (S.omegaT <= 0) { addShake('omegaEnd'); buzz(120); }   // the rumble ends with a burst
    if (S.omegaTick <= 0 && S.omegaT > 0.25) { S.omegaTick = 0.12; omegaStrike(0.08); }
    for (let k = 0; k < 6; k++) { const z = rand(TOP_Z, -1.5), hw = hwAt(z) + 1; fx.spawn({ x: S.px + rand(-hw, hw) * 0.8, y: rand(0.3, 1.5), z, vx: 0, vy: rand(1, 3), vz: 0, life: 0.35, s0: 1.1, s1: 0.1, r: 0.9, g: 0.75, b: 1, a: 1 }); }
  }
  if (S.beamOn || S.beamOwned) { const key = S.beamOn ? (S.beamT > CFG.beamGrace ? 'd' : Math.ceil(CFG.beamGrace - S.beamT)) : 'off'; if (key !== hudBeamKey) { hudBeamKey = key; updateWeaponHud(); } }
}

// ---------------------------------------------------------------- cocoon rescue (round 5)
// A carrier bug flies in from the side with a cocoon (the bug on top), then holds station ahead of the plane.
// Shoot the cocoon: at half HP it cracks, at 0 it breaks (amber shards), the pilot is freed and brings drones.
function spawnCocoon(e) {
  const hz = Math.max(RANGE_Z + 6, CFG.cocoonHoldZ), side = e.side || -1;
  const hw = (W / 2) / unitPx(0, 0.6, hz);
  const sx = side * (hw + CFG.carrierW * 0.9), sz = hz - 1.2;
  const c = { x: sx, z: sz, hx: e.x, hz, hp: e.hp, max: e.hp, stage: 0, state: 'in', t: 0, holdT: 0, flash: 0, jolt: 0, ph: 0, side, brokenT: 0,
    reward: { drones: e.drones || 8, pilot: true }, sprite: sprite(TEX.cocoon_intact, CFG.cocoonW, 0.5, 0.5, 1.3) };
  c.carrier = { hp: 70, max: 70, alive: true, flash: 0, ph: 0, barT: 0, x: sx, z: sz - 1, sprite: sprite(TEX.wasp, CFG.carrierW, 0.5, 0.5, 1.45) };
  cocoons.push(c);
  AUD.carriers.push({ t: +S.t.toFixed(2), spawnX: +sx.toFixed(2), halfWidth: +hw.toFixed(2), startsOffscreen: Math.abs(sx) - CFG.carrierW / 2 > hw });
  AUD.cocoon.push({ ev: 'spawn', t: +S.t.toFixed(2) });
  pop('PILOT IN DANGER!', 0, 2.5, -6.5, '#ff6a5a', 0.85, '#3a0b0b', 0, true); tips.push({ text: 'Free the pilot!', target: 'cocoon', t: -1.2, dur: 2.6 }); sfx('warn');
}
function setCocoonTex(c, name) {
  const t = TEX[name]; c.sprite.material.map = t; c.sprite.material.needsUpdate = true;
  c.sprite.scale.set(CFG.cocoonW, CFG.cocoonW * t.image.height / t.image.width, 1);
}
function hitCocoon(c, dmg) {
  if (c.stage >= 2) return;
  c.hp -= dmg; c.flash = 1; c.jolt = 1;
  if (c.stage === 0 && c.hp <= c.max * 0.5) {
    c.stage = 1; setCocoonTex(c, 'cocoon_cracked'); sfx('crack'); burst(c.x, c.z, 'amber', 10);
    AUD.cocoon.push({ ev: 'cracked', t: +S.t.toFixed(2), hp: Math.round(c.hp) });
  }
  if (c.hp <= 0) {
    c.hp = 0; c.stage = 2; c.state = 'broken'; setCocoonTex(c, 'cocoon_broken'); sfx('glass'); sfx('crack');
    burst(c.x, c.z, 'amber', 34); explode(c.x, 0.9, c.z, 0.9, false, [1, 0.7, 0.15]); addShake('pickup');
    for (let k = 0; k < 40; k++) { const a = rand(0, TAU), sp = rand(2, 7); fx.spawn({ x: c.x, y: 0.9, z: c.z, vx: Math.cos(a) * sp, vy: rand(1, 4), vz: Math.sin(a) * sp, life: rand(0.3, 0.7), s0: 0.6, s1: 0.1, r: 1, g: 0.75, b: 0.2, a: 1, world: true }); }
    pilots.push({ x: c.x, z: c.z, t: 0, reward: c.reward });
    AUD.cocoon.push({ ev: 'broken', t: +S.t.toFixed(2) });
    const K = c.carrier;
    if (K.alive) {   // the carrier is now just an angry hunter
      K.alive = false; scene.remove(K.sprite);
      const b = newBug(K.x, K.z, 'wasp', Math.max(10, K.hp), 'carrier'); b.seen = true; b.state = 'hunt';
    }
  }
}
function hitCarrier(K, dmg) {
  if (!K.alive) return;
  K.hp -= dmg; K.flash = 1; K.barT = 1.4;
  if (K.hp <= 0) {
    K.alive = false; explode(K.x, 0.9, K.z, 1.3, true, [0.75, 0.1, 0.08]); addShake('medium'); scene.remove(K.sprite); S.kills++; awardKill('carrier', K.x, K.z);
    AUD.cocoon.push({ ev: 'carrierDown', t: +S.t.toFixed(2) });
  }
}
function updateCocoons(dt, dz) {
  for (let i = cocoons.length - 1; i >= 0; i--) {
    const c = cocoons[i], K = c.carrier; c.t += dt; c.ph += dt;
    c.flash = Math.max(0, c.flash - dt * 8); c.jolt = Math.max(0, c.jolt - dt * 10);
    if (c.state === 'in') {   // glide in from the side to the hold spot; it keeps pace with the plane (no scrolling)
      const k = 1 - Math.exp(-dt * 1.9); c.x = lerp(c.x, c.hx, k); c.z = lerp(c.z, c.hz, k);
      if (Math.abs(c.x - c.hx) < 0.2) { c.state = 'hold'; AUD.cocoon.push({ ev: 'hold', t: +S.t.toFixed(2), x: +c.x.toFixed(2), z: +c.z.toFixed(2) }); }
    } else if (c.state === 'hold') {
      c.holdT += dt; c.x = lerp(c.x, c.hx + Math.sin(c.ph * 1.3) * 0.12, 1 - Math.exp(-dt * 4)); c.z = lerp(c.z, c.hz + Math.sin(c.ph * 0.9) * 0.1, 1 - Math.exp(-dt * 4));
      if (!K.alive) { c.state = 'drop'; }
      else if (c.holdT > 12) { c.state = 'leave'; AUD.cocoon.push({ ev: 'escaped', t: +S.t.toFixed(2) }); }
    } else if (c.state === 'drop') { c.z += dz * 1.3; }   // no carrier: it drifts back and scrolls past like a pickup
    else if (c.state === 'leave') { c.x += c.side * 7 * dt; c.z -= 1.5 * dt; }
    else if (c.state === 'broken') { c.brokenT += dt; c.z += dz * 1.2; c.sprite.material.opacity = clamp(1.6 - c.brokenT, 0, 1); }
    if (K.alive) {
      K.ph += dt * 30; K.flash = Math.max(0, K.flash - dt * 8); K.barT = Math.max(0, K.barT - dt);
      K.x = c.x; K.z = c.z - 1.0;
      const img = K.sprite.material.map.image, fl = Math.sin(K.ph) * 0.07;
      K.sprite.position.set(K.x, 1.2 + Math.sin(c.ph * 3) * 0.06, K.z); K.ks = CFG.bugScale * persp(K.z); const kw = CFG.carrierW * K.ks;   // round 8: carriers follow the Xora size + perspective scale
      K.sprite.scale.set(kw * (1 + fl), kw * img.height / img.width * (1 - fl * 0.4), 1);
      K.sprite.material.rotation = c.state === 'in' ? -c.side * 0.35 : Math.sin(c.ph * 1.7) * 0.06;
      K.sprite.material.color.setScalar(1 + K.flash * 1.4);
    }
    const jx = (Math.random() - 0.5) * c.jolt * 0.12;
    c.sprite.position.set(c.x + jx, 0.6, c.z); c.sprite.material.rotation = c.state === 'in' ? -c.side * 0.12 : Math.sin(c.ph * 1.1) * 0.05;
    c.sprite.material.color.setScalar(1 + c.flash * 0.7);
    const gone = (c.state === 'broken' && c.brokenT > 1.6) || (c.state === 'drop' && c.z > BOT_Z + 3) || (c.state === 'leave' && Math.abs(c.x) > 14);
    if (gone) {
      if (c.state === 'drop') AUD.cocoon.push({ ev: 'missed', t: +S.t.toFixed(2) });
      scene.remove(c.sprite); if (K.alive) scene.remove(K.sprite); cocoons.splice(i, 1);
    }
  }
}
function updatePilots(dt) {
  for (let i = pilots.length - 1; i >= 0; i--) {
    const p = pilots[i]; p.t += dt / 0.95;
    if (p.t >= 1) { pilots.splice(i, 1); giveReward(p.reward, S.px, -1.5); addShake('pickup'); AUD.cocoon.push({ ev: 'rescued', t: +S.t.toFixed(2), drones: S.drones }); }
  }
}
// the Queen's death: a chain of explosions at random, irregular intervals (quick doubles, normal beats and pauses),
// varied sizes and spots across her body; each one is a sharp shake burst that decays before the next, and the
// final blast is the biggest. About 2.5-3.5 s in total, different every time.
function bossChain(bw) {
  const L = []; let t = 0.04;
  for (;;) {
    const r = Math.random(), gap = r < 0.28 ? rand(0.12, 0.17) : r < 0.8 ? rand(0.2, 0.44) : rand(0.5, 0.6);
    L.push({ t, size: rand(1.1, 2.3), x: rand(-0.46, 0.46) * bw, y: rand(0.5, 3.3), z: rand(-1.2, 1.2) });
    t += gap; if (t > 2.35) break;
  }
  return { list: L, end: clamp(t + 0.22, 2.5, 3.4) };
}

// ---------------------------------------------------------------- bosses
// Mission 1 uses the round-2 Xora Queen. Kingsting (round 3) stays in the table, dormant, for a later stage.
const BOSSES = {
  queen: { name: 'XORA QUEEN', hp: 9000, sub: 'Shoot it down!' },
  stinger: { name: 'KINGSTING', hp: 1000, sub: 'Colossal hornet \u00b7 bring it down!' },
};
const MISSION_BOSS = 'queen';
function spawnBoss(type) {
  $('bossname').textContent = BOSSES[type].name;
  if (type === 'stinger') spawnStinger(); else spawnQueen();
}
function updateBossBar(b) {
  const bb = $('bossbar'); if (bb.classList.contains('hidden')) return;
  const f = b.hp / b.max, el = $('bossfill');
  el.style.width = (f * 100).toFixed(1) + '%'; el.style.background = `linear-gradient(${hpColor(f)}, hsl(${Math.round(clamp(f, 0, 1) * 120)},85%,34%))`;
  $('bosshp').textContent = Math.ceil(b.hp);
}
function spawnQueen() {
  const s = sprite(TEX.boss, 5.6, 0.5, 0.08, 1);
  const hp = Number(Q.get('bosshp') || BOSSES.queen.hp);
  // comes in from far beyond the top edge, then holds station near the top of the screen (round-2 fight)
  boss = { type: 'queen', sprite: s, x: 0, z: -72, hoverZ: Math.max(-15.5, RANGE_Z + 3.5), hp, max: hp, t: 0, state: 'enter', spawnT: 2.5, atkT: 4.5, tele: 0, teleX: 0, flash: 0, volley: 0, volT: 0,
    bw: 5.6, hitW: 3.3, hitD: 1.6, enraged: false };
  sfx('roar');
}
function updateQueen(dt, dz) {
  const b = boss; b.t += dt; b.flash = Math.max(0, b.flash - dt * 8);
  const play = S.mode === 'play';
  if (b.state === 'enter') {
    b.z += dz + 9 * dt;
    if (b.z >= b.hoverZ) {
      b.z = b.hoverZ; b.state = 'fight'; b.t = 0; banner(BOSSES.queen.name, BOSSES.queen.sub, true, 1.8); sfx('roar');
      $('bossbar').classList.remove('hidden');
    }
  } else if (b.state === 'fight') {
    const enr = b.hp < b.max * 0.5;
    if (enr && !b.enraged) { b.enraged = true; sfx('roar');   // round 7: no warning banner (warnings are only for bosses approaching)
      flashRed = 0.6; b.atkT = Math.min(b.atkT, 1.2); }
    b.x = Math.sin(b.t * (enr ? 0.7 : 0.5)) * 1.7;
    b.spawnT -= dt;
    if (b.spawnT <= 0 && play) {
      // brood crawls out from under her body (at the top of the screen)
      b.spawnT = enr ? 3 : 3.8;
      const n = enr ? 6 : 4;
      for (let i = 0; i < n; i++) { const s = newBug(clamp(b.x + rand(-1.8, 1.8), -4, 4), b.z - rand(0.1, 0.6), 'spider', 12, 'boss'); s.vz = 1.5; }
    }
    b.atkT -= dt;
    if (b.atkT <= 0 && b.tele <= 0 && b.volley <= 0 && play) { b.tele = 1.1; b.teleX = clamp(S.px, -2.6, 2.6); sfx('warn'); }
    if (b.tele > 0) { b.tele -= dt; if (b.tele <= 0) { b.volley = enr ? 7 : 5; b.volT = 0; sfx('roar'); } }
    if (b.volley > 0) {
      b.volT -= dt;
      if (b.volT <= 0) {
        b.volT = 0.14; b.volley--;
        for (const o of [-1.2, 0, 1.2]) drops.push({ x: b.teleX + o + rand(-0.2, 0.2), y: 1.6, z: b.z + 1.5, vz: 24 });
        if (b.volley <= 0) b.atkT = enr ? 3.2 : 4.4;
      }
    }
  } else if (b.state === 'dying') {
    // an irregular rolling chain of bombs (bossChain), each with its own decaying shake burst, then the final blast
    b.x += Math.sin(b.t * 40) * 0.05; if (b.t > 0.25) slowmo = 1;
    if (!b.chain) { b.chain = bossChain(b.bw); AUD.bossChainEnd = +b.chain.end.toFixed(2); }
    while (b.bombI < b.chain.list.length && b.t >= b.chain.list[b.bombI].t) {
      const k = b.chain.list[b.bombI++];
      explode(b.x + k.x, k.y, b.z + k.z, k.size, true, [0.75, 0.1, 0.08]);
      burst(b.x + k.x, b.z + k.z, 'green', Math.round(3 + k.size * 3)); addShake('bomb', k.size / 1.75); buzz(Math.round(20 + k.size * 16));
      AUD.bombs = (AUD.bombs || 0) + 1; AUD.bossChain.push({ t: +b.t.toFixed(2), size: +k.size.toFixed(2), shake: +(trauma * trauma).toFixed(3) });
    }
    if (b.t > b.chain.end) {
      explode(b.x, 1.5, b.z, 4.4, true, [0.75, 0.1, 0.08]); addShake('bossFinal'); buzz([140, 60, 260]); flashRed = 0; omegaFlash = 0.5;
      AUD.bossChain.push({ t: +b.t.toFixed(2), size: 4.4, shake: +(trauma * trauma).toFixed(3), final: true });
      S.coins += CFG.coins.queen; S.killCoins += CFG.coins.queen; S.killsBy.queen = 1; AUD.coins.queen = CFG.coins.queen; S.kills++;
      spawnCoins('coin', 40, CFG.coins.queen, b.x, 1.5, b.z, 1.6);
      scene.remove(b.sprite); boss = null; slowmo = 1; $('bossbar').classList.add('hidden');
      for (const s of bugs) { explode(s.x, 0.4, s.z, 0.8, false); scene.remove(s.sprite); }
      bugs = []; drops = []; acids = [];
      S.mode = 'win'; S.endT = 2.4; sfx('win'); banner('QUEEN DOWN!', 'Beacon is in sight', false, 2.4);
      return;
    }
  }
  const sp = b.sprite, img = sp.material.map.image, w0 = b.bw;
  const breathe = Math.sin(b.t * 3) * 0.03;
  sp.position.set(b.x, 0.3 + Math.abs(Math.sin(b.t * 5)) * 0.1, b.z);
  sp.scale.set(w0 * (1 + breathe), w0 * img.height / img.width * (1 - breathe), 1);
  sp.material.rotation = Math.sin(b.t * 2.5) * 0.04;
  sp.material.color.setScalar(1 + b.flash * 0.7 + (b.tele > 0 ? 0.25 * (0.5 + 0.5 * Math.sin(b.t * 40)) : 0));
  updateBossBar(b);
}

// ---- Kingsting (round 3), dormant: not used in Mission 1
function spawnStinger() {
  const hoverZ = RANGE_Z + 3.2;
  // Kingsting: no art yet, so the wasp scaled up to ~40% of the screen width, tinted red and glowing
  const upx = unitPx(0, 0, hoverZ);
  const bw = clamp(0.42 * W / upx, 3.6, 6.5);
  const s = sprite(TEX.wasp, bw, 0.5, 0.3, 1.5); s.material.color.setRGB(1.25, 0.62, 0.55);
  const glow = sprite(T_GLOW, bw * 1.5, 0.5, 0.5, 1.4); glow.material.blending = THREE.AdditiveBlending; glow.material.color.setRGB(1, 0.2, 0.08); glow.material.opacity = 0.7;
  const hp = Number(Q.get('bosshp') || 1000);
  boss = { type: 'stinger', sprite: s, glow, hitW: bw * 0.36, hitD: 1.5, x: 0, z: -70, hoverZ, bw, hp, max: hp, t: 0, state: 'enter', flash: 0, broodT: 2.2, atkT: 3.0, atk: 0, tele: 0, chargeX: 0, cz: 0, enraged: false };
  sfx('roar');
}
function updateStinger(dt, dz) {
  const b = boss; b.t += dt; b.flash = Math.max(0, b.flash - dt * 8);
  const play = S.mode === 'play';
  const bb = $('bossbar');
  if (b.state === 'enter') {
    b.z += dz + 8 * dt; b.x = lerp(b.x, 0, dt * 2);
    if (b.z >= b.hoverZ) {
      b.z = b.hoverZ;
      if (!b.arrived) { b.arrived = true; banner('KINGSTING', 'Colossal hornet \u00b7 bring it down!', true, 2); sfx('roar'); bb.classList.remove('hidden'); flashRed = 0.4; }
      b.state = 'fight'; b.t = 0;
    }
  } else if (b.state === 'fight' || b.state === 'tele') {
    const enr = b.hp < b.max * 0.5;
    if (enr && !b.enraged) { b.enraged = true; banner('ENRAGED!', 'Kingsting charges faster', true, 1.4); sfx('roar'); flashRed = 0.5; }
    // hovers in place at the top of the screen
    b.x = lerp(b.x, Math.sin(b.t * 0.55) * 0.4, 1 - Math.exp(-dt * 3)); b.z = b.hoverZ + Math.sin(b.t * 1.4) * 0.2;
    b.broodT -= dt;
    if (b.broodT <= 0 && play) {
      b.broodT = enr ? 2.8 : 3.5;
      const n = enr ? 6 : 4;
      for (let i = 0; i < n; i++) { const s = newBug(clamp(b.x + rand(-b.bw * 0.4, b.bw * 0.4), -4, 4), b.z + rand(0.5, 1.5), 'spider', 5); s.vz = 2; }
    }
    if (b.state === 'tele') {
      b.tele -= dt;
      if (b.tele <= 0) {
        if (b.atkType === 'charge') { b.state = 'charge'; b.cz = b.z; sfx('roar'); }
        else { b.state = 'fight'; if (b.atkType === 'sting') stingVolley(b, enr); else for (const o of [-1.7, 0, 1.7]) lob(b.x + o * 0.5, b.z + 1, S.px + o, 1.6); }
      }
    } else {
      b.atkT -= dt;
      if (b.atkT <= 0 && play) {
        const seq = b.hp < b.max * 0.7 ? ['sting', 'charge', 'acid', 'sting', 'charge', 'acid'] : ['sting', 'acid'];
        b.atkType = seq[b.atk++ % seq.length];
        b.state = 'tele'; b.tele = b.atkType === 'charge' ? 1.35 : 0.55;
        if (b.atkType === 'charge') { b.chargeX = clamp(S.px, -3, 3); sfx('warn'); }
        b.atkT = b.atkType === 'charge' ? (enr ? 3.2 : 4) : (enr ? 2.3 : 3);
      }
    }
  } else if (b.state === 'charge') {
    // telegraphed dive straight down the committed line, then back to the top
    b.x = lerp(b.x, b.chargeX, 1 - Math.exp(-dt * 10)); b.z += (b.enraged ? 34 : 28) * dt;
    const half = b.bw * 0.3;
    if (play) {
      for (let j = wingmen.length - 1; j >= 0; j--) { const w = wingmen[j]; if (Math.abs(w.x - b.x) < half && Math.abs(w.z - b.z) < 0.9) damageWingman(j, 10); }
      if (Math.abs(S.px - b.x) < half + 0.5 && Math.abs(b.z) < 1) hurtPlayer(45, 'boss');
    }
    if (Math.random() < dt * 30) smokeFx.spawn({ x: b.x + rand(-1, 1), y: 1, z: b.z - 1, vx: 0, vy: 0.5, vz: -2, life: 0.6, s0: 1, s1: 2.4, r: 0.5, g: 0.2, b: 0.15, a: 0.4, world: true });
    if (b.z > 9) { b.state = 'return'; b.z = -40; b.x = rand(-1, 1); }
  } else if (b.state === 'return') {
    b.z += 18 * dt; b.x = lerp(b.x, 0, dt * 2);
    if (b.z >= b.hoverZ) { b.z = b.hoverZ; b.state = 'fight'; }
  } else if (b.state === 'dying') {
    b.x += Math.sin(b.t * 40) * 0.05;
    if (Math.random() < dt * 14) explode(b.x + rand(-b.bw * 0.4, b.bw * 0.4), rand(0.5, 3.5), b.z + rand(-1, 1), rand(1, 1.8), Math.random() < 0.5, [0.75, 0.1, 0.08]);
    if (Math.random() < dt * 4) addShake('bomb', 0.6);
    if (b.t > 1.9) {
      explode(b.x, 1.5, b.z, 4, true, [0.75, 0.1, 0.08]); addShake('bossFinal');
      burst(b.x, b.z, 'green', 20);
      scene.remove(b.sprite); scene.remove(b.glow); boss = null; slowmo = 1; bb.classList.add('hidden');
      for (const s of bugs) { explode(s.x, 0.4, s.z, 0.8, false); scene.remove(s.sprite); }
      bugs = []; acids = []; stings = [];
      S.mode = 'win'; S.endT = 2.6; sfx('win'); banner('KINGSTING DOWN!', 'Beacon is in sight', false, 2.4);
      return;
    }
  }
  const sp = b.sprite, img = sp.material.map.image, w0 = b.bw;
  const flap = Math.sin(b.t * 38) * 0.035, tele = b.state === 'tele' ? 0.5 + 0.5 * Math.sin(b.t * 40) : 0;
  sp.position.set(b.x + (b.state === 'tele' && b.atkType === 'charge' ? Math.sin(b.t * 60) * 0.08 : 0), 0.9, b.z);
  sp.scale.set(w0 * (1 + flap), w0 * img.height / img.width * (1 - flap * 0.5), 1);
  sp.material.rotation = b.state === 'charge' ? 0 : Math.sin(b.t * 1.7) * 0.05;
  const f = 1 + b.flash * 0.6 + tele * 0.4; sp.material.color.setRGB(1.25 * f, 0.62 * f, 0.55 * f);
  b.glow.position.set(b.x, 0.8, b.z - 0.3); const gs = w0 * (1.45 + Math.sin(b.t * 4) * 0.08 + tele * 0.3); b.glow.scale.set(gs, gs, 1);
  b.glow.material.opacity = 0.6 + Math.sin(b.t * 5) * 0.12 + tele * 0.3;
  if (bb && !bb.classList.contains('hidden')) { $('bossfill').style.width = (b.hp / b.max * 100).toFixed(1) + '%'; $('bosshp').textContent = Math.ceil(b.hp); }
}
function stingVolley(b, enr) {
  const n = enr ? 7 : 5, spread = enr ? 0.5 : 0.4;
  const dx = S.px - b.x, dzz = 0 - (b.z + 1), base = Math.atan2(dx, dzz);
  for (let i = 0; i < n; i++) {
    const a = base + (i / (n - 1) - 0.5) * 2 * spread, sp = 10.5;
    stings.push({ x: b.x + Math.sin(a) * 1.2, z: b.z + 1, vx: Math.sin(a) * sp, vz: Math.cos(a) * sp });
  }
  sfx('sting');
}

// ---------------------------------------------------------------- overlay (2D)
const proj = new THREE.Vector3();
function toScreen(x, y, z) {
  proj.set(x, y, z).project(camera);
  return [(proj.x * 0.5 + 0.5) * W, (1 - (proj.y * 0.5 + 0.5)) * H, proj.z];
}
function unitPx(x, y, z) { const a = toScreen(x, y, z)[0], b = toScreen(x + 1, y, z)[0]; return Math.abs(b - a); }
// screen position of a point on a camera-facing sprite, given in image fractions (0,0 = top left)
function onSprite(s, fx_, fy) {
  const [x, y] = toScreen(s.position.x, s.position.y, s.position.z); const u = unitPx(s.position.x, s.position.y, s.position.z);
  const dx = (fx_ - s.center.x) * s.scale.x * u, dy = (fy - (1 - s.center.y)) * s.scale.y * u, r = -(s.material.rotation || 0);
  return [x + dx * Math.cos(r) - dy * Math.sin(r), y + dx * Math.sin(r) + dy * Math.cos(r), u];
}
// chunky comic text (Luckiest Guy, vendored in fonts/): thick dark outline, gold (or tinted) gradient fill
const COMIC = 'LuckiestG, Lilita, ' + FONT;
function comic(s, x, y, size, color = '#ffd84a', stroke = '#3a1d00') {
  ctx.font = `${size}px ${COMIC}`; ctx.lineJoin = 'round'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = Math.max(3, size * 0.32); ctx.strokeStyle = stroke; ctx.strokeText(s, x, y + size * 0.07);
  ctx.strokeText(s, x, y);
  const gold = color === '#ffd84a' || color === '#ffe066';
  const g = ctx.createLinearGradient(0, y - size * 0.45, 0, y + size * 0.4);
  if (gold) { g.addColorStop(0, '#fffbd6'); g.addColorStop(0.42, '#ffd84a'); g.addColorStop(0.75, '#ffab1a'); g.addColorStop(1, '#e27700'); }
  else { g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, color); g.addColorStop(1, color); }
  ctx.fillStyle = g; ctx.fillText(s, x, y);
}
// round 7: a cartoon speech bubble 'HELP!' over the trapped pilot's cocoon (bobbing, pops in, gone once freed)
function helpBubble(c) {
  c.helpT = (c.helpT || 0) + 1 / 60; const now = performance.now() / 1000;
  const [x0, y0, u] = onSprite(c.sprite, 0.62, -0.02), k = Math.min(1, c.helpT / 0.3), sc = easeBack(k) * (1 + 0.05 * Math.sin(now * 9));
  const bw = Math.max(62, u * 2.5), bh = bw * 0.52, x = x0 + bw * 0.22, y = y0 - bh * 0.75 + Math.sin(now * 4.2) * u * 0.14;
  ctx.save(); ctx.translate(x, y); ctx.rotate(-0.07 + Math.sin(now * 3.1) * 0.04); ctx.scale(sc, sc);
  ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(3, bw * 0.055); ctx.strokeStyle = '#2a1200'; ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.ellipse(0, 0, bw / 2, bh / 2, 0, 0, TAU);
  ctx.moveTo(-bw * 0.2, bh * 0.36); ctx.lineTo(-bw * 0.34, bh * 0.86); ctx.lineTo(-bw * 0.02, bh * 0.44);   // tail towards the pilot
  ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowOffsetY = 3; ctx.shadowBlur = 0; ctx.fill(); ctx.shadowColor = 'transparent'; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(0, 0, bw / 2 - ctx.lineWidth * 0.6, bh / 2 - ctx.lineWidth * 0.6, 0, 0, TAU); ctx.fill();   // hide the tail seam
  ctx.fillStyle = 'rgba(255,255,255,1)'; ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.ellipse(-bw * 0.2, -bh * 0.22, bw * 0.12, bh * 0.08, -0.4, 0, TAU); ctx.fillStyle = '#dff2ff'; ctx.fill(); ctx.globalAlpha = 1;
  comic('HELP!', 0, bh * 0.04, bh * 0.56, '#ff3a3a', '#3a0000');
  ctx.restore();
  AUD.help = (AUD.help || 0) + 1;
}
function txt(s, x, y, size, fill = '#fff', stroke = '#0b2440', lw = 0.2, italic = false) {
  ctx.font = `${italic ? 'italic ' : ''}900 ${size}px ${FONT}`; ctx.lineWidth = Math.max(2, size * lw); ctx.strokeStyle = stroke; ctx.lineJoin = 'round';
  ctx.strokeText(s, x, y); ctx.fillStyle = fill; ctx.fillText(s, x, y);
}
// small life bar: green -> yellow -> red
function lifeBar(x, y, w, h, f, alpha) {
  if (alpha <= 0.01) return;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(12,16,22,.85)'; ctx.fillRect(x - w / 2 - 1.5, y - 1.5, w + 3, h + 3);
  ctx.fillStyle = hpColor(f); ctx.fillRect(x - w / 2, y, Math.max(0, w * clamp(f, 0, 1)), h);
  ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(x - w / 2, y, Math.max(0, w * clamp(f, 0, 1)), Math.max(1, h * 0.35));
  ctx.globalAlpha = 1;
}
function bubble(text, x, y, t, dur) {
  const a = Math.min(1, t * 5, (dur - t) * 4); if (a <= 0) return;
  const s = t < 0.25 ? easeBack(t / 0.25) : 1;
  ctx.save(); ctx.globalAlpha = a; ctx.translate(x, y); ctx.scale(s, s);
  ctx.font = `900 16px ${FONT}`; const w = ctx.measureText(text).width + 28, h = 36, by = -h - 16;
  const bx = clamp(-w / 2, -x + 8, W - x - w - 8);
  if (y + by < 96) { ctx.translate(0, 96 - (y + by)); }
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.roundRect(bx + 2, by + 3, w, h, 14); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#1a2a44'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.roundRect(bx, by, w, h, 14); ctx.moveTo(-8, by + h - 1); ctx.lineTo(0, -6); ctx.lineTo(8, by + h - 1); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.fillRect(-7, by + h - 4, 14, 5);
  ctx.fillStyle = '#12213a'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, bx + w / 2, by + h / 2 + 1);
  ctx.restore(); ctx.globalAlpha = 1;
}
function drawPilot(x, y, s) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.fillStyle = '#6b4a2b'; ctx.beginPath(); ctx.roundRect(-9, 2, 18, 20, 6); ctx.fill();
  ctx.fillStyle = '#f0c49a'; ctx.beginPath(); ctx.arc(0, -6, 8, 0, TAU); ctx.fill();
  ctx.fillStyle = '#5a3b20'; ctx.beginPath(); ctx.arc(0, -8, 8.5, Math.PI, TAU); ctx.fill();
  ctx.fillStyle = '#9fd8ff'; ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 1.5;
  for (const o of [-3.6, 3.6]) { ctx.beginPath(); ctx.arc(o, -7, 3, 0, TAU); ctx.fill(); ctx.stroke(); }
  ctx.restore();
}
// round-2 propeller disc seen from above
function drawProp(x, y, z, size, spin) {
  const [sx, sy] = toScreen(x, y, z); const u = unitPx(x, y, z) * size;
  ctx.save(); ctx.translate(sx, sy); ctx.scale(1, 0.32);
  ctx.fillStyle = 'rgba(60,60,60,.18)'; ctx.beginPath(); ctx.arc(0, 0, u, 0, TAU); ctx.fill();
  ctx.rotate(spin); ctx.fillStyle = 'rgba(40,40,40,.45)';
  for (let k = 0; k < 3; k++) { ctx.rotate(TAU / 3); ctx.beginPath(); ctx.ellipse(u * 0.5, 0, u * 0.5, u * 0.07, 0, 0, TAU); ctx.fill(); }
  ctx.restore();
}
function auditBugs() {
  // hunters must never leave through the bottom of the screen
  for (const s of bugs) {
    const y = toScreen(s.x, 0.4, s.z)[1], f = y / H;
    if (f > AUD.bugMaxScreenY) AUD.bugMaxScreenY = +f.toFixed(3);
    if (y > H && !s.exitB) { s.exitB = true; AUD.bottomExit++; if (AUD.bottomExitWho.length < 10) AUD.bottomExitWho.push(`${s.type} ${s.state} t=${S.t.toFixed(1)} z=${s.z.toFixed(2)}`); }
  }
  for (const s of bugs) {
    if (s.seen) continue;
    const top = onSprite(s.sprite, 0.5, 0)[1], bot = onSprite(s.sprite, 0.5, 1)[1], lx = onSprite(s.sprite, 0, 1)[0], rx = onSprite(s.sprite, 1, 1)[0];
    if (bot < 0 || top > H || Math.max(lx, rx) < 0 || Math.min(lx, rx) > W) continue;
    s.seen = true; const f = Math.max(0, top) / H;
    if (s.src === 'boss') { AUD.brood++; AUD.broodMaxY = Math.max(AUD.broodMaxY, f); continue; }
    AUD.seen++;
    if (f > AUD.maxY) { AUD.maxY = f; AUD.worst = `${s.type} t=${S.t.toFixed(1)} top=${(f * 100).toFixed(1)}% x=${s.x.toFixed(2)} z=${s.z.toFixed(1)}`; }
    if (f > 0.05) AUD.viol.push(`${s.type} t=${S.t.toFixed(1)} top=${(f * 100).toFixed(1)}%`);
  }
  for (const s of bugs) {
    if (!s.seen || s.src === 'boss' || s.state !== 'in') continue;
    for (const g of gates) {
      if (g.passed || g.z < TOP_Z || s.z >= g.z || Math.abs(s.x - g.x) > GATE_W / 2 + s.r * 0.5) continue;
      const gz = +(g.z - s.z).toFixed(2); if (gz < AUD.minGap) { AUD.minGap = gz; AUD.gapWho = `${s.type} src=${s.src} t=${S.t.toFixed(1)} bz=${s.z.toFixed(1)} gz=${g.z.toFixed(1)} dx=${(s.x-g.x).toFixed(2)} age=${(s.age||0).toFixed?.(2)}`; }
    }
  }
}
function drawOverlay() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const now = performance.now() * 0.001, spin = performance.now() * 0.05;
  if (S.mode === 'play') auditBugs();
  // round-2 propellers and contrails
  if (planeSprite.visible) drawProp(S.px, 0.62, -1.05, 0.62, spin);
  for (const w of wingmen) drawProp(w.sprite.position.x, w.sprite.position.y + 0.03, w.z - 0.45, 0.27, spin + w.ph);
  ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (const w of wingmen) for (const o of [-0.58, 0.58]) {
    const a = toScreen(w.x + o, 0.45, w.z + 0.1), b = toScreen(w.x + o, 0.45, w.z + 2.4); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
  }
  if (planeSprite.visible) for (const o of [-1.35, 1.35]) { const a = toScreen(S.px + o, 0.55, 0.05), b = toScreen(S.px + o, 0.55, 3.5); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
  ctx.stroke();
  // acid landing markers (so the lob can be dodged)
  for (const a of acids) {
    const [x, y] = toScreen(a.x1, 0.3, a.z1); const u = unitPx(a.x1, 0.3, a.z1); const k = a.t / a.T;
    ctx.strokeStyle = `rgba(120,255,60,${0.35 + 0.5 * k})`; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.ellipse(x, y, u * (1.1 - k * 0.3), u * 0.45 * (1.1 - k * 0.3), 0, 0, TAU); ctx.stroke();
  }
  // Kingsting's charge telegraph (dormant boss)
  if (boss && boss.type === 'stinger' && boss.state === 'tele' && boss.atkType === 'charge') {
    const pulse = 0.5 + 0.5 * Math.sin(now * 25);
    for (let z = boss.z + 2; z < 3; z += 2.2) {
      const [x, y] = toScreen(boss.chargeX, 0.3, z); const u = unitPx(boss.chargeX, 0.3, z) * boss.bw * 0.3;
      ctx.fillStyle = `rgba(255,40,30,${0.25 + 0.45 * pulse})`; ctx.beginPath(); ctx.moveTo(x - u, y - u * 0.25); ctx.lineTo(x, y + u * 0.2); ctx.lineTo(x + u, y - u * 0.25); ctx.lineTo(x + u, y + u * 0.05); ctx.lineTo(x, y + u * 0.5); ctx.lineTo(x - u, y + u * 0.05); ctx.closePath(); ctx.fill();
    }
    const [x, y] = toScreen(boss.chargeX, 0.3, -2); txt('!', x, y, 44, '#ff4a3a', '#3a0606', 0.2);
  }
  // pickups: canisters carry a BIG badge with the item on top, orbs a big gold gun inside, crates a big reward pill
  for (const p of pods) {
    if (p.z < -70) continue;
    const s = p.sprite;
    if (onSprite(s, 0.5, 1)[1] < 0) continue;
    const bob = Math.sin(now * 3 + p.ph);
    if (p.kind === 'can') {
      const u = unitPx(p.x, 0, p.z); const h = p.w * 142 / 210;
      const [nx, ny] = toScreen(p.x, 0.15 + h * 0.36, p.z);
      txt(String(Math.max(0, Math.ceil(p.hp))), nx + u * 0.02, ny, Math.max(12, u * 0.8), '#fff', '#1a2230', 0.16);
      const [bx, by] = toScreen(p.x, 0.15 + h * 0.98, p.z);
      const key = p.reward.power ? 'power' : p.reward.rapid ? 'rapid' : p.reward.weapon === 'beam' ? 'beam' : p.reward.rockets ? 'rockets' : p.reward.bazooka ? 'bazooka' : 'drones';
      const img = BADGES[key]; const bw = u * 2.7, bh = bw * img.height / img.width;
      ctx.drawImage(img, bx - bw / 2, by - bh * 0.86 + bob * u * 0.06, bw, bh);
      if (p.reward.drones) txt('+' + p.reward.drones, bx + bw * 0.28, by - bh * 0.3 + bob * u * 0.06, Math.max(12, u * 0.62), '#ffe066', '#4a2e00', 0.2);
    } else if (p.kind === 'orb') {
      const [x, y, u] = onSprite(s, 0.5, 0.5);
      const key = p.reward.power ? 'power' : p.reward.bazooka ? 'bazooka' : p.reward.rockets ? 'rockets' : 'beam';
      const img = ICON_IMG[key]; const iw = u * p.w * 0.8, ih = iw * img.height / img.width, yy = y + bob * u * 0.1;
      ctx.save(); ctx.shadowColor = p.reward.power && S.tier >= 1 ? 'rgba(120,190,255,1)' : 'rgba(255,220,90,1)'; ctx.shadowBlur = 18;
      ctx.drawImage(img, x - iw / 2, yy - ih / 2, iw, ih); ctx.restore();
      txt(String(Math.max(0, Math.ceil(p.hp))), x, y + u * p.w * 0.58, Math.max(13, u * 0.72), '#fff', '#0b2440', 0.18);
    } else if (p.kind === 'cocoon') {
      const [x, y, u] = onSprite(s, 0.5, 0.52); drawPilot(x, y + bob * u * 0.06, u * 0.028);
      txt(String(Math.max(0, Math.ceil(p.hp))), x, y + u * 1.55, Math.max(12, u * 0.6), '#fff', '#0b2440', 0.18);
      const [bx, by] = onSprite(s, 0.5, -0.1); txt('+' + p.reward.drones, bx, by, Math.max(14, u * 0.8), '#ffe066', '#4a2e00', 0.2);
    } else if (p.kind === 'omega') {
      const [x, y, u] = onSprite(s, 0.5, 0.5); const r = u * p.w * 0.62 * (1 + 0.08 * Math.sin(now * 6 + p.ph));
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(200,160,255,.7)'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
      for (let k = 0; k < 4; k++) { const a = now * 2.5 + k * TAU / 4 + p.ph; sparkle(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.8, u * 0.22, '#f4e8ff'); }
      ctx.restore();
    } else {
      const [x, y, u] = onSprite(s, 0.5, 0.72);
      txt(String(Math.max(0, Math.ceil(p.hp))), x, y, Math.max(12, u * 0.72), '#fff', '#1a1208', 0.18);
      const [bx, by] = onSprite(s, 0.5, 0.12); const r = p.reward, bw = u * 2.1, bh = u * 0.95, bb = bob * u * 0.05;
      if (r.loot) {   // round 6: a big loot icon shows what's inside (coin pile, gem, diamond)
        const img = LOOT_IMG[r.loot], iw = u * (r.loot === 'coins' ? 2.3 : 1.7), ih = iw * img.height / img.width, yy = by - ih * 0.42 + bb * 1.5;
        ctx.save(); ctx.shadowColor = r.loot === 'coins' ? 'rgba(255,210,60,1)' : r.loot === 'gems' ? 'rgba(90,255,160,1)' : 'rgba(170,240,255,1)'; ctx.shadowBlur = 16;
        ctx.drawImage(img, bx - iw / 2, yy - ih / 2, iw, ih); ctx.restore();
        if (r.loot === 'diamond') { ctx.save(); ctx.globalCompositeOperation = 'lighter'; for (let k = 0; k < 5; k++) { const a = now * 2.2 + k * TAU / 5 + p.ph, pr = iw * (0.55 + 0.1 * Math.sin(now * 5 + k)); sparkle(bx + Math.cos(a) * pr, yy + Math.sin(a) * pr * 0.7, u * (0.18 + 0.12 * Math.abs(Math.sin(now * 6 + k * 1.7))), '#f2fdff'); } ctx.restore(); }
        else if (r.loot === 'gems') { ctx.save(); ctx.globalCompositeOperation = 'lighter'; sparkle(bx + iw * 0.3, yy - ih * 0.3, u * 0.2 * (0.6 + 0.4 * Math.sin(now * 7)), '#eafff2'); ctx.restore(); }
        continue;
      }
      ctx.fillStyle = r.hp ? 'rgba(20,90,30,.88)' : 'rgba(12,40,90,.88)'; ctx.strokeStyle = r.hp ? '#9dff8a' : '#9fe0ff'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.roundRect(bx - bw / 2, by - bh / 2 + bb, bw, bh, bh / 2); ctx.fill(); ctx.stroke();
      if (r.hp) txt('\u2665 +' + r.hp, bx, by + bb + 1, bh * 0.62, '#b8ffa8', '#0b2a10', 0.14);
      else { const pi = TEX.plane.image, iw = bh * 1.25; ctx.drawImage(pi, bx - bw / 2 + 4, by - iw * pi.height / pi.width / 2 + bb, iw, iw * pi.height / pi.width); txt('+' + r.drones, bx + bh * 0.42, by + bb + 1, bh * 0.66, '#fff', '#0b2440', 0.14); }
    }
  }
  // cocoon rescue: HP just below the amber glass, the reward beside it, the carrier's bar when hit
  for (const c of cocoons) {
    if (c.stage < 2 && c.z > TOP_Z - 2) helpBubble(c);   // round 7: the trapped pilot calls for help
    if (c.stage < 2 && c.state !== 'leave') {
      const [x, y, u] = onSprite(c.sprite, 0.5, 0.79);
      txt(String(Math.max(0, Math.ceil(c.hp))), x, y, Math.max(15, u * 0.8), '#fff', '#2a1200', 0.22);
      const [bx, by] = onSprite(c.sprite, 1.12, 0.5); comic('+' + c.reward.drones, bx + u * 0.35, by, Math.max(16, u * 0.8));
    }
    const K = c.carrier;
    if (K.alive && K.barT > 0) { const u = unitPx(K.x, 1.2, K.z); const [x, y] = onSprite(K.sprite, 0.5, 0.02); lifeBar(x, y - 4, u * 1.3, Math.max(3, u * 0.13), K.hp / K.max, Math.min(1, K.barT / 0.35)); }
  }
  for (const p of pilots) {
    const k = p.t, e = k * k * (3 - 2 * k);
    const [ax, ay] = toScreen(p.x, 1, p.z), [bx, by] = toScreen(S.px, 0.6, 0);
    const x = lerp(ax, bx, e), y = lerp(ay, by, e) - Math.sin(k * Math.PI) * 110, u = unitPx(S.px, 0.6, 0);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const gl = ctx.createRadialGradient(x, y, 0, x, y, u * 1.6); gl.addColorStop(0, 'rgba(255,220,120,.8)'); gl.addColorStop(1, 'rgba(255,200,80,0)'); ctx.fillStyle = gl; ctx.fillRect(x - u * 2, y - u * 2, u * 4, u * 4);
    for (let j = 0; j < 5; j++) sparkle(x + Math.cos(now * 9 + j * 1.3) * u * 0.9, y + Math.sin(now * 9 + j * 1.3) * u * 0.7, u * 0.3, '#fff3b0');
    ctx.restore();
    const img = TEX.cocoon_cracked.image, R = u * (0.95 + Math.sin(k * Math.PI) * 0.35);
    ctx.save(); ctx.beginPath(); ctx.ellipse(x, y, R, R * 0.9, 0, 0, TAU); ctx.closePath();
    ctx.fillStyle = '#3a2208'; ctx.fill(); ctx.clip();
    const sw = img.width * 0.62, sh = img.height * 0.34, sx0 = img.width * 0.19, sy0 = img.height * 0.3;   // the pilot inside the window
    ctx.drawImage(img, sx0, sy0, sw, sh, x - R * 1.15, y - R * 0.95, R * 2.3, R * 2.3 * sh / sw); ctx.restore();
    ctx.lineWidth = Math.max(3, R * 0.14); ctx.strokeStyle = '#ffd84a'; ctx.beginPath(); ctx.ellipse(x, y, R, R * 0.9, 0, 0, TAU); ctx.stroke();
    ctx.lineWidth = 2; ctx.strokeStyle = '#3a1d00'; ctx.beginPath(); ctx.ellipse(x, y, R + ctx.lineWidth * 2, R * 0.9 + 4, 0, 0, TAU); ctx.stroke();
  }
  // drone spawn: a magical glowing swirl (sparkle spiral + ring) around each new drone
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const w of wingmen) {
    if (w.spawn >= 1 || w.delay > 0) continue;
    const e = w.spawn, [x, y] = toScreen(w.x, 0.45, w.z), u = unitPx(w.x, 0.45, w.z), a0 = now * 9 + w.ph;
    const R = u * (1.5 - e * 0.8), al = e < 0.15 ? e / 0.15 : 1 - (e - 0.15) / 0.85;
    ctx.globalAlpha = al;
    const gl = ctx.createRadialGradient(x, y, 0, x, y, R * 1.3); gl.addColorStop(0, 'rgba(255,230,140,.55)'); gl.addColorStop(0.6, 'rgba(255,200,80,.18)'); gl.addColorStop(1, 'rgba(255,200,80,0)');
    ctx.fillStyle = gl; ctx.beginPath(); ctx.ellipse(x, y, R * 1.3, R * 1.0, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(255,236,160,.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x, y, R, R * 0.7, 0, a0 * 0.2, a0 * 0.2 + TAU * 0.8); ctx.stroke();
    for (let j = 0; j < 12; j++) {   // spiral arms winding inward
      const f = j / 12, a = a0 + f * TAU * 1.5, r = R * (0.35 + f * 0.75);
      sparkle(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.7, u * (0.34 - f * 0.18), j % 3 === 0 ? '#bff4ff' : '#fff2b0');
    }
  }
  ctx.restore(); ctx.globalAlpha = 1;
  // life bars: elites always, bugs/drones/plane while taking damage (green -> yellow -> red)
  for (const s of bugs) if ((s.elite || s.barT > 0) && s.hp > 0) {
    const u = unitPx(s.x, 0, s.z); const [x, y] = onSprite(s.sprite, 0.5, -0.02); if (y < 70) continue;
    const big = s.elite || BUG[s.type].big;
    lifeBar(x, y - 4, u * (big ? 1.5 : 0.95), Math.max(3, u * (big ? 0.16 : 0.11)), s.hp / s.max, s.elite ? 1 : Math.min(1, s.barT / 0.35));
  }
  for (const w of wingmen) if (w.barT > 0) {
    const u = unitPx(w.x, 0.45, w.z); const [x, y] = toScreen(w.x, 0.45, w.z - 0.8);
    lifeBar(x, y, u * 0.95, Math.max(3, u * 0.12), w.hp / w.max, Math.min(1, w.barT / 0.35));
  }
  if (planeSprite.visible && S.barT > 0) {
    const u = unitPx(S.px, 0.55, 0); const [x, y] = toScreen(S.px, 0.55, 1.15);
    lifeBar(x, y, u * 1.9, Math.max(5, u * 0.16), S.hp / S.hpMax, Math.min(1, S.barT / 0.4));
  }
  // drone count
  if (S.mode === 'play') {
    const [x, y] = toScreen(S.px, 0, 1.9);
    const full = S.drones >= MAXD, label = '\u00d7' + S.drones + (full ? ' MAX' : '');
    ctx.font = `900 16px ${FONT}`; const tw = ctx.measureText(label).width + 32;
    ctx.fillStyle = full ? 'rgba(90,60,0,.8)' : 'rgba(12,40,80,.72)'; ctx.strokeStyle = full ? 'rgba(255,220,110,.95)' : 'rgba(160,225,255,.95)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(x - tw / 2, y - 12, tw, 24, 12); ctx.fill(); ctx.stroke();
    const pi = TEX.plane.image; ctx.drawImage(pi, x - tw / 2 + 4, y - 7, 24, 24 * pi.height / pi.width);
    txt(label, x + 12, y + 1, 16, full ? '#ffe066' : '#fff', '#0b2440', 0.12);
  }
  // UP ring on big gains and power-ups (tinted with the new bullet colour)
  if (upRing && planeSprite.visible) {
    const [x, y] = toScreen(S.px, 0.5, 0.2); const k = upRing.t / 0.9, r = 40 + k * 120, col = upRing.col || '#ffd84a';
    ctx.globalAlpha = 1 - k; ctx.strokeStyle = col; ctx.lineWidth = 10 * (1 - k) + 2; ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.7, 0, 0, TAU); ctx.stroke();
    ctx.strokeStyle = '#fff6c0'; ctx.lineWidth = 3 * (1 - k) + 1; ctx.beginPath(); ctx.ellipse(x, y, r * 0.92, r * 0.64, 0, 0, TAU); ctx.stroke();
    ctx.globalAlpha = Math.min(1, (1 - k) * 2); txt('UP', x, y - 60 - k * 40, 34 + 10 * Math.sin(Math.min(1, k * 4) * Math.PI / 2), col, '#3a2200', 0.2, true); ctx.globalAlpha = 1;
  }
  for (const f of flyIcons) {
    const k = f.t, e = k * k * (3 - 2 * k);
    const [ax, ay] = toScreen(f.x, 1, f.z), [bx, by] = toScreen(S.px, 0.6, 0);
    const x = lerp(ax, bx, e), y = lerp(ay, by, e) - Math.sin(k * Math.PI) * 70; const img = ICON_IMG[f.name]; const s = 120 * (1 - k * 0.45) * (k < 0.15 ? easeBack(k / 0.15) : 1);
    ctx.globalAlpha = 1 - k * k; ctx.save(); ctx.shadowColor = 'rgba(255,220,90,1)'; ctx.shadowBlur = 20; ctx.drawImage(img, x - s / 2, y - s * img.height / img.width / 2, s, s * img.height / img.width); ctx.restore(); ctx.globalAlpha = 1;
  }
  for (const p of pops) {
    if (p.t < 0) continue;
    const [x, y] = toScreen(p.x, p.y, p.z); const k = p.t / 1.1;
    ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
    if (p.comic) {   // chunky comic pop: overshoot in, then float up
      const sc = p.size * (k < 0.18 ? easeBack(k / 0.18) * 1.1 : 1.1 - Math.min(0.12, (k - 0.18) * 0.3));
      comic(p.text, x, y - k * 46, 30 * sc, p.color, p.stroke); ctx.globalAlpha = 1; continue;
    }
    const sc = p.size * (k < 0.15 ? 0.6 + k / 0.15 * 0.6 : 1.2 - Math.min(0.2, (k - 0.15)));
    txt(p.text, x, y - k * 50, 30 * sc, p.color, p.stroke, 0.2); ctx.globalAlpha = 1;
  }
  // loot flying to the HUD counters (screen space)
  for (const c of coinFx) {
    if (c.kind === 'coin') { const img = LOOT_IMG.coin, s = 22, sx = Math.abs(Math.cos(c.ph)) * 0.8 + 0.2; ctx.save(); ctx.translate(c.x, c.y); ctx.scale(sx, 1); ctx.drawImage(img, -s / 2, -s / 2, s, s); ctx.restore(); }
    else { const img = c.kind === 'gem' ? LOOT_IMG.gems : c.kind === 'ruby' ? LOOT_IMG.ruby : LOOT_IMG.diamond, s = c.kind === 'gem' ? 34 : c.kind === 'ruby' ? 38 : 44; ctx.save(); ctx.shadowColor = c.kind === 'gem' ? '#5aff9a' : c.kind === 'ruby' ? '#ff5a78' : '#bff4ff'; ctx.shadowBlur = 14; ctx.drawImage(img, c.x - s / 2, c.y - s * img.height / img.width / 2, s, s * img.height / img.width); ctx.restore();
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; for (let k = 0; k < 3; k++) { const a = now * 8 + k * 2.1; sparkle(c.x + Math.cos(a) * s * 0.6, c.y + Math.sin(a) * s * 0.5, 5, '#ffffff'); } ctx.restore(); }
  }
  // tutorial speech bubbles
  for (const t of tips) {
    let x = W / 2, y = H * 0.5;
    if (t.target === 'plane') { [x, y] = toScreen(S.px, 0.5, -1.4); }
    else if (t.target === 'gate') { const g = gates.find((g) => !g.passed && g.z < -4 && g.z > TOP_Z + 4); if (!g) { if (t.t > 0.1) t.t = Math.max(t.t, t.dur - 0.25); else t.t = 0; continue; } [x, y] = onSprite(g.sprite, 0.5, 0.0); y -= 6; }
    else if (t.target === 'cocoon') { const c = cocoons.find((c) => c.stage < 2 && c.state === 'hold'); if (!c) { t.t = Math.min(t.t, 0.01); continue; } [x, y] = onSprite(c.sprite, 0.5, 1.02); y += 70; }
    else if (t.target === 'can') { const p = pods.find((p) => p.kind === 'can' && p.z < -3 && p.z > TOP_Z + 6); if (!p) { t.t = Math.min(t.t, 0.01); continue; } const u = unitPx(p.x, 0, p.z); [x, y] = toScreen(p.x, 0.15 + p.w * 1.1, p.z); y -= u * 1.8; }
    bubble(t.text, x, y, t.t, t.dur);
    if (t.arrow && t.t > 0) {   // animated swipe hint: chevrons moving up (open) or down (close) over the plane
      const [px, py] = toScreen(S.px, 0.55, 0), a = Math.min(1, t.t * 4, (t.dur - t.t) * 3);
      ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = '#fff'; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (let j = 0; j < 3; j++) {
        const ph = ((t.t * 1.6 + j / 3) % 1), yy = py + t.arrow * (-20 + ph * 70) - 10, al = Math.sin(ph * Math.PI);
        ctx.globalAlpha = a * al; ctx.strokeStyle = '#0b2440'; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(px - 16, yy - t.arrow * 10); ctx.lineTo(px, yy); ctx.lineTo(px + 16, yy - t.arrow * 10); ctx.stroke();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 5; ctx.stroke();
      }
      ctx.restore();
    }
  }
  if (S.mode === 'play' && S.omega >= 1 && planeSprite.visible && S.omegaT <= 0) {
    const [nx, ny] = toScreen(S.px, 0.62, -1.2), u = unitPx(S.px, 0.6, 0), p = 0.5 + 0.5 * Math.sin(now * 9);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const gl = ctx.createRadialGradient(nx, ny, 0, nx, ny, u * (2.2 + p * 0.6)); gl.addColorStop(0, 'rgba(255,255,255,.95)'); gl.addColorStop(0.25, 'rgba(210,160,255,.7)'); gl.addColorStop(1, 'rgba(120,60,255,0)');
    ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(nx, ny, u * (2.2 + p * 0.6), 0, TAU); ctx.fill();
    ctx.strokeStyle = `rgba(220,190,255,${0.5 + p * 0.4})`; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.ellipse(nx, ny + u * 0.9, u * (2.1 + p * 0.3), u * (1.5 + p * 0.2), 0, 0, TAU); ctx.stroke();
    for (let j = 0; j < 14; j++) {   // energy streaks drawn in towards the nose
      const f = ((now * 1.6 + j / 14) % 1), a = j * 2.4 + Math.floor(now * 1.6 + j / 14) * 1.7, r0 = u * 3.6 * (1 - f), r1 = r0 + u * 0.9 * (1 - f);
      ctx.strokeStyle = `rgba(235,215,255,${Math.sin(f * Math.PI)})`; ctx.lineWidth = 2.5 * (1 - f) + 1; ctx.beginPath();
      ctx.moveTo(nx + Math.cos(a) * r1, ny + Math.sin(a) * r1 * 0.8); ctx.lineTo(nx + Math.cos(a) * r0, ny + Math.sin(a) * r0 * 0.8); ctx.stroke();
      sparkle(nx + Math.cos(a) * r0, ny + Math.sin(a) * r0 * 0.8, 3 + 3 * (1 - f), '#f6eeff');
    }
    ctx.restore();
  }
  if (S.omegaT > 0 || omegaFlash > 0) drawOmegaBeam(now);
  if (weaponFlash > 0) {
    const [x, y] = toScreen(S.px, 0.5, -0.5); const c = S.tier === 2 ? '150,200,255' : S.tier === 1 ? '255,190,120' : '255,240,180';
    const g = ctx.createRadialGradient(x, y, 0, x, y, H * 0.6); g.addColorStop(0, `rgba(${c},${weaponFlash * 0.45})`); g.addColorStop(1, `rgba(${c},0)`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  if (flashRed > 0) {
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.75);
    g.addColorStop(0, 'rgba(255,0,0,0)'); g.addColorStop(1, `rgba(255,20,10,${flashRed * 0.55})`); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
}

function sparkle(x, y, r, col) {
  ctx.fillStyle = col; ctx.beginPath();
  ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.quadraticCurveTo(x, y, x, y + r); ctx.quadraticCurveTo(x, y, x - r, y); ctx.quadraticCurveTo(x, y, x, y - r); ctx.fill();
}
// the Omega Beam: a massive screen-wide column from the plane's nose to the top of the screen
function drawOmegaBeam(now) {
  const [nx, ny] = toScreen(S.px, 0.6, -1.3);
  if (S.omegaT > 0) {
    const k = 1 - S.omegaT / CFG.omegaTime, env = Math.min(1, k / 0.07) * Math.min(1, S.omegaT / 0.4);
    const hw = W * 0.75 * Math.min(1, 0.35 + k / 0.12), jit = Math.sin(now * 60) * 4;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = env;
    const g = ctx.createLinearGradient(nx - hw, 0, nx + hw, 0);
    g.addColorStop(0, 'rgba(90,40,200,0)'); g.addColorStop(0.18, 'rgba(120,60,255,.45)'); g.addColorStop(0.38, 'rgba(190,140,255,.85)'); g.addColorStop(0.5, 'rgba(255,255,255,1)');
    g.addColorStop(0.62, 'rgba(190,140,255,.85)'); g.addColorStop(0.82, 'rgba(120,60,255,.45)'); g.addColorStop(1, 'rgba(90,40,200,0)');
    // a cone: narrow at the nose, screen-wide at the top
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(nx - 34, ny); ctx.lineTo(nx - hw + jit, 0); ctx.lineTo(nx + hw + jit, 0); ctx.lineTo(nx + 34, ny); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.95)'; ctx.beginPath(); ctx.moveTo(nx - 14, ny); ctx.lineTo(nx - 34 - jit, 0); ctx.lineTo(nx + 34 - jit, 0); ctx.lineTo(nx + 14, ny); ctx.closePath(); ctx.fill();
    const ng = ctx.createRadialGradient(nx, ny, 0, nx, ny, 120); ng.addColorStop(0, 'rgba(255,255,255,1)'); ng.addColorStop(0.4, 'rgba(200,150,255,.8)'); ng.addColorStop(1, 'rgba(120,60,255,0)');
    ctx.fillStyle = ng; ctx.beginPath(); ctx.arc(nx, ny, 120, 0, TAU); ctx.fill();
    for (let j = 0; j < 26; j++) { const yy = (now * 900 + j * 97) % Math.max(1, ny); sparkle(nx + Math.sin(j * 7.1 + now * 3) * hw * 0.8, ny - yy, 5 + (j % 4) * 3, '#f4ecff'); }
    ctx.restore();
  }
  if (omegaFlash > 0) { ctx.fillStyle = `rgba(235,220,255,${omegaFlash * 0.45})`; ctx.fillRect(0, 0, W, H); }
}

// ---------------------------------------------------------------- resize / loop
function resize() {
  W = wrap.clientWidth; H = wrap.clientHeight; DPR = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(DPR); renderer.setSize(W, H, false);
  uic.width = Math.round(W * DPR); uic.height = Math.round(H * DPR);
  const aspect = W / H; camera.aspect = aspect; wcam.aspect = aspect;
  camera.clearViewOffset(); wcam.clearViewOffset();
  const t = Math.max(Math.tan(THREE.MathUtils.degToRad(FOVV)), Math.tan(THREE.MathUtils.degToRad(19.5)) / aspect);
  wcam.fov = THREE.MathUtils.radToDeg(2 * Math.atan(t));
  wcam.position.copy(CAM_POS); wcam.lookAt(CAM_LOOK); wcam.updateProjectionMatrix(); wcam.updateMatrixWorld();
  const tg = Math.max(Math.tan(THREE.MathUtils.degToRad(GFOV)), Math.tan(THREE.MathUtils.degToRad(GFOV * 0.52)) / aspect);
  camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(tg));
  camera.position.copy(GCAM_POS); camera.lookAt(GCAM_LOOK); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
  // bullets reach about three quarters of the way up the screen
  let lo = -90, hi = -2;
  for (let i = 0; i < 32; i++) { const mid = (lo + hi) / 2; if (toScreen(0, 0.5, mid)[1] < H * (1 - CFG.bulletReach)) lo = mid; else hi = mid; }
  RANGE_Z = (lo + hi) / 2;
  // the top edge of the screen for anything up to 1 unit above the play plane: spawns happen beyond it
  lo = -300; hi = -2;
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (toScreen(0, 1.0, mid)[1] < 0) lo = mid; else hi = mid; }
  TOP_Z = lo; SPAWN_D = -(TOP_Z - 2);
  lo = 0; hi = 30;
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (toScreen(0, 0.3, mid)[1] < H) lo = mid; else hi = mid; }
  BOT_Z = lo;
  HW0 = (W / 2) / unitPx(0, 0.3, 0); HW40 = (W / 2) / unitPx(0, 0.3, -40);
  if (boss) boss.hoverZ = boss.type === 'queen' ? Math.max(-15.5, RANGE_Z + 3.5) : RANGE_Z + 3.2;
  if (world.background) world.background.dispose();
  world.background = makeSky();
  pxScale = (H * DPR) / (2 * tg);
  if (fx) { fx.mat.uniforms.uScale.value = pxScale; smokeFx.mat.uniforms.uScale.value = pxScale; worldFx.mat.uniforms.uScale.value = (H * DPR) / (2 * t); }
}
window.addEventListener('resize', resize);
document.addEventListener('visibilitychange', () => { if (!ac) return; if (document.hidden) ac.suspend(); else ac.resume(); });
window.addEventListener('orientationchange', () => setTimeout(resize, 200));

let ready = false, lastT = 0, frames = 0, fpsT = 0; window.__fps = 0;
function loop(t) {
  requestAnimationFrame(loop);
  let dt = Math.min(0.05, (t - lastT) / 1000 || 0.016); lastT = t;
  if (!ready) return;
  frames++; fpsT += dt; if (fpsT > 1) { window.__fps = frames / fpsT; frames = 0; fpsT = 0; }
  let total = dt * slowmo * TS;
  while (total > 1e-5) { const st = Math.min(total, 1 / 30); update(st); total -= st; }
  applyShake(dt * TS);
  renderer.clear();
  renderer.render(world, wcam);
  renderer.render(cloudScene, ccam);
  renderer.clearDepth();
  renderer.render(scene, camera);
  drawOverlay();
}

// camera shake with parallax: ground (wcam) most, clouds (ccam) less, gameplay (camera) slightly. The HUD is HTML
// and stays put, except during the Omega Beam, when it rumbles along with the world.
const HUD_SHAKE = ['hud', 'bossbar', 'banner', 'threat', 'ui'];
let hudShaken = false;
function applyShake(dt) {
  const C = CFG.shake, sh = trauma * trauma, omega = S.omegaT > 0 && S.mode === 'play';
  shakePh += dt * (omega ? C.rumbleFreq : C.freq);
  const nx = vnoise(shakePh, 1), ny = vnoise(shakePh, 2), nr = vnoise(shakePh, 3);
  wcam.position.set(CAM_POS.x + S.px * 0.25, CAM_POS.y, CAM_POS.z); wcam.lookAt(CAM_LOOK.x + S.px * 0.2, CAM_LOOK.y, CAM_LOOK.z);
  camera.position.set(GCAM_POS.x + S.px * 0.22, GCAM_POS.y, GCAM_POS.z); camera.lookAt(GCAM_LOOK.x + S.px * 0.18, GCAM_LOOK.y, GCAM_LOOK.z);
  ccam.copy(wcam);
  const layer = (cam, f) => {
    if (sh < 1e-4) { if (cam.view && cam.view.enabled) cam.clearViewOffset(); return 0; }
    const ox = nx * C.ground * f * sh, oy = ny * C.ground * f * sh * 0.8;
    cam.setViewOffset(W, H, ox, oy, W, H); cam.rotateZ(nr * C.roll * f * sh);
    return Math.hypot(ox, oy);
  };
  const g = layer(wcam, 1), c = layer(ccam, C.clouds), p = layer(camera, C.game);
  camera.updateMatrixWorld();
  S.shakePx = [+g.toFixed(1), +c.toFixed(1), +p.toFixed(1)];
  if (omega) {
    if (AUD.omegaRumble.length < 600) AUD.omegaRumble.push([+S.t.toFixed(2), +sh.toFixed(3), +g.toFixed(1)]);
    const k = C.hud * sh;
    for (const id of HUD_SHAKE) { const el = $(id); el.style.translate = `${(nx * k).toFixed(1)}px ${(ny * k * 0.8).toFixed(1)}px`; el.style.rotate = `${(nr * sh * 0.8).toFixed(2)}deg`; }
    hudShaken = true;
  } else if (hudShaken) { hudShaken = false; for (const id of HUD_SHAKE) { const el = $(id); el.style.translate = ''; el.style.rotate = ''; } }
  if (boss && boss.state === 'dying' && AUD.bossTrace.length < 500) AUD.bossTrace.push([+boss.t.toFixed(3), +sh.toFixed(3)]);
}

async function boot() {
  resize();
  // round-2 plane, drones, spiders, Queen and canister; round-3 bugs kept for cameos; Bupé's gold weapon icons
  const names = ['plane:r2_plane', 'spider:r2_spider', 'boss:r2_boss', 'pod:r2_pod', 'redspider:spider', 'beetle', 'wasp', 'spitter', 'crate1', 'capsule', 'cocoon_intact', 'cocoon_cracked', 'cocoon_broken',
    'icon_minigun', 'icon_rockets', 'icon_bazooka', 'cloud1', 'cloud2', 'cloud3', 'smoke'];
  const files = { terrain: 'assets/terrain.jpg?v=' + VER };
  for (const n of names) { const [k, f] = n.split(':'); files[k] = `assets/${f || k}.webp?v=${VER}`; }
  await Promise.all(Object.entries(files).map(([k, f]) => loadTex(k, f)));
  try { await Promise.race([Promise.all([document.fonts.load(`900 40px NunitoG`), document.fonts.load('40px Lilita'), document.fonts.load('40px LuckiestG')]), new Promise((r) => setTimeout(r, 2000))]); } catch (e) { }
  PLANE_AR = TEX.plane.image.height / TEX.plane.image.width;
  TEX.omegaorb = makeOmegaOrbTex();
  setupIcons(); setupWorld(); resize(); computeSlots(); resetGame(false);
  ready = true; $('loading').textContent = '';
  if (Q.has('autostart') || Q.has('autoplay')) startGame();
}
requestAnimationFrame(loop);
boot();

// debug hooks for automated tests
window.__AUDIT = AUD;
window.__G = { S, AUD, get bugs() { return bugs; }, get pods() { return pods; }, get gates() { return gates; }, get boss() { return boss; }, get wingmen() { return wingmen; },
  get shots() { return shots; }, get RANGE_Z() { return RANGE_Z; }, get TOP_Z() { return TOP_Z; }, god(v) { godMode = v; }, give: (r) => giveReward(r), tier: (n) => setTier(n, S.px, -6),
  hurt: (d) => hurtPlayer(d), setDrones: (n) => setDrones(n), toScreen, start: () => startGame(), camera, resize, unitPx, bosses: BOSSES,
  get cocoons() { return cocoons; }, get pilots() { return pilots; }, GLOG, CFG, get SLOTS() { return SLOTS; }, MAXD, get trauma() { return trauma; }, dropLoot: (w, x = 0, z = -8) => dropLoot(w, x, z), setRapid: (n) => setRapid(n, S.px, -6),
  showThreat: () => showThreat(), get coinFx() { return coinFx; }, get mood() { return moodOn; }, addShake: (k, m) => addShake(k, m), get BOT_Z() { return BOT_Z; }, planeScreen,
  fireOmega: () => fireOmega(), setBeam: (v) => setBeam(v), omega: (v) => { S.omega = v; }, spawnCocoon: (o) => spawnCocoon(Object.assign({ x: -2.2, side: -1, hp: 260, drones: 8 }, o || {})),
  spawnBug: (x, z, type = 'spider', hp = 20) => newBug(x, z, type, hp), spawnGate: (x, val, z) => { spawnEvent({ k: 'gate', x, val, d: S.dist + (z ? -z : 30) }); return gates[gates.length - 1]; } };
