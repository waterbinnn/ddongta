// The grounds, in centimetres: shared by the server (movement, stalls, zones) and the page (sent in `welcome`).
// The beanstalk plaza is in the middle at (CENTER, CENTER); larger y is south, toward the entrance.
// Numbers follow the approved blockout in tools/blender/concept_space.py (metres there, Blender's +y is north).

const CENTER = 2000;
const STALL_W = 110;   // one stall door
const ENTER_RANGE = 75; // how close to a stall's door you must be
// Not a ring of places round a plaza any more, but a way in, like a temple's: through the entrance in the south,
// up an avenue of lanterns and trees to the beanstalk courtyard, and on to the golden poop shrine at the head of it.
// The other places sit off to the sides, each in its own clearing among the trees.
// The ground you can walk on is an oval, longer north to south; the forest starts past its edge.
const WALK = { x: CENTER, y: CENTER + 200, rx: 2350, ry: 2950 };
const PLAZA_R = 720; // the courtyard round the beanstalk
const TERRACE_R = 450; // the terrace with the picnic mats and vending machines
const WALL_H = 420; // the restroom walls: well over head height
const RINGS = { wallH: WALL_H, plazaR: PLAZA_R, terraceR: TERRACE_R, flatR: 4400 };

// from metres (x east, y north) to these centimetres (x east, y south)
const at = (mx, my) => ({ x: Math.round(CENTER + mx * 100), y: Math.round(CENTER - my * 100) });

// ---------- stalls: two restrooms, apart, doors facing south ----------
// Each entry: the left corner of its door line (cx, cy), its rotation (three.js y rotation, 0 = door faces south),
// and the spot in front of the door (x, y) where people stand to enter or knock. The stall itself is behind the door line.
const stalls = [];
function addStall(cx, cy, type, no) {
  const doorX = cx + STALL_W / 2;
  stalls.push({ cx, cy, rot: 0, fx: 0, fy: 1, x: Math.round(doorX), y: Math.round(cy + 45), type, no });
}
// the private restroom: a closed brick cottage tucked into the trees to the west, 8 rooms, each its own room
const PRIVATE = { x0: 40, x1: 960, y0: 825, y1: 1245 };
for (let k = 0; k < 8; k++) addStall(PRIVATE.x0 + 20 + k * STALL_W, PRIVATE.y1, 'private', k + 1);
// the public restroom: an open-fronted pavilion off to the north-east, 10 stalls along the back wall, sinks on the east wall
const PUBLIC = { x0: 2780, x1: 3920, y0: 420, y1: 980, doorLine: 600 };
for (let k = 0; k < 10; k++) addStall(PUBLIC.x0 + 20 + k * STALL_W, PUBLIC.doorLine, 'public', k + 1);
// a flower bed beside the shrine
const garden = at(-5, 4);
// the beanstalk everyone's poop feeds, in the middle of the courtyard; you fertilize it standing in front of it
const bean = at(0, -8);
const BEAN_RANGE = 260;
// the golden poop: a big statue, like a Buddha in a temple hall, on a broad stone plinth at the head of the way in,
// the trees close behind it. Rub it, put your palms together, make a wish
const wish = at(0, 7);

// ---------- things you can't walk through (axis-aligned boxes) ----------
const box = (x, y, hw, hd) => ({ x0: x - hw, y0: y - hd, x1: x + hw, y1: y + hd });
// the terrace off to the east of the courtyard: colourful picnic mats on the grass, beach parasols, two vending machines
const tc = at(12.5, -8);
const off = (dx, dy) => ({ x: Math.round(tc.x + dx * 100), y: Math.round(tc.y - dy * 100) });
const terrace = {
  x: tc.x, y: tc.y,
  vendings: [off(3.3, 1.6), off(3.5, 0.45)], // side by side on the east side, backs away from the way in
  // the mats: where each lies and which way it's turned
  picnics: [{ ...off(-2.1, 1.4), rot: 0.3 }, { ...off(0.9, 2.5), rot: -0.5 }, { ...off(1.5, -1.4), rot: 0.9 }, { ...off(-1.8, -2.1), rot: -0.2 }],
};
const SINK_COUNTER = { x0: PUBLIC.x1 - 120, x1: PUBLIC.x1 - 20, y0: PUBLIC.doorLine + 80, y1: PUBLIC.doorLine + 320 };
const gate = at(0, -29.5);
// a round pond below the terrace
const pond = { ...at(13, -18.5), r: 210 };
// the 쾌변 exercise ground: a clearing to the west of the courtyard
const exercise = at(-13.5, -11);
// trees on the grounds (the forest past the edge is only scenery): an avenue up the way in, a grove behind the
// shrine, and stands between the places so each feels like a clearing of its own
const trees = [
  ...[-24, -19, -14].flatMap((y) => [{ ...at(-4.6, y), s: 1.1 }, { ...at(4.6, y), s: 1.0 }]),
  { ...at(-4.5, 10.5), s: 1.5 }, { ...at(0, 12.5), s: 1.7 }, { ...at(4.5, 10.5), s: 1.4 },
  { ...at(-7.5, -3), s: 1.2 }, { ...at(-8, -19), s: 1.1 }, { ...at(-20, -4), s: 1.0 },
  { ...at(7.5, -2), s: 1.1 }, { ...at(8.5, -15), s: 1.0 }, { ...at(19, -2), s: 1.2 },
  { ...at(-8, 9.5), s: 1.1 }, { ...at(-21, 13), s: 1.3 }, { ...at(6.5, 10), s: 1.0 }, { ...at(20.5, 7), s: 1.1 },
];
// lanterns: low ones in pairs lining the way in, taller ones round the courtyard and by a few places
// (none at the restroom doors)
const lampPosts = [
  ...[-27, -24, -21, -18, -15].flatMap((y) => [at(-1.7, y), at(1.7, y)]).map((p) => ({ ...p, low: true })),
  at(-5.5, -4), at(5.5, -4), at(-5.5, -12), at(5.5, -12), at(-3.2, 3.6), at(3.2, 3.6),
  at(9, -5), at(-9, -8), at(10, -21),
];
// the premium restroom is an open resort pavilion: teak posts all round, nothing inside walls you off. Along the front
// a post between each pair of room spots; the same along the back; three more down each side
const templeColumns = (() => {
  const spots = stalls.filter((st) => st.type === 'private').map((st) => st.x);
  const xs = [PRIVATE.x0 + 8, ...spots.slice(1).map((x, k) => (x + spots[k]) / 2), PRIVATE.x1 - 8];
  const sides = [1, 2, 3].map((k) => Math.round(PRIVATE.y0 - 16 + (k * (PRIVATE.y1 - PRIVATE.y0 + 32)) / 4));
  return [
    ...xs.map((x) => ({ x, y: PRIVATE.y1 + 16 })),
    ...xs.map((x) => ({ x, y: PRIVATE.y0 - 16 })),
    ...sides.flatMap((y) => [{ x: PRIVATE.x0 + 8, y }, { x: PRIVATE.x1 - 8, y }]),
  ];
})();
// palms round the pavilion, leaning a little
const palms = [
  { x: PRIVATE.x0 - 150, y: PRIVATE.y1 + 170, h: 6.2, lean: -0.25 },
  { x: PRIVATE.x1 + 140, y: PRIVATE.y1 + 140, h: 5.4, lean: 0.3 },
  { x: PRIVATE.x0 - 120, y: PRIVATE.y0 - 90, h: 5.8, lean: -0.2 },
  { x: PRIVATE.x1 + 160, y: PRIVATE.y0 - 70, h: 6.6, lean: 0.22 },
];
const obstacles = [
  ...templeColumns.map((c) => box(c.x, c.y, 15, 15)),                    // the premium restroom: an open pavilion, only its posts stand in the way
  ...palms.map((p) => box(p.x, p.y, 18, 18)),                             // and the palms round it
  { x0: PUBLIC.x0 - 10, y0: PUBLIC.y0, x1: PUBLIC.x1 + 10, y1: PUBLIC.doorLine }, // public stalls and back wall
  { x0: PUBLIC.x0 - 20, y0: PUBLIC.y0, x1: PUBLIC.x0 + 20, y1: PUBLIC.y1 },      // public side walls
  { x0: PUBLIC.x1 - 20, y0: PUBLIC.y0, x1: PUBLIC.x1 + 20, y1: PUBLIC.y1 },
  { ...SINK_COUNTER },
  ...terrace.vendings.map((v) => box(v.x, v.y, 55, 50)),
  box(wish.x, wish.y, 140, 140), // the statue's plinth
  ...terrace.picnics.map((m) => box(m.x + Math.cos(m.rot) * 70, m.y - Math.sin(m.rot) * 70, 12, 12)), // each parasol's pole, at the mat's side
  box(pond.x, pond.y, pond.r - 30, pond.r - 30),
  ...trees.map((t) => box(t.x, t.y, 22, 22)),
  box(bean.x, bean.y, 40, 40), // the beanstalk's mound
];

// sinks: where you stand to wash, and which way you face
const sinks = [70, 140, 210].map((dy) => ({ x: SINK_COUNTER.x0 - 45, y: SINK_COUNTER.y0 + 20 + dy, face: Math.PI / 2 }));
// and at the pond's edge, crouching at the water (east, north and south of it)
for (const [dx, dy] of [[1, 0], [0, -1], [0, 1]]) {
  const x = pond.x + dx * (pond.r + 70);
  const y = pond.y + dy * (pond.r + 70);
  sinks.push({ x, y, face: Math.atan2(pond.x - x, pond.y - y), pond: true });
}

// places on the mats: two to a mat, at its two ends, facing each other
const seats = [];
terrace.picnics.forEach((m, k) => {
  for (const s of [1, -1]) {
    seats.push({ x: Math.round(m.x + Math.sin(m.rot) * 45 * s), y: Math.round(m.y + Math.cos(m.rot) * 45 * s), picnic: k });
  }
});

// the 쾌변 exercise ground: a wide lawn in its clearing, mats in three rows
exercise.r = 560;
const mats = [];
for (const row of [-1, 0, 1]) for (const col of [-1, 0, 1]) mats.push({ x: exercise.x + row * 170, y: exercise.y + col * 220, w: 90, d: 160 });

// the bushes: a big thicket out west where the forest starts (past the edge of the grounds), and smaller
// patches here and there; animals (and people with no stall) go in any of them
const bush = { ...at(-27, -2), r: 750 };
const bushes = [bush, { ...at(-6.5, 15), r: 260 }, { ...at(20, 1.5), r: 240 }, { ...at(6.5, -22.5), r: 260 }, { ...at(-8, -23.5), r: 260 }, { ...at(21, -13), r: 240 }];

const spawn = { x: gate.x, y: gate.y - 170 };

// 공간 이동: where the shortcut menu drops you, and which way the camera looks from there (yaw 0 = looking north)
const spots = [
  { name: '프리미엄 화장실', x: Math.round((PRIVATE.x0 + PRIVATE.x1) / 2), y: PRIVATE.y1 + 130, yaw: 0 },
  { name: '공중화장실', x: Math.round((PUBLIC.x0 + PUBLIC.x1) / 2) - 30, y: PUBLIC.doorLine + 240, yaw: 0 },
  { name: '콩나무 광장', x: bean.x - 130, y: bean.y + 190, yaw: -0.45 }, // a little to the side, so you don't hide the stalk
  // beside a mat, so 돗자리에 앉기 is right there
  { name: '테라스', x: Math.round((terrace.picnics[2].x + terrace.x) / 2), y: Math.round((terrace.picnics[2].y + terrace.y) / 2), yaw: 0 },
  { name: '쾌변 체조장', x: exercise.x + 300, y: exercise.y, yaw: Math.PI / 2 },
  { name: '황금똥', x: wish.x, y: wish.y + 240, yaw: 0 }, // close enough to rub it
  { name: '연못', x: pond.x, y: pond.y + pond.r + 170, yaw: 0 },
  { name: '풀숲', x: bush.x + 60, y: bush.y + 80, yaw: Math.PI / 2 }, // the clearing in the middle
  { name: '정문', x: spawn.x, y: spawn.y, yaw: 0 },
];

const inBush = (p) => bushes.some((b) => Math.hypot(p.x - b.x, p.y - b.y) <= b.r);
const inBigBush = (p) => Math.hypot(p.x - bush.x, p.y - bush.y) <= bush.r; // the one that runs past the grounds' edge
// how far out on the oval a point is: 1 on its edge
const ovalOf = (p) => Math.hypot((p.x - WALK.x) / WALK.rx, (p.y - WALK.y) / WALK.ry);

// keep a point inside the walkable ground and out of every obstacle (pushed out along the shallower side)
const PAD = 30; // about half a person
function settle(p) {
  const e = ovalOf(p);
  if (e > 1 && !inBigBush(p)) {
    // off the grounds: back to the nearer of the oval's edge or the big thicket's edge
    const ox = WALK.x + (p.x - WALK.x) / e;
    const oy = WALK.y + (p.y - WALK.y) / e;
    const bx = p.x - bush.x;
    const by = p.y - bush.y;
    const bd = Math.hypot(bx, by);
    if (bd - bush.r < Math.hypot(p.x - ox, p.y - oy)) {
      p.x = bush.x + (bx / bd) * bush.r;
      p.y = bush.y + (by / bd) * bush.r;
    } else {
      p.x = ox;
      p.y = oy;
    }
  }
  for (const o of obstacles) {
    const x0 = o.x0 - PAD;
    const x1 = o.x1 + PAD;
    const y0 = o.y0 - PAD;
    const y1 = o.y1 + PAD;
    if (p.x <= x0 || p.x >= x1 || p.y <= y0 || p.y >= y1) continue;
    const pushes = [[p.x - x0, 'x', x0], [x1 - p.x, 'x', x1], [p.y - y0, 'y', y0], [y1 - p.y, 'y', y1]];
    const [, axis, edge] = pushes.reduce((a, b) => (b[0] < a[0] ? b : a));
    p[axis] = edge;
  }
  return p;
}

const VEND_RANGE = 170;
// which vending machine you're in front of (-1: none)
const nearVending = (p) => terrace.vendings.findIndex((v) => Math.hypot(p.x - v.x, p.y - v.y) <= VEND_RANGE);
const WISH_RANGE = 300;
const nearWish = (p) => Math.hypot(p.x - wish.x, p.y - wish.y) <= WISH_RANGE;
const nearBean = (p) => Math.hypot(p.x - bean.x, p.y - bean.y) <= BEAN_RANGE;
const onLawn = (p) => Math.hypot(p.x - exercise.x, p.y - exercise.y) <= exercise.r;
const onMat = (p) => mats.findIndex((m) => Math.abs(p.x - m.x) <= m.w / 2 + 20 && Math.abs(p.y - m.y) <= m.d / 2 + 20);

const LAYOUT = {
  center: CENTER, walk: WALK, stallW: STALL_W, enterRange: ENTER_RANGE, ...RINGS, lampPosts,
  stalls, obstacles, sinks, seats, mats, bush, bushes, spawn, spots, garden, pond, trees, bean, beanRange: BEAN_RANGE, wish,
  vendRange: VEND_RANGE, wishRange: WISH_RANGE,
  private: PRIVATE, templeColumns, palms, public: PUBLIC, sinkCounter: SINK_COUNTER, terrace, exercise, gate,
};

module.exports = { LAYOUT, settle, inBush, nearBean, nearVending, nearWish, onLawn, onMat };
