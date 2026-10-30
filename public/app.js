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
const DOOR_BOT = 0.3; // the famous American gap: feet show underneath
const DOOR_TOP = 0.9; // a low half-door, so whoever sits inside shows their whole face over it
const SIT_Y = 0.1; // the sitter perches on the bowl, feet just off the floor
const PART_BOT = 0.3;
const PART_TOP = 1.75;
const SEAT_Z = -0.88; // where the person on the toilet sits (bowl center is at -1.1)
const PX_M = 0.05; // meters per sprite pixel
const PILE_MAX = 10;

const INK = '#2a1f2b';
const SKIN = '#ffd9b8';
const HAIRS = ['#3b2a20', '#5a3a24', '#1f1b22', '#8a5530', '#4a3460', '#c26a3a', '#d8b26a', '#7a7a86'];
// a casual fast-food restroom: butter-yellow tile, ketchup-red doors, cream stalls, warm daylight
const OG = new URLSearchParams(location.search).has('og'); // ?og renders the link-preview frame

const PAL = {
  sky: '#f2d98a', wall: '#f8d978', wallB: '#fff6e0', wallLine: '#ecd49a', band: '#d8382e', bandGlow: '#000000',
  floorA: '#f8d978', floorB: '#fff6e0', floorLine: '#ecd49a',
  door: '#dd4636', doorDark: '#b0342a', doorLight: '#f2705c', number: '#ffffff',
  part: '#fbf1d9', partTop: '#ffffff', partGlow: '#000000', rail: '#b9bec5', railGlow: '#000000',
  hemi: ['#fff8e6', '#c8a868', 1.05], moon: ['#fff1d2', 1.1],
  lamps: ['#fff3dc'], lampPower: 3.5,
  water: ['#8fd0ec', '#1d4a5e'], bench: '#dd4636', stone: '#ffffff',
  sign: '#d8382e', title: '#d8382e',
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
let soundOn = true; // on from the start (quietly); browsers still need one tap or key before it can play
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

// chibi proportions: a big round head with full cheeks, low-set sparkly eyes, a small body, short legs
const HEAD = {
  front: [
    '....HHHHHH....', '..HhhHHHHHHH..', '.HhhHHHHHHHHH.', '.HHHHHHHHHHHH.', 'HHHHHHHHHHHHHH', 'HHSSSSSSSSSSHH',
    'HSSSSSSSSSSSSH', 'SSSSSSSSSSSSSS', 'SSSSSSSSSSSSSS', '.SSSSSSSSSSSS.', '..SSSSSSSSSS..',
  ],
  back: [
    '....HHHHHH....', '..HHHHHHHhhH..', '.HHHHHHHHhhHH.', '.HHHHHHHHHHHH.', 'HHHHHHHHHHHHHH', 'HHHHHHHHHHHHHH',
    'HHHHHHHHHHHHHH', 'HHHHHHHHHHHHHH', 'HHHHHHHHHHHHHH', '.HHHHHHHHHHHH.', '...ssssssss...',
  ],
  side: [
    '....HHHHHH....', '...HHHHHhhHH..', '..HHHHHHHhhHH.', '..HHHHHHHHHHH.', '.HHHHHHHHHSHH.', '.HHHHHHSSSSSS.',
    '.HHHHHSSSSSSS.', '.HHHHSSSSSSSSS', '.HHHHSSSSSSSSS', '..HHSSSSSSSS..', '....SSSSSSS...',
  ],
};
const BODY = {
  front: ['....CCCCCC....', '...CCCCCCCC...', '..SCCCCCCCCS..', '...cCCCCCCc...'],
  back: ['....CCCCCC....', '...CCCCCCCC...', '..SCCCCCCCCS..', '...cCCCCCCc...'],
  side: ['.....CCCC.....', '....CCCCCC....', '....CCCSCC....', '....cCCCCc....'],
};
const HIPS = { front: '....PPPPPP....', back: '....PPPPPP....', side: '.....PPPP.....' };
const UNDIES = { front: '....WWWWWW....', back: '....WWWWWW....', side: '.....WWWW.....' };
const LEGS = {
  front: [
    ['....PP..PP....', '....BB..BB....'],
    ['...PP....PP...', '...BB....BB...'],
    ['.....PPPP.....', '.....BBBB.....'],
  ],
  side: [
    ['.....PPP......', '.....BBBB.....'],
    ['....PP..PP....', '...BB...BBB...'],
    ['.....PPPP.....', '.....BBBB.....'],
  ],
};
const LEGS_DOWN = {
  front: ['....SS..SS....', '...PPP..PPP...', '....BB..BB....'],
  side: ['.....SS.S.....', '....PPPPPP....', '.....BB.BB....'],
};

// faces are painted over the front head: eyes on rows 6-7, cheeks on row 8, mouth on rows 9-10
const FACE_COL = { K: INK, W: '#ffffff', B: '#7cc6ff', R: '#ff9fb2', T: '#ff6b81' };
const EYES = { W: [[3, 6], [9, 6]], K: [[4, 6], [3, 7], [4, 7], [10, 6], [9, 7], [10, 7]] };
const CHEEKS = [[1, 8], [2, 8], [11, 8], [12, 8]];
const makeFace = (parts) => {
  const out = { K: [], W: [], B: [], R: [...CHEEKS], T: [] };
  for (const p of parts) for (const [k, pts] of Object.entries(p)) out[k].push(...pts);
  return out;
};
const FACES = {
  idle: makeFace([EYES, { K: [[6, 9], [7, 9]] }]),
  neutral: makeFace([EYES, { K: [[5, 9], [6, 9], [7, 9], [8, 9]] }]),
  urgent: makeFace([EYES, { K: [[5, 9], [8, 9]], W: [[6, 9], [7, 9]], B: [[13, 5], [13, 6]] }]),
  strain: makeFace([{ K: [[3, 6], [4, 7], [3, 8], [10, 6], [9, 7], [10, 8], [5, 9], [6, 10], [7, 9], [8, 10]], B: [[13, 4], [13, 5]] }]),
  ok: makeFace([EYES, { K: [[5, 9], [6, 10], [7, 10], [8, 9]] }]),
  bliss: makeFace([{ K: [[2, 7], [3, 6], [4, 7], [9, 7], [10, 6], [11, 7], [5, 9], [6, 10], [7, 10], [8, 9]], T: [[6, 9], [7, 9]] }]),
  relaxed: makeFace([{ K: [[3, 7], [4, 7], [9, 7], [10, 7], [6, 9], [7, 9]] }]),
  dizzy: makeFace([{ K: [[2, 6], [4, 6], [3, 7], [2, 8], [4, 8], [9, 6], [11, 6], [10, 7], [9, 8], [11, 8], [5, 10], [6, 9], [7, 10], [8, 9]] }]),
  shock: makeFace([{ K: [[3, 6], [4, 6], [3, 7], [4, 7], [9, 6], [10, 6], [9, 7], [10, 7], [6, 9], [7, 9], [6, 10], [7, 10]], B: [[13, 4], [13, 5]] }]),
};
const SIDE_FACE = { W: [[10, 6]], K: [[11, 6], [10, 7], [11, 7], [12, 9]], R: [[10, 8], [11, 8]] };

// every visitor gets a look picked from their id: hair style, skin, cap, stripes, pants
const SKINS = ['#ffd9b8', '#f6c8a2', '#e8b08a', '#c98e64', '#9a6644'];
const STYLES_GIRL = ['long', 'pigtails', 'ponytail', 'bob', 'bun'];
const STYLES_BOY = ['short', 'cap', 'curly', 'buzz', 'short'];
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
  const girl = (h >>> 27) % 2 === 0; // about half the visitors, told apart only by longer hair
  const look = {
    c: u.c, skin: pick(SKINS, 0), h: pick(HAIRS, 3), style: pick(girl ? STYLES_GIRL : STYLES_BOY, 7), pants: pick(PANTS, 11),
    cap: pick(CAPS, 15), stripe: (h >>> 23) % 3 === 0,
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
        set(r, 0, 'H');
        set(r, 13, 'H');
      }
      for (const r of [9, 10]) {
        set(r, 1, 'H');
        set(r, 12, 'H');
      }
    } else if (v === 'back') {
      for (let r = 9; r <= 10; r++) for (let c = 0; c <= 13; c++) set(r, c, 'H');
    } else {
      for (let r = 7; r <= 10; r++) {
        set(r, 1, 'H');
        set(r, 2, 'H');
        set(r, 3, 'H');
      }
    }
  } else if (style === 'cap') {
    for (let r = 0; r <= 3; r++) {
      swap(r, 'H', 'Q');
      swap(r, 'h', 'Q');
    }
    if (v === 'front') rows[4] = 'QQQQQQQQQQQQQQ'.split('');
    else if (v === 'side') rows[4] = '.QQQQQQQQQQQQQ'.split('');
    else swap(4, 'H', 'Q');
  } else if (style === 'bun') {
    rows = ['.....HHHH.....'.split(''), ...rows];
    dy = 1;
  } else if (style === 'curly') {
    rows[0] = '..HH.HHHH.HH..'.split('');
    if (v !== 'side') {
      set(6, 0, 'H');
      set(6, 13, 'H');
      set(9, 0, 'H');
      set(9, 13, 'H');
    }
  } else if (style === 'bob') {
    if (v === 'front') {
      for (let r = 5; r <= 9; r++) {
        set(r, 0, 'H');
        set(r, 13, 'H');
      }
      set(10, 1, 'H');
      set(10, 12, 'H');
    } else if (v === 'back') {
      for (let r = 9; r <= 10; r++) for (let c = 0; c <= 13; c++) set(r, c, 'H');
    } else {
      for (let r = 7; r <= 10; r++) for (let c = 1; c <= 3; c++) set(r, c, 'H');
    }
  } else if (style === 'buzz') {
    rows[0] = '..............'.split('');
    rows[1] = '...HHHHHHHH...'.split('');
    if (v === 'front') {
      rows[4] = 'HHSSSSSSSSSSHH'.split('');
      rows[5] = 'HSSSSSSSSSSSSH'.split('');
    }
  }
  return { rows: rows.map((r) => r.join('')), dy };
}

// hair that falls past the head (long hair, pigtails, ponytails), painted onto the finished rows
function dressHair(lines, v, look, dy) {
  const rows = lines.map((r) => r.split(''));
  const set = (r, c, ch) => {
    const row = rows[r + dy];
    if (row && c >= 0 && c < row.length) row[c] = ch;
  };
  const st = look.style;
  if (st === 'long') {
    if (v === 'front') {
      for (const r of [11, 12]) for (const c of [1, 2, 11, 12]) set(r, c, 'H');
      set(13, 1, 'H');
      set(13, 12, 'H');
    } else if (v === 'back') {
      for (const r of [11, 12]) for (let c = 3; c <= 10; c++) set(r, c, 'H');
      for (let c = 4; c <= 9; c++) set(13, c, 'H');
    } else {
      for (const r of [11, 12]) for (const c of [3, 4]) set(r, c, 'H');
    }
  } else if (st === 'pigtails') {
    if (v === 'side') {
      for (let r = 8; r <= 12; r++) for (const c of [0, 1]) set(r, c, 'H');
    } else {
      set(9, 0, 'H');
      set(9, 13, 'H');
      for (let r = 10; r <= 13; r++) for (const c of [0, 1, 12, 13]) set(r, c, 'H');
    }
  } else if (st === 'ponytail') {
    if (v === 'back') {
      for (let r = 11; r <= 13; r++) for (const c of [6, 7]) set(r, c, 'H');
    } else if (v === 'side') {
      for (let r = 4; r <= 9; r++) set(r, 0, 'H');
    }
  }
  rows.forEach((r, i) => (lines[i] = r.join('')));
}

// a frosted censor: chunky, slightly see-through white blocks over the lower body
const FROST = ['#ffffff', '#f3f6f8', '#e7ecf0', '#fbfcfd', '#dde4ea', '#eef2f5'];
function mosaicOver(c, top, height) {
  const g = c.getContext('2d');
  g.globalAlpha = 0.88;
  for (let y = 0; y < height; y += 2) {
    for (let x = 2; x < 12; x += 2) {
      g.fillStyle = FROST[(x * 7 + y * 13 + x * y) % FROST.length];
      g.fillRect(x + 1, top + y + 1, 2, 2);
    }
  }
  g.globalAlpha = 1;
}

const charCache = new Map();
// mode: 'stand' (walking), 'toilet' (sat on the bowl) or 'bench'
function body(view, { frame = 0, face = 'idle', look, pantsDown = false, mode = 'stand' }) {
  const key = `${view}|${frame}|${face}|${look.key}|${pantsDown}|${mode}`;
  let c = charCache.get(key);
  if (c) return c;
  const v = view === 'back' ? 'back' : view === 'front' ? 'front' : 'side';
  const legView = v === 'side' ? 'side' : 'front';
  const { rows: head, dy } = headRows(v, look.style);
  const rows = [...head, ...BODY[v].map((r, k) => (look.stripe && k % 2 === 1 ? r.replace(/C/g, 'L') : r))];
  dressHair(rows, v, look, dy);
  const hips = rows.length;
  let censor = null;
  if (mode === 'toilet') {
    // sat on the bowl: knees forward, short shins, pants round the ankles, feet on the floor
    rows.push(UNDIES.front, '...SSSSSSSS...');
    for (let k = 0; k < 5; k++) rows.push('....SS..SS....');
    rows.push('...PPP..PPP...', '....BB..BB....'); // the floating censor in front covers this (see makeStall)
  } else if (mode === 'bench') {
    rows.push(HIPS.front, '...PPPPPPPP...', '....BB..BB....');
  } else {
    rows.push(pantsDown ? UNDIES[v] : HIPS[v]);
    rows.push(...(pantsDown ? LEGS_DOWN[legView] : LEGS[legView][frame]));
    if (pantsDown) censor = [hips - 1, 4];
  }
  const pal = {
    H: look.h, Q: look.cap, S: look.skin, s: shade(look.skin, -0.12), C: look.c, c: shade(look.c, -0.22), L: shade(look.c, 0.25),
    h: shade(look.h, 0.45), P: look.pants, B: '#2c2630', W: '#ffffff',
  };
  const shift = (pts) => pts.map(([x, y]) => [x, y + dy]);
  const extra = [];
  if (v === 'front') {
    for (const [k, pts] of Object.entries(FACES[face] || FACES.idle)) extra.push([FACE_COL[k], shift(pts)]);
  } else if (v === 'side') {
    for (const [k, pts] of Object.entries(SIDE_FACE)) extra.push([FACE_COL[k], shift(pts)]);
  }
  c = sprite(rows, pal, extra);
  if (censor) mosaicOver(c, censor[0], censor[1]);
  if (view === 'left') c = flip(c);
  charCache.set(key, c);
  return c;
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
  soundOn: icon(['...S.....', '..SS..W..', 'SSSS.W.W.', 'SSSS.W.W.', '..SS..W..', '...S.....']),
  soundOff: icon(['...S.....', '..SS.....', 'SSSS.x.x.', 'SSSS..x..', '..SS.x.x.', '...S.....']),
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
  PIX = W >= 900 ? 1.5 : 1.25; // render a little small and scale up: a light pixel-art touch, not too rough
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
  for (let y = 0; y < 2; y++) {
    for (let x = 0; x < 2; x++) {
      g.fillStyle = (x + y) % 2 ? PAL.wallB : PAL.wall;
      g.fillRect(x * 8, y * 8, 8, 8);
    }
  }
  g.fillStyle = PAL.wallLine;
  g.fillRect(0, 7, 16, 1);
  g.fillRect(0, 15, 16, 1);
  g.fillRect(7, 0, 1, 16);
  g.fillRect(15, 0, 1, 16);
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
// the entrance: a lit sign box, a striped awning with a scalloped hem, a welcome mat
const entranceSignCanvas = () => canvas(96, 18, (g) => {
  g.fillStyle = PAL.sign;
  g.fillRect(0, 0, 96, 18);
  g.fillStyle = '#fffaf0';
  g.fillRect(2, 2, 92, 14);
  g.font = '11px Galmuri11';
  g.textBaseline = 'middle';
  g.textAlign = 'center';
  g.fillStyle = PAL.sign;
  g.fillText('RESTROOM', 48, 9);
  g.drawImage(PROPS.poop, 5, 5);
  g.drawImage(PROPS.poop, 83, 5);
});
const awningCanvas = canvas(8, 4, (g) => {
  for (let x = 0; x < 8; x++) {
    g.fillStyle = x % 4 < 2 ? PAL.sign : '#fffaf0';
    g.fillRect(x, 0, 1, 4);
  }
});
const valanceCanvas = canvas(8, 4, (g) => {
  for (let x = 0; x < 8; x++) {
    g.fillStyle = x % 4 < 2 ? PAL.sign : '#fffaf0';
    g.fillRect(x, 0, 1, x % 4 === 0 || x % 4 === 3 ? 2 : 4); // scallops
  }
});
const matCanvas = () => canvas(56, 22, (g) => {
  g.fillStyle = '#8f2a22';
  g.fillRect(0, 0, 56, 22);
  g.fillStyle = '#b8392d';
  g.fillRect(2, 2, 52, 18);
  g.font = '9px Galmuri9';
  g.textBaseline = 'middle';
  g.textAlign = 'center';
  g.fillStyle = '#ffe9b0';
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
    g.fillStyle = INK;
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
  door: new THREE.BoxGeometry(DOOR_W, DOOR_TOP - DOOR_BOT, 0.04),
  lock: new THREE.BoxGeometry(0.06, 0.04, 0.02),
  bowl: new THREE.CylinderGeometry(0.2, 0.15, 0.4, 12),
  seat: new THREE.TorusGeometry(0.17, 0.035, 6, 14),
  water: new THREE.CircleGeometry(0.13, 12),
  tank: new THREE.BoxGeometry(0.46, 0.38, 0.2),
  hit: new THREE.BoxGeometry(STALL_M, 2, 0.6),
  blob: new THREE.CircleGeometry(0.28, 14),
  chip: new THREE.BoxGeometry(0.06, 0.04, 0.03),
  card: new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0), // bottom-anchored upright card
  censor: new THREE.PlaneGeometry(0.8, 0.75), // lies flat over the lap
};

// the censor that hovers over the lap of whoever sits on a toilet: chunky frosted blocks, seen from above
const censorMat = new THREE.MeshBasicMaterial({
  map: pixelTex(canvas(7, 5, (g) => {
    for (let y = 0; y < 5; y++) for (let x = 0; x < 7; x++) {
      g.fillStyle = FROST[(x * 7 + y * 13 + x * y) % FROST.length];
      g.fillRect(x, y, 1, 1);
    }
  })),
  transparent: true,
  opacity: 0.97, // nearly solid, so nothing shows through from any angle
  side: THREE.DoubleSide,
  depthWrite: false,
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
  ft.repeat.set(fw / 0.9, fd / 0.9);
  floorMesh = mesh(new THREE.PlaneGeometry(fw, fd), new THREE.MeshLambertMaterial({ map: ft }), { receive: true });
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.position.set(rw / 2, 0, (rd + back) / 2);
  worldRoot.add(floorMesh);
  buildOutside(rw, rd, back);

  // three walls with some thickness: tiles inside, red brick outside, real window openings in the back
  const T = 0.3; // wall thickness
  const tiles = (w, h) => {
    const t = pixelTex(wallCanvas, true);
    t.repeat.set(w / 0.6, h / 0.6);
    return new THREE.MeshLambertMaterial({ map: t });
  };
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
  // side walls are plain boxes: the inner face gets tiles, everything else brick
  const sideLen = rd + STALL_D;
  for (const [x, inner] of [[back - T / 2, 0], [rw - back + T / 2, 1]]) {
    const mats = Array.from({ length: 6 }, (_, k) => (k === inner ? tiles(sideLen, wallH) : bricks(k < 2 ? sideLen : T, k === 2 || k === 3 ? sideLen : wallH)));
    const m = mesh(new THREE.BoxGeometry(T, wallH, sideLen), mats, { cast: true, receive: true });
    m.position.set(x, wallH / 2, (rd + back) / 2);
    worldRoot.add(m);
  }
  band(sideLen, back, (rd + back) / 2, Math.PI / 2);
  band(sideLen, rw - back, (rd + back) / 2, -Math.PI / 2);

  // the back wall: a slab with window holes, tiled inside, brick outside, glazed and framed
  const bw = fw + 2 * T;
  const winW = 1.3;
  const winH = 1.6;
  const winY = 3.25;
  const winXs = [2.2, 6.6, rw - 6.6, rw - 2.2]; // the middle is left for the sign
  const shape = new THREE.Shape();
  shape.moveTo(-bw / 2, 0);
  shape.lineTo(bw / 2, 0);
  shape.lineTo(bw / 2, wallH);
  shape.lineTo(-bw / 2, wallH);
  shape.closePath();
  for (const wx of winXs) {
    const hole = new THREE.Path();
    const x0 = wx - rw / 2 - winW / 2;
    hole.moveTo(x0, winY - winH / 2);
    hole.lineTo(x0, winY + winH / 2);
    hole.lineTo(x0 + winW, winY + winH / 2);
    hole.lineTo(x0 + winW, winY - winH / 2);
    hole.closePath();
    shape.holes.push(hole);
  }
  const slab = new THREE.ShapeGeometry(shape);
  const inner = new THREE.MeshLambertMaterial({ map: pixelTex(wallCanvas, true) });
  inner.map.repeat.set(1 / 0.6, 1 / 0.6); // shape UVs are in metres
  const outer = new THREE.MeshLambertMaterial({ map: pixelTex(brickCanvas, true), side: THREE.BackSide });
  outer.map.repeat.set(1 / 0.8, 1 / 0.4);
  const backIn = mesh(slab, inner, { receive: true });
  backIn.position.set(rw / 2, 0, back);
  const backOut = mesh(slab, outer, { cast: true, receive: true });
  backOut.position.set(rw / 2, 0, back - T);
  const wallTop = mesh(new THREE.BoxGeometry(bw, 0.06, T), bricks(bw, T));
  wallTop.position.set(rw / 2, wallH, back - T / 2);
  worldRoot.add(backIn, backOut, wallTop);
  band(fw, rw / 2, back, 0);

  const frameMat = mat('#fffaf0');
  const glassMat = new THREE.MeshBasicMaterial({ color: '#d6eef8', transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });
  const glareMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide });
  for (const wx of winXs) {
    const z = back - T / 2;
    // reveals: the four inner sides of the opening
    for (const [w, h, dx, dy] of [[winW, 0.05, 0, -winH / 2], [winW, 0.05, 0, winH / 2], [0.05, winH, -winW / 2, 0], [0.05, winH, winW / 2, 0]]) {
      const r = mesh(new THREE.BoxGeometry(w + 0.05, h, T), frameMat, { receive: true });
      r.position.set(wx + dx, winY + dy, z);
      worldRoot.add(r);
    }
    // mullions: a cross of white bars
    const v = mesh(new THREE.BoxGeometry(0.06, winH, 0.06), frameMat);
    v.position.set(wx, winY, z);
    const hz = mesh(new THREE.BoxGeometry(winW, 0.06, 0.06), frameMat);
    hz.position.set(wx, winY + 0.12, z);
    // glass, with two pale glare strips
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(winW, winH), glassMat);
    glass.position.set(wx, winY, z);
    const g1 = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.7), glareMat);
    g1.position.set(wx - 0.32, winY + 0.25, z + 0.01);
    g1.rotation.z = -0.5;
    const g2 = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.45), glareMat);
    g2.position.set(wx - 0.18, winY + 0.32, z + 0.01);
    g2.rotation.z = -0.5;
    // a sill on the inside
    const sill = mesh(new THREE.BoxGeometry(winW + 0.2, 0.06, 0.16), frameMat, { cast: true });
    sill.position.set(wx, winY - winH / 2 - 0.03, back + 0.08);
    worldRoot.add(v, hz, glass, g1, g2, sill);
  }

  // glowing signs: the name over the back bank, RESTROOM over the open entrance
  const title = new THREE.Mesh(new THREE.PlaneGeometry(4, 1), new THREE.MeshBasicMaterial({ map: pixelTex(neonCanvas('똥타', PAL.title || '#ff8fb8', 64)), transparent: true }));
  title.position.set(rw / 2, 4.2, back + 0.03);
  worldRoot.add(title);
  buildEntrance(rw / 2, rd + 0.2);

  // the plaza: a red ring on the floor, a basin with a golden poop on top, arc benches, planters, lights
  const bx = toX(BASIN.x);
  const bz = toZ(BASIN.y);
  const br = toX(BASIN.r);
  const inlayR = 4.5;
  const border = mesh(new THREE.RingGeometry(inlayR, inlayR + 0.18, 48), new THREE.MeshLambertMaterial({ color: PAL.band, polygonOffset: true, polygonOffsetFactor: -1 }), { receive: true });
  border.rotation.x = -Math.PI / 2;
  border.position.set(bx, 0.005, bz);
  worldRoot.add(border);

  const white = mat('#fffaf0');
  const red = mat(PAL.band);
  const chrome = new THREE.MeshPhongMaterial({ color: '#c9ced6', shininess: 90, specular: '#ffffff' });
  const body = mesh(new THREE.CylinderGeometry(br, br * 1.06, 0.78, 24), white, { cast: true, receive: true });
  body.position.set(bx, 0.39, bz);
  const stripe = mesh(new THREE.CylinderGeometry(br * 1.015, br * 1.03, 0.12, 24), red);
  stripe.position.set(bx, 0.5, bz);
  const rim = mesh(new THREE.CylinderGeometry(br * 1.04, br * 1.04, 0.08, 24), white, { receive: true });
  rim.position.set(bx, 0.82, bz);
  const water = mesh(new THREE.CylinderGeometry(br * 0.86, br * 0.86, 0.02, 24), new THREE.MeshPhongMaterial({ color: PAL.water[0], emissive: PAL.water[1], shininess: 120 }));
  water.position.set(bx, 0.86, bz);
  const column = mesh(new THREE.CylinderGeometry(0.1, 0.14, 1.0, 12), chrome, { cast: true });
  column.position.set(bx, 1.35, bz);
  const cap = mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 16), chrome);
  cap.position.set(bx, 1.86, bz);
  worldRoot.add(body, stripe, rim, water, column, cap);
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2 + Math.PI / 4;
    const tap = mesh(new THREE.BoxGeometry(0.05, 0.05, 0.3), chrome);
    tap.position.set(bx + Math.sin(a) * 0.22, 1.62, bz + Math.cos(a) * 0.22);
    tap.rotation.y = a;
    const spout = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.1, 8), chrome);
    spout.position.set(bx + Math.sin(a) * 0.36, 1.57, bz + Math.cos(a) * 0.36);
    worldRoot.add(tap, spout);
  }
  const statue = pixelSprite(PROPS.goldPoop, 0.075);
  statue.position.set(bx, 1.89, bz);
  worldRoot.add(statue);

  // low arc benches around the basin: cream base, red cushion
  benchSpots.length = 0;
  benchSeats.length = 0;
  const arc = (r1, r2, a0, a1, h) => {
    const sh = new THREE.Shape();
    const n = 10;
    for (let k = 0; k <= n; k++) {
      const a = a0 + ((a1 - a0) * k) / n;
      const v = [Math.sin(a) * r2, -Math.cos(a) * r2];
      k ? sh.lineTo(...v) : sh.moveTo(...v);
    }
    for (let k = n; k >= 0; k--) {
      const a = a0 + ((a1 - a0) * k) / n;
      sh.lineTo(Math.sin(a) * r1, -Math.cos(a) * r1);
    }
    const geo = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false, curveSegments: 1 });
    geo.rotateX(-Math.PI / 2);
    return geo;
  };
  const cushion = mat(PAL.bench);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
    const r = 3.4;
    const half = 0.34;
    const base = mesh(arc(r - 0.24, r + 0.24, a - half, a + half, 0.34), white, { cast: true, receive: true });
    base.position.set(bx, 0, bz);
    const seat = mesh(arc(r - 0.28, r + 0.28, a - half - 0.01, a + half + 0.01, 0.1), cushion, { cast: true, receive: true });
    seat.position.set(bx, 0.34, bz);
    worldRoot.add(base, seat);
    benchSpots.push({ x: (bx + Math.sin(a) * r) / U, y: (bz + Math.cos(a) * r) / U });
    benchSeats.push([-0.26, 0, 0.26].map((da) => ({ x: (bx + Math.sin(a + da) * r) / U, y: (bz + Math.cos(a + da) * r) / U })));
  }

  // planters: between the benches (leaving the front and back open) and in the room's corners
  for (const k of [1, 2, 4, 5]) {
    const a = (k / 6) * Math.PI * 2;
    planter(bx + Math.sin(a) * 3.4, bz + Math.cos(a) * 3.4, 0.85, k);
  }
  for (const [k, [x, z]] of [[2.6, 2.6], [rw - 2.6, 2.6], [2.6, rd - 2.4], [rw - 2.6, rd - 2.4]].entries()) planter(x, z, 1.15, k + 7);

  // a big ring light over the basin and globe pendants over the plaza
  const glow = new THREE.MeshBasicMaterial({ color: '#fff6dc' });
  const cord = new THREE.MeshBasicMaterial({ color: '#8a9098' });
  const ring = mesh(new THREE.TorusGeometry(1.7, 0.07, 6, 40), glow);
  ring.rotation.x = Math.PI / 2;
  ring.position.set(bx, 3.5, bz);
  const ringFrame = mesh(new THREE.TorusGeometry(1.7, 0.09, 6, 40), chrome);
  ringFrame.rotation.x = Math.PI / 2;
  ringFrame.position.set(bx, 3.58, bz);
  lamps.add(ring, ringFrame);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    const line = mesh(new THREE.CylinderGeometry(0.01, 0.01, 2.4, 4), cord);
    line.position.set(bx + Math.sin(a) * 1.7, 4.8, bz + Math.cos(a) * 1.7);
    lamps.add(line);
  }
  lampLights.length = 0;
  const centre = new THREE.PointLight(PAL.lamps[0], PAL.lampPower * 1.5, 15, 1.6);
  lampLights.push([centre, 1.5]);
  centre.position.set(bx, 3.3, bz);
  lamps.add(centre);
  for (const [x, z] of [[rw * 0.25, rd * 0.28], [rw * 0.75, rd * 0.28], [rw * 0.25, rd * 0.72], [rw * 0.75, rd * 0.72]]) {
    const light = new THREE.PointLight(PAL.lamps[0], PAL.lampPower, 15, 1.6);
    lampLights.push([light, 1]);
    light.position.set(x, 3.2, z);
    const globe = mesh(new THREE.SphereGeometry(0.24, 12, 8), glow);
    globe.position.set(x, 3.3, z);
    const hat = mesh(new THREE.CylinderGeometry(0.1, 0.16, 0.12, 10), red);
    hat.position.set(x, 3.58, z);
    const line = mesh(new THREE.CylinderGeometry(0.01, 0.01, 2.6, 4), cord);
    line.position.set(x, 4.94, z);
    lamps.add(light, globe, hat, line);
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

// a potted plant: white pot with a red band, chunky low-poly leaves
const LEAF_MATS = ['#5fae57', '#4b9446', '#7cc26a'].map((c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true }));
function planter(x, z, size, seed) {
  const g = new THREE.Group();
  const pot = mesh(new THREE.CylinderGeometry(0.3, 0.22, 0.5, 10), mat('#fffaf0'), { cast: true, receive: true });
  pot.position.y = 0.25;
  const band = mesh(new THREE.CylinderGeometry(0.31, 0.3, 0.08, 10), mat(PAL.band));
  band.position.y = 0.46;
  const soil = mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.02, 10), mat('#5a3a24'));
  soil.position.y = 0.5;
  g.add(pot, band, soil);
  const rnd = (k) => {
    const v = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453;
    return v - Math.floor(v);
  };
  for (let k = 0; k < 6; k++) {
    const r = 0.22 + rnd(k) * 0.16;
    const leaf = mesh(new THREE.IcosahedronGeometry(r, 0), LEAF_MATS[k % 3], { cast: true });
    const a = rnd(k + 10) * Math.PI * 2;
    const d = k === 0 ? 0 : 0.12 + rnd(k + 20) * 0.14;
    leaf.position.set(Math.sin(a) * d, 0.7 + rnd(k + 30) * 0.55 + (k === 0 ? 0.35 : 0), Math.cos(a) * d);
    leaf.rotation.set(rnd(k + 40) * 3, rnd(k + 50) * 3, 0);
    g.add(leaf);
  }
  g.position.set(x, 0, z);
  g.scale.setScalar(size);
  worldRoot.add(g);
}

// the open entrance: red pillars, a lit RESTROOM sign box, a striped awning, a welcome mat and a wet-floor sign
function buildEntrance(cx, z) {
  const red = mat(PAL.band);
  const white = mat('#fffaf0');
  for (const dx of [-2.1, 2.1]) {
    const pillar = mesh(new THREE.BoxGeometry(0.36, 4.5, 0.36), red, { cast: true });
    pillar.position.set(cx + dx, 2.25, z);
    const foot = mesh(new THREE.BoxGeometry(0.46, 0.22, 0.46), white, { cast: true });
    foot.position.set(cx + dx, 0.11, z);
    worldRoot.add(pillar, foot);
  }
  const signTex = pixelTex(entranceSignCanvas());
  const face = new THREE.MeshBasicMaterial({ map: signTex });
  const box = mesh(new THREE.BoxGeometry(4.6, 0.86, 0.3), [red, red, red, red, face, face], { cast: true });
  box.position.set(cx, 4.85, z);
  const at = pixelTex(awningCanvas, true);
  at.repeat.set(4.6 / 0.8, 1);
  const awning = mesh(new THREE.PlaneGeometry(4.6, 0.75), new THREE.MeshLambertMaterial({ map: at, side: THREE.DoubleSide }), { cast: true });
  awning.rotation.x = -1.0;
  awning.position.set(cx, 4.22, z + 0.32);
  const vt = pixelTex(valanceCanvas, true);
  vt.repeat.set(4.6 / 0.8, 1);
  const valance = mesh(new THREE.PlaneGeometry(4.6, 0.2), new THREE.MeshLambertMaterial({ map: vt, side: THREE.DoubleSide, transparent: true, alphaTest: 0.5 }));
  valance.position.set(cx, 3.92, z + 0.63);
  const mat2 = mesh(new THREE.PlaneGeometry(2.8, 1.1), new THREE.MeshLambertMaterial({ map: pixelTex(matCanvas()), polygonOffset: true, polygonOffsetFactor: -1 }), { receive: true });
  mat2.rotation.x = -Math.PI / 2;
  mat2.position.set(cx, 0.006, z - 0.75);
  const wet = pixelSprite(wetSign(), 0.065);
  wet.position.set(cx + 2.9, 0, z - 0.6);
  worldRoot.add(box, awning, valance, mat2, wet);
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

  // whoever sits here: the face shows over the half-door, the feet under it
  const sitter = new THREE.Mesh(G.card, new THREE.MeshBasicMaterial({ map: texOf(PROPS.poop), transparent: true, alphaTest: 0.5, side: THREE.DoubleSide }));
  sitter.position.set(STALL_M / 2, SIT_Y, SEAT_Z); // on the bowl
  sitter.visible = false;
  const censor = new THREE.Mesh(G.censor, censorMat);
  censor.rotation.x = -Math.PI / 2;
  censor.position.set(STALL_M / 2, 0.72, SEAT_Z + 0.15); // just below the chest, covering lap and legs
  censor.visible = false;
  const feet = pixelSprite(PROPS.poop);
  feet.position.set(STALL_M / 2, 0, -0.12);
  feet.visible = false;
  const marker = pixelSprite(PROPS.marker);
  marker.position.set(STALL_M / 2, 1.6, SEAT_Z);
  marker.visible = false;
  const halo = pixelSprite(PROPS.halo);
  halo.position.set(STALL_M / 2, 1.52, SEAT_Z);
  halo.visible = false;

  const pile = new THREE.Group();
  pile.position.set(0.84, PART_TOP + 0.05, 0.02);

  const hit = new THREE.Mesh(G.hit, M.hit);
  hit.position.set(STALL_M / 2, 1, 0.1);
  hit.userData.stall = i;


  g.add(part, cap, post, hinge, toilet, sitter, censor, feet, marker, halo, pile, hit);

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
    i, group: g, hinge, lock, face, doorCanvas, doorTex, crack: 0, sitter, censor, feet, marker, halo, pile,
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
  $('#online').textContent = `${roomNo > 1 ? `${roomNo}호점 · ` : ''}${st.users.length}명 볼일 중`;
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
    // walk around the wash basin, not through it
    const bdx = me.x - BASIN.x;
    const bdy = me.y - BASIN.y;
    const bd = Math.hypot(bdx, bdy);
    const keepOut = BASIN.r + 35;
    if (bd < keepOut && bd > 0) {
      me.x = BASIN.x + (bdx / bd) * keepOut;
      me.y = BASIN.y + (bdy / bd) * keepOut;
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
const cam = { yaw: 0, pitch: 0.22, dist: 16, tYaw: 0, tPitch: 0.22, tDist: 16, fx: 11, fz: 20 };
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
    const toBasin = Math.atan2(bx - mx, bz - mz);
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
function followWalk(dt) {
  const now = performance.now();
  if (focusKey || me.s !== -1 || now - walkDir.at > 120 || now - manualCamAt < 2500) return;
  if (!walkedYet) {
    // the wide welcome view closes in behind you once you start walking
    walkedYet = true;
    if (cam.tDist > 10) cam.tDist = 9;
    cam.tPitch = Math.max(cam.tPitch, 0.35);
  }
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
  // the preview frame always looks straight in through the middle of the entrance
  let fx = OG ? toX(ROOM_W) / 2 : toX(me.x);
  let fz = OG ? toZ(ROOM_D) - 2.2 : toZ(me.y);
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
  if (me.s === -1 && !focusKey && room < Math.min(cam.tDist, 10) * 0.55) {
    const toOpen = Math.atan2(rw / 2 - cam.fx, toZ(ROOM_D) / 2 - cam.fz);
    cam.tYaw = lerpAngle(cam.tYaw, toOpen, 1 - Math.exp(-dt * 1.6));
  }
  const wantPitch = Math.min(0.95, Math.max(cam.tPitch, Math.acos(Math.min(1, room / cam.tDist)))); // never a straight-down ceiling view
  const wantDist = Math.max(DIST_MIN, Math.min(cam.tDist, room / Math.cos(wantPitch))); // never closer than the zoom limit
  cam.pitch = lerp(cam.pitch, wantPitch, k);
  cam.dist = lerp(cam.dist, wantDist, k);
  const cp = Math.cos(cam.pitch);
  const px = clamp(cam.fx + sy * cp * cam.dist, m, rw - m);
  const py = 0.9 + Math.sin(cam.pitch) * cam.dist;
  const pz = Math.max(cam.fz + cy * cp * cam.dist, m);
  camera.position.set(px, py, pz);
  camera.lookAt(cam.fx, 0.9, cam.fz);
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

// head-top markers float "up" on screen, not straight up in the world, so looking down from above
// they still sit over the head instead of landing on the face
const camUp = new THREE.Vector3();
function overHead(obj, x, baseY, z, h) {
  obj.position.set(x, baseY, z).addScaledVector(camUp, h);
}

function placeWalkers(dt, t) {
  camUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
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
      overHead(e.marker, X, 0.3 + lift, Z, 0.95 + (Math.floor(t / 300) % 2) * 0.04);
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
    overHead(e.halo, X, lift, Z, 1.12);
    overHead(e.marker, X, lift, Z, 1.25 + (Math.floor(t / 300) % 2) * 0.04);
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
    s.feet.visible = false;
    s.censor.visible = Boolean(occ);
    s.marker.visible = occId === meId;
    if (occ) {
      const u = occ.data;
      const face = exprOf(u, i);
      setSpriteCanvas(s.sitter, body('front', { face, look: occ.look, mode: 'toilet' }));
      const jig = u.h && Math.floor(t / 70) % 2 ? 0.02 : 0;
      s.sitter.position.x = STALL_M / 2 + jig;
      // turn toward the camera, but stay upright and never swing round to face the wall behind
      const rel = Math.atan2(Math.sin(cam.yaw - LAYOUT[i].rot), Math.cos(cam.yaw - LAYOUT[i].rot));
      s.sitter.rotation.y = clamp(rel, -1.1, 1.1);
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
  return new THREE.Vector3(toX(e.rx), 0, toZ(e.ry)).addScaledVector(camUp, 1.2); // screen-up, like the markers
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
  if (Math.hypot(e.rx - BASIN.x, e.ry - BASIN.y) < BASIN.r + 140) return '세면대';
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
  while (box.children.length > 10) box.firstChild.remove();
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

// the first tap or key anywhere starts the music (browsers don't allow sound before that)
const startSoundOnce = () => {
  if (!soundOn || music) return;
  unlockAudio();
  startMusic();
  loadSounds();
};
document.addEventListener('pointerdown', startSoundOnce, true);
document.addEventListener('keydown', startSoundOnce, true);

$('#soundBtn').addEventListener('click', async () => {
  soundOn = !soundOn;
  if (soundOn) unlockAudio();
  else silentLoop?.pause();
  $('#soundBtn').innerHTML = soundOn ? icoImg('soundOn') : `${icoImg('soundOff')}<span>소리 켜기</span>`;
  $('#soundBtn').setAttribute('aria-label', soundOn ? '소리 끄기' : '소리 켜기');
  if (soundOn) {
    startMusic(); // queued now, heard as soon as the phone lets the sound through
    await loadSounds();
  } else {
    stopMusic();
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
  } else if (e.code === 'KeyQ') {
    cam.tYaw = clamp(cam.tYaw + 0.35, -YAW_MAX, YAW_MAX);
    manualCamAt = performance.now();
  } else if (e.code === 'KeyE') {
    cam.tYaw = clamp(cam.tYaw - 0.35, -YAW_MAX, YAW_MAX);
    manualCamAt = performance.now();
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

// two quick taps close together mean "run there"
let lastTap = { t: 0, x: 0, y: 0 };
function handleTap(x, y) {
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
      manualCamAt = performance.now();
      cam.tPitch = clamp(cam.tPitch + dy * 0.004, 0.2, 0.95);
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
  cam.tDist = clamp(cam.tDist * Math.exp(clamp(e.deltaY, -60, 60) * 0.004), DIST_MIN, DIST_MAX); // one notch never jumps too far
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

// ?og: a clean frame for the link-preview image: no controls, just the place and a big title
if (OG) {
  document.body.classList.add('og');
  const title = document.createElement('div');
  title.className = 'og-title';
  title.innerHTML = '<b>똥타</b>';
  document.body.append(title);
}

$('#soundBtn').innerHTML = icoImg('soundOn');
$('#soundBtn').setAttribute('aria-label', '소리 끄기');
$('#peopleIcon').innerHTML = icoImg('people');
$('#todayIcon').innerHTML = icoImg('poop');
$('#downIcon').innerHTML = icoImg('poop');

Promise.all([document.fonts.load('9px Galmuri9'), document.fonts.load('11px Galmuri11')]).finally(() => {
  connect();
  requestAnimationFrame(frame);
});

