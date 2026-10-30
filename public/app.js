// 똥타 — a roomy three.js restroom rendered at low resolution, with hand-drawn pixel sprites standing in it.
import * as THREE from '/vendor/three.module.js';

// ---------- world constants (keep in sync with server.js) ----------
const STALL_W = 110;
const ENTER_RANGE = 75;
const SPEED = 300;

// the room layout arrives from the server on welcome (stalls in a U around a plaza)
let LAYOUT = [];
let ROOM_W = 2200;
let ROOM_D = 2300;
let BASIN = { x: 1100, y: 1050, r: 130 };

// server units (cm) -> meters
const U = 0.01;
const toX = (x) => x * U;
const toZ = (y) => y * U;
const STALL_M = STALL_W * U;
const STALL_D = 1.6;
const DOOR_W = 0.94;
const DOOR_BOT = 0.38; // the famous American gap
const DOOR_TOP = 1.55;
const PART_BOT = 0.3;
const PART_TOP = 1.75;
const SEAT_Z = -0.88; // where the person on the toilet sits (bowl center is at -1.1)
const SIT_LIFT = 0.12; // raise the sitter so the face is fully above the door
const PX_M = 0.05; // meters per sprite pixel
const PILE_MAX = 10;

const INK = '#2a1f2b';
const SKIN = '#ffd9b8';
const HAIRS = ['#3b2a20', '#5a3a24', '#1f1b22', '#8a5530', '#4a3460', '#c26a3a', '#d8b26a', '#7a7a86'];
// a late-night restroom: deep navy tile, dark terrazzo, warm wood doors, brass trim, sage stalls
const PAL = {
  sky: '#12161f', wall: '#273040', wallLine: '#202837', band: '#c9a25a',
  floorA: '#323a47', floorB: '#2c333f', floorLine: '#242a34',
  door: '#b98552', doorDark: '#8a5f38', doorLight: '#d9a46c', part: '#3f5b5d', partTop: '#6e958f', rail: '#c9a25a',
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
let soundOn = false;
const happyUntil = new Map();

// ---------- pixel sprite helpers ----------

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => clamp(Math.round(v * (1 + amt)), 0, 255);
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

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

function flip(c) {
  const f = document.createElement('canvas');
  f.width = c.width;
  f.height = c.height;
  const g = f.getContext('2d');
  g.translate(c.width, 0);
  g.scale(-1, 1);
  g.drawImage(c, 0, 0);
  return f;
}

// ---------- character art ----------

const HEAD = {
  front: ['....HHHHHH....', '..HHHHHHHHHH..', '.HHHHHHHHHHHH.', '.HHHHHHHHHHHH.', '.HHSHHSSHHSHH.', '.HSSSSSSSSSSH.', '.SSSSSSSSSSSS.', '.SSSSSSSSSSSS.', '.SSSSSSSSSSSS.', '..SSSSSSSSSS..', '....ssssss....'],
  back: ['....HHHHHH....', '..HHHHHHHHHH..', '.HHHHHHHHHHHH.', '.HHHHHHHHHHHH.', '.HHHHHHHHHHHH.', '.HHHHHHHHHHHH.', '.HHHHHHHHHHHH.', '.HHHHHHHHHHHH.', '.SHHHHHHHHHHS.', '..HHHHHHHHHH..', '....ssssss....'],
  side: ['....HHHHHH....', '...HHHHHHHHH..', '..HHHHHHHHHHH.', '..HHHHHHHHHHH.', '..HHHHHHHSHHS.', '..HHHHHSSSSSS.', '..HHHHSSSSSSS.', '..HHHSSSSSSSS.', '..HHHSSSSSSSSS', '...HSSSSSSSS..', '.....ssssss...'],
};
const BODY = {
  front: ['...CCCCCCCC...', '..CCCCCCCCCC..', '.SCCCCCCCCCCS.', '..cCCCCCCCCc..'],
  back: ['...CCCCCCCC...', '..CCCCCCCCCC..', '.SCCCCCCCCCCS.', '..cCCCCCCCCc..'],
  side: ['....CCCCCC....', '...CCCCCCCC...', '...CCCCSCCC...', '...cCCCCCCc...'],
};
const HIPS = { front: '...PPPPPPPP...', back: '...PPPPPPPP...', side: '....PPPPPP....' };
const UNDIES = { front: '...WWWWWWWW...', back: '...WWWWWWWW...', side: '....WWWWWW....' };
const LEGS = {
  front: [
    ['...PPP..PPP...', '...PP....PP...', '...BB....BB...'],
    ['...PPP..PPP...', '..PP......PP..', '..BB......BB..'],
    ['....PPPPPP....', '....PP..PP....', '....BB..BB....'],
  ],
  side: [
    ['....PPPPP.....', '....PP.PP.....', '....BB.BBB....'],
    ['....PPPPP.....', '...PP...PP....', '..BB....BBB...'],
    ['....PPPPP.....', '....PPPP......', '....BBBBB.....'],
  ],
};
const LEGS_DOWN = {
  front: ['...SS....SS...', '..PPPP..PPPP..', '...BB....BB...'],
  side: ['....SS.SS.....', '...PPPPPPP....', '....BB.BBB....'],
};

const FACE_COL = { K: INK, W: '#ffffff', B: '#7cc6ff', R: '#ff8fa3', T: '#ff6b81' };
const FACES = {
  idle: { K: [[4, 5], [4, 6], [9, 5], [9, 6], [6, 8], [7, 8]] },
  neutral: { K: [[4, 5], [4, 6], [9, 5], [9, 6], [5, 8], [6, 8], [7, 8], [8, 8]] },
  urgent: { K: [[4, 5], [4, 6], [9, 5], [9, 6], [5, 8], [8, 8]], W: [[6, 8], [7, 8]], B: [[12, 4], [12, 5]] },
  strain: { K: [[3, 5], [4, 6], [3, 7], [10, 5], [9, 6], [10, 7], [5, 8], [6, 9], [7, 8], [8, 9]], R: [[2, 8], [11, 8]], B: [[12, 3], [12, 4]] },
  ok: { K: [[4, 5], [4, 6], [9, 5], [9, 6], [5, 8], [6, 9], [7, 9], [8, 8]], R: [[2, 8], [11, 8]] },
  bliss: { K: [[3, 6], [4, 5], [5, 6], [8, 6], [9, 5], [10, 6], [5, 8], [6, 8], [7, 8], [8, 8]], R: [[2, 7], [11, 7]], T: [[6, 9], [7, 9]] },
  relaxed: { K: [[3, 6], [4, 6], [9, 6], [10, 6], [6, 8], [7, 8]], R: [[2, 8], [11, 8]] },
  dizzy: { K: [[3, 5], [5, 5], [4, 6], [3, 7], [5, 7], [8, 5], [10, 5], [9, 6], [8, 7], [10, 7], [6, 9], [7, 9]] },
  shock: { K: [[4, 5], [5, 5], [4, 6], [5, 6], [8, 5], [9, 5], [8, 6], [9, 6], [6, 8], [7, 8], [6, 9], [7, 9]], R: [[2, 7], [2, 8], [11, 7], [11, 8]], B: [[12, 3], [12, 4]] },
};
const SIDE_FACE = [[10, 6], [12, 8]];

// every visitor gets a look picked from their id: hair style, skin, cap, stripes, pants
const SKINS = ['#ffd9b8', '#f6c8a2', '#e8b08a', '#c98e64', '#9a6644'];
const STYLES = ['short', 'long', 'bun', 'cap', 'curly', 'buzz'];
const PANTS = ['#3b4a6b', '#5a4636', '#2f2f3a', '#56683a', '#7a4a5a'];
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
  const look = {
    c: u.c, skin: pick(SKINS, 0), h: pick(HAIRS, 3), style: pick(STYLES, 7), pants: pick(PANTS, 11), cap: pick(CAPS, 15),
    stripe: (h >>> 23) % 3 === 0,
  };
  look.key = [look.c, look.skin, look.h, look.style, look.pants, look.cap, look.stripe].join('|');
  return look;
}

function headRows(v, style) {
  let rows = HEAD[v].map((r) => r.split(''));
  const set = (r, c, ch) => {
    if (rows[r] && c >= 0 && c < rows[r].length) rows[r][c] = ch;
  };
  const swap = (r, from, to) => {
    if (rows[r]) rows[r] = rows[r].map((ch) => (ch === from ? to : ch));
  };
  let dy = 0;
  if (style === 'long') {
    if (v === 'front') {
      for (let r = 5; r <= 10; r++) {
        set(r, 1, 'H');
        set(r, 12, 'H');
        if (r >= 8) {
          set(r, 0, 'H');
          set(r, 13, 'H');
        }
      }
    } else if (v === 'back') {
      for (let r = 8; r <= 10; r++) for (let c = 1; c <= 12; c++) set(r, c, 'H');
    } else {
      for (let r = 5; r <= 10; r++) {
        set(r, 2, 'H');
        set(r, 3, 'H');
        if (r >= 8) set(r, 1, 'H');
      }
    }
  } else if (style === 'cap') {
    for (let r = 0; r <= 3; r++) swap(r, 'H', 'Q');
    if (v === 'front') rows[4] = '.QQQQQQQQQQQQ.'.split('');
    else if (v === 'side') rows[4] = '..QQQQQQQQQQQQ'.split('');
    else swap(4, 'H', 'Q');
  } else if (style === 'bun') {
    rows = ['.....HHHH.....'.split(''), ...rows];
    dy = 1;
  } else if (style === 'curly') {
    rows[0] = '..HH.HHHH.HH..'.split('');
    if (v !== 'side') {
      set(4, 0, 'H');
      set(4, 13, 'H');
      set(5, 0, 'H');
      set(5, 13, 'H');
    }
  } else if (style === 'buzz') {
    rows[0] = '..............'.split('');
    rows[1] = '...HHHHHHHH...'.split('');
    if (v === 'front') rows[4] = '.HSSSSSSSSSSH.'.split('');
  }
  return { rows: rows.map((r) => r.join('')), dy };
}

// a TV-style censor: chunky 2x2 skin-tone blocks over the hips only
function mosaicOver(c, top, height, look) {
  const g = c.getContext('2d');
  const tones = [look.skin, shade(look.skin, -0.14), shade(look.skin, 0.08), shade(look.skin, -0.26)];
  for (let y = 0; y < height; y += 2) {
    for (let x = 1; x < 13; x += 2) {
      g.fillStyle = tones[(x * 3 + y * 5 + x * y) % tones.length];
      g.fillRect(x + 1, top + y + 1, 2, 2);
    }
  }
}

const charCache = new Map();
// mode: 'stand' (walking), 'toilet' (seated, long legs to the floor) or 'bench'
function body(view, { frame = 0, face = 'idle', look, pantsDown = false, mode = 'stand' }) {
  const key = `${view}|${frame}|${face}|${look.key}|${pantsDown}|${mode}`;
  let c = charCache.get(key);
  if (c) return c;
  const v = view === 'back' ? 'back' : view === 'front' ? 'front' : 'side';
  const legView = v === 'side' ? 'side' : 'front';
  const { rows: head, dy } = headRows(v, look.style);
  const rows = [...head, ...BODY[v].map((r, k) => (look.stripe && k % 2 === 1 ? r.replace(/C/g, 'L') : r))];
  const hips = rows.length;
  let censor = null;
  if (mode === 'toilet') {
    rows.push(UNDIES.front);
    for (let k = 0; k < 20; k++) rows.push('...SS....SS...');
    rows.push('..PPPP..PPPP..', '...BB....BB...');
    censor = [hips - 1, 4];
  } else if (mode === 'bench') {
    rows.push(HIPS.front, '..PPPPPPPPPP..', '...BB....BB...');
  } else {
    rows.push(pantsDown ? UNDIES[v] : HIPS[v]);
    rows.push(...(pantsDown ? LEGS_DOWN[legView] : LEGS[legView][frame]));
    if (pantsDown) censor = [hips - 1, 4];
  }
  const pal = {
    H: look.h, Q: look.cap, S: look.skin, s: shade(look.skin, -0.12), C: look.c, c: shade(look.c, -0.22), L: shade(look.c, 0.25),
    P: look.pants, B: '#2c2630', W: '#ffffff',
  };
  const shift = (pts) => pts.map(([x, y]) => [x, y + dy]);
  const extra = [];
  if (v === 'front') {
    for (const [k, pts] of Object.entries(FACES[face] || FACES.idle)) extra.push([FACE_COL[k], shift(pts)]);
  } else if (v === 'side') {
    extra.push([INK, shift(SIDE_FACE)]);
  }
  c = sprite(rows, pal, extra);
  if (censor) mosaicOver(c, censor[0], censor[1], look);
  if (view === 'left') c = flip(c);
  charCache.set(key, c);
  return c;
}

// ---------- props & icons ----------

const PROPS = {
  poop: sprite(['....p...', '...ppP..', '..phpPP.', '.ppppppP', '..PPPPP.', '.phpppPP', 'pppppppP', '.PPPPPP.'], { p: '#8a5228', P: '#5e3517', h: '#c88a50' }),
  plant: sprite(['...g...g....', '..gGg.gGg...', '.gGgggGggg..', 'gGggGgggGgg.', '.ggGgggGgg..', '..gggGggg...', '...ggGgg....', '...pppppp...', '...PPPPPP...', '....pppp....', '....pppp....'], { g: '#6cb35f', G: '#3f7a3c', p: '#c0703f', P: '#9a5530' }),
  bigPlant: sprite([
    '....g....g.....', '...gGg..gGg....', '..gGggggGggg...', '.gGgGgggGgGgg..', 'gGggGggGggGggg.', '.ggGgggGgggGg..',
    'gGgggGggGgggGg.', '.gggGgggGgggg..', '..ggGgggGggg...', '...gggGggg.....', '....ggGgg......', '....pppppp.....',
    '...pPPPPPPp....', '...pPPPPPPp....', '....pppppp.....',
  ], { g: '#7cc26a', G: '#3f7a3c', p: '#c0703f', P: '#9a5530' }),
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
  soundOn: icon(['...S.....', '..SS..W..', 'SSSS.W.W.', 'SSSS.W.W.', '..SS..W..', '...S.....']),
  soundOff: icon(['...S.....', '..SS.....', 'SSSS.x.x.', 'SSSS..x..', '..SS.x.x.', '...S.....']),
  wash: icon(['...B...', '..BBB..', '.BBBBB.', '.BBWBB.', '.BBBBB.', '..BBB..']),
  bench: icon(['DDDDDDDDD', 'DdddddddD', 'DDDDDDDDD', '.D.....D.', '.D.....D.']),
  jump: icon(['...A...', '..AAA..', '.AAAAA.', '...A...', '...A...', '...A...']),
  poop: asIcon(PROPS.poop),
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
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
sceneEl.append(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PAL.sky);
scene.fog = new THREE.Fog(PAL.sky, 26, 60);
const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 140);
const hemi = new THREE.HemisphereLight('#8a98c8', '#151820', 1.15);
const sun = new THREE.DirectionalLight('#a9b8ff', 0.7); // cool moonlight
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 10, bottom: -10, near: 1, far: 40 });
sun.shadow.bias = -0.001;
scene.add(hemi, sun, sun.target);
const lamps = new THREE.Group(); // warm pendant lights over the plaza
scene.add(lamps);

const worldRoot = new THREE.Group();
const stallRoot = new THREE.Group();
const charRoot = new THREE.Group();
const fxRoot = new THREE.Group();
scene.add(worldRoot, stallRoot, charRoot, fxRoot);

let W = 1;
let H = 1;
let PIX = 3;
function resize() {
  W = innerWidth;
  H = innerHeight;
  PIX = W >= 900 ? 3 : 2; // render small, then scale up so the 3D looks like pixel art too
  renderer.setSize(Math.ceil(W / PIX), Math.ceil(H / PIX), false);
  renderer.domElement.style.width = `${W}px`;
  renderer.domElement.style.height = `${H}px`;
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
const wallCanvas = canvas(16, 16, (g) => {
  g.fillStyle = PAL.wall;
  g.fillRect(0, 0, 16, 16);
  g.fillStyle = PAL.wallLine;
  g.fillRect(0, 7, 16, 1);
  g.fillRect(0, 15, 16, 1);
  g.fillRect(7, 0, 1, 8);
  g.fillRect(15, 8, 1, 8);
  g.fillStyle = '#ffffff';
  g.fillRect(1, 1, 2, 1);
  g.fillRect(9, 9, 2, 1);
});
const windowCanvas = canvas(16, 20, (g) => {
  g.fillStyle = '#8a7a62';
  g.fillRect(0, 0, 16, 20);
  const grad = g.createLinearGradient(0, 0, 0, 20);
  grad.addColorStop(0, '#162447');
  grad.addColorStop(1, '#2f4a7a');
  g.fillStyle = grad;
  g.fillRect(1, 1, 14, 18);
  g.fillStyle = '#8a7a62';
  g.fillRect(7, 1, 2, 18);
  g.fillRect(1, 9, 14, 1);
  g.fillStyle = '#ffffff';
  g.fillRect(3, 3, 1, 1);
  g.fillRect(11, 5, 1, 1);
  g.fillRect(5, 13, 1, 1);
  g.fillStyle = '#ffe9a8';
  g.fillRect(11, 12, 2, 2); // the moon
});

// glowing neon text
const neonCanvas = (text, color, w) => canvas(w, 16, (g) => {
  g.font = '11px Galmuri11';
  g.textBaseline = 'middle';
  g.textAlign = 'center';
  g.shadowColor = color;
  g.shadowBlur = 4;
  g.fillStyle = color;
  g.fillText(text, w / 2, 8);
  g.shadowBlur = 0;
  g.fillStyle = '#ffffff';
  g.globalAlpha = 0.55;
  g.fillText(text, w / 2, 8);
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
// drawn after the pixel font has loaded
const makeSignCanvas = () => canvas(48, 12, (g) => {
  g.fillStyle = '#1c3d7a';
  g.fillRect(0, 0, 48, 12);
  g.fillStyle = '#ffffff';
  g.fillRect(1, 1, 46, 10);
  g.fillStyle = '#1c3d7a';
  g.font = '9px Galmuri9';
  g.textBaseline = 'top';
  g.fillText('RESTROOM', 4, 1);
});

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
  drawNumber(g, n, w / 2, 2, '#ffffff');
  if (crack > 0) {
    g.fillStyle = INK;
    const pts = [
      [[5, 4], [6, 5], [6, 6], [7, 7], [7, 8], [8, 9]],
      [[w - 6, h - 9], [w - 7, h - 8], [w - 7, h - 7], [w - 8, h - 6], [w - 9, h - 5]],
      [[9, 12], [10, 13], [9, 14], [10, 15], [11, 16], [11, 17]],
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
  partTop: mat(PAL.partTop),
  rail: mat(PAL.rail),
  porcelain: new THREE.MeshPhongMaterial({ color: '#fbfbfb', shininess: 60 }),
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
  rail: new THREE.BoxGeometry(STALL_M, 0.05, 0.07),
  door: new THREE.BoxGeometry(DOOR_W, DOOR_TOP - DOOR_BOT, 0.04),
  lock: new THREE.BoxGeometry(0.06, 0.04, 0.02),
  bowl: new THREE.CylinderGeometry(0.2, 0.15, 0.4, 12),
  seat: new THREE.TorusGeometry(0.17, 0.035, 6, 14),
  water: new THREE.CircleGeometry(0.13, 12),
  tank: new THREE.BoxGeometry(0.46, 0.38, 0.2),
  hit: new THREE.BoxGeometry(STALL_M, 2, 0.6),
  blob: new THREE.CircleGeometry(0.28, 14),
  chip: new THREE.BoxGeometry(0.06, 0.04, 0.03),
  mosaic: new THREE.PlaneGeometry(STALL_M - 0.1, STALL_D - 0.15),
  card: new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0), // bottom-anchored upright card
};

// censor sheet over an occupied stall: frosted white blocks, sitting just under the eyes
const mosaicMat = new THREE.MeshBasicMaterial({
  map: pixelTex(canvas(6, 8, (g) => {
    const tones = ['#ffffff', '#f3f6f8', '#e7ecf0', '#fbfcfd', '#dde4ea', '#eef2f5'];
    for (let y = 0; y < 8; y++) for (let x = 0; x < 6; x++) {
      g.fillStyle = tones[(x * 7 + y * 13 + x * y) % tones.length];
      g.fillRect(x, y, 1, 1);
    }
  })),
  transparent: true,
  opacity: 0.8, // frosted, a little see-through
  side: THREE.DoubleSide,
});

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

function setSpriteCanvas(s, c, density = PX_M) {
  const t = texOf(c);
  if (s.material.map !== t) {
    s.material.map = t;
    s.material.needsUpdate = true;
  }
  s.scale.set(c.width * density, c.height * density, 1);
}

// ---------- the room ----------

let floorMesh = null;
let builtFor = 0;
const benchSpots = []; // where people sit, in server units

function buildRoom() {
  worldRoot.clear();
  lamps.clear();
  const rw = toX(ROOM_W);
  const rd = toZ(ROOM_D);
  const wallH = 5;
  const back = -STALL_D;

  // floor
  const ft = pixelTex(floorCanvas, true);
  ft.repeat.set((rw + 6) / 1.2, (rd + 6) / 1.2);
  floorMesh = mesh(new THREE.PlaneGeometry(rw + 6, rd + 6), new THREE.MeshLambertMaterial({ map: ft }), { receive: true });
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.position.set(rw / 2, 0, rd / 2 - 1);
  worldRoot.add(floorMesh);

  // three tiled walls behind the stall banks, with a brass band and night windows
  const wall = (w, x, z, rotY) => {
    const t = pixelTex(wallCanvas, true);
    t.repeat.set(w / 0.6, wallH / 0.6);
    const m = mesh(new THREE.PlaneGeometry(w, wallH), new THREE.MeshLambertMaterial({ map: t }), { receive: true });
    m.position.set(x, wallH / 2, z);
    m.rotation.y = rotY;
    const band = mesh(new THREE.PlaneGeometry(w, 0.12), mat(PAL.band, { emissive: '#3a2a10' }));
    band.position.set(x, 2.05, z);
    band.rotation.y = rotY;
    band.translateZ(0.01);
    worldRoot.add(m, band);
  };
  wall(rw + 2 * STALL_D, rw / 2, back, 0);
  wall(rd + STALL_D, back, (rd - STALL_D) / 2, Math.PI / 2);
  wall(rd + STALL_D, rw - back, (rd - STALL_D) / 2, -Math.PI / 2);
  const winTex = pixelTex(windowCanvas);
  for (let x = 2.2; x < rw - 1; x += 4.4) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.5), new THREE.MeshBasicMaterial({ map: winTex }));
    win.position.set(x, 3.2, back + 0.02);
    worldRoot.add(win);
  }

  // glowing signs: the name over the back bank, RESTROOM over the open entrance
  const title = new THREE.Mesh(new THREE.PlaneGeometry(4, 1), new THREE.MeshBasicMaterial({ map: pixelTex(neonCanvas('똥타', '#ff8fb8', 64)), transparent: true }));
  title.position.set(rw / 2, 4.2, back + 0.03);
  const archMat = mat('#1c222d');
  const postL = mesh(new THREE.BoxGeometry(0.25, 3.2, 0.25), archMat, { cast: true });
  postL.position.set(rw / 2 - 2, 1.6, rd + 0.2);
  const postR = postL.clone();
  postR.position.x = rw / 2 + 2;
  const beam = mesh(new THREE.BoxGeometry(4.25, 0.3, 0.25), archMat);
  beam.position.set(rw / 2, 3.2, rd + 0.2);
  const neon = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.8), new THREE.MeshBasicMaterial({ map: pixelTex(neonCanvas('RESTROOM', '#7fe3ff', 96)), transparent: true, side: THREE.DoubleSide }));
  neon.position.set(rw / 2, 3.85, rd + 0.2);
  worldRoot.add(title, postL, postR, beam, neon);

  // the round wash basin in the middle of the plaza
  const bx = toX(BASIN.x);
  const bz = toZ(BASIN.y);
  const br = toX(BASIN.r);
  const stone = new THREE.MeshPhongMaterial({ color: '#d9dde3', shininess: 50 });
  const island = mesh(new THREE.CylinderGeometry(br, br * 1.08, 0.85, 20), stone, { cast: true, receive: true });
  island.position.set(bx, 0.425, bz);
  const water = mesh(new THREE.CylinderGeometry(br * 0.82, br * 0.82, 0.02, 20), new THREE.MeshPhongMaterial({ color: '#5fb4d6', emissive: '#14384a', shininess: 120 }));
  water.position.set(bx, 0.86, bz);
  const pillar = mesh(new THREE.CylinderGeometry(0.12, 0.16, 1.1, 10), mat(PAL.rail, { emissive: '#2a2010' }), { cast: true });
  pillar.position.set(bx, 1.4, bz);
  worldRoot.add(island, water, pillar);
  for (let k = 0; k < 4; k++) {
    const tap = mesh(new THREE.BoxGeometry(0.06, 0.06, 0.32), mat(PAL.rail));
    tap.position.set(bx + Math.sin((k * Math.PI) / 2) * 0.22, 1.7, bz + Math.cos((k * Math.PI) / 2) * 0.22);
    tap.rotation.y = (k * Math.PI) / 2;
    worldRoot.add(tap);
  }

  // benches in a ring around the basin, plants in the corners
  benchSpots.length = 0;
  const wood = mat('#8a5f38');
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
    const r = 3.4;
    const x = bx + Math.sin(a) * r;
    const z = bz + Math.cos(a) * r;
    const bench = mesh(new THREE.BoxGeometry(1.5, 0.12, 0.45), wood, { cast: true });
    bench.position.set(x, 0.45, z);
    bench.rotation.y = a + Math.PI / 2;
    const legs = mesh(new THREE.BoxGeometry(1.3, 0.42, 0.3), mat('#1c222d'));
    legs.position.set(x, 0.21, z);
    legs.rotation.y = a + Math.PI / 2;
    worldRoot.add(bench, legs);
    benchSpots.push({ x: x / U, y: z / U });
  }
  const corners = [[2.6, 2.6], [rw - 2.6, 2.6], [2.6, rd - 2.4], [rw - 2.6, rd - 2.4], [bx - 1.6, bz + 1.6], [bx + 1.6, bz - 1.6]];
  for (const [x, z] of corners) {
    const p = pixelSprite(PROPS.bigPlant, 0.075);
    p.position.set(x, 0, z);
    worldRoot.add(p);
  }

  // warm pendant lamps over the plaza
  const shade = new THREE.MeshBasicMaterial({ color: '#ffd38a' });
  const cord = new THREE.MeshBasicMaterial({ color: '#0d0f14' });
  // soft wash lights along each stall bank so the doors read in the dark
  for (const [x, z] of [[rw * 0.25, 1.2], [rw * 0.75, 1.2], [1.4, rd * 0.3], [1.4, rd * 0.65], [rw - 1.4, rd * 0.3], [rw - 1.4, rd * 0.65]]) {
    const wash = new THREE.PointLight('#ffb978', 9, 9, 1.4);
    wash.position.set(x, 2.8, z);
    lamps.add(wash);
  }
  for (const [x, z] of [[rw * 0.25, rd * 0.28], [rw * 0.75, rd * 0.28], [rw * 0.25, rd * 0.72], [rw * 0.75, rd * 0.72], [bx, bz]]) {
    const light = new THREE.PointLight('#ffc983', 22, 15, 1.6);
    light.position.set(x, 3.4, z);
    const bulb = mesh(new THREE.ConeGeometry(0.35, 0.3, 10, 1, true), shade);
    bulb.position.set(x, 3.6, z);
    const line = mesh(new THREE.CylinderGeometry(0.01, 0.01, 2.5, 4), cord);
    line.position.set(x, 5, z);
    lamps.add(light, bulb, line);
  }
}

// a point in a stall's local space, in world space
function stallWorld(i, lx, ly, lz) {
  const s = stallObjs[i];
  return s ? s.group.localToWorld(new THREE.Vector3(lx, ly, lz)) : new THREE.Vector3();
}

// ---------- stalls ----------

const stallObjs = [];
const stallHits = [];

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
  const rail = mesh(G.rail, M.rail);
  rail.position.set(STALL_M / 2, PART_TOP + 0.025, 0);

  // door with its own pixel texture
  const doorCanvas = document.createElement('canvas');
  doorCanvas.width = 20;
  doorCanvas.height = 24;
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

  // whoever sits here: upper body peeks over the door, feet show under it
  const sitter = new THREE.Mesh(G.card, new THREE.MeshBasicMaterial({ map: texOf(PROPS.poop), transparent: true, alphaTest: 0.5, side: THREE.DoubleSide }));
  sitter.position.set(STALL_M / 2, SIT_LIFT, SEAT_Z); // on the bowl, lifted so the whole face clears the door
  sitter.visible = false;
  const feet = pixelSprite(PROPS.poop);
  feet.position.set(STALL_M / 2, 0, -0.12);
  feet.visible = false;
  const marker = pixelSprite(PROPS.marker);
  marker.position.set(STALL_M / 2, 2.15 + SIT_LIFT, SEAT_Z);
  marker.visible = false;
  const halo = pixelSprite(PROPS.halo);
  halo.position.set(STALL_M / 2, 2.07 + SIT_LIFT, SEAT_Z);
  halo.visible = false;

  const pile = new THREE.Group();
  pile.position.set(0.84, PART_TOP + 0.05, 0.02);

  const hit = new THREE.Mesh(G.hit, M.hit);
  hit.position.set(STALL_M / 2, 1, 0.1);
  hit.userData.stall = i;

  const mosaic = new THREE.Mesh(G.mosaic, mosaicMat);
  mosaic.rotation.x = -Math.PI / 2;
  mosaic.position.set(STALL_M / 2 + 0.02, 1.33, -STALL_D / 2 + 0.05); // waist height: hides only the lower body
  mosaic.visible = false;

  g.add(part, cap, post, rail, hinge, toilet, sitter, mosaic, feet, marker, halo, pile, hit);

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
    i, group: g, hinge, lock, face, doorCanvas, doorTex, crack: 0, sitter, mosaic, feet, marker, halo, pile,
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
  while (s.pile.children.length > want) s.pile.remove(s.pile.children.at(-1));
  while (s.pile.children.length < want) {
    const k = s.pile.children.length;
    const p = pixelSprite(PROPS.poop, 0.035);
    p.position.set((((s.i * 7 + k * 13) % 3) - 1) * 0.02, k * 0.2, 0);
    s.pile.add(p);
  }
  s.pileShown = count;
}

// ---------- characters ----------

function makeWalker(u) {
  const look = lookFor(u);
  const spr = pixelSprite(body('front', { look }));
  const blob = new THREE.Mesh(G.blob, M.blob);
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.01;
  const marker = pixelSprite(PROPS.marker);
  marker.visible = false;
  const halo = pixelSprite(PROPS.halo);
  halo.visible = false;
  charRoot.add(spr, blob, marker, halo);
  return { data: u, spr, blob, marker, halo, look, rx: u.x, ry: u.y, facing: 0, view: 'front', phase: 0, idle: 9, walking: false };
}

function removeWalker(e) {
  charRoot.remove(e.spr, e.blob, e.marker, e.halo);
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

function connect() {
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  ws.onmessage = (e) => handle(JSON.parse(e.data));
  ws.onclose = () => {
    setHold(false);
    $('#online').textContent = '물 내리는 중...';
    setTimeout(connect, 1500);
  };
}

function send(msg) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
}

let greeted = false;
function handle(m) {
  if (m.t === 'welcome') {
    meId = m.you;
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
  $('#online').textContent = `${st.users.length}명 볼일 중`;
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

function tryKnock(i) {
  if (i < 0) return;
  sendMove(true);
  send({ t: 'knock', stall: i });
}

const ringBell = () => send({ t: 'bell' });
const jump = () => me.s === -1 && !me.rolling && send({ t: 'jump' });
// step up to the nearest spot on the basin's rim, then wash
function washHands() {
  const dx = me.x - BASIN.x;
  const dy = me.y - BASIN.y;
  const d = Math.hypot(dx, dy) || 1;
  const spot = { x: BASIN.x + (dx / d) * (BASIN.r + 40), y: BASIN.y + (dy / d) * (BASIN.r + 40) };
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
  return Math.hypot(me.x - BASIN.x, me.y - BASIN.y) < BASIN.r + 110;
}

function nearBench() {
  return benchSpots.findIndex((b) => Math.hypot(me.x - b.x, me.y - b.y) < 110);
}

function goSitOnBench(k) {
  target = { x: benchSpots[k].x, y: benchSpots[k].y };
  pendingEnter = -1;
  pendingBench = true;
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
  let vx = 0;
  let vy = 0;
  if (ix || iz) {
    vx = Math.cos(cam.yaw) * ix - Math.sin(cam.yaw) * iz;
    vy = -Math.sin(cam.yaw) * ix - Math.cos(cam.yaw) * iz;
  }
  const running = spaceHeld && (ix || iz) && !me.pd;
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
    me.x = clamp(me.x + (vx / len) * step, 45, ROOM_W - 45);
    me.y = clamp(me.y + (vy / len) * step, 45, ROOM_D - 40);
    // walk around the wash basin, not through it
    const bdx = me.x - BASIN.x;
    const bdy = me.y - BASIN.y;
    const bd = Math.hypot(bdx, bdy);
    const keepOut = BASIN.r + 35;
    if (bd < keepOut && bd > 0) {
      me.x = BASIN.x + (bdx / bd) * keepOut;
      me.y = BASIN.y + (bdy / bd) * keepOut;
    }
    // walking into the door of an empty stall goes inside
    if (ix || iz) {
      const i = nearestEmptyStall(me.x, me.y, 40);
      if (i >= 0 && (vx / len) * -LAYOUT[i].fx + (vy / len) * -LAYOUT[i].fy > 0.6) tryEnter(i);
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

const cam = { yaw: 0, pitch: 0.6, dist: 13, tYaw: 0, tPitch: 0.6, tDist: 13, fx: 11, fz: 20 };
const DIST_MIN = 3.5;
const YAW_MAX = 1000; // free rotation; the camera is kept inside the room instead
const DIST_MAX = 26;

function updateCamera(dt) {
  const k = 1 - Math.exp(-dt * 7);
  cam.yaw = lerpAngle(cam.yaw, cam.tYaw, k);
  cam.pitch = lerp(cam.pitch, cam.tPitch, k);
  cam.dist = lerp(cam.dist, cam.tDist, k);
  let fx = toX(me.x);
  let fz = toZ(me.y);
  if (me.s !== -1) {
    const door = stallWorld(me.s, STALL_M / 2, 0, 0.3);
    fx = door.x;
    fz = door.z;
  }
  const kf = 1 - Math.exp(-dt * 5);
  cam.fx = lerp(cam.fx, fx, kf);
  cam.fz = lerp(cam.fz, fz, kf);
  const cp = Math.cos(cam.pitch);
  // stay inside the room (or above the walls) so a wall never blocks the view
  const rw = toX(ROOM_W);
  let d = cam.dist;
  const at = (dd) => [cam.fx + Math.sin(cam.yaw) * cp * dd, 0.9 + Math.sin(cam.pitch) * dd, cam.fz + Math.cos(cam.yaw) * cp * dd];
  let [px, py, pz] = at(d);
  while (d > 2 && py < 5.4 && (px < 0.4 || px > rw - 0.4 || pz < 0.4)) {
    d -= 0.25;
    [px, py, pz] = at(d);
  }
  camera.position.set(px, py, pz);
  camera.lookAt(cam.fx, 0.9, cam.fz);
  sun.position.set(cam.fx - 6, 12, cam.fz + 9);
  sun.target.position.set(cam.fx, 0, cam.fz - 1);
}

// ---------- per-frame placement ----------

function viewFor(facing) {
  // which side of the character the camera sees
  let rel = facing - cam.yaw;
  while (rel > Math.PI) rel -= Math.PI * 2;
  while (rel < -Math.PI) rel += Math.PI * 2;
  const a = Math.abs(rel);
  if (a < Math.PI / 4) return 'front';
  if (a > (Math.PI * 3) / 4) return 'back';
  return rel > 0 ? 'right' : 'left';
}

function placeWalkers(dt, t) {
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
    e.spr.visible = !inStall;
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
    e.view = e.idle > 0.6 ? 'front' : viewFor(e.facing);
    const rolling = mine ? me.rolling : Boolean(u.r);
    const pantsDown = Boolean(u.pd) && !rolling;
    const face = exprOf(u, -1);
    const X = toX(e.rx);
    const Z = toZ(e.ry);
    let lift = 0;
    if (e.jumpT > 0) {
      e.jumpT += dt;
      lift = Math.sin(Math.PI * Math.min(1, e.jumpT / 0.45)) * 0.45;
      if (e.jumpT >= 0.45) e.jumpT = 0;
    }
    const washing = (e.washUntil || 0) > performance.now();
    if (u.b && !rolling) {
      setSpriteCanvas(e.spr, body('front', { face, look: e.look, mode: 'bench' }));
      e.spr.center.set(0.5, 0);
      e.spr.material.rotation = 0;
      e.spr.position.set(X, 0.3 + lift, Z);
      e.blob.position.set(X, 0.01, Z);
      e.halo.visible = false;
      e.marker.position.set(X, 1.25 + lift + (Math.floor(t / 300) % 2) * 0.04, Z);
      continue;
    }
    if (washing) e.view = viewFor(Math.atan2(BASIN.x - e.rx, BASIN.y - e.ry)); // look at the basin
    if (rolling) {
      setSpriteCanvas(e.spr, body('front', { face: 'dizzy', look: e.look, pantsDown: true }));
      e.spr.center.set(0.5, 0.5);
      e.spr.position.set(X, 0.55, Z);
      e.spr.material.rotation = (Math.floor(t / 90) % 4) * (Math.PI / 2);
    } else {
      const frame = e.walking ? (Math.floor(e.phase) % 2 ? 1 : 2) : 0;
      setSpriteCanvas(e.spr, body(e.view, { frame, face, look: e.look, pantsDown }));
      e.spr.center.set(0.5, 0);
      e.spr.material.rotation = 0;
      e.spr.position.set(X, (e.walking && Math.floor(e.phase) % 2 ? 0.04 : 0) + lift, Z);
    }
    e.blob.position.set(X, 0.01, Z);
    e.halo.visible = face === 'bliss' && !rolling;
    e.halo.position.set(X, 1.12, Z);
    e.marker.position.set(X, 1.25 + lift + (Math.floor(t / 300) % 2) * 0.04, Z);
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
    s.sitter.visible = Boolean(occ);
    s.mosaic.visible = Boolean(occ);
    s.feet.visible = false;
    s.marker.visible = occId === meId;
    if (occ) {
      const u = occ.data;
      const face = exprOf(u, i);
      setSpriteCanvas(s.sitter, body('front', { face, look: occ.look, mode: 'toilet' }));
      const jig = u.h && Math.floor(t / 70) % 2 ? 0.02 : 0;
      s.sitter.position.x = STALL_M / 2 + jig;
      s.sitter.rotation.y = cam.yaw - LAYOUT[i].rot; // turn toward the camera, but stay upright
      s.halo.visible = face === 'bliss';
      s.marker.position.y = 2.17 + SIT_LIFT + (Math.floor(t / 300) % 2) * 0.04;
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
    const from = stallWorld(m.stall, STALL_M / 2, 0.6, -1.0);
    const to = stallWorld(m.stall, 0.84, PART_TOP + 0.05 + k * 0.2, 0.02);
    const p = pixelSprite(PROPS.poop, 0.035);
    p.position.copy(from);
    fxRoot.add(p);
    flights.push({ p, from, to, t: 0, s });
    pop(to.clone().add(new THREE.Vector3(0, 0.45, 0)), m.id === meId ? `퐁당! 오늘 ${m.n}번째` : '퐁당');
  }
  if (m.id === meId) {
    flashUntil = performance.now() + 1300;
    buzz([30, 40, 90]);
  }
  plop(m.id === meId ? 1 : distVol(m.stall) * 0.3);
}

const lastKnockPop = new Map();
const distVol = (i) => (LAYOUT[i] ? clamp(1 - Math.hypot(LAYOUT[i].x - me.x, LAYOUT[i].y - me.y) / 1800, 0.08, 1) : 0.3);

function onKnock(m) {
  const s = stallObjs[m.stall];
  if (!s) return;
  s.shake = 0.2;
  const now = performance.now();
  if (now - (lastKnockPop.get(m.stall) || 0) > 500) {
    lastKnockPop.set(m.stall, now);
    pop(stallWorld(m.stall, STALL_M / 2 + (Math.random() - 0.5) * 0.4, 1.2, 0.2), '똑똑');
  }
  const mine = stalls[m.stall] === meId;
  playKnock(mine ? 0.5 : m.by === meId ? 0.35 : distVol(m.stall) * 0.25);
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
      chip.position.copy(stallWorld(m.stall, 0.1 + Math.random() * 0.9, DOOR_BOT + Math.random() * 1.1, 0.05));
      fxRoot.add(chip);
      debris.push({ o: chip, v: out(1 + Math.random() * 2.5, (Math.random() - 0.5) * 3).setY(1 + Math.random() * 3), w: new THREE.Vector3(Math.random() * 10, Math.random() * 10, Math.random() * 10), life: 1.3 });
    }
  }
  pop(stallWorld(m.stall, STALL_M / 2, 1.9, 0.1), '와장창!');
  if (m.victim === meId) toast('문이 부서졌어요! 바지부터 올리는 중...');
  if (m.by === meId) toast('문을 열고(?) 들어왔어요. 미안해요~');
  playCrash(m.victim === meId || m.by === meId ? 0.6 : distVol(m.stall) * 0.45);
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
  playSound('bird', m.id === meId ? 1.6 : Math.max(0.5, distVol(m.stall)) * 1.1);
}

const washFx = [];
const streamGeo = new THREE.CylinderGeometry(0.03, 0.05, 1, 6);

function onWash(m) {
  const e = users.get(m.id);
  if (!e) return;
  e.washUntil = performance.now() + 2200;
  const ux = toX(e.rx);
  const uz = toZ(e.ry);
  const bx = toX(BASIN.x);
  const bz = toZ(BASIN.y);
  const len = Math.hypot(ux - bx, uz - bz) || 1;
  const dir = { x: (ux - bx) / len, z: (uz - bz) / len }; // from the basin toward the person
  const hands = new THREE.Vector3(ux - dir.x * 0.35, 0.95, uz - dir.z * 0.35);
  pop(hands.clone().add(new THREE.Vector3(0, 0.45, 0)), '뽀득뽀득');
  if (!document.hidden) {
    // a stream of water from the tap toward this person's hands
    const top = 1.68;
    const bottom = 0.88;
    const stream = new THREE.Mesh(streamGeo, new THREE.MeshBasicMaterial({ color: '#9fe0ff', transparent: true, opacity: 0.8 }));
    stream.position.set(bx + dir.x * 0.42, (top + bottom) / 2, bz + dir.z * 0.42);
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
      d.position.set(bx + dir.x * 0.42, 0.9, bz + dir.z * 0.42);
      fxRoot.add(d);
      washFx.push({ o: d, t: -k * 0.25, life: 0.6, kind: 'drop', vx: (Math.random() - 0.5) * 0.8, vz: (Math.random() - 0.5) * 0.8, vy: 1 + Math.random() * 0.8 });
    }
  }
  playWash(m.id === meId ? 0.5 : 0.15);
  if (m.id === meId) setTimeout(() => toast('손 씻기 끝! 뽀송뽀송해졌어요'), 1800);
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
  if (seat !== -1) return stallWorld(seat, STALL_M / 2, 2.2 + SIT_LIFT, SEAT_Z);
  return new THREE.Vector3(toX(e.rx), 1.2, toZ(e.ry));
}

function updateLabels(dt) {
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i];
    f.age += dt;
    if (f.id) {
      const h = headOf(f.id);
      if (h) f.anchor.copy(h);
    }
    const pos = f.anchor.clone();
    pos.y += (f.stack || 0) + f.rise * Math.min(1, f.age / f.life);
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
  if (Math.hypot(e.rx - BASIN.x, e.ry - BASIN.y) < BASIN.r + 140) return '세면대';
  return '광장';
}

function feedChat(id, text) {
  const e = users.get(id);
  const box = $('#feed');
  const row = document.createElement('div');
  row.className = id === meId ? 'line mine' : 'line';
  const dot = document.createElement('i');
  dot.style.background = e ? e.look.c : '#ccc';
  const where = document.createElement('b');
  where.textContent = id === meId ? `나 · ${placeOf(id)}` : placeOf(id);
  const msg = document.createElement('span');
  msg.textContent = text;
  row.append(dot, where, msg);
  box.append(row);
  while (box.children.length > 6) box.firstChild.remove();
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
  else if (!holding) text = p ? `숨 고르고 다시 꾹 · ${p}%` : '꾹 눌러서 힘주기';
  else text = p < 34 ? '끄응...' : p < 67 ? '으으읏...!' : '거의 다 왔어!!';
  const span = b.querySelector('span');
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
    : near ? 'near' : nearOcc ? 'knock' : bench >= 0 ? `bench${bench}` : anyFree ? 'far' : 'full';
  if (mode === actionMode) return;
  actionMode = mode;
  const bar = $('#actions');
  bar.innerHTML = '';
  const pad = $('#pushPad');
  pad.innerHTML = '';
  if (mode === 'inside') {
    const push = mainBtn('poop', '꾹 눌러서 힘주기', null, 'push');
    push.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      push.setPointerCapture(e.pointerId);
      setHold(true);
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) => push.addEventListener(ev, () => setHold(false)));
    pad.append(push); // only the poop button lives in the bottom-right
    bar.append(miniBtn('bird', '에티켓벨', ringBell), miniBtn('exit', '나가기', exitStall));
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
  } else if (mode === 'knock') {
    bar.append(mainBtn('knock', '똑똑, 계세요?', () => tryKnock(nearestOccupiedStall(me.x, me.y)), 'knock'));
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
  src.connect(gain).connect(actx().destination);
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
  osc.connect(gain).connect(actx().destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

// the poop-drop sound file; a synth blip only until the file has loaded
function plop(volume) {
  if (!soundOn) return;
  if (buffers.plop) playSound('plop', volume);
  else tone('square', 620, 120, 0.2, volume * 0.5);
}

function playKnock(volume) {
  if (!soundOn || volume <= 0) return;
  tone('triangle', 190, 70, 0.09, volume);
  tone('triangle', 175, 65, 0.09, volume * 0.85, 0.13);
}

function playWash(volume) {
  if (!soundOn) return;
  for (let k = 0; k < 5; k++) tone('sine', 900 + Math.random() * 500, 500, 0.12, volume * 0.3, k * 0.16);
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
  src.connect(gain).connect(actx().destination);
  src.start();
  tone('sawtooth', 140, 40, 0.4, volume * 0.5);
}

$('#soundBtn').addEventListener('click', async () => {
  soundOn = !soundOn;
  $('#soundBtn').innerHTML = soundOn ? icoImg('soundOn') : `${icoImg('soundOff')}<span>소리 켜기</span>`;
  $('#soundBtn').setAttribute('aria-label', soundOn ? '소리 끄기' : '소리 켜기');
  if (soundOn) {
    await actx().resume();
    await loadSounds();
  }
});

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
    if (me.s !== -1) {
      if (e.code === 'ArrowDown' || e.code === 'KeyS') exitStall();
      return;
    }
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
  } else if (e.code === 'KeyQ') {
    cam.tYaw = clamp(cam.tYaw + 0.35, -YAW_MAX, YAW_MAX);
  } else if (e.code === 'KeyE') {
    cam.tYaw = clamp(cam.tYaw - 0.35, -YAW_MAX, YAW_MAX);
  } else if (e.key === '=' || e.key === '+') {
    cam.tDist = clamp(cam.tDist * 0.8, DIST_MIN, DIST_MAX);
  } else if (e.key === '-' || e.key === '_') {
    cam.tDist = clamp(cam.tDist * 1.25, DIST_MIN, DIST_MAX);
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
  const objs = stallHits.filter(Boolean);
  if (floorMesh) objs.push(floorMesh);
  return raycaster.intersectObjects(objs, false)[0] || null;
}

function handleTap(x, y) {
  if (!me.ready || me.s !== -1 || me.rolling) return;
  const hit = pick(x, y);
  if (!hit) return;
  const i = hit.object.userData.stall;
  if (i !== undefined) {
    if (freeFor(i)) walkToStall(i);
    else {
      target = { x: LAYOUT[i].x, y: LAYOUT[i].y };
      pendingEnter = -1;
      showTapMark(toX(target.x), toZ(target.y));
    }
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
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
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
      canvasEl.style.cursor = hoverStall >= 0 ? 'pointer' : '';
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
      cam.tYaw = clamp(cam.tYaw - dx * 0.006, -YAW_MAX, YAW_MAX);
      cam.tPitch = clamp(cam.tPitch + dy * 0.004, 0.2, 1.3);
    }
  } else if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinchDist > 0 && d > 0) cam.tDist = clamp((cam.tDist * pinchDist) / d, DIST_MIN, DIST_MAX);
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
  cam.tDist = clamp(cam.tDist * (1 + e.deltaY * 0.0015), DIST_MIN, DIST_MAX);
}, { passive: false });
document.addEventListener('gesturestart', (e) => e.preventDefault());

// ---------- start ----------

$('#soundBtn').innerHTML = `${icoImg('soundOff')}<span>소리 켜기</span>`;
$('#peopleIcon').innerHTML = icoImg('people');
$('#todayIcon').innerHTML = icoImg('poop');

document.fonts.load('9px Galmuri9').finally(() => {
  connect();
  requestAnimationFrame(frame);
});
