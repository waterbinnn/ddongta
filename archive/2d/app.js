// 똥타 — 2D pixel-art client. Everything is drawn in code on a small canvas and scaled up.

// ---------- world constants (keep in sync with server.js) ----------
const STALL_W = 110;
const ENTRANCE_W = 220;
const END_PAD = 180;
const FLOOR_H = 220;
const ENTER_X = 70;
const ENTER_Y = 100;
const SPEED = 280;

// server units -> virtual pixels
const SW = 24; // stall width in pixels
const PX = SW / STALL_W;
const WALL_BASE = 34; // where the back wall meets the floor
const PART_TOP = 26; // top cap of the stall partitions
const DOOR_TOP = 52;
const DOOR_BOT = 72;
const FLOOR_Y = 76; // feet y when standing right in front of the doors
const FLOOR_D = 50; // pixels for the walkable depth
const PILE_MAX = 10;
const fx = (x) => x * PX;
const fy = (y) => FLOOR_Y + (y * FLOOR_D) / FLOOR_H;
const stallLeft = (i) => fx(ENTRANCE_W) + i * SW;
const stallCenter = (i) => ENTRANCE_W + i * STALL_W + STALL_W / 2; // server units
const worldW = () => ENTRANCE_W + stalls.length * STALL_W + END_PAD;

const INK = '#2a1f2b';
const SKIN = '#ffd9b8';
const HAIRS = ['#3b2a20', '#5a3a24', '#1f1b22', '#8a5530', '#4a3460', '#c26a3a'];

const THEMES = {
  company: {
    label: '회사 화장실', sign: '화장실 B2', bg: '#5c6670',
    wall: '#e4e7eb', wallLine: '#cdd3da', band: '#9aa7b4', bandDark: '#7d8a97',
    floorA: '#a7b0b9', floorB: '#9ba5ae', floorLine: '#8b959f',
    door: '#aeb9c4', doorDark: '#7f8b97', doorLight: '#d3dbe3', part: '#8e99a5', partTop: '#d9e0e7',
    inside: '#cfd5db', signBg: '#2b2f36', signInk: '#ffffff', doorway: ['#9fb4c6', '#d8e3ec'], gap: 2,
  },
  highway: {
    label: '고속도로 휴게소', sign: '휴게소 화장실', bg: '#3f6b5f',
    wall: '#eef4f1', wallLine: '#d2dfda', band: '#3aa776', bandDark: '#2b7f59',
    floorA: '#e4d8c2', floorB: '#d8cab0', floorLine: '#c6b699',
    door: '#3ea293', doorDark: '#277467', doorLight: '#69c9b9', part: '#2f877b', partTop: '#86dacb',
    inside: '#d6e4df', signBg: '#2b7f59', signInk: '#ffffff', doorway: ['#8fc3e0', '#e1f0f6'], gap: 2,
  },
  usa: {
    label: '미국 화장실', sign: 'RESTROOM', bg: '#6a5a44',
    wall: '#f2e7d2', wallLine: '#e2d3b7', band: '#c0533a', bandDark: '#963c28',
    floorA: '#8e9096', floorB: '#84868c', floorLine: '#74767c',
    door: '#c8b287', doorDark: '#9f8a60', doorLight: '#e2cea4', part: '#aa936b', partTop: '#e6d3aa',
    inside: '#e6dcc8', signBg: '#ffffff', signInk: '#1c3d7a', doorway: ['#a6c8e0', '#eef3f6'], gap: 8,
  },
  outhouse: {
    label: '옛날 뒷간', sign: '뒷간', bg: '#0b0d18',
    wall: '#6b4a2c', wallLine: '#523820', band: null, bandDark: null,
    floorA: '#4d3b2d', floorB: '#45352a', floorLine: '#3a2c21',
    door: '#8f5f34', doorDark: '#643f20', doorLight: '#b07a4a', part: '#5a3b1f', partTop: '#8d643c',
    inside: '#3a2a1c', signBg: '#eadbb6', signInk: '#3a2a1a', doorway: ['#070a18', '#1c2546'], gap: 2, night: true,
  },
};

const $ = (s) => document.querySelector(s);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, k) => a + (b - a) * k;

// ---------- game state ----------

let ws = null;
let meId = null;
let theme = 'usa';
let stalls = [];
let piles = [];
let hp = [];
let held = [];
const users = new Map();
const me = { x: 100, y: 120, d: 1, s: -1, ready: false, rolling: false, pd: false, q: 0 };
const keys = new Set();
let target = null;
let pendingEnter = -1;
let holding = false;
let lastSent = { x: 0, y: 0, d: 1, t: 0 };
let soundOn = false;
const happyUntil = new Map();
const stallFx = []; // per-stall animation state

// ---------- pixel sprite helpers ----------

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => clamp(Math.round(v * (1 + amt)), 0, 255);
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

// Build a sprite from ASCII rows. Every opaque pixel gets a 1px dark outline, like the references.
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
  front: [
    '....HHHHHH....',
    '..HHHHHHHHHH..',
    '.HHHHHHHHHHHH.',
    '.HHHHHHHHHHHH.',
    '.HHSHHSSHHSHH.',
    '.HSSSSSSSSSSH.',
    '.SSSSSSSSSSSS.',
    '.SSSSSSSSSSSS.',
    '.SSSSSSSSSSSS.',
    '..SSSSSSSSSS..',
    '....ssssss....',
  ],
  back: [
    '....HHHHHH....',
    '..HHHHHHHHHH..',
    '.HHHHHHHHHHHH.',
    '.HHHHHHHHHHHH.',
    '.HHHHHHHHHHHH.',
    '.HHHHHHHHHHHH.',
    '.HHHHHHHHHHHH.',
    '.HHHHHHHHHHHH.',
    '.SHHHHHHHHHHS.',
    '..HHHHHHHHHH..',
    '....ssssss....',
  ],
  side: [
    '....HHHHHH....',
    '...HHHHHHHHH..',
    '..HHHHHHHHHHH.',
    '..HHHHHHHHHHH.',
    '..HHHHHHHSHHS.',
    '..HHHHHSSSSSS.',
    '..HHHHSSSSSSS.',
    '..HHHSSSSSSSS.',
    '..HHHSSSSSSSSS',
    '...HSSSSSSSS..',
    '.....ssssss...',
  ],
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
  idle: { K: [[4, 6], [9, 6], [6, 8], [7, 8]] },
  neutral: { K: [[4, 6], [9, 6], [5, 8], [6, 8], [7, 8], [8, 8]] },
  urgent: { K: [[4, 5], [4, 6], [9, 5], [9, 6], [5, 8], [8, 8]], W: [[6, 8], [7, 8]], B: [[12, 4], [12, 5]] },
  strain: { K: [[3, 5], [4, 6], [3, 7], [10, 5], [9, 6], [10, 7], [5, 8], [6, 9], [7, 8], [8, 9]], R: [[2, 8], [11, 8]], B: [[12, 3], [12, 4]] },
  ok: { K: [[4, 6], [9, 6], [5, 8], [6, 9], [7, 9], [8, 8]], R: [[2, 8], [11, 8]] },
  bliss: { K: [[3, 6], [4, 5], [5, 6], [8, 6], [9, 5], [10, 6], [5, 8], [6, 8], [7, 8], [8, 8]], R: [[2, 7], [11, 7]], T: [[6, 9], [7, 9]] },
  relaxed: { K: [[3, 6], [4, 6], [9, 6], [10, 6], [6, 8], [7, 8]], R: [[2, 8], [11, 8]] },
  dizzy: { K: [[3, 5], [5, 5], [4, 6], [3, 7], [5, 7], [8, 5], [10, 5], [9, 6], [8, 7], [10, 7], [6, 9], [7, 9]] },
  shock: { K: [[4, 5], [5, 5], [4, 6], [5, 6], [8, 5], [9, 5], [8, 6], [9, 6], [6, 8], [7, 8], [6, 9], [7, 9]], R: [[2, 7], [2, 8], [11, 7], [11, 8]], B: [[12, 3], [12, 4]] },
};
const SIDE_FACE = [[10, 6], [12, 8]];

const charCache = new Map();
function charSprite(view, frame, face, look, pantsDown, upperOnly = false) {
  const key = `${view}|${frame}|${face}|${look.c}|${look.h}|${pantsDown}|${upperOnly}`;
  let c = charCache.get(key);
  if (c) return c;
  const v = view === 'back' ? 'back' : view === 'front' ? 'front' : 'side';
  const legView = v === 'side' ? 'side' : 'front';
  const rows = [...HEAD[v], ...BODY[v]];
  if (!upperOnly) {
    rows.push(pantsDown ? UNDIES[v] : HIPS[v]);
    rows.push(...(pantsDown ? LEGS_DOWN[legView] : LEGS[legView][frame]));
  }
  const pal = {
    H: look.h, S: SKIN, s: shade(SKIN, -0.12), C: look.c, c: shade(look.c, -0.22),
    P: pantsDown ? look.c : '#3b4a6b', B: '#2c2630', W: '#ffffff',
  };
  let extra = null;
  if (v === 'front') extra = Object.entries(FACES[face] || FACES.idle).map(([k, pts]) => [FACE_COL[k], pts]);
  if (v === 'side') extra = [[INK, SIDE_FACE]];
  c = sprite(rows, pal, extra);
  if (view === 'left') c = flip(c);
  charCache.set(key, c);
  return c;
}

// ---------- props ----------

const PROPS = {
  toilet: sprite([
    '..TTTTTTTT..',
    '.TTTTTTTTTT.',
    '.TTTTTTTTTT.',
    '.tttttttttt.',
    '...TTTTTT...',
    '..TTTTTTTT..',
    '.TTwwwwwwTT.',
    '.TwwwwwwwwT.',
    '.TwwwwwwwwT.',
    '.TTwwwwwwTT.',
    '..TTTTTTTT..',
    '...tTTTTt...',
  ], { T: '#fdfdfd', t: '#cbd3d8', w: '#9fd3ec' }),
  bench: sprite([
    'WWWWWWWWWWWWWW',
    'wwwwwwwwwwwwww',
    'WWWWWkkkkWWWWW',
    'WWWWkkkkkkWWWW',
    'WWWWWkkkkWWWWW',
    'wwwwwwwwwwwwww',
    'DDDDDDDDDDDDDD',
    'DDdDDDDDDDDdDD',
    'DDDDDDDDDDDDDD',
  ], { W: '#a0703f', w: '#875a30', k: '#120b06', D: '#6b4424', d: '#4e3019' }),
  poop: sprite([
    '....p...',
    '...ppP..',
    '..phpPP.',
    '.ppppppP',
    '..PPPPP.',
    '.phpppPP',
    'pppppppP',
    '.PPPPPP.',
  ], { p: '#8a5228', P: '#5e3517', h: '#c88a50' }),
  plant: sprite([
    '...g...g....',
    '..gGg.gGg...',
    '.gGgggGggg..',
    'gGggGgggGgg.',
    '.ggGgggGgg..',
    '..gggGggg...',
    '...ggGgg....',
    '...pppppp...',
    '...PPPPPP...',
    '....pppp....',
    '....pppp....',
  ], { g: '#6cb35f', G: '#3f7a3c', p: '#c0703f', P: '#9a5530' }),
  note: sprite(['..NNN', '..N.N', '..N.N', '..N..', 'NNN..', 'NNN..'], { N: '#ffd84a' }),
  tube: sprite(['LLLLLLLLLLLLLLLLLL', 'llllllllllllllllll'], { L: '#ffffff', l: '#cfe3ea' }),
  bulb: sprite(['.YY.', 'YYYY', 'YYYY', '.yy.'], { Y: '#ffe7a3', y: '#d9a74a' }),
  marker: sprite(['MMMMM', '.MMM.', '..M..'], { M: '#ffd84a' }),
  halo: sprite(['.AAAAAAAA.', 'A........A', '.AAAAAAAA.'], { A: '#ffe066' }, null, null),
};

// small pixel icons used on the buttons
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
  poop: null,
};

const DIGITS = ['111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001', '111100111001111', '111100111101111', '111001001001001', '111101111101111', '111101111001111'];
function drawNumber(g, n, cx, y, color) {
  const s = String(n);
  const w = s.length * 4 - 1;
  let x = Math.round(cx - w / 2);
  g.fillStyle = color;
  for (const ch of s) {
    const bits = DIGITS[+ch];
    for (let i = 0; i < 15; i++) if (bits[i] === '1') g.fillRect(x + (i % 3), y + Math.floor(i / 3), 1, 1);
    x += 4;
  }
}

ICONS.poop = asIcon(PROPS.poop);

// ---------- tiles (patterns aligned to the world) ----------

let patterns = {};
function tileCanvas(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  return c;
}

function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

function buildPatterns(g0) {
  const th = THEMES[theme];
  const rnd = seeded(7);
  let wall;
  if (theme === 'outhouse') {
    wall = tileCanvas(32, 32, (g) => {
      g.fillStyle = th.wall;
      g.fillRect(0, 0, 32, 32);
      for (let x = 0; x < 32; x += 8) {
        g.fillStyle = th.wallLine;
        g.fillRect(x, 0, 1, 32);
        g.fillStyle = '#7b5835';
        g.fillRect(x + 1, 0, 1, 32);
      }
      for (let i = 0; i < 14; i++) {
        g.fillStyle = rnd() < 0.5 ? '#5d4026' : '#77553a';
        g.fillRect(Math.floor(rnd() * 32), Math.floor(rnd() * 32), 1, 2 + Math.floor(rnd() * 3));
      }
    });
  } else if (theme === 'company') {
    wall = tileCanvas(32, 16, (g) => {
      g.fillStyle = th.wall;
      g.fillRect(0, 0, 32, 16);
      g.fillStyle = th.wallLine;
      g.fillRect(0, 0, 1, 16);
      g.fillStyle = '#eef1f4';
      g.fillRect(1, 0, 1, 16);
    });
  } else {
    const n = theme === 'usa' ? 8 : 12;
    wall = tileCanvas(n, n, (g) => {
      g.fillStyle = th.wall;
      g.fillRect(0, 0, n, n);
      g.fillStyle = th.wallLine;
      g.fillRect(0, n - 1, n, 1);
      g.fillRect(n - 1, 0, 1, n);
      g.fillStyle = '#ffffff';
      g.fillRect(1, 1, 2, 1);
    });
  }
  let floor;
  if (theme === 'outhouse') {
    floor = tileCanvas(32, 32, (g) => {
      g.fillStyle = th.floorA;
      g.fillRect(0, 0, 32, 32);
      for (let i = 0; i < 60; i++) {
        g.fillStyle = rnd() < 0.5 ? th.floorLine : '#5a4636';
        g.fillRect(Math.floor(rnd() * 32), Math.floor(rnd() * 32), 1, 1);
      }
    });
  } else {
    const n = theme === 'usa' ? 8 : 12;
    floor = tileCanvas(n * 2, n * 2, (g) => {
      for (let y = 0; y < 2; y++) {
        for (let x = 0; x < 2; x++) {
          g.fillStyle = (x + y) % 2 ? th.floorB : th.floorA;
          g.fillRect(x * n, y * n, n, n);
        }
      }
      g.fillStyle = th.floorLine;
      for (let k = 0; k < 2; k++) {
        g.fillRect(0, k * n + n - 1, n * 2, 1);
        g.fillRect(k * n + n - 1, 0, 1, n * 2);
      }
    });
  }
  patterns = { wall: g0.createPattern(wall, 'repeat'), floor: g0.createPattern(floor, 'repeat') };
}

// ---------- canvas setup ----------

const view = $('#view');
const ctx = view.getContext('2d');
let scale = 3;
let VW = 320;
let VH = 200;
let camX = 0;
let offY = 0;

function resize() {
  const w = innerWidth;
  const h = innerHeight;
  scale = Math.max(2, Math.floor(Math.min(h / 190, w / 150)));
  VW = Math.ceil(w / scale);
  VH = Math.ceil(h / scale);
  view.width = VW;
  view.height = VH;
  view.style.width = `${VW * scale}px`;
  view.style.height = `${VH * scale}px`;
  ctx.imageSmoothingEnabled = false;
  document.documentElement.style.setProperty('--u', scale >= 4 ? 2 : 1);
  buildPatterns(ctx);
}
window.addEventListener('resize', resize);
resize();

// ---------- connection ----------

function connect() {
  // anonymous: no room or name in the address, the server seats everyone in the one toilet
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

function handle(m) {
  if (m.t === 'welcome') {
    meId = m.you;
    users.clear();
    stallFx.length = 0;
    // leftovers from the previous toilet
    for (const f of floats) f.el.remove();
    floats.length = 0;
    flights.length = 0;
    debris.length = 0;
    notes.length = 0;
    if (m.theme !== theme) {
      theme = m.theme;
      buildPatterns(ctx);
    }
    document.body.dataset.theme = theme;
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
    if (m.direct) toast(m.text); // room-wide chatter stays off screen to keep things calm
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
  } else if (m.t === 'full') {
    toast('화장실이 꽉 찼어요. 잠깐 뒤에 다시 와 주세요');
  }
}

let lastFlushed = -1;
let greeted = false;
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
  while (stallFx.length < stalls.length) {
    stallFx.push({ open: 1, shake: 0, gone: 0, regrow: 1, pile: -1, pending: 0, squash: 0 });
  }
  stallFx.length = stalls.length;
  stallFx.forEach((f, i) => {
    if (!f.pending) f.pile = piles[i];
  });

  const seen = new Set();
  for (const u of st.users) {
    seen.add(u.id);
    let e = users.get(u.id);
    if (!e) {
      e = { data: u, rx: u.x, ry: u.y, view: 'front', phase: 0, idle: 0, walking: false, look: { c: u.c, h: HAIRS[u.id % HAIRS.length] } };
      users.set(u.id, e);
    }
    e.data = u;
    if (u.id === meId) {
      if (!me.ready || (me.s !== -1 && u.s === -1)) {
        me.x = u.x;
        me.y = u.y;
        me.ready = true;
        target = null;
      }
      if (me.s === -1 && u.s !== -1) setHold(false);
      me.s = u.s;
      me.p = u.p;
      me.rolling = Boolean(u.r);
      me.pd = Boolean(u.pd);
      me.q = u.q;
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
  for (const id of users.keys()) if (!seen.has(id)) users.delete(id);
  renderActions();
}

// ---------- movement ----------

const freeFor = (i) => !stalls[i] && (!held[i] || held[i] === meId);

function nearestStall(x, y, ok, range = ENTER_X) {
  if (y > ENTER_Y) return -1;
  let best = -1;
  let bestD = Infinity;
  stalls.forEach((_, i) => {
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
  stalls.forEach((_, i) => {
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

// ---------- expressions ----------

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

// ---------- drawing ----------

const flights = [];
const debris = [];
const notes = [];

function drawScene(t, dt) {
  const th = THEMES[theme];
  const g = ctx;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = th.bg;
  g.fillRect(0, 0, VW, VH);

  const ww = Math.round(fx(worldW()));
  g.save();
  g.translate(-camX, offY);

  // back wall and floor
  const top = -offY - 2;
  const bottom = VH - offY + 2;
  g.fillStyle = patterns.wall;
  g.fillRect(0, top, ww, WALL_BASE - top);
  if (th.band) {
    g.fillStyle = th.band;
    g.fillRect(0, 6, ww, 4);
    g.fillStyle = th.bandDark;
    g.fillRect(0, 10, ww, 1);
  }
  g.fillStyle = patterns.floor;
  g.fillRect(0, WALL_BASE, ww, bottom - WALL_BASE);
  g.fillStyle = 'rgba(0,0,0,0.12)';
  g.fillRect(0, WALL_BASE, ww, 2);

  // ceiling lights
  for (let x = 30; x < ww; x += 64) {
    if (th.night) {
      g.fillStyle = '#111';
      g.fillRect(x + 2, top, 1, -6 - top);
      g.drawImage(PROPS.bulb, x, -7);
    } else {
      g.drawImage(PROPS.tube, x - 8, -14);
    }
  }

  // entrance: doorway and sign
  const grad = g.createLinearGradient(0, 0, 0, WALL_BASE);
  grad.addColorStop(0, th.doorway[0]);
  grad.addColorStop(1, th.doorway[1]);
  g.fillStyle = INK;
  g.fillRect(7, -3, 32, WALL_BASE + 3);
  g.fillStyle = th.part;
  g.fillRect(8, -2, 30, WALL_BASE + 2);
  g.fillStyle = grad;
  g.fillRect(11, 1, 24, WALL_BASE - 1);
  if (th.night) {
    g.fillStyle = '#ffffff';
    for (let k = 0; k < 7; k++) g.fillRect(12 + ((k * 7) % 22), 3 + ((k * 5) % 14), 1, 1);
  }
  drawSign(g, th, 23, -18);

  // side walls at both ends of the room
  g.fillStyle = shade(th.wall, -0.2);
  g.fillRect(-6, top, 6, bottom - top);
  g.fillRect(ww, top, 6, bottom - top);
  g.fillStyle = INK;
  g.fillRect(-1, top, 1, bottom - top);
  g.fillRect(ww, top, 1, bottom - top);

  // stalls
  for (let i = 0; i < stalls.length; i++) drawStall(g, th, i, t, dt);
  drawPartition(g, th, stallLeft(stalls.length));

  g.drawImage(PROPS.plant, 34, 44);

  // people on the floor, back to front
  const walkers = [...users.values()].filter((e) => (e.data.id === meId ? me.s : e.data.s) === -1);
  walkers.sort((a, b) => a.ry - b.ry);
  for (const e of walkers) drawWalker(g, e, t);

  // flying poops and debris
  for (const f of flights) g.drawImage(PROPS.poop, Math.round(f.x - 5), Math.round(f.y - 5));
  for (const d of debris) {
    if (d.door) drawFallenDoor(g, th, d);
    else {
      g.fillStyle = d.color;
      g.fillRect(Math.round(d.x), Math.round(d.y), d.w, d.h);
    }
  }
  for (const n of notes) {
    if (n.t < 0) continue;
    g.globalAlpha = clamp(1 - n.t / 2.2, 0, 1);
    g.drawImage(PROPS.note, Math.round(n.x + Math.sin(n.t * 4) * n.sway), Math.round(n.y - n.t * 22));
  }
  g.globalAlpha = 1;
  g.restore();

  if (th.night) drawNight(g, ww, t);
}

function drawSign(g, th, cx, y) {
  g.font = '10px Galmuri9';
  const w = Math.ceil(g.measureText(th.sign).width) + 8;
  const x = Math.max(4, Math.round(cx - w / 2)); // never hang off the left wall
  g.fillStyle = INK;
  g.fillRect(x - 1, y - 1, w + 2, 14);
  g.fillStyle = th.signBg;
  g.fillRect(x, y, w, 12);
  g.fillStyle = th.signInk;
  g.textBaseline = 'top';
  g.fillText(th.sign, x + 4, y + 1);
}

function drawPartition(g, th, x) {
  g.fillStyle = INK;
  g.fillRect(x - 1, PART_TOP - 1, 4, DOOR_BOT - PART_TOP + 3);
  g.fillStyle = th.part;
  g.fillRect(x, PART_TOP, 2, DOOR_BOT - PART_TOP + 1);
  g.fillStyle = th.partTop;
  g.fillRect(x, PART_TOP, 2, 3);
}

function drawStall(g, th, i, t, dt) {
  const fxs = stallFx[i];
  if (!fxs) return;
  const x0 = stallLeft(i);
  const occId = stalls[i];
  const occ = occId ? users.get(occId) : null;
  const doorBot = DOOR_BOT - th.gap + 2;

  g.save();

  // inside floor and the toilet
  g.fillStyle = th.inside;
  g.fillRect(x0 + 2, WALL_BASE - 4, SW - 2, DOOR_BOT - WALL_BASE + 4);
  g.fillStyle = 'rgba(0,0,0,0.08)';
  g.fillRect(x0 + 2, WALL_BASE - 4, SW - 2, 2);
  if (th.night) g.drawImage(PROPS.bench, x0 + 4, 34);
  else g.drawImage(PROPS.toilet, x0 + 5, 30);

  // whoever is sitting: upper body peeks over the door
  if (occ) {
    const u = occ.data;
    const face = exprOf(u, i);
    const spr = charSprite('front', 0, face, occ.look, false, true);
    const jig = u.h && Math.floor(t / 70) % 2 ? 1 : 0;
    g.drawImage(spr, x0 + 4 + jig, 36);
    if (face === 'bliss') g.drawImage(PROPS.halo, x0 + 6, 32);
    if (occId === meId) g.drawImage(PROPS.marker, x0 + 9, 27 + (Math.floor(t / 300) % 2));
  }

  // the door: closed when occupied, swung open when empty, missing right after a break
  fxs.open = lerp(fxs.open, occId ? 0 : 1, Math.min(1, dt * 10));
  if (fxs.shake > 0) fxs.shake -= dt;
  if (fxs.gone > 0) {
    fxs.gone -= dt;
    if (fxs.gone <= 0) fxs.regrow = 0;
  } else if (fxs.regrow < 1) fxs.regrow = Math.min(1, fxs.regrow + dt * 3);
  const shakeX = fxs.shake > 0 ? (Math.floor(t / 40) % 2 ? 1 : -1) : 0;
  if (fxs.gone <= 0) {
    const fullW = SW - 4;
    const w = Math.max(3, Math.round(lerp(fullW, 3, fxs.open)));
    const h = Math.round((doorBot - DOOR_TOP) * fxs.regrow);
    if (h > 0) drawDoor(g, th, x0 + 3 + shakeX, DOOR_TOP, w, h, occId ? hp[i] : 100, w === fullW, i, occId);
  }

  // feet (and pants around the ankles) in the gap under the door
  if (occ && fxs.gone <= 0) {
    const gap = DOOR_BOT + 2 - doorBot;
    if (gap > 4) {
      g.fillStyle = SKIN;
      g.fillRect(x0 + 8, doorBot, 2, gap - 3);
      g.fillRect(x0 + 15, doorBot, 2, gap - 3);
    }
    g.fillStyle = occ.look.c;
    g.fillRect(x0 + 7, DOOR_BOT - 1, 11, 2);
    g.fillStyle = '#2c2630';
    g.fillRect(x0 + 7, DOOR_BOT + 1, 3, 2);
    g.fillRect(x0 + 15, DOOR_BOT + 1, 3, 2);
  }

  drawPartition(g, th, x0);
  g.restore();

  // the poop tower on top of the door
  const total = fxs.pile < 0 ? piles[i] : fxs.pile;
  const count = Math.min(total, PILE_MAX);
  for (let k = 0; k < count; k++) {
    const jx = ((i * 7 + k * 13) % 3) - 1;
    let sq = 0;
    if (k === count - 1 && fxs.squash > 0) {
      fxs.squash -= dt;
      sq = Math.round(Math.sin(fxs.squash * 20));
    }
    g.drawImage(PROPS.poop, x0 + 13 + jx, DOOR_TOP - 8 - k * 5 + sq);
  }
  if (total > PILE_MAX) {
    // tiny pixel counter on top of a maxed-out tower
    const ty = DOOR_TOP - 16 - PILE_MAX * 5;
    const w = String(total).length * 4 - 1;
    const cx = x0 + 17;
    g.fillStyle = INK;
    g.fillRect(Math.round(cx - w / 2) - 1, ty - 1, w + 2, 7);
    drawNumber(g, total, cx, ty, '#ffd84a');
  }
}

function drawDoor(g, th, x, y, w, h, health, closed, i, occupied) {
  g.fillStyle = INK;
  g.fillRect(x - 1, y - 1, w + 2, h + 2);
  g.fillStyle = th.doorDark;
  g.fillRect(x, y, w, h);
  g.fillStyle = th.door;
  g.fillRect(x, y, w - 1, h - 1);
  g.fillStyle = th.doorLight;
  g.fillRect(x, y, w - 1, 1);
  g.fillRect(x, y, 1, h - 1);
  if (!closed) return;
  g.fillStyle = th.doorDark;
  if (th.night) {
    for (let k = x + 4; k < x + w - 1; k += 4) g.fillRect(k, y + 1, 1, h - 2);
  } else if (h > 12) {
    g.fillRect(x + 3, y + 8, w - 7, 1);
    g.fillRect(x + 3, y + 8, 1, h - 11);
    g.fillStyle = th.doorLight;
    g.fillRect(x + 4, y + 9, w - 8, 1);
  }
  drawNumber(g, i + 1, x + w / 2, y + 2, th.night ? '#f3e2c0' : '#ffffff');
  g.fillStyle = occupied ? '#e5484d' : '#46a758';
  g.fillRect(x + w - 4, y + Math.floor(h / 2), 2, 1);
  // cracks show how close the door is to breaking
  if (health < 100) {
    g.fillStyle = INK;
    const cracks = health < 25 ? 3 : health < 55 ? 2 : health < 85 ? 1 : 0;
    const pts = [
      [[4, 3], [5, 4], [5, 5], [6, 6], [6, 7], [7, 8]],
      [[w - 6, h - 9], [w - 7, h - 8], [w - 7, h - 7], [w - 8, h - 6], [w - 9, h - 5]],
      [[9, 11], [10, 12], [9, 13], [10, 14], [11, 15], [11, 16]],
    ];
    for (let k = 0; k < cracks; k++) for (const [px, py] of pts[k]) if (py < h - 1 && px < w - 1) g.fillRect(x + px, y + py, 1, 1);
    g.fillStyle = `rgba(230,50,50,${((100 - health) / 100) * 0.45})`;
    g.fillRect(x, y, w, h);
  }
}

function drawFallenDoor(g, th, d) {
  const w = SW - 4;
  const h = d.flat ? 5 : 20;
  g.globalAlpha = clamp(d.life / 0.6, 0, 1);
  g.save();
  g.translate(Math.round(d.x), Math.round(d.y));
  if (!d.flat) g.rotate((Math.round(d.rot / (Math.PI / 2)) * Math.PI) / 2);
  g.fillStyle = INK;
  g.fillRect(-w / 2 - 1, -h / 2 - 1, w + 2, h + 2);
  g.fillStyle = th.door;
  g.fillRect(-w / 2, -h / 2, w, h);
  g.fillStyle = th.doorDark;
  g.fillRect(-w / 2, h / 2 - 1, w, 1);
  g.restore();
  g.globalAlpha = 1;
}

function drawWalker(g, e, t) {
  const u = e.data;
  const mine = u.id === meId;
  const x = Math.round(fx(e.rx));
  const y = Math.round(fy(e.ry));
  const rolling = mine ? me.rolling : Boolean(u.r);
  const pantsDown = Boolean(u.pd) && !rolling;
  const face = exprOf(u, -1);

  // shadow
  g.fillStyle = 'rgba(0,0,0,0.22)';
  g.fillRect(x - 5, y - 1, 10, 2);
  g.fillRect(x - 4, y + 1, 8, 1);

  if (rolling) {
    const spr = charSprite('front', 0, 'dizzy', e.look, true);
    g.save();
    g.translate(x, y - 9);
    g.rotate((Math.floor(t / 90) % 4) * (Math.PI / 2) * (u.d === -1 ? -1 : 1));
    g.drawImage(spr, -Math.floor(spr.width / 2), -Math.floor(spr.height / 2));
    g.restore();
    return;
  }

  const frame = e.walking ? (Math.floor(e.phase) % 2 ? 1 : 2) : 0;
  const spr = charSprite(e.view, frame, face, e.look, pantsDown);
  const bob = e.walking && Math.floor(e.phase) % 2 ? -1 : 0;
  const sx = x - Math.floor(spr.width / 2);
  const sy = y - spr.height + 1 + bob;
  g.drawImage(spr, sx, sy);
  if (face === 'bliss' && e.view === 'front') g.drawImage(PROPS.halo, sx + 2, sy - 3);
  if (mine) g.drawImage(PROPS.marker, x - 3, sy - 7 + (Math.floor(t / 300) % 2));
}

const night = document.createElement('canvas');
function drawNight(g, ww, t) {
  if (night.width !== VW || night.height !== VH) {
    night.width = VW;
    night.height = VH;
  }
  const n = night.getContext('2d');
  n.globalCompositeOperation = 'source-over';
  n.clearRect(0, 0, VW, VH);
  n.fillStyle = 'rgba(6,8,24,0.6)';
  n.fillRect(0, 0, VW, VH);
  n.globalCompositeOperation = 'destination-out';
  const flick = 1 + Math.sin(t / 110) * 0.03 + (Math.random() < 0.02 ? -0.15 : 0);
  const light = (cx, cy, r) => {
    const grd = n.createRadialGradient(cx, cy, 0, cx, cy, r);
    grd.addColorStop(0, 'rgba(0,0,0,1)');
    grd.addColorStop(0.6, 'rgba(0,0,0,0.6)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    n.fillStyle = grd;
    n.beginPath();
    n.arc(cx, cy, r, 0, Math.PI * 2);
    n.fill();
  };
  for (let x = 30; x < ww; x += 64) light(x - camX + 2, offY + 26, 58 * flick);
  light(fx(me.x) - camX, fy(me.y) + offY - 10, 30);
  g.drawImage(night, 0, 0);
  g.fillStyle = 'rgba(255,170,80,0.06)';
  g.fillRect(0, 0, VW, VH);
}

// ---------- effects ----------

function onPoop(m) {
  happyUntil.set(m.id, Date.now() + 1600);
  const f = stallFx[m.stall];
  if (f) {
    f.pending++;
    const k = Math.min(m.pile, PILE_MAX) - 1;
    const tx = stallLeft(m.stall) + 18;
    const ty = DOOR_TOP - 4 - k * 5;
    flights.push({ i: m.stall, sx: stallLeft(m.stall) + 12, sy: 44, tx, ty, t: 0, x: 0, y: 0, count: m.pile });
    pop(tx, ty - 10, m.id === meId ? `퐁당! 오늘 ${m.n}번째` : '퐁당');
  }
  if (m.id === meId) {
    flashUntil = performance.now() + 1300;
    buzz([30, 40, 90]);
  }
  plop(m.id === meId ? 1 : distVol(m.stall) * 0.3);
}

let flashUntil = 0;
let lastBuzz = 0;
function buzz(pattern) {
  try {
    navigator.vibrate?.(pattern);
  } catch {}
}

// the push button doubles as the gauge
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

const lastKnockPop = new Map();
const distVol = (i) => clamp(1 - Math.abs(stallCenter(i) - me.x) / 1600, 0.08, 1);

function onKnock(m) {
  const f = stallFx[m.stall];
  if (!f) return;
  f.shake = 0.2;
  const now = performance.now();
  if (now - (lastKnockPop.get(m.stall) || 0) > 500) {
    lastKnockPop.set(m.stall, now);
    pop(stallLeft(m.stall) + 12 + Math.round((Math.random() - 0.5) * 10), DOOR_TOP + 4, '똑똑');
  }
  const mine = stalls[m.stall] === meId;
  playKnock(mine ? 0.5 : m.by === meId ? 0.35 : distVol(m.stall) * 0.25);
}

function onBreak(m) {
  const th = THEMES[theme];
  const f = stallFx[m.stall];
  const x0 = stallLeft(m.stall);
  if (f) {
    f.gone = 1.2;
    f.regrow = 0;
    f.open = 0;
  }
  debris.push({ door: true, x: x0 + 13, y: (DOOR_TOP + DOOR_BOT) / 2, vx: (Math.random() - 0.5) * 30, vy: -60, rot: 0, vr: 14, floorY: FLOOR_Y + 30 + Math.random() * 14, life: 3.2, flat: false });
  for (let k = 0; k < 12; k++) {
    debris.push({
      x: x0 + 4 + Math.random() * 18, y: DOOR_TOP + Math.random() * 18, vx: (Math.random() - 0.5) * 80, vy: -40 - Math.random() * 60,
      floorY: FLOOR_Y + Math.random() * 30, life: 1.2, w: 1 + Math.round(Math.random()), h: 1, color: Math.random() < 0.5 ? th.door : th.doorDark,
    });
  }
  const involved = m.victim === meId || m.by === meId;
  pop(x0 + 12, DOOR_TOP - 6, '와장창!');
  if (m.victim === meId) toast('문이 부서졌어요! 바지부터 올리는 중...');
  if (m.by === meId) toast('문을 열고(?) 들어왔어요. 미안해요~');
  playCrash(involved ? 0.6 : distVol(m.stall) * 0.45);
}

function onBell(m) {
  const x0 = stallLeft(m.stall);
  if (!document.hidden) {
    pop(x0 + 12, DOOR_TOP - 16, '♪ 매너소리');
    for (let k = 0; k < 4; k++) notes.push({ x: x0 + 6 + Math.random() * 12, y: DOOR_TOP - 4, t: -k * 0.6, sway: Math.random() * 6 });
  }
  playSound('bird', m.id === meId ? 1.6 : Math.max(0.5, distVol(m.stall)) * 1.1);
}

function updateEffects(dt) {
  for (let k = flights.length - 1; k >= 0; k--) {
    const f = flights[k];
    f.t = Math.min(1, f.t + dt / 0.7);
    f.x = lerp(f.sx, f.tx, f.t);
    f.y = lerp(f.sy, f.ty, f.t) - Math.sin(f.t * Math.PI) * 26;
    if (f.t >= 1) {
      const s = stallFx[f.i];
      if (s) {
        s.pending--;
        s.pile = piles[f.i] ?? 0;
        s.squash = 0.3;
      }
      flights.splice(k, 1);
    }
  }
  for (let k = debris.length - 1; k >= 0; k--) {
    const d = debris[k];
    d.life -= dt;
    if (d.y < d.floorY || d.vy < 0) {
      d.vy += 260 * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      if (d.door) d.rot += d.vr * dt;
      if (d.y >= d.floorY && d.vy > 0) {
        d.y = d.floorY;
        d.vy = 0;
        d.vx = 0;
        d.flat = true;
      }
    }
    if (d.life <= 0) debris.splice(k, 1);
  }
  for (let k = notes.length - 1; k >= 0; k--) {
    notes[k].t += dt;
    if (notes[k].t > 2.2) notes.splice(k, 1);
  }
}

// ---------- main loop ----------

let lastFrame = performance.now();
function frame(t) {
  const dt = Math.min(0.05, (t - lastFrame) / 1000);
  lastFrame = t;
  if (me.ready && me.s === -1) moveMe(dt);

  for (const [id, e] of users) {
    const px = e.rx;
    const py = e.ry;
    if (id === meId) {
      e.rx = me.x;
      e.ry = me.y;
    } else {
      const k = Math.min(1, dt * 10);
      e.rx = lerp(e.rx, e.data.x, k);
      e.ry = lerp(e.ry, e.data.y, k);
    }
    const dx = e.rx - px;
    const dy = e.ry - py;
    e.walking = Math.hypot(dx, dy) > 0.3;
    if (e.walking) {
      e.idle = 0;
      e.phase += dt * 8;
      e.view = Math.abs(dx) > Math.abs(dy) * 0.8 ? (dx > 0 ? 'right' : 'left') : dy < 0 ? 'back' : 'front';
    } else {
      e.idle += dt;
      if (e.idle > 0.5) e.view = 'front';
    }
  }

  updateEffects(dt);
  updateCamera(dt);
  drawScene(t, dt);
  updateLabels(dt);
  renderActions();
  updatePush(t);

  requestAnimationFrame(frame);
}

function updateCamera(dt) {
  const ww = fx(worldW());
  const want = ww < VW - 16 ? (ww - VW) / 2 : clamp(fx(me.x) - VW / 2, -8, ww - VW + 8);
  camX = Math.round(lerp(camX, want, Math.min(1, dt * 6)));
  if (Math.abs(camX - want) < 1) camX = Math.round(want);
  offY = Math.round(Math.max(22, VH * 0.4 - WALL_BASE));
}

// ---------- floating labels (chat bubbles, pops) ----------

const floats = [];

function updateLabels(dt) {
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i];
    f.age += dt;
    if (f.id) {
      // chat bubbles follow their speaker
      const e = users.get(f.id);
      if (e) {
        const seat = e.data.id === meId ? me.s : e.data.s;
        f.x = seat === -1 ? fx(e.rx) : stallLeft(seat) + 12;
        f.y = seat === -1 ? fy(e.ry) - 28 : 32;
      }
    }
    const y = f.y - (f.stack || 0) - f.rise * Math.min(1, f.age / f.life);
    const sx = Math.round((f.x - camX) * scale);
    const sy = Math.round((y + offY) * scale);
    const fadeIn = Math.min(1, f.age / 0.15);
    const fadeOut = Math.min(1, (f.life - f.age) / 0.8);
    f.el.style.opacity = String(Math.max(0, Math.min(fadeIn, fadeOut)));
    f.el.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -100%)`;
    if (f.age >= f.life) {
      f.el.remove();
      floats.splice(i, 1);
    }
  }
}

// chat is anonymous: just the words, my own bubbles are yellow
function floatChat(id, text) {
  if (!users.get(id)) return;
  for (const f of floats) if (f.id === id) f.stack += 16;
  const el = document.createElement('div');
  el.className = id === meId ? 'bubble mine' : 'bubble';
  el.textContent = text;
  $('#labels').append(el);
  floats.push({ id, el, x: 0, y: 0, stack: 0, age: 0, life: 6, rise: 8 });
  while (floats.length > 40) floats.shift().el.remove();
}

function pop(x, y, text) {
  if (document.hidden) return;
  const el = document.createElement('div');
  el.className = 'pop';
  el.textContent = text;
  $('#labels').append(el);
  floats.push({ id: 0, el, x, y, age: 0, life: 1.1, rise: 10 });
}

// ---------- action bar: one clear main button + small icon buttons ----------

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
  const chat = miniBtn('chat', '말하기', openChat);
  if (mode === 'inside') {
    const push = mainBtn('poop', '꾹 눌러서 힘주기', null, 'push');
    push.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      push.setPointerCapture(e.pointerId);
      setHold(true);
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) => push.addEventListener(ev, () => setHold(false)));
    bar.append(push, miniBtn('bird', '매너소리', ringBell), miniBtn('exit', '나가기', exitStall), chat);
  } else if (mode === 'near') {
    bar.append(mainBtn('door', '이 칸에 앉기', () => tryEnter(nearestEmptyStall(me.x, me.y))), chat);
  } else if (mode === 'knock') {
    bar.append(mainBtn('knock', '똑똑, 계세요?', () => tryKnock(nearestOccupiedStall(me.x, me.y)), 'knock'), chat);
  } else if (mode === 'rolling') {
    const b = mainBtn('knock', '데굴데굴~', null);
    b.disabled = true;
    bar.append(b);
  } else if (mode === 'full') {
    bar.append(mainBtn('knock', '만칸이에요 · 노크하러 가기', () => {
      const i = closestAnywhere((k) => stalls[k] && stalls[k] !== meId);
      if (i >= 0) {
        target = { x: stallCenter(i), y: 6 };
        pendingEnter = -1;
      }
    }), chat);
  } else {
    bar.append(mainBtn('find', '빈 칸 찾기', () => {
      const i = closestAnywhere(freeFor);
      if (i >= 0) walkToStall(i);
    }), chat);
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
    toastTimer = setTimeout(() => (el.hidden = true), 400);
  }, 2600);
}

// ---------- sound ----------

let audio = null;
const actx = () => (audio ??= new AudioContext());
const buffers = {};
let bgm = null;

async function loadSounds() {
  for (const name of ['bgm', 'bird', 'plop']) {
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

function startBgm() {
  if (bgm || !buffers.bgm || !soundOn) return;
  const src = actx().createBufferSource();
  src.buffer = buffers.bgm;
  src.loop = true;
  const gain = actx().createGain();
  gain.gain.value = 0.25;
  src.connect(gain).connect(actx().destination);
  src.start();
  bgm = src;
}

function stopBgm() {
  bgm?.stop();
  bgm = null;
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
    plop(0.3);
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

// tap / click to walk; tap a stall to walk up to it (and in, if it's free)
view.addEventListener('pointerdown', (e) => {
  if (!me.ready || me.s !== -1) return;
  const vx = e.clientX / scale + camX;
  const vy = e.clientY / scale - offY;
  const i = Math.floor((vx - fx(ENTRANCE_W)) / SW);
  if (vy >= PART_TOP - 10 && vy <= DOOR_BOT + 4 && i >= 0 && i < stalls.length) {
    if (freeFor(i)) walkToStall(i);
    else {
      target = { x: stallCenter(i), y: 6 };
      pendingEnter = -1;
    }
    return;
  }
  target = { x: clamp(vx / PX, 20, worldW() - 40), y: clamp(((vy - FLOOR_Y) * FLOOR_H) / FLOOR_D, 0, FLOOR_H) };
  pendingEnter = -1;
});

$('#soundBtn').innerHTML = `${icoImg('soundOff')}<span>소리 켜기</span>`;
$('#peopleIcon').innerHTML = icoImg('people');
$('#todayIcon').innerHTML = icoImg('poop');

// keyboard help shows once, then gets out of the way
setTimeout(() => $('#hint').classList.add('out'), 7000);

document.fonts.load('10px Galmuri9').finally(() => {
  connect();
  requestAnimationFrame(frame);
});
