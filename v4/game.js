import * as THREE from './vendor/three.module.min.js';

// Grok Demo, round 4: Mission 1 "Get to Ridgeback" (round-2 look and feel + round-3 mission).
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

// ---------------------------------------------------------------- config
const XMAX = 3.3;            // steering range of the main plane
const SPEED = 12;            // ground scroll speed (the plane flies flat out)
const OBJ_V = 5;             // gates, canisters and bugs approach at this speed
const G = 36;                // ground depth below play level
const TILE = 170;            // world units per terrain tile
const MAXD = 40;             // drone cap
const GATE_MAX = 1000;
const PLANE_W = 2.8, WING_W = 1.2;            // round-2 plane and drones
const GW_PX = 512, GH_PX = 300;               // round-2 glass gate, flattened
const GATE_W = 2.6, GATE_H = GATE_W * GH_PX / GW_PX;   // three would fit side by side, but a row never has more than one
const GAP_Z = 6.5;           // bugs never sit closer than this behind a gate (about 1.5 gate-heights of clear sky on screen)
const SPAWN_D0 = 50;         // nominal spawn distance used by the level script (just beyond the top edge on a phone)
let RANGE_Z = -20;           // bullets fade out here (~3/4 up the screen), computed in resize()
let TOP_Z = -44;             // world z of the top edge of the screen (for anything up to 1 unit high), computed in resize()
let SPAWN_D = 50;            // everything spawns beyond the top edge and flies in
let HW0 = 3.8, HW40 = 9;     // visible half-width at z = 0 and z = -40

// ---------------------------------------------------------------- renderer
const renderer = new THREE.WebGLRenderer({ canvas: glc, antialias: true, powerPreference: 'high-performance' });
renderer.setClearColor(0xb8d3e8);
renderer.autoClear = false;
const world = new THREE.Scene();   // far ground, clouds, smoke (wide camera)
const scene = new THREE.Scene();   // gameplay (steep tele camera)
const HAZE = new THREE.Color(0xbcd6ea);
world.fog = new THREE.Fog(HAZE, 90, 460);
const wcam = new THREE.PerspectiveCamera(70, 0.5, 0.5, 1200);
const camera = new THREE.PerspectiveCamera(38, 0.5, 1, 400);
const GCAM_POS = new THREE.Vector3(0, 16, 12);
const GCAM_LOOK = new THREE.Vector3(0, 0, -8);
const GFOV = 21;
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
    c = sprite(tex, rand(14, 30), 0.5, 0.5, -2, world);
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
  ICON_IMG.beam = laserIcon(); ICON_IMG.drones = TEX.plane.image;
  const blue = ['rgba(120,220,255,1)', 'rgba(150,215,255,.8)', 'rgba(70,150,235,.8)', '#d8f6ff'];
  const gold = ['rgba(255,210,90,1)', 'rgba(255,226,140,.82)', 'rgba(235,150,30,.82)', '#fff3c0'];
  makeBadge('power', gold); makeBadge('rockets', blue); makeBadge('bazooka', gold); makeBadge('beam', blue); makeBadge('drones', blue);
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
};
function sfx(n) { try { SFX[n](); } catch (e) { } }

// ---------------------------------------------------------------- state
const S = {};
let bugs = [], pods = [], gates = [], shots = [], shells = [], missiles = [], acids = [], drops = [], stings = [], wingmen = [], pops = [], level = [], levelIdx = 0, tips = [], debris = [];
let boss = null, shake = 0, flashRed = 0, slowmo = 1, godMode = false, upRing = null, weaponFlash = 0;
// debug audit for automated runs: where each enemy first became visible, gate rows, bullet tiers
const AUD = { bugs: 0, seen: 0, maxY: 0, worst: '', viol: [], brood: 0, broodMaxY: 0, gates: 0, gatePairs: 0, minGap: 99, tiers: [], firstShotT: -1 };
// drone formation around the main plane (kept from round 3): four close wingmen, then a loose grid
const SLOTS = (() => {
  const s = [[-1.6, -0.15], [1.6, -0.15], [-2.35, 1.05], [2.35, 1.05]];
  const grid = [];
  for (let r = 0, z = -2.5; z <= 3.0; z += 0.72, r++) for (let x = -3.2; x <= 3.21; x += 0.8) {
    const xx = x + (r % 2 ? 0.4 : 0); if (xx > 3.35) continue;
    if (Math.abs(xx) < 1.25 && z < 1.3 && z > -1.6) continue;
    if (s.some(([a, b]) => Math.hypot(a - xx, b - z) < 0.75)) continue;
    grid.push([xx, z]);
  }
  grid.sort((a, b) => (Math.abs(a[0]) * 0.5 + Math.abs(a[1] - 0.4)) - (Math.abs(b[0]) * 0.5 + Math.abs(b[1] - 0.4)));
  return s.concat(grid).slice(0, MAXD);
})();

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
  if (S.rocketLv) h += ` <i>ROCKETS \u00d7${S.rocketLv * 2}</i>`;
  if (S.bazookaLv) h += ` <i>BAZOOKA</i>`;
  $('weap').innerHTML = h;
}
function hpColor(f) { return `hsl(${Math.round(clamp(f, 0, 1) * 120)},90%,48%)`; }
function updateHP() {
  const f = S.hp / S.hpMax; const el = $('hpfill');
  el.style.width = clamp(f * 100, 0, 100) + '%'; el.style.background = hpColor(f);
}

// ---------------------------------------------------------------- Mission 1: Get to Ridgeback
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
  const bug = (T, x, type, hp) => L.push({ d: D(T), k: 'bug', x, type, hp });
  const at = (T, k, o = {}) => L.push({ t: T, k, ...o });
  // round-2 swarms: staggered rows of yellow-eyed spiders
  const rows = (T, xc, n, cols, hp, sp = 1.1) => {
    for (let i = 0; i < n; i++) {
      const r = Math.floor(i / cols), c = i % cols, inRow = Math.min(cols, n - r * cols);
      const x = xc + (c - (inRow - 1) / 2) * sp + (r % 2 ? sp * 0.3 : 0) + srand(-0.15, 0.15);
      bug(T + r * 0.3 + srand(-0.05, 0.05), clamp(x, -4, 4), 'spider', hp);
    }
  };
  const wedge = (T, xc, n, hp) => { for (let i = 0; i < n; i++) { const r = Math.ceil(i / 2), s = i % 2 ? 1 : -1; bug(T + r * 0.28, clamp(xc + s * r * 0.8, -4, 4), 'spider', hp); } };
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
  gate(12.8, -2.0, -60); crate(12.8, 2.2, 45, { drones: 4 });
  wedge(14.6, 0, 9, 11); brutes(15.2, 1, 70);
  gate(16.4, 1.6, 3); rows(16.4, -2.4, 5, 2, 12);
  rows(18.2, 0, 12, 6, 13);
  // canister #2: homing rockets join the guns
  can(20.2, 2.2, 110, { rockets: 1 }); gate(20.2, -2.0, -110);
  rows(22.0, 0, 14, 7, 15); brutes(22.6, 1, 110);
  gate(24.2, 0, -150);
  rows(25.8, 0, 16, 8, 17);
  // mid-point: a small elite moment (the round-3 bugs appear only here and later, briefly)
  at(27.4, 'banner', { text: 'ELITES!', sub: 'Armoured beetle and wasps', warn: true });
  bug(28.0, 0, 'beetle', 260); wasps(28.6, 2); bug(29.4, -2.6, 'redspider', 26); bug(29.4, 2.6, 'redspider', 26);
  // the big glass orb: bullets turn BLUE
  orb(31.0, -2.0, 220, { power: 1 }); gate(31.0, 2.0, -90);
  rows(33.0, 0, 18, 9, 22); brutes(33.6, 2, 150);
  gate(35.0, 1.8, -240); rows(35.0, -2.4, 6, 3, 24);
  rows(37.0, 0, 20, 8, 26);
  // canister #3: the BEAM
  can(39.0, -2.2, 170, { weapon: 'beam' }); gate(39.0, 2.0, 5);
  rows(41.0, 0, 22, 8, 28); brutes(41.6, 2, 180);
  gate(43.0, -1.6, -320); can(43.0, 2.3, 260, { drones: 8 });
  rows(45.0, 0, 24, 8, 30);
  at(46.4, 'banner', { text: 'SPITTER!', sub: 'Dodge the green acid', warn: true });
  bug(46.8, 0, 'spitter', 140); wasps(47.4, 2);
  gate(49.0, 0, -600);
  rows(50.6, 0, 26, 9, 32); brutes(51.2, 3, 200);
  gate(52.8, 2.0, -200); crate(52.8, -2.2, 220, { drones: 8, pilot: true }, 'cocoon');
  rows(54.6, 0, 28, 9, 34);
  // the second orb: a big gun before the boss
  orb(56.4, -2.0, 380, { bazooka: 1 }); gate(56.4, 2.0, 10);
  rows(58.2, 0, 24, 8, 36); brutes(58.8, 2, 240);
  // final: the Chitin Queen (round-2 boss)
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
  if (boss) { scene.remove(boss.sprite); if (boss.glow) scene.remove(boss.glow); }
  bugs = []; pods = []; gates = []; shots = []; shells = []; missiles = []; acids = []; drops = []; stings = []; wingmen = []; pops = []; tips = []; debris = []; boss = null; upRing = null;
  Object.assign(S, { mode: play ? 'play' : 'title', t: 0, dist: 0, hp: 100, hpMax: 100, barT: 0, drones: 0, px: 0, tx: 0, vx: 0, inv: 0, kills: 0,
    tier: 0, primary: 'gun', rocketLv: 0, bazookaLv: 0, fireT: 0, missileT: 0.8, cannonT: 1, laserT: 0, gunSide: 0, smokeT: 0, endT: 0, maxDrones: 0, ended: false, deathBy: '' });
  slowmo = 1; shake = 0; flashRed = 0; weaponFlash = 0;
  level = buildLevel(); levelIdx = 0;
  setDrones(play ? 2 : 0, 0, 0, true);
  const warp = Number(Q.get('warp') || 0); // debug: skip ahead (seconds)
  if (play && warp > 0) {
    S.t = warp; S.dist = warp * OBJ_V;
    while (levelIdx < level.length && level[levelIdx].key < warp) levelIdx++;
    setDrones(Number(Q.get('drones') || 14), 0, 0, true);
    S.tier = warp > 31 ? 2 : warp > 9 ? 1 : 0; if (warp > 20) S.rocketLv = 1; if (warp > 39) S.primary = 'beam';
  }
  if (play) {
    if (Q.get('tier')) S.tier = clamp(Number(Q.get('tier')), 0, 2);
    if (Q.get('weapon') === 'beam') S.primary = 'beam';
    if (Q.get('weapon') === 'gun') S.primary = 'gun';
    if (Q.get('rockets')) S.rocketLv = Number(Q.get('rockets'));
    if (Q.get('bazooka')) S.bazookaLv = Number(Q.get('bazooka'));
    if (Q.get('hp')) S.hp = Number(Q.get('hp'));
  }
  updateHP(); updateWeaponHud();
}

// ---------------------------------------------------------------- wingmen (round-2 drones)
function setDrones(n, fromX, fromZ, quiet) {
  n = clamp(Math.round(n), 0, MAXD);
  let k = 0;
  while (wingmen.length < n) {
    const s = sprite(TEX.plane, WING_W, 0.5, 0.5, 2);
    const w = { sprite: s, x: fromX ?? S.px, z: fromZ ?? 0, ph: rand(0, TAU), fireT: rand(0, 0.4), spawn: 0, hp: 10, max: 10, barT: 0, aim: 0, aimT: 0 };
    s.position.set(w.x, 0.45, w.z); wingmen.push(w);
    if (!quiet && k < 12) pop('+1', w.x + rand(-0.6, 0.6), 1.3, w.z + 0.5, '#ffd84a', 0.62, '#5a3300', k * 0.05);
    k++;
  }
  while (wingmen.length > n) {
    const w = wingmen.pop(); explode(w.sprite.position.x, 0.45, w.sprite.position.z, 0.7, false); scene.remove(w.sprite);
  }
  S.drones = n; S.maxDrones = Math.max(S.maxDrones, n);
}
function gainDrones(v, x, z) {
  const before = S.drones; setDrones(S.drones + v, x, z);
  if (v >= 5) upRing = { t: 0, col: '#ffd84a' };
  if (before + v > MAXD) pop('SQUAD FULL \u00b7 ' + MAXD, S.px, 1.6, -3.4, '#ffe066', 0.7, '#3a2a00');
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
const BUG = {
  spider: { tex: 'spider', w: 1.75, cy: 0.1, r: 0.8, spd: [1.3, 2.1], turn: 2.2, pdmg: 12, ddmg: 5, r2: true, anim: 11 },
  brute: { tex: 'boss', w: 2.7, cy: 0.1, r: 1.15, spd: [0.9, 1.2], turn: 1.3, pdmg: 25, ddmg: 10, r2: true, anim: 7, big: true },
  redspider: { tex: 'redspider', w: 1.45, cy: 0.4, r: 0.7, spd: [1.8, 2.6], turn: 2.2, pdmg: 15, ddmg: 5, anim: 11, hover: 0.35 },
  beetle: { tex: 'beetle', w: 2.6, cy: 0.4, r: 1.25, spd: [0.55, 0.7], turn: 1.0, pdmg: 45, ddmg: 10, elite: true, anim: 6, hover: 0.35 },
  wasp: { tex: 'wasp', w: 2.0, cy: 0.4, r: 0.85, spd: [4.2, 5.0], turn: 4.0, pdmg: 25, ddmg: 10, anim: 30, hover: 0.9 },
  spitter: { tex: 'spitter', w: 2.0, cy: 0.4, r: 0.95, spd: [1.0, 1.2], turn: 1.5, pdmg: 25, ddmg: 10, elite: true, anim: 11, hover: 0.35 },
};
function newBug(x, z, type, hp, src = 'wave') {
  const B = BUG[type];
  const s = sprite(TEX[B.tex], B.w, 0.5, B.cy, type === 'wasp' ? 1.6 : 1);
  const o = { sprite: s, type, x, z, hp, max: hp, r: B.r, vx: 0, vz: 0, spd: rand(B.spd[0], B.spd[1]), ph: rand(0, TAU), flash: 0, barT: 0, elite: !!B.elite, t: 0,
    state: 'in', holdT: 0, spitT: rand(0.6, 1.2), bx: x, src, seen: false };
  s.position.set(x, 0.3, z);
  bugs.push(o); AUD.bugs++; return o;
}
const POD = { can: { tex: 'pod', w: 2.3, cy: 0.05 }, orb: { tex: 'capsule', w: 3.2, cy: 0.32 }, crate1: { tex: 'crate1', w: 1.95, cy: 0.32 }, cocoon: { tex: 'cocoon', w: 1.3, cy: 0.32 } };
function spawnEvent(e) {
  // everything with a position spawns beyond the top edge, even if the script is running late
  const z = e.d !== undefined ? Math.min(-(e.d - S.dist), TOP_Z - 2) : 0;
  if (e.k === 'bug') newBug(e.x, z, e.type, e.hp);
  else if (e.k === 'pod') {
    const P = POD[e.kind];
    const s = sprite(TEX[P.tex], P.w, 0.5, P.cy, 1);
    pods.push({ sprite: s, kind: e.kind, x: e.x, z, hp: e.hp, max: e.hp, reward: e.reward, flash: 0, jolt: 0, w: P.w, ph: rand(0, TAU) });
  } else if (e.k === 'gate') {
    AUD.gates++;
    if (gates.some((o) => !o.passed && Math.abs(o.z - z) < 3)) AUD.gatePairs++;
    const tex = canvasTex(GW_PX, GH_PX, () => { });
    const g = { x: e.x, z, val: e.val, tex, passed: false, bump: 0, dirty: false, redrawT: 0, flash: 0, kind: '' };
    redrawGate(g);
    const m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
    g.sprite = new THREE.Sprite(m); g.sprite.center.set(0.5, 0.02); g.sprite.scale.set(GATE_W, GATE_H, 1); g.sprite.renderOrder = 1.2; scene.add(g.sprite);
    g.sprite.position.set(g.x, 0, z);
    gates.push(g);
  } else if (e.k === 'tip') tips.push({ text: e.text, target: e.target, t: 0, dur: e.dur || 3 });
  else if (e.k === 'banner') banner(e.text, e.sub, e.warn, 2);
  else if (e.k === 'warn') {
    banner('WARNING!', BOSSES[MISSION_BOSS].name + ' INBOUND', true, 2.8); sfx('warn'); setTimeout(() => sfx('warn'), 450); setTimeout(() => sfx('warn'), 900);
  } else if (e.k === 'boss') spawnBoss(MISSION_BOSS);
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
    const glass = kind === 'glass';
    const c = glass ? [rand(0.5, 0.8), rand(0.8, 0.95), 1] : kind === 'metal' ? [rand(0.45, 0.65), rand(0.48, 0.66), rand(0.52, 0.7)] : kind === 'green' ? [rand(0.3, 0.45), rand(0.42, 0.55), rand(0.25, 0.35)] : [rand(0.55, 0.8), rand(0.33, 0.48), rand(0.16, 0.26)];
    debris.push({ glass, x: x + rand(-0.6, 0.6), y: rand(0.4, 1.6), z: z + rand(-0.4, 0.4), vx: Math.cos(a) * sp, vy: rand(2, 7), vz: Math.sin(a) * sp * 0.7 - 1, rot: rand(0, TAU), vr: rand(-14, 14), sx: glass ? rand(0.25, 0.55) : rand(0.14, 0.24), sz: glass ? rand(0.25, 0.55) : rand(0.5, 1.0), c, t: 0, life: rand(0.7, 1.2) });
  }
}
function pop(text, x, y, z, color = '#fff', size = 1, stroke = '#0b2440', delay = 0) { pops.push({ text, x, y, z, t: -delay, color, size, stroke }); }
let bannerT = 0;
function banner(text, sub, warn, dur = 1.6) {
  const b = $('banner'); b.innerHTML = text + (sub ? `<small>${sub}</small>` : ''); b.className = 'show' + (warn ? ' warn' : ''); bannerT = dur;
}

// ---------------------------------------------------------------- damage & rewards
function hurtPlayer(dmg = 20, by = '') {
  if (S.inv > 0 || godMode || S.mode !== 'play') return;
  S.hp = Math.max(0, S.hp - dmg); S.inv = 0.6; S.barT = 2.2; flashRed = 1; updateHP(); sfx('hurt');
  if (navigator.vibrate && navigator.userActivation && navigator.userActivation.hasBeenActive) try { navigator.vibrate(80); } catch (e) { }
  if (S.hp <= 0) { S.deathBy = by; killPlayer(); }
}
function killPlayer() {
  if (S.mode !== 'play') return;
  explode(S.px, 0.5, 0, 2.2); shake = 0.8; flashRed = 1; planeSprite.visible = false; setDrones(0);
  S.hp = 0; updateHP(); S.mode = 'dead'; S.endT = 1.6; sfx('lose');
}
function loseDrones(n, x, z) {
  if (S.drones <= 0) { hurtPlayer(35, 'crash'); return; }
  setDrones(S.drones - n); pop('\u2212' + n, x, 1.2, z, '#ff6a5a', 0.9, '#3a0b0b'); sfx('bad');
}
function killBug(s, i) {
  const B = BUG[s.type];
  explode(s.x, 0.4, s.z, B.big ? 1.6 : s.type === 'beetle' ? 1.7 : s.elite ? 1.3 : 0.85, true, s.type === 'spitter' ? [0.4, 0.95, 0.2] : [0.75, 0.1, 0.08]);
  scene.remove(s.sprite); bugs.splice(i, 1); S.kills++;
}
function breakPod(p, i) {
  const k = p.kind;
  if (k === 'orb' || k === 'cocoon') { burst(p.x, p.z, 'glass', k === 'orb' ? 36 : 22); sfx('glass'); explode(p.x, 0.9, p.z, k === 'orb' ? 1.4 : 0.9, false); }
  else if (k === 'can') { burst(p.x, p.z, 'metal', 16); explode(p.x, 1, p.z, 1.6, true, [0.6, 0.62, 0.66]); }
  else { burst(p.x, p.z, 'wood', 20); sfx('wood'); explode(p.x, 0.8, p.z, 1.2, false); }
  scene.remove(p.sprite); pods.splice(i, 1);
  giveReward(p.reward, p.x, p.z);
}
function setTier(n, x, z) {
  n = clamp(n, 0, 2); if (n === S.tier) { flyIcons.push({ name: 'power', x, z, t: 0 }); sfx('power'); return; }
  S.tier = n; const T = T_();
  // every round already in the air changes colour and hits harder at once (drones copy the jet)
  for (const b of shots) if (b.kind === 'bullet') { b.dmg = b.drone ? T.dDmg : T.dmg; b.w = T.w * (b.drone ? 0.72 : 1); b.len = T.len * (b.drone ? 0.72 : 1); }
  AUD.tiers.push({ t: +S.t.toFixed(2), tier: n, name: T.name, inAir: shots.length });
  weaponFlash = 1; upRing = { t: 0, col: n === 2 ? '#7cc4ff' : '#ffa040' };
  flyIcons.push({ name: 'power', x, z, t: 0 });
  banner(n === 1 ? 'ORANGE ROUNDS!' : 'BLUE ROUNDS!', n === 1 ? 'Hotter bullets, more damage' : 'Maximum firepower', false, 1.6);
  updateWeaponHud(); sfx('power');
}
function giveReward(R, x = S.px, z = -6) {
  if (R.power) { setTier(S.tier + R.power, x, z); return; }
  if (R.weapon === 'beam') {
    S.primary = 'beam'; weaponFlash = 1; upRing = { t: 0, col: '#9fe0ff' }; flyIcons.push({ name: 'beam', x, z, t: 0 });
    banner('BEAM!', 'Pierces the whole swarm', false, 1.6); updateWeaponHud(); sfx('power'); return;
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
    pop(R.pilot ? 'PILOT RESCUED!' : '+' + R.drones, x, 2.4, z, '#ffe066', R.pilot ? 0.8 : 1.2, '#4a2e00');
    if (R.pilot) banner('PILOT RESCUED!', '+' + got + ' drones join up', false, 1.4);
    sfx('gate');
  }
  if (R.hp) {
    const heal = Math.min(S.hpMax - S.hp, R.hp); S.hp += heal; S.barT = 2.2; updateHP();
    pop('+' + R.hp + ' HP', x, 2.4, z, '#8dff7a', 1, '#0b3a10'); sfx('power');
  }
}
const flyIcons = [];
function hitGate(t, tick) {
  if (t.val >= GATE_MAX) return;
  const was = t.val; t.val = Math.min(GATE_MAX, t.val + tick); t.dirty = true; t.bump = Math.min(1, t.bump + 0.2); t.flash = 1;
  if ((was < 0) !== (t.val < 0)) { t.redrawT = 0; sfx('flip'); for (let k = 0; k < 24; k++) fx.spawn({ x: t.x + rand(-1.2, 1.2), y: rand(0.3, 1.6), z: t.z, vx: rand(-3, 3), vy: rand(0, 3), vz: rand(-1, 2), life: rand(0.3, 0.6), s0: 0.6, s1: 0.1, r: 0.5, g: 0.85, b: 1, a: 1, world: true }); }
  if (t.val >= GATE_MAX) {
    t.redrawT = 0; sfx('max');
    for (let k = 0; k < 50; k++) fx.spawn({ x: t.x + rand(-1.3, 1.3), y: rand(0.3, 1.8), z: t.z, vx: rand(-4, 4), vy: rand(0, 4), vz: rand(-2, 3), life: rand(0.4, 0.9), s0: 0.7, s1: 0.1, r: 1, g: 0.85, b: 0.3, a: 1, world: true });
  } else sfx('tick');
}
function damage(t, kind, dmg, i, tick = 1) {
  if (kind === 's') { t.hp -= dmg; t.flash = 1; t.barT = 1.4; if (t.hp <= 0) killBug(t, i < 0 ? bugs.indexOf(t) : i); }
  else if (kind === 'p') { t.hp -= dmg; t.flash = 1; t.jolt = 1; if (t.hp <= 0) breakPod(t, i < 0 ? pods.indexOf(t) : i); }
  else if (kind === 'g') hitGate(t, tick);
  else if (kind === 'b') {
    if (t.state === 'enter' || t.state === 'dying') return; t.hp -= dmg; t.flash = 1;
    if (t.hp <= 0) { t.hp = 0; t.state = 'dying'; t.t = 0; sfx('roar'); slowmo = 0.4; shake = Math.max(shake, 0.6); }
  }
}
function passGate(g) {
  const v = g.val, gold = v >= GATE_MAX;
  if (v > 0) {
    gainDrones(v, g.x, g.z);
    const heal = Math.min(S.hpMax - S.hp, 15 + Math.min(35, v));
    pop(gold ? 'MAX!' : '+' + v, S.px, 2.4, -1.5, gold ? '#ffe066' : '#9fe8ff', 1.6, gold ? '#5a3300' : '#0b2a5a');
    if (heal > 0) { S.hp += heal; S.barT = 2.2; pop('+' + Math.round(heal) + ' HP', S.px, 1.2, 0.8, '#8dff7a', 0.8, '#0b3a10'); updateHP(); }
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
let dragging = false, lastX = 0, keyL = false, keyR = false;
function onDown(e) {
  initAudio();
  if (S.mode === 'title' && ready) { startGame(); }
  dragging = true; lastX = e.clientX;
}
wrap.addEventListener('pointerdown', onDown);
wrap.addEventListener('touchend', () => initAudio());
wrap.addEventListener('click', () => initAudio());
window.addEventListener('pointermove', (e) => {
  if (!dragging) return; const dx = e.clientX - lastX; lastX = e.clientX;
  if (S.mode === 'play') S.tx = clamp(S.tx + dx * (2 * XMAX) / (W * 0.62), -XMAX, XMAX);
});
const up = () => { dragging = false; };
window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());
window.addEventListener('keydown', (e) => {
  if (['ArrowLeft', 'a', 'A'].includes(e.key)) keyL = true;
  if (['ArrowRight', 'd', 'D'].includes(e.key)) keyR = true;
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
  if (!Q.get('warp')) banner('MISSION 1', 'Get to Ridgeback', false, 1.8);
}
function endGame(win) {
  const e = $('end'); e.classList.remove('hidden'); e.classList.toggle('lose', !win); e.classList.remove('play'); void e.offsetWidth; e.classList.add('play');
  $('endtitle').textContent = win ? 'RIDGEBACK IN SIGHT' : 'SHOT DOWN';
  $('endsub').textContent = win ? 'The Chitin Queen is down. The squadron flies on to Ridgeback.' : ({ gate: 'A negative gate with no drones is fatal. Shoot it blue first!', crash: 'Flying into a canister with no drones hurts. Shoot it open!' }[S.deathBy] || 'The Chitin got you. Regroup, pilot!');
  $('st-kills').textContent = S.kills; $('st-drones').textContent = win ? S.drones : S.maxDrones; $('st-time').textContent = Math.round(S.t) + 's';
  const stars = win ? 1 + (S.hp >= 50) + (S.drones >= 12) : 0;
  [...document.querySelectorAll('.bstar')].forEach((s, i) => s.classList.toggle('on', i < stars));
  $('hud').classList.add('hidden'); $('bossbar').classList.add('hidden');
}

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
      const hps = (S.primary === 'beam' ? 18 : T.rate * (T.twin ? 2 : 1)) + Math.min(S.drones, 7) * 3;
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
}

// ---------------------------------------------------------------- weapons
function fire(x, z, vx, vz, drone) {
  const T = T_();
  const b = { kind: 'bullet', x, z, vx, vz, dmg: drone ? T.dDmg : T.dmg, tick: 1, w: T.w * (drone ? 0.72 : 1), len: T.len * (drone ? 0.72 : 1), drone };
  shots.push(b); return b;
}
function firePrimary(dt) {
  if (S.primary === 'beam') return;   // the beam is drawn and applied in update()
  const T = T_(); S.fireT -= dt;
  while (S.fireT <= 0) {
    S.fireT += 1 / T.rate;
    if (AUD.firstShotT < 0) AUD.firstShotT = +S.t.toFixed(3);
    const guns = T.twin ? [-0.55, 0.55] : [S.gunSide ? 0.55 : -0.55]; S.gunSide ^= 1;
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
    w.fireT += 1 / 3;
    // straight ahead, unless a bug is right on top of the main plane: then nearby drones turn to shoot it
    let tgt = null, best = 1e9;
    for (const s of bugs) {
      if (s.z < -6.5 || s.z > 2) continue;
      if (Math.hypot(s.x - S.px, s.z) > 4.2) continue;
      const dw = Math.hypot(s.x - w.x, s.z - w.z);
      if (dw < 5 && dw < best) { best = dw; tgt = s; }
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
  wingmen.forEach((w, i) => {
    const [sx, sz] = SLOTS[i] || [0, 3]; const k = 1 - Math.exp(-dt * (w.spawn < 1 ? 3.5 : 7));
    w.spawn = Math.min(1, w.spawn + dt * 1.2); w.barT = Math.max(0, w.barT - dt);
    w.x = lerp(w.x, S.px + sx, k); w.z = lerp(w.z, sz, k);
    w.aimHold = Math.max(0, (w.aimHold || 0) - dt); if (w.aimHold <= 0) w.aimT = 0;
    w.aim = lerp(w.aim, w.aimT, 1 - Math.exp(-dt * 12));
    const wb = Math.sin(now * 0.004 + w.ph) * 0.1;
    w.sprite.position.set(w.x, 0.45 + wb, w.z);
    w.sprite.material.rotation = clamp(-(S.px + sx - w.x) * 0.25, -0.4, 0.4) + w.aim;
  });

  if (play) { firePrimary(dt); fireWingmen(dt); fireSecondary(dt); }

  // bugs: fly in from ahead, then curve towards the player
  for (let i = bugs.length - 1; i >= 0; i--) {
    const s = bugs[i]; s.t += dt; const B = BUG[s.type];
    let hx = S.px, turn = B.turn, spd = s.spd, extraZ = 0, held = false;
    if (s.type === 'wasp' && s.z < -15) { hx = s.bx + Math.sin(s.t * 2.3 + s.ph) * 2.6; spd = s.spd * 0.8; }
    if (s.type === 'spitter') {
      if (s.state === 'in' && s.z > -16) { s.state = 'hold'; s.holdT = 0; }
      if (s.state === 'hold') {
        s.holdT += dt; extraZ = -dz; // hangs back: keeps its distance
        s.vx = lerp(s.vx, clamp((S.px - s.x) * 0.5, -1.2, 1.2), 1 - Math.exp(-dt * 2)); s.vz = lerp(s.vz, 0, 1 - Math.exp(-dt * 3));
        s.spitT -= dt;
        if (play && s.spitT <= 0) { s.spitT = 2.0; lob(s.x, s.z + 0.6, S.px + S.vx * 0.25, 1.7); sfx('spit'); }
        if (s.holdT > 7.5) s.state = 'dive';
      }
    }
    // never close in on a gate from behind: hold station and slide round it
    for (const g of gates) {
      if (g.passed) continue;
      const gap = g.z - s.z;
      if (gap > 0 && gap < GAP_Z && Math.abs(s.x - g.x) < GATE_W / 2 + s.r) { held = true; hx = g.x + (s.x < g.x ? -1 : 1) * (GATE_W / 2 + s.r + 0.8); }
    }
    if (play && s.state !== 'hold' && s.z < 1) {
      const dx = hx - s.x, dzz = 0.2 - s.z, d = Math.hypot(dx, dzz) || 1;
      const k = 1 - Math.exp(-dt * turn);
      s.vx = lerp(s.vx, dx / d * spd, k); s.vz = lerp(s.vz, dzz / d * spd, k);
    }
    if (held && s.vz > 0) s.vz = 0;
    const lim = hwAt(s.z);
    s.x = clamp(s.x + (s.vx + Math.sin(s.ph * 0.3) * 0.2) * dt, -lim, lim); s.z += dz + extraZ + s.vz * dt;
    s.ph += dt * B.anim; s.barT = Math.max(0, s.barT - dt); s.hitCd = Math.max(0, (s.hitCd || 0) - dt);
  }
  // keep swarms from collapsing into one blob
  for (let i = 0; i < bugs.length; i++) {
    const a = bugs[i]; if (a.z < -50) continue;
    for (let j = i + 1; j < bugs.length; j++) {
      const b = bugs[j]; const dx = b.x - a.x, dzz = b.z - a.z; const min = (a.r + b.r) * 0.55;
      if (dx > min || dx < -min || dzz > min || dzz < -min) continue;
      const d = Math.hypot(dx, dzz) || 0.01; if (d >= min) continue;
      const push = (min - d) * 0.5 / d; a.x -= dx * push; a.z -= dzz * push; b.x += dx * push; b.z += dzz * push;
    }
  }
  // clear sky behind gates: a bug may not move into the zone just behind a gate (within GAP_Z and overlapping it)
  for (const s of bugs) {
    if (inGateShadow(s.x, s.z, s.r)) {
      if (s.okx !== undefined && !inGateShadow(s.okx, s.okz + dz, s.r)) { s.x = s.okx; s.z = s.okz + dz; if (s.vz > 0) s.vz = 0; }
      else {   // no safe previous spot (e.g. a gate appeared in front of it): step sideways out of the gate's lane
        const g = gateShadowOf(s.x, s.z, s.r);
        if (g) { const side = s.x < g.x ? -1 : 1, hw = hwAt(s.z) - s.r * 0.5; let nx = g.x + side * (GATE_W / 2 + s.r * 0.5 + 0.15);
          if (Math.abs(nx) > hw) nx = g.x - side * (GATE_W / 2 + s.r * 0.5 + 0.15);
          if (Math.abs(nx) <= hw + 0.01) { s.x = nx; s.bx = nx; } else s.z = Math.min(s.z, g.z - GAP_Z - 0.05); }
      }
    }
    s.okx = s.x; s.okz = s.z;
  }
  for (let i = bugs.length - 1; i >= 0; i--) {
    const s = bugs[i]; const B = BUG[s.type];
    const sp = s.sprite, w0 = B.w, img = sp.material.map.image;
    if (B.r2) {   // round-2 scuttle
      sp.position.set(s.x, 0.25 + Math.abs(Math.sin(s.ph)) * 0.12, s.z);
      sp.scale.set(w0 * (1 + Math.sin(s.ph * 2) * 0.03), w0 * img.height / img.width * (1 - Math.sin(s.ph * 2) * 0.05), 1);
      sp.material.rotation = clamp(-s.vx * 0.14, -0.35, 0.35) + Math.sin(s.ph) * 0.05;
    } else {
      sp.position.set(s.x, B.hover + Math.abs(Math.sin(s.ph)) * 0.1, s.z);
      const pulse = s.type === 'wasp' ? Math.sin(s.ph) * 0.06 : Math.sin(s.ph * 2) * 0.03;
      sp.scale.set(w0 * (1 + pulse), w0 * img.height / img.width * (1 - pulse * 0.6), 1);
      sp.material.rotation = s.type === 'spitter' && s.state === 'hold' ? Math.sin(s.t * 3) * 0.06 : clamp(-Math.atan2(s.vx, Math.max(0.5, s.vz)) * 0.8, -0.6, 0.6);
    }
    s.flash = Math.max(0, s.flash - dt * 8); sp.material.color.setScalar(1 + s.flash * 1.6);
    if (play && s.z > -1.2 && s.z < 1.6 && !s.hitCd) {
      let hitW = -1, hitD = 1e9;
      wingmen.forEach((w, j) => { const d = Math.abs(w.x - s.x); if (d < 0.7 + s.r * 0.5 && Math.abs(w.z - s.z) < 0.85 && d < hitD) { hitD = d; hitW = j; } });
      if (hitW >= 0) {
        damageWingman(hitW, B.ddmg);
        if (s.type === 'beetle') { s.hitCd = 0.35; damage(s, 's', 12, i); } else killBug(s, i);
        continue;
      }
      if (Math.abs(S.px - s.x) < 1.0 + s.r * 0.4 && Math.abs(s.z) < 0.9) {
        hurtPlayer(B.pdmg, 'bug');
        if (s.type === 'beetle') { s.hitCd = 1; } else { killBug(s, i); continue; }
      }
    }
    if (s.z > 6) { scene.remove(s.sprite); bugs.splice(i, 1); }
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
    const sc = 1 + g.bump * 0.06 + (g.val >= GATE_MAX ? Math.sin(now * 0.012) * 0.02 : 0);
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

  // targets inside bullet range
  const targets = [];
  for (const g of gates) if (!g.passed && g.z < -1 && g.z > RANGE_Z - 0.5) targets.push([g, 'g', GATE_W / 2 - 0.05, 0.4]);
  for (const s of bugs) if (s.z > RANGE_Z - 1) targets.push([s, 's', s.r, s.elite || BUG[s.type].big ? 1 : 0.7]);
  for (const p of pods) if (p.z > RANGE_Z - 1) targets.push([p, 'p', p.w * 0.42, 0.8]);
  if (boss && boss.state !== 'enter' && boss.state !== 'dying' && boss.z > RANGE_Z - 1.5) targets.push([boss, 'b', boss.hitW, boss.hitD]);
  const alive = (t, k) => k === 's' ? bugs.includes(t) : k === 'p' ? pods.includes(t) : k === 'b' ? boss === t && t.state !== 'dying' : !t.passed;

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

  for (let i = flyIcons.length - 1; i >= 0; i--) { const f = flyIcons[i]; f.t += dt * 1.4; if (f.t >= 1) flyIcons.splice(i, 1); }
  for (let i = pops.length - 1; i >= 0; i--) { const p = pops[i]; p.t += dt; if (p.t > 0) p.z += dz * 0.2; if (p.t > 1.1) pops.splice(i, 1); }
  for (let i = tips.length - 1; i >= 0; i--) { const t = tips[i]; t.t += dt; if (t.t > t.dur) tips.splice(i, 1); }
  if (upRing) { upRing.t += dt; if (upRing.t > 0.9) upRing = null; }
  weaponFlash = Math.max(0, weaponFlash - dt * 1.6);

  fx.update(dt, v); smokeFx.update(dt, v); worldFx.update(dt, v);

  if (S.mode === 'dead' || S.mode === 'win') { S.endT -= dt / Math.max(slowmo, 0.3); if (S.endT <= 0 && !S.ended) { S.ended = true; endGame(S.mode === 'win'); } }
  if (play) $('progfill').style.width = clamp(S.t / BOSS_T * 100, 0, 100) + '%';
  if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) $('banner').className = ''; }
  shake = Math.max(0, shake - dt * 2.2); flashRed = Math.max(0, flashRed - dt * 2.5);
}
function lob(x0, z0, x1, T) {
  acids.push({ x0, z0, x1: clamp(x1, -4, 4), z1: 0.2, t: 0, T, peak: 3.2, x: x0, z: z0, y: 0.5 });
}

// ---------------------------------------------------------------- bosses
// Mission 1 uses the round-2 Chitin Queen. Kingsting (round 3) stays in the table, dormant, for a later stage.
const BOSSES = {
  queen: { name: 'CHITIN QUEEN', hp: 9000, sub: 'Shoot it down!' },
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
      b.z = b.hoverZ; b.state = 'fight'; b.t = 0; banner(BOSSES.queen.name, BOSSES.queen.sub, true, 1.8); shake = Math.max(shake, 0.6); sfx('roar');
      $('bossbar').classList.remove('hidden');
    }
  } else if (b.state === 'fight') {
    const enr = b.hp < b.max * 0.5;
    if (enr && !b.enraged) { b.enraged = true; banner('ENRAGED!', 'Watch the red strip', true, 1.4); sfx('roar'); flashRed = 0.6; b.atkT = Math.min(b.atkT, 1.2); }
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
    b.x += Math.sin(b.t * 40) * 0.05;
    if (Math.random() < dt * 14) explode(b.x + rand(-2.5, 2.5), rand(0.5, 3.5), b.z + rand(-1, 1), rand(1, 1.8), Math.random() < 0.5);
    shake = Math.max(shake, 0.3);
    if (b.t > 1.8) {
      explode(b.x, 1.5, b.z, 4, true, [0.75, 0.1, 0.08]); shake = 1.2;
      scene.remove(b.sprite); boss = null; slowmo = 1; $('bossbar').classList.add('hidden');
      for (const s of bugs) { explode(s.x, 0.4, s.z, 0.8, false); scene.remove(s.sprite); }
      bugs = []; drops = []; acids = [];
      S.mode = 'win'; S.endT = 2.6; sfx('win'); banner('QUEEN DOWN!', 'Ridgeback is in sight', false, 2.4);
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
      if (!b.arrived) { b.arrived = true; banner('KINGSTING', 'Colossal hornet \u00b7 bring it down!', true, 2); shake = Math.max(shake, 0.8); sfx('roar'); bb.classList.remove('hidden'); flashRed = 0.4; }
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
    shake = Math.max(shake, 0.3);
    if (b.t > 1.9) {
      explode(b.x, 1.5, b.z, 4, true, [0.75, 0.1, 0.08]); shake = 1.3;
      burst(b.x, b.z, 'green', 20);
      scene.remove(b.sprite); scene.remove(b.glow); boss = null; slowmo = 1; bb.classList.add('hidden');
      for (const s of bugs) { explode(s.x, 0.4, s.z, 0.8, false); scene.remove(s.sprite); }
      bugs = []; acids = []; stings = [];
      S.mode = 'win'; S.endT = 2.6; sfx('win'); banner('KINGSTING DOWN!', 'Ridgeback is in sight', false, 2.4);
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
    if (!s.seen || s.src === 'boss') continue;
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
      const key = p.reward.power ? 'power' : p.reward.weapon === 'beam' ? 'beam' : p.reward.rockets ? 'rockets' : p.reward.bazooka ? 'bazooka' : 'drones';
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
    } else {
      const [x, y, u] = onSprite(s, 0.5, 0.72);
      txt(String(Math.max(0, Math.ceil(p.hp))), x, y, Math.max(12, u * 0.72), '#fff', '#1a1208', 0.18);
      const [bx, by] = onSprite(s, 0.5, 0.12); const r = p.reward, bw = u * 2.1, bh = u * 0.95, bb = bob * u * 0.05;
      ctx.fillStyle = r.hp ? 'rgba(20,90,30,.88)' : 'rgba(12,40,90,.88)'; ctx.strokeStyle = r.hp ? '#9dff8a' : '#9fe0ff'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.roundRect(bx - bw / 2, by - bh / 2 + bb, bw, bh, bh / 2); ctx.fill(); ctx.stroke();
      if (r.hp) txt('\u2665 +' + r.hp, bx, by + bb + 1, bh * 0.62, '#b8ffa8', '#0b2a10', 0.14);
      else { const pi = TEX.plane.image, iw = bh * 1.25; ctx.drawImage(pi, bx - bw / 2 + 4, by - iw * pi.height / pi.width / 2 + bb, iw, iw * pi.height / pi.width); txt('+' + r.drones, bx + bh * 0.42, by + bb + 1, bh * 0.66, '#fff', '#0b2440', 0.14); }
    }
  }
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
    const sc = p.size * (k < 0.15 ? 0.6 + k / 0.15 * 0.6 : 1.2 - Math.min(0.2, (k - 0.15)));
    txt(p.text, x, y - k * 50, 30 * sc, p.color, p.stroke, 0.2); ctx.globalAlpha = 1;
  }
  // tutorial speech bubbles
  for (const t of tips) {
    let x = W / 2, y = H * 0.5;
    if (t.target === 'plane') { [x, y] = toScreen(S.px, 0.5, -1.4); }
    else if (t.target === 'gate') { const g = gates.find((g) => !g.passed && g.z < -4 && g.z > TOP_Z + 4); if (!g) { if (t.t > 0.1) t.t = Math.max(t.t, t.dur - 0.25); else t.t = 0; continue; } [x, y] = onSprite(g.sprite, 0.5, 0.0); y -= 6; }
    else if (t.target === 'can') { const p = pods.find((p) => p.kind === 'can' && p.z < -3 && p.z > TOP_Z + 6); if (!p) { t.t = Math.min(t.t, 0.01); continue; } const u = unitPx(p.x, 0, p.z); [x, y] = toScreen(p.x, 0.15 + p.w * 1.1, p.z); y -= u * 1.8; }
    bubble(t.text, x, y, t.t, t.dur);
  }
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

// ---------------------------------------------------------------- resize / loop
function resize() {
  W = wrap.clientWidth; H = wrap.clientHeight; DPR = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(DPR); renderer.setSize(W, H, false);
  uic.width = Math.round(W * DPR); uic.height = Math.round(H * DPR);
  const aspect = W / H; camera.aspect = aspect; wcam.aspect = aspect;
  const t = Math.max(Math.tan(THREE.MathUtils.degToRad(FOVV)), Math.tan(THREE.MathUtils.degToRad(19.5)) / aspect);
  wcam.fov = THREE.MathUtils.radToDeg(2 * Math.atan(t));
  wcam.position.copy(CAM_POS); wcam.lookAt(CAM_LOOK); wcam.updateProjectionMatrix(); wcam.updateMatrixWorld();
  const tg = Math.max(Math.tan(THREE.MathUtils.degToRad(GFOV)), Math.tan(THREE.MathUtils.degToRad(GFOV * 0.52)) / aspect);
  camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(tg));
  camera.position.copy(GCAM_POS); camera.lookAt(GCAM_LOOK); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
  // bullets reach about three quarters of the way up the screen
  let lo = -90, hi = -2;
  for (let i = 0; i < 32; i++) { const mid = (lo + hi) / 2; if (toScreen(0, 0.5, mid)[1] < H * 0.25) lo = mid; else hi = mid; }
  RANGE_Z = (lo + hi) / 2;
  // the top edge of the screen for anything up to 1 unit above the play plane: spawns happen beyond it
  lo = -300; hi = -2;
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (toScreen(0, 1.0, mid)[1] < 0) lo = mid; else hi = mid; }
  TOP_Z = lo; SPAWN_D = -(TOP_Z - 2);
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
  const shx = (Math.random() - 0.5) * shake, shy = (Math.random() - 0.5) * shake;
  wcam.position.set(CAM_POS.x + S.px * 0.25, CAM_POS.y, CAM_POS.z); wcam.lookAt(CAM_LOOK.x + S.px * 0.2, CAM_LOOK.y, CAM_LOOK.z);
  camera.position.set(GCAM_POS.x + S.px * 0.22 + shx * 0.8, GCAM_POS.y + shy * 0.6, GCAM_POS.z); camera.lookAt(GCAM_LOOK.x + S.px * 0.18 + shx * 0.4, GCAM_LOOK.y, GCAM_LOOK.z);
  renderer.clear();
  renderer.render(world, wcam);
  renderer.clearDepth();
  renderer.render(scene, camera);
  drawOverlay();
}

async function boot() {
  resize();
  // round-2 plane, drones, spiders, Queen and canister; round-3 bugs kept for cameos; Bupé's gold weapon icons
  const names = ['plane:r2_plane', 'spider:r2_spider', 'boss:r2_boss', 'pod:r2_pod', 'redspider:spider', 'beetle', 'wasp', 'spitter', 'crate1', 'capsule', 'cocoon',
    'icon_minigun', 'icon_rockets', 'icon_bazooka', 'cloud1', 'cloud2', 'cloud3', 'smoke'];
  const files = { terrain: 'assets/terrain.jpg?v=' + VER };
  for (const n of names) { const [k, f] = n.split(':'); files[k] = `assets/${f || k}.webp?v=${VER}`; }
  await Promise.all(Object.entries(files).map(([k, f]) => loadTex(k, f)));
  try { await Promise.race([document.fonts.load(`900 40px NunitoG`), new Promise((r) => setTimeout(r, 1500))]); await document.fonts.load('40px Lilita'); } catch (e) { }
  setupIcons(); setupWorld(); resize(); resetGame(false);
  ready = true; $('loading').textContent = '';
  if (Q.has('autostart') || Q.has('autoplay')) startGame();
}
requestAnimationFrame(loop);
boot();

// debug hooks for automated tests
window.__AUDIT = AUD;
window.__G = { S, AUD, get bugs() { return bugs; }, get pods() { return pods; }, get gates() { return gates; }, get boss() { return boss; }, get wingmen() { return wingmen; },
  get shots() { return shots; }, get RANGE_Z() { return RANGE_Z; }, get TOP_Z() { return TOP_Z; }, god(v) { godMode = v; }, give: (r) => giveReward(r), tier: (n) => setTier(n, S.px, -6),
  hurt: (d) => hurtPlayer(d), setDrones: (n) => setDrones(n), toScreen, start: () => startGame(), camera, resize, unitPx, bosses: BOSSES };
