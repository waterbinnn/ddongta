// 똥타 — a roomy three.js restroom rendered at low resolution, with hand-drawn pixel sprites standing in it.
import * as THREE from '/vendor/three.module.js';
import { peopleReady, makeCharacter, crownOf, hairFor, disposePerson, setFace, setFlush, setPantsDown, pose, HIP_Y, HEIGHT } from './person.js';
import { buildGrounds } from './grounds.js';
import { RoomEnvironment } from '/vendor/jsm/environments/RoomEnvironment.js';
import { buildPrivateRoom, ROOM } from './room.js';
import { makeBeanstalk, beanHeight, heightText } from './beanstalk.js';
import { doorWoodCanvas } from './nature.js';

// ---------- world constants (keep in sync with server.js) ----------
const STALL_W = 110;
const ENTER_RANGE = 75;
const SPEED = 300;

// the room layout arrives from the server on welcome (stalls in a U around a plaza)
let LAYOUT = [];
let GROUNDS = null; // the grounds' layout (two restrooms, plaza, exercise ground, bushes), sent by the server

// server units (cm) -> meters
const U = 0.01;
const toX = (x) => x * U;
const toZ = (y) => y * U;
const STALL_M = STALL_W * U;
const STALL_D = 1.6;
const DOOR_W = 0.94;
const DOOR_BOT = 0.3; // the famous American gap: feet show underneath
const DOOR_TOP = 0.88; // a low half-door, so whoever sits inside shows their whole face over it
const PART_BOT = 0.3;
const PART_TOP = 1.75;
const SEAT_Z = -0.88; // where the person on the toilet sits (bowl center is at -1.1)
const SEAT_TOP = 0.46; // where the sitter's hips rest: perched on the seat, face clear of the door
const BENCH_TOP = 0.03; // sitting on a picnic mat, right on the ground
const PX_M = 0.05; // meters per sprite pixel
const HEAD_STACK = 8; // this many stack up on the head; after that they stick all over the body

const INK = '#2a1f2b';
// a casual fast-food restroom: butter-yellow tile, ketchup-red doors, cream stalls, warm daylight
const OG = new URLSearchParams(location.search).has('og'); // ?og renders the link-preview frame

const PAL = {
  // sky blue and white: sky-blue tiled walls and doors, ivory stall partitions, a cream-and-butter tiled floor, white bowls
  sky: '#f2d98a', band: '#4aa6dc', bandGlow: '#000000',
  tileA: '#d8d2c6', tileLine: '#c2bbad',
  floorA: '#cfc8ba', floorB: '#d8d2c6', floorLine: '#bcb4a5',
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
let hp = [];
const users = new Map();
const me = { x: 100, y: 300, s: -1, p: 0, ready: false, rolling: false, pd: false, q: 0, b: false };
let pendingBench = false;
let pendingWash = false;
let washAfterExit = false; // left a public stall to go and wash
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

// ---------- props & icons ----------

const PROPS = {
  poop: sprite(['....p...', '...ppP..', '..phpPP.', '.ppppppP', '..PPPPP.', '.phpppPP', 'pppppppP', '.PPPPPP.'], { p: '#8a5228', P: '#5e3517', h: '#c88a50' }),
  goldPoop: sprite(['....p...', '...ppP..', '..phpPP.', '.ppppppP', '..PPPPP.', '.phpppPP', 'pppppppP', '.PPPPPP.'], { p: '#f2c94c', P: '#c9952a', h: '#fff4b8' }),
  sparkle: sprite(['..Y..', '..Y..', 'YYWYY', '..Y..', '..Y..'], { Y: '#ffd84a', W: '#ffffff' }, null, null),
  note: sprite(['..NNN', '..N.N', '..N.N', '..N..', 'NNN..', 'NNN..'], { N: '#ffd84a' }),
  bubble: sprite(['.bbb.', 'bWccb', 'bcccb', 'bcccb', '.bbb.'], { b: '#bfe8ff', W: '#ffffff', c: '#eaf7ff' }, null, null),
  drop: sprite(['.d.', 'ddd', '.d.'], { d: '#8fd6ff' }, null, null),
};

// every kind does its own poop: a person the usual swirl, an elephant a big heap of it, dogs and cats little ones,
// a giraffe a long log and a wombat (as real wombats do) a cube
const POOP_ROWS = {
  swirl: ['....p...', '...ppP..', '..phpPP.', '.ppppppP', '..PPPPP.', '.phpppPP', 'pppppppP', '.PPPPPP.'],
  log: ['........', '........', '........', '.hhppp..', 'hpppppPP', 'pppppPPP', '.PPPPPP.', '........'],
  cube: ['........', '.hhhhhh.', '.hppppP.', '.hppppP.', '.hppppP.', '.hppppP.', '.PPPPPP.', '........'],
};
const POOPS = Object.fromEntries(
  Object.entries(POOP_ROWS).map(([shape, rows]) => [
    shape,
    [sprite(rows, { p: '#8a5228', P: '#5e3517', h: '#c88a50' }), sprite(rows, { p: '#f2c94c', P: '#c9952a', h: '#fff4b8' })],
  ]),
);
// [shape, size of the one left under you]
const POOP_OF = {
  person: ['swirl', 1], elephant: ['swirl', 1.9], dog: ['swirl', 0.65], cat: ['swirl', 0.6],
  giraffe: ['log', 1.2], wombat: ['cube', 0.9],
};
const kindOf = (id) => (id === meId ? me.k : users.get(id)?.data.k) || 'person';
const artFor = (kind, gold = false) => POOPS[(POOP_OF[kind] || POOP_OF.person)[0]][gold ? 1 : 0];
const sizeFor = (kind) => (POOP_OF[kind] || POOP_OF.person)[1];
const poopArt = (id, gold = false) => artFor(kindOf(id), gold);
const poopSize = (id) => sizeFor(kindOf(id));

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
  find: icon(['.GGG....', 'GgggG...', 'GgggG...', 'GgggG...', '.GGGHH..', '....HH..', '.....HH.', '......HH']),
  people: icon(['.HHHH.', 'HFFFFH', '.FFFF.', '..FF..', '.AAAA.', 'AAAAAA', 'AAAAAA']),
  recenter: icon(['...S...', '.SSSSS.', '.S...S.', 'SS.S.SS', '.S...S.', '.SSSSS.', '...S...']),
  soundOn: icon(['...S.....', '..SS..W..', 'SSSS.W.W.', 'SSSS.W.W.', '..SS..W..', '...S.....']),
  soundOff: icon(['...S.....', '..SS.....', 'SSSS.x.x.', 'SSSS..x..', '..SS.x.x.', '...S.....']),
  music: icon(['...SSSS', '...SSSS', '...S..S', '...S..S', '.SSS.SS', 'SSSSSSS', '.SS..S.']),
  wash: icon(['...B...', '..BBB..', '.BBBBB.', '.BBWBB.', '.BBBBB.', '..BBB..']),
  bench: icon(['DDDDDDDDD', 'DdddddddD', 'DDDDDDDDD', '.D.....D.', '.D.....D.']),
  jump: icon(['...A...', '..AAA..', '.AAAAA.', '...A...', '...A...', '...A...']),
  sprout: icon(['.AA.AA.', 'AAA.AAA', '.AAAAA.', '...A...', '...A...', '.DDDDD.', 'DDDDDDD']),
  pin: icon(['..xxx..', '.xxxxx.', 'xxWWxxx', 'xxWWxxx', '.xxxxx.', '..xxx..', '...x...']),
  rub: icon(['.k.....k.', '...FF....', '..FFFF.k.', '.FFFFFF..', '.FFffFF..', '..FFFF...', '...FF....']),
  pray: icon(['...FF...', '..FffF..', '..FffF..', '..FffF..', '.FFffFF.', 'FFF..FFF']),
  poop: asIcon(PROPS.poop),
  drink: icon(['..xx..', '..xx..', '.YYYY.', 'YWWWWY', 'YWWWWY', 'YYYYYY', 'YYYYYY', '.yyyy.']),
  kick: icon(['...FF....', '...FF....', '...FF....', '..DDD....', '.DDDDDDD.', 'DDDDDDDDD', 'ddddddddd']),
  lie: icon(['.........', '.FF......', 'FffAAAAA.', 'FffAAAAAA', '.FF......']),
  read: icon(['WWWW.WWWW', 'WggW.WggW', 'WWWW.WWWW', 'WggW.WggW', 'WWWWDWWWW', '....D....']),
  dance: icon(['..b....', '..bb...', '..b.b..', '..b....', 'bbb....', 'bbb....']),
  lamp: icon(['.kkkkk.', 'kkkkkkk', '...D...', '...D...', '...D...', '.DDDDD.']),
  lunch: icon(['DDDDDDDDD', 'DWWWWkxAD', 'DWWWWkkAD', 'DWWWWxkAD', 'DDDDDDDDD']),
  // the push button: an empty (pale) poop that fills up with the real one
  poopEmpty: asIcon(sprite(['....p...', '...ppP..', '..phpPP.', '.ppppppP', '..PPPPP.', '.phpppPP', 'pppppppP', '.PPPPPP.'], { p: '#f6ecdf', P: '#e3d1b8', h: '#ffffff' })),
};

// ---------- three.js setup ----------

const sceneEl = $('#scene');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }); // softer edges
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
sceneEl.append(renderer.domElement);

const scene = new THREE.Scene();
// a soft studio room for metal to reflect, so gold reads as gold (not brown); used only on the golden poop
const goldEnv = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.background = new THREE.Color(PAL.sky);
scene.fog = new THREE.Fog(PAL.sky, 70, 260);
const FOV = 50; // a wide lens outdoors, so you see the sky and the space around you, not a tunnel
const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 600);
const WALK_VIEW = { pitch: 0.2, dist: 5.8 }; // the usual view: close behind me and low, so the place towers round you
const hemi = new THREE.HemisphereLight(PAL.hemi[0], PAL.hemi[1], PAL.hemi[2]);
const sun = new THREE.DirectionalLight(PAL.moon[0], PAL.moon[1]); // the sun by day, the moon at night
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 16, bottom: -16, near: 1, far: 48 }); // follows the camera (updateCamera)
sun.shadow.bias = -0.001;
scene.add(hemi, sun, sun.target);
const lamps = new THREE.Group(); // the lights over the plaza (no visible fixtures)
scene.add(lamps);

const worldRoot = new THREE.Group();
const stallRoot = new THREE.Group();
const charRoot = new THREE.Group();
const fxRoot = new THREE.Group();
scene.add(worldRoot, stallRoot, charRoot, fxRoot);

// the private room behind a 프리미엄 화장실 door: built once, far off the grounds, shown only to whoever is inside
const room = buildPrivateRoom({ SEAT_TOP, HIP_Y });
room.group.position.set(20, 0, -40);
scene.add(room.group);
room.group.updateMatrixWorld(true);
const roomWorld = (v) => room.group.localToWorld(v.clone());
let inRoom = false; // am I sitting in my own private room right now
let roomFor = -1;
let roomPerson = null;
let roomPersonFor = '';
let roomShake = 0;
let roomWashUntil = 0; // washing at the room's sink until then
let roomStanding = false; // up off the toilet, standing in the room
let roomSeat = -1; // sitting on one of the room's seats (the stool, the sofa), resting; -1 when not
let roomLastSeat = 0; // the last one, to get up beside it
let readUntil = 0; // reading the magazine until then
let danceUntil = 0; // dancing until then
const reading = () => performance.now() < readUntil;
const dancing = () => performance.now() < danceUntil;
// 오늘의 한 줄: what the magazine says today
const LINES = [
  '급할수록 천천히, 힘줄수록 숨 쉬기.',
  '오늘 하루도 무사히 내보내는 중입니다.',
  '변기 위의 5분은 누구에게도 방해받지 않는 시간.',
  '물은 하루 여덟 잔, 고민은 하루 한 번만.',
  '나오지 않는 날도 있다. 그런 날은 바나나우유.',
  '좋은 생각은 대개 변기 위에서 떠오른다.',
  '쾌변은 기다림의 기술입니다.',
  '오늘의 운세: 뒤가 시원한 하루.',
  '인생은 들어가는 것보다 나오는 게 중요하다.',
  '휴지는 넉넉히, 마음도 넉넉히.',
  '신호가 오면 미루지 말 것. 사랑도, 똥도.',
  '다리 저리기 전에 일어나기.',
];
function readMagazine() {
  readUntil = performance.now() + 2000; // a glance at today's line
  setHold(false);
  $('#readCard p').textContent = LINES[Math.floor(Math.random() * LINES.length)];
}
function dance() {
  // up you get (off the toilet, the stool or the sofa) and a little two-second dance
  setHold(false);
  roomSeat = -1;
  roomStanding = true;
  danceUntil = performance.now() + 2000;
}
const MOODS = [['warm', '은은한 조명'], ['dim', '어두운 조명'], ['party', '파티 조명']];
function nextMood() {
  const k = (MOODS.findIndex(([m]) => m === room.mood.name) + 1) % MOODS.length;
  room.mood.set(MOODS[k][0]);
  toast(MOODS[k][1]);
}
let roomSpot = ''; // where I am in the room: 'seat', 'stand' or 'wash'
let snapCam = false; // jump the camera instead of flying it (going into or out of the room)

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

// natural lawn: a fresh, even green with fine blades and a little clover, drawn smooth; 1.6 m per tile
const grassCanvas = canvas(512, 512, (g) => {
  g.fillStyle = '#93bf66';
  g.fillRect(0, 0, 512, 512);
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // very faint patches, wrapping round the edges so the tiles don't show
  for (let k = 0; k < 30; k++) {
    const x = rand() * 512;
    const y = rand() * 512;
    const r = 40 + rand() * 90;
    const light = rand() < 0.5;
    for (const [ox, oy] of [[0, 0], [512, 0], [-512, 0], [0, 512], [0, -512]]) {
      const grad = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      grad.addColorStop(0, light ? 'rgba(185, 200, 140, 0.18)' : 'rgba(110, 140, 85, 0.14)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      g.fillStyle = grad;
      g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
    }
  }
  // fine blades, mostly a shade lighter or darker than the ground
  for (let k = 0; k < 9000; k++) {
    const x = rand() * 512;
    const y = rand() * 512;
    const shade = rand();
    g.strokeStyle = shade < 0.45 ? 'rgba(110, 155, 75, 0.5)' : shade < 0.9 ? 'rgba(170, 205, 120, 0.5)' : 'rgba(200, 222, 150, 0.5)';
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (rand() - 0.5) * 3, y - 3 - rand() * 5);
    g.stroke();
  }
  // a little clover here and there
  for (let k = 0; k < 60; k++) {
    const x = rand() * 512;
    const y = rand() * 512;
    g.fillStyle = 'rgba(120, 150, 85, 0.6)';
    for (let l = 0; l < 3; l++) {
      g.beginPath();
      g.arc(x + Math.cos(l * 2.1) * 2.5, y + Math.sin(l * 2.1) * 2.5, 2.2, 0, Math.PI * 2);
      g.fill();
    }
  }
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
// a door texture per stall: number on top, cracks as it gets knocked
// a public stall door: light wood, a framed panel, a small dark number plate; cracks once it's knocked about.
// Drawn on a 160 x 104 canvas in 20 x 13 units.
let doorWood = null;
function drawDoorCanvas(c, n, crack) {
  const g = c.getContext('2d');
  doorWood ??= doorWoodCanvas();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.drawImage(doorWood, 0, 0, c.width, c.height);
  g.setTransform(c.width / 20, 0, 0, c.height / 13, 0, 0);
  g.strokeStyle = 'rgba(30, 90, 140, 0.55)';
  g.lineWidth = 0.25;
  g.strokeRect(0.4, 0.4, 19.2, 12.2);
  g.strokeRect(3, 7.5, 14, 4.2); // the lower panel
  g.fillStyle = '#ffffff'; // the number plate
  g.beginPath();
  g.roundRect(7.2, 1.6, 5.6, 4, 0.6);
  g.fill();
  g.fillStyle = '#2f7fb8';
  g.font = 'bold 3.2px -apple-system, "Apple SD Gothic Neo", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(n), 10, 3.7);
  if (crack > 0) {
    g.strokeStyle = 'rgba(60, 40, 25, 0.85)';
    g.lineWidth = 0.3;
    const lines = [
      [[5, 4], [6, 5.5], [6.4, 7], [7.6, 9]],
      [[14, 4], [13, 5.6], [13.6, 7.2], [12.4, 8.8]],
      [[9, 8], [10.4, 9.6], [9.4, 11], [10.6, 12.4]],
    ];
    for (let k = 0; k < crack; k++) {
      g.beginPath();
      lines[k].forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.stroke();
    }
    g.fillStyle = `rgba(200, 60, 50, ${crack * 0.1})`;
    g.fillRect(0, 0, 20, 13);
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
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
// the arrow over my head: drawn last and never hidden (not by my own poop tower either)
function pixelSprite(c, density = PX_M) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: texOf(c), transparent: true, alphaTest: 0.5 }));
  s.center.set(0.5, 0);
  s.scale.set(c.width * density, c.height * density, 1);
  return s;
}

// ---------- the grounds ----------

let floorMesh = null;
let builtFor = 0;
const benchSpots = []; // the terrace's picnic mats, in server units (sitting reuses the old bench logic)
const benchSeats = []; // the chairs round each table

function buildRoom() {
  worldRoot.clear();
  vendings.length = 0;
  lamps.clear();
  const { ground } = buildGrounds({
    L: GROUNDS, root: worldRoot, lamps, lampLights, glows, mesh, mat, M, wishHits, vendingMachine, goldEnv,
    tex: { grass: grassCanvas },
    lampColor: PAL.lamps[0], lampPower: PAL.lampPower,
  });
  floorMesh = ground;
  placeBeanstalk();
  benchSpots.length = 0;
  benchSeats.length = 0;
  GROUNDS.terrace.picnics.forEach((t, k) => {
    benchSpots.push({ x: t.x, y: t.y });
    benchSeats.push(GROUNDS.seats.filter((s) => s.picnic === k).map((s) => ({ x: s.x, y: s.y })));
  });
  applyTimeOfDay();
}

// keep a point on the walkable ground and out of buildings and furniture (the same rule as the server's settle)
function settleLocal(p) {
  const W = GROUNDS.walk;
  const e = Math.hypot((p.x - W.x) / W.rx, (p.y - W.y) / W.ry); // 1 on the oval's edge
  const B = GROUNDS.bush;
  const bx = p.x - B.x;
  const by = p.y - B.y;
  const bd = Math.hypot(bx, by);
  if (e > 1 && bd > B.r) {
    // off the grounds: back to the nearer of the oval's edge or the big thicket's edge
    const ox = W.x + (p.x - W.x) / e;
    const oy = W.y + (p.y - W.y) / e;
    if (bd - B.r < Math.hypot(p.x - ox, p.y - oy)) {
      p.x = B.x + (bx / bd) * B.r;
      p.y = B.y + (by / bd) * B.r;
    } else {
      p.x = ox;
      p.y = oy;
    }
  }
  for (const o of GROUNDS.obstacles) {
    const x0 = o.x0 - 30;
    const x1 = o.x1 + 30;
    const y0 = o.y0 - 30;
    const y1 = o.y1 + 30;
    if (p.x <= x0 || p.x >= x1 || p.y <= y0 || p.y >= y1) continue;
    const pushes = [[p.x - x0, 'x', x0], [x1 - p.x, 'x', x1], [p.y - y0, 'y', y0], [y1 - p.y, 'y', y1]];
    const [, axis, edge] = pushes.reduce((a, b) => (b[0] < a[0] ? b : a));
    p[axis] = edge;
  }
  return p;
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
// a Korean particle that fits the word: 이/가, 은/는, 을/를 (by whether the last syllable has a final consonant)
function withJosa(word, withFinal, without) {
  const c = word.charCodeAt(word.length - 1) - 0xac00;
  const hasFinal = c >= 0 && c <= 11171 && c % 28 !== 0;
  return word + (hasFinal ? withFinal : without);
}

// the drinks, as the vending machines show them and as they're held in the hand
const DRINK = {
  banana: { name: '바나나우유', sip: '쪼옥', color: '#f6d64a', cap: '#f7f3e6', shape: 'bottle' },
  latte: { name: '연유라떼', sip: '후루룩', color: '#c49a6c', cap: '#f3ece0', shape: 'cup' },
  americano: { name: '아이스 아메리카노', sip: '꿀꺽', color: '#3b2a20', cap: '#f3ece0', shape: 'cup' },
  yogurt: { name: '요구르트', sip: '쭈욱', color: '#f4efe6', cap: '#e5484d', shape: 'small' },
  prune: { name: '푸룬주스', sip: '꿀꺽꿀꺽', color: '#6b3d6e', cap: '#d9c8f0', shape: 'can' },
  gold: { name: '황금 캔', sip: '꿀꺽!', color: '#e8b64a', cap: '#fff1b8', shape: 'can' },
};
// one drink drawn small: a bottle, a cup with a lid, a little yogurt bottle or a can
function drawDrink(g, kind, x, y, s) {
  const d = DRINK[kind];
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  g.fillStyle = d.color;
  g.strokeStyle = 'rgba(40, 30, 20, 0.5)';
  g.lineWidth = 0.6;
  if (d.shape === 'bottle') {
    g.beginPath();
    g.ellipse(0, 4, 5, 6, 0, 0, Math.PI * 2); // round banana-milk bottle
    g.fill();
    g.stroke();
    g.fillRect(-2, -5, 4, 4);
    g.fillStyle = d.cap;
    g.fillRect(-2.5, -7, 5, 2.5);
  } else if (d.shape === 'cup') {
    g.beginPath();
    g.moveTo(-4.5, -4);
    g.lineTo(4.5, -4);
    g.lineTo(3.5, 9);
    g.lineTo(-3.5, 9);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = d.cap;
    g.fillRect(-5, -6.5, 10, 2.5);
    g.fillStyle = '#7a5a3c';
    g.fillRect(-4, 1, 8, 3); // the sleeve
  } else if (d.shape === 'small') {
    g.beginPath();
    g.ellipse(0, 4, 3.5, 5, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.fillStyle = d.cap;
    g.fillRect(-2.5, -3.5, 5, 2.5);
  } else {
    g.fillRect(-4, -6, 8, 15);
    g.strokeRect(-4, -6, 8, 15);
    g.fillStyle = d.cap;
    g.fillRect(-4, -6, 8, 2);
  }
  g.restore();
}

// the vending machines on the terrace, built like real ones: a painted steel cabinet, a lit sign on top,
// shelves of drinks behind glass, a control panel with buttons and a coin slot, a pick-up flap at the bottom.
// Kicked, they shake.
const vendings = [];
function vendingMachine(x, z, rotY, color) {
  const tex = (c) => {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  };
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rotY;
  const part = (geo, material, px, py, pz) => {
    const m = mesh(geo, material, { cast: true, receive: true });
    m.position.set(px, py, pz);
    group.add(m);
    return m;
  };
  // painted steel: a soft sheen, a little lighter at the top
  const paint = canvas(64, 256, (g) => {
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(1, '#d9d9d9');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 256);
    g.fillStyle = 'rgba(255, 255, 255, 0.35)';
    g.fillRect(6, 0, 3, 256); // a highlight down the edge
  });
  const steel = new THREE.MeshStandardMaterial({ color, map: tex(paint), metalness: 0.35, roughness: 0.4 });
  const dark = new THREE.MeshStandardMaterial({ color: '#232326', metalness: 0.5, roughness: 0.5 });
  part(new THREE.BoxGeometry(0.98, 1.92, 0.78), steel, 0, 1.0, 0);          // the cabinet
  part(new THREE.BoxGeometry(1.02, 0.06, 0.82), dark, 0, 0.03, 0);           // its plinth
  part(new THREE.BoxGeometry(1.0, 0.05, 0.8), steel, 0, 1.985, 0);           // the top rim
  // the lit sign on top
  const sign = canvas(512, 96, (g) => {
    const grad = g.createLinearGradient(0, 0, 0, 96);
    grad.addColorStop(0, '#fffdf6');
    grad.addColorStop(1, '#f1e9d6');
    g.fillStyle = grad;
    g.fillRect(0, 0, 512, 96);
    g.fillStyle = color;
    g.font = 'bold 54px -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('쾌변음료', 256, 50);
  });
  const signMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.16), new THREE.MeshBasicMaterial({ map: tex(sign) }));
  signMesh.position.set(0, 1.82, 0.392);
  group.add(signMesh);
  // shelves of drinks, behind glass, lit from inside
  const shelves = canvas(512, 640, (g) => {
    const glow = g.createLinearGradient(0, 0, 0, 640);
    glow.addColorStop(0, '#fbfdfd');
    glow.addColorStop(1, '#dce6e8');
    g.fillStyle = glow;
    g.fillRect(0, 0, 512, 640);
    const rows = [['banana', 'banana', 'banana', 'yogurt', 'yogurt', 'yogurt'], ['latte', 'latte', 'americano', 'americano', 'americano', 'latte'], ['prune', 'prune', 'yogurt', 'banana', 'banana', 'latte'], ['americano', 'banana', 'prune', 'prune', 'latte', 'yogurt']];
    rows.forEach((row, r) => {
      const y = 30 + r * 150;
      g.fillStyle = 'rgba(0, 0, 0, 0.06)'; // the back of each shelf, in shade
      g.fillRect(0, y - 20, 512, 110);
      row.forEach((kind, k) => drawDrink(g, kind, 45 + k * 84, y + 35, 4));
      g.fillStyle = '#aab6b9'; // the shelf edge
      g.fillRect(0, y + 92, 512, 8);
      g.fillStyle = '#ffffff'; // price tags
      row.forEach((_, k) => g.fillRect(22 + k * 84, y + 102, 46, 18));
      g.fillStyle = '#333333';
      g.font = 'bold 14px -apple-system, sans-serif';
      g.textAlign = 'center';
      row.forEach((_, k) => g.fillText('1,200', 45 + k * 84, y + 116));
      g.fillStyle = '#e5484d'; // a little lit button under each
      row.forEach((_, k) => g.fillRect(40 + k * 84, y + 124, 10, 6));
    });
  });
  const shelfMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.84), new THREE.MeshBasicMaterial({ map: tex(shelves) }));
  shelfMesh.position.set(-0.1, 1.2, 0.392); // just in front of the cabinet face, behind the glass
  group.add(shelfMesh);
  const frame = new THREE.MeshStandardMaterial({ color: '#cfd3d6', metalness: 0.6, roughness: 0.3 });
  part(new THREE.BoxGeometry(0.72, 0.03, 0.04), frame, -0.1, 1.635, 0.405);
  part(new THREE.BoxGeometry(0.72, 0.03, 0.04), frame, -0.1, 0.765, 0.405);
  part(new THREE.BoxGeometry(0.03, 0.9, 0.04), frame, -0.465, 1.2, 0.405);
  part(new THREE.BoxGeometry(0.03, 0.9, 0.04), frame, 0.265, 1.2, 0.405);
  // the glass: clear, with a diagonal sheen
  const sheen = canvas(128, 256, (g) => {
    g.clearRect(0, 0, 128, 256);
    const grad = g.createLinearGradient(0, 0, 128, 256);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.0)');
    grad.addColorStop(0.35, 'rgba(255, 255, 255, 0.0)');
    grad.addColorStop(0.42, 'rgba(255, 255, 255, 0.35)');
    grad.addColorStop(0.5, 'rgba(255, 255, 255, 0.0)');
    grad.addColorStop(0.62, 'rgba(255, 255, 255, 0.18)');
    grad.addColorStop(0.68, 'rgba(255, 255, 255, 0.0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 256);
  });
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.88), new THREE.MeshBasicMaterial({ map: tex(sheen), transparent: true, depthWrite: false }));
  glass.position.set(-0.1, 1.2, 0.398);
  group.add(glass);
  // the control panel on the right: a display, a coin slot, a note slot, the change return
  const panel = canvas(128, 512, (g) => {
    g.fillStyle = '#e9e7e2';
    g.fillRect(0, 0, 128, 512);
    g.fillStyle = '#10140f';
    g.fillRect(14, 30, 100, 44);
    g.fillStyle = '#8ef08a';
    g.font = 'bold 18px -apple-system, "Apple SD Gothic Neo", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('발로 차면', 64, 44);
    g.fillText('가끔 나와요', 64, 64);
    g.fillStyle = '#9aa0a4';
    g.fillRect(48, 110, 32, 70); // coin slot plate
    g.fillStyle = '#1d1d20';
    g.fillRect(61, 120, 6, 50);
    g.fillStyle = '#9aa0a4';
    g.fillRect(20, 210, 88, 46); // note slot
    g.fillStyle = '#1d1d20';
    g.fillRect(30, 228, 68, 8);
    g.fillStyle = '#b5bbbf';
    g.beginPath();
    g.arc(64, 300, 18, 0, Math.PI * 2); // change return button
    g.fill();
    g.fillStyle = '#4a4f53';
    g.font = '12px -apple-system, sans-serif';
    g.fillText('반환', 64, 334);
  });
  const panelMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.8), new THREE.MeshLambertMaterial({ map: tex(panel) }));
  panelMesh.position.set(0.37, 1.2, 0.392);
  group.add(panelMesh);
  // the pick-up box at the bottom, with its flap
  part(new THREE.BoxGeometry(0.62, 0.22, 0.06), dark, -0.05, 0.36, 0.38);
  const flap = new THREE.MeshStandardMaterial({ color: '#3a3b3f', metalness: 0.3, roughness: 0.6, transparent: true, opacity: 0.85 });
  part(new THREE.BoxGeometry(0.56, 0.16, 0.02), flap, -0.05, 0.37, 0.415);
  // a brand strip along the bottom
  part(new THREE.BoxGeometry(0.98, 0.1, 0.02), new THREE.MeshBasicMaterial({ color: '#f3ece0' }), 0, 0.15, 0.392);
  worldRoot.add(group);
  const vending = {
    group,
    shake: 0,
    // where a dropped drink shows (world)
    slot() {
      return group.localToWorld(new THREE.Vector3(0, 0.45, 0.45));
    },
  };
  vendings.push(vending);
}

// chunky low-poly leaves for the trees outside
const LEAF_MATS = ['#5fae57', '#4b9446', '#7cc26a'].map((c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true }));

// ---------- time of day ----------
// The sky and the light follow the visitor's clock: blue sky by day, a pink-orange sunset,
// a starry night with the ceiling lights turned up, and a lilac dawn. ?hour=21 previews an hour.
const lampLights = []; // [light, share of PAL.lampPower]
const glows = []; // (dark) => void: lantern paper and the gold, glowing more or less as night falls
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
  const dark = clamp((lampScale - 1) / 1.6, 0, 1); // 0 by day, 1 at night
  for (const glow of glows) glow(dark);
  room.windowMat.color.copy(skyUniforms.mid.value).lerp(skyUniforms.horizon.value, 0.4);
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
const wishHits = []; // the golden poop statue: tapping it walks you up to it

// what a stall is called: "공중화장실 3번 칸" or "프리미엄 화장실 5호"
const stallName = (i) => (LAYOUT[i]?.type === 'private' ? `프리미엄 화장실 ${LAYOUT[i].no}호` : `공중화장실 ${LAYOUT[i]?.no}번 칸`);

// A premium room's way in: an open doorway in the temple's wall, framed in marble, going into the shadow; only its
// number is carved above it, with a small light beside (green free, red in use). Whoever is inside is in their own
// room, so nobody shows out here.
const doorwayShadow = (() => {
  const c = canvas(32, 96, (g) => {
    const grad = g.createLinearGradient(0, 0, 0, 96);
    grad.addColorStop(0, '#1f1813');
    grad.addColorStop(0.75, '#2e241c');
    grad.addColorStop(1, '#4a3a2c'); // a little light on the floor inside
    g.fillStyle = grad;
    g.fillRect(0, 0, 32, 96);
    g.fillStyle = 'rgba(0, 0, 0, 0.35)'; // darker at the sides, for depth
    g.fillRect(0, 0, 5, 96);
    g.fillRect(27, 0, 5, 96);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({ map: t });
})();
const doorFrame = new THREE.MeshPhongMaterial({ color: '#f4efe6', shininess: 20 });
function makePrivateDoor(i) {
  const L = LAYOUT[i];
  const g = new THREE.Group();
  g.position.set(toX(L.cx), 0, toZ(L.cy));
  const doorCanvas = canvas(48, 112, () => {}); // (no door to draw; kept so the stall code can treat every stall alike)
  const doorTex = new THREE.CanvasTexture(doorCanvas);
  doorTex.colorSpace = THREE.SRGBColorSpace;
  const doorway = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 2.1), doorwayShadow); // open, into the shadow
  doorway.position.set(0.55, 1.05, 0.004);
  for (const x of [0.08, 1.02]) {
    const jamb = mesh(new THREE.BoxGeometry(0.08, 2.22, 0.06), doorFrame, { cast: true });
    jamb.position.set(x, 1.11, 0.03);
    g.add(jamb);
  }
  const lintel = mesh(new THREE.BoxGeometry(1.06, 0.1, 0.07), doorFrame, { cast: true });
  lintel.position.set(0.55, 2.2, 0.035);
  g.add(lintel);
  // the number, carved into a small marble tablet above the doorway
  const plate = canvas(64, 36, (c) => {
    c.fillStyle = '#ece6da';
    c.fillRect(0, 0, 64, 36);
    c.fillStyle = '#6b5a44';
    c.font = '600 24px Georgia, "Times New Roman", serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(String(L.no), 32, 19);
  });
  const plateTex = new THREE.CanvasTexture(plate);
  plateTex.colorSpace = THREE.SRGBColorSpace;
  const face = new THREE.MeshLambertMaterial({ map: plateTex }); // (lights up under the pointer)
  const tablet = mesh(new THREE.PlaneGeometry(0.34, 0.19), face);
  tablet.position.set(0.55, 2.48, 0.03);
  g.add(tablet);
  const lock = mesh(G.lock, M.lockGreen);
  lock.position.set(0.8, 2.48, 0.035);
  g.add(lock);
  const hinge = new THREE.Group(); // no door to swing any more
  hinge.visible = false;
  const feet = pixelSprite(PROPS.poop);
  feet.visible = false;
  const hit = new THREE.Mesh(G.hit, M.hit);
  hit.position.set(STALL_M / 2, 1, 0.1);
  hit.userData.stall = i;
  g.add(doorway, hinge, hit);
  stallRoot.add(g);
  g.updateMatrixWorld(true);
  stallHits[i] = hit;
  return {
    i, group: g, hinge, lock, face, doorCanvas, doorTex, crack: 0, seatSpot: new THREE.Group(), person: null, personFor: '', feet,
    open: 1, shake: 0, gone: 0, regrow: 1, private: true,
  };
}

function makeStall(i) {
  if (LAYOUT[i].type === 'private') return makePrivateDoor(i);
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
  doorCanvas.width = 160;
  doorCanvas.height = 104;
  drawDoorCanvas(doorCanvas, L.no, 0);
  const doorTex = new THREE.CanvasTexture(doorCanvas);
  doorTex.colorSpace = THREE.SRGBColorSpace;
  doorTex.anisotropy = 4;
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


  const hit = new THREE.Mesh(G.hit, M.hit);
  hit.position.set(STALL_M / 2, 1, 0.1);
  hit.userData.stall = i;


  g.add(part, cap, post, hinge, toilet, seatSpot, feet, hit);

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
    i, group: g, hinge, lock, face, doorCanvas, doorTex, crack: 0, seatSpot, person: null, personFor: '', feet,
    open: 1, shake: 0, gone: 0, regrow: 1,
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
      drawDoorCanvas(s.doorCanvas, LAYOUT[i].no, crack);
      s.doorTex.needsUpdate = true;
    }
  });
}


// ---------- characters ----------

function makeWalker(u) {
  const p = makeCharacter(u.k, hairFor(u.id)); // a person or an animal, as the server picked
  const blob = new THREE.Mesh(G.blob, M.blob);
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.01;
  charRoot.add(p.group, blob);
  // a small name tag over the head; mine is in yellow, so I can find myself
  const tag = document.createElement('div');
  tag.className = u.id === meId ? 'nametag me' : 'nametag';
  tag.textContent = u.name || '';
  tag.hidden = true;
  $('#labels').append(tag);
  return { data: u, p, blob, tag, rx: u.x, ry: u.y, facing: 0, turn: 0, phase: 0, idle: 9, walking: false };
}

function removeWalker(e) {
  e.tag.remove();
  charRoot.remove(e.p.group, e.blob);
  if (e.cup) charRoot.remove(e.cup);
  disposePerson(e.p);
}

function exprOf(u, seat) {
  if ((happyUntil.get(u.id) || 0) > Date.now()) return 'bliss';
  if (u.r) return 'dizzy';
  if (seat === -1 && u.pd) return 'shock';
  if (seat === -1 && u.q) return u.h ? 'strain' : 'idle';
  if (seat === -1 && u.ex) return 'bliss';
  if (seat === -1) return u.n && !u.sg ? 'relaxed' : 'urgent'; // 「신호가 왔다!」 shows on the face too
  if (u.cn) return 'strain'; // 변비: red-faced and going nowhere
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
  const as = new URLSearchParams(location.search).get('as'); // ?as=giraffe tries out one character
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws${as ? `?as=${encodeURIComponent(as)}` : ''}`);
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
      GROUNDS = m.layout;
      LAYOUT = m.layout.stalls;
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
  } else if (m.t === 'toast') {
    if (m.direct) toast(m.text);
  } else if (m.t === 'poop') {
    onPoop(m);
  } else if (m.t === 'signal') {
    onSignal(m);
  } else if (m.t === 'rub') {
    const at = wishHits[0]?.getWorldPosition(new THREE.Vector3());
    if (at) {
      pop(at.clone().add(new THREE.Vector3(0, 0.9, 0)), '문질문질');
      sparkle(at.clone().add(new THREE.Vector3(0, 0.4, 0)));
    }
    if (m.id === meId && m.n) toast(`오늘 ${m.n.toLocaleString('ko-KR')}번째로 문질렀어요`);
  } else if (m.t === 'pray') {
    const h = headOf(m.id);
    if (h) pop(h.clone(), '합장');
  } else if (m.t === 'wished') {
    // the wish rises up from the golden poop for everyone here to see
    const at = wishHits[0]?.getWorldPosition(new THREE.Vector3());
    if (at) floatWish(at.clone().add(new THREE.Vector3(0, 1.0, 0)), m.text);
    if (m.id === meId) toast('소원을 빌었어요');
  } else if (m.t === 'kick') {
    onKick(m);
  } else if (m.t === 'drink') {
    onDrink(m);
  } else if (m.t === 'lunch') {
    onLunch(m);
  } else if (m.t === 'pick') {
    onPick(m);
  } else if (m.t === 'stuck') {
    onStuck(m);
  } else if (m.t === 'knock') {
    onKnock(m);
  } else if (m.t === 'break') {
    onBreak(m);
  } else if (m.t === 'bell') {
    onBell(m);
  } else if (m.t === 'fert') {
    onFert(m);
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
  $('#online').innerHTML = `${roomNo > 1 ? `${roomNo}호<span class="unit">점 ·</span> ` : ''}${st.users.filter((u) => !u.npc).length}<span class="unit">명</span>`; // people only, not the animals; units hide on phones
  $('#busy').innerHTML = `${st.stalls.filter(Boolean).length}<span class="cap">/${st.stalls.length}</span><span class="unit">칸</span>`;
  if (st.beanY !== undefined) beanYesterday = st.beanY;
  syncDrops(st.drops);
  if (st.bean !== undefined && performance.now() > beanHoldUntil && st.bean !== beanTotal) {
    beanTotal = st.bean;
    bean?.setTotal(beanTotal);
  }
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
  hp = st.hp;

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
        if (washAfterExit && me.s !== -1) setTimeout(washHands); // out of the stall (once me.s is updated below), over to the sinks
        washAfterExit = false;
      }
      if (me.s === -1 && u.s !== -1) setHold(false);
      me.s = u.s;
      document.body.classList.toggle('seated', me.s !== -1 && !(inRoom && roomStanding)); // the stick shows when you can walk
      me.p = u.p;
      me.rolling = Boolean(u.r);
      me.pd = Boolean(u.pd);
      me.b = Boolean(u.b);
      me.ly = Boolean(u.ly);
      me.q = Boolean(u.q);
      me.pl = u.pl || 0;
      me.cn = Boolean(u.cn);
      me.pk = u.pk || [];
      me.k = u.k;
      me.un = Boolean(u.un);
      if (u.r) {
        me.x = u.x;
        me.y = u.y;
        target = null;
        pendingEnter = -1;
      }
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

const freeFor = (i) => !stalls[i];

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
// the sinks in the public restroom: where you stand, and the basin you look at
function nearestSink(x, y) {
  const s = GROUNDS.sinks.reduce((a, b) => (Math.hypot(b.x - x, b.y - y) < Math.hypot(a.x - x, a.y - y) ? b : a));
  return { x: s.x, y: s.y, lookX: s.x + Math.sin(s.face) * 60, lookY: s.y + Math.cos(s.face) * 60, pond: Boolean(s.pond) };
}
const sinkGap = (x, y) => {
  const s = nearestSink(x, y);
  return Math.hypot(s.x - x, s.y - y);
};

// step up to the nearest sink, then wash
function washHands() {
  const spot = nearestSink(me.x, me.y);
  if (Math.hypot(spot.x - me.x, spot.y - me.y) < 8) {
    sendMove(true);
    send({ t: 'wash' });
    return;
  }
  target = { x: spot.x, y: spot.y };
  pendingEnter = -1;
  pendingBench = false;
  pendingWash = true;
}

function nearSink() {
  return Boolean(GROUNDS) && sinkGap(me.x, me.y) < 110;
}

function nearBench() {
  return benchSpots.findIndex((b) => Math.hypot(me.x - b.x, me.y - b.y) < 150); // within a step or two of a table
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
    toast('이 돗자리는 자리가 꽉 찼어요');
    return;
  }
  target = { x: seat.x, y: seat.y };
  pendingEnter = -1;
  pendingBench = true;
}


// washing up from the toilet: the private room has its own sink; from a public stall you go out to the sinks
function washFromStall() {
  if (inRoom) {
    setHold(false);
    send({ t: 'wash' });
    return;
  }
  washAfterExit = true;
  exitStall();
}

function exitStall() {
  setHold(false);
  send({ t: 'exit' });
}

// The public restroom is open only at the front: walking in or out from the side goes round by the opening first
function waypoint(from, to) {
  const P = GROUNDS.public;
  const edge = P.y1 + 45; // the side walls end at y1, and people keep about 30 cm off them
  const inside = (p) => p.x > P.x0 - 30 && p.x < P.x1 + 30 && p.y > P.y0 - 30 && p.y < edge;
  const byOpening = (p) => p.x > P.x0 + 40 && p.x < P.x1 - 40 && p.y > edge;
  const a = inside(from);
  const b = inside(to);
  if (a === b || (!a && byOpening(from)) || (!b && byOpening(to))) return to;
  return { x: clamp(from.x, P.x0 + 90, P.x1 - 90), y: edge + 40 };
}

// the way you're asking to go, from the keys or the on-screen stick, turned to where the camera looks
function readMoveInput() {
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
  return { vx, vy, ix, iz, held: Boolean(ix || iz), joyRun };
}

// walking about my own private room (only I see it, so it stays on this page): round the furniture, inside the walls
const roomWalk = { x: 0, z: 0, turn: 0, walking: false, phase: 0 };
let leavingRoom = false; // walked out through the door, waiting for the server to say so
// the seat (stool or sofa) I'm standing by, or -1
const nearSeat = () => (inRoom && roomStanding && roomSeat < 0 ? room.seats.findIndex((st) => Math.hypot(roomWalk.x - st.at.x, roomWalk.z - st.at.z) < st.near) : -1);
let partyLit = false;
// holding the magazine open in both hands, looking down into it
function readFor(p, on) {
  if (!p.magazine) {
    if (!on) return;
    p.magazine = room.magazine();
    p.magazine.position.set(0, HIP_Y + 0.2, 0.34); // held low and out in front, below the chin
    p.magazine.rotation.x = -0.55; // tipped up toward the eyes
    p.group.add(p.magazine);
  }
  p.magazine.visible = on;
  if (!on) return;
  p.parts.arm_L?.rotation.set(-0.95, 0, -0.3);
  p.parts.arm_R?.rotation.set(-0.95, 0, 0.3);
  p.parts.head?.rotation.set(0.3, 0, 0);
}

function moveInRoom(dt) {
  const { vx, vy, joyRun } = readMoveInput();
  roomWalk.walking = Boolean(vx || vy);
  if (!roomWalk.walking) return;
  const len = Math.hypot(vx, vy);
  const running = spaceHeld || joyRun;
  const step = (running ? 2.6 : 1.4) * dt;
  let x = roomWalk.x + (vx / len) * step;
  let z = roomWalk.z + (vy / len) * step;
  const b = room.bounds;
  x = clamp(x, b.x0, b.x1);
  z = clamp(z, b.z0, b.z1);
  const R = 0.24; // about a body's width
  for (const [x0, x1, z0, z1] of room.blockers) {
    if (x <= x0 - R || x >= x1 + R || z <= z0 - R || z >= z1 + R) continue;
    const out = [[x0 - R - x, 0], [x1 + R - x, 0], [0, z0 - R - z], [0, z1 + R - z]].reduce((a, c) => (Math.hypot(...c) < Math.hypot(...a) ? c : a));
    x += out[0];
    z += out[1];
  }
  roomWalk.x = x;
  roomWalk.z = z;
  // walked up to the door: out you go
  const door = room.door;
  if (vx < 0 && x <= b.x0 + 0.05 && Math.abs(z - door.z) < door.half && !leavingRoom) {
    leavingRoom = true;
    exitStall();
  }
  roomWalk.turn = lerpAngle(roomWalk.turn, Math.atan2(vx, vy), Math.min(1, dt * 12));
  roomWalk.phase += dt * (running ? 14 : 9);
}

function moveMe(dt) {
  if (me.rolling) return;
  let { vx, vy, ix, iz, held, joyRun } = readMoveInput();
  if (me.ly && !target) {
    // lying in the grass: the arrows (or the stick) look round the sky instead of getting you up
    skyLook.yaw -= ix * dt * 1.3;
    skyLook.pitch = clamp(skyLook.pitch + iz * dt * 0.9, -0.7, 0.55);
    return;
  }
  // arrows + Space, or a double-tapped destination
  const running = !me.pd && (held ? spaceHeld || joyRun : Boolean(target?.run));
  me.running = running;
  let step = SPEED * (me.pd ? 0.45 : running ? 2 : 1) * dt;
  if (vx || vy) {
    target = null;
    choosingToilet = false; // walking off: never mind which restroom
    pendingEnter = -1;
    pendingBench = false;
    pendingWash = false;
  } else if (target) {
    const goal = waypoint(me, target);
    const dx = goal.x - me.x;
    const dy = goal.y - me.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 2 && goal === target) {
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
    me.x += (vx / len) * step;
    me.y += (vy / len) * step;
    settleLocal(me); // round buildings and furniture, never off the grounds
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
let skyView = 0; // 0 the usual view, 1 lying in the grass looking up
const skyLook = { yaw: 0, pitch: 0 }; // looking round the sky from where you lie
const roomCamAt = new THREE.Vector3();
const lookAt = new THREE.Vector3();
const skyAt = new THREE.Vector3();
const cam = { yaw: 0, pitch: 0.24, dist: 9, tYaw: 0, tPitch: 0.24, tDist: 9, fx: 20, fz: 48, look: 0, tLook: 0 }; // look: tilting the view up at the sky
// link-preview frames (?og, ?og=plaza, ?og=stalls, ?og=above, ?og=bench, ?og=inside): where the camera looks and from where
const OG_VIEWS = {
  entrance: { fx: 20, fz: 45, yaw: 0, pitch: 0.28, dist: 11 },
  plaza: { fx: 20, fz: 28, yaw: 0.4, pitch: 0.45, dist: 14 },
  stalls: { fx: 33, fz: 9, yaw: 0, pitch: 0.35, dist: 13 },
  above: { fx: 20, fz: 22, yaw: 0.3, pitch: 1.05, dist: 46 },
  bushes: { fx: -4, fz: 22, yaw: 1.57, pitch: 0.6, dist: 18 },
  bench: { fx: 31, fz: 29, yaw: 0.25, pitch: 0.36, dist: 9.5 },
  inside: { fx: 20, fz: 44, yaw: Math.PI, pitch: 0.55, dist: 18 }, // from the entrance, looking back out
};
const OG_VIEW = OG ? OG_VIEWS[new URLSearchParams(location.search).get('og')] || OG_VIEWS.entrance : null;
if (OG_VIEW) Object.assign(cam, { yaw: OG_VIEW.yaw, tYaw: OG_VIEW.yaw, pitch: OG_VIEW.pitch, tPitch: OG_VIEW.pitch, dist: OG_VIEW.dist, tDist: OG_VIEW.dist });
const DIST_MIN = 3.5;
const ROOM_DIST = [2.6, 4.2]; // how near and far the camera can be inside the private room
const YAW_MAX = 1000; // free rotation; the camera is kept inside the room instead
const DIST_MAX = 12; // zooming out stops before the place shrinks to a toy
const BENCH_DIST = 2.6; // sitting at a terrace table: close, as if across the table from you

// pooping, washing or sitting turns the camera around to face me, and puts it back afterwards
let focusKey = '';
let camBefore = null;
let washFocusUntil = 0;
function focusCamera() {
  const mx = toX(me.x);
  const mz = toZ(me.y);
  let key = '';
  let yaw = 0;
  let pitch = 0.45;
  if (inRoom) {
    key = 'room';
    pitch = 0.3;
  } else if (me.s !== -1 && LAYOUT[me.s]) {
    key = `stall${me.s}`;
    yaw = LAYOUT[me.s].rot; // straight in front of the door
    pitch = 0.4;
  } else if (performance.now() < washFocusUntil) {
    key = 'wash';
    // from the side, so you see the hands under the tap; pick whichever side is closer to the current view
    const sink = nearestSink(me.x, me.y);
    const toBasin = Math.atan2(toX(sink.lookX) - mx, toZ(sink.lookY) - mz);
    // the clear side (a wall may close one off), else whichever is closer to the current view
    const side = (y) => Math.abs(Math.atan2(Math.sin(y - cam.tYaw), Math.cos(y - cam.tYaw)));
    const sides = [toBasin + Math.PI / 2, toBasin - Math.PI / 2];
    const space = sides.map((y) => clearDist(mx, mz, y, 0.4, 8));
    yaw = space[0] !== space[1] ? (space[0] > space[1] ? sides[0] : sides[1]) : side(sides[0]) < side(sides[1]) ? sides[0] : sides[1];
    pitch = 0.4;
  } else if (me.q) {
    key = 'squat'; // from above, over the bushes, so you can see yourself squatting in them
    yaw = cam.tYaw;
    pitch = 0.75;
  } else if (me.b) {
    key = 'bench';
    // close and in front of me, a little to one side: across the mat, or wherever I sat down
    yaw = (onAMat(me.x, me.y) ? benchFacing(me.x, me.y) : users.get(meId)?.turn ?? 0) + 0.35;
    pitch = 0.22;
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
    cam.tDist = key === 'room' ? ROOM_DIST[1] : key === 'bench' ? BENCH_DIST : clamp(Math.max(6.5, 4.4 / (2 * halfW)), DIST_MIN, 16);
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
  cam.tPitch = WALK_VIEW.pitch;
  cam.tLook = 0;
  cam.tDist = WALK_VIEW.dist;
  manualCamAt = 0;
  focusKey = ''; // sitting or washing: let the focus view take over again from here
}

function followWalk(dt) {
  const now = performance.now();
  if (focusKey || me.s !== -1 || now - walkDir.at > 120 || now - manualCamAt < 5000) return;
  if (!walkedYet) {
    // the wide welcome view closes in behind you once you start walking
    walkedYet = true;
    if (cam.tDist > 10) cam.tDist = WALK_VIEW.dist;
    cam.tPitch = Math.max(cam.tPitch, WALK_VIEW.pitch);
  }
  cam.tLook = 0; // walking off again brings the eyes back down from the sky
  const fx = -Math.sin(cam.tYaw);
  const fy = -Math.cos(cam.tYaw);
  if (walkDir.x * fx + walkDir.y * fy < -0.3) return;
  const behind = Math.atan2(-walkDir.x, -walkDir.y);
  cam.tYaw = lerpAngle(cam.tYaw, behind, 1 - Math.exp(-dt * 2.2));
}

// how far the camera can sit from (fx, fz) along this yaw and pitch before a restroom wall gets in the way
function clearDist(fx, fz, yaw, pitch, dist) {
  const P = GROUNDS.public;
  const walls = [
    GROUNDS.private,
    { x0: P.x0, x1: P.x1, y0: P.y0, y1: P.doorLine }, // the stalls and the back wall
    { x0: P.x0 - 20, x1: P.x0 + 20, y0: P.y0, y1: P.y1 }, // the side walls
    { x0: P.x1 - 20, x1: P.x1 + 20, y0: P.y0, y1: P.y1 },
    ...GROUNDS.terrace.vendings.map((v) => ({ x0: v.x - 55, x1: v.x + 55, y0: v.y - 50, y1: v.y + 50, h: 2.1 })), // the vending machines
  ];
  const cp = Math.cos(pitch);
  for (let k = 0.6; k <= dist; k += 0.15) {
    const x = (fx + Math.sin(yaw) * cp * k) / U;
    const z = (fz + Math.cos(yaw) * cp * k) / U;
    const y = 0.9 + Math.sin(pitch) * k;
    if (walls.some((w) => y < (w.h ?? GROUNDS.wallH * U + 0.5) && x > w.x0 - 15 && x < w.x1 + 15 && z > w.y0 - 15 && z < w.y1 + 15)) {
      return Math.max(1.8, k - 0.35);
    }
  }
  return dist;
}

function updateCamera(dt) {
  if (me.ready && GROUNDS) focusCamera();
  if (me.ready) followWalk(dt);
  if (inRoom && roomSeat >= 0) {
    // resting on the stool or the sofa: the camera comes round in front of it
    if (performance.now() - manualCamAt > 2500) {
      const want = room.seats[roomSeat].turn;
      cam.tYaw += Math.atan2(Math.sin(want - cam.tYaw), Math.cos(want - cam.tYaw));
    }
  } else if (inRoom && roomStanding && roomSeat < 0) {
    // walking about the room: the camera keeps to the middle of the room and looks out at me, so by a wall
    // (or at the door) you see the wall, not the top of your head. Turning it by hand pauses this for a moment.
    const dx = -roomWalk.x;
    const dz = -1.0 - roomWalk.z;
    if (Math.hypot(dx, dz) > 0.7 && performance.now() - manualCamAt > 2500) {
      const want = Math.atan2(dx, dz);
      cam.tYaw += Math.atan2(Math.sin(want - cam.tYaw), Math.cos(want - cam.tYaw));
    }
  } else if (me.s !== -1 && LAYOUT[me.s]) {
    // in a stall the camera only swings around the front, never behind it; in the private room it stays between the walls
    const off = cam.tYaw - LAYOUT[me.s].rot;
    const rel = Math.atan2(Math.sin(off), Math.cos(off));
    const swing = inRoom ? 0.35 : 1.1;
    cam.tYaw -= rel - clamp(rel, -swing, swing);
  }
  if (inRoom) {
    cam.tPitch = clamp(cam.tPitch, 0.1, 0.45);
    cam.tDist = clamp(cam.tDist, ROOM_DIST[0], ROOM_DIST[1]);
    // dragging up raises your eyes, as outside: up to the skylight and the sky through it
  }
  const k = 1 - Math.exp(-dt * 7);
  cam.yaw = lerpAngle(cam.yaw, cam.tYaw, k);
  let fx = OG_VIEW ? OG_VIEW.fx : toX(me.x); // a preview frame holds its own spot
  let fz = OG_VIEW ? OG_VIEW.fz : toZ(me.y);
  if (inRoom) {
    const seat = room.seats[roomSeat];
    const aim = seat ? roomWorld(new THREE.Vector3(seat.at.x, 0, seat.at.z)) : roomStanding ? roomWorld(new THREE.Vector3(roomWalk.x, 0, roomWalk.z)) : roomWorld(room.aim); // resting, walking about, or on the toilet
    fx = aim.x;
    fz = aim.z;
  } else if (me.s !== -1) {
    const door = stallWorld(me.s, STALL_M / 2, 0, 0.3);
    fx = door.x;
    fz = door.z;
  }
  if (snapCam) {
    snapCam = false;
    Object.assign(cam, { fx, fz, yaw: cam.tYaw, pitch: Math.min(0.95, cam.tPitch), dist: Math.max(DIST_MIN, cam.tDist), look: cam.tLook });
  }
  const kf = 1 - Math.exp(-dt * 5);
  cam.fx = lerp(cam.fx, fx, kf);
  cam.fz = lerp(cam.fz, fz, kf);
  // outdoors there are no walls to keep the camera in: it just orbits, never straight down
  const sy = Math.sin(cam.yaw);
  const cy = Math.cos(cam.yaw);
  cam.pitch = lerp(cam.pitch, Math.min(0.95, cam.tPitch), k);
  cam.dist = lerp(cam.dist, Math.max(focusKey === 'bench' ? BENCH_DIST : DIST_MIN, cam.tDist), k);
  cam.look = lerp(cam.look, cam.tLook, k);
  const cp = Math.cos(cam.pitch);
  let px = cam.fx + sy * cp * cam.dist;
  let py = 0.9 + Math.sin(cam.pitch) * cam.dist;
  let pz = cam.fz + cy * cp * cam.dist;
  if (!inRoom && GROUNDS && !OG_VIEW) {
    // a wall between me and the camera: bring the camera in front of the first one along the way
    const d = clearDist(cam.fx, cam.fz, cam.yaw, cam.pitch, cam.dist);
    if (d !== cam.dist) {
      px = cam.fx + sy * cp * d;
      py = 0.9 + Math.sin(cam.pitch) * d;
      pz = cam.fz + cy * cp * d;
    }
  }
  if (inRoom) {
    // never through the room's walls or ceiling
    const local = room.group.worldToLocal(roomCamAt.set(px, py, pz));
    local.x = clamp(local.x, -ROOM.W / 2 + 0.15, ROOM.W / 2 - 0.15);
    local.z = clamp(local.z, -ROOM.D + 0.15, ROOM.FRONT - 0.12);
    local.y = Math.min(local.y, ROOM.H - 0.2);
    room.group.localToWorld(local);
    ({ x: px, y: py, z: pz } = local);
  }
  camera.position.set(px, py, pz);
  if (roomShake > 0) {
    // someone is knocking on my door: the room gives a little jolt
    roomShake = Math.max(0, roomShake - dt);
    camera.position.x += (Math.random() - 0.5) * 0.03 * (roomShake / 0.25);
    camera.position.y += (Math.random() - 0.5) * 0.02 * (roomShake / 0.25);
  }
  // the camera stays where it is and only raises its eyes, so looking at the sky never moves it:
  // the gaze tilts up from the usual downward angle by exactly cam.look
  const elev = Math.atan2(0.9 - py, Math.hypot(px - cam.fx, pz - cam.fz)) + cam.look;
  lookAt.set(px - sy * Math.cos(elev), py + Math.sin(elev), pz - cy * Math.cos(elev));
  // 눕기: the view goes down to where you lie and looks straight up at the sky, past your head
  skyView = lerp(skyView, me.ly && me.s === -1 && !inRoom ? 1 : 0, 1 - Math.exp(-dt * 2.5));
  if (skyView > 0.001) {
    const turn = users.get(meId)?.turn ?? 0;
    const fx = Math.sin(turn);
    const fz = Math.cos(turn); // the way my feet point
    const x = toX(me.x);
    const z = toZ(me.y);
    camera.position.lerp(skyAt.set(x + fx * 0.15, 0.55, z + fz * 0.15), skyView);
    // up past your head (with the treetops round the edge), turned by the arrows as you look about
    const heading = Math.atan2(-fx, -fz) + skyLook.yaw;
    const up = 0.95 + skyLook.pitch;
    lookAt.lerp(skyAt.set(x + Math.sin(heading) * Math.cos(up) * 5, 0.55 + Math.sin(up) * 5, z + Math.cos(heading) * Math.cos(up) * 5), skyView);
  }
  camera.lookAt(lookAt);
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
// people on benches face out, away from the wash island
// sitting on a picnic mat (else just on the grass, wherever you are)
const onAMat = (x, y) => GROUNDS.terrace.picnics.some((m) => Math.hypot(m.x - x, m.y - y) < 110);
const benchFacing = (x, y) => {
  const t = GROUNDS.terrace.picnics.reduce((a, b) => (Math.hypot(b.x - x, b.y - y) < Math.hypot(a.x - x, a.y - y) ? b : a));
  return Math.atan2(t.x - x, t.y - y);
};

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
    if (inStall) {
      if (e.cup) e.cup.visible = false;
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
    const squatting = Boolean(u.q) && !rolling;
    const move = !rolling && !e.walking ? u.ex : '';

    // turn to where you walk; at the sink face the sink; standing still a while, turn to the camera
    let want = e.facing;
    if (washing) {
      const sink = nearestSink(e.rx, e.ry);
      want = Math.atan2(sink.lookX - e.rx, sink.lookY - e.ry);
    } else if (benched) want = onAMat(e.rx, e.ry) ? benchFacing(e.rx, e.ry) : e.turn;
    else if (move === 'drink') want = cam.yaw;
    else if (e.kickT > 0 || (mine && nearVendingHere() && !e.walking && !(u.pk || []).length)) {
      // at a vending machine: face it, so the kick lands on it
      const v = GROUNDS.terrace.vendings.reduce((a, b) => (Math.hypot(b.x - e.rx, b.y - e.ry) < Math.hypot(a.x - e.rx, a.y - e.ry) ? b : a));
      want = Math.atan2(v.x - e.rx, v.y - e.ry);
    }
    else if (move === 'rub' || move === 'pray') want = Math.atan2(GROUNDS.wish.x - e.rx, GROUNDS.wish.y - e.ry); // facing the golden poop
    else if (move) want = cam.yaw + Math.PI / 2; // exercising: side on to the camera, so the moves show
    else if (!e.walking && e.idle > 1.5 && !u.q && !u.ly) want = cam.yaw; // (lying down, you stay as you lay)
    e.turn = lerpAngle(e.turn, want, Math.min(1, dt * (e.walking ? 12 : 4)));

    syncTower(p, id, u.pl, dt);
    setFlush(p, ...(squatting ? flushOf(u) : [0, u.cn ? 1 : 0]));
    const under = squatting && Boolean(u.un);
    syncUnder(p, id, under, true);
    setFace(p, face);
    setPantsDown(p, pantsDown || squatting);
    p.group.rotation.y = e.turn;
    e.blob.position.set(X, 0.01, Z);
    placeCup(e, u, X, Z);
    if (benched) {
      pose(p, { mode: 'sit', t: sec, seed: id });
      handFor(p, id, u, false); // at the table the drink stands in front of you, as a cup
      p.group.position.set(X, BENCH_TOP - HIP_Y + lift, Z);
      e.crown = crownOf(p);
      continue;
    }
    if (e.kickT > 0) {
      e.kickT += dt;
      if (e.kickT > 0.45) e.kickT = 0;
    }
    const mode = rolling ? 'roll' : u.ly ? 'lie' : lift > 0 ? 'jump' : washing ? (e.washPond ? 'pondwash' : 'wash') : squatting ? 'squat' : e.kickT > 0 ? 'kick' : move || (e.walking ? 'walk' : 'stand');
    if (move !== e.exMove) {
      e.exMove = move; // each move starts from its beginning
      e.exStart = sec;
    }
    pose(p, { mode, phase: e.phase, t: mode === 'kick' ? e.kickT : move ? sec - e.exStart : sec, seed: id, strain: squatting && Boolean(u.h), upright: Boolean((u.pk || []).length) }); // an animal carrying a drink walks on two legs
    handFor(p, id, u, true);
    if (squatting && u.h) p.group.position.x += Math.floor(t / 70) % 2 ? 0.012 : 0;
    p.group.position.set(X, lift, Z);
    e.crown = crownOf(p);
  }
}

// Going into my private room hides the grounds and shows the room; coming out puts everything back.
// I sit in there with my shorts down, my poop tower still on my head.
const outdoorLights = () => [sun, lamps];
function syncRoom(t, dt) {
  const want = me.s !== -1 && LAYOUT[me.s]?.type === 'private' && stallObjs[me.s] ? me.s : -1;
  if (want !== roomFor) {
    roomFor = want;
    inRoom = want >= 0;
    roomStanding = true; // you come in standing, just inside the door
    roomSeat = -1;
    readUntil = danceUntil = 0;
    leavingRoom = false;
    roomSpot = '';
    room.group.visible = inRoom;
    worldRoot.visible = stallRoot.visible = charRoot.visible = !inRoom;
    for (const o of outdoorLights()) o.visible = !inRoom;
    camera.fov = inRoom ? 55 : FOV; // a wider lens in the small room, so the whole room fits even on a phone
    camera.updateProjectionMatrix();
    snapCam = true;
  }
  if (!inRoom) return;
  const u = users.get(meId)?.data;
  if (roomPersonFor !== meId) {
    if (roomPerson) {
      room.seat.remove(roomPerson.group);
      disposePerson(roomPerson);
    }
    roomPerson = makeCharacter(me.k, hairFor(meId));
    setPantsDown(roomPerson, true);
    room.seat.add(roomPerson.group);
    roomPersonFor = meId;
  }
  const washing = performance.now() < roomWashUntil;
  const spot = washing ? 'wash' : roomSeat >= 0 ? 'rest' : roomStanding ? 'stand' : 'seat';
  const g = roomPerson.group;
  document.body.classList.toggle('seated', spot !== 'stand'); // the stick shows while you can walk about
  if (spot !== roomSpot) {
    const from = roomSpot;
    roomSpot = spot;
    if (spot === 'seat') {
      room.seat.add(g);
      g.position.set(0, 0, 0);
      g.rotation.y = 0;
      setPantsDown(roomPerson, true);
    } else {
      // up off the toilet, shorts on: standing in front of it (and walking about from there), or over at the basin
      room.group.add(g);
      setPantsDown(roomPerson, false);
      if (spot === 'wash') {
        g.position.copy(room.washSpot);
        g.rotation.y = Math.PI / 2;
      } else if (spot === 'rest') {
        const seat = room.seats[roomSeat];
        roomLastSeat = roomSeat;
        g.position.copy(seat.at);
        g.rotation.y = seat.turn; // facing into the room
      } else if (from === 'rest') {
        const seat = room.seats[roomLastSeat];
        Object.assign(roomWalk, { x: seat.up.x, z: seat.up.z, turn: seat.turn, walking: false }); // up, just in front of it
      } else if (!from) {
        Object.assign(roomWalk, { ...room.entry, walking: false }); // just come in through the door
      } else {
        const at = from === 'wash' ? room.washSpot : room.standSpot;
        Object.assign(roomWalk, { x: at.x, z: at.z, turn: from === 'wash' ? Math.PI / 2 : 0, walking: false });
      }
    }
  }
  if (spot === 'stand') {
    g.position.set(roomWalk.x, 0, roomWalk.z);
    g.rotation.y = roomWalk.turn;
  }
  if (u) {
    syncTower(roomPerson, meId, u.pl, dt);
    setFlush(roomPerson, ...(spot === 'seat' ? flushOf(u) : [0, u.cn ? 1 : 0])); // (only on the toilet does the face go red)
    syncUnder(roomPerson, meId, Boolean(u.un) && spot === 'seat', false);
    setFace(roomPerson, washing ? 'bliss' : exprOf(u, me.s));
    if (washing) pose(roomPerson, { mode: 'wash', t: t / 1000, seed: me.s });
    else if (spot === 'rest') pose(roomPerson, { mode: 'sit', t: t / 1000, seed: me.s, upright: true });
    else if (spot === 'stand') pose(roomPerson, { mode: dancing() && !roomWalk.walking ? 'dance' : roomWalk.walking ? 'walk' : 'stand', phase: roomWalk.phase, t: t / 1000, seed: me.s, upright: true });
    else {
      pose(roomPerson, { mode: 'sit', t: t / 1000, strain: Boolean(u.h), seed: me.s });
      g.position.x = u.h && Math.floor(t / 70) % 2 ? 0.015 : 0;
    }
    handFor(roomPerson, meId, u, !washing);
    lunchFor(roomPerson, meId, t / 1000, spot === 'seat');
    readFor(roomPerson, spot !== 'wash' && reading());
  }
  if (spot === 'wash') readUntil = 0;
  if (spot !== 'stand') danceUntil = 0;
  $('#readCard').hidden = !reading();
  room.mood.tick(t / 1000, dancing());
  if (!dancing() && room.mood.name !== 'party' && partyLit) room.mood.set(room.mood.name); // the party's over: back to how it was
  partyLit = dancing() || room.mood.name === 'party';
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
    // the sitter: a 3D person with pants down, made for whoever is in here now (private rooms keep theirs out of sight)
    const key = occ && !s.private ? String(occId) : '';
    if (key !== s.personFor) {
      if (s.person) {
        s.seatSpot.remove(s.person.group);
        disposePerson(s.person);
        s.person = null;
      }
      if (occ) {
        s.person = makeCharacter(occ?.data.k, hairFor(occId)); // a person or an animal, on the toilet
        setPantsDown(s.person, true);
        s.seatSpot.add(s.person.group);
      }
      s.personFor = key;
    }
    if (occ) {
      const u = occ.data;
      const face = exprOf(u, i);
      if (s.person) {
        syncTower(s.person, occId, u.pl, dt);
        setFlush(s.person, ...flushOf(u));
        syncUnder(s.person, occId, Boolean(u.un), false);
        setFace(s.person, face);
        pose(s.person, { mode: 'sit', t: t / 1000, strain: Boolean(u.h), seed: i });
        handFor(s.person, occId, u, true);
        lunchFor(s.person, occId, t / 1000, true);
        s.person.group.position.x = u.h && Math.floor(t / 70) % 2 ? 0.015 : 0;
      }
    }
  });
}

// ---------- effects ----------

const flights = [];
const debris = [];
const notes = [];

function onPoop(m) {
  happyUntil.set(m.id, Date.now() + 1600);
  if (m.gold && m.under) underGold.add(m.id);
  else if (m.gold) {
    if (!poopGolds.has(m.id)) poopGolds.set(m.id, new Set());
    poopGolds.get(m.id).add(m.pile - 1);
  }
  const byMe = m.id === meId;
  const inside = byMe && inRoom;
  const h = headOf(m.id);
  if (h) {
    const sound = m.bush ? '뿌직' : '퐁당';
    pop(h.clone(), m.gold ? (byMe ? '황금똥!! 대박' : '황금똥!') : byMe ? `${sound}! 오늘 ${m.n}번째` : sound, inside);
    if (m.gold && !inside) sparkle(h);
  }
  if (m.gold) {
    floatGold();
    if (byMe) {
      playDing();
      toast('황금똥이 나왔어요! 오늘은 운수 좋은 날');
    }
  }
  if (byMe) {
    flashUntil = performance.now() + 1300;
    buzz([30, 40, 90]);
    plop(1); // only your own poop makes a sound; a room of dozens would be a racket
  }
}

// ---------- poop towers: every poop you do stacks on your head, until you give them to the beanstalk ----------

const poopGolds = new Map(); // person id -> which places in their tower are golden
const underGold = new Set(); // people whose poop under them is a golden one

// the first poop each time you sit or squat stays under you: in the bowl, or on the ground
function syncUnder(p, id, show, squat) {
  if (!p.under || p.underGold !== underGold.has(id)) {
    if (p.under) p.group.remove(p.under);
    p.underGold = underGold.has(id);
    p.under = pixelSprite(poopArt(id, p.underGold), 0.022 * poopSize(id));
    p.group.add(p.under);
  }
  p.under.visible = show;
  if (squat) p.under.position.set(0, 0.005, -0.07); // on the ground just behind the heels
  else p.under.position.set(0, HIP_Y - 0.03, 0.09); // in the bowl, peeking out between the knees
  if (!show && !squat) underGold.delete(id);
}

// left behind in the bushes when someone gets up (the server keeps them for a while): anyone can pick one up
const drops = new Map(); // drop id -> { s, x, y }
function syncDrops(list = []) {
  const seen = new Set();
  for (const d of list) {
    seen.add(d.i);
    if (drops.has(d.i)) continue;
    const s = pixelSprite(artFor(d.k, d.g), 0.022 * sizeFor(d.k));
    s.position.set(toX(d.x), 0.005, toZ(d.y));
    fxRoot.add(s);
    drops.set(d.i, { s, x: d.x, y: d.y });
  }
  for (const [i, d] of drops) {
    if (seen.has(i)) continue;
    fxRoot.remove(d.s);
    drops.delete(i);
  }
}
const nearDropHere = () => me.s === -1 && !me.q && [...drops.values()].some((d) => Math.hypot(d.x - me.x, d.y - me.y) <= 90);
const TOWER_STEP = 0.11;
const POOP_PX = 0.018; // a small poop
const towerHeight = (count) => Math.min(count || 0, HEAD_STACK) * TOWER_STEP;
const DRAW_MOST = 600; // past this many on one person, the extra ones are counted but not drawn (just for the frame rate)
const RING = 8; // poops round the body in each row
const ROWS = [0.92, 0.76, 0.6, 0.44, 0.28, 0.12]; // heights of the rows, from the shoulders to the ankles
// where the k-th poop sits: on top of the head first, then rows of them all round the body, layer on layer
function poopSpot(k, out, height = HEIGHT) {
  if (k < HEAD_STACK) return out.set((((k * 7) % 3) - 1) * 0.012, k * TOWER_STEP, 0);
  const j = k - HEAD_STACK;
  const perLayer = RING * ROWS.length;
  const layer = Math.floor(j / perLayer);
  const row = Math.floor((j % perLayer) / RING);
  const col = j % RING;
  const a = (col / RING) * Math.PI * 2 + row * 0.39 + layer * 0.21;
  const r = 0.27 + layer * 0.07;
  return out.set(Math.sin(a) * r, ROWS[row] * height - 0.03, Math.cos(a) * r);
}
// on an animal: rows all round its body, from the shoulders to the bottom, in its own frame
const coatAt = new THREE.Vector3();
function bodySpot(k, fit, out) {
  const j = k - HEAD_STACK;
  const perLayer = RING * ROWS.length;
  const layer = Math.floor(j / perLayer);
  const row = Math.floor((j % perLayer) / RING);
  const col = j % RING;
  const a = (col / RING) * Math.PI * 2 + row * 0.39 + layer * 0.21;
  const r = fit.r * 1.2 + 0.08 + layer * 0.05; // well out from the body, so they stick out round it and aren't buried
  return out.set(Math.sin(a) * r, fit.y1 - ((fit.y1 - fit.y0) * (row + 0.5)) / ROWS.length, Math.cos(a) * r);
}
function syncTower(p, id, count, dt) {
  if (!p.tower) {
    // two groups: the stack riding on the head, and the coat of poops round the body (turning with it, lying down too)
    p.tower = new THREE.Group();
    p.coat = new THREE.Group();
    const head = p.parts.head;
    if (head) {
      head.geometry.computeBoundingBox();
      p.tower.position.y = head.geometry.boundingBox.max.y + 0.01; // sits on the crown of the head
      p.tower.scale.setScalar(1 / p.size); // the same poops on a small animal's head as on anyone's
      head.add(p.tower);
    } else {
      p.tower.position.y = HEIGHT;
      p.group.add(p.tower);
    }
    if (p.parts.body) {
      // an animal's coat hangs on its body, so it lies along it on all fours
      p.parts.torso.add(p.coat);
      p.parts.body.geometry.computeBoundingBox();
      const bb = p.parts.body.geometry.boundingBox;
      p.coatFit = { y0: bb.min.y * 0.8, y1: bb.max.y * 0.85, r: Math.max(bb.max.x, bb.max.z) };
    } else p.spin.add(p.coat);
  }
  const want = Math.min(count || 0, DRAW_MOST);
  const onHead = Math.min(want, HEAD_STACK);
  const onBody = want - onHead;
  const golds = poopGolds.get(id);
  const fill = (group, n, offset) => {
    while (group.children.length > n) group.remove(group.children.at(-1));
    while (group.children.length < n) {
      const k = offset + group.children.length;
      const s = pixelSprite(poopArt(id, golds?.has(k)), POOP_PX);
      const onBody = group === p.coat && p.coatFit;
      s.userData.to = onBody ? bodySpot(k, p.coatFit, new THREE.Vector3()) : poopSpot(k, new THREE.Vector3(), p.height);
      if (onBody) s.scale.multiplyScalar(1 / p.size); // the same size of poop on a small animal
      s.position.copy(s.userData.to).add(new THREE.Vector3(0, 0.6, 0)); // drops in from above
      group.add(s);
    }
    const stretch = group === p.coat && p.coatFit ? p.parts.body.scale.y : 1; // the body stretched out on all fours
    for (const s of group.children) s.position.lerp(coatAt.copy(s.userData.to).setY(s.userData.to.y * stretch), Math.min(1, dt * 10));
  };
  fill(p.tower, onHead, 0);
  fill(p.coat, onBody, HEAD_STACK);
}

// ---------- the beanstalk: fertilizer from everyone, in every room; it never stops growing ----------

let bean = null;
let beanHoldUntil = 0; // while my fertilizer is in the air, the stalk waits for it to land
let beanTotal = 0;
let beanYesterday = 0; // poops it had yesterday, before it went back to a sprout at midnight
function placeBeanstalk() {
  if (bean) worldRoot.remove(bean.group);
  bean = makeBeanstalk(toX(GROUNDS.bean.x), toZ(GROUNDS.bean.y));
  bean.setTotal(beanTotal);
  worldRoot.add(bean.group);
}

const nearBean = () => Boolean(GROUNDS) && me.s === -1 && Math.hypot(me.x - GROUNDS.bean.x, me.y - GROUNDS.bean.y) <= GROUNDS.beanRange;
function fertilize() {
  if (!me.pl) {
    toast('머리 위에 아직 똥이 없어요');
    return;
  }
  if (!nearBean()) {
    toast('비료는 광장의 콩나무 앞에서 뿌릴 수 있어요');
    return;
  }
  setHold(false);
  send({ t: 'fert' });
}

function onFert(m) {
  poopGolds.delete(m.id);
  const from = headOf(m.id);
  const byMe = m.id === meId;
  const seen = from && bean && !(byMe && inRoom);
  if (seen) {
    // the whole tower flies over to the beanstalk, one poop after another
    beanHoldUntil = performance.now() + 2500;
    const to = bean.landing();
    const n = Math.min(m.n, 30); // a stream of them, not every single one
    for (let k = 0; k < n; k++) {
      const p = pixelSprite(poopArt(m.id), POOP_PX);
      const start = from.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.4, -Math.random() * 0.8, (Math.random() - 0.5) * 0.4));
      p.position.copy(start);
      fxRoot.add(p);
      flights.push({ p, from: start, to, t: -k * 0.07, dur: 1.2, arc: 2 + start.distanceTo(to) * 0.12, land: k === n - 1 ? () => growBean(m.total, true) : null });
    }
  } else {
    growBean(m.total, false);
  }
  if (byMe) {
    playFlush();
    toast(`콩나무에 비료를 줬어요 · 이제 ${heightText(beanHeight(m.total))}`);
  }
}

function growBean(total, popIt) {
  beanTotal = Math.max(beanTotal, total);
  beanHoldUntil = 0;
  bean?.setTotal(beanTotal);
  if (popIt && bean) pop(bean.landing().add(new THREE.Vector3(0, 0.6, 0)), '쑥쑥!');
}

// the height, pinned under the stalk (text drawn in 3D would blur)
const beanAt = new THREE.Vector3();
// the place labels (콩나무, 황금똥) show only once you've walked up close
const LABEL_NEAR = 520;
const walkedUpTo = (p) => me.s === -1 && Math.hypot(me.x - p.x, me.y - p.y) <= LABEL_NEAR;

function placeBeanLabel() {
  const el = $('#beanLabel');
  if (!bean || inRoom || OG || !walkedUpTo(GROUNDS.bean)) {
    el.hidden = true;
    return;
  }
  beanAt.set(toX(GROUNDS.bean.x), 0, toZ(GROUNDS.bean.y));
  beanAt.project(camera);
  const on = beanAt.z < 1 && Math.abs(beanAt.x) < 0.95 && beanAt.y > -0.7 && beanAt.y < 0.95;
  el.hidden = !on;
  if (!on) return;
  const text = `콩나무 ${heightText(bean.height)} · 똥을 비료로 주면 자라요${beanYesterday ? `\n어제는 ${heightText(beanHeight(beanYesterday))}까지 자랐어요` : ''}`;
  if (el.textContent !== text) el.textContent = text;
  el.style.transform = `translate(${((beanAt.x + 1) / 2) * W}px, ${((1 - beanAt.y) / 2) * H + 8}px) translate(-50%, 0)`;
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
  const inside = inRoom && m.stall === me.s;
  if (inside) roomShake = 0.25;
  const at = inside
    ? roomWorld(room.knock).add(new THREE.Vector3((Math.random() - 0.5) * 0.3, 0, 0))
    : stallWorld(m.stall, STALL_M / 2 + (Math.random() - 0.5) * 0.4, 1.2, 0.2);
  if (cracked) pop(at, '쩌적!', inside);
  else if (now - (lastKnockPop.get(m.stall) || 0) > 500) {
    lastKnockPop.set(m.stall, now);
    pop(at, KNOCK_POPS[stage], inside);
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
    const inside = inRoom && m.stall === me.s;
    const spot = (lx, ly, lz) => (inside ? roomWorld(new THREE.Vector3(lx - 0.6, ly, lz - 1.5)) : stallWorld(m.stall, lx, ly, lz));
    pop(spot(STALL_M / 2, 2.3, -0.4), '♪ 에티켓벨', inside);
    for (let k = 0; k < 4; k++) {
      const n = pixelSprite(PROPS.note, 0.04);
      n.position.copy(spot(0.3 + Math.random() * 0.5, 1.9, -0.4));
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
  const inside = m.id === meId && inRoom;
  if (!inside && e.data.s !== -1) return; // someone washing in their own private room: nobody else sees it
  e.washUntil = performance.now() + 2200;
  if (m.id === meId) washFocusUntil = performance.now() + 2600;
  let tap;
  let hands;
  let top;
  let bottom;
  let noStream = false;
  if (inside) {
    // the little sink in my room: step over from the toilet and wash there
    e.washPond = false;
    roomWashUntil = performance.now() + 2200;
    tap = roomWorld(room.tap);
    hands = roomWorld(room.washSpot).lerp(tap, 0.5).setY(0.92);
    top = tap.y;
    bottom = 0.86;
  } else {
    const sink = nearestSink(e.rx, e.ry);
    tap = new THREE.Vector3(toX(sink.lookX), sink.pond ? 0.06 : 1.12, toZ(sink.lookY)); // the tap over that basin (or the pond's water)
    const ux = toX(e.rx);
    const uz = toZ(e.ry);
    const d = Math.hypot(tap.x - ux, tap.z - uz) || 1;
    hands = new THREE.Vector3(ux + ((tap.x - ux) / d) * 0.35, sink.pond ? 0.35 : 0.95, uz + ((tap.z - uz) / d) * 0.35);
    top = tap.y;
    bottom = sink.pond ? 0.04 : 0.9;
    noStream = sink.pond; // at the pond you scoop the water, there's no tap
    e.washPond = sink.pond;
  }
  const tapX = tap.x;
  const tapZ = tap.z;
  pop(hands.clone().add(new THREE.Vector3(0, 0.45, 0)), '뽀득뽀득', inside);
  if (!document.hidden) {
    // a stream of water from the tap toward this person's hands
    if (!noStream) {
      const stream = new THREE.Mesh(streamGeo, new THREE.MeshBasicMaterial({ color: '#9fe0ff', transparent: true, opacity: 0.8 }));
      stream.position.set(tapX, (top + bottom) / 2, tapZ);
      stream.scale.y = top - bottom;
      fxRoot.add(stream);
      washFx.push({ o: stream, t: 0, life: 2.2, kind: 'stream' });
    }
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
      d.position.set(tapX, bottom + 0.02, tapZ);
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
// a big three-tier swirl, so it reads as a poop going by and not as a UFO
const GOLD_FLYER = sprite(
  [
    '.......pp.......',
    '......pppP......',
    '.....phppP......',
    '....pppppPP.....',
    '.....PPPPP......',
    '...phhpppppP....',
    '..pppppppppPP...',
    '...PPPPPPPPP....',
    '.phhppppppppPP..',
    'pppppppppppppPP.',
    'ppppppppppppppPP',
    '.PPPPPPPPPPPPPP.',
  ],
  { p: '#f2c94c', P: '#c9952a', h: '#fff4b8' },
);
function floatGold() {
  if (document.hidden || document.querySelectorAll('.gold-float').length > 8) return;
  goldSrc ||= GOLD_FLYER.toDataURL();
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
    f.t = Math.min(1, f.t + dt / f.dur);
    const t = Math.max(0, f.t); // waiting its turn until t reaches 0
    f.p.position.lerpVectors(f.from, f.to, t);
    f.p.position.y += Math.sin(t * Math.PI) * f.arc;
    f.p.material.rotation = t * Math.PI * 4;
    if (f.t >= 1) {
      fxRoot.remove(f.p);
      f.land?.();
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

// just over someone's head (gap in metres): where pops come from; name tags use gap 0 and sit a few pixels up
function headOf(id, gap = 0.04) {
  const e = users.get(id);
  if (!e) return null;
  const seat = id === meId ? me.s : e.data.s;
  const tower = towerHeight(e.data.pl);
  if (id === meId && inRoom) return roomWorld(room.head).add(new THREE.Vector3(0, tower, 0));
  if (seat !== -1) return stallWorld(seat, STALL_M / 2, 1.55 + tower, SEAT_Z);
  // right over the head as it is posed now (lower for an animal on all fours), over the ears or the poop tower
  const crown = e.crown ?? e.p.height;
  return new THREE.Vector3(toX(e.rx), Math.max(crown + e.p.above, crown + tower) + gap, toZ(e.ry));
}

// a crisp label pinned under the golden poop statue (text drawn in 3D would blur)
const wishAt = new THREE.Vector3();
function placeWishLink() {
  const link = $('#wishLink');
  const emblem = wishHits[0];
  if (!emblem || inRoom || !walkedUpTo(GROUNDS.wish)) {
    link.hidden = true;
    return;
  }
  emblem.getWorldPosition(wishAt);
  wishAt.y = 0.5; // on the plinth's face
  wishAt.project(camera);
  const on = wishAt.z < 1 && Math.abs(wishAt.x) < 0.95 && wishAt.y > -0.6 && wishAt.y < 0.95;
  link.hidden = !on;
  if (on) link.style.transform = `translate(${((wishAt.x + 1) / 2) * W}px, ${((1 - wishAt.y) / 2) * H}px) translate(-50%, 0)`;
}

// name tags: over everyone's head, out of the way of the poop tower; hidden far off, in private rooms and in mine
const tagAt = new THREE.Vector3();
function placeNameTags() {
  for (const [id, e] of users) {
    const seat = e.data.s;
    const hide = inRoom || OG || e.data.npc || (seat !== -1 && LAYOUT[seat]?.type === 'private'); // the animals have no names
    const h = hide ? null : headOf(id, 0);
    if (!h || h.distanceTo(camera.position) > 24) {
      e.tag.hidden = true;
      continue;
    }
    tagAt.copy(h);
    const p = toScreen(tagAt);
    e.tag.hidden = !p.on;
    // 12 pixels over the top of the head, however far the camera is zoomed
    if (p.on) e.tag.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y) - 12}px) translate(-50%, -100%)`;
  }
}

function updateLabels(dt) {
  placeWishLink();
  placeNameTags();
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
    const here = inRoom ? Boolean(f.room) || f.id === meId : !f.room; // the room and the grounds never see each other's labels
    f.el.style.opacity = String(Math.max(0, Math.min(fadeIn, fadeOut)));
    f.el.style.display = p.on && here ? '' : 'none';
    f.el.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px) translate(-50%, -100%)`;
    if (f.age >= f.life) {
      f.el.remove();
      floats.splice(i, 1);
    }
  }
}

function floatWish(anchor, text) {
  if (document.hidden) return;
  const el = document.createElement('div');
  el.className = 'pop wish-pop';
  el.textContent = text;
  $('#labels').append(el);
  floats.push({ id: 0, el, anchor, age: 0, life: 4.5, rise: 1.4 });
}

function pop(anchor, text, inside = false) {
  if (document.hidden) return;
  const el = document.createElement('div');
  el.className = 'pop';
  el.textContent = text;
  $('#labels').append(el);
  floats.push({ id: 0, el, anchor, age: 0, life: 1.2, rise: 0.4, room: inside });
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
  else if (me.cn) text = holding ? '끄으으응… 안 나와' : '변비에 걸렸어요';
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
  else if (inRoom && roomStanding && roomSeat < 0 && performance.now() >= roomWashUntil) moveInRoom(dt);
  syncRoom(t, dt);
  updatePlaceName();
  placeWalkers(dt, t);
  animateStalls(dt, t);
  updateEffects(dt);
  updateCamera(dt);
  clouds.rotation.y += dt * 0.004; // clouds drift slowly round
  bean?.update(dt);
  for (const v of vendings) {
    v.shake = Math.max(0, v.shake - dt);
    v.group.rotation.z = v.shake > 0 ? Math.sin(t / 25) * 0.04 * (v.shake / 0.35) : 0;
  }
  renderer.render(scene, camera);
  updateLabels(dt);
  placeBeanLabel();
  renderActions();
  updateWishBox();
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
  const mode = inStall ? (inRoom && roomSeat >= 0 ? 'resting' : inRoom && roomStanding ? 'standing' : 'inside') : me.rolling ? 'rolling' : me.ly ? 'lying' : me.b ? 'benched' : me.q ? 'squatting' : me.pl > 0 && nearBean() ? 'bean'
    : nearVendingHere() ? 'vend' : nearWishHere() ? 'wish' : nearSink() ? 'sink'
    : near ? 'near' : nearOcc ? `knock${knockStage(hp[nearestOccupiedStall(me.x, me.y)] ?? 100)}` : bench >= 0 ? `bench${bench}`
      : inBushHere() ? 'bush' : onLawnHere() ? 'lawn' : 'far';
  const key = `${mode === 'bean' ? `bean${me.pl}` : mode}${inRoom ? '@room' : ''}|${me.cn ? 'stuck' : ''}${me.un ? 'under' : ''}${nearDropHere() ? 'drop' : ''}seat${nearSeat()}${choosingToilet ? 'choose' : ''}${(me.pk || []).length}`; // the fertilizer button shows how many you carry; the room adds 일어나기
  if (key === actionMode) return;
  actionMode = key;
  const bar = $('#actions');
  bar.innerHTML = '';
  const pad = $('#pushPad');
  pad.innerHTML = '';
  if (mode === 'inside' || mode === 'squatting') {
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
    push.insertAdjacentHTML('beforeend', '<kbd>Space</kbd>');
    pad.append(push); // only the poop button lives in the bottom-right
  }
  // the bottom bar: the one main thing to do here (Space), and only what belongs to this place
  if (mode === 'inside') {
    // in my own room everything is on the side rail; in a public stall, washing and going out are here
    if (!inRoom) bar.append(withKey(miniBtn('wash', '손 씻기', washFromStall), 'H'), withKey(miniBtn('exit', '나가기', exitStall), 'Esc'));
  } else if (mode === 'squatting') {
    bar.append(withKey(miniBtn('jump', '일어나기', () => send({ t: 'squat', on: false })), 'F'));
  } else if (mode === 'standing') {
    // up and about in my own room: the seats are on the side rail
  } else if (mode === 'resting') {
    // resting on the stool or the sofa: getting up is on the side rail
  } else if (mode === 'rolling') {
    const b = mainBtn('knock', '데굴데굴~', null);
    b.disabled = true;
    bar.append(b);
  } else if (mode === 'lying') {
    bar.append(withKey(mainBtn('jump', '일어나기', () => send({ t: 'lie', on: false })), 'F'));
  } else if (mode === 'benched') {
    bar.append(withKey(mainBtn('jump', '일어나기', () => send({ t: 'bench', on: false })), 'F'));
  } else if (mode === 'sink') {
    bar.append(mainBtn('wash', '손 씻기', washHands));
  } else if (mode === 'near') {
    bar.append(mainBtn('door', '이 칸에 들어가기', () => tryEnter(nearestEmptyStall(me.x, me.y))));
  } else if (mode.startsWith('knock')) {
    const stage = Number(mode.slice(5));
    bar.append(mainBtn('knock', KNOCK_LABELS[stage], () => tryKnock(nearestOccupiedStall(me.x, me.y)), `knock k${stage}`));
  } else if (mode.startsWith('bench')) {
    bar.append(mainBtn('bench', '돗자리에 앉기', () => goSitOnBench(bench)));
  } else if (mode === 'wish') {
    // at the golden poop: rub it, or put your palms together; a wish goes in the box below
    bar.append(mainBtn('rub', '황금똥 문지르기', () => send({ t: 'rub' })), miniBtn('pray', '합장하기', () => send({ t: 'pray' })));
  } else if (mode === 'vend') {
    bar.append(mainBtn('kick', '자판기 차기', () => send({ t: 'kick' })));
  } else if (mode === 'bean') {
    bar.append(mainBtn('sprout', `비료로 뿌리기 · ${me.pl}개`, fertilize));
  } else if (mode === 'bush') {
    bar.append(mainBtn('poop', '똥 누기', () => send({ t: 'squat', on: true })));
  } else if (mode === 'lawn') {
    // 쾌변 체조: any move, any time (1 to 4)
    for (const [move, label] of EX_MOVES) bar.append(miniBtn(null, label, () => doExercise(move)));
  } else {
    if (choosingToilet) {
      // which one, on a line of their own underneath: 1 the public restroom, 2 the premium one, 3 the bushes
      const below = document.createElement('div');
      below.className = 'break';
      bar.append(mainBtn('find', '똥 누러 가기', goPoop, 'on'), below, miniBtn('door', '공중화장실', () => goPoopTo('public')), miniBtn('door', '프리미엄 화장실', () => goPoopTo('private')), miniBtn('poop', '풀숲', () => goPoopTo('bush')));
    } else bar.append(mainBtn('find', '똥 누러 가기', goPoop));
  }
  const canMove = !['inside', 'standing', 'rolling', 'squatting'].includes(mode);
  $('#moveBtn').disabled = !canMove;
  if (!canMove) setMoveMenu(false);

  // the side rail: what you carry or can do anywhere it applies, each always on the same key
  const rail = $('#rail');
  rail.innerHTML = '';
  if ((me.pk || []).length && mode !== 'rolling') {
    const b = withKey(miniBtn('drink', '쾌변음료 마시기', drinkNow), 'C');
    if (me.cn) b.classList.add('urge'); // stuck: this is the way out
    rail.append(b);
  }
  const pickHere = ((mode === 'inside' || mode === 'squatting') && me.un) || (canMove && mode !== 'rolling' && nearDropHere());
  if (pickHere) rail.append(withKey(miniBtn('poop', '줍기', () => send({ t: 'pick' })), 'G'));
  if (mode === 'inside') rail.append(withKey(miniBtn('lunch', '도시락 먹기', () => send({ t: 'lunch' })), 'L'));
  // out walking about (the exercise lawn too): sit or lie down right where you are
  if (mode === 'far' || mode === 'lawn') rail.append(withKey(miniBtn('bench', '앉기', sitHere), 'F'), withKey(miniBtn('lie', '눕기', lieDown), 'Z'));
  if (inRoom) {
    // first, sitting down or getting up (highlighted; Space works it too)
    if (mode === 'inside') rail.append(withKey(mainBtn('jump', '일어나기', () => { setHold(false); roomStanding = true; }), 'F'));
    else if (mode === 'resting') rail.append(withKey(mainBtn('jump', '일어나기', () => { roomSeat = -1; roomStanding = true; }), 'F'));
    else if (mode === 'standing') {
      // sit on the stool or the sofa when you're by it, or back on the toilet whenever
      const by = nearSeat();
      const toilet = () => { roomStanding = false; danceUntil = 0; };
      if (by >= 0) rail.append(mainBtn('bench', room.seats[by].label, () => { roomSeat = by; danceUntil = 0; }), withKey(miniBtn('bench', '변기에 앉기', toilet), 'F'));
      else rail.append(withKey(mainBtn('bench', '변기에 앉기', toilet), 'F'));
    }
    // then my own room's little things, standing or sitting: read, dance, the lights, wash, go
    rail.append(
      withKey(miniBtn('read', '잡지 읽기', readMagazine), 'N'),
      withKey(miniBtn('dance', '춤추기', dance), 'K'),
      withKey(miniBtn('lamp', '조명 바꾸기', nextMood), 'T'),
      withKey(miniBtn('wash', '손 씻기', washFromStall), 'H'),
    );
  }
  if (mode === 'inside' || mode === 'standing' || mode === 'resting') rail.append(withKey(miniBtn('bird', '에티켓벨', ringBell), 'B'));
  if (inRoom) rail.append(withKey(miniBtn('exit', '나가기', exitStall), 'Esc'));
  labelKeys(rail);
  labelKeys(bar);
}

// a button that always answers to the same key, wherever it shows up
function withKey(b, key) {
  b.dataset.key = key;
  return b;
}

// every button shows its key beside it, like the sauna's bar: Space for the main one, then 1, 2, 3 …
// (buttons with their own key keep it)
// (in a stall or a squat, Space is the push button)
function labelKeys(bar) {
  let n = 1;
  let spaceTaken = Boolean($('#pushPad .act.push'));
  for (const b of bar.querySelectorAll('button')) {
    let key;
    if (b.dataset.key) key = b.dataset.key; // a button with its own key (F, G, C, H, Esc …)
    else if (!spaceTaken && b.classList.contains('main')) {
      key = 'Space';
      spaceTaken = true;
    } else key = String(n++);
    b.dataset.key = key;
    b.insertAdjacentHTML('beforeend', `<kbd>${key}</kbd>`);
  }
}

// 눕기: on your back right here, and the view goes up to the sky
function lieDown() {
  target = null;
  skyLook.yaw = skyLook.pitch = 0;
  sendMove(true);
  send({ t: 'lie', on: true });
}

function sitHere() {
  target = null;
  sendMove(true);
  send({ t: 'bench', on: true });
}

// 똥 누러 가기: off to the nearest free stall, or to the bushes when every stall is taken
// 똥 누러 가기 asks which: the public restroom or the premium one (they don't look like restrooms from afar)
let choosingToilet = false;
function goPoop() {
  choosingToilet = !choosingToilet;
}
function goPoopTo(type) {
  choosingToilet = false;
  const i = type === 'bush' ? -1 : closestAnywhere((k) => freeFor(k) && LAYOUT[k].type === type);
  if (i >= 0) {
    walkToStall(i);
    return;
  }
  const b = GROUNDS.bushes.reduce((a, c) => (Math.hypot(c.x - me.x, c.y - me.y) < Math.hypot(a.x - me.x, a.y - me.y) ? c : a));
  target = settleLocal({ x: b.x, y: b.y });
  pendingEnter = -1;
  showTapMark(toX(target.x), toZ(target.y));
  if (type !== 'bush') toast(`${type === 'private' ? '프리미엄 화장실' : '공중화장실'}이 다 찼어요. 가까운 풀숲으로 가요`);
}

// ---------- the vending machines, the drink in your hand, and 변비 ----------

const nearWishHere = () => Boolean(GROUNDS) && me.s === -1 && Math.hypot(me.x - GROUNDS.wish.x, me.y - GROUNDS.wish.y) <= GROUNDS.wishRange;
const nearVendingHere = () => Boolean(GROUNDS) && me.s === -1 && GROUNDS.terrace.vendings.some((v) => Math.hypot(me.x - v.x, me.y - v.y) <= GROUNDS.vendRange);

function drinkNow() {
  if (!(me.pk || []).length) {
    toast('손에 음료가 없어요. 자판기를 차러 가 볼까요?');
    return;
  }
  setHold(false);
  send({ t: 'drink', k: 0 });
}

function onKick(m) {
  const e = users.get(m.id);
  if (e) {
    e.kickT = 0.001;
    if (m.kept) e.idle = 9; // a drink in hand: turn to the front right away, to show it
  }
  const vending = vendings[m.v] || vendings[0];
  if (vending) vending.shake = 0.35;
  const at = vending ? vending.slot() : null;
  const byMe = m.id === meId;
  if (at) pop(at.clone().add(new THREE.Vector3(0, 1.3, 0)), m.drink ? '덜컹… 툭!' : '쾅!');
  if (byMe) playKnock(0.6, 2);
  if (!m.drink) return;
  if (at) pop(at.clone().add(new THREE.Vector3(0, 0.6, 0)), DRINK[m.drink].name);
  if (byMe) {
    plop(0.6);
    toast(m.kept ? `${withJosa(DRINK[m.drink].name, '이', '가')} 나왔어요!` : '음료가 나왔는데 손에 이미 하나 들고 있어요');
    if (m.drink === 'gold') playDing();
  }
}

// the drink in someone's hand: a little bottle or cup held in the right hand
const drinking = new Map(); // person id -> { until, kind }: tipping it back right now
const drinkingNow = (id) => {
  const d = drinking.get(id);
  return d && d.until > performance.now() ? d.kind : '';
};
function syncHand(p, kind) {
  if (!p.parts.hand_R) return;
  if (p.handKind !== kind) {
    if (p.hand) p.parts.hand_R.remove(p.hand);
    p.hand = null;
    p.handKind = kind;
    if (kind) {
      const d = DRINK[kind];
      const g = new THREE.Group();
      const shape = d.shape === 'cup' ? new THREE.CylinderGeometry(0.035, 0.028, 0.1, 12) : d.shape === 'small' ? new THREE.CylinderGeometry(0.022, 0.022, 0.07, 10) : new THREE.CylinderGeometry(0.028, 0.03, 0.11, 12);
      const body = mesh(shape, mat(d.color), { cast: true });
      const cap = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.02, 10), mat(d.cap));
      cap.position.y = 0.06;
      g.add(body, cap);
      g.scale.setScalar(2.3); // big enough to read on a chibi hand
      g.position.set(0, -0.08, 0.07);
      p.parts.hand_R.add(g);
      p.hand = g;
    }
  }
}
// tipping it back: the hand up at the mouth, the head back
function drinkPose(p) {
  // the bottle up beside the cheek, out to the side and a little in front, so the face never hides it
  p.parts.arm_R?.rotation.set(-1.55, 0, -0.55);
  p.parts.head?.rotation.set(-0.3, 0, -0.18); // head tipped back and toward the bottle
}
// picking up the poop under you: up it goes onto the pile on your head (a golden one stays golden)
function onPick(m) {
  if (m.gold) {
    if (!poopGolds.has(m.id)) poopGolds.set(m.id, new Set());
    poopGolds.get(m.id).add(m.pile - 1);
  }
  if (!m.drop) underGold.delete(m.id);
  else if (drops.has(m.drop)) {
    fxRoot.remove(drops.get(m.drop).s); // gone from the ground at once, before the next state
    drops.delete(m.drop);
  }
  const h = headOf(m.id);
  if (h) pop(h.clone(), '줍줍', m.id === meId && inRoom);
}

// ---------- 도시락: a lunchbox opened on the lap in the stall, eaten with chopsticks ----------

const LUNCH_MS = 6500;
const lunching = new Map(); // id -> until when (performance.now())
function onLunch(m) {
  lunching.set(m.id, performance.now() + LUNCH_MS);
  const inside = m.id === meId && inRoom;
  const say = (text, ms) => setTimeout(() => {
    const h = headOf(m.id);
    if (h) pop(h.clone(), text, inside);
  }, ms);
  say('도시락 냠냠', 0);
  say('냠', 2400);
  say('냠냠…', 4600);
  if (m.id === meId && soundOn) for (let k = 0; k < 3; k++) tone('triangle', 330, 260, 0.08, 0.2, 1.2 + k * 1.9);
}
function lunchbox() {
  // a black lacquered box: rice, a rolled omelette, a little sausage, greens and a pickled plum
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(0.17, 0.045, 0.12), mat('#2b2321'), { cast: true }));
  const fill = (w, d, color, x, z, h = 0.012) => {
    const m = mesh(new THREE.BoxGeometry(w, h, d), mat(color));
    m.position.set(x, 0.022 + h / 2, z);
    g.add(m);
  };
  fill(0.08, 0.1, '#fbf8f0', -0.035, 0); // the rice
  fill(0.07, 0.045, '#f3cf4a', 0.04, -0.025, 0.02); // 계란말이
  fill(0.035, 0.03, '#d9534a', 0.03, 0.03, 0.018); // sausage
  fill(0.03, 0.03, '#5aa34a', 0.06, 0.03, 0.014); // greens
  const plum = mesh(new THREE.SphereGeometry(0.012, 8, 6), mat('#c7304a'));
  plum.position.set(-0.035, 0.036, 0);
  g.add(plum);
  return g;
}
function chopsticks() {
  const g = new THREE.Group();
  for (const x of [-0.008, 0.008]) {
    const c = mesh(new THREE.CylinderGeometry(0.004, 0.006, 0.2, 6), mat('#c79a5b'));
    c.position.set(x, -0.1, 0);
    g.add(c);
  }
  return g;
}
// after the pose for this frame: the box held in the left hand on the lap, the right hand going from box to mouth
function lunchFor(p, id, t, seated) {
  const on = seated && (lunching.get(id) || 0) > performance.now();
  if (!on) {
    if (p.lunch) p.lunch.box.visible = p.lunch.sticks.visible = false;
    return;
  }
  if (!p.lunch && p.parts.hand_L && p.parts.hand_R) {
    p.lunch = { box: lunchbox(), sticks: chopsticks() };
    p.lunch.box.scale.setScalar(1.6);
    p.lunch.sticks.scale.setScalar(1.6);
    p.parts.hand_L.add(p.lunch.box);
    p.parts.hand_R.add(p.lunch.sticks);
  }
  if (!p.lunch) return;
  p.lunch.box.visible = p.lunch.sticks.visible = true;
  const k = (1 - Math.cos(t * 3.2)) / 2; // 0 at the box, 1 at the mouth
  p.parts.arm_L.rotation.set(-1.15, 0, -0.25);
  p.lunch.box.position.set(0.04, -0.17, 0.06);
  p.lunch.box.rotation.set(1.15, 0, 0); // kept level in the tilted hand
  p.parts.arm_R.rotation.set(-1.0 - 0.75 * k, 0, 0.25 + 0.3 * k);
  p.lunch.sticks.position.set(0, -0.14, 0.02);
  p.parts.head.rotation.set(0.25 - 0.15 * k, 0, 0); // looking down into the box, then up for the bite
}

// the face going red while someone pushes, yellow when they're stuck (변비)
const flushOf = (u) => [u.h && !u.cn ? Math.min(1, 0.25 + (u.p || 0) / 100) : 0, u.cn ? 1 : 0];

// what someone holds and whether they're drinking it, after their pose for this frame
function handFor(p, id, u, free) {
  const now = drinkingNow(id);
  const held = free ? (u.pk || [])[0] || '' : '';
  syncHand(p, now || held);
  if (now) drinkPose(p);
  else if (held) p.parts.arm_R?.rotation.set(-0.8, 0, 0.3); // carried out in front, where you can see it
}

function onDrink(m) {
  drinking.set(m.id, { until: performance.now() + 1600, kind: m.drink });
  const h = headOf(m.id);
  const inside = m.id === meId && inRoom;
  if (h) pop(h.clone(), DRINK[m.drink].sip, inside);
  if (m.cure) setTimeout(() => {
    const h2 = headOf(m.id);
    if (h2) pop(h2.clone(), '꾸르륵…', inside);
  }, 700);
  if (m.id === meId) {
    tone('sine', 520, 380, 0.25, 0.25);
    if (!m.cure && !me.cn) toast(`${DRINK[m.drink].name}, 시원하다`);
  }
}

function onStuck(m) {
  const h = headOf(m.id);
  if (m.id === meId) {
    buzz([60, 40, 60]);
    toast((me.pk || []).length ? '변비에 걸렸어요! 쾌변음료를 마시면 풀려요' : '변비에 걸렸어요! 쾌변음료를 한 병 마시거나 체조를 두 번 하면 풀려요');
  } else if (h) pop(h.clone(), '끄으응…');
}

// a cup on the table in front of you when you sit at the terrace with a drink in hand
function placeCup(e, u, X, Z) {
  const want = u.b && (u.pk || []).length ? u.pk[0] : '';
  if (!want) {
    if (e.cup) e.cup.visible = false;
    return;
  }
  if (!e.cup || e.cupKind !== want) {
    if (e.cup) charRoot.remove(e.cup);
    e.cup = mesh(new THREE.CylinderGeometry(0.045, 0.035, 0.12, 14), mat(DRINK[want].color), { cast: true });
    e.cupKind = want;
    charRoot.add(e.cup);
  }
  e.cup.visible = true;
  if (onAMat(e.rx, e.ry)) {
    const t = GROUNDS.terrace.picnics.reduce((a, b) => (Math.hypot(b.x - e.rx, b.y - e.ry) < Math.hypot(a.x - e.rx, a.y - e.ry) ? b : a));
    e.cup.position.set(lerp(X, toX(t.x), 0.6), 0.08, lerp(Z, toZ(t.y), 0.6)); // on the mat in front of you
  } else e.cup.position.set(X + Math.sin(e.turn) * 0.4, 0.07, Z + Math.cos(e.turn) * 0.4); // on the grass in front of you
}

// ---------- the bushes and the 쾌변 체조 lawn ----------

const EX_MOVES = [['bridge', '엉덩이 브릿지'], ['bow', '활 자세'], ['twist', '허리 비틀기'], ['boat', '보트 자세']];
const inBushHere = () => Boolean(GROUNDS) && GROUNDS.bushes.some((b) => Math.hypot(me.x - b.x, me.y - b.y) <= b.r);
const onLawnHere = () => Boolean(GROUNDS) && Math.hypot(me.x - GROUNDS.exercise.x, me.y - GROUNDS.exercise.y) <= GROUNDS.exercise.r;
function doExercise(move) {
  target = null;
  sendMove(true);
  send({ t: 'ex', move });
}

function onSignal(m) {
  const h = headOf(m.id);
  if (h) pop(h.clone(), '신호가 왔다!', m.id === meId && inRoom);
  if (m.id === meId) {
    buzz([40, 60, 40]);
    if (m.cure) toast('변비가 풀렸어요');
  }
}

// ---------- the name of the place you're in, shown for a moment when you walk into it ----------

function placeAt(x, y) {
  const L = GROUNDS;
  const near = (p, r) => Math.hypot(x - p.x, y - p.y) <= r;
  const P = L.public;
  const V = L.private;
  if (x > P.x0 - 40 && x < P.x1 + 40 && y > P.y0 && y < P.y1 + 40) return '공중화장실';
  if (x > V.x0 - 120 && x < V.x1 + 120 && y > V.y1 && y < V.y1 + 280) return '프리미엄 화장실';
  if (near(L.garden, 260)) return '작은 정원';
  if (near(L.bean, L.plazaR + 20)) return '콩나무 광장';
  if (near(L.terrace, L.terraceR + 40)) return '테라스';
  if (near(L.exercise, L.exercise.r + 20)) return '쾌변 체조장';
  if (near(L.pond, L.pond.r + 160)) return '연못';
  if (L.bushes.some((b) => near(b, b.r))) return '풀숲';
  if (near(L.gate, 420)) return '똥타'; // coming in: the name of the place itself
  return '';
}

let placeShown = '';
let placeSeen = { name: '', since: 0 };
let placeTimer = 0;
let placeStall = -1;
function showPlaceName(name) {
  const el = $('#placeName');
  el.textContent = name;
  el.classList.add('on');
  clearTimeout(placeTimer);
  placeTimer = setTimeout(() => el.classList.remove('on'), 2400);
}
function updatePlaceName() {
  if (!me.ready || !GROUNDS || OG) return;
  if (me.s !== placeStall) {
    // sitting down in a stall names that stall; getting up doesn't re-announce the restroom
    placeStall = me.s;
    if (me.s !== -1) showPlaceName(stallName(me.s));
    return;
  }
  if (me.s !== -1) return;
  const now = performance.now();
  const name = placeAt(me.x, me.y);
  if (name !== placeSeen.name) placeSeen = { name, since: now };
  // only once you've been there a moment, and not again for the place you were just in
  if (name && name !== placeShown && now - placeSeen.since > 300) {
    placeShown = name;
    showPlaceName(name);
  }
}

// ---------- 공간 이동: a shortcut to each place on the grounds (walking there still works) ----------

const moveMenu = $('#moveMenu');
$('#moveBtn').innerHTML = `${icoImg('pin')}<span>공간 이동</span><kbd>M</kbd>`;
$('#moveBtn').addEventListener('click', () => setMoveMenu(moveMenu.hidden));
function setMoveMenu(open) {
  if (open && (!GROUNDS || me.s !== -1 || me.rolling)) return;
  if (open) {
    moveMenu.innerHTML = '';
    for (const spot of GROUNDS.spots) {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'menuitem');
      b.textContent = spot.name;
      b.addEventListener('click', () => moveTo(spot));
      moveMenu.append(b);
    }
  }
  moveMenu.hidden = !open;
}

let moving = false;
function moveTo(spot) {
  setMoveMenu(false);
  if (moving || me.s !== -1 || me.rolling) return;
  moving = true;
  const fade = $('#fade');
  fade.classList.add('on');
  setTimeout(() => {
    me.x = spot.x;
    me.y = spot.y;
    target = null;
    pendingEnter = -1;
    pendingBench = false;
    pendingWash = false;
    sendMove(true);
    // look out over the place you arrived at, without the camera flying across the grounds
    Object.assign(cam, { tYaw: spot.yaw, tPitch: WALK_VIEW.pitch, tDist: WALK_VIEW.dist, tLook: 0 });
    focusKey = '';
    camBefore = null;
    walkedYet = true;
    manualCamAt = performance.now();
    snapCam = true;
    fade.classList.remove('on');
    moving = false;
  }, 240);
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
  b.innerHTML = `${ico ? icoImg(ico) : ''}<span>${label}</span>`;
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
  if (text && wishing) send({ t: 'wish', text });
  chatInput.value = '';
});
// there's no chat: the only box to type in is the wish box, and it shows only in front of the golden poop
let wishing = false;
function updateWishBox() {
  const now = nearWishHere();
  if (now === wishing) return;
  wishing = now;
  chatInput.placeholder = '황금똥에게 소원 빌기…';
  chatBox.classList.toggle('wishing', wishing);
  document.body.classList.toggle('wish-near', wishing);
  if (!wishing) chatInput.blur();
}

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

// ---------- what plays where ----------
// With 배경음악도 on: the private room has the waltz, the public restroom a lo-fi hip-hop loop, the bushes the sound
// of the woods. Out on the grounds it's quiet.

const MUSIC_VOLUME = 0.2; // a soft background
// a track's own volume, fading in from silence; stopping fades it out and lets it go
function trackBus(volume, fade = 2) {
  const ctx = actx();
  const bus = ctx.createGain();
  bus.gain.setValueAtTime(0.0001, ctx.currentTime);
  bus.gain.linearRampToValueAtTime(volume, ctx.currentTime + fade);
  bus.connect(out());
  return bus;
}
function endTrack(bus, cleanup) {
  const now = actx().currentTime;
  bus.gain.cancelScheduledValues(now);
  bus.gain.setValueAtTime(bus.gain.value, now);
  bus.gain.linearRampToValueAtTime(0.0001, now + 0.8);
  setTimeout(() => {
    cleanup();
    bus.disconnect();
  }, 1000);
}
// a scheduler that keeps notes queued a little ahead of time, until stopped
function scheduler(tick) {
  let alive = true;
  const run = () => alive && tick(actx().currentTime + (document.hidden ? 1.6 : 0.5)); // hidden tabs tick slowly
  run();
  const timer = setInterval(run, 120);
  return () => {
    alive = false;
    clearInterval(timer);
  };
}
let noiseBuf = null;
const noise = () => {
  if (!noiseBuf) {
    const ctx = actx();
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const ch = noiseBuf.getChannelData(0);
    for (let k = 0; k < ch.length; k++) ch[k] = Math.random() * 2 - 1;
  }
  return noiseBuf;
};

// the waltz: violin over an oom-pah-pah
function startWaltz() {
  const ctx = actx();
  const bus = trackBus(MUSIC_VOLUME, 2.5);
  const dry = ctx.createGain();
  dry.gain.value = 0.85;
  const wet = ctx.createGain();
  wet.gain.value = 0.4;
  const verb = ctx.createConvolver();
  verb.buffer = reverbImpulse(2.6);
  const mix = ctx.createGain();
  mix.connect(dry).connect(bus);
  mix.connect(verb).connect(wet).connect(bus);
  const t0 = ctx.currentTime + 0.2;
  let loop = 0;
  let i = 0;
  const stop = scheduler((horizon) => {
    for (;;) {
      const ev = SONG.events[i];
      const t = t0 + (loop * SONG.beats + ev.beat) * BEAT;
      if (t > horizon) break;
      const low = loop % 2 === 1; // every other time round, the tune drops an octave
      if (ev.kind === 'violin') violinNote(mix, low ? ev.f / 2 : ev.f, t, ev.len * BEAT, low ? 0.16 : 0.12);
      else if (ev.kind === 'bass') pluckNote(mix, ev.f, t, 0.3, 0.9);
      else pluckNote(mix, ev.f, t, 0.06, 0.35);
      if (++i === SONG.events.length) {
        i = 0;
        loop++;
      }
    }
  });
  return () => endTrack(bus, stop);
}

// the public restroom: a lazy boom-bap loop at 86 bpm, swung hats, soft electric-piano 7th chords and a round bass
function startHiphop() {
  const ctx = actx();
  const bus = trackBus(0.26, 1.5);
  const warm = ctx.createBiquadFilter(); // a little dull, like an old record
  warm.type = 'lowpass';
  warm.frequency.value = 3400;
  warm.connect(bus);
  const hit = (t, build) => {
    const g = ctx.createGain();
    g.connect(warm);
    build(g, t);
  };
  const kick = (t) => hit(t, (g) => {
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
    o.connect(g);
    o.start(t);
    o.stop(t + 0.4);
  });
  const noisy = (t, type, freq, vol, decay) => hit(t, (g) => {
    const src = ctx.createBufferSource();
    src.buffer = noise();
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + decay);
    src.connect(f).connect(g);
    src.start(t, Math.random());
    src.stop(t + decay + 0.02);
  });
  const snare = (t) => {
    noisy(t, 'bandpass', 1900, 0.45, 0.2);
    hit(t, (g) => {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = 190;
      g.gain.setValueAtTime(0.18, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      o.connect(g);
      o.start(t);
      o.stop(t + 0.12);
    });
  };
  const tone = (f, t, len, vol, type = 'sine') => hit(t, (g) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(vol * 0.35, t + len * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g);
    o.start(t);
    o.stop(t + len + 0.05);
  });
  const CHORDS = [
    [174.6, 220.0, 261.6, 329.6], // Fmaj7
    [164.8, 196.0, 246.9, 293.7], // Em7
    [146.8, 174.6, 220.0, 261.6], // Dm7
    [130.8, 164.8, 196.0, 246.9], // Cmaj7
  ];
  const STEP = 60 / 86 / 4; // a sixteenth
  const t0 = ctx.currentTime + 0.15;
  let step = 0;
  const stop = scheduler((horizon) => {
    for (;;) {
      const s = step % 16;
      const bar = Math.floor(step / 16) % 4;
      const t = t0 + step * STEP + (s % 2 ? STEP * 0.2 : 0); // swung
      if (t > horizon) break;
      if (s === 0 || s === 7 || s === 10 || (bar % 2 && s === 14)) kick(t);
      if (s === 4 || s === 12) snare(t);
      if (s % 2 === 0) noisy(t, 'highpass', 7500, s % 4 ? 0.05 : 0.08, 0.05);
      if (s === 0) {
        CHORDS[bar].forEach((f, k) => {
          tone(f, t + k * 0.012, STEP * 14, 0.045); // rolled a touch, like fingers on keys
          tone(f * 2, t + k * 0.012, STEP * 6, 0.012);
        });
        tone(CHORDS[bar][0] / 2, t, STEP * 7, 0.22);
      }
      if (s === 10) tone(CHORDS[bar][0] / 2, t, STEP * 5, 0.18);
      if (Math.random() < 0.08) noisy(t, 'highpass', 3000, 0.02, 0.01); // vinyl crackle
      step++;
    }
  });
  return () => endTrack(bus, stop);
}

// the bushes: wind in the leaves, rising and falling, and birds now and then
function startForest() {
  const ctx = actx();
  const bus = trackBus(1, 1.5);
  const sources = [];
  const bed = (type, freq, vol, sway) => {
    const src = ctx.createBufferSource();
    src.buffer = noise();
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = 0.6;
    const g = ctx.createGain();
    g.gain.value = vol;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = sway;
    const depth = ctx.createGain();
    depth.gain.value = vol * 0.7;
    lfo.connect(depth).connect(g.gain);
    src.connect(f).connect(g).connect(bus);
    src.start();
    lfo.start();
    sources.push(src, lfo);
  };
  bed('bandpass', 500, 0.45, 0.07); // the wind
  bed('highpass', 2800, 0.12, 0.21); // the leaves
  const chirp = (t, f, pan) => {
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 1.35, t + 0.06);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.16, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    o.connect(g).connect(p).connect(bus);
    o.start(t);
    o.stop(t + 0.1);
  };
  let next = ctx.currentTime + 1;
  const stop = scheduler((horizon) => {
    while (next < horizon) {
      const f = 2200 + Math.random() * 1600;
      const pan = Math.random() * 1.6 - 0.8;
      const n = 2 + Math.floor(Math.random() * 4);
      for (let k = 0; k < n; k++) chirp(next + k * 0.13, f * (1 + (k % 2) * 0.08), pan);
      next += 1 + Math.random() * 3;
    }
  });
  return () => endTrack(bus, () => {
    stop();
    for (const s of sources) s.stop();
  });
}

const TRACKS = { waltz: startWaltz, hiphop: startHiphop, forest: startForest };
let track = { name: '', stop: null };
// near the bushes (in them, or within a few metres): the woods can be heard
const byTheBushes = () => Boolean(GROUNDS) && me.s === -1 && GROUNDS.bushes.some((b) => Math.hypot(me.x - b.x, me.y - b.y) <= b.r + 300);
function wantedTrack() {
  if (!soundOn || !soundStarted) return '';
  if (byTheBushes()) return 'forest'; // the woods are a sound of the place, not music: on whenever sound is
  if (soundMode !== 'all') return ''; // the music comes with 장소 음악도
  if (inRoom) return dancing() ? 'hiphop' : 'waltz'; // dancing in the room puts the beat on
  if ((me.s !== -1 && LAYOUT[me.s]?.type === 'public') || (GROUNDS && placeAt(me.x, me.y) === '공중화장실')) return 'hiphop';
  return ''; // out on the grounds it's quiet
}
function updateTrack() {
  const want = wantedTrack();
  if (want === track.name) return;
  track.stop?.();
  track = { name: want, stop: want ? TRACKS[want]() : null };
}
setInterval(updateTrack, 400);

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
  updateTrack();
  loadSounds();
};
document.addEventListener('pointerdown', startSoundOnce, true);
document.addEventListener('keydown', startSoundOnce, true);

$('#recenterBtn').innerHTML = icoImg('recenter');
$('#recenterBtn').addEventListener('click', recenterCam);
// the sound button opens a small menu: effects only / with music / off
const SOUND_MODES = {
  fx: { icon: 'soundOn', label: '효과음만', toast: '효과음만 들려요' },
  all: { icon: 'music', label: '장소 음악도', toast: '화장실과 풀숲에서 음악이 들려요' },
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
  updateTrack(); // queued now, heard as soon as the phone lets the sound through
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
  if (!moveMenu.hidden && !e.target.closest('#moveMenu, #moveBtn')) setMoveMenu(false);
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
    // sitting or squatting: the down arrow gets you up (on the toilet in your room, the stool or sofa, a mat, the grass)
    if ((e.code === 'ArrowDown' || e.code === 'KeyS') && ((inRoom && !roomStanding) || roomSeat >= 0 || me.b || me.q)) {
      const up = [...document.querySelectorAll('#actions button')].find((b) => b.textContent.startsWith('일어나기'));
      if (up && !e.repeat) up.click();
      return;
    }
    if (me.s !== -1 && !(inRoom && roomStanding)) return; // in a stall the arrows do nothing (up and about in your own room, they walk)
    keys.add(e.code);
  } else if (e.code === 'Space') {
    e.preventDefault();
    spaceHeld = true;
    if (me.s !== -1 || me.q) {
      if (inRoom && (roomStanding || roomSeat >= 0)) {
        if (MOVE_KEYS.some((k) => keys.has(k))) return; // walking about the room: Space runs
        if (!e.repeat) ($('#actions button.main') || $('#rail button.main'))?.click(); // otherwise the main button: sit down, or get up
        return;
      }
      if (!e.repeat) setHold(true);
      return;
    }
    // holding a direction: Space means run, not sit or knock
    if (MOVE_KEYS.some((k) => keys.has(k))) return;
    // otherwise Space is the main button, whatever it is right now (knocks repeat while held)
    const main = $('#actions').querySelector('button[data-key="Space"]') || $('#actions').querySelector('button.main'); // a main button with its own key answers to Space too
    if (main && !main.disabled && (!e.repeat || main.classList.contains('knock'))) main.click();
  } else if (/^Digit[1-9]$/.test(e.code)) {
    const b = $('#actions').querySelector(`button[data-key="${e.code.slice(5)}"]`);
    if (b && !b.disabled && !e.repeat) b.click();
  } else if (e.code === 'KeyR') {
    recenterCam();
  } else if (e.code === 'KeyM') {
    setMoveMenu(moveMenu.hidden);
  } else if (e.code === 'KeyQ') {
    cam.tYaw = clamp(cam.tYaw + 0.35, -YAW_MAX, YAW_MAX);
    manualCamAt = performance.now();
  } else if (e.code === 'KeyE') {
    cam.tYaw = clamp(cam.tYaw - 0.35, -YAW_MAX, YAW_MAX);
    manualCamAt = performance.now();
  } else if (/^Key[A-Z]$/.test(e.code)) {
    // the buttons with their own letter key: 앉기·일어나기 F, 줍기 G, 쾌변음료 C, 손 씻기 H, 도시락 L, 에티켓벨 B
    const k = e.code.slice(3);
    const b = document.querySelector(`#actions button[data-key="${k}"], #rail button[data-key="${k}"]`);
    if (b && !b.disabled && !e.repeat) b.click();
  } else if (e.key === '=' || e.key === '+') {
    cam.tDist = clamp(cam.tDist * 0.8, DIST_MIN, DIST_MAX);
    manualCamAt = performance.now();
  } else if (e.key === '-' || e.key === '_') {
    cam.tDist = clamp(cam.tDist * 1.25, DIST_MIN, DIST_MAX);
    manualCamAt = performance.now();
  } else if (e.key === 'Escape') {
    if (me.s !== -1) exitStall();
    else if (me.q) {
      setHold(false);
      send({ t: 'squat', on: false });
    }
  } else if (e.key === 'Enter' && wishing) {
    e.preventDefault();
    openChat(); // the only typing left: a wish at the golden poop
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
  if (pick(x, y)?.object.userData.wish && me.ready && me.s === -1 && !me.rolling) {
    // walk up to the golden poop (wishing happens right here, not on another page)
    const w = GROUNDS.wish;
    const a = Math.atan2(me.x - w.x, me.y - w.y);
    target = settleLocal({ x: w.x + Math.sin(a) * 120, y: w.y + Math.cos(a) * 120 });
    pendingEnter = -1;
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
  target = settleLocal({ x: hit.point.x / U, y: hit.point.z / U });
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
