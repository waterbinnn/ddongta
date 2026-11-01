// The grounds, in centimetres: shared by the server (movement, stalls, zones) and the page (sent in `welcome`).
// The beanstalk plaza is in the middle at (CENTER, CENTER); larger y is south, toward the entrance.
// Numbers follow the approved blockout in tools/blender/concept_space.py (metres there, Blender's +y is north).

const CENTER = 2000;
const STALL_W = 110;   // one stall door
const ENTER_RANGE = 75; // how close to a stall's door you must be
// the walking path is a ring round everything; past it the forest starts
const PATH_R = 2000;    // the middle of the path
const PATH_W = 170;
const WALK_R = PATH_R + PATH_W / 2 + 120; // nobody walks far past the path's outer edge
const PLAZA_R = 720; // the paved plaza in the middle, round the beanstalk
const TERRACE_R = 450; // the café terrace, off to the south-east
const WALL_H = 420; // the restroom walls: well over head height
const RINGS = { wallH: WALL_H, plazaR: PLAZA_R, terraceR: TERRACE_R, pathR: PATH_R, pathW: PATH_W, lampR: PATH_R + 130, treeR0: PATH_R + 450, treeR1: PATH_R + 1800, flatR: PATH_R + 2200 };

// from the blockout's metres (x east, y north) to these centimetres (x east, y south)
const at = (mx, my) => ({ x: Math.round(CENTER + mx * 100), y: Math.round(CENTER - my * 100) });

// ---------- stalls: two restrooms north of the plaza, doors facing south ----------
// Each entry: the left corner of its door line (cx, cy), its rotation (three.js y rotation, 0 = door faces south),
// and the spot in front of the door (x, y) where people stand to enter or knock. The stall itself is behind the door line.
const stalls = [];
function addStall(cx, cy, type, no) {
  const doorX = cx + STALL_W / 2;
  stalls.push({ cx, cy, rot: 0, fx: 0, fy: 1, x: Math.round(doorX), y: Math.round(cy + 45), type, no });
}
// the private restroom: a closed building up to the north-west, 8 rooms, each door opens into a room of its own
const PRIVATE = { x0: 820, x1: 1740, y0: 710, y1: 1130 };
for (let k = 0; k < 8; k++) addStall(PRIVATE.x0 + 20 + k * STALL_W, PRIVATE.y1, 'private', k + 1);
// the public restroom: an open-fronted pavilion up to the north-east, 10 stalls along the back wall, sinks on the east wall
const PUBLIC = { x0: 2210, x1: 3350, y0: 620, y1: 1180, doorLine: 800 };
for (let k = 0; k < 10; k++) addStall(PUBLIC.x0 + 20 + k * STALL_W, PUBLIC.doorLine, 'public', k + 1);
// a little flower garden between the two
const garden = { x: Math.round((PRIVATE.x1 + PUBLIC.x0) / 2), y: 1000 };
// the beanstalk everyone's poop feeds, in the middle of the plaza; you fertilize it standing in front of it
const bean = { x: CENTER, y: CENTER };
const BEAN_RANGE = 260;
// the golden poop, a statue on a stone plinth beside it: tap it to go and make a wish
const wish = at(2.8, -1.9);

// ---------- things you can't walk through (axis-aligned boxes) ----------
const box = (x, y, hw, hd) => ({ x0: x - hw, y0: y - hd, x1: x + hw, y1: y + hd });
// the terrace off to the south-east: tables under parasols, and two vending machines
const tc = at(6.5, -11);
const off = (dx, dy) => ({ x: Math.round(tc.x + dx * 100), y: Math.round(tc.y - dy * 100) });
const terrace = {
  x: tc.x, y: tc.y,
  vendings: [off(3.3, 1.6), off(3.5, 0.45)], // side by side on the east side, backs away from the way in
  tables: [off(-2.0, 1.3), off(1.0, 2.2), off(1.8, -1.3)],
};
const SINK_COUNTER = { x0: PUBLIC.x1 - 120, x1: PUBLIC.x1 - 20, y0: PUBLIC.doorLine + 80, y1: PUBLIC.doorLine + 320 };
const gate = { x: CENTER, y: CENTER + PATH_R };
// a round pond off to the south-west, like the ones in 동물의 숲
const pond = { ...at(-10, -9.5), r: 210 };
// trees standing on the grounds (the forest beyond the path is only scenery): the garden tree, some round the pond and the lawn
const exercise = at(13, -1);
const trees = [
  { x: pond.x - 330, y: pond.y - 160, s: 1.1 }, { x: pond.x + 380, y: pond.y - 260, s: 0.9 },
  { x: exercise.x + 420, y: exercise.y - 380, s: 1.2 }, { x: exercise.x + 480, y: exercise.y + 300, s: 1.0 },
  { x: exercise.x - 150, y: exercise.y - 560, s: 0.9 },
  { x: gate.x - 420, y: gate.y - 260, s: 1.0 }, { x: gate.x + 440, y: gate.y - 300, s: 1.1 },
];
const obstacles = [
  { ...PRIVATE },                                                         // the whole private building
  { x0: PUBLIC.x0 - 10, y0: PUBLIC.y0, x1: PUBLIC.x1 + 10, y1: PUBLIC.doorLine }, // public stalls and back wall
  { x0: PUBLIC.x0 - 20, y0: PUBLIC.y0, x1: PUBLIC.x0 + 20, y1: PUBLIC.y1 },      // public side walls
  { x0: PUBLIC.x1 - 20, y0: PUBLIC.y0, x1: PUBLIC.x1 + 20, y1: PUBLIC.y1 },
  { ...SINK_COUNTER },
  ...terrace.vendings.map((v) => box(v.x, v.y, 55, 50)),
  box(wish.x, wish.y, 60, 60), // the statue's plinth
  ...terrace.tables.map((t) => box(t.x, t.y, 20, 20)), // just the pole: chairs sit under the table top
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

// terrace chairs: two per table, facing the table
const seats = [];
terrace.tables.forEach((t, k) => {
  const a = 0.4 + k * 0.9;
  for (const s of [1, -1]) {
    seats.push({ x: Math.round(t.x + Math.sin(a) * 75 * s), y: Math.round(t.y + Math.cos(a) * 75 * s), table: k });
  }
});

// the 쾌변 exercise ground: a wide lawn east of the plaza, a clearing in the trees, mats in three rows
exercise.r = 560;
const mats = [];
for (const row of [-1, 0, 1]) for (const col of [-1, 0, 1]) mats.push({ x: exercise.x + row * 170, y: exercise.y + col * 220, w: 90, d: 160 });

// the bushes: a big thicket out west where the forest starts (past the edge of the grounds), and smaller
// patches here and there; animals (and people with no stall) go in any of them
const bush = { x: CENTER - PATH_R - 100, y: CENTER, r: 750 };
const bushes = [bush, { ...at(-16, 8), r: 280 }, { ...at(17.5, 9.5), r: 240 }, { ...at(-6.5, -15.5), r: 300 }, { ...at(13.5, -16.5), r: 260 }, { ...at(-16.5, -10.5), r: 260 }];

const spawn = { x: gate.x, y: gate.y - 170 };

// 공간 이동: where the shortcut menu drops you, and which way the camera looks from there (yaw 0 = looking north)
const spots = [
  { name: '개인 화장실', x: Math.round((PRIVATE.x0 + PRIVATE.x1) / 2), y: PRIVATE.y1 + 130, yaw: 0 },
  { name: '공중화장실', x: Math.round((PUBLIC.x0 + PUBLIC.x1) / 2) - 30, y: PUBLIC.doorLine + 240, yaw: 0 },
  { name: '콩나무 광장', x: bean.x - 130, y: bean.y + 190, yaw: -0.45 }, // a little to the side, so you don't hide the stalk
  // beside a table, so 의자에 앉기 is right there
  { name: '카페 테라스', x: Math.round((terrace.tables[2].x + terrace.x) / 2), y: Math.round((terrace.tables[2].y + terrace.y) / 2), yaw: 0 },
  { name: '쾌변 체조장', x: exercise.x - 300, y: exercise.y, yaw: -Math.PI / 2 },
  { name: '연못', x: pond.x, y: pond.y + pond.r + 170, yaw: 0 },
  { name: '풀숲', x: bush.x + 60, y: bush.y + 80, yaw: Math.PI / 2 }, // the clearing in the middle
  { name: '정문', x: spawn.x, y: spawn.y, yaw: 0 },
];

const inBush = (p) => bushes.some((b) => Math.hypot(p.x - b.x, p.y - b.y) <= b.r);
const inBigBush = (p) => Math.hypot(p.x - bush.x, p.y - bush.y) <= bush.r; // the one that runs past the grounds' edge

// keep a point inside the walkable ground and out of every obstacle (pushed out along the shallower side)
const PAD = 30; // about half a person
function settle(p) {
  const dx = p.x - CENTER;
  const dy = p.y - CENTER;
  const d = Math.hypot(dx, dy);
  if (d > WALK_R && !inBigBush(p)) {
    // off the grounds: back to the nearer of the grounds' edge or the bushes' edge
    const bx = p.x - bush.x;
    const by = p.y - bush.y;
    const bd = Math.hypot(bx, by);
    if (bd - bush.r < d - WALK_R) {
      p.x = bush.x + (bx / bd) * bush.r;
      p.y = bush.y + (by / bd) * bush.r;
    } else {
      p.x = CENTER + (dx / d) * WALK_R;
      p.y = CENTER + (dy / d) * WALK_R;
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
const WISH_RANGE = 200;
const nearWish = (p) => Math.hypot(p.x - wish.x, p.y - wish.y) <= WISH_RANGE;
const nearBean = (p) => Math.hypot(p.x - bean.x, p.y - bean.y) <= BEAN_RANGE;
const onLawn = (p) => Math.hypot(p.x - exercise.x, p.y - exercise.y) <= exercise.r;
const onMat = (p) => mats.findIndex((m) => Math.abs(p.x - m.x) <= m.w / 2 + 20 && Math.abs(p.y - m.y) <= m.d / 2 + 20);

const LAYOUT = {
  center: CENTER, walkR: WALK_R, stallW: STALL_W, enterRange: ENTER_RANGE, ...RINGS,
  stalls, obstacles, sinks, seats, mats, bush, bushes, spawn, spots, garden, pond, trees, bean, beanRange: BEAN_RANGE, wish,
  vendRange: VEND_RANGE, wishRange: WISH_RANGE,
  private: PRIVATE, public: PUBLIC, sinkCounter: SINK_COUNTER, terrace, exercise, gate,
};

module.exports = { LAYOUT, settle, inBush, nearBean, nearVending, nearWish, onLawn, onMat };
