import * as THREE from '/vendor/three.module.js';

// ---------- world constants (keep in sync with server.js) ----------
const STALL_W = 110;
const ENTRANCE_W = 220;
const END_PAD = 180;
const FLOOR_H = 220;
const ENTER_X = 70;
const ENTER_Y = 100;
const SPEED = 280;

// server units -> meters
const U = 0.01;
const Z0 = 0.42; // walkers stay this far in front of the stall doors
const toX = (x) => x * U;
const toZ = (y) => Z0 + y * U;
const STALL_M = STALL_W * U;
const DOOR_W = 0.96;
const SIT_Y = 0.45; // sitting lift so the head peeks over the door
const PILE_MAX = 10;
const POOP_STEP = 0.125;

const THEMES = {
  company: {
    emoji: '🏢', label: '회사 화장실', sign: '화장실 · B2',
    sky: '#b7bec4', fog: [10, 26], hemi: ['#ffffff', '#7d8790', 1.5], sun: ['#eef6ff', 1.7],
    wall: () => tex.panel('#e6e9ec', '#cdd2d7'), wallTile: 1.4,
    floor: () => tex.tile('#9aa2a9', '#868e95', 2), floorTile: 1.2,
    stripe: null, door: '#aab4bd', partition: '#98a3ad', rail: '#78828b',
    fixtures: 'tube', gap: 0.18, doorTop: 1.32, signBg: '#2b2f36', signInk: '#ffffff', doorway: 'day',
  },
  highway: {
    emoji: '🛣️', label: '고속도로 휴게소', sign: '🚻 휴게소 화장실',
    sky: '#cfe2e6', fog: [10, 26], hemi: ['#ffffff', '#a59a88', 1.6], sun: ['#ffffff', 1.8],
    wall: () => tex.tile('#f7f9f8', '#d9e2e0', 4), wallTile: 1.0,
    floor: () => tex.tile('#dcd3c3', '#c2b7a5', 2), floorTile: 1.2,
    stripe: '#2e9e6e', door: '#2f8f83', partition: '#287b71', rail: '#8aa5a1',
    fixtures: 'tube', gap: 0.18, doorTop: 1.32, signBg: '#1f7a4d', signInk: '#ffffff', doorway: 'day',
  },
  usa: {
    emoji: '🇺🇸', label: '미국 화장실', sign: 'RESTROOM',
    sky: '#d8c9ad', fog: [10, 26], hemi: ['#fff6e5', '#6d6458', 1.5], sun: ['#ffe8c4', 1.7],
    wall: () => tex.tile('#f0e6d3', '#ddcfb6', 4), wallTile: 1.0,
    floor: () => tex.tile('#808287', '#6e7075', 2), floorTile: 1.2,
    stripe: '#b4462e', door: '#bea77d', partition: '#a8916a', rail: '#8b7a5a',
    fixtures: 'tube', gap: 0.46, doorTop: 1.26, signBg: '#ffffff', signInk: '#1c3d7a', doorway: 'day',
  },
  outhouse: {
    emoji: '🪵', label: '옛날 뒷간', sign: '뒷 간',
    sky: '#0a0c15', fog: [7, 18], hemi: ['#8f9cff', '#4a3420', 1.0], sun: ['#aab8ff', 0.6],
    wall: () => tex.wood('#6a4a2b', '#3e2914'), wallTile: 1.3,
    floor: () => tex.dirt('#4a382b'), floorTile: 2.0,
    stripe: null, door: '#ffffff', doorTex: () => tex.wood('#8f5e33', '#5a3a1c'), partition: '#5c3d20', rail: '#3f2a16',
    fixtures: 'bulb', gap: 0.2, doorTop: 1.3, signBg: '#eadbb6', signInk: '#3a2a1a', doorway: 'night', night: true,
  },
};

const HAIR = ['#2b1d14', '#4a2f1d', '#151515', '#7a4b26', '#3b2a4a'];
const SKIN = '#ffe0c2';

const $ = (s) => document.querySelector(s);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, k) => a + (b - a) * k;
const stallCenter = (i) => ENTRANCE_W + i * STALL_W + STALL_W / 2; // server units
const worldW = () => ENTRANCE_W + stalls.length * STALL_W + END_PAD;

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};

// ---------- game state ----------

const params = new URLSearchParams(location.search);
let ws = null;
let meId = null;
let room = null;
let theme = 'highway';
let stalls = []; // occupant id or 0
let piles = [];
let hp = []; // door health per stall
let held = []; // stall held for someone in line
let shakeT = 0;
const users = new Map(); // id -> entry
const me = { x: 100, y: 120, d: 1, s: -1, ready: false, rolling: false, pd: false, q: 0 };
const keys = new Set();
let target = null;
let pendingEnter = -1;
let holding = false;
let lastSent = { x: 0, y: 0, d: 1, t: 0 };
let soundOn = false;
const happyUntil = new Map();

// ---------- three.js setup ----------

const sceneEl = $('#scene');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
sceneEl.append(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 60);
const hemi = new THREE.HemisphereLight();
const sun = new THREE.DirectionalLight();
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 5, bottom: -4, near: 0.5, far: 20 });
sun.shadow.bias = -0.0006;
const bulbLights = [new THREE.PointLight('#ffb45a', 0, 0, 2), new THREE.PointLight('#ffb45a', 0, 0, 2)];
scene.add(hemi, sun, sun.target, ...bulbLights);

const envRoot = new THREE.Group();
const stallRoot = new THREE.Group();
const charRoot = new THREE.Group();
const fxRoot = new THREE.Group();
scene.add(envRoot, stallRoot, charRoot, fxRoot);

let camX = 1;
let W = 1;
let H = 1;
function resize() {
  W = sceneEl.clientWidth;
  H = sceneEl.clientHeight;
  renderer.setSize(W, H);
  camera.aspect = W / H;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ---------- textures ----------

function canvasTexture(w, h, draw, repeat = false) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function speckle(g, w, h, alpha, n = 900) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = `rgba(0,0,0,${Math.random() * alpha})`;
    g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }
}

const tex = {
  tile: (base, line, n) => canvasTexture(256, 256, (g, w) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, w);
    speckle(g, w, w, 0.035);
    g.strokeStyle = line;
    g.lineWidth = 5;
    const k = w / n;
    for (let i = 0; i <= n; i++) {
      g.beginPath();
      g.moveTo(i * k, 0);
      g.lineTo(i * k, w);
      g.moveTo(0, i * k);
      g.lineTo(w, i * k);
      g.stroke();
    }
  }, true),
  panel: (base, line) => canvasTexture(256, 256, (g, w) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, w);
    speckle(g, w, w, 0.025);
    g.fillStyle = line;
    g.fillRect(0, 0, 4, w);
    g.fillRect(w / 2, 0, 4, w);
  }, true),
  wood: (base, dark) => canvasTexture(256, 256, (g, w) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, w);
    for (let i = 0; i < 140; i++) {
      g.strokeStyle = `rgba(40,20,5,${Math.random() * 0.2})`;
      g.lineWidth = 1 + Math.random() * 2;
      const x = Math.random() * w;
      g.beginPath();
      g.moveTo(x, 0);
      g.bezierCurveTo(x + 6, w * 0.3, x - 6, w * 0.6, x + 3, w);
      g.stroke();
    }
    g.fillStyle = dark;
    for (let x = 0; x < w; x += 64) g.fillRect(x, 0, 5, w);
    for (let k = 0; k < 4; k++) {
      g.fillStyle = 'rgba(50,25,8,0.5)';
      g.beginPath();
      g.ellipse(Math.random() * w, Math.random() * w, 5, 10, 0, 0, Math.PI * 2);
      g.fill();
    }
  }, true),
  dirt: (base) => canvasTexture(256, 256, (g, w) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, w);
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = Math.random() < 0.5 ? `rgba(255,230,200,${Math.random() * 0.06})` : `rgba(0,0,0,${Math.random() * 0.16})`;
      const r = Math.random() * 3;
      g.fillRect(Math.random() * w, Math.random() * w, r, r);
    }
  }, true),
  sign: (text, bg, ink, serif) => canvasTexture(512, 128, (g, w, h) => {
    g.fillStyle = bg;
    g.beginPath();
    g.roundRect(4, 4, w - 8, h - 8, 18);
    g.fill();
    if (bg === '#ffffff') {
      g.strokeStyle = ink;
      g.lineWidth = 6;
      g.stroke();
    }
    g.fillStyle = ink;
    g.font = serif ? 'bold 76px "Nanum Brush Script", "Gungsuh", serif' : 'bold 60px -apple-system, "Apple SD Gothic Neo", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 4);
  }),
  plate: (n) => canvasTexture(128, 84, (g, w, h) => {
    g.fillStyle = 'rgba(20,24,28,0.75)';
    g.beginPath();
    g.roundRect(6, 6, w - 12, h - 12, 14);
    g.fill();
    g.fillStyle = '#fff';
    g.font = 'bold 50px -apple-system, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(n), w / 2, h / 2 + 3);
  }),
  doorway: (night) => canvasTexture(128, 256, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    if (night) {
      grad.addColorStop(0, '#050712');
      grad.addColorStop(1, '#1a2240');
    } else {
      grad.addColorStop(0, '#8fbad8');
      grad.addColorStop(0.6, '#d6e8f1');
      grad.addColorStop(1, '#f4f7f8');
    }
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    if (night) {
      for (let i = 0; i < 40; i++) {
        g.fillStyle = `rgba(255,255,255,${Math.random()})`;
        g.fillRect(Math.random() * w, Math.random() * h * 0.6, 1.5, 1.5);
      }
    }
  }),
};

// faces are drawn on a canvas and wrapped onto the front of the head
const faceCache = {};
function faceMaterial(kind) {
  if (faceCache[kind]) return faceCache[kind];
  const t = canvasTexture(256, 256, (g) => {
    // draw the features a bit bigger than the 256 grid they were laid out on
    g.translate(128, 136);
    g.scale(1.32, 1.32);
    g.translate(-128, -136);
    const ink = '#2a211c';
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const blush = (a = 0.45) => {
      g.fillStyle = `rgba(255,120,130,${a})`;
      g.beginPath();
      g.ellipse(74, 150, 18, 11, 0, 0, Math.PI * 2);
      g.ellipse(182, 150, 18, 11, 0, 0, Math.PI * 2);
      g.fill();
    };
    const dotEyes = (r = 11) => {
      g.fillStyle = ink;
      g.beginPath();
      g.arc(98, 120, r, 0, Math.PI * 2);
      g.arc(158, 120, r, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(101, 116, r * 0.32, 0, Math.PI * 2);
      g.arc(161, 116, r * 0.32, 0, Math.PI * 2);
      g.fill();
    };
    const sweat = (x, y) => {
      g.fillStyle = '#7cc6ff';
      g.beginPath();
      g.moveTo(x, y - 18);
      g.quadraticCurveTo(x + 12, y, x, y + 8);
      g.quadraticCurveTo(x - 12, y, x, y - 18);
      g.fill();
    };
    g.strokeStyle = ink;
    g.lineWidth = 8;
    if (kind === 'urgent') {
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(98, 118, 17, 0, Math.PI * 2);
      g.arc(158, 118, 17, 0, Math.PI * 2);
      g.fill();
      g.lineWidth = 5;
      g.stroke();
      g.fillStyle = ink;
      g.beginPath();
      g.arc(98, 120, 7, 0, Math.PI * 2);
      g.arc(158, 120, 7, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fff';
      g.beginPath();
      g.roundRect(92, 156, 72, 26, 10);
      g.fill();
      g.lineWidth = 5;
      g.stroke();
      g.beginPath();
      g.moveTo(92, 169);
      g.lineTo(164, 169);
      for (let x = 110; x < 164; x += 18) {
        g.moveTo(x, 157);
        g.lineTo(x, 181);
      }
      g.stroke();
      sweat(196, 92);
    } else if (kind === 'strain') {
      g.beginPath();
      g.moveTo(84, 108); g.lineTo(108, 120); g.lineTo(84, 132);
      g.moveTo(172, 108); g.lineTo(148, 120); g.lineTo(172, 132);
      g.stroke();
      g.lineWidth = 6;
      g.beginPath();
      g.moveTo(100, 172);
      for (let k = 0; k < 6; k++) g.lineTo(108 + k * 9, k % 2 ? 166 : 178);
      g.stroke();
      blush(0.7);
      sweat(198, 90);
      sweat(62, 100);
    } else if (kind === 'neutral') {
      dotEyes(10);
      g.lineWidth = 7;
      g.beginPath();
      g.moveTo(108, 168);
      g.lineTo(148, 168);
      g.stroke();
    } else if (kind === 'ok') {
      dotEyes(11);
      blush(0.4);
      g.lineWidth = 7;
      g.beginPath();
      g.arc(128, 150, 24, 0.2 * Math.PI, 0.8 * Math.PI);
      g.stroke();
    } else if (kind === 'bliss') {
      g.beginPath();
      g.arc(98, 126, 15, 1.1 * Math.PI, 1.9 * Math.PI);
      g.arc(158, 126, 15, 1.1 * Math.PI, 1.9 * Math.PI);
      g.stroke();
      blush(0.65);
      g.fillStyle = ink;
      g.beginPath();
      g.moveTo(98, 156);
      g.quadraticCurveTo(128, 204, 158, 156);
      g.closePath();
      g.fill();
      g.fillStyle = '#ff8a8a';
      g.beginPath();
      g.ellipse(128, 176, 13, 8, 0, 0, Math.PI * 2);
      g.fill();
    } else if (kind === 'relaxed') {
      g.beginPath();
      g.arc(98, 112, 15, 0.15 * Math.PI, 0.85 * Math.PI);
      g.arc(158, 112, 15, 0.15 * Math.PI, 0.85 * Math.PI);
      g.stroke();
      blush(0.5);
      g.lineWidth = 6;
      g.beginPath();
      g.arc(128, 152, 16, 0.25 * Math.PI, 0.75 * Math.PI);
      g.stroke();
    } else if (kind === 'dizzy') {
      g.lineWidth = 5;
      for (const cx of [98, 158]) {
        g.beginPath();
        for (let a = 0; a < Math.PI * 5; a += 0.2) g.lineTo(cx + Math.cos(a) * a * 1.2, 120 + Math.sin(a) * a * 1.2);
        g.stroke();
      }
      g.fillStyle = ink;
      g.beginPath();
      g.ellipse(128, 170, 14, 10, 0, 0, Math.PI * 2);
      g.fill();
    } else if (kind === 'shock') {
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(98, 118, 18, 0, Math.PI * 2);
      g.arc(158, 118, 18, 0, Math.PI * 2);
      g.fill();
      g.lineWidth = 5;
      g.stroke();
      g.fillStyle = ink;
      g.beginPath();
      g.arc(98, 118, 5, 0, Math.PI * 2);
      g.arc(158, 118, 5, 0, Math.PI * 2);
      g.ellipse(128, 168, 9, 12, 0, 0, Math.PI * 2);
      g.fill();
      blush(0.9);
      sweat(200, 90);
    } else {
      // idle
      dotEyes(10);
      g.lineWidth = 6;
      g.beginPath();
      g.moveTo(118, 168);
      g.lineTo(138, 168);
      g.stroke();
    }
  });
  faceCache[kind] = new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2 });
  return faceCache[kind];
}

// ---------- shared geometry ----------

function poopGeometry() {
  const curve = new THREE.SplineCurve([
    [0, 0], [0.118, 0.004], [0.13, 0.03], [0.1, 0.058], [0.104, 0.08], [0.088, 0.104],
    [0.068, 0.112], [0.07, 0.132], [0.05, 0.152], [0.03, 0.162], [0.026, 0.176], [0.01, 0.196], [0, 0.2],
  ].map(([r, h]) => new THREE.Vector2(r, h)));
  const g = new THREE.LatheGeometry(curve.getPoints(48), 32);
  g.computeVertexNormals();
  return g;
}

const G = {
  partition: new THREE.BoxGeometry(0.05, 1.36, 1.5),
  post: new THREE.BoxGeometry(0.07, 1.38, 0.07),
  rail: new THREE.BoxGeometry(STALL_M + 0.02, 0.05, 0.07),
  lock: new THREE.BoxGeometry(0.08, 0.05, 0.02),
  plate: new THREE.PlaneGeometry(0.2, 0.13),
  bowl: new THREE.CylinderGeometry(0.19, 0.13, 0.4, 24),
  seat: new THREE.TorusGeometry(0.165, 0.035, 10, 28),
  tank: new THREE.BoxGeometry(0.42, 0.36, 0.18),
  bench: new THREE.BoxGeometry(0.96, 0.42, 0.55),
  hole: new THREE.CircleGeometry(0.12, 20),
  shelf: new THREE.BoxGeometry(0.32, 0.03, 0.2),
  hit: new THREE.BoxGeometry(STALL_M, 1.6, 0.4),
  poop: poopGeometry(),
  head: new THREE.SphereGeometry(0.3, 32, 24),
  face: new THREE.SphereGeometry(0.303, 32, 24, Math.PI / 2 - 0.95, 1.9, Math.PI / 2 - 0.95, 1.9),
  hair: new THREE.SphereGeometry(0.315, 32, 16, 0, Math.PI * 2, 0, 1.05),
  body: new THREE.CapsuleGeometry(0.19, 0.16, 6, 16),
  arm: new THREE.CapsuleGeometry(0.055, 0.16, 4, 10),
  leg: new THREE.CapsuleGeometry(0.075, 0.16, 4, 10),
  halo: new THREE.TorusGeometry(0.17, 0.025, 8, 28),
  shoe: new THREE.BoxGeometry(0.1, 0.07, 0.16),
  shin: new THREE.CylinderGeometry(0.045, 0.045, 0.34, 10),
  pants: new THREE.BoxGeometry(0.36, 0.07, 0.12),
  blob: new THREE.CircleGeometry(0.3, 24),
};

const M = {
  porcelain: new THREE.MeshStandardMaterial({ color: '#fbfbfb', roughness: 0.15, metalness: 0.05 }),
  hole: new THREE.MeshBasicMaterial({ color: '#0b0705' }),
  poop: new THREE.MeshStandardMaterial({ color: '#7a4520', roughness: 0.38, metalness: 0.05 }),
  lockRed: new THREE.MeshStandardMaterial({ color: '#e5484d', emissive: '#e5484d', emissiveIntensity: 0.4 }),
  lockGreen: new THREE.MeshStandardMaterial({ color: '#46a758', emissive: '#46a758', emissiveIntensity: 0.4 }),
  skin: new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.6 }),
  dark: new THREE.MeshStandardMaterial({ color: '#33333d', roughness: 0.7 }),
  halo: new THREE.MeshStandardMaterial({ color: '#ffd84a', emissive: '#ffcc33', emissiveIntensity: 1.2 }),
  blob: new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.22, depthWrite: false }),
  hit: new THREE.MeshBasicMaterial({ visible: false }),
};
const colorMats = {};
const colorMat = (c) => (colorMats[c] ??= new THREE.MeshStandardMaterial({ color: c, roughness: 0.65 }));

let T = {}; // per-theme materials
let doorGeo = null;
let floorMesh = null;
let endWall = null;
let endPartition = null;
const bulbs = [];

function mesh(geo, mat, shadow = false) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadow;
  return m;
}

function disposeTree(root) {
  root.traverse((o) => {
    if (o.isMesh && o.userData.own) {
      o.geometry.dispose();
      o.material.map?.dispose();
      o.material.dispose();
    }
  });
  root.clear();
}

// ---------- environment (walls, floor, lights) ----------

function buildEnvironment() {
  disposeTree(envRoot);
  bulbs.length = 0;
  for (const m of Object.values(T)) {
    m.map?.dispose();
    m.dispose?.();
  }
  const th = THEMES[theme];
  document.body.dataset.theme = theme;

  scene.background = new THREE.Color(th.sky);
  scene.fog = new THREE.Fog(th.sky, th.fog[0], th.fog[1]);
  hemi.color.set(th.hemi[0]);
  hemi.groundColor.set(th.hemi[1]);
  hemi.intensity = th.hemi[2];
  sun.color.set(th.sun[0]);
  sun.intensity = th.sun[1];

  const doorMap = th.doorTex ? th.doorTex() : null;
  T = {
    door: new THREE.MeshStandardMaterial({ color: th.door, map: doorMap, roughness: th.night ? 0.9 : 0.45 }),
    partition: new THREE.MeshStandardMaterial({ color: th.partition, roughness: th.night ? 0.9 : 0.5 }),
    rail: new THREE.MeshStandardMaterial({ color: th.rail, roughness: 0.4, metalness: th.night ? 0 : 0.5 }),
    bench: new THREE.MeshStandardMaterial({ map: th.night ? tex.wood('#7a5030', '#4a2f17') : null, color: '#ffffff', roughness: 0.9 }),
  };
  doorGeo?.dispose();
  doorGeo = new THREE.BoxGeometry(DOOR_W, th.doorTop - th.gap, 0.045);

  const own = (m) => {
    m.userData.own = true;
    return m;
  };

  // floor
  const floorMap = th.floor();
  floorMap.repeat.set(140 / th.floorTile, 24 / th.floorTile);
  floorMesh = own(new THREE.Mesh(new THREE.PlaneGeometry(140, 24), new THREE.MeshStandardMaterial({ map: floorMap, roughness: th.night ? 1 : 0.35 })));
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.position.set(66, 0, 8);
  floorMesh.receiveShadow = true;
  floorMesh.userData.floor = true;

  // back wall behind the stalls
  const wallMap = th.wall();
  wallMap.repeat.set(140 / th.wallTile, 9 / th.wallTile);
  const backWall = own(new THREE.Mesh(new THREE.PlaneGeometry(140, 9), new THREE.MeshStandardMaterial({ map: wallMap, roughness: 0.6 })));
  backWall.position.set(66, 4.5, -1.55);
  envRoot.add(floorMesh, backWall);

  if (th.stripe) {
    const stripe = own(new THREE.Mesh(new THREE.PlaneGeometry(140, 0.16), new THREE.MeshStandardMaterial({ color: th.stripe, roughness: 0.5 })));
    stripe.position.set(66, 1.78, -1.545);
    envRoot.add(stripe);
  }

  // entrance wall with doorway + sign, and the left side wall
  const frontMap = th.wall();
  frontMap.repeat.set(6.2 / th.wallTile, 9 / th.wallTile);
  const front = own(new THREE.Mesh(new THREE.PlaneGeometry(6.2, 9), new THREE.MeshStandardMaterial({ map: frontMap, roughness: 0.6 })));
  front.position.set(-0.9, 4.5, 0);
  const doorway = own(new THREE.Mesh(new THREE.PlaneGeometry(1.15, 2.0), new THREE.MeshBasicMaterial({ map: tex.doorway(th.doorway === 'night'), fog: false })));
  doorway.position.set(1.05, 1.0, 0.01);
  const frameMat = T.partition;
  const frameL = mesh(new THREE.BoxGeometry(0.09, 2.08, 0.09), frameMat);
  frameL.position.set(0.44, 1.04, 0.03);
  const frameR = frameL.clone();
  frameR.position.x = 1.66;
  const frameT = mesh(new THREE.BoxGeometry(1.31, 0.09, 0.09), frameMat);
  frameT.position.set(1.05, 2.04, 0.03);
  const sign = own(new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.325), new THREE.MeshStandardMaterial({ map: tex.sign(th.sign, th.signBg, th.signInk, th.night), roughness: 0.5 })));
  sign.position.set(1.05, 2.42, 0.03);
  if (th.night) sign.rotation.z = -0.04;
  const sideMap = th.wall();
  sideMap.repeat.set(16 / th.wallTile, 9 / th.wallTile);
  const side = own(new THREE.Mesh(new THREE.PlaneGeometry(16, 9), new THREE.MeshStandardMaterial({ map: sideMap, roughness: 0.6 })));
  side.rotation.y = Math.PI / 2;
  side.position.set(0, 4.5, 7.9);
  envRoot.add(front, doorway, frameL, frameR, frameT, sign, side);

  // right end wall moves when stalls are added/removed
  const endMap = th.wall();
  endMap.repeat.set(18 / th.wallTile, 9 / th.wallTile);
  endWall = own(new THREE.Mesh(new THREE.PlaneGeometry(18, 9), new THREE.MeshStandardMaterial({ map: endMap, roughness: 0.6 })));
  endWall.rotation.y = -Math.PI / 2;
  envRoot.add(endWall);

  endPartition = mesh(G.partition, T.partition);
  envRoot.add(endPartition);

  // light fixtures
  const fixtureMat = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: th.night ? '#ffbf66' : '#ffffff', emissiveIntensity: th.night ? 2.5 : 1.6 });
  fixtureMat.userData = {};
  if (th.fixtures === 'tube') {
    const tubeGeo = new THREE.BoxGeometry(1.0, 0.05, 0.12);
    for (let k = 0; k < 32; k++) {
      const tube = mesh(tubeGeo, fixtureMat);
      tube.position.set(1.1 + k * 2.2, 3.3, -1.35);
      envRoot.add(tube);
    }
  } else {
    const bulbGeo = new THREE.SphereGeometry(0.07, 16, 12);
    const cordGeo = new THREE.CylinderGeometry(0.008, 0.008, 1.2, 6);
    const cordMat = new THREE.MeshBasicMaterial({ color: '#111' });
    for (let k = 0; k < 16; k++) {
      const x = 2.75 + k * 4.4;
      const bulb = mesh(bulbGeo, fixtureMat);
      bulb.position.set(x, 2.45, 0.7);
      const cord = mesh(cordGeo, cordMat);
      cord.position.set(x, 3.05, 0.7);
      envRoot.add(bulb, cord);
      bulbs.push(bulb.position);
    }
  }
  bulbLights.forEach((l) => (l.intensity = th.night ? 7 : 0));
}

function updateWorldEdges() {
  const ww = toX(worldW());
  if (endWall) endWall.position.set(ww, 4.5, 7.4);
  if (endPartition) endPartition.position.set(toX(ENTRANCE_W + stalls.length * STALL_W) - 0.025, 0.12 + 0.68, -0.78);
}

// ---------- stalls ----------

const stallObjs = [];
const stallHits = [];
const plateMats = {};
let builtOnce = false;

function plateMaterial(i) {
  return (plateMats[i] ??= new THREE.MeshBasicMaterial({ map: tex.plate(i + 1), transparent: true }));
}

function makeStall(i) {
  const th = THEMES[theme];
  const g = new THREE.Group();
  g.position.set(toX(ENTRANCE_W + i * STALL_W), 0, 0);

  const part = mesh(G.partition, T.partition);
  part.position.set(0.025, 0.12 + 0.68, -0.78);
  const post = mesh(G.post, T.rail);
  post.position.set(0.035, 0.12 + 0.69, 0);
  const rail = mesh(G.rail, T.rail);
  rail.position.set(STALL_M / 2, 1.5, 0);

  const hinge = new THREE.Group();
  hinge.position.set(0.075, 0, 0);
  const doorH = th.doorTop - th.gap;
  const door = mesh(doorGeo, T.door);
  door.position.set(DOOR_W / 2, th.gap + doorH / 2, 0);
  const plate = new THREE.Mesh(G.plate, plateMaterial(i));
  plate.position.set(DOOR_W / 2, th.doorTop - 0.16, 0.025);
  const lock = mesh(G.lock, M.lockGreen);
  lock.position.set(DOOR_W - 0.11, th.gap + doorH * 0.55, 0.03);
  hinge.add(door, plate, lock);

  // the toilet
  const toilet = new THREE.Group();
  toilet.position.set(STALL_M / 2 + 0.02, 0, -0.98);
  if (th.night) {
    const bench = mesh(G.bench, T.bench);
    bench.position.set(0, 0.21, -0.2);
    const hole = new THREE.Mesh(G.hole, M.hole);
    hole.rotation.x = -Math.PI / 2;
    hole.position.set(0, 0.422, -0.15);
    toilet.add(bench, hole);
  } else {
    const bowl = mesh(G.bowl, M.porcelain);
    bowl.position.y = 0.2;
    const seat = mesh(G.seat, M.porcelain);
    seat.rotation.x = -Math.PI / 2;
    seat.position.y = 0.41;
    const tank = mesh(G.tank, M.porcelain);
    tank.position.set(0, 0.62, -0.42);
    toilet.add(bowl, seat, tank);
  }

  // poop tower sits on a little shelf on top of the door rail
  const shelf = mesh(G.shelf, T.rail);
  shelf.position.set(0.84, 1.54, 0);
  const pile = new THREE.Group();
  pile.position.set(0.84, 1.555, 0);

  const hit = new THREE.Mesh(G.hit, M.hit);
  hit.position.set(STALL_M / 2, 0.8, 0.1);
  hit.userData.stall = i;

  g.add(part, post, rail, hinge, toilet, shelf, pile, hit);
  stallRoot.add(g);
  stallHits[i] = hit;
  return { i, group: g, hinge, lock, pile, pileCount: 0, pending: 0, open: 1, born: builtOnce ? performance.now() : 0, shake: 0, squash: null };
}

// deterministic wobble so every client sees the same tower
const jit = (i, k, salt) => {
  const s = Math.sin(i * 127.1 + k * 311.7 + salt * 74.7) * 43758.5453;
  return s - Math.floor(s) - 0.5;
};

function poopSlot(s, k) {
  const lean = (k / PILE_MAX) * 0.06;
  return new THREE.Vector3(jit(s.i, k, 1) * 0.05 + lean * k * 0.3, k * POOP_STEP, jit(s.i, k, 2) * 0.04);
}

function rebuildPile(s, count) {
  const want = Math.min(count, PILE_MAX);
  while (s.pile.children.length > want) s.pile.remove(s.pile.children.at(-1));
  while (s.pile.children.length < want) {
    const k = s.pile.children.length;
    const p = mesh(G.poop, M.poop, true);
    p.position.copy(poopSlot(s, k));
    p.rotation.set(jit(s.i, k, 3) * 0.25, jit(s.i, k, 4) * 6, jit(s.i, k, 5) * 0.25);
    const sc = 1 - k * 0.025;
    p.scale.setScalar(sc);
    s.pile.add(p);
  }
  s.pileCount = count;
}

function syncStalls() {
  while (stallObjs.length < stalls.length) stallObjs.push(makeStall(stallObjs.length));
  while (stallObjs.length > stalls.length) {
    const s = stallObjs.pop();
    stallRoot.remove(s.group);
    stallHits.length = stallObjs.length;
  }
  stallObjs.forEach((s, i) => {
    s.lock.material = stalls[i] ? M.lockRed : M.lockGreen;
    if (!s.pending && piles[i] !== s.pileCount) rebuildPile(s, piles[i]);
  });
  builtOnce = true;
  updateWorldEdges();
}

// ---------- characters ----------

function makeCharacter(u) {
  const group = new THREE.Group();
  const spin = new THREE.Group(); // pivot at belly height so rolling looks like rolling
  spin.position.y = 0.6;
  const inner = new THREE.Group();
  inner.position.y = -0.6;
  spin.add(inner);
  group.add(spin);
  const cloth = colorMat(u.c);

  const legs = [-0.085, 0.085].map((x) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.34, 0);
    const leg = mesh(G.leg, M.dark, true);
    leg.position.y = -0.15;
    pivot.add(leg);
    pivot.userData.mesh = leg;
    inner.add(pivot);
    return pivot;
  });
  const body = mesh(G.body, cloth, true);
  body.position.y = 0.58;
  const arms = [-0.22, 0.22].map((x) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.7, 0);
    const arm = mesh(G.arm, cloth, true);
    arm.position.y = -0.12;
    pivot.rotation.z = x < 0 ? -0.18 : 0.18;
    pivot.add(arm);
    inner.add(pivot);
    return pivot;
  });
  const headPivot = new THREE.Group();
  headPivot.position.y = 1.02;
  const head = mesh(G.head, M.skin, true);
  const face = new THREE.Mesh(G.face, faceMaterial('idle'));
  const hair = mesh(G.hair, colorMat(HAIR[u.id % HAIR.length]), true);
  hair.rotation.x = -0.35;
  const halo = mesh(G.halo, M.halo);
  halo.rotation.x = Math.PI / 2;
  halo.position.y = 0.42;
  halo.visible = false;
  headPivot.add(head, face, hair, halo);
  inner.add(body, headPivot);

  // pants stuck around the ankles after getting kicked out
  const ankle = mesh(G.pants, cloth);
  ankle.position.set(0, 0.1, 0);
  ankle.visible = false;
  inner.add(ankle);

  // feet + pants around the ankles, shown under the door while sitting
  const sit = new THREE.Group();
  sit.position.set(0, -SIT_Y, 0.6);
  for (const x of [-0.09, 0.09]) {
    const shoe = mesh(G.shoe, M.dark);
    shoe.position.set(x, 0.035, 0.02);
    const shin = mesh(G.shin, M.skin);
    shin.position.set(x, 0.24, 0);
    sit.add(shoe, shin);
  }
  const pants = mesh(G.pants, cloth);
  pants.position.set(0, 0.11, 0);
  sit.add(pants);
  sit.visible = false;
  group.add(sit);

  const blob = new THREE.Mesh(G.blob, M.blob);
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.01;
  group.add(blob);

  charRoot.add(group);
  return { group, spin, inner, legs, arms, headPivot, face, halo, sit, blob, ankle, faceKind: 'idle' };
}

function makeTag() {
  const el = document.createElement('div');
  el.className = 'tag';
  $('#labels').append(el);
  return el;
}

function exprOf(u) {
  if ((happyUntil.get(u.id) || 0) > Date.now()) return 'bliss';
  if (u.r) return 'dizzy';
  if (u.s === -1 && u.pd) return 'shock';
  if (u.s === -1) return u.n ? 'relaxed' : 'urgent';
  if (u.p === 0) return u.h ? 'strain' : 'idle';
  if (u.p < 34) return 'strain';
  if (u.p < 67) return 'neutral';
  return 'ok';
}

// ---------- connection ----------

function connect() {
  const q = new URLSearchParams();
  if (params.get('room')) q.set('room', params.get('room'));
  const savedName = store.get('ddongta:name');
  if (savedName) q.set('name', savedName);
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws?${q}`);
  ws.onmessage = (e) => handle(JSON.parse(e.data));
  ws.onclose = () => {
    setHold(false);
    $('#roomName').textContent = '다시 연결 중...';
    setTimeout(connect, 1500);
  };
}

function send(msg) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
}

function handle(m) {
  if (m.t === 'welcome') {
    meId = m.you;
    room = m;
    store.set('ddongta:name', m.name);
    params.set('room', m.room);
    history.replaceState(null, '', `?room=${m.room}`);
    $('#roomName').textContent = `${m.label} ${m.no}호점`;
    for (const e of users.values()) removeUser(e);
    users.clear();
    for (const s of stallObjs) stallRoot.remove(s.group);
    stallObjs.length = 0;
    stallHits.length = 0;
    builtOnce = false;
    if (m.theme !== theme || !floorMesh) {
      theme = m.theme;
      buildEnvironment();
    }
    me.ready = false;
    me.s = -1;
    if (m.notice) toast(m.notice);
  } else if (m.t === 'state') {
    applyState(m);
    $('#loading').classList.add('done');
  } else if (m.t === 'chat') {
    floatChat(m.id, m.text);
  } else if (m.t === 'toast') {
    toast(m.text);
  } else if (m.t === 'poop') {
    onPoop(m);
  } else if (m.t === 'knock') {
    onKnock(m);
  } else if (m.t === 'break') {
    onBreak(m);
  } else if (m.t === 'turn') {
    toast(`🔔 내 차례! ${m.stall + 1}번 칸으로 갑니다`);
    walkToStall(m.stall);
    playDing();
  } else if (m.t === 'bell') {
    onBell(m);
  } else if (m.t === 'full') {
    toast('모든 화장실이 꽉 찼어요. 잠시 후 다시 시도해 주세요.');
  }
}

function removeUser(e) {
  charRoot.remove(e.model.group);
  e.tag.remove();
}

function applyState(st) {
  $('#online').textContent = `👥 ${st.users.length}`;
  $('#flushed').textContent = `💩 ${st.flushed.toLocaleString('ko-KR')}`;
  stalls = st.stalls;
  piles = st.piles;
  hp = st.hp;
  held = st.held;

  const seen = new Set();
  for (const u of st.users) {
    seen.add(u.id);
    let e = users.get(u.id);
    if (!e) {
      e = { data: u, model: makeCharacter(u), tag: makeTag(), rx: u.x, ry: u.y, yaw: 0, phase: 0, idle: 0 };
      users.set(u.id, e);
    }
    e.data = u;
    if (u.id === meId) {
      if (!me.ready || (me.s !== -1 && u.s === -1)) {
        me.x = u.x;
        me.y = u.y;
        me.ready = true;
        target = null;
        e.rx = u.x;
        e.ry = u.y;
      }
      if (me.s === -1 && u.s !== -1) setHold(false);
      me.s = u.s;
      me.rolling = Boolean(u.r);
      me.pd = Boolean(u.pd);
      me.q = u.q;
      if (u.r) {
        // the server drives us while we roll
        me.x = u.x;
        me.y = u.y;
        target = null;
        pendingEnter = -1;
      }
      const qEl = $('#queue');
      qEl.hidden = !u.q;
      if (u.q) qEl.textContent = u.q === 1 ? '🚶 대기 1번 · 곧 내 차례!' : `🚶 대기 ${u.q}번째`;
    }
    const mine = u.id === meId;
    e.tag.classList.toggle('me', mine);
    e.tag.textContent = `${mine ? '나 · ' : ''}${u.name}${u.n ? ` · 💩${u.n}` : ''}${u.q ? ` · 대기${u.q}` : ''}`;
  }
  for (const [id, e] of users) {
    if (!seen.has(id)) {
      removeUser(e);
      users.delete(id);
    }
  }
  syncStalls();
  renderActions();
}

// ---------- movement ----------

const freeFor = (i) => !stalls[i] && (!held[i] || held[i] === meId);

function nearestStall(x, y, ok, range = ENTER_X) {
  if (y > ENTER_Y) return -1;
  let best = -1;
  let bestD = Infinity;
  stalls.forEach((id, i) => {
    const d = Math.abs(stallCenter(i) - x);
    if (ok(i) && d <= range && d < bestD) {
      best = i;
      bestD = d;
    }
  });
  return best;
}

const nearestEmptyStall = (x, y, range) => nearestStall(x, y, freeFor, range);
const nearestOccupiedStall = (x, y) => nearestStall(x, y, (i) => stalls[i] && stalls[i] !== meId);

function closestAnywhere(ok) {
  let best = -1;
  let bestD = Infinity;
  stalls.forEach((id, i) => {
    const d = Math.abs(stallCenter(i) - me.x);
    if (ok(i) && d < bestD) {
      best = i;
      bestD = d;
    }
  });
  return best;
}

function walkToStall(i) {
  target = { x: stallCenter(i), y: 6 };
  pendingEnter = i;
}

function tryEnter(i) {
  if (i < 0 || stalls[i]) return;
  sendMove(true);
  send({ t: 'enter', stall: i });
}

function tryKnock(i) {
  if (i < 0) return;
  sendMove(true);
  send({ t: 'knock', stall: i });
}

function ringBell() {
  send({ t: 'bell' });
}

function exitStall() {
  setHold(false);
  send({ t: 'exit' });
}

function moveMe(dt) {
  if (me.rolling) return;
  let vx = 0;
  let vy = 0;
  if (keys.has('ArrowLeft') || keys.has('KeyA')) vx -= 1;
  if (keys.has('ArrowRight') || keys.has('KeyD')) vx += 1;
  if (keys.has('ArrowUp') || keys.has('KeyW')) vy -= 1;
  if (keys.has('ArrowDown') || keys.has('KeyS')) vy += 1;

  let step = SPEED * (me.pd ? 0.45 : 1) * dt;
  if (vx || vy) {
    target = null;
    pendingEnter = -1;
  } else if (target) {
    const dx = target.x - me.x;
    const dy = target.y - me.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 2) {
      target = null;
      if (pendingEnter >= 0) tryEnter(pendingEnter);
      pendingEnter = -1;
    } else {
      vx = dx / dist;
      vy = dy / dist;
      step = Math.min(step, dist);
    }
  }

  if (vx || vy) {
    const len = Math.hypot(vx, vy);
    me.x = clamp(me.x + (vx / len) * step, 20, worldW() - 40);
    me.y = clamp(me.y + (vy / len) * step, 0, FLOOR_H);
    if (vx) me.d = vx < 0 ? -1 : 1;
  }

  // walking "up" into the door of an empty stall goes inside
  if ((keys.has('ArrowUp') || keys.has('KeyW')) && me.y <= 0) {
    const i = nearestEmptyStall(me.x, me.y, 40);
    if (i >= 0) {
      keys.delete('ArrowUp');
      keys.delete('KeyW');
      tryEnter(i);
    }
  }
  sendMove(false);
}

function sendMove(force) {
  const now = performance.now();
  const changed = Math.abs(me.x - lastSent.x) > 0.5 || Math.abs(me.y - lastSent.y) > 0.5 || me.d !== lastSent.d;
  if (!changed || (!force && now - lastSent.t < 80)) return;
  send({ t: 'move', x: Math.round(me.x), y: Math.round(me.y), d: me.d });
  lastSent = { x: me.x, y: me.y, d: me.d, t: now };
}

// ---------- poop towers ----------

const flights = [];

function onPoop(m) {
  happyUntil.set(m.id, Date.now() + 1600);
  const s = stallObjs[m.stall];
  if (s) {
    s.shake = 0.35;
    s.pending++;
    const k = Math.min(m.pile, PILE_MAX) - 1;
    const from = new THREE.Vector3(s.group.position.x + STALL_M / 2, 0.6, -0.95);
    const to = poopSlot(s, k).add(s.pile.position).add(s.group.position);
    const p = mesh(G.poop, M.poop, true);
    p.position.copy(from);
    fxRoot.add(p);
    flights.push({ p, from, to, t: 0, s, count: m.pile });
    pop(to.clone().add(new THREE.Vector3(0, 0.35, 0)), m.id === meId ? `퐁당! 💩×${m.n}` : '퐁당!');
  }
  if (m.id === meId) toast(`퐁당! 오늘 ${m.n}번째 💩`);
  plop(m.id === meId ? 0.35 : 0.05);
}

function updateFlights(dt) {
  for (let i = flights.length - 1; i >= 0; i--) {
    const f = flights[i];
    f.t += dt / 0.75;
    const t = Math.min(1, f.t);
    f.p.position.lerpVectors(f.from, f.to, t);
    f.p.position.y += Math.sin(t * Math.PI) * 1.1;
    f.p.rotation.y += dt * 14;
    f.p.rotation.x = Math.sin(t * 9) * 0.4;
    if (t >= 1) {
      fxRoot.remove(f.p);
      f.s.pending--;
      rebuildPile(f.s, Math.max(f.count, piles[f.s.i] || 0));
      f.s.squash = 0;
      flights.splice(i, 1);
    }
  }
}

// ---------- render loop ----------

const tmp = new THREE.Vector3();
let lastFrame = performance.now();

function frame(t) {
  const dt = Math.min(0.05, (t - lastFrame) / 1000);
  lastFrame = t;
  if (me.ready && me.s === -1) moveMe(dt);

  for (const [id, e] of users) placeUser(id, e, dt);
  animateStalls(dt, t);
  updateFlights(dt);
  updateDebris(dt);
  updateCamera(dt);
  updateLabels(dt);
  renderActions();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

function placeUser(id, e, dt) {
  const u = e.data;
  const mdl = e.model;
  const mine = id === meId;
  const seat = mine ? me.s : u.s;
  const px = e.rx;
  const py = e.ry;
  if (mine) {
    e.rx = me.x;
    e.ry = me.y;
  } else {
    const k = Math.min(1, dt * 10);
    e.rx = lerp(e.rx, u.x, k);
    e.ry = lerp(e.ry, u.y, k);
  }

  const kind = exprOf({ ...u, s: seat });
  if (kind !== mdl.faceKind) {
    mdl.face.material = faceMaterial(kind);
    mdl.faceKind = kind;
  }
  mdl.halo.visible = kind === 'bliss';
  if (mdl.halo.visible) mdl.halo.rotation.z += dt * 2;

  if (seat !== -1 && stallObjs[seat]) {
    // sitting on the toilet: head peeks over the door, feet show under it
    const sx = toX(ENTRANCE_W + seat * STALL_W) + STALL_M / 2 + 0.02;
    mdl.group.position.set(sx, SIT_Y, -0.72);
    mdl.inner.rotation.y = 0;
    mdl.legs.forEach((l) => (l.rotation.x = -1.45));
    mdl.arms.forEach((a) => (a.rotation.x = -0.6));
    mdl.sit.visible = true;
    mdl.blob.visible = false;
    const shake = u.h ? 0.02 : 0;
    mdl.headPivot.position.set((Math.random() - 0.5) * shake, 1.02 + (Math.random() - 0.5) * shake, 0);
    mdl.inner.position.y = -0.6;
    mdl.spin.rotation.z = 0;
    mdl.ankle.visible = false;
    mdl.legs.forEach((l) => (l.userData.mesh.material = M.dark));
    return;
  }

  // kicked out: roll across the floor, then shuffle with pants down
  const rolling = mine ? me.rolling : Boolean(u.r);
  const pantsDown = Boolean(u.pd) && !rolling;
  if (rolling) mdl.spin.rotation.z -= dt * 13 * (u.x >= e.rx ? 1 : -1);
  else mdl.spin.rotation.z = lerpAngle(mdl.spin.rotation.z, 0, Math.min(1, dt * 10));
  mdl.ankle.visible = pantsDown || rolling;
  mdl.legs.forEach((l) => (l.userData.mesh.material = pantsDown || rolling ? M.skin : M.dark));

  mdl.sit.visible = false;
  mdl.blob.visible = true;
  mdl.headPivot.position.set(0, 1.02, 0);
  mdl.group.position.set(toX(e.rx), 0, toZ(e.ry));

  const dx = e.rx - px;
  const dz = e.ry - py;
  const walking = Math.hypot(dx, dz) > 0.25;
  if (walking) {
    e.idle = 0;
    e.yaw = lerpAngle(e.yaw, Math.atan2(dx, dz), Math.min(1, dt * 12));
    e.phase += dt * 13;
  } else {
    e.idle += dt;
    if (e.idle > 0.6) e.yaw = lerpAngle(e.yaw, 0, Math.min(1, dt * 5));
    e.phase = lerp(e.phase, Math.round(e.phase / Math.PI) * Math.PI, Math.min(1, dt * 10));
  }
  mdl.inner.rotation.y = e.yaw;
  const swing = Math.sin(e.phase) * 0.7;
  mdl.legs[0].rotation.x = swing;
  mdl.legs[1].rotation.x = -swing;
  mdl.arms[0].rotation.x = -swing * 0.8;
  mdl.arms[1].rotation.x = swing * 0.8;
  mdl.inner.position.y = -0.6 + Math.abs(Math.sin(e.phase)) * (pantsDown ? 0.02 : 0.05);
  if (pantsDown) {
    // tiny shuffling steps
    mdl.legs[0].rotation.x *= 0.3;
    mdl.legs[1].rotation.x *= 0.3;
    mdl.arms.forEach((a) => (a.rotation.x = 0.9));
  }
}

function lerpAngle(a, b, k) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

function animateStalls(dt, now) {
  stallObjs.forEach((s, i) => {
    const want = stalls[i] ? 0 : 1;
    s.open = lerp(s.open, want, Math.min(1, dt * 7));
    let rot = s.open * 1.25;
    if (s.shake > 0) {
      s.shake -= dt;
      rot += Math.sin(s.shake * 70) * 0.04;
    }
    s.hinge.rotation.y = rot;
    if (s.gone > 0) {
      s.gone -= dt;
      s.hinge.visible = false;
      if (s.gone <= 0) {
        s.hinge.visible = true;
        s.regrow = 0;
      }
    }
    if (s.regrow !== null && s.regrow !== undefined) {
      s.regrow = Math.min(1, s.regrow + dt / 0.4);
      s.hinge.scale.set(1, Math.max(0.01, s.regrow), 1);
      if (s.regrow >= 1) s.regrow = null;
    }
    if (s.born) {
      const k = Math.min(1, (now - s.born) / 650);
      const e = 1 - Math.pow(1 - k, 3) * Math.cos(k * 9);
      s.group.scale.set(1, Math.max(0.01, e), 1);
      if (k >= 1) s.born = 0;
    }
    if (s.squash !== null && s.pile.children.length) {
      s.squash += dt / 0.35;
      const k = Math.min(1, s.squash);
      const top = s.pile.children.at(-1);
      const base = 1 - (s.pile.children.length - 1) * 0.025;
      top.scale.set(base * (1 + 0.25 * Math.sin(k * Math.PI) * (1 - k)), base * (1 - 0.35 * Math.sin(k * Math.PI) * (1 - k)), base);
      s.pile.rotation.z = Math.sin(k * 14) * 0.05 * (1 - k);
      if (k >= 1) s.squash = null;
    }
  });
}

function updateCamera(dt) {
  const aspect = W / H;
  const dist = clamp(6 / (0.728 * aspect), 7.6, 11);
  const half = 0.364 * dist * aspect;
  const ww = toX(worldW());
  const want = ww < 2 * half - 1 ? ww / 2 : clamp(toX(me.x), half - 0.8, ww - half + 0.8);
  camX = lerp(camX, want, Math.min(1, dt * 6));
  camera.position.set(camX, 2.3 + dist * 0.13, 1.5 + dist);
  if (shakeT > 0) {
    shakeT -= dt;
    camera.position.x += (Math.random() - 0.5) * 0.12;
    camera.position.y += (Math.random() - 0.5) * 0.08;
  }
  camera.lookAt(camX, 0.95, 0.4);
  sun.position.set(camX + 3, 7, 6);
  sun.target.position.set(camX, 0, 0.5);
  if (bulbs.length) {
    const near = [...bulbs].sort((a, b) => Math.abs(a.x - camX) - Math.abs(b.x - camX));
    bulbLights.forEach((l, k) => {
      l.position.copy(near[k] || near[0]);
      l.intensity = 14 + Math.sin(performance.now() / 90 + k * 3) * 0.8 * (Math.random() < 0.03 ? 6 : 1);
    });
  }
}

// ---------- labels (name tags, floating chat, pops) ----------

const floats = [];

function screenOf(v) {
  tmp.copy(v).project(camera);
  return { x: (tmp.x + 1) / 2 * W, y: (1 - tmp.y) / 2 * H, on: tmp.z < 1 && Math.abs(tmp.x) < 1.3 && Math.abs(tmp.y) < 1.3 };
}

function headAnchor(e) {
  const g = e.model.group.position;
  return new THREE.Vector3(g.x, g.y + 1.46, g.z);
}

function updateStallLabel(s, i) {
  let html = '';
  let cls = 'slabel';
  if (stalls[i] && hp[i] < 100) {
    const v = hp[i];
    cls += v < 35 ? ' danger' : '';
    html = `<span>${v < 35 ? '💢 문이 부서지기 직전!' : '🚪 문 체력'}</span><i style="--v:${v}%"></i>`;
  } else if (!stalls[i] && held[i]) {
    cls += held[i] === meId ? ' mine' : '';
    html = held[i] === meId ? '🔔 내 자리! 어서 들어가세요' : '🔔 대기 1번 손님 자리';
  }
  if (!html) {
    if (s.label) s.label.style.display = 'none';
    return;
  }
  if (!s.label) {
    s.label = document.createElement('div');
    $('#labels').append(s.label);
  }
  if (s.label.dataset.html !== html) {
    s.label.innerHTML = html;
    s.label.dataset.html = html;
  }
  s.label.className = cls;
  const p = screenOf(tmp2.set(s.group.position.x + STALL_M / 2, stalls[i] ? 2.25 : 1.0, 0.1));
  s.label.style.display = p.on ? '' : 'none';
  s.label.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`;
}
const tmp2 = new THREE.Vector3();

function updateLabels(dt) {
  stallObjs.forEach(updateStallLabel);
  for (const e of users.values()) {
    const p = screenOf(headAnchor(e));
    e.tag.style.display = p.on ? '' : 'none';
    e.tag.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`;
  }
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i];
    f.age += dt;
    const life = f.life;
    const pos = f.anchor.clone();
    pos.y += f.rise * Math.min(1, f.age / life);
    pos.x += f.sway * (f.age / life);
    const p = screenOf(pos);
    const fadeIn = Math.min(1, f.age / 0.25);
    const fadeOut = Math.min(1, (life - f.age) / 1.2);
    f.el.style.opacity = String(Math.max(0, Math.min(fadeIn, fadeOut)));
    f.el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%) scale(${0.9 + 0.1 * fadeIn})`;
    f.el.style.display = p.on ? '' : 'none';
    if (f.age >= life) {
      f.el.remove();
      floats.splice(i, 1);
    }
  }
}

function floatChat(id, text) {
  const e = users.get(id);
  if (!e) return;
  // older bubbles from the same person get pushed up
  for (const f of floats) if (f.id === id) f.anchor.y += 0.34;
  const el = document.createElement('div');
  el.className = id === meId ? 'float mine' : 'float';
  const name = document.createElement('b');
  name.textContent = e.data.name;
  el.append(name, document.createTextNode(text));
  $('#labels').append(el);
  floats.push({ id, el, anchor: headAnchor(e).add(new THREE.Vector3(0, 0.28, 0)), age: 0, life: 7, rise: 0.9, sway: (Math.random() - 0.5) * 0.5 });
  // background tabs don't animate, so don't let bubbles pile up there
  while (floats.length > 40) floats.shift().el.remove();
}

function pop(at, text) {
  if (document.hidden) return;
  const el = document.createElement('div');
  el.className = 'pop';
  el.textContent = text;
  $('#labels').append(el);
  floats.push({ id: -1, el, anchor: at, age: 0, life: 1.4, rise: 0.45, sway: 0 });
}

// ---------- action bar ----------

let actionMode = '';
function renderActions() {
  const inStall = me.s !== -1;
  const near = !inStall && nearestEmptyStall(me.x, me.y) >= 0;
  const nearOcc = !inStall && nearestOccupiedStall(me.x, me.y) >= 0;
  const anyFree = stalls.some((_, i) => freeFor(i));
  const mode = inStall ? 'inside' : me.rolling ? 'rolling' : near ? 'near' : nearOcc ? 'knock' : anyFree ? 'far' : 'full';
  if (mode === actionMode) return;
  actionMode = mode;
  const bar = $('#actions');
  bar.innerHTML = '';
  if (mode === 'inside') {
    bar.append(actionBtn('💩', '꾹 누르기', null, 'push'), actionBtn('🐦', '에티켓벨', ringBell), actionBtn('🚪', '나오기', exitStall), actionBtn('💬', '채팅', openChat));
    const push = bar.querySelector('.push');
    push.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      push.setPointerCapture(e.pointerId);
      setHold(true);
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) => push.addEventListener(ev, () => setHold(false)));
  } else if (mode === 'near') {
    bar.append(actionBtn('🚪', '들어가기', () => tryEnter(nearestEmptyStall(me.x, me.y))), actionBtn('💬', '채팅', openChat));
  } else if (mode === 'knock') {
    bar.append(actionBtn('✊', '노크 (연타!)', () => tryKnock(nearestOccupiedStall(me.x, me.y)), 'knock'), actionBtn('💬', '채팅', openChat));
  } else if (mode === 'rolling') {
    const b = actionBtn('🌀', '데굴데굴...', null);
    b.disabled = true;
    bar.append(b);
  } else if (mode === 'full') {
    bar.append(
      actionBtn('👊', '칸 털러 가기', () => {
        const i = closestAnywhere((k) => stalls[k] && stalls[k] !== meId);
        if (i >= 0) {
          target = { x: stallCenter(i), y: 6 };
          pendingEnter = -1;
        }
      }),
      actionBtn('💬', '채팅', openChat),
    );
  } else {
    bar.append(
      actionBtn('🚽', '빈 칸 찾기', () => {
        const i = closestAnywhere(freeFor);
        if (i >= 0) walkToStall(i);
      }),
      actionBtn('💬', '채팅', openChat),
    );
  }
}

function actionBtn(icon, label, onClick, cls = '') {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `act ${cls}`;
  b.innerHTML = `<span class="ico">${icon}</span><span>${label}</span>`;
  if (onClick) b.addEventListener('click', onClick);
  b.addEventListener('contextmenu', (e) => e.preventDefault());
  return b;
}

function setHold(on) {
  if (holding === on) return;
  holding = on;
  document.querySelector('.act.push')?.classList.toggle('on', on);
  send({ t: 'hold', on });
}

// ---------- chat input ----------

const chatBox = $('#chatBox');
const chatInput = $('#chatInput');

function openChat() {
  chatBox.hidden = false;
  chatInput.focus();
}

function closeChat() {
  chatBox.hidden = true;
  chatInput.blur();
}

chatBox.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (text) send({ t: 'chat', text });
  chatInput.value = '';
  closeChat();
});
chatInput.addEventListener('blur', () => setTimeout(() => !chatInput.value && (chatBox.hidden = true), 100));

// ---------- toasts & sound ----------

function toast(text) {
  const box = $('#toasts');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  box.append(el);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => el.classList.add('out'), 3000);
  setTimeout(() => el.remove(), 3500);
}

// ---------- door fights ----------

const debris = [];
const chipGeo = new THREE.BoxGeometry(0.08, 0.05, 0.03);
const lastKnockPop = new Map();
const distVol = (i) => clamp(1 - Math.abs(stallCenter(i) - me.x) / 1600, 0.08, 1);

function onKnock(m) {
  const s = stallObjs[m.stall];
  if (!s) return;
  s.shake = 0.25;
  const now = performance.now();
  if (now - (lastKnockPop.get(m.stall) || 0) > 450) {
    lastKnockPop.set(m.stall, now);
    const at = new THREE.Vector3(s.group.position.x + STALL_M / 2 + (Math.random() - 0.5) * 0.4, 1.3 + Math.random() * 0.2, 0.15);
    pop(at, m.hp < 35 ? '쾅쾅!!' : '똑똑');
  }
  const victimIsMe = stalls[m.stall] === meId;
  if (victimIsMe) shakeT = Math.max(shakeT, 0.18);
  playKnock(victimIsMe ? 0.5 : m.by === meId ? 0.35 : distVol(m.stall) * 0.25);
}

function onBreak(m) {
  const s = stallObjs[m.stall];
  if (s) {
    const th = THEMES[theme];
    const doorH = th.doorTop - th.gap;
    // the old door flies off toward the camera
    const door = mesh(doorGeo, T.door, true);
    door.position.set(s.group.position.x + 0.075 + DOOR_W / 2, th.gap + doorH / 2, 0.05);
    fxRoot.add(door);
    debris.push({
      o: door, door: true, life: 3.5,
      v: new THREE.Vector3((Math.random() - 0.5) * 2, 3.2, 3.6),
      w: new THREE.Vector3(-4 - Math.random() * 3, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 6),
    });
    for (let k = 0; k < 14; k++) {
      const chip = mesh(chipGeo, T.door);
      chip.position.set(door.position.x + (Math.random() - 0.5) * 0.9, th.gap + Math.random() * doorH, 0.05);
      fxRoot.add(chip);
      debris.push({
        o: chip, life: 1.4,
        v: new THREE.Vector3((Math.random() - 0.5) * 3, 1 + Math.random() * 3, 1 + Math.random() * 3),
        w: new THREE.Vector3(Math.random() * 10, Math.random() * 10, Math.random() * 10),
      });
    }
    s.gone = 1.4; // a new door shows up after a moment
    s.open = 0;
  }
  const involved = m.victim === meId || m.by === meId;
  shakeT = Math.max(shakeT, involved ? 0.45 : 0.15);
  if (m.victim === meId) toast('😱 쫓겨났어요! 바지 올리는 중...');
  if (m.by === meId) toast('😈 문을 부수고 들어왔어요!');
  playCrash(involved ? 0.6 : distVol(m.stall) * 0.45);
}

function updateDebris(dt) {
  for (let i = debris.length - 1; i >= 0; i--) {
    const d = debris[i];
    d.life -= dt;
    if (d.o.position.y > 0.03 || d.v.y > 0) {
      d.v.y -= 9.8 * dt;
      d.o.position.addScaledVector(d.v, dt);
      d.o.rotation.x += d.w.x * dt;
      d.o.rotation.y += d.w.y * dt;
      d.o.rotation.z += d.w.z * dt;
      if (d.o.position.y <= 0.03) {
        d.o.position.y = 0.03;
        if (d.door) d.o.rotation.set(-Math.PI / 2, d.o.rotation.y, 0);
        d.v.set(0, 0, 0);
      }
    }
    if (d.life < 0.5) d.o.scale.setScalar(Math.max(0.01, d.life / 0.5));
    if (d.life <= 0) {
      fxRoot.remove(d.o);
      debris.splice(i, 1);
    }
  }
}

function onBell(m) {
  const s = stallObjs[m.stall];
  if (s && !document.hidden) {
    const base = new THREE.Vector3(s.group.position.x + STALL_M / 2, 1.85, 0);
    pop(base, '🐦 짹짹~');
    for (let k = 0; k < 4; k++) {
      setTimeout(() => pop(base.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.7, 0.15 + Math.random() * 0.2, 0)), k % 2 ? '🎵' : '🎶'), 500 + k * 900);
    }
  }
  playSound('bird', m.id === meId ? 0.8 : distVol(m.stall) * 0.55);
}

// ---------- sound ----------

let audio = null;
const ctx = () => (audio ??= new AudioContext());
const buffers = {};
let bgm = null;

async function loadSounds() {
  for (const name of ['bgm', 'bird']) {
    if (buffers[name]) continue;
    try {
      const data = await fetch(`sounds/${name}.m4a`).then((r) => r.arrayBuffer());
      buffers[name] = await ctx().decodeAudioData(data);
    } catch (err) {
      console.warn('could not load sound', name, err);
    }
  }
}

function playSound(name, volume) {
  if (!soundOn || !buffers[name] || volume <= 0) return;
  const src = ctx().createBufferSource();
  src.buffer = buffers[name];
  const gain = ctx().createGain();
  gain.gain.value = volume;
  src.connect(gain).connect(ctx().destination);
  src.start();
}

function startBgm() {
  if (bgm || !buffers.bgm || !soundOn) return;
  const src = ctx().createBufferSource();
  src.buffer = buffers.bgm;
  src.loop = true;
  const gain = ctx().createGain();
  gain.gain.value = 0.25;
  src.connect(gain).connect(ctx().destination);
  src.start();
  bgm = src;
}

function stopBgm() {
  bgm?.stop();
  bgm = null;
}

function tone(type, f0, f1, dur, volume, delay = 0) {
  const t = ctx().currentTime + delay;
  const osc = ctx().createOscillator();
  const gain = ctx().createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, t);
  osc.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.8);
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(gain).connect(ctx().destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function plop(volume) {
  if (soundOn) tone('sine', 700, 110, 0.25, volume);
}

function playKnock(volume) {
  if (!soundOn || volume <= 0) return;
  tone('triangle', 190, 70, 0.09, volume);
  tone('triangle', 175, 65, 0.09, volume * 0.85, 0.13);
}

function playDing() {
  if (!soundOn) return;
  tone('sine', 1320, 1300, 0.35, 0.25);
  tone('sine', 990, 980, 0.5, 0.25, 0.18);
}

function playCrash(volume) {
  if (!soundOn || volume <= 0) return;
  const len = Math.floor(ctx().sampleRate * 0.45);
  const buf = ctx().createBuffer(1, len, ctx().sampleRate);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
  const src = ctx().createBufferSource();
  src.buffer = buf;
  const gain = ctx().createGain();
  gain.gain.value = volume;
  src.connect(gain).connect(ctx().destination);
  src.start();
  tone('sawtooth', 140, 40, 0.4, volume * 0.5);
}

$('#soundBtn').addEventListener('click', async () => {
  soundOn = !soundOn;
  $('#soundBtn').textContent = soundOn ? '🔊' : '🔇';
  $('#soundBtn').setAttribute('aria-label', soundOn ? '소리 끄기' : '소리 켜기');
  if (soundOn) {
    await ctx().resume();
    plop(0.2);
    await loadSounds();
    startBgm();
  } else {
    stopBgm();
  }
});

// ---------- input ----------

const MOVE_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'KeyS'];
const typing = () => document.activeElement === chatInput;

window.addEventListener('keydown', (e) => {
  if (typing()) {
    if (e.key === 'Escape') closeChat();
    return;
  }
  if (MOVE_KEYS.includes(e.code)) {
    e.preventDefault();
    if (me.s !== -1) {
      if (e.code === 'ArrowDown' || e.code === 'KeyS') exitStall();
      return;
    }
    keys.add(e.code);
  } else if (e.code === 'Space') {
    e.preventDefault();
    if (me.s !== -1) {
      if (!e.repeat) setHold(true);
      return;
    }
    const free = nearestEmptyStall(me.x, me.y);
    if (free >= 0) {
      if (!e.repeat) tryEnter(free);
    } else {
      tryKnock(nearestOccupiedStall(me.x, me.y));
    }
  } else if (e.code === 'KeyB') {
    if (me.s !== -1) ringBell();
  } else if (e.key === 'Escape') {
    if (me.s !== -1) exitStall();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    openChat();
  }
});

window.addEventListener('keyup', (e) => {
  keys.delete(e.code);
  if (e.code === 'Space') setHold(false);
});

window.addEventListener('blur', () => {
  keys.clear();
  setHold(false);
});

// tap / click to walk; tap a stall to walk in
const raycaster = new THREE.Raycaster();
sceneEl.addEventListener('pointerdown', (e) => {
  if (!me.ready || me.s !== -1 || !floorMesh) return;
  const rect = sceneEl.getBoundingClientRect();
  const ndc = new THREE.Vector2(((e.clientX - rect.left) / W) * 2 - 1, -((e.clientY - rect.top) / H) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.intersectObjects([...stallHits.filter(Boolean), floorMesh], false)[0];
  if (!hit) return;
  const i = hit.object.userData.stall;
  if (i !== undefined) {
    if (!freeFor(i)) {
      target = { x: stallCenter(i), y: 6 };
      pendingEnter = -1;
    } else {
      walkToStall(i);
    }
  } else {
    target = { x: clamp(hit.point.x / U, 20, worldW() - 40), y: clamp((hit.point.z - Z0) / U, 0, FLOOR_H) };
    pendingEnter = -1;
  }
});

// ---------- room menu ----------

const roomMenu = $('#roomMenu');
const roomBtn = $('#roomBtn');
let menuTheme = null;
let roomList = [];

function renderRoomMenu() {
  const tabs = $('#themeTabs');
  tabs.innerHTML = '';
  for (const [key, th] of Object.entries(THEMES)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = key === menuTheme ? 'on' : '';
    b.innerHTML = `<span class="ico">${th.emoji}</span><span>${th.label}</span>`;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      menuTheme = key;
      renderRoomMenu();
    });
    tabs.append(b);
  }
  const list = $('#serverList');
  list.innerHTML = '';
  for (const r of roomList.filter((r) => r.theme === menuTheme)) {
    const b = document.createElement('button');
    b.type = 'button';
    const full = r.online >= r.max;
    b.className = r.id === params.get('room') ? 'current' : '';
    b.disabled = full;
    b.innerHTML = `<span>${r.no}호점</span><small>${full ? '만칸' : `${r.online}명`}</small>`;
    b.addEventListener('click', () => (location.search = `?room=${r.id}`));
    list.append(b);
  }
}

async function openRoomMenu() {
  roomList = await fetch('/api/rooms').then((r) => r.json());
  menuTheme = room ? room.theme : 'highway';
  renderRoomMenu();
  roomMenu.hidden = false;
  roomBtn.setAttribute('aria-expanded', 'true');
}

function closeRoomMenu() {
  roomMenu.hidden = true;
  roomBtn.setAttribute('aria-expanded', 'false');
}

roomBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  roomMenu.hidden ? openRoomMenu() : closeRoomMenu();
});
document.addEventListener('pointerdown', (e) => {
  if (!roomMenu.hidden && !roomMenu.contains(e.target) && !roomBtn.contains(e.target)) closeRoomMenu();
});

connect();
requestAnimationFrame(frame);
