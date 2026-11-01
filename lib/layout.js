// The grounds, in centimetres: shared by the server (movement, stalls, zones) and the page (sent in `welcome`).
// The plaza is in the middle at (CENTER, CENTER); larger y is south, toward the entrance.
// Numbers follow the approved blockout in tools/blender/concept_space.py (metres there, Blender's +y is north).

const CENTER = 2000;
const STALL_W = 110;   // one stall door
const ENTER_RANGE = 75; // how close to a stall's door you must be
const WALK_R = 1720;    // nobody walks past the path's outer edge

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
// the private restroom: a closed building, 8 rooms, each door opens into a room of its own
const PRIVATE = { x0: 1020, x1: 1940, y0: 560, y1: 980 };
for (let k = 0; k < 8; k++) addStall(PRIVATE.x0 + 20 + k * STALL_W, PRIVATE.y1, 'private', k + 1);
// the public restroom: an open-fronted pavilion, 10 stalls along the back wall, sinks on the east wall
const PUBLIC = { x0: 2050, x1: 3190, y0: 500, y1: 1060, doorLine: 680 };
for (let k = 0; k < 10; k++) addStall(PUBLIC.x0 + 20 + k * STALL_W, PUBLIC.doorLine, 'public', k + 1);

// ---------- things you can't walk through (axis-aligned boxes) ----------
const box = (x, y, hw, hd) => ({ x0: x - hw, y0: y - hd, x1: x + hw, y1: y + hd });
const plaza = {
  vending: at(3.6, 2.6),
  cart: at(-4.0, -1.0),
  sign: at(-3.4, 2.2),
  tables: [at(-2.4, -2.6), at(0.4, -3.6), at(2.9, -1.9)],
};
const SINK_COUNTER = { x0: 3070, x1: 3170, y0: 760, y1: 1000 };
const gate = at(0, -14.2);
const obstacles = [
  { ...PRIVATE },                                                         // the whole private building
  { x0: PUBLIC.x0 - 10, y0: PUBLIC.y0, x1: PUBLIC.x1 + 10, y1: PUBLIC.doorLine }, // public stalls and back wall
  { x0: PUBLIC.x0 - 20, y0: PUBLIC.y0, x1: PUBLIC.x0 + 20, y1: PUBLIC.y1 },      // public side walls
  { x0: PUBLIC.x1 - 20, y0: PUBLIC.y0, x1: PUBLIC.x1 + 20, y1: PUBLIC.y1 },
  { ...SINK_COUNTER },
  box(plaza.vending.x, plaza.vending.y, 55, 45),
  box(plaza.cart.x, plaza.cart.y, 75, 50),
  box(plaza.sign.x, plaza.sign.y, 20, 20),
  ...plaza.tables.map((t) => box(t.x, t.y, 20, 20)), // just the pole: chairs sit under the table top
  box(gate.x - 120, gate.y, 18, 18),
  box(gate.x + 120, gate.y, 18, 18),
];

// sinks: where you stand to wash, and which way you face
const sinks = [810, 880, 950].map((y) => ({ x: SINK_COUNTER.x0 - 45, y, face: Math.PI / 2 }));

// terrace chairs: two per table, facing the table
const seats = [];
plaza.tables.forEach((t, k) => {
  const a = 0.4 + k * 0.9;
  for (const s of [1, -1]) {
    seats.push({ x: Math.round(t.x + Math.sin(a) * 75 * s), y: Math.round(t.y + Math.cos(a) * 75 * s), table: k });
  }
});

// the 쾌변 exercise ground east of the plaza: mats in two rows
const exercise = at(10.5, 0);
const mats = [];
for (const row of [-1, 1]) for (const col of [-1, 0, 1]) mats.push({ x: exercise.x + row * 120, y: exercise.y + col * 190, w: 90, d: 160 });

// the bushes west of the plaza: animals (and people with no stall) go here
const bush = { ...at(-10.5, 0), r: 420 };

const spawn = { x: gate.x, y: gate.y - 170 };

// keep a point inside the walkable ground and out of every obstacle (pushed out along the shallower side)
const PAD = 30; // about half a person
function settle(p) {
  const dx = p.x - CENTER;
  const dy = p.y - CENTER;
  const d = Math.hypot(dx, dy);
  if (d > WALK_R) {
    p.x = CENTER + (dx / d) * WALK_R;
    p.y = CENTER + (dy / d) * WALK_R;
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

const inBush = (p) => Math.hypot(p.x - bush.x, p.y - bush.y) <= bush.r;
const onMat = (p) => mats.findIndex((m) => Math.abs(p.x - m.x) <= m.w / 2 + 20 && Math.abs(p.y - m.y) <= m.d / 2 + 20);

const LAYOUT = {
  center: CENTER, walkR: WALK_R, stallW: STALL_W, enterRange: ENTER_RANGE,
  stalls, obstacles, sinks, seats, mats, bush, spawn,
  private: PRIVATE, public: PUBLIC, sinkCounter: SINK_COUNTER, plaza, exercise, gate,
};

module.exports = { LAYOUT, settle, inBush, onMat };
