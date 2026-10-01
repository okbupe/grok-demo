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
const SPEED = 12;       // ground scroll speed: the plane looks like it is flying flat out
const OBJ_V = 4.6;      // gates, pods and bugs approach slowly and steadily (runner-ad pacing)
const G = 36;           // ground depth below play level
const TILE = 170;       // world units per terrain tile
const MAXD = 35;        // max wingmen at any time
const BOSS_D = 345;
const GATE_MAX = 1000;
const SPAWN_AHEAD = 64;
const PLANE_W = 2.8, WING_W = 1.2;
let RANGE_Z = -20;      // bullets fade out here (~3/4 up the screen), computed in resize()

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
const T_MISSILE = canvasTex(48, 144, (g, w, h) => {
  const c = w / 2;
  g.fillStyle = '#f2f5f7'; g.beginPath(); g.moveTo(c, 4); g.quadraticCurveTo(c + 10, 20, c + 9, 44); g.lineTo(c + 9, 118); g.lineTo(c - 9, 118); g.lineTo(c - 9, 44); g.quadraticCurveTo(c - 10, 20, c, 4); g.fill();
  g.strokeStyle = '#27313a'; g.lineWidth = 3; g.stroke();
  g.fillStyle = '#e03a2a'; g.beginPath(); g.moveTo(c, 4); g.quadraticCurveTo(c + 8, 14, c + 8.5, 26); g.lineTo(c - 8.5, 26); g.quadraticCurveTo(c - 8, 14, c, 4); g.fill();
  g.fillStyle = '#f0b429'; g.fillRect(c - 9, 52, 18, 8);
  g.fillStyle = '#56616b'; g.beginPath(); g.moveTo(c - 9, 92); g.lineTo(c - 22, 128); g.lineTo(c - 9, 118); g.moveTo(c + 9, 92); g.lineTo(c + 22, 128); g.lineTo(c + 9, 118); g.fill();
  g.fillStyle = '#ffd36a'; g.beginPath(); g.ellipse(c, 128, 7, 14, 0, 0, TAU); g.fill();
});
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
let ground, groundTex, tracers, flats, fx, smokeFx, planeSprite, missilesB, ringFx, worldFx, beams;
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
  tracers = new FlatBatch(T_TRACER, 900, THREE.AdditiveBlending, 5);
  beams = new FlatBatch(T_BEAM, 8, THREE.AdditiveBlending, 5);
  missilesB = new FlatBatch(T_MISSILE, 60, THREE.NormalBlending, 4);
  smokeFx = new Particles(1100, THREE.NormalBlending, T_PUFF, 3);
  fx = new Particles(1600, THREE.AdditiveBlending, T_GLOW, 6);
  ringFx = new FlatBatch(T_RING, 40, THREE.AdditiveBlending, 5);
  planeSprite = sprite(TEX.plane, PLANE_W, 0.5, 0.5, 3);
  for (let i = 0; i < 9; i++) spawnCloud(rand(-420, 10), true);
  for (let i = 0; i < 5; i++) spawnSmoke(rand(-420, -40));
}
function spawnCloud(z, init) {
  const big = Math.random() < 0.4;
  const side = Math.random() < 0.5 ? -1 : 1;
  const tex = TEX['cloud' + (1 + Math.floor(Math.random() * 3))];
  let c;
  if (big) {
    c = sprite(tex, rand(18, 26), 0.5, 0.5, 0.5); // below every flyer
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
const GATE_STYLE = {
  blue: { glow: 'rgba(150,225,255,', a: '90,175,255', b: '30,110,235', post: ['#2f7de0', '#5fb4ff', '#1d56b0'], stroke: '#0b2a5a' },
  red: { glow: 'rgba(255,170,160,', a: '255,110,100', b: '220,40,50', post: ['#d23a3a', '#ff7a6a', '#8a1a1a'], stroke: '#4a0a0a' },
  gold: { glow: 'rgba(255,232,150,', a: '255,215,80', b: '235,150,20', post: ['#d99a10', '#ffe27a', '#8a5a00'], stroke: '#5a3300' },
};
const GATE_BG = {};
function gateBg(kind, w, h) {
  if (GATE_BG[kind]) return GATE_BG[kind];
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); const C = GATE_STYLE[kind];
  g.save(); g.shadowColor = C.glow + '1)'; g.shadowBlur = kind === 'gold' ? 28 : 18; g.strokeStyle = C.glow + '.95)'; g.lineWidth = kind === 'gold' ? 9 : 6;
  g.beginPath(); g.roundRect(10, 10, w - 20, h - 26, 8); g.stroke(); g.restore();
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
  for (const px of [gx - 18, gx + gw - 8]) {
    const pg = g.createLinearGradient(px, 0, px + 26, 0); pg.addColorStop(0, C.post[2]); pg.addColorStop(0.35, C.post[1]); pg.addColorStop(1, C.post[0]);
    g.fillStyle = pg; g.beginPath(); g.roundRect(px, gy - 14, 26, gh + 22, 6); g.fill();
    g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(px + 8, gy + 20, 4, gh * 0.45);
  }
  g.fillStyle = 'rgba(20,30,50,.85)'; g.fillRect(gx - 20, gy + gh + 4, gw + 40, 10);
  GATE_BG[kind] = c; return c;
}
function drawGate(g, w, h, label, kind) {
  g.clearRect(0, 0, w, h); g.drawImage(gateBg(kind, w, h), 0, 0);
  const gy = 34, gh = h - 76, n = label.length;
  g.font = `900 ${n <= 2 ? 146 : n === 3 ? 128 : n === 4 ? 106 : 90}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineJoin = 'round'; g.lineWidth = 20; g.strokeStyle = GATE_STYLE[kind].stroke; g.strokeText(label, w / 2, gy + gh * 0.52);
  g.fillStyle = kind === 'gold' ? '#fff6c8' : '#fff'; g.fillText(label, w / 2, gy + gh * 0.52);
}
function gateLabel(gt) { return gt.val >= GATE_MAX ? 'MAX' : gt.val > 0 ? '+' + gt.val : gt.val === 0 ? '0' : '\u2212' + Math.abs(gt.val); }
function gateKind(gt) { return gt.val >= GATE_MAX ? 'gold' : gt.val >= 0 ? 'blue' : 'red'; }
// vector icons for weapons that have no art cut from the concept
function iconCanvas(name) {
  const c = document.createElement('canvas'); c.width = 150; c.height = 124; const g = c.getContext('2d');
  g.lineCap = 'round'; g.lineJoin = 'round';
  if (name === 'spread') {
    for (let i = -2; i <= 2; i++) {
      g.save(); g.translate(75, 112); g.rotate(i * 0.32); g.fillStyle = 'rgba(80,255,220,.35)';
      g.beginPath(); g.ellipse(0, -62, 13, 30, 0, 0, TAU); g.fill();
      const gr = g.createLinearGradient(0, -95, 0, -30); gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#35e8c8');
      g.fillStyle = gr; g.strokeStyle = '#0b4a44'; g.lineWidth = 4; g.beginPath(); g.ellipse(0, -62, 8, 24, 0, 0, TAU); g.fill(); g.stroke(); g.restore();
    }
  } else if (name === 'laser') {
    g.save(); g.translate(75, 62); g.rotate(-0.55);
    g.fillStyle = 'rgba(255,60,210,.35)'; g.beginPath(); g.roundRect(-70, -18, 140, 36, 18); g.fill();
    g.fillStyle = '#ff4fd8'; g.beginPath(); g.roundRect(-66, -9, 132, 18, 9); g.fill();
    g.fillStyle = '#ffffff'; g.beginPath(); g.roundRect(-62, -4, 124, 8, 4); g.fill();
    g.fillStyle = '#3a4250'; g.strokeStyle = '#11161d'; g.lineWidth = 4; g.beginPath(); g.roundRect(-74, -20, 34, 40, 8); g.fill(); g.stroke();
    g.fillStyle = '#ff9af0'; g.beginPath(); g.arc(-40, 0, 7, 0, TAU); g.fill(); g.restore();
  } else if (name === 'cannon') {
    g.save(); g.translate(68, 70); g.rotate(-0.6);
    const gr = g.createLinearGradient(0, -20, 0, 20); gr.addColorStop(0, '#9aa5b1'); gr.addColorStop(0.5, '#56606c'); gr.addColorStop(1, '#2a3038');
    g.fillStyle = gr; g.strokeStyle = '#11161d'; g.lineWidth = 5; g.beginPath(); g.roundRect(-58, -20, 104, 40, 10); g.fill(); g.stroke();
    g.fillStyle = '#2a3038'; g.beginPath(); g.roundRect(38, -26, 20, 52, 6); g.fill(); g.stroke(); g.restore();
    const b = g.createRadialGradient(118, 30, 2, 118, 30, 26); b.addColorStop(0, '#fff6c0'); b.addColorStop(0.4, '#ffb030'); b.addColorStop(1, 'rgba(255,90,0,0)');
    g.fillStyle = b; g.beginPath(); g.arc(118, 30, 26, 0, TAU); g.fill();
  }
  return c;
}
const BADGES = {};
function makeBadge(name) {
  const c = document.createElement('canvas'); c.width = 220; c.height = 240; const g = c.getContext('2d');
  g.save(); g.shadowColor = 'rgba(120,220,255,1)'; g.shadowBlur = 22;
  g.beginPath(); g.roundRect(22, 18, 176, 150, 20); g.moveTo(90, 168); g.lineTo(110, 200); g.lineTo(130, 168);
  const gr = g.createLinearGradient(0, 18, 0, 200); gr.addColorStop(0, 'rgba(150,215,255,.78)'); gr.addColorStop(1, 'rgba(70,150,235,.78)');
  g.fillStyle = gr; g.fill(); g.restore();
  g.lineWidth = 6; g.strokeStyle = '#d8f6ff'; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(42, 18); g.lineTo(178, 18); g.arcTo(198, 18, 198, 38, 20); g.lineTo(198, 148); g.arcTo(198, 168, 178, 168, 20); g.lineTo(130, 168); g.lineTo(110, 200); g.lineTo(90, 168); g.lineTo(42, 168); g.arcTo(22, 168, 22, 148, 20); g.lineTo(22, 38); g.arcTo(22, 18, 42, 18, 20); g.stroke();
  const img = TEX['icon_' + name] ? TEX['icon_' + name].image : iconCanvas(name); const s = Math.min(150 / img.width, 124 / img.height);
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
let lastShot = 0, lastHit = 0, lastTick = 0, lastZap = 0;
const SFX = {
  shoot() { if (!ac || ac.currentTime - lastShot < 0.07) return; lastShot = ac.currentTime; noise(0.05, 3500, 900, 0.07, 'bandpass', 2); },
  hit() { if (!ac || ac.currentTime - lastHit < 0.05) return; lastHit = ac.currentTime; tone(rand(900, 1300), 0.03, 0.03, 'square'); },
  tick() { if (!ac || ac.currentTime - lastTick < 0.06) return; lastTick = ac.currentTime; tone(rand(1400, 1700), 0.03, 0.025, 'triangle'); },
  laser() { if (!ac || ac.currentTime - lastZap < 0.14) return; lastZap = ac.currentTime; noise(0.14, 3200, 1600, 0.035, 'bandpass', 6); tone(rand(620, 700), 0.12, 0.02, 'sawtooth'); },
  cannon() { noise(0.3, 900, 80, 0.35); tone(95, 0.25, 0.14, 'sine', 0, 0.5); },
  pop() { noise(0.22, 1800, 200, 0.25); tone(180, 0.15, 0.08, 'triangle', 0, 0.4); },
  boom() { noise(0.6, 1400, 60, 0.5); tone(90, 0.5, 0.2, 'sine', 0, 0.3); },
  big() { noise(1.4, 900, 40, 0.7); tone(60, 1.2, 0.3, 'sine', 0, 0.3); },
  gate() { [660, 880, 1175, 1568].forEach((f, i) => tone(f, 0.16, 0.08, 'triangle', i * 0.06)); },
  bad() { [440, 330, 247].forEach((f, i) => tone(f, 0.2, 0.08, 'sawtooth', i * 0.08)); },
  power() { [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.14, 0.07, 'square', i * 0.05)); },
  max() { [784, 988, 1175, 1568, 1976].forEach((f, i) => tone(f, 0.22, 0.08, 'triangle', i * 0.07)); },
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
let spiders = [], pods = [], gates = [], bullets = [], missiles = [], shells = [], acids = [], wingmen = [], pops = [], level = [], levelIdx = 0;
let boss = null, shake = 0, flashRed = 0, slowmo = 1, godMode = false;
const SLOTS = (() => {
  const s = [[-1.6, -0.15], [1.6, -0.15], [-2.35, 1.05], [2.35, 1.05]];
  const grid = [];
  for (let r = 0, z = -2.5; z <= 2.7; z += 0.72, r++) for (let x = -3.2; x <= 3.21; x += 0.8) {
    const xx = x + (r % 2 ? 0.4 : 0); if (xx > 3.35) continue;
    if (Math.abs(xx) < 1.25 && z < 1.3 && z > -1.6) continue;
    if (s.some(([a, b]) => Math.hypot(a - xx, b - z) < 0.75)) continue;
    grid.push([xx, z]);
  }
  grid.sort((a, b) => (Math.abs(a[0]) * 0.5 + Math.abs(a[1] - 0.4)) - (Math.abs(b[0]) * 0.5 + Math.abs(b[1] - 0.4)));
  return s.concat(grid).slice(0, MAXD);
})();

// weapon tiers: every tier changes colour and size so the upgrade is obvious
const GUNS = [null,
  { rate: 9, dmg: 3, w: 0.2, len: 1.4, col: [1, 0.82, 0.3], twin: false },
  { rate: 11, dmg: 4, w: 0.3, len: 1.7, col: [1, 0.48, 0.12], twin: true },
  { rate: 12, dmg: 6, w: 0.5, len: 2.2, col: [1, 0.1, 0.06], twin: true, core: true }];
const LASER_DPS = [0, 46, 66, 92];
function roman(n) { return ['', 'I', 'II', 'III'][n] || ''; }
function weaponName() {
  if (S.weapon === 'spread') return 'SPREAD ' + roman(S.gunLv);
  if (S.weapon === 'laser') return 'LASER ' + roman(S.gunLv);
  return ['', 'MACHINE GUN', 'TWIN GUNS', 'HEAVY GUNS'][S.gunLv];
}
function updateWeaponHud() {
  const col = S.weapon === 'spread' ? '#6fffe0' : S.weapon === 'laser' ? '#ff8af0' : ['', '#ffe07a', '#ffae5a', '#ff7a6a'][S.gunLv];
  let h = `<b style="color:${col}">${weaponName()}</b>`;
  if (S.missileLv) h += ` <i>MISSILES ×${S.missileLv * 2}</i>`;
  if (S.cannonLv) h += ` <i>CANNON ${roman(S.cannonLv)}</i>`;
  $('weap').innerHTML = h;
}
function hpColor(f) { return `hsl(${Math.round(clamp(f, 0, 1) * 120)},90%,48%)`; }
function updateHP() {
  const f = S.hp / S.hpMax; const el = $('hpfill');
  el.style.width = clamp(f * 100, 0, 100) + '%'; el.style.background = hpColor(f);
}

function buildLevel() {
  const L = [];
  const gate = (d, lane, val) => L.push({ d, k: 'gate', lane, val });
  const pod = (d, lane, hp, reward) => L.push({ d, k: 'pod', lane, hp, reward });
  // dense swarm block: lane -1 = full width, 0/1 = one lane
  const swarm = (d, lane, n, brute = 0, hp = 8) => {
    const cols = lane < 0 ? 7 : 3, x0 = lane < 0 ? 0 : LANE_X[lane], sx = lane < 0 ? 1.15 : 1.05;
    for (let i = 0; i < n; i++) {
      const r = Math.floor(i / cols), c = i % cols;
      const x = x0 + (c - (cols - 1) / 2) * sx + (r % 2 ? sx * 0.45 : 0) + rand(-0.2, 0.2);
      L.push({ d: d + r * 1.45 + rand(-0.3, 0.3), k: 'spider', x: clamp(x, -4.1, 4.1), hp, brute: false });
    }
    const back = d + Math.ceil(n / cols) * 1.45 + 1.6;
    for (let i = 0; i < brute; i++) L.push({ d: back + i * 0.5, k: 'spider', x: lane < 0 ? (i % 2 ? 1 : -1) * rand(0.6, 2.8) : LANE_X[lane] + rand(-0.6, 0.6), hp, brute: true });
  };
  gate(22, 0, 3); gate(22, 1, -4);
  swarm(36, -1, 10, 0, 6);
  pod(50, 0, 40, 'guns'); swarm(50, 1, 6, 0, 6);
  gate(66, 0, -8); gate(66, 1, 4);
  swarm(80, -1, 16, 0, 7);
  pod(96, 1, 70, 'spread'); swarm(94, 0, 9, 0, 7);
  gate(112, 0, -12); gate(112, 1, 2);
  swarm(126, -1, 21, 1, 8);
  // concept set-piece: gate + stacked pods in the right lane, bugs in the left
  gate(146, 1, 6); gate(146, 0, -10);
  pod(154, 1, 72, 'missile'); pod(162, 1, 110, 'laser'); pod(170, 1, 140, 'drone');
  swarm(150, 0, 12, 1, 8);
  swarm(188, -1, 28, 2, 9);
  gate(206, 0, -20); gate(206, 1, -5);
  pod(220, 0, 160, 'cannon'); swarm(218, 1, 15, 1, 9);
  swarm(238, -1, 35, 3, 10);
  gate(258, 0, 10); gate(258, 1, -30);
  pod(272, 1, 220, 'guns'); pod(272, 0, 180, 'drone');
  swarm(290, -1, 42, 4, 11);
  gate(312, 0, -40); gate(312, 1, 15);
  L.push({ d: BOSS_D - 20, k: 'warn' });
  L.push({ d: BOSS_D, k: 'boss' });
  L.sort((a, b) => a.d - b.d);
  return L;
}

function resetGame(play) {
  for (const a of [spiders, pods, gates]) for (const o of a) scene.remove(o.sprite);
  for (const w of wingmen) scene.remove(w.sprite);
  if (boss) scene.remove(boss.sprite);
  spiders = []; pods = []; gates = []; bullets = []; missiles = []; shells = []; acids = []; wingmen = []; pops = []; boss = null;
  Object.assign(S, { mode: play ? 'play' : 'title', t: 0, dist: 0, hp: 100, hpMax: 100, barT: 0, drones: 0, px: 0, tx: 0, vx: 0, inv: 0, kills: 0,
    weapon: 'gun', gunLv: 1, missileLv: 0, cannonLv: 0, fireT: 0, missileT: 1, cannonT: 1, laserT: 0, laserOn: false, gunSide: 0, smokeT: 0,
    endT: 0, maxDrones: 0, ended: false, enraged: false });
  slowmo = 1; shake = 0; flashRed = 0;
  level = buildLevel(); levelIdx = 0;
  setDrones(4, 0, 0);
  const w = Number(Q.get('warp') || 0);
  if (play && w > 0) { S.dist = w; while (levelIdx < level.length && level[levelIdx].d < w + 5) levelIdx++; setDrones(Number(Q.get('drones') || 14), 0, 0); S.gunLv = 2; S.missileLv = 1; }
  if (play) {
    if (Q.get('weapon')) S.weapon = Q.get('weapon');
    if (Q.get('tier')) S.gunLv = clamp(Number(Q.get('tier')), 1, 3);
    if (Q.get('mis')) S.missileLv = Number(Q.get('mis'));
    if (Q.get('can')) S.cannonLv = Number(Q.get('can'));
    if (Q.get('hp')) S.hp = Number(Q.get('hp'));
  }
  updateHP(); updateWeaponHud(); $('score').textContent = '0';
}

// ---------------------------------------------------------------- wingmen
function setDrones(n, fromX, fromZ) {
  n = clamp(Math.round(n), 0, MAXD);
  while (wingmen.length < n) {
    const s = sprite(TEX.plane, WING_W, 0.5, 0.5, 2);
    const w = { sprite: s, x: fromX ?? S.px, z: fromZ ?? 0, ph: rand(0, TAU), fireT: rand(0, 0.4), spawn: 0, hp: 10, max: 10, barT: 0, aim: 0, aimT: 0 };
    s.position.set(w.x, 0.4, w.z); wingmen.push(w);
  }
  while (wingmen.length > n) {
    const w = wingmen.pop(); explode(w.sprite.position.x, 0.4, w.sprite.position.z, 0.8, false); scene.remove(w.sprite);
  }
  S.drones = n; S.maxDrones = Math.max(S.maxDrones, n);
}
function removeWingman(j) {
  const w = wingmen[j]; if (!w) return;
  explode(w.x, 0.45, w.z, 0.9, true); scene.remove(w.sprite); wingmen.splice(j, 1); S.drones = wingmen.length;
  pop('\u22121', w.x, 1.2, w.z, '#ff6a5a', 0.8, '#3a0b0b');
}
function damageWingman(j, dmg) {
  const w = wingmen[j]; if (!w) return;
  w.hp -= dmg; w.barT = 1.6;
  if (w.hp <= 0) removeWingman(j);
}

// ---------------------------------------------------------------- spawning
function newSpider(x, z, hp, brute) {
  const s = sprite(brute ? TEX.boss : TEX.spider, brute ? 2.7 : 1.75, 0.5, 0.1, 1);
  const H = brute ? hp * 6 : hp;
  const o = { sprite: s, x, z, hp: H, max: H, brute, r: brute ? 1.15 : 0.8, vx: 0, vz: 0, spd: brute ? rand(0.9, 1.2) : rand(1.3, 2.1), ph: rand(0, TAU), flash: 0, barT: 0 };
  spiders.push(o); return o;
}
function spawnEvent(e) {
  const z = -(e.d - S.dist);
  if (e.k === 'spider') newSpider(e.x, z, e.hp, e.brute);
  else if (e.k === 'pod') {
    const s = sprite(TEX.pod, 2.35, 0.5, 0.05, 1);
    pods.push({ sprite: s, x: LANE_X[e.lane], z, hp: e.hp, max: e.hp, reward: e.reward, flash: 0, jolt: 0 });
  } else if (e.k === 'gate') {
    const tex = canvasTex(512, 420, () => { });
    const g = { x: LANE_X[e.lane], z, val: e.val, tex, passed: false, bump: 0, dirty: false, redrawT: 0 };
    redrawGate(g);
    const m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
    g.sprite = new THREE.Sprite(m); g.sprite.center.set(0.5, 0.02); g.sprite.scale.set(4.4, 4.4 * 420 / 512, 1); g.sprite.renderOrder = 1; scene.add(g.sprite);
    gates.push(g);
  } else if (e.k === 'warn') {
    banner('WARNING!', 'The Chitin Queen approaches', true, 2.6); sfx('warn'); setTimeout(() => sfx('warn'), 500);
  } else if (e.k === 'boss') {
    const s = sprite(TEX.boss, 5.6, 0.5, 0.08, 1);
    const hp = Number(Q.get('bosshp') || 3400);
    boss = { sprite: s, x: 0, z: -72, hp, max: hp, t: 0, state: 'enter', spawnT: 2.5, atkT: 4.5, tele: 0, teleLane: 0, flash: 0, volley: 0, volT: 0 };
    sfx('roar');
  }
}
function redrawGate(g) {
  drawGate(g.tex.canvas.getContext('2d'), 512, 420, gateLabel(g), gateKind(g));
  g.tex.needsUpdate = true; g.dirty = false;
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
function pop(text, x, y, z, color = '#fff', size = 1, stroke = '#0b2440') { pops.push({ text, x, y, z, t: 0, color, size, stroke }); }
let bannerT = 0;
function banner(text, sub, warn, dur = 1.6) {
  const b = $('banner'); b.innerHTML = text + (sub ? `<small>${sub}</small>` : ''); b.className = 'show' + (warn ? ' warn' : ''); bannerT = dur;
}

// ---------------------------------------------------------------- damage & rewards
function hurtPlayer(dmg = 20) {
  if (S.inv > 0 || godMode || S.mode !== 'play') return;
  S.hp = Math.max(0, S.hp - dmg); S.inv = 0.5; S.barT = 2.2; shake = Math.max(shake, 0.45); flashRed = 1; updateHP(); sfx('hurt');
  if (navigator.vibrate) try { navigator.vibrate(80); } catch (e) { }
  if (S.hp <= 0) killPlayer();
}
function killPlayer() {
  if (S.mode !== 'play') return;
  explode(S.px, 0.5, 0, 2.2); shake = 1; flashRed = 1; planeSprite.visible = false; setDrones(0);
  S.hp = 0; updateHP(); S.mode = 'dead'; S.endT = 1.6; sfx('lose');
}
function loseDrones(n, x, z) {
  if (S.drones <= 0) { hurtPlayer(25); return; }
  setDrones(S.drones - n); pop('\u2212' + n, x, 1.2, z, '#ff6a5a', 0.9, '#3a0b0b');
}
function killSpider(s, i) {
  explode(s.x, 0.4, s.z, s.brute ? 1.6 : 0.85, true, [0.75, 0.1, 0.08]);
  scene.remove(s.sprite); spiders.splice(i, 1); S.kills++; $('score').textContent = S.kills;
  if (s.brute) shake = Math.max(shake, 0.3);
}
function breakPod(p, i) {
  explode(p.x, 1, p.z, 1.8, true, [0.6, 0.62, 0.66]);
  scene.remove(p.sprite); pods.splice(i, 1); shake = Math.max(shake, 0.35);
  giveReward(p.reward, p.x, p.z);
}
function giveReward(R, x = S.px, z = -6) {
  flyIcons.push({ name: R, x, z, t: 0 });
  if (R === 'guns') { S.gunLv = Math.min(3, S.gunLv + 1); banner(S.gunLv >= 3 ? 'MAX FIREPOWER!' : 'FIREPOWER UP!', weaponName()); }
  if (R === 'spread') { S.weapon = 'spread'; banner('SPREAD SHOT!', 'Wide fan of cyan rounds'); }
  if (R === 'laser') { S.weapon = 'laser'; banner('LASER BEAM!', 'Pierces the whole swarm'); }
  if (R === 'missile') { S.missileLv = Math.min(3, S.missileLv + 1); banner('HOMING MISSILES!', 'Salvo \u00d7' + (S.missileLv * 2)); }
  if (R === 'cannon') { S.cannonLv = Math.min(2, S.cannonLv + 1); banner('HEAVY CANNON!', 'Explosive shells'); }
  if (R === 'drone') { setDrones(S.drones + 5, x, z); banner('+5 WINGMEN!', 'Drone squad'); }
  updateWeaponHud(); sfx('power');
}
const flyIcons = [];
function hitGate(t) {
  if (t.val >= GATE_MAX) return;
  const was = t.val; t.val = Math.min(GATE_MAX, t.val + 1); t.dirty = true; t.bump = Math.min(1, t.bump + 0.2);
  if ((was < 0) !== (t.val < 0)) t.redrawT = 0;
  if (t.val >= GATE_MAX) {
    t.redrawT = 0; sfx('max');
    for (let k = 0; k < 50; k++) fx.spawn({ x: t.x + rand(-2, 2), y: rand(0.3, 3.2), z: t.z, vx: rand(-4, 4), vy: rand(0, 4), vz: rand(-2, 3), life: rand(0.4, 0.9), s0: 0.7, s1: 0.1, r: 1, g: 0.85, b: 0.3, a: 1, world: true });
  } else sfx('tick');
}
function damage(t, kind, dmg, i) {
  if (kind === 's') { t.hp -= dmg; t.flash = 1; t.barT = 1.4; if (t.hp <= 0) killSpider(t, i < 0 ? spiders.indexOf(t) : i); }
  else if (kind === 'p') { t.hp -= dmg; t.flash = 1; t.jolt = 1; if (t.hp <= 0) breakPod(t, i < 0 ? pods.indexOf(t) : i); }
  else if (kind === 'g') hitGate(t);
  else if (kind === 'b') {
    if (t.state !== 'fight') return; t.hp -= dmg; t.flash = 1;
    if (t.hp <= 0) { t.hp = 0; t.state = 'dying'; t.t = 0; sfx('roar'); slowmo = 0.35; }
  }
}
function passGate(g) {
  const v = g.val, gold = v >= GATE_MAX;
  if (v > 0) {
    const before = S.drones; setDrones(S.drones + v, g.x, g.z);
    const heal = Math.min(S.hpMax - S.hp, 20 + Math.min(40, v));
    pop(gold ? 'MAX!' : '+' + v, S.px, 2.2, -1.5, gold ? '#ffe066' : '#9fe8ff', 1.6, gold ? '#5a3300' : '#0b2a5a');
    if (heal > 0) { S.hp += heal; S.barT = 2.2; pop('+' + Math.round(heal) + ' HP', S.px, 1.2, 0.8, '#8dff7a', 0.8, '#0b3a10'); updateHP(); }
    if (S.drones >= MAXD && before + v > MAXD) pop('SQUAD FULL \u00b7 35', S.px, 1.6, -3.2, '#ffe066', 0.7, '#3a2a00');
    sfx(gold ? 'max' : 'gate');
  } else if (v < 0) {
    if (S.drones <= 0) { pop('\u2212' + Math.abs(v), S.px, 2.2, -1.5, '#ff6a5a', 1.6, '#3a0b0b'); S.deathBy = 'gate'; killPlayer(); return; }
    setDrones(S.drones + v); pop('\u2212' + Math.abs(v), S.px, 2.2, -1.5, '#ff6a5a', 1.6, '#3a0b0b'); sfx('bad');
  }
  const c = gold ? [1, 0.85, 0.3] : v >= 0 ? [0.5, 0.85, 1] : [1, 0.4, 0.35];
  for (let k = 0; k < 40; k++) fx.spawn({ x: g.x + rand(-1.8, 1.8), y: rand(0.3, 3), z: g.z, vx: rand(-3, 3), vy: rand(-1, 3), vz: rand(-2, 4), life: rand(0.3, 0.7), s0: 0.5, s1: 0.1, r: c[0], g: c[1], b: c[2], a: 1, world: true });
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
  $('start').classList.add('hidden'); $('end').classList.add('hidden'); $('hud').classList.remove('hidden');
  planeSprite.visible = true; resetGame(true); banner('DEFEND EARTH!', 'Drag to steer \u00b7 shoot the gates', false, 1.8);
}
function endGame(win) {
  const e = $('end'); e.classList.remove('hidden'); e.classList.toggle('lose', !win);
  $('endtitle').textContent = win ? 'MISSION COMPLETE' : 'SHOT DOWN';
  $('endsub').textContent = win ? 'The Chitin Queen is down. Earth breathes again!' : (S.deathBy === 'gate' ? 'Flying alone into a negative gate is fatal. Shoot it positive first!' : 'The Chitin horde got you. Regroup, pilot!');
  $('st-kills').textContent = S.kills; $('st-drones').textContent = win ? S.drones : S.maxDrones; $('st-time').textContent = Math.round(S.t) + 's';
  const stars = win ? 1 + (S.hp >= 35) + (S.hp >= 70) : 0;
  [...$('stars').children].forEach((s, i) => s.classList.toggle('on', i < stars));
  $('hud').classList.add('hidden');
}

// ---------------------------------------------------------------- bot (testing)
function botThink() {
  let best = S.px, bestScore = -1e9;
  for (const cand of [LANE_X[0], LANE_X[1]]) {
    let sc = 0;
    for (const g of gates) if (!g.passed && g.z < 0 && g.z > -40 && Math.abs(g.x - cand) < 1) sc += (S.drones <= 0 && g.val < 0 && g.z > -8) ? -1000 : clamp(g.val, -60, 60) * (g.z > -10 ? 3 : 1);
    for (const p of pods) if (p.z > -40 && p.z < -8 && Math.abs(p.x - cand) < 1) sc += 3;
    for (const p of pods) if (p.z > -8 && Math.abs(p.x - cand) < 1.5) sc -= 20;
    for (const s of spiders) if (s.z > -12 && Math.abs(s.x - cand) < 1.6) sc -= s.brute ? 2 : 0.4;
    if (boss && boss.tele > 0 && boss.teleLane === (cand < 0 ? 0 : 1)) sc -= 80;
    for (const a of acids) if (Math.abs(a.x - cand) < 1.8) sc -= 40;
    if (sc > bestScore) { bestScore = sc; best = cand; }
  }
  S.tx = best;
}

// ---------------------------------------------------------------- weapons
function fireBullet(x, z, vx, vz, dmg, w, len, col, core, drone) {
  bullets.push({ x, z, vx, vz, dmg, w, len, r: col[0], g: col[1], b: col[2], core, drone });
}
function firePrimary(dt) {
  const lv = S.gunLv;
  S.laserOn = S.weapon === 'laser';
  if (S.laserOn) return;
  S.fireT -= dt;
  if (S.weapon === 'spread') {
    while (S.fireT <= 0) {
      S.fireT += 1 / 6.5;
      const n = 3 + lv * 2, half = 0.2 + lv * 0.05, dmg = 2 + lv;
      for (let i = 0; i < n; i++) {
        const a = (i / (n - 1) - 0.5) * 2 * half;
        fireBullet(S.px + Math.sin(a) * 0.6, -1.0, Math.sin(a) * 60, -Math.cos(a) * 60, dmg, 0.26 + lv * 0.03, 1.1, [0.3, 1, 0.85], lv >= 3, false);
      }
      fx.spawn({ x: S.px, y: 0.55, z: -1.2, vx: 0, vy: 0, vz: 0, life: 0.07, s0: 1.6, s1: 0.6, r: 0.4, g: 1, b: 0.9, a: 1 });
      sfx('shoot');
    }
    return;
  }
  const G1 = GUNS[lv];
  while (S.fireT <= 0) {
    S.fireT += 1 / G1.rate;
    const guns = G1.twin ? [-0.55, 0.55] : [S.gunSide ? 0.55 : -0.55];
    S.gunSide ^= 1;
    for (const gx of guns) {
      fireBullet(S.px + gx, -0.9, 0, -62, G1.dmg, G1.w, G1.len, G1.col, G1.core, false);
      fx.spawn({ x: S.px + gx, y: 0.55, z: -1.1, vx: 0, vy: 0, vz: 0, life: 0.06, s0: 1.0 + lv * 0.35, s1: 0.6, r: G1.col[0], g: G1.col[1] + 0.2, b: G1.col[2] + 0.2, a: 1 });
    }
    sfx('shoot');
  }
}
function fireWingmen(dt) {
  for (const w of wingmen) {
    w.fireT -= dt;
    if (w.fireT > 0) continue;
    w.fireT += 1 / 3;
    // straight ahead, unless a bug is right on top of the main plane: then nearby drones turn to shoot it
    let tgt = null, best = 1e9;
    for (const s of spiders) {
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
    fireBullet(w.x, w.z - 0.4, vx, vz, 2, 0.15, 0.9, [0.85, 0.62, 0.25], false, true);
    fx.spawn({ x: w.x, y: 0.45, z: w.z - 0.55, vx: 0, vy: 0, vz: 0, life: 0.05, s0: 0.6, s1: 0.3, r: 1, g: 0.85, b: 0.4, a: 1 });
  }
}
function fireSecondary(dt) {
  if (S.missileLv > 0) {
    S.missileT -= dt;
    if (S.missileT <= 0) {
      S.missileT = 1.4;
      const targets = [...spiders.filter((s) => s.z > RANGE_Z - 1 && s.z < -2), ...pods.filter((p) => p.z > RANGE_Z - 1 && p.z < -2)];
      if (boss && boss.state === 'fight') targets.push(boss, boss);
      if (targets.length) {
        for (let i = 0; i < S.missileLv * 2; i++) {
          const side = i % 2 ? 1 : -1; const t = targets[Math.floor(Math.random() * targets.length)];
          missiles.push({ x: S.px + side * 1.2, y: 0.75, z: 0.1, vx: side * rand(6, 9), vz: -rand(2, 5), t, life: 2.6, delay: Math.floor(i / 2) * 0.12 });
        }
        sfx('missile');
      }
    }
  }
  if (S.cannonLv > 0) {
    S.cannonT -= dt;
    if (S.cannonT <= 0) {
      S.cannonT = S.cannonLv >= 2 ? 0.9 : 1.3;
      shells.push({ x: S.px, z: -1.4, vz: -30, dmg: 28 * S.cannonLv });
      fx.spawn({ x: S.px, y: 0.6, z: -1.5, vx: 0, vy: 0, vz: 0, life: 0.12, s0: 2.6, s1: 1, r: 1, g: 0.6, b: 0.2, a: 1 });
      smokeFx.spawn({ x: S.px, y: 0.6, z: -1.4, vx: 0, vy: 0.4, vz: 1, life: 0.6, s0: 0.6, s1: 1.8, r: 0.5, g: 0.48, b: 0.46, a: 0.5 });
      sfx('cannon');
    }
  }
}
function splash(x, z, r, dmg, bossR) {
  for (let j = spiders.length - 1; j >= 0; j--) { const s = spiders[j]; if (s && Math.hypot(s.x - x, s.z - z) < r) damage(s, 's', dmg, j); }
  for (let j = pods.length - 1; j >= 0; j--) { const p = pods[j]; if (p && Math.hypot(p.x - x, p.z - z) < r) damage(p, 'p', dmg, j); }
  if (boss && boss.state === 'fight' && Math.hypot(boss.x - x, boss.z - z) < bossR) { damage(boss, 'b', dmg); pop(String(dmg), x, 2.6, z, '#ffd64a', 0.8); shake = Math.max(shake, 0.12); }
}

// ---------------------------------------------------------------- update
function update(dt) {
  const play = S.mode === 'play';
  S.t += play ? dt : 0;
  const v = OBJ_V * (S.mode === 'win' ? 1.6 : 1);
  const dz = v * dt;           // gameplay objects approach slowly
  const gdz = SPEED * dt;      // ground / clouds race past
  S.dist += dz;
  groundTex.offset.y += gdz / TILE;

  // steering
  if (play) {
    if (keyL) S.tx = clamp(S.tx - 9 * dt, -XMAX, XMAX);
    if (keyR) S.tx = clamp(S.tx + 9 * dt, -XMAX, XMAX);
    if (BOT) botThink();
  } else if (S.mode === 'title') S.tx = Math.sin(S.t * 0.2 + performance.now() * 0.0004) * 1.2;
  const prev = S.px; S.px = lerp(S.px, S.tx, 1 - Math.exp(-dt * 12)); S.vx = (S.px - prev) / Math.max(dt, 1e-4);
  S.inv = Math.max(0, S.inv - dt); S.barT = Math.max(0, S.barT - dt);
  const bob = Math.sin(performance.now() * 0.003) * 0.08;
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

  // level events
  if (play) while (levelIdx < level.length && level[levelIdx].d - S.dist < SPAWN_AHEAD) spawnEvent(level[levelIdx++]);

  // wingmen follow
  wingmen.forEach((w, i) => {
    const [sx, sz] = SLOTS[i] || [0, 3]; const k = 1 - Math.exp(-dt * (w.spawn < 1 ? 3.5 : 7));
    w.spawn = Math.min(1, w.spawn + dt * 1.2); w.barT = Math.max(0, w.barT - dt);
    w.x = lerp(w.x, S.px + sx, k); w.z = lerp(w.z, sz, k);
    w.aimHold = Math.max(0, (w.aimHold || 0) - dt); if (w.aimHold <= 0) w.aimT = 0;
    w.aim = lerp(w.aim, w.aimT, 1 - Math.exp(-dt * 12));
    const wb = Math.sin(performance.now() * 0.004 + w.ph) * 0.1;
    w.sprite.position.set(w.x, 0.45 + wb, w.z);
    w.sprite.material.rotation = clamp(-(S.px + sx - w.x) * 0.25, -0.4, 0.4) + w.aim;
  });

  if (play) { firePrimary(dt); fireWingmen(dt); fireSecondary(dt); }

  // spiders: fly towards the player's ship, turning with a limited rate
  for (let i = spiders.length - 1; i >= 0; i--) {
    const s = spiders[i];
    if (play && s.z < 1) {
      const dx = S.px - s.x, dzz = 0.2 - s.z, d = Math.hypot(dx, dzz) || 1;
      const k = 1 - Math.exp(-dt * (s.brute ? 1.3 : 2.2));
      s.vx = lerp(s.vx, dx / d * s.spd, k); s.vz = lerp(s.vz, dzz / d * s.spd, k);
    }
    s.x = clamp(s.x + (s.vx + Math.sin(s.ph * 0.3) * 0.25) * dt, -4.4, 4.4); s.z += dz + s.vz * dt;
    s.ph += dt * (s.brute ? 7 : 11); s.barT = Math.max(0, s.barT - dt);
  }
  // keep swarms from collapsing into one blob
  for (let i = 0; i < spiders.length; i++) {
    const a = spiders[i]; if (a.z < -48) continue;
    for (let j = i + 1; j < spiders.length; j++) {
      const b = spiders[j]; const dx = b.x - a.x, dzz = b.z - a.z; const min = (a.r + b.r) * 0.55;
      if (dx > min || dx < -min || dzz > min || dzz < -min) continue;
      const d = Math.hypot(dx, dzz) || 0.01; if (d >= min) continue;
      const push = (min - d) * 0.5 / d; a.x -= dx * push; a.z -= dzz * push; b.x += dx * push; b.z += dzz * push;
    }
  }
  for (let i = spiders.length - 1; i >= 0; i--) {
    const s = spiders[i];
    const sp = s.sprite, w0 = s.brute ? 2.7 : 1.75, img = sp.material.map.image;
    sp.position.set(s.x, 0.25 + Math.abs(Math.sin(s.ph)) * 0.12, s.z);
    sp.scale.set(w0 * (1 + Math.sin(s.ph * 2) * 0.03), w0 * img.height / img.width * (1 - Math.sin(s.ph * 2) * 0.05), 1);
    sp.material.rotation = clamp(-s.vx * 0.14, -0.35, 0.35) + Math.sin(s.ph) * 0.05;
    s.flash = Math.max(0, s.flash - dt * 8); sp.material.color.setScalar(1 + s.flash * 1.6);
    if (play && s.z > -1.2 && s.z < 1.6) {
      let hitW = -1, hitD = 1e9;
      wingmen.forEach((w, j) => { const d = Math.abs(w.x - s.x); if (d < 0.7 + s.r * 0.5 && Math.abs(w.z - s.z) < 0.85 && d < hitD) { hitD = d; hitW = j; } });
      if (hitW >= 0) { damageWingman(hitW, s.brute ? 10 : 5); killSpider(s, i); continue; }
      if (Math.abs(S.px - s.x) < 1.0 + s.r * 0.4 && Math.abs(s.z) < 0.9) { hurtPlayer(s.brute ? 25 : 10); killSpider(s, i); continue; }
    }
    if (s.z > 6) { scene.remove(s.sprite); spiders.splice(i, 1); }
  }

  // pods
  for (let i = pods.length - 1; i >= 0; i--) {
    const p = pods[i]; p.z += dz;
    p.flash = Math.max(0, p.flash - dt * 8); p.jolt = Math.max(0, p.jolt - dt * 10);
    p.sprite.position.set(p.x + (Math.random() - 0.5) * p.jolt * 0.08, 0.15 + Math.sin(S.dist * 0.5 + p.x) * 0.06, p.z);
    p.sprite.material.color.setScalar(1 + p.flash * 0.9);
    if (play && p.z > -0.8 && p.z < 1 && Math.abs(S.px - p.x) < 1.7) {
      explode(p.x, 1, p.z, 1.5); scene.remove(p.sprite); pods.splice(i, 1); loseDrones(3, p.x, p.z); continue;
    }
    if (p.z > 6) { scene.remove(p.sprite); pods.splice(i, 1); }
  }

  // gates
  for (let i = gates.length - 1; i >= 0; i--) {
    const g = gates[i]; g.z += dz; g.bump = Math.max(0, g.bump - dt * 4);
    g.redrawT -= dt; if (g.dirty && g.redrawT <= 0) { redrawGate(g); g.redrawT = 0.07; }
    const sc = 1 + g.bump * 0.06 + (g.val >= GATE_MAX ? Math.sin(performance.now() * 0.012) * 0.02 : 0);
    g.sprite.position.set(g.x, 0, g.z); g.sprite.scale.set(4.4 * sc, 4.4 * 420 / 512 * sc, 1);
    if (g.val >= GATE_MAX && Math.random() < dt * 20) fx.spawn({ x: g.x + rand(-2, 2), y: rand(0.2, 3.3), z: g.z, vx: 0, vy: rand(0.5, 1.5), vz: 0, life: 0.5, s0: 0.5, s1: 0.1, r: 1, g: 0.85, b: 0.35, a: 1, world: true });
    if (play && !g.passed && g.z >= -0.2) {
      g.passed = true;
      const mine = Math.abs(S.px - g.x) < 2.25 && !gates.some((o) => o !== g && !o.passed && Math.abs(o.z - g.z) < 1 && Math.abs(S.px - o.x) < Math.abs(S.px - g.x));
      if (mine) {
        if (g.dirty) redrawGate(g);
        passGate(g);
        gates.forEach((o) => { if (o !== g && Math.abs(o.z - g.z) < 1) o.passed = true; });
        scene.remove(g.sprite); gates.splice(i, 1); continue;
      }
    }
    if (g.z > 5) { scene.remove(g.sprite); gates.splice(i, 1); }
  }

  if (boss) updateBoss(dt, dz);

  // targets inside bullet range
  const targets = [];
  for (const g of gates) if (!g.passed && g.z < -1 && g.z > RANGE_Z - 0.5) targets.push([g, 'g', 2.0, 0.4]);
  for (const s of spiders) if (s.z > RANGE_Z - 1) targets.push([s, 's', s.r, s.brute ? 1 : 0.7]);
  for (const p of pods) if (p.z > RANGE_Z - 1) targets.push([p, 'p', 1.2, 0.8]);
  if (boss && boss.state === 'fight') targets.push([boss, 'b', 3.3, 1.6]);
  const alive = (t, k) => k === 's' ? spiders.includes(t) : k === 'p' ? pods.includes(t) : k === 'b' ? boss === t && t.state === 'fight' : !t.passed;

  // bullets
  tracers.begin(); beams.begin();
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i]; let nz = b.z + b.vz * dt; const nx = b.x + b.vx * dt;
    const lo = Math.max(Math.min(b.z, nz), RANGE_Z), hi = Math.max(b.z, nz), mx = (b.x + nx) / 2;
    let hit = null, hz = b.vz < 0 ? -1e9 : 1e9;
    for (const tg of targets) {
      const t = tg[0]; if (t.hp !== undefined && t.hp <= 0) continue;
      if (Math.abs(mx - t.x) < tg[2] && t.z - tg[3] <= hi && t.z + tg[3] >= lo && (b.vz < 0 ? t.z > hz : t.z < hz)) { hit = tg; hz = t.z; }
    }
    if (hit && alive(hit[0], hit[1])) {
      const t = hit[0];
      damage(t, hit[1], b.dmg, -1);
      if (Math.random() < (b.drone ? 0.35 : 0.7)) spark(mx, hit[1] === 'g' ? rand(0.5, 2.5) : hit[1] === 'b' ? rand(1, 3) : 0.6, t.z + 0.3, b.w > 0.3, [b.r, Math.min(1, b.g + 0.2), Math.min(1, b.b + 0.3)]);
      if (Math.random() < 0.25) sfx('hit');
      bullets.splice(i, 1); continue;
    }
    b.z = nz; b.x = nx;
    if (b.z <= RANGE_Z || b.z > 6 || Math.abs(b.x) > 9) { bullets.splice(i, 1); continue; }
    const fade = clamp((b.z - RANGE_Z) / 4, 0.2, 1), rot = (b.vx || b.vz > 0) ? Math.atan2(-b.vx, -b.vz) : 0;
    tracers.add(b.x, b.drone ? 0.45 : 0.5, b.z, b.w, b.len, rot, b.r * fade, b.g * fade, b.b * fade);
    if (b.core) tracers.add(b.x, 0.52, b.z, b.w * 0.22, b.len * 0.7, rot, fade * 0.8, fade * 0.6, fade * 0.35);
  }

  // laser beam: pierces everything in a narrow column up to the range limit
  if (play && S.laserOn && planeSprite.visible) {
    const lv = S.gunLv, hw = 0.35 + lv * 0.12, z0 = -1.3, len = z0 - RANGE_Z, zc = (z0 + RANGE_Z) / 2;
    const pulse = 0.8 + 0.2 * Math.sin(performance.now() * 0.04);
    const col = lv >= 3 ? [0.6, 0.9, 1] : lv >= 2 ? [0.75, 0.35, 1] : [1, 0.25, 0.85];
    beams.add(S.px, 0.56, zc, hw * 3.2 * pulse, len, 0, col[0], col[1], col[2]);
    beams.add(S.px, 0.57, zc, hw * 1.1, len, 0, 1, 1, 1);
    fx.draw(S.px, 0.6, z0, 1.6 * pulse, col[0], col[1], col[2], 1);
    fx.draw(S.px, 0.6, RANGE_Z, 1.2 * pulse, col[0], col[1], col[2], 0.8);
    S.laserT -= dt; sfx('laser');
    while (S.laserT <= 0) {
      S.laserT += 0.05;
      const tick = LASER_DPS[lv] * 0.05;
      for (const tg of targets) {
        const t = tg[0]; if (!alive(t, tg[1])) continue;
        if (t.z > z0 || t.z < RANGE_Z || Math.abs(t.x - S.px) > tg[2] * 0.6 + hw) continue;
        damage(t, tg[1], tick, -1);
        if (Math.random() < 0.3) spark(S.px + rand(-0.3, 0.3), tg[1] === 'b' ? rand(1, 3) : 0.7, t.z + 0.3, true, col);
      }
    }
  }
  // cannon shells
  for (let i = shells.length - 1; i >= 0; i--) {
    const s = shells[i]; const nz = s.z + s.vz * dt;
    let hit = false;
    for (const tg of targets) {
      if (tg[1] === 'g') continue; const t = tg[0];
      if (alive(t, tg[1]) && Math.abs(s.x - t.x) < tg[2] + 0.3 && t.z - tg[3] <= s.z && t.z + tg[3] >= nz) { hit = true; break; }
    }
    s.z = nz;
    if (hit || s.z <= RANGE_Z) {
      explode(s.x, 0.6, s.z, 1.35, true); splash(s.x, s.z, 2.3, s.dmg, 3.6);
      shells.splice(i, 1); continue;
    }
    tracers.add(s.x, 0.6, s.z, 0.6, 0.95, 0, 1, 0.45, 0.1);
    tracers.add(s.x, 0.62, s.z, 0.28, 0.6, 0, 1, 0.95, 0.7);
    fx.draw(s.x, 0.6, s.z, 1.7, 1, 0.5, 0.15, 0.9);
  }
  tracers.end(); beams.end();

  // homing missiles, clearly visible with smoke trails
  missilesB.begin();
  for (let i = missiles.length - 1; i >= 0; i--) {
    const m = missiles[i];
    if (m.delay > 0) { m.delay -= dt; continue; }
    m.life -= dt;
    const ok = m.t && (m.t === boss ? boss && boss.state === 'fight' : (spiders.includes(m.t) || pods.includes(m.t)));
    const tx = ok ? m.t.x : m.x + m.vx * 0.1, tz = ok ? m.t.z : m.z - 10;
    const dx = tx - m.x, dzz = tz - m.z, d = Math.hypot(dx, dzz) || 1;
    const sp = 24; m.vx = lerp(m.vx, dx / d * sp, 1 - Math.exp(-dt * 4)); m.vz = lerp(m.vz, dzz / d * sp, 1 - Math.exp(-dt * 4));
    m.x += m.vx * dt; m.z += m.vz * dt;
    const bx = m.x + m.vx / sp * 0.7, bz = m.z + m.vz / sp * 0.7;
    smokeFx.spawn({ x: m.x - m.vx / sp * 0.7, y: m.y, z: m.z - m.vz / sp * 0.7, vx: rand(-0.3, 0.3), vy: 0.3, vz: 0, life: 0.75, s0: 0.35, s1: 1.15, r: 0.92, g: 0.92, b: 0.95, a: 0.6, world: true });
    fx.draw(m.x - m.vx / sp * 0.75, m.y, m.z - m.vz / sp * 0.75, 1.3, 1, 0.6, 0.2, 1);
    missilesB.add(m.x, m.y, m.z, 0.5, 1.5, Math.atan2(-m.vx, -m.vz), 1, 1, 1);
    if ((ok && d < (m.t === boss ? 2.2 : 0.8)) || m.life <= 0 || m.z < RANGE_Z - 4) {
      explode(bx, 0.6, bz, 1.0, false); sfx('pop'); splash(m.x, m.z, 1.9, 16, 3.3);
      missiles.splice(i, 1);
    }
  }
  missilesB.end();

  // acid volleys
  for (let i = acids.length - 1; i >= 0; i--) {
    const a = acids[i]; a.z += a.vz * dt; a.y = Math.max(0.3, a.y - dt * 2);
    fx.draw(a.x, a.y, a.z, 1.4, 0.55, 1, 0.25, 0.9);
    fx.draw(a.x, a.y, a.z, 0.6, 1, 1, 0.8, 1);
    if (Math.random() < 0.4) smokeFx.spawn({ x: a.x, y: a.y, z: a.z, vx: 0, vy: 0.2, vz: 0, life: 0.4, s0: 0.5, s1: 0.2, r: 0.4, g: 0.8, b: 0.2, a: 0.6 });
    if (play && a.z > -1 && a.z < 1.2) {
      let hitW = -1;
      wingmen.forEach((w, j) => { if (Math.abs(w.x - a.x) < 0.7 && Math.abs(w.z - a.z) < 0.8) hitW = j; });
      if (hitW >= 0) { damageWingman(hitW, 10); acids.splice(i, 1); continue; }
      if (Math.abs(S.px - a.x) < 1.0 && Math.abs(a.z) < 0.8) { hurtPlayer(18); acids.splice(i, 1); continue; }
    }
    if (a.z > 5) acids.splice(i, 1);
  }

  // ambient: clouds, smoke (these race by at the fast ground speed)
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

  // boss lane warning strip
  flats.begin();
  if (boss && boss.tele > 0) {
    const a = 0.5 + 0.5 * Math.sin(performance.now() * 0.03);
    flats.add(LANE_X[boss.teleLane], 0.03, (boss.z + 3) / 2, 4.2, Math.abs(boss.z - 3), 0, 0.9 * a, 0.15 * a, 0.1 * a);
  }
  flats.end();
  ringFx.begin();
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i]; r.t += dt; r.z += dz; if (r.t > 0.45) { rings.splice(i, 1); continue; }
    const k = r.t / 0.45, s = r.s * (0.3 + k); ringFx.add(r.x, 0.1, r.z, s, s * 0.8, 0, (1 - k) * 0.6, (1 - k) * 0.45, (1 - k) * 0.25);
  }
  ringFx.end();

  for (let i = flyIcons.length - 1; i >= 0; i--) { const f = flyIcons[i]; f.t += dt * 1.6; if (f.t >= 1) flyIcons.splice(i, 1); }
  for (let i = pops.length - 1; i >= 0; i--) { const p = pops[i]; p.t += dt; p.z += dz * 0.2; if (p.t > 1.1) pops.splice(i, 1); }

  fx.update(dt, v); smokeFx.update(dt, v); worldFx.update(dt, v);

  if (S.mode === 'dead' || S.mode === 'win') { S.endT -= dt / Math.max(slowmo, 0.3); if (S.endT <= 0 && !S.ended) { S.ended = true; endGame(S.mode === 'win'); } }
  if (play) $('progfill').style.width = clamp(S.dist / BOSS_D * 100, 0, 100) + '%';
  if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) $('banner').className = ''; }
  shake = Math.max(0, shake - dt * 2.2); flashRed = Math.max(0, flashRed - dt * 2.5);
}

function updateBoss(dt, dz) {
  const b = boss; b.t += dt; b.flash = Math.max(0, b.flash - dt * 8);
  const play = S.mode === 'play';
  if (b.state === 'enter') {
    b.z += dz + 9 * dt; if (b.z >= -15.5) { b.z = -15.5; b.state = 'fight'; b.t = 0; banner('CHITIN QUEEN', 'Shoot it down!', true, 1.6); shake = Math.max(shake, 0.5); sfx('roar'); }
  } else if (b.state === 'fight') {
    const enr = b.hp < b.max * 0.5;
    if (enr && !S.enraged) { S.enraged = true; banner('ENRAGED!', 'Watch the red lane', true, 1.4); sfx('roar'); flashRed = 0.6; b.atkT = Math.min(b.atkT, 1.2); }
    b.x = Math.sin(b.t * (enr ? 0.7 : 0.5)) * 1.7;
    b.spawnT -= dt;
    if (b.spawnT <= 0 && play) {
      b.spawnT = enr ? 3 : 3.8;
      const n = enr ? 6 : 4;
      for (let i = 0; i < n; i++) newSpider(clamp(b.x + rand(-2.8, 2.8), -4, 4), b.z + rand(1, 3), 10, false);
    }
    b.atkT -= dt;
    if (b.atkT <= 0 && b.tele <= 0 && b.volley <= 0 && play) { b.tele = 1.1; b.teleLane = S.px < 0 ? 0 : 1; sfx('warn'); }
    if (b.tele > 0) { b.tele -= dt; if (b.tele <= 0) { b.volley = enr ? 7 : 5; b.volT = 0; sfx('roar'); } }
    if (b.volley > 0) {
      b.volT -= dt;
      if (b.volT <= 0) {
        b.volT = 0.14; b.volley--;
        for (const o of [-1.2, 0, 1.2]) acids.push({ x: LANE_X[b.teleLane] + o + rand(-0.2, 0.2), y: 1.6, z: b.z + 1.5, vz: 24 });
        if (b.volley <= 0) b.atkT = enr ? 3.2 : 4.4;
      }
    }
  } else if (b.state === 'dying') {
    b.x += Math.sin(b.t * 40) * 0.05;
    if (Math.random() < dt * 14) explode(b.x + rand(-2.5, 2.5), rand(0.5, 3.5), b.z + rand(-1, 1), rand(1, 1.8), Math.random() < 0.5);
    shake = Math.max(shake, 0.3);
    if (b.t > 1.8) {
      explode(b.x, 1.5, b.z, 4, true, [0.75, 0.1, 0.08]); shake = 1.2;
      scene.remove(b.sprite); boss = null; slowmo = 1;
      for (const s of spiders) { explode(s.x, 0.4, s.z, 0.8, false); scene.remove(s.sprite); }
      spiders = []; acids = [];
      S.mode = 'win'; S.endT = 2.2; sfx('win'); banner('VICTORY!', 'Earth is safe\u2026 for now', false, 2.2);
      return;
    }
  }
  const sp = b.sprite, img = sp.material.map.image, w0 = 5.6;
  const breathe = Math.sin(b.t * 3) * 0.03;
  sp.position.set(b.x, 0.3 + Math.abs(Math.sin(b.t * 5)) * 0.1, b.z);
  sp.scale.set(w0 * (1 + breathe), w0 * img.height / img.width * (1 - breathe), 1);
  sp.material.rotation = Math.sin(b.t * 2.5) * 0.04;
  sp.material.color.setScalar(1 + b.flash * 0.7);
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
// small life bar: green -> yellow -> red, fades in on damage and out afterwards
function lifeBar(x, y, w, h, f, alpha) {
  if (alpha <= 0.01) return;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(12,16,22,.85)'; ctx.fillRect(x - w / 2 - 1.5, y - 1.5, w + 3, h + 3);
  ctx.fillStyle = hpColor(f); ctx.fillRect(x - w / 2, y, Math.max(0, w * clamp(f, 0, 1)), h);
  ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(x - w / 2, y, Math.max(0, w * clamp(f, 0, 1)), Math.max(1, h * 0.35));
  ctx.globalAlpha = 1;
}
function drawOverlay() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const now = performance.now() * 0.05;
  if (planeSprite.visible) drawProp(S.px, 0.62, -1.05, 0.62, now);
  for (const w of wingmen) drawProp(w.sprite.position.x, w.sprite.position.y + 0.03, w.z - 0.45, 0.27, now + w.ph);
  ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (const w of wingmen) for (const o of [-0.58, 0.58]) {
    const a = toScreen(w.x + o, 0.45, w.z + 0.1), b = toScreen(w.x + o, 0.45, w.z + 2.4); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
  }
  if (planeSprite.visible) for (const o of [-1.35, 1.35]) { const a = toScreen(S.px + o, 0.55, 0.05), b = toScreen(S.px + o, 0.55, 3.5); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
  ctx.stroke();
  // pods: HP numbers + weapon badges
  for (const p of pods) {
    if (p.z < -95) continue;
    const u = unitPx(p.x, 0, p.z); const h = 2.35 * 202 / 297;
    const [nx, ny] = toScreen(p.x, 0.1 + h * 0.36, p.z);
    txt(String(Math.max(0, Math.ceil(p.hp))), nx + u * 0.02, ny, Math.max(9, u * 0.74), '#fff', '#1a2230', 0.16);
    const [bx, by] = toScreen(p.x, 0.1 + h * 1.02, p.z);
    const img = BADGES[p.reward]; const bw = u * 1.7, bh = bw * img.height / img.width;
    const bob = Math.sin(now * 0.08 + p.x) * u * 0.05;
    ctx.drawImage(img, bx - bw / 2, by - bh * 0.84 + bob, bw, bh);
  }
  // boss bar (kept big)
  if (boss && boss.state !== 'enter') {
    const u = unitPx(boss.x, 0, boss.z); const img = boss.sprite.material.map.image; const bh = 5.6 * img.height / img.width;
    let [x, y] = toScreen(boss.x, 0.3 + bh * 0.97, boss.z);
    const w = u * 3.4, hh = Math.max(8, u * 0.36);
    y = Math.max(y, 118 + hh * 2);
    ctx.fillStyle = '#1b1e24'; ctx.beginPath(); ctx.roundRect(x - w / 2 - 3, y - hh / 2 - 3, w + 6, hh + 6, hh); ctx.fill();
    ctx.fillStyle = '#3a4150'; ctx.beginPath(); ctx.roundRect(x - w / 2, y - hh / 2, w, hh, hh / 2); ctx.fill();
    const f = boss.hp / boss.max;
    if (f > 0) { const gr = ctx.createLinearGradient(0, y - hh / 2, 0, y + hh / 2); gr.addColorStop(0, '#ff7a3a'); gr.addColorStop(1, '#e02a10'); ctx.fillStyle = gr; ctx.beginPath(); ctx.roundRect(x - w / 2, y - hh / 2, Math.max(hh, w * f), hh, hh / 2); ctx.fill(); }
    txt(String(Math.ceil(boss.hp)), x, y - hh * 1.6, Math.max(14, u * 0.75), '#fff', '#1a1a22', 0.18, true);
  }
  // life bars: bugs, drones, main plane (only while taking damage)
  for (const s of spiders) if (s.barT > 0 && s.hp > 0) {
    const u = unitPx(s.x, 0, s.z); const [x, y] = toScreen(s.x, s.brute ? 2.6 : 1.7, s.z);
    lifeBar(x, y, u * (s.brute ? 1.5 : 0.95), Math.max(3, u * (s.brute ? 0.16 : 0.11)), s.hp / s.max, Math.min(1, s.barT / 0.35));
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
    const [x, y] = toScreen(S.px, 0, 1.75);
    const full = S.drones >= MAXD, label = '\u00d7' + S.drones + (full ? ' MAX' : '');
    ctx.font = `900 17px ${FONT}`; const tw = ctx.measureText(label).width + 30;
    ctx.fillStyle = full ? 'rgba(90,60,0,.8)' : 'rgba(12,40,80,.72)'; ctx.strokeStyle = full ? 'rgba(255,220,110,.95)' : 'rgba(160,225,255,.95)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(x - tw / 2, y - 13, tw, 26, 13); ctx.fill(); ctx.stroke();
    const pi = TEX.icon_drone.image; ctx.drawImage(pi, x - tw / 2 + 5, y - 9, 22, 22 * pi.height / pi.width);
    txt(label, x + 11, y + 1, 17, full ? '#ffe066' : '#fff', '#0b2440', 0.12);
  }
  for (const f of flyIcons) {
    const k = f.t, e = k * k * (3 - 2 * k);
    const [ax, ay] = toScreen(f.x, 2.5, f.z), [bx, by] = toScreen(S.px, 0.6, 0);
    const x = lerp(ax, bx, e), y = lerp(ay, by, e) - Math.sin(k * Math.PI) * 60; const img = BADGES[f.name]; const s = 70 * (1 - k * 0.5);
    ctx.globalAlpha = 1 - k * k; ctx.drawImage(img, x - s / 2, y - s / 2, s, s * img.height / img.width); ctx.globalAlpha = 1;
  }
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
  // bullets reach about three quarters of the way up the screen
  let lo = -90, hi = -2;
  for (let i = 0; i < 32; i++) { const mid = (lo + hi) / 2; if (toScreen(0, 0.5, mid)[1] < H * 0.25) lo = mid; else hi = mid; }
  RANGE_Z = (lo + hi) / 2;
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
  ['missile', 'guns', 'drone', 'spread', 'laser', 'cannon'].forEach(makeBadge);
  setupWorld(); resize(); resetGame(false);
  ready = true; $('loading').textContent = '';
  if (Q.has('autostart')) startGame();
}
requestAnimationFrame(loop);
boot();

window.__G = { S, get spiders() { return spiders; }, get pods() { return pods; }, get gates() { return gates; }, get boss() { return boss; }, get wingmen() { return wingmen; },
  get bullets() { return bullets; }, get missiles() { return missiles; }, get RANGE_Z() { return RANGE_Z; }, god(v) { godMode = v; }, give: (r) => giveReward(r),
  hurt: (d) => hurtPlayer(d), setDrones: (n) => setDrones(n), toScreen, wcam, start: () => startGame(), camera, CAM_POS, CAM_LOOK, resize };
