// 똥타 — a roomy three.js restroom rendered at low resolution, with hand-drawn pixel sprites standing in it.
import * as THREE from '/vendor/three.module.js';
import { peopleReady, makePerson, disposePerson, setFace, setPantsDown, pose, HIP_Y, HEIGHT } from './person.js';

// ---------- world constants (keep in sync with server.js) ----------
const STALL_W = 110;
const ENTER_RANGE = 75;
const SPEED = 300;

// the room layout arrives from the server on welcome (stalls in a U around a plaza)
let LAYOUT = [];
let ROOM_W = 2200;
let ROOM_D = 2300;
let BASIN = { x: 1100, y: 1050, w: 100, d: 420 }; // the wash island (sent by the server)

// server units (cm) -> meters
const U = 0.01;
const toX = (x) => x * U;
const toZ = (y) => y * U;
const STALL_M = STALL_W * U;
const STALL_D = 1.6;
const DOOR_W = 0.94;
const DOOR_BOT = 0.3; // the famous American gap: feet show underneath
const DOOR_TOP = 0.78; // a low half-door, so whoever sits inside shows their whole face over it
const PART_BOT = 0.3;
const PART_TOP = 1.75;
const SEAT_Z = -0.88; // where the person on the toilet sits (bowl center is at -1.1)
const SEAT_TOP = 0.48; // where the sitter's hips rest: perched on the seat, a little high so the face clears the door
const BENCH_TOP = 0.41;
const PX_M = 0.05; // meters per sprite pixel
const PILE_MAX = 10;

const INK = '#2a1f2b';
const SKIN = '#ffd9b8';
// natural shades plus a few bright, fun ones (no grey: it read as grandma)
const HAIRS = ['#3b2a20', '#1f1b22', '#6b4226', '#c26a3a', '#e0b25c', '#f2d38a', '#e86a92', '#5b8ee6', '#9a6ad6', '#3fae8f', '#ff9f5a', '#4a3460'];
// a casual fast-food restroom: butter-yellow tile, ketchup-red doors, cream stalls, warm daylight
const OG = new URLSearchParams(location.search).has('og'); // ?og renders the link-preview frame

const PAL = {
  // sky blue and yellow: sky-blue tiled walls and doors, ivory stall partitions, a yellow-and-cream checked floor, white bowls
  sky: '#f2d98a', band: '#4aa6dc', bandGlow: '#000000',
  tileA: '#bfe3f7', tileLine: '#a6d5f0',
  floorA: '#ffe7a3', floorB: '#fffaf0', floorLine: '#f2dfae',
  door: '#5bb4e5', doorDark: '#3f98cc', doorLight: '#7cc6ee', number: '#ffffff',
  part: '#f6f1e4', partTop: '#ffffff', partGlow: '#000000', rail: '#b9bec5', railGlow: '#000000', porcelain: '#fbfbfb',
  hemi: ['#fffaf0', '#d8dde6', 1.3], moon: ['#fff6e6', 1.25],
  lamps: ['#fff3dc'], lampPower: 3.5,
  water: ['#8fd0ec', '#1d4a5e'], bench: '#c9965e', stone: '#ffffff',
};

const $ = (s) => document.querySelector(s);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, k) => a + (b - a) * k;
function lerpAngle(a, b, k) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

// ---------- game state ----------

let ws = null;
let meId = null;
let stalls = [];
let piles = [];
let hp = [];
let held = [];
const users = new Map();
const me = { x: 100, y: 300, s: -1, p: 0, ready: false, rolling: false, pd: false, q: 0, b: false };
let pendingBench = false;
let pendingWash = false;
let spaceHeld = false; // arrows + Space = run
const keys = new Set();
let target = null;
let pendingEnter = -1;
let holding = false;
let lastSent = { x: 0, y: 0, t: 0 };
// 'fx' (effects only, the default), 'all' (effects + background music) or 'off'; remembered for next time
let soundMode = 'fx';
try {
  soundMode = ['fx', 'all', 'off'].find((m) => m === localStorage.getItem('ddongta.sound')) || 'fx';
} catch {}
let soundOn = soundMode !== 'off'; // browsers still need one tap or key before anything can play
const happyUntil = new Map();

// ---------- pixel sprite helpers ----------

// Build a sprite from ASCII rows. Every opaque pixel gets a 1px dark outline.
function sprite(rows, pal, extra = null, outline = INK) {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const c = document.createElement('canvas');
  c.width = w + 2;
  c.height = h + 2;
  const g = c.getContext('2d');
  const on = new Uint8Array((w + 2) * (h + 2));
  rows.forEach((r, y) => {
    for (let x = 0; x < r.length; x++) {
      const col = pal[r[x]];
      if (!col) continue;
      g.fillStyle = col;
      g.fillRect(x + 1, y + 1, 1, 1);
      on[(y + 1) * (w + 2) + x + 1] = 1;
    }
  });
  if (extra) {
    for (const [col, pts] of extra) {
      g.fillStyle = col;
      for (const [x, y] of pts) g.fillRect(x + 1, y + 1, 1, 1);
    }
  }
  if (outline) {
    g.fillStyle = outline;
    for (let y = 0; y < h + 2; y++) {
      for (let x = 0; x < w + 2; x++) {
        if (on[y * (w + 2) + x]) continue;
        const n = (dx, dy) => on[(y + dy) * (w + 2) + x + dx] === 1;
        if ((x > 0 && n(-1, 0)) || (x < w + 1 && n(1, 0)) || (y > 0 && n(0, -1)) || (y < h + 1 && n(0, 1))) g.fillRect(x, y, 1, 1);
      }
    }
  }
  return c;
}

// ---------- character art ----------

// every visitor gets a look picked from their id: hair style, skin, cap, stripes, pants
const SKINS = ['#ffd9b8', '#f6c8a2', '#e8b08a', '#c98e64', '#9a6644'];
const STYLES_GIRL = ['long', 'pigtails', 'ponytail', 'bob', 'bun'];
const STYLES_BOY = ['short', 'cap', 'curly', 'buzz', 'short'];
const PANTS = ['#4a6fa5', '#b08a5a', '#2f2f3a', '#6b8a4a', '#8e4a5e'];
const CAPS = ['#e5484d', '#3a7bd5', '#46a758', '#f5a524', '#8a5cd0'];

function hashId(n) {
  let x = Math.imul(n + 1, 2654435761) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 2246822519) >>> 0;
  x ^= x >>> 13;
  return x >>> 0;
}

function lookFor(u) {
  const h = hashId(u.id);
  const pick = (arr, shift) => arr[(h >>> shift) % arr.length];
  const girl = (h >>> 27) % 2 === 0; // about half the visitors, told apart only by longer hair
  const look = {
    c: u.c, skin: pick(SKINS, 0), h: pick(HAIRS, 3), style: pick(girl ? STYLES_GIRL : STYLES_BOY, 7), pants: pick(PANTS, 11),
    cap: pick(CAPS, 15), stripe: (h >>> 23) % 3 === 0,
  };
  look.key = [look.c, look.skin, look.h, look.style, look.pants, look.cap, look.stripe].join('|');
  return look;
}

// ---------- props & icons ----------

const PROPS = {
  poop: sprite(['....p...', '...ppP..', '..phpPP.', '.ppppppP', '..PPPPP.', '.phpppPP', 'pppppppP', '.PPPPPP.'], { p: '#8a5228', P: '#5e3517', h: '#c88a50' }),
  goldPoop: sprite(['....p...', '...ppP..', '..phpPP.', '.ppppppP', '..PPPPP.', '.phpppPP', 'pppppppP', '.PPPPPP.'], { p: '#f2c94c', P: '#c9952a', h: '#fff4b8' }),
  sparkle: sprite(['..Y..', '..Y..', 'YYWYY', '..Y..', '..Y..'], { Y: '#ffd84a', W: '#ffffff' }, null, null),
  note: sprite(['..NNN', '..N.N', '..N.N', '..N..', 'NNN..', 'NNN..'], { N: '#ffd84a' }),
  marker: sprite(['MMMMM', '.MMM.', '..M..'], { M: '#ffd84a' }),
  halo: sprite(['.AAAAAAAA.', 'A........A', '.AAAAAAAA.'], { A: '#ffe066' }, null, null),
  bubble: sprite(['.bbb.', 'bWccb', 'bcccb', 'bcccb', '.bbb.'], { b: '#bfe8ff', W: '#ffffff', c: '#eaf7ff' }, null, null),
  drop: sprite(['.d.', 'ddd', '.d.'], { d: '#8fd6ff' }, null, null),
};

const ICON_PAL = {
  D: '#b07a48', d: '#e2b07a', k: '#ffe08a', F: '#ffd9b8', f: '#e6b48c', B: '#8fd0ff', b: '#4f9fd8', Y: '#ffb347',
  y: '#c98a2a', A: '#6dbb7a', W: '#ffffff', w: '#cfe1ec', G: '#9a8a7a', g: '#d8eef8', H: '#8a5a3a', S: '#8a7a6a', x: '#e88a7a',
};
const asIcon = (c) => ({ src: c.toDataURL(), w: c.width, h: c.height });
const icon = (rows) => asIcon(sprite(rows, ICON_PAL, null, '#5a4636'));
// pixel icons are shown at exactly 2x so they stay crisp
const icoImg = (key) => `<img class="ico" src="${ICONS[key].src}" style="--w:${ICONS[key].w};--h:${ICONS[key].h}" alt="">`;
const ICONS = {
  door: icon(['.DDDDDDD.', '.DdddddD.', '.DdddddD.', '.DdddddD.', '.DddddkD.', '.DdddddD.', '.DdddddD.', '.DdddddD.', 'DDDDDDDDD']),
  knock: icon(['..FFFF...', '.FFFFFF..', 'FFfFfFFF.', 'FFFFFFFF.', 'FFFFFFFF.', '.FFFFFF..', '..FFFF...']),
  bird: icon(['...BBB...', '..BBBBW..', '.BBBBBBYY', 'BBBbBBB..', '.BBbbBB..', '..BBBB...', '...y.y...']),
  exit: icon(['DDDD.....', 'D..D..A..', 'D..D..AA.', 'D..AAAAAA', 'D..D..AA.', 'D..D..A..', 'DDDD.....']),
  chat: icon(['.WWWWWWW.', 'WWWWWWWWW', 'WGWWGWWGW', 'WWWWWWWWW', '.WWWWWWW.', '..WW.....', '.W.......']),
  find: icon(['.GGG....', 'GgggG...', 'GgggG...', 'GgggG...', '.GGGHH..', '....HH..', '.....HH.', '......HH']),
  people: icon(['.HHHH.', 'HFFFFH', '.FFFF.', '..FF..', '.AAAA.', 'AAAAAA', 'AAAAAA']),
  chat: icon(['.SSSSSSS.', 'SWWWWWWWS', 'SWSSSSSWS', 'SWWWWWWWS', '.SSSSSSS.', '..SS.....', '..S......']),
  chatOff: icon(['xSSSSSSS.', 'SxWWWWWWS', 'SWxSSSSWS', 'SWWxWWWWS', '.SSSxSSS.', '..SS.x...', '..S...x..']),
  flush: icon(['...b...', '..bBb..', '.bBBBb.', 'bBBWBBb', 'bBBWBBb', '.bBBBb.', '..bbb..']),
  recenter: icon(['...S...', '.SSSSS.', '.S...S.', 'SS.S.SS', '.S...S.', '.SSSSS.', '...S...']),
  soundOn: icon(['...S.....', '..SS..W..', 'SSSS.W.W.', 'SSSS.W.W.', '..SS..W..', '...S.....']),
  soundOff: icon(['...S.....', '..SS.....', 'SSSS.x.x.', 'SSSS..x..', '..SS.x.x.', '...S.....']),
  music: icon(['...SSSS', '...SSSS', '...S..S', '...S..S', '.SSS.SS', 'SSSSSSS', '.SS..S.']),
  wash: icon(['...B...', '..BBB..', '.BBBBB.', '.BBWBB.', '.BBBBB.', '..BBB..']),
  bench: icon(['DDDDDDDDD', 'DdddddddD', 'DDDDDDDDD', '.D.....D.', '.D.....D.']),
  jump: icon(['...A...', '..AAA..', '.AAAAA.', '...A...', '...A...', '...A...']),
  poop: asIcon(PROPS.poop),
  // the push button: an empty (pale) poop that fills up with the real one
  poopEmpty: asIcon(sprite(['....p...', '...ppP..', '..phpPP.', '.ppppppP', '..PPPPP.', '.phpppPP', 'pppppppP', '.PPPPPP.'], { p: '#f6ecdf', P: '#e3d1b8', h: '#ffffff' })),
};

const DIGITS = ['111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001', '111100111001111', '111100111101111', '111001001001001', '111101111101111', '111101111001111'];
function drawNumber(g, n, cx, y, color) {
  const s = String(n);
  let x = Math.round(cx - (s.length * 4 - 1) / 2);
  g.fillStyle = color;
  for (const ch of s) {
    const bits = DIGITS[+ch];
    for (let i = 0; i < 15; i++) if (bits[i] === '1') g.fillRect(x + (i % 3), y + Math.floor(i / 3), 1, 1);
    x += 4;
  }
}

// ---------- three.js setup ----------

const sceneEl = $('#scene');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }); // softer edges
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
sceneEl.append(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PAL.sky);
scene.fog = new THREE.Fog(PAL.sky, 60, 230);
const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 600);
const hemi = new THREE.HemisphereLight(PAL.hemi[0], PAL.hemi[1], PAL.hemi[2]);
const sun = new THREE.DirectionalLight(PAL.moon[0], PAL.moon[1]); // the sun by day, the moon at night
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 10, bottom: -10, near: 1, far: 40 });
sun.shadow.bias = -0.001;
scene.add(hemi, sun, sun.target);
const lamps = new THREE.Group(); // the lights over the plaza (no visible fixtures)
scene.add(lamps);

const worldRoot = new THREE.Group();
const stallRoot = new THREE.Group();
const charRoot = new THREE.Group();
const fxRoot = new THREE.Group();
scene.add(worldRoot, stallRoot, charRoot, fxRoot);

let W = 1;
let H = 1;
function resize() {
  W = innerWidth;
  H = innerHeight;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); // drawn at the screen's own sharpness, no pixel look
  renderer.setSize(W, H);
  camera.aspect = W / H;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ---------- textures ----------

function pixelTex(c, repeat = false) {
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
const texCache = new WeakMap();
function texOf(c) {
  let t = texCache.get(c);
  if (!t) {
    t = pixelTex(c);
    texCache.set(c, t);
  }
  return t;
}

function canvas(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  return c;
}

const floorCanvas = canvas(32, 32, (g) => {
  for (let y = 0; y < 2; y++) {
    for (let x = 0; x < 2; x++) {
      g.fillStyle = (x + y) % 2 ? PAL.floorB : PAL.floorA;
      g.fillRect(x * 16, y * 16, 16, 16);
    }
  }
  g.fillStyle = PAL.floorLine;
  g.fillRect(0, 15, 32, 1);
  g.fillRect(0, 31, 32, 1);
  g.fillRect(15, 0, 1, 32);
  g.fillRect(31, 0, 1, 32);
});
// outside the building: brick walls, a grass world that curves away like a small planet, trees, hills and sky
const brickCanvas = canvas(16, 8, (g) => {
  g.fillStyle = '#d6b39a';
  g.fillRect(0, 0, 16, 8);
  const bricks = ['#b5523b', '#a9492f', '#bd5c44'];
  for (let y = 0; y < 2; y++) {
    for (let x = -1; x < 3; x++) {
      g.fillStyle = bricks[(x + y * 2 + 3) % 3];
      g.fillRect(x * 8 + (y % 2) * 4, y * 4, 7, 3);
    }
  }
});
const grassCanvas = canvas(16, 16, (g) => {
  g.fillStyle = '#7fb35a';
  g.fillRect(0, 0, 16, 16);
  const tufts = ['#8cc063', '#72a54f', '#93c76b'];
  for (let k = 0; k < 40; k++) {
    g.fillStyle = tufts[k % 3];
    g.fillRect((k * 7 + (k >> 2) * 3) % 16, (k * 11 + (k >> 1)) % 16, 1, 1);
  }
});
const pavementCanvas = canvas(16, 16, (g) => {
  g.fillStyle = '#ece5d6';
  g.fillRect(0, 0, 16, 16);
  g.fillStyle = '#d8cfbd';
  g.fillRect(0, 15, 16, 1);
  g.fillRect(15, 0, 1, 16);
});

const mirrorCanvas = canvas(12, 16, (g) => {
  g.fillStyle = '#8a7a62';
  g.fillRect(0, 0, 12, 16);
  g.fillStyle = '#cfe6f2';
  g.fillRect(1, 1, 10, 14);
  g.fillStyle = '#ffffff';
  g.fillRect(2, 2, 1, 4);
  g.fillRect(3, 2, 1, 2);
});
// the entrance: a welcome mat and a wet-floor sign
const matCanvas = () => canvas(56, 22, (g) => {
  g.fillStyle = '#a9d9a0'; // a soft pastel green mat
  g.fillRect(0, 0, 56, 22);
  g.fillStyle = '#c8ebc0';
  g.fillRect(2, 2, 52, 18);
  g.font = '9px Galmuri9';
  g.textBaseline = 'middle';
  g.textAlign = 'center';
  g.fillStyle = '#4f8a4a';
  g.fillText('WELCOME', 28, 11);
});
const wetSign = () => sprite([
  '...yyyy...', '..yYYYYy..', '..YYkkYY..', '..YYkkYY..', '.yYYkkYYy.', '.YYYkkYYY.',
  '.YYYYYYYY.', 'yYYYkkYYYy', 'YYYYkkYYYY', 'YYYYYYYYYY', 'k........k', 'k........k',
], { Y: '#ffd23f', y: '#e0a91c', k: '#2a1f2b' });

// a door texture per stall: number on top, cracks as it gets knocked
function drawDoorCanvas(c, n, crack) {
  const g = c.getContext('2d');
  const w = c.width;
  const h = c.height;
  g.fillStyle = PAL.doorDark;
  g.fillRect(0, 0, w, h);
  g.fillStyle = PAL.door;
  g.fillRect(1, 1, w - 2, h - 2);
  g.fillStyle = PAL.doorLight;
  g.fillRect(1, 1, w - 2, 1);
  g.fillRect(1, 1, 1, h - 2);
  g.fillStyle = PAL.doorDark;
  g.fillRect(3, 9, w - 6, 1);
  g.fillRect(3, 9, 1, h - 12);
  g.fillStyle = PAL.doorLight;
  g.fillRect(4, 10, w - 8, 1);
  drawNumber(g, n, w / 2, 2, PAL.number);
  if (crack > 0) {
    g.fillStyle = '#d9d4cc'; // light cracks show on the dark door
    const pts = [
      [[5, 4], [6, 5], [6, 6], [7, 7], [7, 8], [8, 9]],
      [[w - 6, h - 9], [w - 7, h - 8], [w - 7, h - 7], [w - 8, h - 6], [w - 9, h - 5]],
      [[9, 9], [10, 10], [9, 11], [10, 12]],
    ];
    for (let k = 0; k < crack; k++) for (const [x, y] of pts[k]) g.fillRect(x, y, 1, 1);
    g.fillStyle = `rgba(230,60,60,${crack * 0.12})`;
    g.fillRect(0, 0, w, h);
  }
}

// ---------- materials & shared geometry ----------

const mat = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
const M = {
  part: mat(PAL.part),
  partTop: mat(PAL.partTop, { emissive: PAL.partGlow }),
  rail: mat(PAL.rail, { emissive: PAL.railGlow }),
  porcelain: new THREE.MeshPhongMaterial({ color: PAL.porcelain, shininess: 60 }),
  water: mat('#9fd3ec'),
  lockRed: new THREE.MeshBasicMaterial({ color: '#e5484d' }),
  lockGreen: new THREE.MeshBasicMaterial({ color: '#46a758' }),
  doorEdge: mat(PAL.doorDark),
  blob: new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.2, depthWrite: false }),
  hit: new THREE.MeshBasicMaterial({ visible: false }),
  sink: new THREE.MeshPhongMaterial({ color: '#ffffff', shininess: 40 }),
  wood: mat('#b88a5c'),
  metal: new THREE.MeshPhongMaterial({ color: '#c9ced3', shininess: 80 }),
};
const G = {
  partition: new THREE.BoxGeometry(0.04, PART_TOP - PART_BOT, STALL_D),
  cap: new THREE.BoxGeometry(0.06, 0.03, STALL_D),
  post: new THREE.BoxGeometry(0.07, PART_TOP, 0.07),
  door: new THREE.BoxGeometry(DOOR_W, DOOR_TOP - DOOR_BOT, 0.04),
  lock: new THREE.BoxGeometry(0.06, 0.04, 0.02),
  bowl: new THREE.CylinderGeometry(0.2, 0.15, 0.4, 12),
  seat: new THREE.TorusGeometry(0.17, 0.035, 6, 14),
  water: new THREE.CircleGeometry(0.13, 12),
  tank: new THREE.BoxGeometry(0.46, 0.38, 0.2),
  hit: new THREE.BoxGeometry(STALL_M, 2, 0.6),
  blob: new THREE.CircleGeometry(0.28, 14),
  chip: new THREE.BoxGeometry(0.06, 0.04, 0.03),
};

function mesh(geo, material, { cast = false, receive = false } = {}) {
  const m = new THREE.Mesh(geo, material);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

// a pixel sprite planted in the world, sized by its pixel count
function pixelSprite(c, density = PX_M) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: texOf(c), transparent: true, alphaTest: 0.5 }));
  s.center.set(0.5, 0);
  s.scale.set(c.width * density, c.height * density, 1);
  return s;
}

// ---------- the room ----------

let floorMesh = null;
let builtFor = 0;
const benchSpots = []; // the middle of each bench, in server units
const benchSeats = []; // three seats along each bench, so people sit side by side

function buildRoom() {
  worldRoot.clear();
  lamps.clear();
  const rw = toX(ROOM_W);
  const rd = toZ(ROOM_D);
  const wallH = 5;
  const back = -STALL_D;

  // floor: the checked tiles stop at the walls and the open front
  const ft = pixelTex(floorCanvas, true);
  const fw = rw + 2 * STALL_D;
  const fd = rd + STALL_D;
  ft.repeat.set(fw / 1.2, fd / 1.2); // 60 cm tiles
  floorMesh = mesh(new THREE.PlaneGeometry(fw, fd), new THREE.MeshPhongMaterial({ map: ft, shininess: 28, specular: '#3a3428' }), { receive: true }); // a soft sheen
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.position.set(rw / 2, 0, (rd + back) / 2);
  worldRoot.add(floorMesh);
  buildOutside(rw, rd, back);

  const T = 0.3; // wall thickness
  const bricks = (w, h) => {
    const t = pixelTex(brickCanvas, true);
    t.repeat.set(w / 0.8, h / 0.4);
    return new THREE.MeshLambertMaterial({ map: t });
  };
  const band = (w, x, z, rotY) => {
    const m = mesh(new THREE.PlaneGeometry(w, 0.12), mat(PAL.band, { emissive: PAL.bandGlow }));
    m.position.set(x, 2.05, z);
    m.rotation.y = rotY;
    m.translateZ(0.01);
    worldRoot.add(m);
  };
  // three walls with real window openings: tiled inside, brick outside, glazed and framed.
  // Each wall is built flat (x along the wall, y up, inside facing +z) and then turned into place.
  const winW = 1.3;
  const winH = 1.6;
  const winY = 3.25;
  const frameMat = mat('#fffaf0');
  const glassMat = new THREE.MeshBasicMaterial({ color: '#d6eef8', transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });
  const glareMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide });
  const inner = new THREE.MeshLambertMaterial({ map: pixelTex(TILE, true) });
  inner.map.repeat.set(1 / 1.2, 1 / 1.2); // 60 cm tiles, like the floor (shape UVs are in metres)
  const outer = new THREE.MeshLambertMaterial({ map: pixelTex(brickCanvas, true), side: THREE.BackSide });
  outer.map.repeat.set(1 / 0.8, 1 / 0.4);
  const windowWall = (len, wins, x, z, rotY) => {
    const g = new THREE.Group();
    const shape = new THREE.Shape();
    shape.moveTo(-len / 2, 0);
    shape.lineTo(len / 2, 0);
    shape.lineTo(len / 2, wallH);
    shape.lineTo(-len / 2, wallH);
    shape.closePath();
    for (const wx of wins) {
      const hole = new THREE.Path();
      hole.moveTo(wx - winW / 2, winY - winH / 2);
      hole.lineTo(wx - winW / 2, winY + winH / 2);
      hole.lineTo(wx + winW / 2, winY + winH / 2);
      hole.lineTo(wx + winW / 2, winY - winH / 2);
      hole.closePath();
      shape.holes.push(hole);
    }
    const slab = new THREE.ShapeGeometry(shape);
    const wallIn = mesh(slab, inner, { receive: true });
    const wallOut = mesh(slab, outer, { cast: true, receive: true });
    wallOut.position.z = -T;
    const top = mesh(new THREE.BoxGeometry(len, 0.06, T), bricks(len, T));
    top.position.set(0, wallH, -T / 2);
    g.add(wallIn, wallOut, top);
    for (const wx of wins) {
      // reveals: the four inner sides of the opening
      for (const [w, h, dx, dy] of [[winW, 0.05, 0, -winH / 2], [winW, 0.05, 0, winH / 2], [0.05, winH, -winW / 2, 0], [0.05, winH, winW / 2, 0]]) {
        const r = mesh(new THREE.BoxGeometry(w + 0.05, h, T), frameMat, { receive: true });
        r.position.set(wx + dx, winY + dy, -T / 2);
        g.add(r);
      }
      // mullions: a cross of white bars
      const v = mesh(new THREE.BoxGeometry(0.06, winH, 0.06), frameMat);
      v.position.set(wx, winY, -T / 2);
      const hz = mesh(new THREE.BoxGeometry(winW, 0.06, 0.06), frameMat);
      hz.position.set(wx, winY + 0.12, -T / 2);
      // glass, with two pale glare strips
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(winW, winH), glassMat);
      glass.position.set(wx, winY, -T / 2);
      const g1 = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.7), glareMat);
      g1.position.set(wx - 0.32, winY + 0.25, -T / 2 + 0.01);
      g1.rotation.z = -0.5;
      const g2 = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.45), glareMat);
      g2.position.set(wx - 0.18, winY + 0.32, -T / 2 + 0.01);
      g2.rotation.z = -0.5;
      // a sill on the inside
      const sill = mesh(new THREE.BoxGeometry(winW + 0.2, 0.06, 0.16), frameMat, { cast: true });
      sill.position.set(wx, winY - winH / 2 - 0.03, 0.08);
      g.add(v, hz, glass, g1, g2, sill);
    }
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    worldRoot.add(g);
  };
  // the side walls run from the back wall to the open front; windows sit above the stalls, between the paintings
  const sideLen = rd + STALL_D;
  const sideZ = (rd + back) / 2;
  const sideWins = [2.6, 11.3, 19.9];
  windowWall(sideLen, sideWins.map((z) => sideZ - z), back, sideZ, Math.PI / 2); // left: along the wall is -z
  windowWall(sideLen, sideWins.map((z) => z - sideZ), rw - back, sideZ, -Math.PI / 2); // right: along the wall is +z
  for (const x of [back - T / 2, rw - back + T / 2]) { // brick ends at the open front
    const end = mesh(new THREE.BoxGeometry(T, wallH, 0.02), bricks(T, wallH));
    end.position.set(x, wallH / 2, rd + 0.01);
    worldRoot.add(end);
  }
  band(sideLen, back, sideZ, Math.PI / 2);
  band(sideLen, rw - back, sideZ, -Math.PI / 2);

  // the back wall spans the whole width, past the side walls' ends; the middle is left for the emblem
  const bw = fw + 2 * T;
  windowWall(bw, [2.2, 6.6, rw - 6.6, rw - 2.2].map((x) => x - rw / 2), rw / 2, back, 0);
  band(fw, rw / 2, back, 0);

  // paintings between the back windows and along both side walls
  poster(0, 4.4, back + 0.02, 0);
  poster(1, rw - 4.4, back + 0.02, 0);
  poster(2, back + 0.02, rd * 0.3, Math.PI / 2);
  poster(3, back + 0.02, rd * 0.68, Math.PI / 2);
  poster(4, rw - back - 0.02, rd * 0.3, -Math.PI / 2);
  poster(5, rw - back - 0.02, rd * 0.68, -Math.PI / 2);

  // the golden poop, big and glowing softly, in the middle of the back wall
  const halo = new THREE.Mesh(new THREE.CircleGeometry(0.85, 32), new THREE.MeshBasicMaterial({ map: pixelTex(canvas(32, 32, (g) => {
    const glow = g.createRadialGradient(16, 16, 2, 16, 16, 16);
    glow.addColorStop(0, 'rgba(255, 226, 120, 0.85)');
    glow.addColorStop(1, 'rgba(255, 226, 120, 0)');
    g.fillStyle = glow;
    g.fillRect(0, 0, 32, 32);
  })), transparent: true, depthWrite: false }));
  halo.position.set(rw / 2, 3.6, back + 0.03);
  const emblem = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshBasicMaterial({ map: pixelTex(PROPS.goldPoop), transparent: true, alphaTest: 0.5 }));
  emblem.position.set(rw / 2, 3.6, back + 0.05);
  emblem.userData.wish = true;
  wishHits.push(emblem);
  worldRoot.add(halo, emblem);
  buildEntrance(rw / 2, rd + 0.2);

  // the middle of the room: a long wash island with sinks along both sides and a mirrored divider,
  // straight wooden benches either side, plants at the ends; the floor stays one check
  const bx = toX(BASIN.x);
  const bz = toZ(BASIN.y);
  const iw = toX(BASIN.w); // half-width
  const id = toZ(BASIN.d); // half-length
  const chrome = new THREE.MeshPhongMaterial({ color: '#d4dbe2', shininess: 110, specular: '#ffffff' });
  const tileFace = (w) => {
    const t = pixelTex(TILE, true);
    t.repeat.set(w / 0.8, 1); // two rows of 40 cm tiles
    return new THREE.MeshPhongMaterial({ map: t, shininess: 30 });
  };
  const cream = mat('#f6efe0');

  // the counter: sky-blue tiled body, white top
  const longSide = tileFace(id * 2);
  const shortSide = tileFace(iw * 2);
  const counter = mesh(new THREE.BoxGeometry(iw * 2, 0.8, id * 2), [longSide, longSide, shortSide, shortSide, shortSide, shortSide], { cast: true, receive: true });
  counter.position.set(bx, 0.4, bz);
  worldRoot.add(counter);
  const topMat = new THREE.MeshPhongMaterial({ color: '#fbfbf8', shininess: 50 }); // a plain white counter top
  const top = mesh(new THREE.BoxGeometry(iw * 2 + 0.14, 0.07, id * 2 + 0.14), topMat, { cast: true, receive: true });
  top.position.set(bx, 0.835, bz);
  worldRoot.add(top);

  // a mirrored divider down the middle
  const divider = mesh(new THREE.BoxGeometry(0.14, 1.05, id * 2 - 0.3), cream, { cast: true });
  divider.position.set(bx, 0.87 + 0.525, bz);
  const mirrorMat = new THREE.MeshPhongMaterial({ color: '#d9ecf2', emissive: '#3d5560', shininess: 140, specular: '#ffffff' });
  for (const side of [-1, 1]) {
    const mirror = new THREE.Mesh(new THREE.PlaneGeometry(id * 2 - 0.6, 0.8), mirrorMat);
    mirror.position.set(bx + side * 0.072, 1.42, bz);
    mirror.rotation.y = side * Math.PI / 2;
    worldRoot.add(mirror);
  }
  const dividerCap = mesh(new THREE.BoxGeometry(0.2, 0.05, id * 2 - 0.25), chrome);
  dividerCap.position.set(bx, 1.945, bz);
  worldRoot.add(divider, dividerCap);

  // sinks and taps: four along each long side
  const water = new THREE.MeshPhongMaterial({ color: PAL.water[0], emissive: PAL.water[1], shininess: 120 });
  const bowl = mat('#ffffff');
  for (const side of [-1, 1]) {
    for (const r of SINK_ROWS) {
      const z = bz + id * r;
      const x = bx + side * (iw - 0.3);
      const basin = mesh(new THREE.CylinderGeometry(0.22, 0.2, 0.02, 20), bowl);
      basin.position.set(x, 0.872, z);
      const pool = mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.02, 20), water);
      pool.position.set(x, 0.878, z);
      const neck = mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.3, 8), chrome);
      neck.position.set(bx + side * (iw - 0.62), 1.02, z);
      const spout = mesh(new THREE.BoxGeometry(0.3, 0.04, 0.04), chrome);
      spout.position.set(bx + side * (iw - 0.48), 1.16, z);
      worldRoot.add(basin, pool, neck, spout);
    }
  }

  // straight benches either side of the island: a base tiled like the island, a warm wooden seat; three seats each
  const oak = new THREE.MeshLambertMaterial({ map: pixelTex(OAK, true) });
  benchSpots.length = 0;
  benchSeats.length = 0;
  for (const side of [-1, 1]) {
    for (const off of [-0.5, 0.5]) {
      const x = bx + side * (iw + 3.2);
      const z = bz + off * id * 1.1;
      const benchLong = tileFace(2.3);
      const benchShort = tileFace(0.55);
      const base = mesh(new THREE.BoxGeometry(0.55, 0.32, 2.3), [benchLong, benchLong, benchShort, benchShort, benchShort, benchShort], { cast: true, receive: true });
      base.position.set(x, 0.16, z);
      const seat = mesh(new THREE.BoxGeometry(0.62, 0.09, 2.4), oak, { cast: true, receive: true });
      seat.position.set(x, 0.365, z);
      worldRoot.add(base, seat);
      benchSpots.push({ x: x / U, y: z / U });
      benchSeats.push([-0.72, 0, 0.72].map((dz) => ({ x: x / U, y: (z + dz) / U })));
    }
  }

  // drink machines along both side walls by the way in, past the last stalls
  [['#4aa6dc', 1], ['#fbfbf8', 2], ['#ffd23f', 3]].forEach(([color, k], i) => {
    vendingMachine(back + 0.4, rd - 3.0 + i * 1.0, Math.PI / 2, color, k);
    vendingMachine(rw - back - 0.4, rd - 3.0 + i * 1.0, -Math.PI / 2, color, k + 3);
  });

  // plants only by the way in and between the benches, so none of them hides a stall
  planter(rw / 2 - 3.8, rd - 0.9, 1.3, 1, 'snake');
  planter(rw / 2 + 3.8, rd - 0.9, 1.3, 2, 'snake');
  for (const side of [-1, 1]) planter(bx + side * (iw + 3.2), bz, 1.0, side + 8);

  lampLights.length = 0;
  const centre = new THREE.PointLight(PAL.lamps[0], PAL.lampPower * 1.5, 15, 1.6);
  lampLights.push([centre, 1.5]);
  centre.position.set(bx, 3.3, bz);
  lamps.add(centre);
  for (const [x, z] of [[rw * 0.25, rd * 0.28], [rw * 0.75, rd * 0.28], [rw * 0.25, rd * 0.72], [rw * 0.75, rd * 0.72]]) {
    const light = new THREE.PointLight(PAL.lamps[0], PAL.lampPower, 15, 1.6);
    lampLights.push([light, 1]);
    light.position.set(x, 3.2, z); // just light, no fixture hanging in the way
    lamps.add(light);
  }
  applyTimeOfDay();
}

// the world around the building: a sidewalk out front, then grass that stays flat near the walls and
// curves away further out like a small planet, ringed by trees and low hills under a sky dome
const FLAT_R = 26; // the ground stays level this far from the middle of the room
const CURVE_R = 70; // then drops away along a curve this tight
const groundY = (r) => (r <= FLAT_R ? -0.02 : -0.02 - ((r - FLAT_R) ** 2) / (2 * CURVE_R));
function buildOutside(rw, rd, back) {
  const cx = rw / 2;
  const cz = (rd + back) / 2;
  // grass: a polar grid bent by groundY, denser near the middle
  const rings = 60;
  const segs = 96;
  const verts = [];
  const uvs = [];
  const idx = [];
  for (let i = 0; i <= rings; i++) {
    const r = (220 * i * i) / (rings * rings); // denser near the middle
    for (let j = 0; j <= segs; j++) {
      const a = (j / segs) * Math.PI * 2;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      verts.push(x, groundY(r), z);
      uvs.push(x / 1.6, z / 1.6);
    }
  }
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < segs; j++) {
      const p0 = i * (segs + 1) + j;
      const p1 = p0 + segs + 1;
      idx.push(p0, p1, p0 + 1, p0 + 1, p1, p1 + 1);
    }
  }
  const ground = new THREE.BufferGeometry();
  ground.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  ground.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  ground.setIndex(idx);
  ground.computeVertexNormals();
  const gt = pixelTex(grassCanvas, true);
  const grass = mesh(ground, new THREE.MeshLambertMaterial({ map: gt }), { receive: true });
  grass.position.set(cx, 0, cz);
  worldRoot.add(grass);

  // a sidewalk along the open front, leading out from the entrance
  const pt = pixelTex(pavementCanvas, true);
  const sw = rw + 2 * STALL_D + 8;
  pt.repeat.set(sw / 0.9, 8 / 0.9);
  const walk = mesh(new THREE.PlaneGeometry(sw, 8), new THREE.MeshLambertMaterial({ map: pt }), { receive: true });
  walk.rotation.x = -Math.PI / 2;
  walk.position.set(cx, -0.005, rd + 4);
  worldRoot.add(walk);

  // trees all around, leaving the walls and the front walk clear
  const rnd = (k) => {
    const v = Math.sin(k * 91.3 + 7.1) * 43758.5453;
    return v - Math.floor(v);
  };
  const trunkMat = mat('#8a5a3a');
  for (let k = 0; k < 70; k++) {
    const a = rnd(k) * Math.PI * 2;
    const r = 24 + rnd(k + 100) * 60;
    const x = cx + Math.cos(a) * r;
    const z = cz + Math.sin(a) * r;
    if (z > rd - 2 && Math.abs(x - cx) < rw / 2 + 6 && z < rd + 12) continue; // keep the front walk open
    const size = 1.2 + rnd(k + 200) * 1.6;
    const t = new THREE.Group();
    const trunk = mesh(new THREE.CylinderGeometry(0.12, 0.18, 1.2, 6), trunkMat);
    trunk.position.y = 0.6;
    t.add(trunk);
    for (let n = 0; n < 3; n++) {
      const leaf = mesh(new THREE.IcosahedronGeometry(0.75 - n * 0.12, 0), LEAF_MATS[(k + n) % 3]);
      leaf.position.set((rnd(k * 3 + n) - 0.5) * 0.5, 1.4 + n * 0.55, (rnd(k * 5 + n) - 0.5) * 0.5);
      leaf.rotation.set(rnd(k + n) * 3, rnd(k * 2 + n) * 3, 0);
      t.add(leaf);
    }
    t.scale.setScalar(size);
    t.position.set(x, groundY(r), z);
    worldRoot.add(t);
  }

  // low hills on the far rim, softened by the haze
  const hillMat = new THREE.MeshLambertMaterial({ color: '#8fbf78', flatShading: true });
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2 + rnd(k + 300) * 0.3;
    const r = 120 + rnd(k + 400) * 30;
    const hill = mesh(new THREE.SphereGeometry(18 + rnd(k + 500) * 14, 10, 6), hillMat);
    hill.scale.y = 0.45;
    hill.position.set(cx + Math.cos(a) * r, groundY(r) - 2, cz + Math.sin(a) * r);
    worldRoot.add(hill);
  }
}

// the sky: a dome that blends from the zenith colour to the horizon colour, with a sun and its glow by day,
// a moon and stars at night, and puffy clouds drifting slowly round
const skyUniforms = {
  top: { value: new THREE.Color('#2f6fc0') },
  mid: { value: new THREE.Color('#5b98da') },
  horizon: { value: new THREE.Color('#bcd8ee') },
  sunDir: { value: new THREE.Vector3(0, 0.6, -0.8).normalize() },
  sunColor: { value: new THREE.Color('#fff4d6') },
  sunGlow: { value: 1 },
  moonDir: { value: new THREE.Vector3(0.4, 0.5, -0.75).normalize() },
  moonVis: { value: 0 },
};
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(400, 48, 24),
  new THREE.ShaderMaterial({
    uniforms: skyUniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: 'varying vec3 vPos; void main() { vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: [
      'uniform vec3 top;',
      'uniform vec3 mid;',
      'uniform vec3 horizon;',
      'uniform vec3 sunDir;',
      'uniform vec3 sunColor;',
      'uniform float sunGlow;',
      'uniform vec3 moonDir;',
      'uniform float moonVis;',
      'varying vec3 vPos;',
      'void main() {',
      '  vec3 d = normalize(vPos);',
      // three bands: a pale horizon, the sky colour, a deeper zenith
      '  vec3 col = mix(horizon, mid, smoothstep(0.0, 0.28, d.y));',
      '  col = mix(col, top, smoothstep(0.22, 0.95, d.y));',
      // depth: the side facing the sun glows warmer near the horizon, the far side sits cooler and darker
      '  vec2 dirXZ = normalize(d.xz + 1e-5);',
      '  vec2 sunFlat = normalize(sunDir.xz + 1e-5);',
      '  float toward = dot(dirXZ, sunFlat) * 0.5 + 0.5;',
      '  float low = 1.0 - smoothstep(0.0, 0.45, d.y);',
      '  col += sunColor * pow(toward, 3.0) * low * 0.22 * sunGlow;',
      '  col *= mix(1.0, 0.86, (1.0 - toward) * low * min(sunGlow, 1.0));',
      // a thin bright haze right on the horizon
      '  col += horizon * 0.12 * (1.0 - smoothstep(0.0, 0.06, abs(d.y)));',
      '  col = mix(col, horizon * 0.75, clamp(-d.y * 4.0, 0.0, 1.0));', // below the horizon
      '  float s = max(dot(d, sunDir), 0.0);',
      '  col += sunColor * sunGlow * (smoothstep(0.9985, 0.9992, s) * 1.2 + pow(s, 28.0) * 0.35 + pow(s, 5.0) * 0.12);',
      '  float m = max(dot(d, moonDir), 0.0);',
      '  col += moonVis * (vec3(1.0, 0.96, 0.84) * smoothstep(0.9990, 0.9994, m) + vec3(0.55, 0.62, 0.95) * pow(m, 80.0) * 0.25);',
      '  gl_FragColor = vec4(col, 1.0);',
      '  #include <colorspace_fragment>', // directives need a line of their own on strict GPUs
      '}',
    ].join('\n'),
  }),
);
const stars = (() => {
  const pts = [];
  for (let k = 0; k < 260; k++) {
    const a = Math.random() * Math.PI * 2;
    const y = 0.15 + Math.random() * 0.85;
    const r = Math.sqrt(1 - y * y);
    pts.push(Math.cos(a) * r * 380, y * 380, Math.sin(a) * r * 380);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return new THREE.Points(g, new THREE.PointsMaterial({ color: '#ffffff', size: 2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
})();
// puffy clouds made of soft balls; they take the sun's colour (white by day, peach at sunset, slate at night)
const clouds = new THREE.Group();
const cloudMat = new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#3a3f4a' }); // emissive follows the sky (applyTimeOfDay)
{
  const puff = new THREE.IcosahedronGeometry(1, 2);
  const rnd = (k) => {
    const v = Math.sin(k * 57.31 + 3.7) * 43758.5453;
    return v - Math.floor(v);
  };
  for (let k = 0; k < 18; k++) {
    const c = new THREE.Group();
    const n = 4 + Math.floor(rnd(k) * 4);
    for (let i = 0; i < n; i++) {
      const p = new THREE.Mesh(puff, cloudMat);
      const r = 3 + rnd(k * 9 + i) * 3.5;
      p.scale.set(r * 1.2, r * 0.75, r);
      p.position.set((i - n / 2) * 4 + rnd(k + i * 3) * 2, rnd(k * 2 + i) * 2.5, rnd(k * 4 + i) * 4 - 2);
      c.add(p);
    }
    const a = (k / 18) * Math.PI * 2 + rnd(k + 50) * 0.3;
    const dist = 100 + rnd(k + 70) * 120;
    // low over the horizon, where the camera actually looks (the ground falls away out there)
    c.position.set(Math.cos(a) * dist, -6 + rnd(k + 90) * 24, Math.sin(a) * dist);
    c.rotation.y = -a;
    const size = 1.1 + rnd(k + 110) * 1.1;
    c.scale.setScalar(size);
    clouds.add(c);
  }
}
scene.add(sky, stars, clouds);

// warm oak planks for the benches
const OAK = canvas(16, 16, (g) => {
  g.fillStyle = '#c9965e';
  g.fillRect(0, 0, 16, 16);
  g.fillStyle = '#b8834c'; // plank seams and a little grain
  for (const y of [0, 5, 10, 15]) g.fillRect(0, y, 16, 1);
  g.fillStyle = '#d6a66d';
  for (const [x, y] of [[2, 2], [9, 3], [5, 7], [12, 8], [3, 12], [10, 13]]) g.fillRect(x, y, 3, 1);
});
// square sky-blue tiles for the walls and the island
const TILE = canvas(16, 16, (g) => {
  g.fillStyle = PAL.tileA;
  g.fillRect(0, 0, 16, 16);
  g.fillStyle = PAL.tileLine;
  for (const v of [7, 15]) {
    g.fillRect(0, v, 16, 1);
    g.fillRect(v, 0, 1, 16);
  }
});
// famous paintings, redrawn as little pixel parodies, in gilt frames
const ART_W = 30;
const ART_H = 40;
const PAINTINGS = [
  // The Starry Night
  (g) => {
    const sky = g.createLinearGradient(0, 0, 0, ART_H);
    sky.addColorStop(0, '#1b2a6b');
    sky.addColorStop(0.7, '#2f4fa0');
    sky.addColorStop(1, '#22305e');
    g.fillStyle = sky;
    g.fillRect(0, 0, ART_W, ART_H);
    g.strokeStyle = '#8fb3e8';
    g.lineWidth = 1.2;
    for (const [x, y, r] of [[10, 13, 5], [18, 11, 4], [14, 16, 3]]) {
      g.beginPath();
      g.arc(x, y, r, 0.3, Math.PI * 1.7);
      g.stroke();
    }
    for (const [x, y, r] of [[4, 6, 1.6], [12, 4, 1.4], [20, 5, 1.6], [25, 13, 1.4], [7, 19, 1.2]]) {
      g.fillStyle = 'rgba(255, 236, 140, 0.35)';
      g.beginPath();
      g.arc(x, y, r * 2, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#ffe36a';
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#ffd23a'; // the moon
    g.beginPath();
    g.arc(25, 5, 3, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#2b4a3a'; // hills and village
    g.fillRect(0, 30, ART_W, 10);
    g.fillStyle = '#3a5f8a';
    for (const x of [11, 15, 19, 23]) g.fillRect(x, 31, 3, 3);
    g.fillStyle = '#ffd86a';
    for (const x of [12, 20]) g.fillRect(x, 32, 1, 1);
    g.fillStyle = '#17241b'; // the cypress
    g.beginPath();
    g.moveTo(4, 40);
    g.quadraticCurveTo(1, 26, 6, 12);
    g.quadraticCurveTo(9, 26, 9, 40);
    g.fill();
  },
  // Mona Lisa
  (g) => {
    const bg = g.createLinearGradient(0, 0, 0, ART_H);
    bg.addColorStop(0, '#8a9a6a');
    bg.addColorStop(1, '#5a5a3a');
    g.fillStyle = bg;
    g.fillRect(0, 0, ART_W, ART_H);
    g.fillStyle = '#3a2a18'; // dress
    g.beginPath();
    g.moveTo(6, 40);
    g.lineTo(9, 24);
    g.lineTo(21, 24);
    g.lineTo(24, 40);
    g.fill();
    g.fillStyle = '#2a1c12'; // hair
    g.beginPath();
    g.ellipse(15, 15, 6.5, 9, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#e2b77a'; // face and neck
    g.beginPath();
    g.ellipse(15, 14, 4.2, 5.4, 0, 0, Math.PI * 2);
    g.fill();
    g.fillRect(13, 18, 4, 6);
    g.fillStyle = '#e2b77a'; // hands
    g.fillRect(11, 32, 8, 3);
    g.fillStyle = '#2a1c12'; // eyes and the smile
    g.fillRect(13, 13, 1, 1);
    g.fillRect(16, 13, 1, 1);
    g.fillStyle = '#8a4a3a';
    g.fillRect(14, 16, 2, 1);
  },
  // The Scream
  (g) => {
    for (let y = 0; y < 22; y++) {
      const band = ((Math.floor(y / 2 + Math.sin(y) * 0.8) % 4) + 4) % 4; // wavy sky bands
      g.fillStyle = ['#e8562a', '#f08a2a', '#f4b23a', '#d8402a'][band];
      g.fillRect(0, y, ART_W, 1);
    }
    g.fillStyle = '#2f5aa0';
    g.fillRect(0, 22, ART_W, 18);
    g.fillStyle = '#7a4a2a'; // the bridge
    g.beginPath();
    g.moveTo(0, 30);
    g.lineTo(ART_W, 22);
    g.lineTo(ART_W, 26);
    g.lineTo(0, 40);
    g.fill();
    g.fillStyle = '#1e1e2a'; // the figure
    g.beginPath();
    g.moveTo(10, 40);
    g.quadraticCurveTo(12, 28, 15, 27);
    g.quadraticCurveTo(18, 28, 20, 40);
    g.fill();
    g.fillStyle = '#e8d9a8';
    g.beginPath();
    g.ellipse(15, 22, 3.6, 5, 0, 0, Math.PI * 2);
    g.fill();
    g.fillRect(10, 20, 2, 5); // hands on the cheeks
    g.fillRect(18, 20, 2, 5);
    g.fillStyle = '#1e1e2a';
    g.fillRect(13, 20, 1, 2);
    g.fillRect(16, 20, 1, 2);
    g.beginPath();
    g.ellipse(15, 24.5, 1, 1.6, 0, 0, Math.PI * 2);
    g.fill();
  },
  // Girl with a Pearl Earring
  (g) => {
    g.fillStyle = '#16140f';
    g.fillRect(0, 0, ART_W, ART_H);
    g.fillStyle = '#6a4a2a'; // jacket
    g.beginPath();
    g.moveTo(5, 40);
    g.quadraticCurveTo(10, 28, 18, 28);
    g.lineTo(24, 40);
    g.fill();
    g.fillStyle = '#e8c39a'; // face
    g.beginPath();
    g.ellipse(16, 19, 5, 6.5, 0.2, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#2f5aa8'; // the blue turban
    g.beginPath();
    g.ellipse(13, 12, 6, 4.5, -0.2, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#e8c24a'; // its yellow tail
    g.fillRect(8, 13, 3, 14);
    g.fillStyle = '#2a1c12';
    g.fillRect(17, 18, 1, 1);
    g.fillRect(20, 18, 1, 1);
    g.fillStyle = '#c0504a';
    g.fillRect(18, 23, 2, 1);
    g.fillStyle = '#ffffff'; // the pearl
    g.beginPath();
    g.arc(12, 23, 1.2, 0, Math.PI * 2);
    g.fill();
  },
  // The Great Wave off Kanagawa
  (g) => {
    g.fillStyle = '#e9dcc0';
    g.fillRect(0, 0, ART_W, ART_H);
    g.fillStyle = '#ffffff'; // Fuji
    g.beginPath();
    g.moveTo(16, 26);
    g.lineTo(21, 31);
    g.lineTo(11, 31);
    g.fill();
    g.fillStyle = '#2a4a7a';
    g.beginPath();
    g.moveTo(0, 40);
    g.lineTo(0, 18);
    g.quadraticCurveTo(4, 6, 16, 8);
    g.quadraticCurveTo(10, 12, 12, 20);
    g.quadraticCurveTo(14, 28, 30, 30);
    g.lineTo(30, 40);
    g.fill();
    g.fillStyle = '#4f7ab0';
    g.fillRect(0, 32, ART_W, 8);
    g.fillStyle = '#ffffff'; // foam claws
    for (const [x, y] of [[14, 8], [12, 10], [16, 10], [13, 12], [3, 14], [6, 11], [20, 31], [25, 32], [8, 34]]) g.fillRect(x, y, 2, 1);
    g.fillStyle = '#c9b48a'; // a boat
    g.fillRect(16, 33, 8, 2);
  },
  // Sunflowers
  (g) => {
    g.fillStyle = '#e8c24a';
    g.fillRect(0, 0, ART_W, ART_H);
    g.fillStyle = '#c9962a';
    g.fillRect(0, 30, ART_W, 10);
    g.fillStyle = '#d9a03a'; // vase
    g.beginPath();
    g.moveTo(10, 38);
    g.lineTo(9, 28);
    g.lineTo(21, 28);
    g.lineTo(20, 38);
    g.fill();
    g.fillStyle = '#2f7a9a';
    g.fillRect(9, 30, 12, 1);
    for (const [x, y, r] of [[10, 12, 4], [19, 10, 4.5], [15, 19, 4], [7, 22, 3.5], [23, 20, 3.5]]) {
      g.fillStyle = '#f5b82a';
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#7a4a1a';
      g.beginPath();
      g.arc(x, y, r * 0.45, 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = '#4f7a2a';
    g.lineWidth = 1;
    for (const [x, y] of [[10, 16], [19, 15], [15, 23]]) {
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(15, 28);
      g.stroke();
    }
  },
];
function paintingCanvas(k) {
  return canvas(ART_W + 8, ART_H + 8, (g) => {
    g.fillStyle = '#8a6a1f'; // a gilt frame: dark edge, gold, a bright inner line
    g.fillRect(0, 0, ART_W + 8, ART_H + 8);
    g.fillStyle = '#d4a93a';
    g.fillRect(1, 1, ART_W + 6, ART_H + 6);
    g.fillStyle = '#f2d27a';
    g.fillRect(2, 2, ART_W + 4, 1);
    g.fillRect(2, 2, 1, ART_H + 4);
    g.fillStyle = '#6a4a12';
    g.fillRect(3, 3, ART_W + 2, ART_H + 2);
    g.save();
    g.translate(4, 4);
    g.beginPath();
    g.rect(0, 0, ART_W, ART_H);
    g.clip();
    PAINTINGS[k % PAINTINGS.length](g);
    g.restore();
  });
}
function poster(k, x, z, rotY) {
  const p = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 1.22), new THREE.MeshLambertMaterial({ map: pixelTex(paintingCanvas(k)) }));
  p.position.set(x, 3.15, z);
  p.rotation.y = rotY;
  worldRoot.add(p);
}

// a drink vending machine: a coloured body, a lit window of cans, buttons, and the slot at the bottom
function vendingMachine(x, z, rotY, color, seed) {
  const front = canvas(24, 48, (g) => {
    g.fillStyle = color;
    g.fillRect(0, 0, 24, 48);
    g.fillStyle = '#eef7fb'; // the lit window
    g.fillRect(2, 3, 20, 24);
    const cans = ['#e5484d', '#4aa6dc', '#46a758', '#ffd23f', '#f08a2a', '#8e6bd8', '#ffffff'];
    for (let r = 0; r < 4; r++) {
      for (let k = 0; k < 5; k++) {
        g.fillStyle = cans[(r * 5 + k + seed * 3) % cans.length];
        g.fillRect(3 + k * 4, 5 + r * 6, 2, 4);
      }
      g.fillStyle = '#c9d6dd'; // the shelf under each row
      g.fillRect(2, 9 + r * 6, 20, 1);
    }
    g.fillStyle = '#2b2a2e'; // a row of buttons, coin slot and the pick-up slot
    for (let k = 0; k < 5; k++) g.fillRect(3 + k * 4, 29, 2, 1);
    g.fillRect(18, 33, 3, 4);
    g.fillStyle = '#e5484d';
    g.fillRect(19, 34, 1, 1);
    g.fillStyle = '#2b2a2e';
    g.fillRect(3, 40, 18, 5);
  });
  const t = pixelTex(front);
  const body = mat(color);
  const face = new THREE.MeshLambertMaterial({ map: t, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 0.25 });
  const m = mesh(new THREE.BoxGeometry(0.95, 1.85, 0.8), [body, body, body, body, face, body], { cast: true, receive: true });
  m.position.set(x, 0.925, z);
  m.rotation.y = rotY;
  worldRoot.add(m);
}

// chunky low-poly leaves for the trees outside
const LEAF_MATS = ['#5fae57', '#4b9446', '#7cc26a'].map((c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true }));
// a potted plant in a rounded, glossy cream pot: a tall snake plant, or a soft round bush
const POT_SHAPE = [[0, 0], [0.2, 0], [0.27, 0.06], [0.3, 0.2], [0.29, 0.36], [0.26, 0.44], [0.27, 0.46], [0.23, 0.46]].map(([r, y]) => new THREE.Vector2(r, y));
const POT_GEO = new THREE.LatheGeometry(POT_SHAPE, 24);
const POT_MAT = new THREE.MeshPhongMaterial({ color: '#f6f1e4', shininess: 70, specular: '#ffffff', side: THREE.DoubleSide });
const SOIL_MAT = new THREE.MeshLambertMaterial({ color: '#6b4a32' });
const SNAKE_MATS = ['#3f8f4e', '#4fa35a', '#367f45'].map((c) => new THREE.MeshLambertMaterial({ color: c }));
const BUSH_MATS = ['#6cbf5f', '#5aae52', '#7fcd6c'].map((c) => new THREE.MeshLambertMaterial({ color: c }));
function planter(x, z, size, seed, kind = 'bush') {
  const g = new THREE.Group();
  const pot = mesh(POT_GEO, POT_MAT, { cast: true, receive: true });
  const soil = mesh(new THREE.CircleGeometry(0.24, 20), SOIL_MAT);
  soil.rotation.x = -Math.PI / 2;
  soil.position.y = 0.43;
  g.add(pot, soil);
  const rnd = (k) => {
    const v = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453;
    return v - Math.floor(v);
  };
  if (kind === 'snake') {
    // upright blades, flat and pointed, leaning a little outward
    for (let k = 0; k < 7; k++) {
      const h = 0.75 + rnd(k) * 0.55;
      const blade = mesh(new THREE.ConeGeometry(0.075, h, 4), SNAKE_MATS[k % 3], { cast: true });
      blade.scale.z = 0.3;
      const a = (k / 7) * Math.PI * 2 + rnd(k + 5);
      const d = k === 0 ? 0 : 0.1 + rnd(k + 9) * 0.06;
      blade.position.set(Math.sin(a) * d, 0.43 + h / 2, Math.cos(a) * d);
      blade.rotation.set(Math.cos(a) * 0.12, a, -Math.sin(a) * 0.12);
      g.add(blade);
    }
  } else {
    // a few soft spheres, one big on top, smaller ones around it
    for (let k = 0; k < 5; k++) {
      const r = k === 0 ? 0.3 : 0.18 + rnd(k) * 0.06;
      const ball = mesh(new THREE.SphereGeometry(r, 16, 12), BUSH_MATS[k % 3], { cast: true });
      const a = (k / 4) * Math.PI * 2 + rnd(k + 3);
      const d = k === 0 ? 0 : 0.2;
      ball.position.set(Math.sin(a) * d, k === 0 ? 0.78 : 0.56 + rnd(k + 7) * 0.08, Math.cos(a) * d);
      g.add(ball);
    }
  }
  g.position.set(x, 0, z);
  g.scale.setScalar(size);
  worldRoot.add(g);
}

// the open front: just a welcome mat and a wet-floor sign
function buildEntrance(cx, z) {
  const mat2 = mesh(new THREE.PlaneGeometry(2.8, 1.1), new THREE.MeshLambertMaterial({ map: pixelTex(matCanvas()), polygonOffset: true, polygonOffsetFactor: -1 }), { receive: true });
  mat2.rotation.x = -Math.PI / 2;
  mat2.position.set(cx, 0.006, z - 0.75);
  const wet = pixelSprite(wetSign(), 0.065);
  wet.position.set(cx + 2.9, 0, z - 0.6);
  worldRoot.add(mat2, wet);
}

// ---------- time of day ----------
// The sky and the light follow the visitor's clock: blue sky by day, a pink-orange sunset,
// a starry night with the ceiling lights turned up, and a lilac dawn. ?hour=21 previews an hour.
const lampLights = []; // [light, share of PAL.lampPower]
const DAYTIME = [
  // hour, sky at the top, in the middle, at the horizon, sky light, sun, sun colour, ceiling lights
  [0, '#03060f', '#0a1228', '#18223f', 0.55, 0.3, '#a9b8ff', 2.6],
  [5, '#03060f', '#0a1228', '#18223f', 0.55, 0.3, '#a9b8ff', 2.6],
  [6.3, '#1f3466', '#4f6a9e', '#aab9d2', 0.75, 0.6, '#ffd27a', 1.6],
  [7.5, '#3a6fb4', '#6f9fd2', '#c4d8ea', 0.95, 1.0, '#ffe8c8', 1.1],
  [9, '#2f6fc0', '#5b98da', '#bcd8ee', PAL.hemi[2], PAL.moon[1], PAL.moon[0], 1],
  [16.5, '#2f6fc0', '#5b98da', '#bcd8ee', PAL.hemi[2], PAL.moon[1], PAL.moon[0], 1],
  [18, '#3a5a9a', '#7f9cc4', '#f2b45a', 0.9, 0.9, '#ffb24a', 1.4],
  [18.8, '#24345f', '#5b6f9a', '#e8743a', 0.75, 0.55, '#ff8a3a', 1.9],
  [19.6, '#0f1836', '#2a3a66', '#4a4f72', 0.6, 0.35, '#a9b8ff', 2.4],
  [20.3, '#03060f', '#0a1228', '#18223f', 0.55, 0.3, '#a9b8ff', 2.6],
  [24, '#03060f', '#0a1228', '#18223f', 0.55, 0.3, '#a9b8ff', 2.6],
];
const forcedHour = new URLSearchParams(location.search).get('hour');
function applyTimeOfDay() {
  const now = new Date();
  let h = forcedHour !== null ? Number(forcedHour) : now.getHours() + now.getMinutes() / 60;
  if (OG || !Number.isFinite(h)) h = 12; // the link preview is always a sunny day
  h = ((h % 24) + 24) % 24;
  let k = 0;
  while (DAYTIME[k + 1][0] < h) k++;
  const [h0, ...a] = DAYTIME[k];
  const [h1, ...b] = DAYTIME[k + 1];
  const f = h1 > h0 ? (h - h0) / (h1 - h0) : 0;
  const mix = (x, y) => new THREE.Color(x).lerp(new THREE.Color(y), f);
  skyUniforms.top.value.copy(mix(a[0], b[0]));
  skyUniforms.mid.value.copy(mix(a[1], b[1]));
  skyUniforms.horizon.value.copy(mix(a[2], b[2]));
  scene.background.copy(skyUniforms.horizon.value);
  scene.fog.color.copy(skyUniforms.horizon.value); // far things fade into the same sky
  cloudMat.emissive.copy(skyUniforms.horizon.value).multiplyScalar(0.6); // soft undersides in the sky's own colour
  stars.material.opacity = clamp(h < 12 ? (5.5 - h) / 1 : (h - 19.5) / 1, 0, 1);
  // the sun rises in the east, passes high over the back wall and sets in the west; the moon does the same at night
  const arc = (t, peak) => {
    const el = Math.sin(Math.PI * t) * peak;
    const az = Math.PI * t;
    return new THREE.Vector3(Math.cos(az) * Math.cos(el), Math.sin(el), -Math.sin(az) * Math.cos(el));
  };
  const day = (h - 6) / 12.8;
  if (day > -0.02 && day < 1.02) {
    const dir = arc(clamp(day, 0, 1), 1.05);
    skyUniforms.sunDir.value.copy(dir);
    skyUniforms.sunGlow.value = clamp(dir.y * 6 + 0.4, 0, 1) * (1 + (1 - dir.y) * 0.6); // a bigger glow when low
  } else {
    skyUniforms.sunGlow.value = 0;
  }
  skyUniforms.sunColor.value.copy(mix(a[5], b[5]));
  const nightT = ((h - 19 + 24) % 24) / 11;
  skyUniforms.moonVis.value = nightT < 1 ? clamp(Math.min(nightT, 1 - nightT) * 8, 0, 1) : 0;
  if (nightT < 1) skyUniforms.moonDir.value.copy(arc(nightT, 0.9));
  hemi.intensity = lerp(a[3], b[3], f);
  sun.intensity = lerp(a[4], b[4], f);
  sun.color.copy(mix(a[5], b[5]));
  const lampScale = lerp(a[6], b[6], f);
  for (const [light, share] of lampLights) light.intensity = PAL.lampPower * share * lampScale;
}
setInterval(applyTimeOfDay, 60 * 1000);

// a point in a stall's local space, in world space
function stallWorld(i, lx, ly, lz) {
  const s = stallObjs[i];
  return s ? s.group.localToWorld(new THREE.Vector3(lx, ly, lz)) : new THREE.Vector3();
}

// ---------- stalls ----------

const stallObjs = [];
const stallHits = [];
const wishHits = []; // the golden poop on the back wall and its sign: tapping them opens the wish page

function makeStall(i) {
  const g = new THREE.Group();
  const L = LAYOUT[i];
  g.position.set(toX(L.cx), 0, toZ(L.cy));
  g.rotation.y = L.rot;
  const part = mesh(G.partition, M.part, { cast: true, receive: true });
  part.position.set(0.02, (PART_TOP + PART_BOT) / 2, -STALL_D / 2);
  const cap = mesh(G.cap, M.partTop);
  cap.position.set(0.02, PART_TOP, -STALL_D / 2);
  const post = mesh(G.post, M.part, { cast: true });
  post.position.set(0.035, PART_TOP / 2, 0);

  // door with its own pixel texture
  const doorCanvas = document.createElement('canvas');
  doorCanvas.width = 20;
  doorCanvas.height = 13;
  drawDoorCanvas(doorCanvas, i + 1, 0);
  const doorTex = pixelTex(doorCanvas);
  const face = new THREE.MeshLambertMaterial({ map: doorTex });
  const hinge = new THREE.Group();
  hinge.position.set(0.08, 0, 0);
  const door = mesh(G.door, [M.doorEdge, M.doorEdge, M.doorEdge, M.doorEdge, face, face], { cast: true });
  door.position.set(DOOR_W / 2, (DOOR_TOP + DOOR_BOT) / 2, 0);
  const lock = mesh(G.lock, M.lockGreen);
  lock.position.set(DOOR_W - 0.1, (DOOR_TOP + DOOR_BOT) / 2, 0.025);
  hinge.add(door, lock);

  // the toilet
  const toilet = new THREE.Group();
  toilet.position.set(STALL_M / 2 + 0.02, 0, -1.1);
  const bowl = mesh(G.bowl, M.porcelain, { cast: true });
  bowl.position.y = 0.2;
  const seat = mesh(G.seat, M.porcelain);
  seat.rotation.x = -Math.PI / 2;
  seat.position.y = 0.41;
  const water = mesh(G.water, M.water);
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.4;
  const tank = mesh(G.tank, M.porcelain, { cast: true });
  tank.position.set(0, 0.62, -0.38);
  toilet.add(bowl, seat, water, tank);

  // whoever sits here perches on the seat facing the door; their head shows over the half-door
  const seatSpot = new THREE.Group();
  seatSpot.position.set(STALL_M / 2, SEAT_TOP - HIP_Y, SEAT_Z);
  const feet = pixelSprite(PROPS.poop);
  feet.position.set(STALL_M / 2, 0, -0.12);
  feet.visible = false;
  const marker = pixelSprite(PROPS.marker);
  marker.position.set(STALL_M / 2, 1.6, SEAT_Z);
  marker.visible = false;
  const halo = pixelSprite(PROPS.halo);
  halo.position.set(STALL_M / 2, SEAT_TOP - HIP_Y + HEIGHT + 0.08, SEAT_Z);
  halo.visible = false;

  const pile = new THREE.Group();
  pile.position.set(0.84, PART_TOP + 0.05, 0.02);

  const hit = new THREE.Mesh(G.hit, M.hit);
  hit.position.set(STALL_M / 2, 1, 0.1);
  hit.userData.stall = i;


  g.add(part, cap, post, hinge, toilet, seatSpot, feet, marker, halo, pile, hit);

  // the last stall in a bank has no neighbour closing its right side, so give it its own wall
  const endX = L.cx + Math.cos(L.rot) * STALL_W;
  const endY = L.cy - Math.sin(L.rot) * STALL_W;
  if (!LAYOUT.some((o) => Math.hypot(o.cx - endX, o.cy - endY) < 5)) {
    const endPart = mesh(G.partition, M.part, { cast: true, receive: true });
    endPart.position.set(STALL_M - 0.02, (PART_TOP + PART_BOT) / 2, -STALL_D / 2);
    const endCap = mesh(G.cap, M.partTop);
    endCap.position.set(STALL_M - 0.02, PART_TOP, -STALL_D / 2);
    const endPost = mesh(G.post, M.part, { cast: true });
    endPost.position.set(STALL_M - 0.035, PART_TOP / 2, 0);
    g.add(endPart, endCap, endPost);
  }
  stallRoot.add(g);
  g.updateMatrixWorld(true);
  stallHits[i] = hit;
  return {
    i, group: g, hinge, lock, face, doorCanvas, doorTex, crack: 0, seatSpot, person: null, personFor: '', feet, marker, halo, pile,
    open: 1, shake: 0, gone: 0, regrow: 1, pileShown: -1, pending: 0, squash: 0,
  };
}

function syncStalls() {
  if (!LAYOUT.length) return; // wait for the layout from the server
  if (stalls.length !== stallObjs.length) {
    for (const s of stallObjs) stallRoot.remove(s.group);
    stallObjs.length = 0;
    stallHits.length = 0;
    for (let i = 0; i < stalls.length; i++) stallObjs.push(makeStall(i));
  }
  if (builtFor !== stalls.length) {
    builtFor = stalls.length;
    buildRoom();
  }
  stallObjs.forEach((s, i) => {
    s.lock.material = stalls[i] ? M.lockRed : M.lockGreen;
    const crack = stalls[i] ? (hp[i] < 25 ? 3 : hp[i] < 55 ? 2 : hp[i] < 85 ? 1 : 0) : 0;
    if (crack !== s.crack) {
      s.crack = crack;
      drawDoorCanvas(s.doorCanvas, i + 1, crack);
      s.doorTex.needsUpdate = true;
    }
    if (!s.pending && s.pileShown !== piles[i]) setPile(s, piles[i]);
  });
}

function setPile(s, count) {
  const want = Math.min(count, PILE_MAX);
  if (!count) s.golds = new Set(); // a fresh tower forgets its golden ones
  while (s.pile.children.length > want) s.pile.remove(s.pile.children.at(-1));
  while (s.pile.children.length < want) {
    const k = s.pile.children.length;
    const p = pixelSprite(s.golds?.has(k) ? PROPS.goldPoop : PROPS.poop, 0.035);
    p.position.set((((s.i * 7 + k * 13) % 3) - 1) * 0.02, k * 0.2, 0);
    s.pile.add(p);
  }
  s.pileShown = count;
}

// ---------- characters ----------

function makeWalker(u) {
  const look = lookFor(u);
  const p = makePerson(look);
  const blob = new THREE.Mesh(G.blob, M.blob);
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.01;
  const marker = pixelSprite(PROPS.marker);
  marker.visible = false;
  const halo = pixelSprite(PROPS.halo);
  halo.visible = false;
  charRoot.add(p.group, blob, marker, halo);
  return { data: u, p, blob, marker, halo, look, rx: u.x, ry: u.y, facing: 0, turn: 0, phase: 0, idle: 9, walking: false };
}

function removeWalker(e) {
  charRoot.remove(e.p.group, e.blob, e.marker, e.halo);
  disposePerson(e.p);
}

function exprOf(u, seat) {
  if ((happyUntil.get(u.id) || 0) > Date.now()) return 'bliss';
  if (u.r) return 'dizzy';
  if (seat === -1 && u.pd) return 'shock';
  if (seat === -1) return u.n ? 'relaxed' : 'urgent';
  if (u.p === 0) return u.h ? 'strain' : 'idle';
  if (u.p < 34) return 'strain';
  if (u.p < 67) return 'neutral';
  return 'ok';
}

// ---------- connection ----------

// When the server can't be reached for a few seconds, say so plainly and keep retrying (a little
// slower each time); the notice goes away by itself as soon as we're back in.
let retries = 0;
let downTimer = 0;
const serverDown = (on) => {
  clearTimeout(downTimer);
  $('#down').hidden = !on;
};
function connect() {
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  ws.onmessage = (e) => handle(JSON.parse(e.data));
  clearTimeout(downTimer);
  downTimer = setTimeout(() => serverDown(true), retries ? 3000 : 8000); // the first visit may be waking the server
  ws.onclose = () => {
    setHold(false);
    $('#online').textContent = '물 내리는 중...';
    retries++;
    setTimeout(connect, Math.min(1500 * retries, 6000));
  };
}

function send(msg) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
}

let greeted = false;
let roomNo = 1;
function handle(m) {
  if (m.t === 'welcome') {
    meId = m.you;
    roomNo = m.no || 1;
    retries = 0;
    serverDown(false);
    if (m.layout) {
      LAYOUT = m.layout.stalls;
      ROOM_W = m.layout.w;
      ROOM_D = m.layout.d;
      BASIN = m.layout.basin;
      builtFor = 0;
      for (const st of stallObjs) stallRoot.remove(st.group);
      stallObjs.length = 0;
      stallHits.length = 0;
    }
    for (const e of users.values()) removeWalker(e);
    users.clear();
    for (const f of floats) f.el.remove();
    floats.length = 0;
    me.ready = false;
    me.s = -1;
    if (m.notice) toast(m.notice);
    else if (!greeted) toast('어서 오세요. 빈 칸에 앉아 편하게 볼일 보세요');
    greeted = true;
  } else if (m.t === 'state') {
    applyState(m);
    $('#loading').classList.add('done');
  } else if (m.t === 'chat') {
    floatChat(m.id, m.text);
  } else if (m.t === 'toast') {
    if (m.direct) toast(m.text);
  } else if (m.t === 'poop') {
    onPoop(m);
  } else if (m.t === 'knock') {
    onKnock(m);
  } else if (m.t === 'break') {
    onBreak(m);
  } else if (m.t === 'turn') {
    toast(`내 차례예요! ${m.stall + 1}번 칸으로 모실게요`);
    walkToStall(m.stall);
    playDing();
  } else if (m.t === 'bell') {
    onBell(m);
  } else if (m.t === 'flush') {
    const h = headOf(m.id);
    if (h) pop(h, '쏴아~');
    if (m.id === meId) playFlush(); // only your own flush makes a sound
  } else if (m.t === 'jump') {
    const e = users.get(m.id);
    if (e) e.jumpT = 0.001;
  } else if (m.t === 'wash') {
    onWash(m);
  } else if (m.t === 'full') {
    toast('화장실이 꽉 찼어요. 잠깐 뒤에 다시 와 주세요');
  }
}

let lastFlushed = -1;
function applyState(st) {
  // everyone in this restroom, and how many stalls are in use right now
  $('#online').innerHTML = `${roomNo > 1 ? `${roomNo}호<span class="unit">점 ·</span> ` : ''}${st.users.length}<span class="unit">명</span>`; // units hide on phones
  $('#busy').innerHTML = `${st.stalls.filter(Boolean).length}<span class="cap">/${st.stalls.length}</span><span class="unit">칸</span>`;
  if (st.flushed !== lastFlushed) {
    const el = $('#todayCount');
    el.textContent = st.flushed.toLocaleString('ko-KR');
    if (lastFlushed >= 0) {
      el.classList.remove('bump');
      void el.offsetWidth;
      el.classList.add('bump');
    }
    lastFlushed = st.flushed;
  }
  stalls = st.stalls;
  piles = st.piles;
  hp = st.hp;
  held = st.held;

  const seen = new Set();
  for (const u of st.users) {
    seen.add(u.id);
    let e = users.get(u.id);
    if (!e) {
      e = makeWalker(u);
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
      document.body.classList.toggle('seated', me.s !== -1);
      me.p = u.p;
      me.rolling = Boolean(u.r);
      me.pd = Boolean(u.pd);
      me.q = u.q;
      me.b = Boolean(u.b);
      if (u.r) {
        me.x = u.x;
        me.y = u.y;
        target = null;
        pendingEnter = -1;
      }
      const qEl = $('#queue');
      qEl.hidden = !u.q;
      if (u.q) qEl.textContent = u.q === 1 ? '줄 맨 앞 · 곧 내 차례예요' : `줄 서는 중 · ${u.q}번째`;
    }
  }
  for (const [id, e] of users) {
    if (!seen.has(id)) {
      removeWalker(e);
      users.delete(id);
    }
  }
  syncStalls();
  renderActions();
}

// ---------- movement ----------

const freeFor = (i) => !stalls[i] && (!held[i] || held[i] === meId);

function nearestStall(x, y, ok, range = ENTER_RANGE) {
  let best = -1;
  let bestD = Infinity;
  LAYOUT.forEach((L, i) => {
    const d = Math.hypot(L.x - x, L.y - y);
    if (i < stalls.length && ok(i) && d <= range && d < bestD) {
      best = i;
      bestD = d;
    }
  });
  return best;
}
const nearestEmptyStall = (x, y, range) => nearestStall(x, y, freeFor, range);
const nearestOccupiedStall = (x, y) => nearestStall(x, y, (i) => stalls[i] && stalls[i] !== meId);

function closestAnywhere(ok) {
  return nearestStall(me.x, me.y, ok, Infinity);
}

function walkToStall(i) {
  target = { x: LAYOUT[i].x, y: LAYOUT[i].y };
  pendingEnter = i;
  showTapMark(toX(target.x), toZ(target.y));
}

function tryEnter(i) {
  if (i < 0 || !freeFor(i)) return;
  sendMove(true);
  send({ t: 'enter', stall: i });
}

// how far a door has gone: 0 fine, 1 rattling, 2 cracking, 3 about to give (same steps as the cracks drawn on it)
const knockStage = (h) => (h < 25 ? 3 : h < 55 ? 2 : h < 85 ? 1 : 0);
const KNOCK_LABELS = ['똑똑, 계세요?', '쾅쾅! 빨리 나와요', '문이 흔들려요 · 쾅!', '문 부수기!'];
const KNOCK_POPS = ['똑똑', '쾅쾅', '쾅!!', '우지끈'];

function tryKnock(i) {
  if (i < 0) return;
  sendMove(true);
  send({ t: 'knock', stall: i });
}

const ringBell = () => send({ t: 'bell' });
const jump = () => me.s === -1 && !me.rolling && send({ t: 'jump' });
// the wash island: a long counter down the middle with four sinks along each long side
const SINK_ROWS = [-0.75, -0.25, 0.25, 0.75];
function nearestSink(x, y) {
  const side = x < BASIN.x ? -1 : 1;
  const row = SINK_ROWS.reduce((best, r) => (Math.abs(BASIN.y + BASIN.d * r - y) < Math.abs(BASIN.y + BASIN.d * best - y) ? r : best));
  return { side, x: BASIN.x + side * BASIN.w, y: BASIN.y + BASIN.d * row }; // the counter's edge in front of that sink
}
const islandGap = (x, y) => Math.hypot(Math.max(Math.abs(x - BASIN.x) - BASIN.w, 0), Math.max(Math.abs(y - BASIN.y) - BASIN.d, 0));

// step up to the nearest sink, then wash
function washHands() {
  const sink = nearestSink(me.x, me.y);
  const spot = { x: sink.x + sink.side * 60, y: sink.y }; // just outside the 55 everyone keeps from the counter
  if (Math.hypot(spot.x - me.x, spot.y - me.y) < 8) {
    sendMove(true);
    send({ t: 'wash' });
    return;
  }
  target = spot;
  pendingEnter = -1;
  pendingBench = false;
  pendingWash = true;
}

function nearSink() {
  return islandGap(me.x, me.y) < 110;
}

function nearBench() {
  return benchSpots.findIndex((b) => Math.hypot(me.x - b.x, me.y - b.y) < 110);
}

// the closest seat on that bench nobody is sitting on yet
function freeSeat(k) {
  const taken = (seat) => [...users.entries()].some(([id, e]) => id !== meId && e.data.b && Math.hypot(e.data.x - seat.x, e.data.y - seat.y) < 35);
  const free = (benchSeats[k] || []).filter((seat) => !taken(seat));
  free.sort((a, b) => Math.hypot(me.x - a.x, me.y - a.y) - Math.hypot(me.x - b.x, me.y - b.y));
  return free[0] || null;
}

function goSitOnBench(k) {
  const seat = freeSeat(k);
  if (!seat) {
    toast('이 벤치는 자리가 꽉 찼어요');
    return;
  }
  target = { x: seat.x, y: seat.y };
  pendingEnter = -1;
  pendingBench = true;
}

// flush: your poop tower is cleared and you stay seated
function flush() {
  if (me.s === -1) return;
  send({ t: 'flush' });
}

function exitStall() {
  setHold(false);
  send({ t: 'exit' });
}

function moveMe(dt) {
  if (me.rolling) return;
  // keys move relative to where the camera looks
  let ix = 0;
  let iz = 0;
  if (keys.has('ArrowLeft') || keys.has('KeyA')) ix -= 1;
  if (keys.has('ArrowRight') || keys.has('KeyD')) ix += 1;
  if (keys.has('ArrowUp') || keys.has('KeyW')) iz += 1;
  if (keys.has('ArrowDown') || keys.has('KeyS')) iz -= 1;
  let joyRun = false;
  if (!ix && !iz && Math.hypot(joy.x, joy.y) > 0.2) {
    // the on-screen stick: push it, walk; push it all the way, run
    ix = joy.x;
    iz = -joy.y;
    joyRun = Math.hypot(joy.x, joy.y) > 0.85;
  }
  let vx = 0;
  let vy = 0;
  if (ix || iz) {
    vx = Math.cos(cam.yaw) * ix - Math.sin(cam.yaw) * iz;
    vy = -Math.sin(cam.yaw) * ix - Math.cos(cam.yaw) * iz;
  }
  // arrows + Space, or a double-tapped destination
  const running = !me.pd && (ix || iz ? spaceHeld || joyRun : Boolean(target?.run));
  me.running = running;
  let step = SPEED * (me.pd ? 0.45 : running ? 2 : 1) * dt;
  if (vx || vy) {
    target = null;
    pendingEnter = -1;
    pendingBench = false;
    pendingWash = false;
  } else if (target) {
    const dx = target.x - me.x;
    const dy = target.y - me.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 2) {
      target = null;
      if (pendingEnter >= 0) tryEnter(pendingEnter);
      pendingEnter = -1;
      if (pendingBench) {
        sendMove(true);
        send({ t: 'bench', on: true });
        pendingBench = false;
      }
      if (pendingWash) {
        sendMove(true);
        send({ t: 'wash' });
        pendingWash = false;
      }
    } else {
      vx = dx / dist;
      vy = dy / dist;
      step = Math.min(step, dist);
    }
  }
  if (vx || vy) {
    const len = Math.hypot(vx, vy);
    walkDir = { x: vx / len, y: vy / len, at: performance.now() }; // the camera follows this
    me.x = clamp(me.x + (vx / len) * step, 45, ROOM_W - 45);
    me.y = clamp(me.y + (vy / len) * step, 45, ROOM_D - 40);
    // walk around the wash island, not through it: step out along the shallower side
    const ex = BASIN.w + 55; // a sprite is about 0.8m wide, so keep half of that plus a little clear of the counter
    const ey = BASIN.d + 55;
    const bdx = me.x - BASIN.x;
    const bdy = me.y - BASIN.y;
    if (Math.abs(bdx) < ex && Math.abs(bdy) < ey) {
      if (ex - Math.abs(bdx) < ey - Math.abs(bdy)) me.x = BASIN.x + Math.sign(bdx || 1) * ex;
      else me.y = BASIN.y + Math.sign(bdy || 1) * ey;
    }
  }
  sendMove(false);
}

function sendMove(force) {
  const now = performance.now();
  const changed = Math.abs(me.x - lastSent.x) > 0.5 || Math.abs(me.y - lastSent.y) > 0.5;
  if (!changed || (!force && now - lastSent.t < 80)) return;
  send({ t: 'move', x: Math.round(me.x), y: Math.round(me.y), d: 1 });
  lastSent = { x: me.x, y: me.y, t: now };
}

// ---------- camera: drag to look around, wheel/pinch to zoom ----------

// starts low and far back, looking in through the entrance at the whole plaza
const cam = { yaw: 0, pitch: 0.22, dist: 16, tYaw: 0, tPitch: 0.22, tDist: 16, fx: 11, fz: 20, look: 0, tLook: 0 }; // look: tilting the view up at the sky
// link-preview frames (?og, ?og=plaza, ?og=stalls, ?og=above, ?og=bench, ?og=inside): where the camera looks and from where
const OG_VIEWS = {
  entrance: { fx: 11, fz: 20.8, yaw: 0, pitch: 0.22, dist: 16 },
  plaza: { fx: 10, fz: 9.5, yaw: 0.6, pitch: 0.5, dist: 13 },
  stalls: { fx: 14, fz: 3.5, yaw: -0.4, pitch: 0.4, dist: 10.5 },
  above: { fx: 11, fz: 10.5, yaw: 0.35, pitch: 0.92, dist: 25 },
  bench: { fx: 11, fz: 13.5, yaw: 0.25, pitch: 0.36, dist: 9.5 },
  inside: { fx: 11, fz: 20.5, yaw: Math.PI, pitch: 0.55, dist: 17 }, // from inside, looking out at the way in
};
const OG_VIEW = OG ? OG_VIEWS[new URLSearchParams(location.search).get('og')] || OG_VIEWS.entrance : null;
if (OG_VIEW) Object.assign(cam, { yaw: OG_VIEW.yaw, tYaw: OG_VIEW.yaw, pitch: OG_VIEW.pitch, tPitch: OG_VIEW.pitch, dist: OG_VIEW.dist, tDist: OG_VIEW.dist });
const DIST_MIN = 3.5;
const YAW_MAX = 1000; // free rotation; the camera is kept inside the room instead
const DIST_MAX = 26;

// pooping, washing or sitting turns the camera around to face me, and puts it back afterwards
let focusKey = '';
let camBefore = null;
let washFocusUntil = 0;
function focusCamera() {
  const mx = toX(me.x);
  const mz = toZ(me.y);
  const bx = toX(BASIN.x);
  const bz = toZ(BASIN.y);
  let key = '';
  let yaw = 0;
  let pitch = 0.45;
  if (me.s !== -1 && LAYOUT[me.s]) {
    key = `stall${me.s}`;
    yaw = LAYOUT[me.s].rot; // straight in front of the door
    pitch = 0.4;
  } else if (performance.now() < washFocusUntil) {
    key = 'wash';
    // from the side, so you see the hands under the tap; pick whichever side is closer to the current view
    const sink = nearestSink(me.x, me.y);
    const toBasin = Math.atan2(toX(sink.x) - mx, toZ(sink.y) - mz);
    const side = (y) => Math.abs(Math.atan2(Math.sin(y - cam.tYaw), Math.cos(y - cam.tYaw)));
    yaw = side(toBasin + Math.PI / 2) < side(toBasin - Math.PI / 2) ? toBasin + Math.PI / 2 : toBasin - Math.PI / 2;
    pitch = 0.4;
  } else if (me.b) {
    key = 'bench';
    yaw = Math.atan2(mx - bx, mz - bz); // from the plaza, looking back at the basin
  }
  if (key === focusKey) return;
  if (!focusKey && key) camBefore = { yaw: cam.tYaw, pitch: cam.tPitch, dist: cam.tDist };
  focusKey = key;
  if (key) {
    cam.tYaw = yaw + Math.PI * 2 * Math.round((cam.tYaw - yaw) / (Math.PI * 2)); // the short way round
    cam.tPitch = pitch;
    cam.tLook = 0;
    // far enough back that about four stalls fit across the screen, so the neighbours show on a phone too
    const halfW = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect;
    cam.tDist = clamp(Math.max(8, 4.4 / (2 * halfW)), DIST_MIN, 16);
  } else if (camBefore) {
    cam.tYaw = camBefore.yaw;
    cam.tPitch = camBefore.pitch;
    cam.tDist = camBefore.dist;
    camBefore = null;
  }
}

// while you walk, the camera swings round behind you so you look where you are going.
// Walking back toward the camera doesn't spin it round, and turning it by hand pauses this for a bit.
let walkDir = { x: 0, y: 0, at: 0 };
let manualCamAt = 0;
let walkedYet = false;
// back to the usual view of me: from the room side, a little above, at a comfortable distance
function recenterCam() {
  cam.tYaw = Math.PI * 2 * Math.round(cam.tYaw / (Math.PI * 2)); // yaw 0, the short way round
  cam.tPitch = 0.4;
  cam.tLook = 0;
  cam.tDist = 9;
  manualCamAt = 0;
  focusKey = ''; // sitting or washing: let the focus view take over again from here
}

function followWalk(dt) {
  const now = performance.now();
  if (focusKey || me.s !== -1 || now - walkDir.at > 120 || now - manualCamAt < 5000) return;
  if (!walkedYet) {
    // the wide welcome view closes in behind you once you start walking
    walkedYet = true;
    if (cam.tDist > 10) cam.tDist = 9;
    cam.tPitch = Math.max(cam.tPitch, 0.35);
  }
  cam.tLook = 0; // walking off again brings the eyes back down from the sky
  const fx = -Math.sin(cam.tYaw);
  const fy = -Math.cos(cam.tYaw);
  if (walkDir.x * fx + walkDir.y * fy < -0.3) return;
  const behind = Math.atan2(-walkDir.x, -walkDir.y);
  cam.tYaw = lerpAngle(cam.tYaw, behind, 1 - Math.exp(-dt * 2.2));
}

function updateCamera(dt) {
  if (me.ready && BASIN) focusCamera();
  if (me.ready) followWalk(dt);
  if (me.s !== -1 && LAYOUT[me.s]) {
    // in a stall the camera only swings around the front, never behind it
    const off = cam.tYaw - LAYOUT[me.s].rot;
    const rel = Math.atan2(Math.sin(off), Math.cos(off));
    cam.tYaw -= rel - clamp(rel, -1.1, 1.1);
  }
  const k = 1 - Math.exp(-dt * 7);
  cam.yaw = lerpAngle(cam.yaw, cam.tYaw, k);
  let fx = OG_VIEW ? OG_VIEW.fx : toX(me.x); // a preview frame holds its own spot
  let fz = OG_VIEW ? OG_VIEW.fz : toZ(me.y);
  if (me.s !== -1) {
    const door = stallWorld(me.s, STALL_M / 2, 0, 0.3);
    fx = door.x;
    fz = door.z;
  }
  const kf = 1 - Math.exp(-dt * 5);
  cam.fx = lerp(cam.fx, fx, kf);
  cam.fz = lerp(cam.fz, fz, kf);
  // always stay in front of the stall banks, so you never see the stalls (or anyone in them) from behind.
  // Near a wall the camera first tilts up to look down from above, and only comes closer if it still
  // doesn't fit; both glide there instead of jumping.
  const rw = toX(ROOM_W);
  const sy = Math.sin(cam.yaw);
  const cy = Math.cos(cam.yaw);
  const m = 0.3;
  let room = Infinity; // how far back the camera can go, measured along the floor
  if (sy < -1e-3) room = Math.min(room, (cam.fx - m) / -sy);
  if (sy > 1e-3) room = Math.min(room, (rw - m - cam.fx) / sy);
  if (cy < -1e-3) room = Math.min(room, (cam.fz - m) / -cy);
  room = Math.max(0.3, room);
  // backed up against a wall: rather than squeezing in close, swing round to the open side of the room
  if (me.s === -1 && !focusKey && performance.now() - manualCamAt > 5000 && room < Math.min(cam.tDist, 10) * 0.55) {
    const toOpen = Math.atan2(rw / 2 - cam.fx, toZ(ROOM_D) / 2 - cam.fz);
    cam.tYaw = lerpAngle(cam.tYaw, toOpen, 1 - Math.exp(-dt * 1.6));
  }
  const wantPitch = Math.min(0.95, Math.max(cam.tPitch, Math.acos(Math.min(1, room / cam.tDist)))); // never a straight-down ceiling view
  const wantDist = Math.max(DIST_MIN, Math.min(cam.tDist, room / Math.cos(wantPitch))); // never closer than the zoom limit
  cam.pitch = lerp(cam.pitch, wantPitch, k);
  cam.dist = lerp(cam.dist, wantDist, k);
  cam.look = lerp(cam.look, cam.tLook, k);
  const cp = Math.cos(cam.pitch);
  const px = clamp(cam.fx + sy * cp * cam.dist, m, rw - m);
  const py = 0.9 + Math.sin(cam.pitch) * cam.dist;
  const pz = Math.max(cam.fz + cy * cp * cam.dist, m);
  camera.position.set(px, py, pz);
  // the camera stays where it is and only raises its eyes, so looking at the sky never moves it:
  // the gaze tilts up from the usual downward angle by exactly cam.look
  const elev = Math.atan2(0.9 - py, Math.hypot(px - cam.fx, pz - cam.fz)) + cam.look;
  camera.lookAt(px - sy * Math.cos(elev), py + Math.sin(elev), pz - cy * Math.cos(elev));
  // while typing, the keyboard covers the bottom of the screen: slide the picture up so you
  // sit in the middle of what is still visible, between the top bar and the chat box
  // Measured from the real positions of the top bar, the chat box and the canvas, because phones
  // handle the keyboard differently (iPhones shrink and scroll the page, others just cover it).
  let want = 0;
  if (document.body.classList.contains('typing')) {
    const top = $('.top').getBoundingClientRect().bottom + 30;
    const bottom = $('#chatBox').getBoundingClientRect().top - 10;
    const c = canvasEl.getBoundingClientRect();
    if (bottom > top && c.height > 0) want = (c.top + c.height / 2 - (top + bottom) / 2) * (H / c.height);
  }
  cam.shift = lerp(cam.shift || 0, want, k);
  if (Math.abs(cam.shift) > 0.5) camera.setViewOffset(W, H, 0, cam.shift, W, H);
  else if (camera.view?.enabled) camera.clearViewOffset();
  sun.position.set(cam.fx - 6, 12, cam.fz + 9);
  sun.target.position.set(cam.fx, 0, cam.fz - 1);
}

// ---------- per-frame placement ----------

// head-top markers float "up" on screen, not straight up in the world, so looking down from above
// they still sit over the head instead of landing on the face
const camUp = new THREE.Vector3();
function overHead(obj, x, baseY, z, h) {
  obj.position.set(x, baseY, z).addScaledVector(camUp, h);
}

// people on benches face out, away from the wash island
const benchFacing = (x) => (x < BASIN.x ? -Math.PI / 2 : Math.PI / 2);

function placeWalkers(dt, t) {
  camUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
  const sec = t / 1000;
  for (const [id, e] of users) {
    const u = e.data;
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
    const inStall = seat !== -1;
    const p = e.p;
    p.group.visible = !inStall;
    e.blob.visible = !inStall;
    e.marker.visible = mine && !inStall;
    if (inStall) {
      e.halo.visible = false;
      continue;
    }
    const dx = e.rx - px;
    const dz = e.ry - py;
    e.walking = Math.hypot(dx, dz) > 0.3;
    if (e.walking) {
      e.idle = 0;
      e.phase += dt * (Math.hypot(dx, dz) > 6 ? 14 : 8); // legs move faster when running
      e.facing = Math.atan2(dx, dz);
    } else {
      e.idle += dt;
    }
    const rolling = mine ? me.rolling : Boolean(u.r);
    const pantsDown = Boolean(u.pd) || rolling;
    const face = rolling ? 'dizzy' : exprOf(u, -1);
    const X = toX(e.rx);
    const Z = toZ(e.ry);
    let lift = 0;
    if (e.jumpT > 0) {
      e.jumpT += dt;
      lift = Math.sin(Math.PI * Math.min(1, e.jumpT / 0.45)) * 0.45;
      if (e.jumpT >= 0.45) e.jumpT = 0;
    }
    const washing = (e.washUntil || 0) > performance.now();
    const benched = u.b && !rolling;

    // turn to where you walk; at the sink face the sink; standing still a while, turn to the camera
    let want = e.facing;
    if (washing) {
      const sink = nearestSink(e.rx, e.ry);
      want = Math.atan2(sink.x - e.rx, sink.y - e.ry);
    } else if (benched) want = benchFacing(e.rx);
    else if (!e.walking && e.idle > 1.5) want = cam.yaw;
    e.turn = lerpAngle(e.turn, want, Math.min(1, dt * (e.walking ? 12 : 4)));

    setFace(p, face);
    setPantsDown(p, pantsDown);
    p.group.rotation.y = e.turn;
    e.blob.position.set(X, 0.01, Z);
    const bob = (Math.floor(t / 300) % 2) * 0.04;
    if (benched) {
      pose(p, { mode: 'sit', t: sec, seed: id });
      p.group.position.set(X, BENCH_TOP - HIP_Y + lift, Z);
      e.halo.visible = false;
      overHead(e.marker, X, BENCH_TOP - HIP_Y + lift, Z, HEIGHT + 0.2 + bob);
      continue;
    }
    const mode = rolling ? 'roll' : lift > 0 ? 'jump' : washing ? 'wash' : e.walking ? 'walk' : 'stand';
    pose(p, { mode, phase: e.phase, t: sec, seed: id });
    p.group.position.set(X, lift, Z);
    e.halo.visible = face === 'bliss' && !rolling;
    overHead(e.halo, X, lift, Z, HEIGHT + 0.08);
    overHead(e.marker, X, lift, Z, HEIGHT + 0.22 + bob);
  }
}

let hoverStall = -1;
function animateStalls(dt, t) {
  stallObjs.forEach((s, i) => {
    const occId = stalls[i];
    s.open = lerp(s.open, occId ? 0 : 1, Math.min(1, dt * 8));
    let rot = s.open * 1.3;
    if (s.shake > 0) {
      s.shake -= dt;
      rot += (Math.floor(t / 40) % 2 ? 1 : -1) * 0.04;
    }
    s.hinge.rotation.y = rot;
    if (s.gone > 0) {
      s.gone -= dt;
      s.hinge.visible = false;
      if (s.gone <= 0) {
        s.hinge.visible = true;
        s.regrow = 0;
      }
    } else if (s.regrow < 1) {
      s.regrow = Math.min(1, s.regrow + dt * 3);
      s.hinge.scale.set(1, Math.max(0.01, s.regrow), 1);
    }
    // gentle highlight under the mouse
    s.face.emissive.set(i === hoverStall ? '#5a4a20' : '#000000');

    const occ = occId ? users.get(occId) : null;
    s.feet.visible = false;
    s.marker.visible = occId === meId;
    // the sitter: a 3D person with pants down, made for whoever is in here now
    const key = occ ? `${occId}|${occ.look.key}` : '';
    if (key !== s.personFor) {
      if (s.person) {
        s.seatSpot.remove(s.person.group);
        disposePerson(s.person);
        s.person = null;
      }
      if (occ) {
        s.person = makePerson(occ.look);
        setPantsDown(s.person, true);
        s.seatSpot.add(s.person.group);
      }
      s.personFor = key;
    }
    if (occ) {
      const u = occ.data;
      const face = exprOf(u, i);
      setFace(s.person, face);
      pose(s.person, { mode: 'sit', t: t / 1000, strain: Boolean(u.h), seed: i });
      s.person.group.position.x = u.h && Math.floor(t / 70) % 2 ? 0.015 : 0;
      s.halo.visible = face === 'bliss';
      s.marker.position.y = 1.6 + (Math.floor(t / 300) % 2) * 0.04;
    } else {
      s.halo.visible = false;
    }
    if (s.squash > 0 && s.pile.children.length) {
      s.squash -= dt;
      const top = s.pile.children.at(-1);
      const q = Math.sin(s.squash * 20) * 0.15 * (s.squash / 0.3);
      top.scale.set(PROPS.poop.width * 0.035 * (1 + q), PROPS.poop.height * 0.035 * (1 - q), 1);
    }
  });
}

// ---------- effects ----------

const flights = [];
const debris = [];
const notes = [];

function onPoop(m) {
  happyUntil.set(m.id, Date.now() + 1600);
  const s = stallObjs[m.stall];
  if (s) {
    s.pending++;
    const k = Math.min(m.pile, PILE_MAX) - 1;
    if (m.gold) (s.golds ||= new Set()).add(k);
    const from = stallWorld(m.stall, STALL_M / 2, 0.6, -1.0);
    const to = stallWorld(m.stall, 0.84, PART_TOP + 0.05 + k * 0.2, 0.02);
    const p = pixelSprite(m.gold ? PROPS.goldPoop : PROPS.poop, m.gold ? 0.05 : 0.035);
    p.position.copy(from);
    fxRoot.add(p);
    flights.push({ p, from, to, t: 0, s, gold: m.gold });
    const mine = m.id === meId;
    const text = m.gold ? (mine ? '황금똥!! 대박' : '황금똥!') : mine ? `퐁당! 오늘 ${m.n}번째` : '퐁당';
    pop(to.clone().add(new THREE.Vector3(0, 0.45, 0)), text);
    if (m.gold) sparkle(from);
  }
  if (m.gold) {
    floatGold();
    if (m.id === meId) {
      playDing();
      toast('황금똥이 나왔어요! 오늘은 운수 좋은 날');
    }
  }
  if (m.id === meId) {
    flashUntil = performance.now() + 1300;
    buzz([30, 40, 90]);
  }
  if (m.id === meId) plop(1); // only your own poop makes a sound; a room of dozens would be a racket
}

const lastKnockPop = new Map();

function onKnock(m) {
  const s = stallObjs[m.stall];
  if (!s) return;
  const stage = knockStage(m.hp ?? 100);
  const cracked = stage > (s.knockStage ?? 0);
  s.knockStage = stage;
  s.shake = 0.2 + stage * 0.08;
  const now = performance.now();
  const at = stallWorld(m.stall, STALL_M / 2 + (Math.random() - 0.5) * 0.4, 1.2, 0.2);
  if (cracked) pop(at, '쩌적!');
  else if (now - (lastKnockPop.get(m.stall) || 0) > 500) {
    lastKnockPop.set(m.stall, now);
    pop(at, KNOCK_POPS[stage]);
  }
  const mine = stalls[m.stall] === meId;
  if (!mine && m.by !== meId) return; // you only hear knocks on your door, or your own
  const vol = mine ? 0.5 : 0.35;
  playKnock(vol, stage);
  if (cracked) {
    playCrack(vol * 1.2);
    buzz([20, 30, 40]);
  }
}

function onBreak(m) {
  const s = stallObjs[m.stall];
  const L = LAYOUT[m.stall];
  if (s && L) {
    s.gone = 1.2;
    s.open = 0;
    // the door flies out of the stall into the plaza
    const out = (speed, side) => new THREE.Vector3(L.fx * speed + L.fy * side, 0, L.fy * speed - L.fx * side);
    const door = mesh(G.door, [M.doorEdge, M.doorEdge, M.doorEdge, M.doorEdge, s.face, s.face], { cast: true });
    door.position.copy(stallWorld(m.stall, 0.08 + DOOR_W / 2, (DOOR_TOP + DOOR_BOT) / 2, 0.05));
    door.rotation.y = L.rot;
    fxRoot.add(door);
    debris.push({ o: door, v: out(3.4, (Math.random() - 0.5) * 1.5).setY(3), w: new THREE.Vector3(-5, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 4), life: 3.2, door: true });
    for (let k = 0; k < 12; k++) {
      const chip = mesh(G.chip, M.doorEdge);
      chip.position.copy(stallWorld(m.stall, 0.1 + Math.random() * 0.9, DOOR_BOT + Math.random() * (DOOR_TOP - DOOR_BOT), 0.05));
      fxRoot.add(chip);
      debris.push({ o: chip, v: out(1 + Math.random() * 2.5, (Math.random() - 0.5) * 3).setY(1 + Math.random() * 3), w: new THREE.Vector3(Math.random() * 10, Math.random() * 10, Math.random() * 10), life: 1.3 });
    }
  }
  pop(stallWorld(m.stall, STALL_M / 2, 1.9, 0.1), '와장창!');
  if (m.victim === meId) toast('문이 부서졌어요! 바지부터 올리는 중...');
  if (m.by === meId) toast('문을 열고(?) 들어왔어요. 미안해요~');
  if (m.victim === meId || m.by === meId) playCrash(0.6);
}

function onBell(m) {
  if (!document.hidden && stallObjs[m.stall]) {
    pop(stallWorld(m.stall, STALL_M / 2, 2.3, -0.4), '♪ 에티켓벨');
    for (let k = 0; k < 4; k++) {
      const n = pixelSprite(PROPS.note, 0.04);
      n.position.copy(stallWorld(m.stall, 0.3 + Math.random() * 0.5, 1.9, -0.4));
      n.visible = false;
      fxRoot.add(n);
      notes.push({ n, t: -k * 0.6, sway: Math.random() * 0.3, x: n.position.x });
    }
  }
  if (m.id === meId) playSound('bird', 1.6); // others' bells show their notes but stay quiet
}

const washFx = [];
const streamGeo = new THREE.CylinderGeometry(0.03, 0.05, 1, 6);

function onWash(m) {
  const e = users.get(m.id);
  if (!e) return;
  e.washUntil = performance.now() + 2200;
  if (m.id === meId) washFocusUntil = performance.now() + 2600;
  const ux = toX(e.rx);
  const uz = toZ(e.ry);
  const sink = nearestSink(e.rx, e.ry);
  const tapX = toX(sink.x) - sink.side * 0.3; // the tap over that sink
  const tapZ = toZ(sink.y);
  const hands = new THREE.Vector3(ux - sink.side * 0.35, 0.95, uz);
  pop(hands.clone().add(new THREE.Vector3(0, 0.45, 0)), '뽀득뽀득');
  if (!document.hidden) {
    // a stream of water from the tap toward this person's hands
    const top = 1.68;
    const bottom = 0.88;
    const stream = new THREE.Mesh(streamGeo, new THREE.MeshBasicMaterial({ color: '#9fe0ff', transparent: true, opacity: 0.8 }));
    stream.position.set(tapX, (top + bottom) / 2, tapZ);
    stream.scale.y = top - bottom;
    fxRoot.add(stream);
    washFx.push({ o: stream, t: 0, life: 2.2, kind: 'stream' });
    // soap bubbles floating up from the hands
    for (let k = 0; k < 12; k++) {
      const b = new THREE.Sprite(new THREE.SpriteMaterial({ map: texOf(PROPS.bubble), transparent: true }));
      const size = 0.08 + Math.random() * 0.1;
      b.scale.set(size, size, 1);
      b.position.set(hands.x + (Math.random() - 0.5) * 0.3, hands.y + Math.random() * 0.1, hands.z + (Math.random() - 0.5) * 0.3);
      fxRoot.add(b);
      washFx.push({ o: b, t: -k * 0.12, life: 1.6 + Math.random() * 0.8, kind: 'bubble', vx: (Math.random() - 0.5) * 0.25, vz: (Math.random() - 0.5) * 0.25, vy: 0.25 + Math.random() * 0.3, seed: Math.random() * 6 });
    }
    // little splashes on the water
    for (let k = 0; k < 6; k++) {
      const d = new THREE.Sprite(new THREE.SpriteMaterial({ map: texOf(PROPS.drop), transparent: true }));
      d.scale.set(0.06, 0.06, 1);
      d.position.set(tapX, 0.9, tapZ);
      fxRoot.add(d);
      washFx.push({ o: d, t: -k * 0.25, life: 0.6, kind: 'drop', vx: (Math.random() - 0.5) * 0.8, vz: (Math.random() - 0.5) * 0.8, vy: 1 + Math.random() * 0.8 });
    }
  }
  if (m.id === meId) playWash(0.5);
  if (m.id === meId) setTimeout(() => toast('손 씻기 끝! 뽀송뽀송해졌어요'), 1800);
}

// twinkling stars that float up, for golden moments
function sparkle(at) {
  if (document.hidden) return;
  for (let k = 0; k < 14; k++) {
    const b = new THREE.Sprite(new THREE.SpriteMaterial({ map: texOf(PROPS.sparkle), transparent: true }));
    const size = 0.1 + Math.random() * 0.12;
    b.scale.set(size, size, 1);
    b.position.set(at.x + (Math.random() - 0.5) * 0.6, at.y + Math.random() * 0.3, at.z + (Math.random() - 0.5) * 0.6);
    fxRoot.add(b);
    washFx.push({ o: b, t: -k * 0.05, life: 1.2 + Math.random() * 0.6, kind: 'bubble', vx: (Math.random() - 0.5) * 0.5, vz: (Math.random() - 0.5) * 0.5, vy: 0.5 + Math.random() * 0.5, seed: Math.random() * 6 });
  }
}

// a golden poop drifts across the top of the screen whenever anyone makes one
let goldSrc = '';
function floatGold() {
  if (document.hidden || document.querySelectorAll('.gold-float').length > 8) return;
  goldSrc ||= PROPS.goldPoop.toDataURL();
  const el = document.createElement('img');
  el.className = 'gold-float';
  el.src = goldSrc;
  el.alt = '';
  el.style.top = `${64 + Math.random() * 90}px`;
  el.style.animationDuration = `${7 + Math.random() * 4}s`;
  if (Math.random() < 0.5) el.classList.add('rtl');
  el.addEventListener('animationend', () => el.remove());
  document.body.append(el);
}

let tapMark = null;
const ringGeo = new THREE.RingGeometry(0.22, 0.3, 16);
function showTapMark(x, z) {
  if (tapMark) fxRoot.remove(tapMark.m);
  const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#ffe08a', transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, 0.02, z);
  fxRoot.add(m);
  tapMark = { m, t: 0 };
}

function updateEffects(dt) {
  for (let k = flights.length - 1; k >= 0; k--) {
    const f = flights[k];
    f.t = Math.min(1, f.t + dt / 0.7);
    f.p.position.lerpVectors(f.from, f.to, f.t);
    f.p.position.y += Math.sin(f.t * Math.PI) * 1.0;
    f.p.material.rotation = f.t * Math.PI * 4;
    if (f.t >= 1) {
      fxRoot.remove(f.p);
      f.s.pending--;
      setPile(f.s, piles[f.s.i] ?? 0); // trust the latest count, the stall may have been reset meanwhile
      f.s.squash = 0.3;
      if (f.gold) sparkle(f.to);
      flights.splice(k, 1);
    }
  }
  for (let k = debris.length - 1; k >= 0; k--) {
    const d = debris[k];
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
      debris.splice(k, 1);
    }
  }
  for (let k = notes.length - 1; k >= 0; k--) {
    const n = notes[k];
    n.t += dt;
    n.n.visible = n.t > 0;
    if (n.t > 0) {
      n.n.position.y = 1.9 + n.t * 0.5;
      n.n.position.x = n.x + Math.sin(n.t * 4) * n.sway;
    }
    if (n.t > 2.2) {
      fxRoot.remove(n.n);
      notes.splice(k, 1);
    }
  }
  for (let k = washFx.length - 1; k >= 0; k--) {
    const f = washFx[k];
    f.t += dt;
    f.o.visible = f.t > 0;
    if (f.t > 0) {
      const life = f.t / f.life;
      if (f.kind === 'stream') {
        f.o.scale.x = f.o.scale.z = 1 + Math.sin(f.t * 30) * 0.15;
        f.o.material.opacity = 0.8 * Math.min(1, (f.life - f.t) / 0.4);
      } else if (f.kind === 'bubble') {
        f.o.position.x += (f.vx + Math.sin(f.t * 3 + f.seed) * 0.12) * dt;
        f.o.position.z += f.vz * dt;
        f.o.position.y += f.vy * dt;
        f.o.material.opacity = Math.min(1, (1 - life) * 2.5);
      } else {
        f.vy -= 6 * dt;
        f.o.position.x += f.vx * dt;
        f.o.position.z += f.vz * dt;
        f.o.position.y = Math.max(0.88, f.o.position.y + f.vy * dt);
        f.o.material.opacity = 1 - life;
      }
    }
    if (f.t >= f.life) {
      fxRoot.remove(f.o);
      f.o.material.dispose();
      washFx.splice(k, 1);
    }
  }
  if (tapMark) {
    tapMark.t += dt;
    const k = tapMark.t / 0.6;
    tapMark.m.scale.setScalar(0.6 + k * 0.8);
    tapMark.m.material.opacity = Math.max(0, 0.8 * (1 - k));
    if (k >= 1) {
      fxRoot.remove(tapMark.m);
      tapMark = null;
    }
  }
}

// ---------- floating labels (chat bubbles, pops) ----------

const floats = [];
const tmp = new THREE.Vector3();

function toScreen(v) {
  tmp.copy(v).project(camera);
  return { x: ((tmp.x + 1) / 2) * W, y: ((1 - tmp.y) / 2) * H, on: tmp.z < 1 && Math.abs(tmp.x) < 1.2 && Math.abs(tmp.y) < 1.2 };
}

function headOf(id) {
  const e = users.get(id);
  if (!e) return null;
  const seat = id === meId ? me.s : e.data.s;
  if (seat !== -1) return stallWorld(seat, STALL_M / 2, 1.55, SEAT_Z);
  return new THREE.Vector3(toX(e.rx), 0, toZ(e.ry)).addScaledVector(camUp, HEIGHT + 0.15); // screen-up, like the markers
}

// a crisp link pinned under the golden poop on the back wall (text drawn in the 3D room would blur)
const wishAt = new THREE.Vector3();
function placeWishLink() {
  const link = $('#wishLink');
  const emblem = wishHits[0];
  if (!emblem) return;
  emblem.getWorldPosition(wishAt);
  wishAt.y -= 0.72;
  wishAt.project(camera);
  const on = wishAt.z < 1 && Math.abs(wishAt.x) < 0.95 && wishAt.y > -0.6 && wishAt.y < 0.95;
  link.hidden = !on;
  if (on) link.style.transform = `translate(${((wishAt.x + 1) / 2) * W}px, ${((1 - wishAt.y) / 2) * H}px) translate(-50%, 0)`;
}

function updateLabels(dt) {
  placeWishLink();
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i];
    f.age += dt;
    if (f.id) {
      const h = headOf(f.id);
      if (h) f.anchor.copy(h);
    }
    const pos = f.anchor.clone();
    pos.addScaledVector(camUp, (f.stack || 0) + f.rise * Math.min(1, f.age / f.life));
    const p = toScreen(pos);
    const fadeIn = Math.min(1, f.age / 0.15);
    const fadeOut = Math.min(1, (f.life - f.age) / 0.8);
    f.el.style.opacity = String(Math.max(0, Math.min(fadeIn, fadeOut)));
    f.el.style.display = p.on ? '' : 'none';
    f.el.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px) translate(-50%, -100%)`;
    if (f.age >= f.life) {
      f.el.remove();
      floats.splice(i, 1);
    }
  }
}

// chat is anonymous: just the words, my own bubbles are yellow
function floatChat(id, text) {
  const h = headOf(id);
  if (!h) return;
  feedChat(id, text);
  // one bubble per person: a new line replaces the old one
  for (let k = floats.length - 1; k >= 0; k--) {
    if (floats[k].id === id) {
      floats[k].el.remove();
      floats.splice(k, 1);
    }
  }
  const el = document.createElement('div');
  el.className = id === meId ? 'bubble mine' : 'bubble';
  el.textContent = text;
  $('#labels').append(el);
  floats.push({ id, el, anchor: h, stack: 0, age: 0, life: 6, rise: 0.25 });
  while (floats.length > 40) floats.shift().el.remove();
}

// the room-wide chat feed in the top-left: who (shirt color), where, and what
function placeOf(id) {
  const e = users.get(id);
  if (!e) return '광장';
  const u = e.data;
  const seat = id === meId ? me.s : u.s;
  if (seat !== -1) return `${seat + 1}번 칸`;
  if (u.b) return '벤치';
  if (islandGap(e.rx, e.ry) < 140) return '세면대';
  return '광장';
}

function feedChat(id, text, kind = '') {
  const e = users.get(id);
  const box = $('#feed');
  const row = document.createElement('div');
  row.className = `line${id === meId ? ' mine' : ''}${kind ? ` ${kind}` : ''}`;
  const dot = document.createElement('i');
  dot.style.background = e ? e.look.c : '#ccc';
  const where = document.createElement('b');
  where.textContent = id === meId ? `나 · ${placeOf(id)}` : placeOf(id);
  const msg = document.createElement('span');
  msg.textContent = text;
  row.append(dot, where, msg);
  box.append(row);
  while (box.children.length > (innerWidth < 600 ? 4 : 10)) box.firstChild.remove(); // fewer lines on a phone
  setTimeout(() => row.classList.add('out'), 10000);
  setTimeout(() => row.remove(), 10800);
}

function pop(anchor, text) {
  if (document.hidden) return;
  const el = document.createElement('div');
  el.className = 'pop';
  el.textContent = text;
  $('#labels').append(el);
  floats.push({ id: 0, el, anchor, age: 0, life: 1.2, rise: 0.4 });
}

// ---------- the push button doubles as the gauge ----------

let flashUntil = 0;
let lastBuzz = 0;
function buzz(pattern) {
  try {
    navigator.vibrate?.(pattern);
  } catch {}
}

function updatePush(t) {
  const b = document.querySelector('.act.push');
  if (!b) return;
  const p = me.p || 0;
  b.style.setProperty('--p', `${p}%`);
  let text;
  if (t < flashUntil) text = '퐁당~ 아 시원하다';
  else text = holding ? '끄응…' : '꾹 눌러서 힘주기';
  const span = b.querySelector('.label');
  if (span.textContent !== text) span.textContent = text;
  b.classList.toggle('done', t < flashUntil);
  if (holding && t - lastBuzz > 600) {
    lastBuzz = t;
    buzz(12);
  }
}

// ---------- main loop ----------

let lastFrame = performance.now();
function frame(t) {
  const dt = Math.min(0.05, (t - lastFrame) / 1000);
  lastFrame = t;
  if (me.ready && me.s === -1) moveMe(dt);
  placeWalkers(dt, t);
  animateStalls(dt, t);
  updateEffects(dt);
  updateCamera(dt);
  clouds.rotation.y += dt * 0.004; // clouds drift slowly round
  renderer.render(scene, camera);
  updateLabels(dt);
  renderActions();
  updatePush(t);
  requestAnimationFrame(frame);
}

// ---------- action bar: one clear main button + small icon buttons ----------

let actionMode = '';
function renderActions() {
  const inStall = me.s !== -1;
  const out = !inStall && !me.rolling;
  const near = out && nearestEmptyStall(me.x, me.y) >= 0;
  const nearOcc = out && nearestOccupiedStall(me.x, me.y) >= 0;
  const bench = out && !me.b ? nearBench() : -1;
  const anyFree = stalls.some((_, i) => freeFor(i));
  const mode = inStall ? 'inside' : me.rolling ? 'rolling' : me.b ? 'benched' : nearSink() ? 'sink'
    : near ? 'near' : nearOcc ? `knock${knockStage(hp[nearestOccupiedStall(me.x, me.y)] ?? 100)}` : bench >= 0 ? `bench${bench}` : anyFree ? 'far' : 'full';
  if (mode === actionMode) return;
  actionMode = mode;
  const bar = $('#actions');
  bar.innerHTML = '';
  const pad = $('#pushPad');
  pad.innerHTML = '';
  if (mode === 'inside') {
    const push = document.createElement('button');
    push.type = 'button';
    push.className = 'act main push';
    push.innerHTML = `<span class="gauge"><img class="empty" src="${ICONS.poopEmpty.src}" alt=""><img class="full" src="${ICONS.poop.src}" alt=""></span><span class="label">꾹 눌러서 힘주기</span>`;
    push.addEventListener('contextmenu', (e) => e.preventDefault());
    push.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try {
        push.setPointerCapture(e.pointerId);
      } catch {}
      setHold(true);
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) => push.addEventListener(ev, () => setHold(false)));
    pad.append(push); // only the poop button lives in the bottom-right
    bar.append(miniBtn('flush', '물 내리기', flush), miniBtn('bird', '에티켓벨', ringBell), miniBtn('exit', '나가기', exitStall));
  } else if (mode === 'rolling') {
    const b = mainBtn('knock', '데굴데굴~', null);
    b.disabled = true;
    bar.append(b);
  } else if (mode === 'benched') {
    bar.append(mainBtn('exit', '일어나기', () => send({ t: 'bench', on: false })));
  } else if (mode === 'sink') {
    bar.append(mainBtn('wash', '손 씻기', washHands));
  } else if (mode === 'near') {
    bar.append(mainBtn('door', '이 칸에 앉기', () => tryEnter(nearestEmptyStall(me.x, me.y))));
  } else if (mode.startsWith('knock')) {
    const stage = Number(mode.slice(5));
    bar.append(mainBtn('knock', KNOCK_LABELS[stage], () => tryKnock(nearestOccupiedStall(me.x, me.y)), `knock k${stage}`));
  } else if (mode.startsWith('bench')) {
    bar.append(mainBtn('bench', '벤치에 앉기', () => goSitOnBench(bench)));
  } else if (mode === 'full') {
    bar.append(mainBtn('knock', '만칸이에요 · 노크하러 가기', () => {
      const i = closestAnywhere((k) => stalls[k] && stalls[k] !== meId);
      if (i >= 0) {
        target = { x: LAYOUT[i].x, y: LAYOUT[i].y };
        pendingEnter = -1;
        showTapMark(toX(target.x), toZ(target.y));
      }
    }));
  } else {
    bar.append(mainBtn('find', '빈 칸 찾기', () => {
      const i = closestAnywhere(freeFor);
      if (i >= 0) walkToStall(i);
    }));
  }
}

function mainBtn(ico, label, onClick, cls = '') {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `act main ${cls}`;
  b.innerHTML = `${icoImg(ico)}<span>${label}</span>`;
  if (onClick) b.addEventListener('click', onClick);
  b.addEventListener('contextmenu', (e) => e.preventDefault());
  return b;
}

function miniBtn(ico, label, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'act mini';
  b.innerHTML = `${icoImg(ico)}<span>${label}</span>`;
  b.addEventListener('click', onClick);
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

const openChat = () => chatInput.focus();
const closeChat = () => chatInput.blur();
chatInput.addEventListener('focus', () => document.body.classList.add('typing'));
chatInput.addEventListener('blur', () => {
  document.body.classList.remove('typing');
  setTimeout(() => window.scrollTo(0, 0), 60); // phones sometimes leave the page scrolled after the keyboard
});

// phone keyboards: keep the header at the top of what is still visible and the chat just above the keys
if (window.visualViewport) {
  const vv = window.visualViewport;
  const fitKeyboard = () => {
    const root = document.documentElement.style;
    root.setProperty('--vv-top', `${vv.offsetTop}px`);
    root.setProperty('--kb', `${Math.max(0, window.innerHeight - vv.height - vv.offsetTop)}px`);
  };
  vv.addEventListener('resize', fitKeyboard);
  vv.addEventListener('scroll', fitKeyboard);
  fitKeyboard();
}

// a long press should never open the browser's image or link menu
document.addEventListener('contextmenu', (e) => {
  if (e.target !== chatInput) e.preventDefault();
});

chatBox.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (text) send({ t: 'chat', text });
  chatInput.value = '';
});

// ---------- toast (one line, only things about me) ----------

let toastTimer = 0;
function toast(text) {
  const el = $('#toast');
  el.textContent = text;
  el.hidden = false;
  el.classList.remove('out');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.add('out');
    toastTimer = setTimeout(() => (el.hidden = true), 500);
  }, 2800);
}

// ---------- sound ----------

let audio = null;
const actx = () => (audio ??= new AudioContext());
// everything plays through one quiet master, so sound can be on from the start without being loud
let master = null;
const out = () => {
  if (!master) {
    master = actx().createGain();
    master.gain.value = 0.55;
    master.connect(actx().destination);
  }
  return master;
};
const buffers = {};

async function loadSounds() {
  for (const name of ['bird', 'plop']) {
    if (buffers[name]) continue;
    try {
      const data = await fetch(`sounds/${name}.m4a`).then((r) => r.arrayBuffer());
      buffers[name] = await actx().decodeAudioData(data);
    } catch (err) {
      console.warn('could not load sound', name, err);
    }
  }
}

function playSound(name, volume) {
  if (!soundOn || !buffers[name] || volume <= 0) return;
  const src = actx().createBufferSource();
  src.buffer = buffers[name];
  const gain = actx().createGain();
  gain.gain.value = volume;
  src.connect(gain).connect(out());
  src.start();
}

function tone(type, f0, f1, dur, volume, delay = 0) {
  const t = actx().currentTime + delay;
  const osc = actx().createOscillator();
  const gain = actx().createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, t);
  osc.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.8);
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(gain).connect(out());
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

// the poop-drop sound file; a synth blip only until the file has loaded
function plop(volume) {
  if (!soundOn) return;
  if (buffers.plop) playSound('plop', volume);
  else tone('square', 620, 120, 0.2, volume * 0.5);
}

// knocks get heavier as the door weakens: a polite tap-tap, then thumps, then bangs
function playKnock(volume, stage = 0) {
  if (!soundOn || volume <= 0) return;
  const low = 1 - stage * 0.18;
  const v = volume * (1 + stage * 0.25);
  tone('triangle', 190 * low, 70 * low, 0.09 + stage * 0.03, v);
  tone('triangle', 175 * low, 65 * low, 0.09 + stage * 0.03, v * 0.85, 0.13);
  if (stage >= 2) noiseBurst(0.12, v * 0.5, 600);
}

// a short burst of filtered noise
function noiseBurst(dur, volume, highpass, delay = 0) {
  const ctx = actx();
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = highpass;
  const gain = ctx.createGain();
  gain.gain.value = volume;
  src.connect(filter).connect(gain).connect(out());
  src.start(ctx.currentTime + delay);
}

// wood splitting: a few sharp crackles
function playCrack(volume) {
  if (!soundOn || volume <= 0) return;
  for (let k = 0; k < 4; k++) noiseBurst(0.05 + Math.random() * 0.05, volume * (1 - k * 0.15), 2000 + Math.random() * 1500, k * 0.06 + Math.random() * 0.03);
  tone('square', 140, 60, 0.12, volume * 0.25);
}

function playWash(volume) {
  if (!soundOn) return;
  for (let k = 0; k < 5; k++) tone('sine', 900 + Math.random() * 500, 500, 0.12, volume * 0.3, k * 0.16);
}

// a flush: a rushing whoosh that drains away with a gurgle
function playFlush() {
  if (!soundOn) return;
  noiseBurst(1.3, 0.35, 250);
  noiseBurst(0.8, 0.2, 900, 0.15);
  tone('sine', 320, 90, 0.9, 0.08, 0.3);
}

function playDing() {
  if (!soundOn) return;
  tone('square', 1320, 1300, 0.25, 0.12);
  tone('square', 990, 980, 0.4, 0.12, 0.16);
}

function playCrash(volume) {
  if (!soundOn || volume <= 0) return;
  const len = Math.floor(actx().sampleRate * 0.45);
  const buf = actx().createBuffer(1, len, actx().sampleRate);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
  const src = actx().createBufferSource();
  src.buffer = buf;
  const gain = actx().createGain();
  gain.gain.value = volume;
  src.connect(gain).connect(out());
  src.start();
  tone('sawtooth', 140, 40, 0.4, volume * 0.5);
}

// ---------- background music ----------
// a little violin waltz in D, composed and synthesized right here: no recordings, nothing to license

const BEAT = 60 / 92; // seconds per beat, 3 beats a bar
const MELODY = [
  ['F#5', 2], ['E5', 1], ['D5', 2], ['B4', 1], ['B4', 1], ['D5', 1], ['G5', 1], ['F#5', 2], ['E5', 1],
  ['A5', 2], ['F#5', 1], ['D5', 1.5], ['E5', 0.5], ['F#5', 1], ['G5', 2], ['E5', 1], ['E5', 3],
  ['G5', 2], ['F#5', 1], ['F#5', 1], ['E5', 1], ['D5', 1], ['E5', 2], ['G5', 1], ['A5', 1.5], ['G5', 0.5], ['E5', 1],
  ['F#5', 2], ['A5', 1], ['B5', 1], ['A5', 1], ['F#5', 1], ['G5', 1.5], ['E5', 0.5], ['C#5', 1], ['D5', 3],
];
// one chord per bar, or one per beat
const CHORDS = ['D', 'Bm', 'G', 'A', 'D', 'Bm', 'Em', 'A', 'G', 'D', 'Em', 'A', 'D', 'Bm', ['G', 'G', 'A'], 'D'];
const CHORD_NOTES = { D: ['D4', 'F#4', 'A4'], Bm: ['B3', 'D4', 'F#4'], G: ['G3', 'B3', 'D4'], A: ['A3', 'C#4', 'E4'], Em: ['G3', 'B3', 'E4'] };
const ROOTS = { D: 'D3', Bm: 'B2', G: 'G2', A: 'A2', Em: 'E3' };
const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function noteFreq(n) {
  const [, letter, acc, oct] = n.match(/^([A-G])(#|b)?(\d)$/);
  const midi = 12 * (Number(oct) + 1) + SEMI[letter] + (acc === '#' ? 1 : acc === 'b' ? -1 : 0);
  return 440 * 2 ** ((midi - 69) / 12);
}

// the whole tune as a flat list of timed notes
const SONG = (() => {
  const ev = [];
  let beat = 0;
  for (const [n, len] of MELODY) {
    ev.push({ beat, kind: 'violin', f: noteFreq(n), len });
    beat += len;
  }
  CHORDS.forEach((c, bar) => {
    for (let b = 0; b < 3; b++) {
      const chord = Array.isArray(c) ? c[b] : c;
      const at = bar * 3 + b;
      if (b === 0 || (Array.isArray(c) && c[b] !== c[b - 1])) ev.push({ beat: at, kind: 'bass', f: noteFreq(ROOTS[chord]) });
      if (b > 0) for (const n of CHORD_NOTES[chord]) ev.push({ beat: at, kind: 'pluck', f: noteFreq(n) });
    }
  });
  ev.sort((a, b) => a.beat - b.beat);
  return { events: ev, beats: CHORDS.length * 3 };
})();

function reverbImpulse(seconds) {
  const ctx = actx();
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const ch = buf.getChannelData(c);
    for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  }
  return buf;
}

// two slightly detuned saws, a soft filter, a delayed vibrato and a bowed swell
function violinNote(bus, f, t, dur, vol) {
  const ctx = actx();
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 2400;
  filter.Q.value = 0.7;
  const body = ctx.createBiquadFilter();
  body.type = 'peaking';
  body.frequency.value = 1000;
  body.gain.value = 5;
  const out = ctx.createGain();
  filter.connect(body).connect(out).connect(bus);
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 5.5;
  const depth = ctx.createGain();
  depth.gain.setValueAtTime(0, t);
  depth.gain.linearRampToValueAtTime(f * 0.007, t + Math.min(0.4, dur * 0.6));
  lfo.connect(depth);
  const end = t + dur + 0.35;
  for (const detune of [-5, 5]) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    o.detune.value = detune;
    depth.connect(o.frequency);
    o.connect(filter);
    o.start(t);
    o.stop(end);
  }
  lfo.start(t);
  lfo.stop(end);
  out.gain.setValueAtTime(0.0001, t);
  out.gain.linearRampToValueAtTime(vol, t + Math.min(0.12, dur * 0.3));
  out.gain.linearRampToValueAtTime(vol * 0.75, t + dur * 0.8);
  out.gain.linearRampToValueAtTime(0.0001, end);
}

// a plucked string for the oom-pah-pah underneath
function pluckNote(bus, f, t, vol, decay) {
  const ctx = actx();
  const o = ctx.createOscillator();
  o.type = 'triangle';
  o.frequency.value = f;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  o.connect(g).connect(bus);
  o.start(t);
  o.stop(t + decay + 0.05);
}

const MUSIC_VOLUME = 0.2; // a soft background
let music = null;
function startMusic() {
  if (music) return;
  const ctx = actx();
  const bus = ctx.createGain();
  bus.gain.setValueAtTime(0.0001, ctx.currentTime);
  bus.gain.linearRampToValueAtTime(MUSIC_VOLUME, ctx.currentTime + 2.5);
  const dry = ctx.createGain();
  dry.gain.value = 0.85;
  const wet = ctx.createGain();
  wet.gain.value = 0.4;
  const verb = ctx.createConvolver();
  verb.buffer = reverbImpulse(2.6);
  bus.connect(dry).connect(out());
  bus.connect(verb).connect(wet).connect(out());
  const state = { bus, t0: ctx.currentTime + 0.2, loop: 0, i: 0, timer: 0 };
  music = state;
  const schedule = () => {
    if (music !== state) return; // stopped (or restarted) since this timer was set
    const horizon = actx().currentTime + (document.hidden ? 1.6 : 0.5); // hidden tabs tick slowly
    for (;;) {
      const ev = SONG.events[music.i];
      const t = music.t0 + (music.loop * SONG.beats + ev.beat) * BEAT;
      if (t > horizon) break;
      const low = music.loop % 2 === 1; // every other time round, the tune drops an octave
      if (ev.kind === 'violin') violinNote(bus, low ? ev.f / 2 : ev.f, t, ev.len * BEAT, low ? 0.16 : 0.12);
      else if (ev.kind === 'bass') pluckNote(bus, ev.f, t, 0.3, 0.9);
      else pluckNote(bus, ev.f, t, 0.06, 0.35);
      if (++music.i === SONG.events.length) {
        music.i = 0;
        music.loop++;
      }
    }
  };
  schedule();
  music.timer = setInterval(schedule, 120);
}
function stopMusic() {
  if (!music) return;
  const { bus, timer } = music;
  music = null;
  const now = actx().currentTime;
  bus.gain.cancelScheduledValues(now);
  bus.gain.setValueAtTime(bus.gain.value, now);
  bus.gain.linearRampToValueAtTime(0.0001, now + 0.6);
  setTimeout(() => {
    clearInterval(timer);
    bus.disconnect();
  }, 800);
}

// Phones only let a page make sound after a tap, and iPhones mute Web Audio when the silent switch is on.
// So on the tap that turns sound on: ask for "playback" audio, loop a silent <audio> (which also switches
// older iPhones to playback), resume the context and play one silent sample. All of it inside the tap.
let silentLoop = null;
function silentWavUrl() {
  const rate = 8000;
  const n = rate / 2; // half a second of silence
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const str = (o, t) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + n * 2, true);
  str(8, 'WAVEfmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, n * 2, true);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}
function unlockAudio() {
  try {
    if (navigator.audioSession) navigator.audioSession.type = 'playback';
  } catch {}
  if (!silentLoop) {
    silentLoop = new Audio(silentWavUrl());
    silentLoop.loop = true;
    silentLoop.setAttribute('playsinline', '');
  }
  silentLoop.play().catch(() => {});
  const ctx = actx();
  ctx.resume().catch(() => {});
  const src = ctx.createBufferSource();
  src.buffer = ctx.createBuffer(1, 1, 22050);
  src.connect(ctx.destination);
  src.start(0);
}
// the phone may suspend sound when the tab goes to the background; wake it on the next touch
const wakeAudio = () => {
  if (soundOn && audio && audio.state !== 'running') unlockAudio();
};
document.addEventListener('pointerdown', wakeAudio, true);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) wakeAudio();
});

// the first tap or key anywhere wakes the sound (browsers don't allow it before that); music only if chosen
let soundStarted = false;
const startSoundOnce = () => {
  if (!soundOn || soundStarted) return;
  soundStarted = true;
  unlockAudio();
  if (soundMode === 'all') startMusic();
  loadSounds();
};
document.addEventListener('pointerdown', startSoundOnce, true);
document.addEventListener('keydown', startSoundOnce, true);

// hide the chat feed on the left (the bubbles over heads stay); remembered for next time
let chatHidden = false;
try {
  chatHidden = localStorage.getItem('ddongta.chatHidden') === '1';
} catch {}
function setChatHidden(on) {
  chatHidden = on;
  document.body.classList.toggle('chat-hidden', on);
  const btn = $('#chatToggle');
  btn.innerHTML = icoImg(on ? 'chatOff' : 'chat');
  btn.setAttribute('aria-label', on ? '채팅 목록 보이기' : '채팅 목록 숨기기');
  btn.title = on ? '채팅 목록 보이기 (H)' : '채팅 목록 숨기기 (H)';
  try {
    localStorage.setItem('ddongta.chatHidden', on ? '1' : '0');
  } catch {}
}
setChatHidden(chatHidden);
$('#chatToggle').addEventListener('click', () => {
  setChatHidden(!chatHidden);
  toast(chatHidden ? '채팅 목록을 숨겼어요' : '채팅 목록을 다시 보여줘요');
});
$('#recenterBtn').innerHTML = icoImg('recenter');
$('#recenterBtn').addEventListener('click', recenterCam);
// the sound button opens a small menu: effects only / with music / off
const SOUND_MODES = {
  fx: { icon: 'soundOn', label: '효과음만', toast: '효과음만 들려요' },
  all: { icon: 'music', label: '배경음악도', toast: '배경음악도 같이 들려요' },
  off: { icon: 'soundOff', label: '소리 끄기', toast: '소리를 껐어요' },
};
const soundMenu = $('#soundMenu');
function showSoundMode() {
  $('#soundBtn').innerHTML = icoImg(SOUND_MODES[soundMode].icon); // icon only
  $('#soundBtn').title = `소리: ${SOUND_MODES[soundMode].label}`;
  for (const b of soundMenu.querySelectorAll('button')) {
    const m = SOUND_MODES[b.dataset.mode];
    b.innerHTML = `${icoImg(m.icon)}${m.label}`;
    b.classList.toggle('on', b.dataset.mode === soundMode);
    b.setAttribute('aria-checked', b.dataset.mode === soundMode);
  }
}
function setSoundMenu(open) {
  soundMenu.hidden = !open;
  $('#soundBtn').setAttribute('aria-expanded', open);
}
async function setSoundMode(mode) {
  soundMode = mode;
  soundOn = mode !== 'off';
  try {
    localStorage.setItem('ddongta.sound', mode);
  } catch {}
  showSoundMode();
  if (soundOn) {
    soundStarted = true;
    unlockAudio();
  } else silentLoop?.pause();
  if (mode === 'all') startMusic(); // queued now, heard as soon as the phone lets the sound through
  else stopMusic();
  if (soundOn) await loadSounds();
}
$('#soundBtn').addEventListener('click', () => setSoundMenu(soundMenu.hidden));
soundMenu.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  setSoundMenu(false);
  if (b.dataset.mode === soundMode) return;
  setSoundMode(b.dataset.mode);
  toast(SOUND_MODES[b.dataset.mode].toast);
});
document.addEventListener('pointerdown', (e) => {
  if (!soundMenu.hidden && !e.target.closest('#soundMenu, #soundBtn')) setSoundMenu(false);
}, true);

// ---------- keyboard ----------

const MOVE_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'KeyS'];
const typing = () => document.activeElement === chatInput;

window.addEventListener('keydown', (e) => {
  if (typing()) {
    if (e.key === 'Escape') closeChat();
    return;
  }
  if (MOVE_KEYS.includes(e.code)) {
    e.preventDefault();
    if (me.s !== -1) return; // in a stall the arrows do nothing; only Esc (or the button) gets you out
    keys.add(e.code);
  } else if (e.code === 'Space') {
    e.preventDefault();
    spaceHeld = true;
    if (me.s !== -1) {
      if (!e.repeat) setHold(true);
      return;
    }
    // holding a direction: Space means run, not sit or knock
    if (MOVE_KEYS.some((k) => keys.has(k))) return;
    if (me.b) {
      if (!e.repeat) send({ t: 'bench', on: false }); // Space again gets you up
      return;
    }
    if (nearSink()) {
      if (!e.repeat) washHands();
      return;
    }
    const bench = nearBench();
    if (bench >= 0) {
      if (!e.repeat) goSitOnBench(bench);
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
  } else if (e.code === 'KeyJ') {
    jump();
  } else if (e.code === 'KeyF') {
    flush();
  } else if (e.code === 'KeyR') {
    recenterCam();
  } else if (e.code === 'KeyH') {
    setChatHidden(!chatHidden);
    toast(chatHidden ? '채팅 목록을 숨겼어요' : '채팅 목록을 다시 보여줘요');
  } else if (e.code === 'KeyQ') {
    cam.tYaw = clamp(cam.tYaw + 0.35, -YAW_MAX, YAW_MAX);
    manualCamAt = performance.now();
  } else if (e.code === 'KeyE') {
    cam.tYaw = clamp(cam.tYaw - 0.35, -YAW_MAX, YAW_MAX);
    manualCamAt = performance.now();
  } else if (e.key === '=' || e.key === '+') {
    cam.tDist = clamp(cam.tDist * 0.8, DIST_MIN, DIST_MAX);
    manualCamAt = performance.now();
  } else if (e.key === '-' || e.key === '_') {
    cam.tDist = clamp(cam.tDist * 1.25, DIST_MIN, DIST_MAX);
    manualCamAt = performance.now();
  } else if (e.key === 'Escape') {
    if (me.s !== -1) exitStall();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    openChat();
  }
});

window.addEventListener('keyup', (e) => {
  keys.delete(e.code);
  if (e.code === 'Space') {
    spaceHeld = false;
    setHold(false);
  }
});

window.addEventListener('blur', () => {
  keys.clear();
  spaceHeld = false;
  setHold(false);
});

// ---------- pointer: tap to walk, drag to look around, pinch/wheel to zoom ----------

const canvasEl = renderer.domElement;
const raycaster = new THREE.Raycaster();
const pointers = new Map();
let dragged = false;
let pinchDist = 0;

function pick(clientX, clientY) {
  const ndc = new THREE.Vector2((clientX / W) * 2 - 1, -(clientY / H) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const objs = [...wishHits, ...stallHits.filter(Boolean)];
  if (floorMesh) objs.push(floorMesh);
  return raycaster.intersectObjects(objs, false)[0] || null;
}

// two quick taps close together mean "run there"
let lastTap = { t: 0, x: 0, y: 0 };
function handleTap(x, y) {
  if (pick(x, y)?.object.userData.wish) {
    location.href = '/wish';
    return;
  }
  if (!me.ready || me.s !== -1 || me.rolling) return;
  const now = performance.now();
  const run = now - lastTap.t < 380 && Math.hypot(x - lastTap.x, y - lastTap.y) < 40;
  lastTap = run ? { t: 0, x: 0, y: 0 } : { t: now, x, y };
  tapTo(x, y);
  if (run && target) target.run = true;
}

function tapTo(x, y) {
  const hit = pick(x, y);
  if (!hit) return;
  const i = hit.object.userData.stall;
  if (i !== undefined) {
    // tapping a stall only walks up to its door; going in is always your own choice (button or Space)
    target = { x: LAYOUT[i].x, y: LAYOUT[i].y };
    pendingEnter = -1;
    showTapMark(toX(target.x), toZ(target.y));
    return;
  }
  target = { x: clamp(hit.point.x / U, 45, ROOM_W - 45), y: clamp(hit.point.z / U, 45, ROOM_D - 40) };
  pendingEnter = -1;
  showTapMark(toX(target.x), toZ(target.y));
}

canvasEl.addEventListener('pointerdown', (e) => {
  try {
    canvasEl.setPointerCapture(e.pointerId);
  } catch {}
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, axis: '' });
  if (pointers.size === 1) dragged = false;
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
    dragged = true;
  }
  canvasEl.classList.add('grabbing');
});

canvasEl.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) {
    // hover: softly highlight the stall under the mouse
    if (e.pointerType === 'mouse') {
      const hit = pick(e.clientX, e.clientY);
      hoverStall = hit && hit.object.userData.stall !== undefined && me.s === -1 ? hit.object.userData.stall : -1;
      canvasEl.style.cursor = hoverStall >= 0 || hit?.object.userData.wish ? 'pointer' : '';
    }
    return;
  }
  const dx = e.clientX - p.x;
  const dy = e.clientY - p.y;
  p.x = e.clientX;
  p.y = e.clientY;
  if (pointers.size === 1) {
    if (Math.hypot(p.x - p.sx, p.y - p.sy) > 6) dragged = true;
    if (dragged) {
      // each drag sticks to the direction it started in (turning, or tilting), unless it starts out diagonal,
      // so turning doesn't tip the view up and down by accident
      if (!p.axis) {
        const ax = Math.abs(p.x - p.sx);
        const ay = Math.abs(p.y - p.sy);
        p.axis = ax > ay * 1.5 ? 'x' : ay > ax * 1.5 ? 'y' : 'xy';
      }
      manualCamAt = performance.now();
      if (p.axis !== 'y') cam.tYaw = clamp(cam.tYaw - dx * 0.0045, -YAW_MAX, YAW_MAX);
      if (p.axis !== 'x') {
        // one vertical axis: dragging up lowers the camera to its lowest angle, and past that it looks up at the sky
        // (looking up moves at half speed, so a small drag doesn't throw you into the sky)
        const v = cam.tPitch - cam.tLook * 2 + dy * 0.003;
        cam.tPitch = clamp(v, 0.2, 0.95);
        cam.tLook = clamp((0.2 - v) / 2, 0, 1.0);
      }
    }
  } else if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinchDist > 0 && d > 0) cam.tDist = clamp((cam.tDist * pinchDist) / d, DIST_MIN, DIST_MAX);
    manualCamAt = performance.now();
    pinchDist = d;
  }
});

function endPointer(e) {
  const p = pointers.get(e.pointerId);
  if (p && pointers.size === 1 && !dragged) handleTap(e.clientX, e.clientY);
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinchDist = 0;
  if (!pointers.size) canvasEl.classList.remove('grabbing');
}
canvasEl.addEventListener('pointerup', endPointer);
canvasEl.addEventListener('pointercancel', endPointer);

canvasEl.addEventListener('wheel', (e) => {
  e.preventDefault();
  cam.tDist = clamp(cam.tDist * Math.exp(clamp(e.deltaY, -60, 60) * 0.004), DIST_MIN, DIST_MAX); // one notch never jumps too far
  manualCamAt = performance.now();
}, { passive: false });
document.addEventListener('gesturestart', (e) => e.preventDefault());

// ---------- on-screen stick for phones ----------

const joy = { x: 0, y: 0, id: null };
{
  const pad = $('#joy');
  const knob = pad.querySelector('.knob');
  const R = 38;
  const set = (e) => {
    const r = pad.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2);
    let dy = e.clientY - (r.top + r.height / 2);
    const d = Math.hypot(dx, dy);
    if (d > R) {
      dx = (dx / d) * R;
      dy = (dy / d) * R;
    }
    joy.x = dx / R;
    joy.y = dy / R;
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
  };
  const release = (e) => {
    if (e.pointerId !== joy.id) return;
    joy.id = null;
    joy.x = joy.y = 0;
    knob.style.transform = '';
    pad.classList.remove('on');
  };
  pad.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    joy.id = e.pointerId;
    try {
      pad.setPointerCapture(e.pointerId);
    } catch {}
    pad.classList.add('on');
    set(e);
  });
  pad.addEventListener('pointermove', (e) => {
    if (e.pointerId === joy.id) set(e);
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) => pad.addEventListener(ev, release));
}

// ---------- start ----------

// ?og: a clean frame for the link-preview image: no controls, just the place
if (OG) document.body.classList.add('og');

showSoundMode();
$('#peopleIcon').innerHTML = icoImg('people');
$('#busyIcon').innerHTML = icoImg('door');
$('#todayIcon').innerHTML = icoImg('poop');
$('#downIcon').innerHTML = icoImg('poop');

Promise.all([document.fonts.load('9px Galmuri9'), document.fonts.load('11px Galmuri11'), peopleReady]).finally(() => {
  connect();
  requestAnimationFrame(frame);
});
