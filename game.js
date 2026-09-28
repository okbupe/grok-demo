import * as THREE from './vendor/three.module.min.js';

const Q = new URLSearchParams(location.search);
const BOT = Q.has('bot');
const TS = Number(Q.get('ts') || 1);
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

// ---------------------------------------------------------------- config
const LANE_X = [-2.25, 2.25];
const LINE_X = [-4.5, 0, 4.5];
const XMAX = 3.3;
const SPEED = 12;
const G = 36;           // ground depth below play level
const TILE = 170;       // world units per terrain tile
const MAXD = 32;        // max wingmen
const BOSS_D = 800;

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
const GCAM_POS = new THREE.Vector3(0, Number(Q.get('gy') || 16), Number(Q.get('gz') || 12));
const GCAM_LOOK = new THREE.Vector3(0, 0, Number(Q.get('glz') || -8));
const GFOV = Number(Q.get('gfov') || 21);
const CAM_POS = new THREE.Vector3(0, Number(Q.get('cy') || 7.0), Number(Q.get('cz') || 8.2));
const CAM_LOOK = new THREE.Vector3(0, 0, Number(Q.get('lz') || -6));
const FOVV = Number(Q.get('fov') || 33);
let W = 1, H = 1, DPR = 1, pxScale = 1;

// ---------------------------------------------------------------- textures
const loader = new THREE.TextureLoader();
const TEX = {};
function loadTex(name, file) {
  return new Promise((res) => {
    loader.load(file, (t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; TEX[name] = t; res(t); }, undefined, () => res(null));
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
const T_DOT = canvasTex(64, 64, (g, w, h) => radial(g, w, h, [[0, 'rgba(255,255,255,1)'], [0.42, 'rgba(255,255,255,1)'], [0.55, 'rgba(220,240,255,.45)'], [1, 'rgba(200,230,255,0)']]), false);
const T_TRACER = canvasTex(32, 128, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.beginPath(); g.ellipse(w / 2, h / 2, w / 2 - 2, h / 2 - 1, 0, 0, TAU); g.fill();
}, false);
const T_RING = canvasTex(128, 128, (g, w, h) => radial(g, w, h, [[0, 'rgba(255,255,255,0)'], [0.72, 'rgba(255,255,255,0)'], [0.86, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0)']]), false);
const T_STRIP = canvasTex(64, 256, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.15, 'rgba(255,255,255,.9)'); gr.addColorStop(0.5, 'rgba(255,255,255,.35)'); gr.addColorStop(0.85, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 32) { g.fillStyle = 'rgba(255,255,255,.5)'; g.beginPath(); g.moveTo(8, y + 24); g.lineTo(w / 2, y + 6); g.lineTo(w - 8, y + 24); g.lineTo(w - 8, y + 30); g.lineTo(w / 2, y + 12); g.lineTo(8, y + 30); g.fill(); }
}, false);
const T_MISSILE = canvasTex(32, 96, (g, w, h) => {
  g.fillStyle = '#e9eef2'; g.beginPath(); g.moveTo(w / 2, 2); g.quadraticCurveTo(w / 2 + 7, 14, w / 2 + 6, 30); g.lineTo(w / 2 + 6, 80); g.lineTo(w / 2 - 6, 80); g.lineTo(w / 2 - 6, 30); g.quadraticCurveTo(w / 2 - 7, 14, w / 2, 2); g.fill();
  g.fillStyle = '#e8b030'; g.fillRect(w / 2 - 6, 34, 12, 6);
  g.fillStyle = '#8a969e'; g.beginPath(); g.moveTo(w / 2 - 6, 64); g.lineTo(w / 2 - 14, 86); g.lineTo(w / 2 - 6, 80); g.moveTo(w / 2 + 6, 64); g.lineTo(w / 2 + 14, 86); g.lineTo(w / 2 + 6, 80); g.fill();
  g.fillStyle = '#ffcf60'; g.beginPath(); g.ellipse(w / 2, 86, 5, 9, 0, 0, TAU); g.fill();
});
const T_SHADOW = canvasTex(64, 64, (g, w, h) => radial(g, w, h, [[0, 'rgba(10,20,40,.55)'], [0.6, 'rgba(10,20,40,.3)'], [1, 'rgba(10,20,40,0)']]));

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
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending, depthWrite: false, fog: false, opacity });
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
      transparent: true, depthWrite: false, blending,
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
let ground, groundTex, dots, tracers, flats, shadows, fx, smokeFx, planeSprite;
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
  shadows = new FlatBatch(T_SHADOW, 80, THREE.NormalBlending, -1);
  dots = new FlatBatch(T_DOT, 400, THREE.AdditiveBlending, -1);
  flats = new FlatBatch(T_STRIP, 8, THREE.AdditiveBlending, 1);
  tracers = new FlatBatch(T_TRACER, 700, THREE.AdditiveBlending, 5);
  missilesB = new FlatBatch(T_MISSILE, 60, THREE.NormalBlending, 4);
  smokeFx = new Particles(900, THREE.NormalBlending, T_PUFF, 3);
  fx = new Particles(1400, THREE.AdditiveBlending, T_GLOW, 6);
  ringFx = new FlatBatch(T_RING, 40, THREE.AdditiveBlending, 5);
  planeSprite = sprite(TEX.plane, 2.7, 0.5, 0.5, 3);
  for (let i = 0; i < 9; i++) spawnCloud(rand(-420, 10), true);
  for (let i = 0; i < 5; i++) spawnSmoke(rand(-420, -40));
}
let missilesB, ringFx, worldFx;
function spawnCloud(z, init) {
  const big = Math.random() < 0.4;
  const side = Math.random() < 0.5 ? -1 : 1;
  const tex = TEX['cloud' + (1 + Math.floor(Math.random() * 3))];
  let c;
  if (big) {
    c = sprite(tex, rand(18, 26), 0.5, 0.5, 8);
    c.position.set(side * rand(9, 13), rand(-2, 2), z);
    c.material.opacity = 0.93;
  } else {
    c = sprite(tex, rand(14, 30), 0.5, 0.5, -2, world);
    c.position.set(side * rand(9, 24), rand(-G * 0.75, -5), z);
  }
  if (Math.random() < 0.5) c.scale.x *= -1;
  c.userData.v = 1; clouds.push(c);
}
function spawnSmoke(z) {
  const s = sprite(TEX.smoke, rand(5, 8), 0.5, 0.02, -3, world);
  s.scale.y *= rand(0.9, 1.3);
  s.position.set((Math.random() < 0.5 ? -1 : 1) * rand(4, 60), -G, z);
  s.userData.ph = rand(0, 10); smokes.push(s);
}

// ---------------------------------------------------------------- gates / badges art
const FONT = 'NunitoG, "Arial Rounded MT Bold", system-ui, sans-serif';
function drawGate(g, w, h, label, good) {
  g.clearRect(0, 0, w, h);
  const C = good ? { glow: 'rgba(150,225,255,', a: '90,175,255', b: '30,110,235', post: ['#2f7de0', '#5fb4ff', '#1d56b0'], stroke: '#0b2a5a' }
    : { glow: 'rgba(255,170,160,', a: '255,110,100', b: '220,40,50', post: ['#d23a3a', '#ff7a6a', '#8a1a1a'], stroke: '#4a0a0a' };
  // outer glowing frame
  g.save(); g.shadowColor = C.glow + '1)'; g.shadowBlur = 18; g.strokeStyle = C.glow + '.95)'; g.lineWidth = 6;
  g.beginPath(); g.roundRect(10, 10, w - 20, h - 26, 8); g.stroke(); g.restore();
  // glass
  const gx = 46, gy = 34, gw = w - 92, gh = h - 76;
  const gr = g.createLinearGradient(0, gy, 0, gy + gh);
  gr.addColorStop(0, `rgba(${C.a},.82)`); gr.addColorStop(0.5, `rgba(${C.a},.62)`); gr.addColorStop(1, `rgba(${C.b},.85)`);
  g.fillStyle = gr; g.fillRect(gx, gy, gw, gh);
  const hl = g.createRadialGradient(w * 0.35, gy + gh * 0.3, 10, w * 0.35, gy + gh * 0.3, gw * 0.7);
  hl.addColorStop(0, 'rgba(255,255,255,.35)'); hl.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = hl; g.fillRect(gx, gy, gw, gh);
  for (let i = 0; i < 70; i++) {
    const x = gx + Math.random() * gw, y = gy + Math.random() * gh, r = Math.random() * 3 + 0.8;
    g.fillStyle = `rgba(255,255,255,${0.3 + Math.random() * 0.6})`; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  }
  // posts
  for (const px of [gx - 18, gx + gw - 8]) {
    const pg = g.createLinearGradient(px, 0, px + 26, 0); pg.addColorStop(0, C.post[2]); pg.addColorStop(0.35, C.post[1]); pg.addColorStop(1, C.post[0]);
    g.fillStyle = pg; g.beginPath(); g.roundRect(px, gy - 14, 26, gh + 22, 6); g.fill();
    g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(px + 8, gy + 20, 4, gh * 0.45);
  }
  g.fillStyle = 'rgba(20,30,50,.85)'; g.fillRect(gx - 20, gy + gh + 4, gw + 40, 10);
  // label
  g.font = `900 ${label.length > 3 ? 118 : 146}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineJoin = 'round'; g.lineWidth = 20; g.strokeStyle = C.stroke; g.strokeText(label, w / 2, gy + gh * 0.52);
  g.fillStyle = '#fff'; g.fillText(label, w / 2, gy + gh * 0.52);
}
function gateLabel(gt) { return gt.type === 'mul' ? '×' + gt.val : (gt.val >= 0 ? '+' : '−') + Math.abs(gt.val); }
const BADGES = {};
function makeBadge(name) {
  const c = document.createElement('canvas'); c.width = 220; c.height = 240; const g = c.getContext('2d');
  g.save(); g.shadowColor = 'rgba(120,220,255,1)'; g.shadowBlur = 22;
  g.beginPath(); g.roundRect(22, 18, 176, 150, 20); g.moveTo(90, 168); g.lineTo(110, 200); g.lineTo(130, 168);
  const gr = g.createLinearGradient(0, 18, 0, 200); gr.addColorStop(0, 'rgba(150,215,255,.78)'); gr.addColorStop(1, 'rgba(70,150,235,.78)');
  g.fillStyle = gr; g.fill(); g.restore();
  g.lineWidth = 6; g.strokeStyle = '#d8f6ff'; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(42, 18); g.lineTo(178, 18); g.arcTo(198, 18, 198, 38, 20); g.lineTo(198, 148); g.arcTo(198, 168, 178, 168, 20); g.lineTo(130, 168); g.lineTo(110, 200); g.lineTo(90, 168); g.lineTo(42, 168); g.arcTo(22, 168, 22, 148, 20); g.lineTo(22, 38); g.arcTo(22, 18, 42, 18, 20); g.stroke();
  const img = TEX['icon_' + name].image; const s = Math.min(150 / img.width, 124 / img.height);
  g.drawImage(img, 110 - img.width * s / 2, 93 - img.height * s / 2, img.width * s, img.height * s);
  BADGES[name] = c;
}

// ---------------------------------------------------------------- audio
let ac = null, master = null, noiseBuf = null, muted = false, engine = null;
function initAudio() {
  if (ac) { if (ac.state !== 'running') ac.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  ac = new AC(); master = ac.createGain(); master.gain.value = muted ? 0 : 0.55; master.connect(ac.destination);
  noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate); const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const o = ac.createOscillator(), f = ac.createBiquadFilter(), gn = ac.createGain();
  o.type = 'sawtooth'; o.frequency.value = 58; f.type = 'lowpass'; f.frequency.value = 260; gn.gain.value = 0.035;
  const lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = 22; lg.gain.value = 0.02; lfo.connect(lg); lg.connect(gn.gain);
  o.connect(f); f.connect(gn); gn.connect(master); o.start(); lfo.start(); engine = gn;
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
let lastShot = 0, lastHit = 0;
const SFX = {
  shoot() { if (!ac || ac.currentTime - lastShot < 0.07) return; lastShot = ac.currentTime; noise(0.05, 3500, 900, 0.07, 'bandpass', 2); },
  hit() { if (!ac || ac.currentTime - lastHit < 0.05) return; lastHit = ac.currentTime; tone(rand(900, 1300), 0.03, 0.03, 'square'); },
  pop() { noise(0.22, 1800, 200, 0.25); tone(180, 0.15, 0.08, 'triangle', 0, 0.4); },
  boom() { noise(0.6, 1400, 60, 0.5); tone(90, 0.5, 0.2, 'sine', 0, 0.3); },
  big() { noise(1.4, 900, 40, 0.7); tone(60, 1.2, 0.3, 'sine', 0, 0.3); },
  gate() { [660, 880, 1175, 1568].forEach((f, i) => tone(f, 0.16, 0.08, 'triangle', i * 0.06)); },
  bad() { [440, 330, 247].forEach((f, i) => tone(f, 0.2, 0.08, 'sawtooth', i * 0.08)); },
  power() { [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.14, 0.07, 'square', i * 0.05)); },
  hurt() { noise(0.35, 600, 80, 0.5); tone(200, 0.35, 0.15, 'sawtooth', 0, 0.3); },
  lose() { tone(160, 0.3, 0.12, 'sawtooth', 0, 0.8); },
  roar() { tone(70, 1.1, 0.25, 'sawtooth', 0, 0.6); tone(95, 1.0, 0.15, 'sawtooth', 0.05, 0.5); noise(1.0, 500, 100, 0.2); },
  warn() { tone(880, 0.12, 0.08, 'square'); tone(880, 0.12, 0.08, 'square', 0.2); },
  missile() { noise(0.3, 800, 3000, 0.08, 'bandpass', 1); },
  win() { [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => tone(f, 0.25, 0.09, 'triangle', i * 0.12)); },
};
function sfx(n) { try { SFX[n](); } catch (e) { } }

// ---------------------------------------------------------------- state
const S = {};
let spiders = [], pods = [], gates = [], bullets = [], missiles = [], acids = [], wingmen = [], pops = [], level = [], levelIdx = 0;
let boss = null, shake = 0, flashRed = 0, slowmo = 1, godMode = false;
const SLOTS = (() => {
  const s = [[-1.6, -0.15], [1.6, -0.15], [-2.35, 1.05], [2.35, 1.05]];
  const grid = [];
  for (let z = -0.9; z <= 4.4; z += 0.8) for (let x = -4.05; x <= 4.06; x += 0.9) {
    if (Math.abs(x) < 1.3 && z < 1.4 && z > -1.5) continue;
    if (s.some(([a, b]) => Math.hypot(a - x, b - z) < 0.8)) continue;
    grid.push([x + (Math.round(z / 0.82) % 2 ? 0.45 : 0), z]);
  }
  grid.sort((a, b) => (Math.abs(a[0]) * 0.55 + Math.abs(a[1] - 0.8)) - (Math.abs(b[0]) * 0.55 + Math.abs(b[1] - 0.8)));
  return s.concat(grid).slice(0, MAXD);
})();

function buildLevel() {
  const L = [];
  const gate = (d, lane, type, val) => L.push({ d, k: 'gate', lane, type, val });
  const pod = (d, lane, hp, reward) => L.push({ d, k: 'pod', lane, hp, reward });
  const swarm = (d, lane, n, brute = 0, hp = 6) => {
    for (let i = 0; i < n; i++) {
      const ln = lane < 0 ? i % 2 : lane; const row = Math.floor(i / (lane < 0 ? 4 : 2));
      L.push({ d: d + row * 2.6 + rand(-0.4, 0.4), k: 'spider', x: LANE_X[ln] + (lane < 0 ? ((i >> 1) % 2 ? 0.9 : -0.9) : (i % 2 ? 1 : -1)) + rand(-0.35, 0.35), hp, brute: i < brute });
    }
  };
  gate(48, 0, 'add', 3); gate(48, 1, 'add', -2);
  swarm(80, 1, 3);
  pod(98, 0, 30, 'guns');
  swarm(125, 0, 4); swarm(130, 1, 2);
  gate(165, 0, 'add', -3); gate(165, 1, 'mul', 2);
  pod(200, 1, 55, 'drone'); swarm(198, 0, 5);
  swarm(240, -1, 8);
  // concept set-piece: gate + stacked pods in right lane, spiders on the left
  gate(278, 1, 'add', 6); gate(278, 0, 'add', -4);
  pod(294, 1, 72, 'missile'); pod(308, 1, 110, 'guns'); pod(322, 1, 140, 'drone');
  swarm(284, 0, 6, 1, 7);
  swarm(360, -1, 10, 0, 8);
  pod(398, 0, 160, 'guns'); gate(398, 1, 'add', 5);
  swarm(435, -1, 12, 2, 9);
  gate(478, 0, 'mul', 2); gate(478, 1, 'add', 6);
  pod(515, 0, 200, 'drone'); swarm(512, 1, 8, 1, 9);
  pod(540, 1, 260, 'missile');
  swarm(575, -1, 14, 2, 10);
  gate(622, 0, 'add', -6); gate(622, 1, 'add', 9);
  swarm(655, -1, 16, 3, 10);
  pod(700, 1, 311, 'guns'); gate(700, 0, 'add', 7);
  swarm(728, -1, 10, 2, 10);
  L.push({ d: BOSS_D - 40, k: 'warn' });
  L.push({ d: BOSS_D, k: 'boss' });
  L.sort((a, b) => a.d - b.d);
  return L;
}

function resetGame(play) {
  for (const a of [spiders, pods, gates]) for (const o of a) scene.remove(o.sprite);
  for (const w of wingmen) scene.remove(w.sprite);
  if (boss) scene.remove(boss.sprite);
  spiders = []; pods = []; gates = []; bullets = []; missiles = []; acids = []; wingmen = []; pops = []; boss = null;
  Object.assign(S, { mode: play ? 'play' : 'title', t: 0, dist: 0, speed: SPEED, hearts: 3, drones: 0, px: 0, tx: 0, vx: 0, inv: 0, kills: 0,
    gunLv: 1, missileLv: 0, fireT: 0, missileT: 1, gunSide: 0, bossDone: false, endT: 0, maxDrones: 0, warp: 0, ended: false });
  slowmo = 1; shake = 0; flashRed = 0;
  level = buildLevel(); levelIdx = 0;
  setDrones(4, 0, 0);
  const w = Number(Q.get('warp') || 0);
  if (play && w > 0) { S.dist = w; while (levelIdx < level.length && level[levelIdx].d < w + 5) levelIdx++; setDrones(Number(Q.get('drones') || 14), 0, 0); S.gunLv = 2; S.missileLv = 1; }
  updateHearts(); $('score').textContent = '0';
}

// ---------------------------------------------------------------- wingmen
function setDrones(n, fromX, fromZ) {
  n = clamp(Math.round(n), 0, Math.min(MAXD, SLOTS.length));
  while (wingmen.length < n) {
    const s = sprite(TEX.plane, 1.15, 0.5, 0.5, 2);
    const w = { sprite: s, x: fromX ?? S.px, z: fromZ ?? 0, ph: rand(0, TAU), fireT: rand(0, 0.4), spawn: 0 };
    s.position.set(w.x, 0.4, w.z); wingmen.push(w);
  }
  while (wingmen.length > n) {
    const w = wingmen.pop(); explode(w.sprite.position.x, 0.4, w.sprite.position.z, 0.8, false); scene.remove(w.sprite);
  }
  S.drones = n; S.maxDrones = Math.max(S.maxDrones, n);
}

// ---------------------------------------------------------------- spawning
function spawnEvent(e) {
  const z = -(e.d - S.dist);
  if (e.k === 'spider') {
    const brute = e.brute;
    const s = sprite(brute ? TEX.boss : TEX.spider, brute ? 2.7 : 1.75, 0.5, 0.1, 1);
    spiders.push({ sprite: s, x: e.x, z, hp: brute ? e.hp * 6 : e.hp, max: brute ? e.hp * 6 : e.hp, brute, r: brute ? 1.15 : 0.8, v: rand(2.5, 4.2) * (brute ? 0.7 : 1), ph: rand(0, TAU), flash: 0, home: Math.random() < 0.55, done: false });
  } else if (e.k === 'pod') {
    const s = sprite(TEX.pod, 2.35, 0.5, 0.05, 1);
    pods.push({ sprite: s, x: LANE_X[e.lane], z, hp: e.hp, max: e.hp, reward: e.reward, flash: 0, jolt: 0 });
  } else if (e.k === 'gate') {
    const tex = canvasTex(512, 420, () => { });
    const g = { x: LANE_X[e.lane], z, type: e.type, val: e.val, tex, acc: 0, inc: 0, passed: false, bump: 0 };
    redrawGate(g);
    const m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
    g.sprite = new THREE.Sprite(m); g.sprite.center.set(0.5, 0.02); g.sprite.scale.set(4.4, 4.4 * 420 / 512, 1); g.sprite.renderOrder = 1; scene.add(g.sprite);
    gates.push(g);
  } else if (e.k === 'warn') {
    banner('WARNING!', 'The Chitin Queen approaches', true, 2.6); sfx('warn'); setTimeout(() => sfx('warn'), 500);
  } else if (e.k === 'boss') {
    const s = sprite(TEX.boss, 5.6, 0.5, 0.08, 1);
    const hp = Number(Q.get('bosshp') || 2600);
    boss = { sprite: s, x: 0, z: -110, hp, max: hp, t: 0, state: 'enter', spawnT: 3, atkT: 4.5, tele: 0, teleLane: 0, flash: 0, volley: 0, volT: 0 };
    sfx('roar');
  }
}
function redrawGate(g) {
  const good = g.type === 'mul' || g.val >= 0;
  drawGate(g.tex.canvas.getContext('2d'), 512, 420, gateLabel(g), good);
  g.tex.needsUpdate = true;
}

// ---------------------------------------------------------------- fx helpers
function explode(x, y, z, size = 1, sound = true, color) {
  const n = Math.round(10 * size) + 4;
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU), sp = rand(1, 5) * size;
    fx.spawn({ x, y: y + rand(0, 0.5) * size, z, vx: Math.cos(a) * sp, vy: rand(1, 4) * size, vz: Math.sin(a) * sp, life: rand(0.25, 0.55), s0: rand(0.8, 1.6) * size, s1: rand(2, 3) * size, r: 1, g: rand(0.55, 0.85), b: 0.25, a: 1, drag: 0.9, world: true });
  }
  fx.spawn({ x, y: y + 0.4 * size, z, vx: 0, vy: 0, vz: 0, life: 0.18, s0: 3 * size, s1: 5 * size, r: 1, g: 0.95, b: 0.7, a: 1, world: true });
  for (let i = 0; i < n * 0.7; i++) {
    const a = rand(0, TAU), sp = rand(0.5, 2.5) * size;
    smokeFx.spawn({ x, y: y + rand(0, 0.5), z, vx: Math.cos(a) * sp, vy: rand(0.5, 2), vz: Math.sin(a) * sp, life: rand(0.6, 1.2), s0: size, s1: rand(2.5, 4) * size, r: 0.25, g: 0.22, b: 0.22, a: 0.55, drag: 0.93, world: true, fadeIn: true });
  }
  if (color) for (let i = 0; i < n; i++) {
    const a = rand(0, TAU), sp = rand(2, 7) * size;
    smokeFx.spawn({ x, y: y + 0.3, z, vx: Math.cos(a) * sp, vy: rand(2, 6), vz: Math.sin(a) * sp, life: rand(0.4, 0.8), s0: 0.35 * size, s1: 0.2 * size, r: color[0], g: color[1], b: color[2], a: 1, grav: 12, world: true });
  }
  rings.push({ x, z, t: 0, s: size * 3.5 });
  if (sound) sfx(size > 2 ? 'big' : size > 1.1 ? 'boom' : 'pop');
}
const rings = [];
function spark(x, y, z, big) {
  fx.spawn({ x, y, z, vx: rand(-2, 2), vy: rand(0, 2), vz: rand(-1, 3), life: 0.12, s0: big ? 1.3 : 0.8, s1: 0.2, r: 1, g: 0.9, b: 0.55, a: 1, world: true });
}
function pop(text, x, y, z, color = '#fff', size = 1, stroke = '#0b2440') { pops.push({ text, x, y, z, t: 0, color, size, stroke }); }
let bannerT = 0;
function banner(text, sub, warn, dur = 1.6) {
  const b = $('banner'); b.innerHTML = text + (sub ? `<small>${sub}</small>` : ''); b.className = 'show' + (warn ? ' warn' : ''); bannerT = dur;
}
function updateHearts() { [...$('hearts').children].forEach((h, i) => h.classList.toggle('off', i >= S.hearts)); }

// ---------------------------------------------------------------- damage & rewards
function hurtPlayer() {
  if (S.inv > 0 || godMode || S.mode !== 'play') return;
  S.hearts--; S.inv = 1.6; shake = Math.max(shake, 0.6); flashRed = 1; updateHearts(); sfx('hurt');
  if (navigator.vibrate) try { navigator.vibrate(80); } catch (e) { }
  if (S.hearts <= 0) {
    explode(S.px, 0.5, 0, 2.2); planeSprite.visible = false; setDrones(0);
    S.mode = 'dead'; S.endT = 1.6; sfx('lose');
  }
}
function loseDrones(n, x, z) {
  if (S.drones <= 0) { hurtPlayer(); return; }
  setDrones(S.drones - n); pop('−' + n, x, 1.2, z, '#ff6a5a', 0.9, '#3a0b0b'); shake = Math.max(shake, 0.3);
}
function killSpider(s, i) {
  explode(s.x, 0.4, s.z, s.brute ? 1.6 : 0.85, true, [0.75, 0.1, 0.08]);
  scene.remove(s.sprite); spiders.splice(i, 1); S.kills++; $('score').textContent = S.kills;
  shake = Math.max(shake, s.brute ? 0.25 : 0.08);
}
function breakPod(p, i) {
  explode(p.x, 1, p.z, 1.8, true, [0.6, 0.62, 0.66]);
  scene.remove(p.sprite); pods.splice(i, 1); shake = Math.max(shake, 0.35);
  const R = p.reward;
  flyIcons.push({ name: R, x: p.x, z: p.z, t: 0 });
  if (R === 'guns') { S.gunLv = Math.min(3, S.gunLv + 1); banner(S.gunLv >= 3 ? 'HEAVY GUNS!' : 'TWIN GUNS!', S.gunLv >= 3 ? 'Double damage' : 'Firepower up'); }
  if (R === 'missile') { S.missileLv = Math.min(3, S.missileLv + 1); banner('MISSILES!', S.missileLv > 1 ? 'Salvo ×' + (S.missileLv * 2) : 'Homing salvo'); }
  if (R === 'drone') { setDrones(S.drones + 5, p.x, p.z); banner('+5 WINGMEN!', 'Drone squad'); }
  sfx('power');
}
const flyIcons = [];
function damage(t, kind, dmg, i, bx, bz) {
  if (kind === 's') { t.hp -= dmg; t.flash = 1; if (t.hp <= 0) killSpider(t, i); }
  else if (kind === 'p') { t.hp -= dmg; t.flash = 1; t.jolt = 1; if (t.hp <= 0) breakPod(t, i); }
  else if (kind === 'g') {
    t.acc += dmg; const step = 36 + t.inc * 14;
    if (t.type === 'add' && t.inc < 8 && t.acc >= step) { t.acc -= step; t.inc++; t.val++; t.bump = 1; redrawGate(t); }
  } else if (kind === 'b') {
    if (t.state !== 'fight') return; t.hp -= dmg; t.flash = 1;
    if (t.hp <= 0) { t.hp = 0; t.state = 'dying'; t.t = 0; sfx('roar'); slowmo = 0.35; }
  }
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
  e.stopPropagation(); initAudio(); muted = !muted; if (master) master.gain.value = muted ? 0 : 0.55; $('mute').textContent = muted ? '🔇' : '🔊';
});
$('again').addEventListener('pointerdown', (e) => { e.stopPropagation(); initAudio(); startGame(); });

function startGame() {
  $('start').classList.add('hidden'); $('end').classList.add('hidden'); $('hud').classList.remove('hidden');
  planeSprite.visible = true; resetGame(true); banner('DEFEND EARTH!', 'Drag to steer', false, 1.6);
}
function endGame(win) {
  const e = $('end'); e.classList.remove('hidden'); e.classList.toggle('lose', !win);
  $('endtitle').textContent = win ? 'MISSION COMPLETE' : 'SHOT DOWN';
  $('endsub').textContent = win ? 'The Chitin Queen is down. Earth breathes again!' : 'The Chitin horde got you. Regroup, pilot!';
  $('st-kills').textContent = S.kills; $('st-drones').textContent = win ? S.drones : S.maxDrones; $('st-time').textContent = Math.round(S.t) + 's';
  const stars = win ? 1 + (S.hearts >= 2) + (S.hearts >= 3) : 0;
  [...$('stars').children].forEach((s, i) => s.classList.toggle('on', i < stars));
  $('hud').classList.add('hidden');
}

// ---------------------------------------------------------------- bot (testing)
function botThink() {
  let best = S.px, bestScore = -1e9;
  for (const cand of [LANE_X[0], LANE_X[1]]) {
    let sc = 0;
    for (const g of gates) if (!g.passed && g.z < 0 && g.z > -45 && Math.abs(g.x - cand) < 1) sc += g.type === 'mul' ? S.drones * (g.val - 1) : g.val;
    for (const p of pods) if (p.z > -60 && p.z < -8 && Math.abs(p.x - cand) < 1) sc += 3;
    for (const p of pods) if (p.z > -8 && Math.abs(p.x - cand) < 1.5) sc -= 20;
    for (const s of spiders) if (s.z > -14 && Math.abs(s.x - cand) < 1.6) sc -= S.drones > 3 ? 0.3 : 3;
    if (boss && boss.tele > 0 && boss.teleLane === (cand < 0 ? 0 : 1)) sc -= 50;
    for (const a of acids) if (Math.abs(a.x - cand) < 1.8) sc -= 30;
    if (sc > bestScore) { bestScore = sc; best = cand; }
  }
  S.tx = best;
}

// ---------------------------------------------------------------- update
const tmpV = new THREE.Vector3();
function update(dt) {
  const play = S.mode === 'play';
  S.t += play ? dt : 0;
  const v = S.speed * (S.mode === 'win' ? 1.3 : 1);
  const dz = v * dt;
  if (play || S.mode === 'dead' || S.mode === 'win') S.dist += dz; else S.dist += dz;
  groundTex.offset.y += dz / TILE;

  // steering
  if (play) {
    if (keyL) S.tx = clamp(S.tx - 9 * dt, -XMAX, XMAX);
    if (keyR) S.tx = clamp(S.tx + 9 * dt, -XMAX, XMAX);
    if (BOT) botThink();
  } else if (S.mode === 'title') S.tx = Math.sin(S.dist * 0.02) * 1.2;
  const prev = S.px; S.px = lerp(S.px, S.tx, 1 - Math.exp(-dt * 12)); S.vx = (S.px - prev) / Math.max(dt, 1e-4);
  S.inv = Math.max(0, S.inv - dt);
  const bob = Math.sin(performance.now() * 0.003) * 0.08;
  planeSprite.position.set(S.px, 0.55 + bob, 0);
  planeSprite.material.rotation = clamp(-S.vx * 0.035, -0.35, 0.35);
  planeSprite.scale.x = 2.7 * (1 - Math.min(0.18, Math.abs(S.vx) * 0.015));
  planeSprite.material.opacity = S.inv > 0 ? (Math.sin(S.inv * 30) > 0 ? 1 : 0.35) : 1;

  // level events
  if (play) while (levelIdx < level.length && level[levelIdx].d - S.dist < 110) spawnEvent(level[levelIdx++]);

  // wingmen follow
  wingmen.forEach((w, i) => {
    const [sx, sz] = SLOTS[i]; const k = 1 - Math.exp(-dt * (w.spawn < 1 ? 3.5 : 7));
    w.spawn = Math.min(1, w.spawn + dt * 1.2);
    w.x = lerp(w.x, S.px + sx, k); w.z = lerp(w.z, sz, k);
    const wb = Math.sin(performance.now() * 0.004 + w.ph) * 0.1;
    w.sprite.position.set(w.x, 0.45 + wb, w.z);
    w.sprite.material.rotation = clamp(-(S.px + sx - w.x) * 0.25, -0.4, 0.4);
  });

  // firing
  if (play) {
    const rate = [0, 9, 11, 12][S.gunLv];
    const dmg = S.gunLv >= 3 ? 5 : 3;
    S.fireT -= dt;
    while (S.fireT <= 0) {
      S.fireT += 1 / rate;
      const guns = S.gunLv >= 2 ? [-0.55, 0.55] : [S.gunSide ? 0.55 : -0.55];
      S.gunSide ^= 1;
      for (const gx of guns) {
        bullets.push({ x: S.px + gx, z: -0.9, vz: -62, dmg, big: S.gunLv >= 3, w: false });
        fx.spawn({ x: S.px + gx, y: 0.55, z: -1.1, vx: 0, vy: 0, vz: 0, life: 0.06, s0: 1.2, s1: 0.6, r: 1, g: 0.85, b: 0.4, a: 1 });
      }
      sfx('shoot');
    }
    for (const w of wingmen) {
      w.fireT -= dt;
      if (w.fireT <= 0) {
        w.fireT += 1 / 3.2;
        bullets.push({ x: w.x, z: w.z - 0.4, vz: -58, dmg: 2, big: false, w: true });
        fx.spawn({ x: w.x, y: 0.45, z: w.z - 0.55, vx: 0, vy: 0, vz: 0, life: 0.05, s0: 0.6, s1: 0.3, r: 1, g: 0.85, b: 0.4, a: 1 });
      }
    }
    if (S.missileLv > 0) {
      S.missileT -= dt;
      if (S.missileT <= 0) {
        S.missileT = 1.25;
        const targets = [...spiders.filter((s) => s.z > -60 && s.z < -3), ...pods.filter((p) => p.z > -60 && p.z < -3)];
        if (boss && boss.state === 'fight') targets.push(boss);
        if (targets.length) {
          for (let i = 0; i < S.missileLv * 2; i++) {
            const side = i % 2 ? 1 : -1; const t = targets[Math.floor(Math.random() * targets.length)];
            missiles.push({ x: S.px + side * 1.1, y: 0.5, z: 0, vx: side * rand(5, 8), vz: -rand(4, 8), t, life: 3 });
          }
          sfx('missile');
        }
      }
    }
  }

  // spiders
  for (let i = spiders.length - 1; i >= 0; i--) {
    const s = spiders[i];
    s.z += dz + s.v * dt * (play ? 1 : 0);
    s.ph += dt * (s.brute ? 7 : 11);
    if (s.home && s.z > -28 && s.z < -3 && play) s.x += clamp(S.px - s.x, -1, 1) * dt * 1.3;
    s.x += Math.sin(s.ph * 0.35) * dt * 0.5;
    s.x = clamp(s.x, -4.2, 4.2);
    const sp = s.sprite, w0 = s.brute ? 2.7 : 1.75, img = sp.material.map.image;
    sp.position.set(s.x, Math.abs(Math.sin(s.ph)) * 0.12, s.z);
    sp.scale.set(w0 * (1 + Math.sin(s.ph * 2) * 0.03), w0 * img.height / img.width * (1 - Math.sin(s.ph * 2) * 0.05), 1);
    sp.material.rotation = Math.sin(s.ph) * 0.07;
    s.flash = Math.max(0, s.flash - dt * 8); sp.material.color.setScalar(1 + s.flash * 1.6);
    shadows.add(s.x, 0.02, s.z + 0.1, s.r * 2.2, s.r * 1.3, 0, 1, 1, 1);
    if (play && !s.done && s.z > -1.2 && s.z < 1.6) {
      // formation contact
      let hitW = -1, hitD = 1e9;
      wingmen.forEach((w, j) => { const d = Math.abs(w.x - s.x); if (d < 0.75 + s.r * 0.5 && Math.abs(w.z - s.z) < 0.9 && d < hitD) { hitD = d; hitW = j; } });
      if (hitW >= 0) {
        const w = wingmen[hitW]; wingmen.splice(hitW, 1); wingmen.push(w); // move to end so pop removes it
        loseDrones(s.brute ? 3 : 1, s.x, s.z); killSpider(s, i); continue;
      }
      if (Math.abs(S.px - s.x) < 1.0 + s.r * 0.4 && Math.abs(s.z) < 0.9) { hurtPlayer(); killSpider(s, i); continue; }
    }
    if (s.z > 6) { scene.remove(s.sprite); spiders.splice(i, 1); }
  }

  // pods
  for (let i = pods.length - 1; i >= 0; i--) {
    const p = pods[i]; p.z += dz;
    p.flash = Math.max(0, p.flash - dt * 8); p.jolt = Math.max(0, p.jolt - dt * 10);
    p.sprite.position.set(p.x + (Math.random() - 0.5) * p.jolt * 0.08, 0.05 + Math.sin(S.dist * 0.2 + p.x) * 0.05, p.z);
    p.sprite.material.color.setScalar(1 + p.flash * 0.9);
    shadows.add(p.x, 0.02, p.z + 0.2, 2.8, 1.5, 0, 1, 1, 1);
    if (play && p.z > -0.8 && p.z < 1 && Math.abs(S.px - p.x) < 1.7) {
      explode(p.x, 1, p.z, 1.5); scene.remove(p.sprite); pods.splice(i, 1); loseDrones(3, p.x, p.z); continue;
    }
    if (p.z > 6) { scene.remove(p.sprite); pods.splice(i, 1); }
  }

  // gates
  for (let i = gates.length - 1; i >= 0; i--) {
    const g = gates[i]; g.z += dz; g.bump = Math.max(0, g.bump - dt * 5);
    const sc = 1 + g.bump * 0.08;
    g.sprite.position.set(g.x, 0, g.z); g.sprite.scale.set(4.4 * sc, 4.4 * 420 / 512 * sc, 1);
    if (play && !g.passed && g.z >= -0.2) {
      g.passed = true;
      const mine = Math.abs(S.px - g.x) < 2.25 && !gates.some((o) => o !== g && !o.passed && Math.abs(o.z - g.z) < 1 && Math.abs(S.px - o.x) < Math.abs(S.px - g.x));
      if (mine) {
        const before = S.drones;
        const n = g.type === 'mul' ? S.drones * g.val : S.drones + g.val;
        setDrones(n, g.x, g.z);
        const diff = S.drones - before;
        const good = g.type === 'mul' || g.val >= 0;
        pop(gateLabel(g), S.px, 2.2, -1.5, good ? '#9fe8ff' : '#ff6a5a', 1.6, good ? '#0b2a5a' : '#3a0b0b');
        sfx(good ? 'gate' : 'bad');
        for (let k = 0; k < 40; k++) fx.spawn({ x: g.x + rand(-1.8, 1.8), y: rand(0.3, 3), z: g.z, vx: rand(-3, 3), vy: rand(-1, 3), vz: rand(-2, 4), life: rand(0.3, 0.7), s0: 0.5, s1: 0.1, r: good ? 0.5 : 1, g: good ? 0.85 : 0.4, b: good ? 1 : 0.35, a: 1, world: true });
        if (!good && diff < 0) shake = Math.max(shake, 0.25);
        // other gate in the pair also gets marked
        gates.forEach((o) => { if (o !== g && Math.abs(o.z - g.z) < 1) o.passed = true; });
        scene.remove(g.sprite); gates.splice(i, 1); continue;
      }
    }
    if (g.z > 5) { scene.remove(g.sprite); gates.splice(i, 1); }
  }

  // boss
  if (boss) updateBoss(dt, dz);

  // bullets
  tracers.begin();
  const targets = [];
  for (const g of gates) if (!g.passed && g.z < -1) targets.push([g, 'g', 2.0, 0.4]);
  for (const s of spiders) targets.push([s, 's', s.r, s.brute ? 1 : 0.7]);
  for (const p of pods) targets.push([p, 'p', 1.2, 0.8]);
  if (boss && boss.state === 'fight') targets.push([boss, 'b', 3.3, 1.6]);
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i]; const nz = b.z + b.vz * dt;
    let hit = null, hz = -1e9;
    for (const tg of targets) {
      const t = tg[0]; if (t.hp !== undefined && t.hp <= 0) continue;
      if (Math.abs(b.x - t.x) < tg[2] && nz <= t.z + tg[3] && b.z >= t.z - tg[3] && t.z > hz) { hit = tg; hz = t.z; }
    }
    if (hit) {
      const t = hit[0];
      const idx = hit[1] === 's' ? spiders.indexOf(t) : hit[1] === 'p' ? pods.indexOf(t) : -1;
      damage(t, hit[1], b.dmg, idx, b.x, t.z);
      if (Math.random() < (b.w ? 0.35 : 0.7)) spark(b.x, hit[1] === 'g' ? rand(0.5, 2.5) : hit[1] === 'b' ? rand(1, 3) : 0.6, t.z + 0.3, b.big);
      if (Math.random() < 0.3) sfx('hit');
      bullets.splice(i, 1); continue;
    }
    b.z = nz;
    if (b.z < -80) { bullets.splice(i, 1); continue; }
    const len = b.w ? 0.9 : 1.4, wd = b.big ? 0.3 : b.w ? 0.14 : 0.2;
    if (b.w) tracers.add(b.x, 0.45, b.z, wd, len, 0, 0.75, 0.5, 0.15);
    else tracers.add(b.x, 0.5, b.z, wd, len, 0, 1.0, 0.7, 0.25);
  }
  tracers.end();

  // missiles
  missilesB.begin();
  for (let i = missiles.length - 1; i >= 0; i--) {
    const m = missiles[i]; m.life -= dt;
    const alive = m.t && (m.t === boss ? boss && boss.state === 'fight' : (spiders.includes(m.t) || pods.includes(m.t)));
    let tx = alive ? m.t.x : m.x + m.vx * 0.1, tz = alive ? m.t.z : m.z - 10;
    const dx = tx - m.x, dzz = tz - m.z, d = Math.hypot(dx, dzz) || 1;
    const sp = 30; m.vx = lerp(m.vx, dx / d * sp, 1 - Math.exp(-dt * 5)); m.vz = lerp(m.vz, dzz / d * sp, 1 - Math.exp(-dt * 5));
    m.x += m.vx * dt; m.z += m.vz * dt;
    smokeFx.spawn({ x: m.x, y: m.y, z: m.z, vx: 0, vy: 0.3, vz: 0, life: 0.5, s0: 0.35, s1: 0.9, r: 0.92, g: 0.92, b: 0.95, a: 0.5, world: true });
    fx.draw(m.x - m.vx * 0.02, m.y, m.z - m.vz * 0.02, 0.8, 1, 0.7, 0.3, 1);
    missilesB.add(m.x, m.y, m.z, 0.32, 0.95, Math.atan2(-m.vx, -m.vz), 1, 1, 1);
    if ((alive && d < (m.t === boss ? 2.2 : 0.8)) || m.life <= 0 || m.z < -90) {
      explode(m.x, 0.5, m.z, 0.9, false); sfx('pop');
      // splash
      for (let j = spiders.length - 1; j >= 0; j--) { const s = spiders[j]; if (Math.hypot(s.x - m.x, s.z - m.z) < 1.8) damage(s, 's', 14, j); }
      for (let j = pods.length - 1; j >= 0; j--) { const p = pods[j]; if (Math.hypot(p.x - m.x, p.z - m.z) < 1.8) damage(p, 'p', 14, j); }
      if (boss && boss.state === 'fight' && Math.hypot(boss.x - m.x, boss.z - m.z) < 3.2) { damage(boss, 'b', 14); pop('14', m.x, 2.5, m.z, '#ffd64a', 0.8); }
      missiles.splice(i, 1);
    }
  }
  missilesB.end();

  // acids
  for (let i = acids.length - 1; i >= 0; i--) {
    const a = acids[i]; a.z += (a.vz) * dt; a.y = Math.max(0.3, a.y - dt * 2);
    fx.draw(a.x, a.y, a.z, 1.4, 0.55, 1, 0.25, 0.9);
    fx.draw(a.x, a.y, a.z, 0.6, 1, 1, 0.8, 1);
    if (Math.random() < 0.4) smokeFx.spawn({ x: a.x, y: a.y, z: a.z, vx: 0, vy: 0.2, vz: 0, life: 0.4, s0: 0.5, s1: 0.2, r: 0.4, g: 0.8, b: 0.2, a: 0.6 });
    if (play && a.z > -1 && a.z < 1.2) {
      let hitW = -1;
      wingmen.forEach((w, j) => { if (Math.abs(w.x - a.x) < 0.7 && Math.abs(w.z - a.z) < 0.8) hitW = j; });
      if (hitW >= 0) { const w = wingmen[hitW]; wingmen.splice(hitW, 1); wingmen.push(w); loseDrones(1, a.x, a.z); acids.splice(i, 1); continue; }
      if (Math.abs(S.px - a.x) < 1.0 && Math.abs(a.z) < 0.8) { hurtPlayer(); acids.splice(i, 1); continue; }
    }
    if (a.z > 5) acids.splice(i, 1);
  }

  // ambient: clouds, smoke
  for (let i = clouds.length - 1; i >= 0; i--) {
    const c = clouds[i]; c.position.z += dz;
    if (c.position.z > (c.renderOrder > 0 ? 34 : 30)) { c.parent.remove(c); clouds.splice(i, 1); spawnCloud(rand(-460, -380)); }
  }
  for (let i = smokes.length - 1; i >= 0; i--) {
    const s = smokes[i]; s.position.z += dz; s.userData.ph += dt;
    s.material.rotation = Math.sin(s.userData.ph * 0.7) * 0.03;
    worldFx.draw(s.position.x, -G + 0.6, s.position.z, 3 + Math.sin(s.userData.ph * 9) * 0.6, 1, 0.5, 0.15, 0.9);
    if (s.position.z > 40) { world.remove(s); smokes.splice(i, 1); spawnSmoke(rand(-460, -400)); }
  }

  // lane dots
  dots.begin();
  const sp = 1.3, off = S.dist % sp;
  for (const lx of LINE_X) for (let k = -3; k < 95; k++) {
    const z = -k * sp + off; const far = Math.min(1, -z / 100);
    dots.add(lx, 0, z, 0.62, 0.44, 0, 0.95 - far * 0.3, 0.97 - far * 0.3, 1 - far * 0.2);
  }
  dots.end();

  // lane warning strip
  flats.begin();
  if (boss && boss.tele > 0) {
    const a = 0.5 + 0.5 * Math.sin(performance.now() * 0.03);
    flats.add(LANE_X[boss.teleLane], 0.03, (boss.z + 3) / 2, 4.2, Math.abs(boss.z - 3), 0, 0.9 * a, 0.15 * a, 0.1 * a);
  }
  flats.end();
  // rings
  ringFx.begin();
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i]; r.t += dt; r.z += dz; if (r.t > 0.45) { rings.splice(i, 1); continue; }
    const k = r.t / 0.45, s = r.s * (0.3 + k); ringFx.add(r.x, 0.1, r.z, s, s * 0.8, 0, (1 - k) * 1, (1 - k) * 0.8, (1 - k) * 0.5);
  }
  ringFx.end();
  shadows.end(); shadows.begin();

  // icon fly
  for (let i = flyIcons.length - 1; i >= 0; i--) { const f = flyIcons[i]; f.t += dt * 1.6; if (f.t >= 1) flyIcons.splice(i, 1); }
  for (let i = pops.length - 1; i >= 0; i--) { const p = pops[i]; p.t += dt; p.z += dz * 0.2; if (p.t > 1.1) pops.splice(i, 1); }

  fx.update(dt, v); smokeFx.update(dt, v); worldFx.update(dt, v);

  // end states
  if (S.mode === 'dead' || S.mode === 'win') { S.endT -= dt / Math.max(slowmo, 0.3); if (S.endT <= 0 && !S.ended) { S.ended = true; endGame(S.mode === 'win'); } }
  // progress
  if (play) $('progfill').style.width = clamp(S.dist / BOSS_D * 100, 0, 100) + '%';
  if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) $('banner').className = ''; }
  shake = Math.max(0, shake - dt * 1.8); flashRed = Math.max(0, flashRed - dt * 2.5);
}

function updateBoss(dt, dz) {
  const b = boss; b.t += dt; b.flash = Math.max(0, b.flash - dt * 8);
  const play = S.mode === 'play';
  if (b.state === 'enter') {
    b.z += dz * 1.1; if (b.z >= -15.5) { b.z = -15.5; b.state = 'fight'; b.t = 0; banner('CHITIN QUEEN', 'Shoot it down!', true, 1.6); }
  } else if (b.state === 'fight') {
    const enr = b.hp < b.max * 0.5;
    b.x = Math.sin(b.t * (enr ? 0.7 : 0.5)) * 1.7;
    b.spawnT -= dt;
    if (b.spawnT <= 0 && play) {
      b.spawnT = enr ? 3 : 3.8;
      const n = enr ? 3 : 2;
      for (let i = 0; i < n; i++) {
        const s = sprite(TEX.spider, 1.75, 0.5, 0.1, 1);
        spiders.push({ sprite: s, x: clamp(b.x + rand(-2.5, 2.5), -4, 4), z: b.z + rand(1, 3), hp: 10, max: 10, brute: false, r: 0.8, v: rand(3, 5), ph: rand(0, TAU), flash: 0, home: Math.random() < 0.5, done: false });
      }
    }
    b.atkT -= dt;
    if (b.atkT <= 0 && b.tele <= 0 && b.volley <= 0 && play) { b.tele = 1.1; b.teleLane = S.px < 0 ? 0 : 1; sfx('warn'); }
    if (b.tele > 0) { b.tele -= dt; if (b.tele <= 0) { b.volley = enr ? 7 : 5; b.volT = 0; sfx('roar'); } }
    if (b.volley > 0) {
      b.volT -= dt;
      if (b.volT <= 0) {
        b.volT = 0.14; b.volley--;
        for (const o of [-1.2, 0, 1.2]) acids.push({ x: LANE_X[b.teleLane] + o + rand(-0.2, 0.2), y: 1.6, z: b.z + 1.5, vz: 26 });
        if (b.volley <= 0) b.atkT = enr ? 3.2 : 4.4;
      }
    }
  } else if (b.state === 'dying') {
    b.x += Math.sin(b.t * 40) * 0.05;
    if (Math.random() < dt * 14) explode(b.x + rand(-2.5, 2.5), rand(0.5, 3.5), b.z + rand(-1, 1), rand(1, 1.8), Math.random() < 0.5);
    shake = Math.max(shake, 0.4);
    if (b.t > 1.8) {
      explode(b.x, 1.5, b.z, 4, true, [0.75, 0.1, 0.08]); shake = 1.2;
      scene.remove(b.sprite); boss = null; slowmo = 1;
      for (const s of spiders) { explode(s.x, 0.4, s.z, 0.8, false); scene.remove(s.sprite); }
      spiders = []; acids = [];
      S.mode = 'win'; S.endT = 2.2; sfx('win'); banner('VICTORY!', 'Earth is safe… for now', false, 2.2);
      return;
    }
  }
  const sp = b.sprite, img = sp.material.map.image, w0 = 5.6;
  const breathe = Math.sin(b.t * 3) * 0.03;
  sp.position.set(b.x, 0.1 + Math.abs(Math.sin(b.t * 5)) * 0.1, b.z);
  sp.scale.set(w0 * (1 + breathe), w0 * img.height / img.width * (1 - breathe), 1);
  sp.material.rotation = Math.sin(b.t * 2.5) * 0.04;
  sp.material.color.setScalar(1 + b.flash * 0.7);
  shadows.add(b.x, 0.02, b.z + 0.8, 8, 4, 0, 1, 1, 1);
}

// ---------------------------------------------------------------- overlay (2D)
const proj = new THREE.Vector3();
function toScreen(x, y, z) {
  proj.set(x, y, z).project(camera);
  return [(proj.x * 0.5 + 0.5) * W, (1 - (proj.y * 0.5 + 0.5)) * H, proj.z];
}
function unitPx(x, y, z) { const a = toScreen(x, y, z)[0], b = toScreen(x + 1, y, z)[0]; return Math.abs(b - a); }
function txt(s, x, y, size, fill = '#fff', stroke = '#0b2440', lw = 0.2, italic = false) {
  ctx.font = `${italic ? 'italic ' : ''}900 ${size}px ${FONT}`; ctx.lineWidth = Math.max(2, size * lw); ctx.strokeStyle = stroke; ctx.lineJoin = 'round';
  ctx.strokeText(s, x, y); ctx.fillStyle = fill; ctx.fillText(s, x, y);
}
function drawProp(x, y, z, size, spin) {
  const [sx, sy] = toScreen(x, y, z); const u = unitPx(x, y, z) * size;
  ctx.save(); ctx.translate(sx, sy); ctx.scale(1, 0.32);
  ctx.fillStyle = 'rgba(60,60,60,.18)'; ctx.beginPath(); ctx.arc(0, 0, u, 0, TAU); ctx.fill();
  ctx.rotate(spin); ctx.fillStyle = 'rgba(40,40,40,.45)';
  for (let k = 0; k < 3; k++) { ctx.rotate(TAU / 3); ctx.beginPath(); ctx.ellipse(u * 0.5, 0, u * 0.5, u * 0.07, 0, 0, TAU); ctx.fill(); }
  ctx.restore();
}
function drawOverlay() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const now = performance.now() * 0.05;
  // propellers
  if (planeSprite.visible) drawProp(S.px, 0.62, -1.18, 0.62, now);
  for (const w of wingmen) drawProp(w.sprite.position.x, w.sprite.position.y + 0.03, w.z - 0.5, 0.27, now + w.ph);
  // contrails
  ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (const w of wingmen) for (const o of [-0.56, 0.56]) {
    const a = toScreen(w.x + o, 0.45, w.z + 0.1), b = toScreen(w.x + o, 0.45, w.z + 2.4); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
  }
  if (planeSprite.visible) for (const o of [-1.3, 1.3]) { const a = toScreen(S.px + o, 0.55, 0.05), b = toScreen(S.px + o, 0.55, 3.5); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
  ctx.stroke();
  // pods: numbers + badges
  for (const p of pods) {
    if (p.z < -95) continue;
    const u = unitPx(p.x, 0, p.z); const h = 2.35 * 202 / 297;
    const [nx, ny] = toScreen(p.x, h * 0.36, p.z);
    txt(String(Math.max(0, Math.ceil(p.hp))), nx + u * 0.02, ny, Math.max(9, u * 0.74), '#fff', '#1a2230', 0.16);
    const [bx, by] = toScreen(p.x, h * 1.02, p.z);
    const img = BADGES[p.reward]; const bw = u * 1.7, bh = bw * img.height / img.width;
    const bob = Math.sin(now * 0.08 + p.x) * u * 0.05;
    ctx.drawImage(img, bx - bw / 2, by - bh * 0.84 + bob, bw, bh);
  }
  // boss bar
  if (boss && boss.state !== 'enter') {
    const u = unitPx(boss.x, 0, boss.z); const img = boss.sprite.material.map.image; const bh = 5.6 * img.height / img.width;
    let [x, y] = toScreen(boss.x, bh * 0.97, boss.z);
    const w = u * 3.4, hh = Math.max(8, u * 0.36);
    y = Math.max(y, 118 + hh * 2);
    ctx.fillStyle = '#1b1e24'; ctx.beginPath(); ctx.roundRect(x - w / 2 - 3, y - hh / 2 - 3, w + 6, hh + 6, hh); ctx.fill();
    ctx.fillStyle = '#3a4150'; ctx.beginPath(); ctx.roundRect(x - w / 2, y - hh / 2, w, hh, hh / 2); ctx.fill();
    const f = boss.hp / boss.max;
    if (f > 0) { const gr = ctx.createLinearGradient(0, y - hh / 2, 0, y + hh / 2); gr.addColorStop(0, '#ff7a3a'); gr.addColorStop(1, '#e02a10'); ctx.fillStyle = gr; ctx.beginPath(); ctx.roundRect(x - w / 2, y - hh / 2, Math.max(hh, w * f), hh, hh / 2); ctx.fill(); }
    txt(String(Math.ceil(boss.hp)), x, y - hh * 1.6, Math.max(14, u * 0.75), '#fff', '#1a1a22', 0.18, true);
  }
  // brute spider hp
  for (const s of spiders) if (s.brute && s.hp < s.max) {
    const u = unitPx(s.x, 0, s.z); const [x, y] = toScreen(s.x, 2.0, s.z); const w = u * 1.3, hh = Math.max(4, u * 0.14);
    ctx.fillStyle = '#1b1e24'; ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, hh + 2); ctx.fillStyle = '#ff4a2a'; ctx.fillRect(x - w / 2, y, w * s.hp / s.max, hh);
  }
  // drone count
  if (S.mode === 'play') {
    const [x, y] = toScreen(S.px, 0, 1.75);
    const label = '×' + S.drones;
    ctx.font = `900 17px ${FONT}`; const tw = ctx.measureText(label).width + 30;
    ctx.fillStyle = 'rgba(12,40,80,.72)'; ctx.strokeStyle = 'rgba(160,225,255,.95)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(x - tw / 2, y - 13, tw, 26, 13); ctx.fill(); ctx.stroke();
    const pi = TEX.icon_drone.image; ctx.drawImage(pi, x - tw / 2 + 5, y - 9, 22, 22 * pi.height / pi.width);
    txt(label, x + 11, y + 1, 17, '#fff', '#0b2440', 0.12);
  }
  // reward icons flying to plane
  for (const f of flyIcons) {
    const k = f.t, e = k * k * (3 - 2 * k);
    const [ax, ay] = toScreen(f.x, 2.5, f.z), [bx, by] = toScreen(S.px, 0.6, 0);
    const x = lerp(ax, bx, e), y = lerp(ay, by, e) - Math.sin(k * Math.PI) * 60; const img = BADGES[f.name]; const s = 70 * (1 - k * 0.5);
    ctx.globalAlpha = 1 - k * k; ctx.drawImage(img, x - s / 2, y - s / 2, s, s * img.height / img.width); ctx.globalAlpha = 1;
  }
  // pops
  for (const p of pops) {
    const [x, y] = toScreen(p.x, p.y, p.z); const k = p.t / 1.1;
    ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
    const sc = p.size * (k < 0.15 ? 0.6 + k / 0.15 * 0.6 : 1.2 - Math.min(0.2, (k - 0.15)));
    txt(p.text, x, y - k * 50, 30 * sc, p.color, p.stroke, 0.2); ctx.globalAlpha = 1;
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
  const files = { terrain: 'assets/terrain.jpg', plane: 'assets/plane.webp', spider: 'assets/spider.webp', boss: 'assets/boss.webp', pod: 'assets/pod.webp',
    icon_missile: 'assets/icon_missile.webp', icon_guns: 'assets/icon_guns.webp', icon_drone: 'assets/icon_drone.webp',
    cloud1: 'assets/cloud1.webp', cloud2: 'assets/cloud2.webp', cloud3: 'assets/cloud3.webp', smoke: 'assets/smoke.webp' };
  await Promise.all(Object.entries(files).map(([k, f]) => loadTex(k, f)));
  try { await Promise.race([document.fonts.load(`900 40px NunitoG`), new Promise((r) => setTimeout(r, 1500))]); await document.fonts.load('40px Lilita'); } catch (e) { }
  ['missile', 'guns', 'drone'].forEach(makeBadge);
  setupWorld(); resize(); resetGame(false);
  ready = true; $('loading').textContent = '';
  if (Q.has('autostart')) startGame();
}
requestAnimationFrame(loop);
boot();

window.__G = { S, get spiders() { return spiders; }, get pods() { return pods; }, get gates() { return gates; }, get boss() { return boss; }, get wingmen() { return wingmen; },
  god(v) { godMode = v; }, wcam, get B() { return { dots, shadows, tracers, flats, ringFx, missilesB, fx, smokeFx }; }, start: () => startGame(), camera, CAM_POS, CAM_LOOK, resize };
