// The v2 grounds: the plaza with its café terrace, the two restrooms, the 쾌변 exercise ground, the bushes,
// the walking path round it all, trees, lamps and the gate. Everything comes from the server's layout
// (lib/layout.js, centimetres; x east, y south) so the page and the server agree on where things are.
// The stalls themselves are built by app.js (makeStall); this file builds everything around them.
import * as THREE from '/vendor/three.module.js';
import { GLTFLoader } from '/vendor/jsm/loaders/GLTFLoader.js';

const U = 0.01; // centimetres to metres
const rnd = (k) => {
  const v = Math.sin(k * 91.3 + 7.1) * 43758.5453;
  return v - Math.floor(v);
};

// a flat sign: text painted on a canvas, readable from across the plaza
function signTexture(text, { bg = '#fffaf0', ink = '#4a3520', w = 512, h = 128, font = 64 } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.beginPath();
  g.roundRect(4, 4, w - 8, h - 8, h * 0.22);
  g.fill();
  g.fillStyle = ink;
  g.font = `bold ${font}px -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function buildGrounds(kit) {
  const { L, root, lamps, lampLights, mesh, mat, pixelTex, tex, vendingMachine, planter, M, wishHits, lampColor, lampPower } = kit;
  const C = L.center * U; // the plaza's middle, in metres (x and z)
  const P = (p) => [p.x * U, p.y * U]; // a layout point to world x, z

  const add = (o, x, y, z) => {
    o.position.set(x, y, z);
    root.add(o);
    return o;
  };
  const block = (w, h, d, material, x, y, z, opts = { cast: true, receive: true }) => add(mesh(new THREE.BoxGeometry(w, h, d), material, opts), x, y, z);
  const disc = (r, material, x, z, y = 0.01, segs = 64) => {
    const m = mesh(new THREE.CircleGeometry(r, segs), material, { receive: true });
    m.rotation.x = -Math.PI / 2;
    return add(m, x, y, z);
  };
  // a straight path from one point to another, any direction
  const lane = (ax, az, bx, bz, w, material, y = 0.008) => {
    const len = Math.hypot(bx - ax, bz - az);
    const m = mesh(new THREE.PlaneGeometry(w, len), material, { receive: true });
    m.rotation.set(-Math.PI / 2, 0, Math.atan2(bx - ax, bz - az)); // its length lies along a to b
    return add(m, (ax + bx) / 2, y, (az + bz) / 2);
  };
  const strip = (x0, z0, x1, z1, material, y = 0.009) => {
    const m = mesh(new THREE.PlaneGeometry(Math.abs(x1 - x0), Math.abs(z1 - z0)), material, { receive: true });
    m.rotation.x = -Math.PI / 2;
    return add(m, (x0 + x1) / 2, y, (z0 + z1) / 2);
  };
  // flowers and picket fences are gathered as they're placed, then drawn in a few instanced meshes at the end
  const flowers = [];
  const pickets = [];
  const rails = [];
  function flowerPatch(x, z, r, n, seed) {
    for (let k = 0; k < n; k++) {
      const a = rnd(seed * 31 + k) * Math.PI * 2;
      const d = Math.sqrt(rnd(seed * 17 + k + 3)) * r;
      flowers.push({ x: x + Math.cos(a) * d, z: z + Math.sin(a) * d, c: (seed + Math.floor(k / 5)) % 6, s: 0.8 + rnd(seed + k * 7) * 0.5 });
    }
  }
  function picketArc(cx, cz, r, a0, a1) {
    const n = Math.max(2, Math.round(((a1 - a0) * r) / 0.32));
    let prev = null;
    for (let k = 0; k <= n; k++) {
      const a = a0 + ((a1 - a0) * k) / n;
      const p = { x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r, a };
      pickets.push(p);
      if (prev) rails.push({ x: (p.x + prev.x) / 2, z: (p.z + prev.z) / 2, len: Math.hypot(p.x - prev.x, p.z - prev.z), rot: Math.atan2(p.x - prev.x, p.z - prev.z) });
      prev = p;
    }
  }
  const sign = (text, x, y, z, rotY = 0, size = [2.2, 0.55], style = {}) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(...size), new THREE.MeshBasicMaterial({ map: signTexture(text, style), transparent: true }));
    m.rotation.y = rotY;
    return add(m, x, y, z);
  };
  const tiled = (t, rx, ry) => {
    const map = pixelTex(t, true);
    map.repeat.set(rx, ry);
    return map;
  };

  // ---------- ground: grass that stays flat round the grounds and curves away like a small planet ----------
  const FLAT_R = L.flatR * U;
  const CURVE_R = 70;
  const groundY = (r) => (r <= FLAT_R ? -0.02 : -0.02 - ((r - FLAT_R) ** 2) / (2 * CURVE_R));
  const rings = 60;
  const segs = 96;
  const verts = [];
  const uvs = [];
  const idx = [];
  for (let i = 0; i <= rings; i++) {
    const r = (220 * i * i) / (rings * rings);
    for (let j = 0; j <= segs; j++) {
      const a = (j / segs) * Math.PI * 2;
      verts.push(Math.cos(a) * r, groundY(r), Math.sin(a) * r);
      uvs.push((Math.cos(a) * r) / 1.6, (Math.sin(a) * r) / 1.6);
    }
  }
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < segs; j++) {
      const p0 = i * (segs + 1) + j;
      const p1 = p0 + segs + 1;
      idx.push(p0, p0 + 1, p1, p0 + 1, p1 + 1, p1); // wound so the grass faces up
    }
  }
  const gg = new THREE.BufferGeometry();
  gg.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  gg.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  gg.setIndex(idx);
  gg.computeVertexNormals();
  const ground = add(mesh(gg, new THREE.MeshLambertMaterial({ map: pixelTex(tex.grass, true) }), { receive: true }), C, 0, C);

  // ---------- the walking path: a loop round everything, and spokes in from the plaza ----------
  const dirt = new THREE.MeshLambertMaterial({ color: '#dcc596' });
  const PR = L.pathR * U;
  const PW = L.pathW * U;
  const ring = mesh(new THREE.RingGeometry(PR - PW / 2, PR + PW / 2, 160), dirt, { receive: true });
  ring.rotation.x = -Math.PI / 2;
  add(ring, C, 0.006, C);
  const paving = new THREE.MeshLambertMaterial({ map: tiled(tex.pavement, 1, 1) });
  paving.map.repeat.set(L.plazaR * U * 2.2, L.plazaR * U * 2.2);
  const PZ = L.plazaR * U;
  disc(PZ, paving, C, C, 0.012);
  for (const r of [PZ - 0.8, PZ * 0.6]) {
    const line = mesh(new THREE.RingGeometry(r - 0.04, r + 0.04, 96), new THREE.MeshLambertMaterial({ color: '#d6c7a2' }));
    line.rotation.x = -Math.PI / 2;
    add(line, C, 0.014, C);
  }
  const ex = P(L.exercise);
  const bushIn = (L.center - L.bush.x - L.bush.r) * U; // how far west the bushes start
  strip(C - 0.75, C + PZ - 0.2, C + 0.75, C + PR - PW / 2, dirt);              // south, to the gate
  strip(C + PZ - 0.2, ex[1] - 0.75, ex[0] - L.exercise.r * U + 0.3, ex[1] + 0.75, dirt); // east, to the exercise lawn
  strip(C - bushIn - 0.1, C - 0.75, C - PZ + 0.2, C + 0.75, dirt);              // west, to the bushes
  // to the café terrace and to the pond, on the diagonals
  for (const p of [L.terrace, L.pond]) {
    const [tx, tz] = P(p);
    const a = Math.atan2(tx - C, tz - C);
    const r = p === L.terrace ? L.terraceR * U : L.pond.r * U + 0.4;
    lane(C + Math.sin(a) * (PZ - 0.2), C + Math.cos(a) * (PZ - 0.2), tx - Math.sin(a) * (r - 0.2), tz - Math.cos(a) * (r - 0.2), 1.4, dirt);
  }
  // a paved forecourt in front of both restrooms, joining the plaza
  const court = new THREE.MeshLambertMaterial({ map: tiled(tex.pavement, 1, 1) });
  court.map.repeat.set(22, 4);
  strip(L.private.x0 * U - 0.6, L.private.y1 * U, L.public.x1 * U + 0.6, C - PZ + 0.3, court, 0.011);

  // ---------- the café terrace: its own paved circle, tables, a coffee cart, a vending machine ----------
  {
    const [tx, tz] = P(L.terrace);
    const deck = new THREE.MeshLambertMaterial({ map: tiled(tex.pavement, 1, 1), color: '#fff3e2' });
    deck.map.repeat.set(L.terraceR * U * 2.2, L.terraceR * U * 2.2);
    disc(L.terraceR * U, deck, tx, tz, 0.012);
  }
  const white = mat('#fffaf0');
  const metal = mat('#3b3a36');
  const shades = ['#9fd8c7', '#ffc2a8', '#ffe28a'];
  L.terrace.tables.forEach((t, k) => {
    const [x, z] = P(t);
    add(mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.04, 28), white, { cast: true, receive: true }), x, 0.74, z);
    add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.72, 8), metal), x, 0.37, z);
    add(mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.03, 16), metal), x, 0.02, z);
    add(mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.6, 8), white), x, 1.5, z);
    add(mesh(new THREE.ConeGeometry(1.2, 0.42, 12), mat(shades[k % 3]), { cast: true }), x, 2.25, z);
    add(mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.09, 12), mat('#ffffff')), x + 0.14, 0.81, z + 0.06); // a cup
  });
  for (const s of L.seats) {
    const t = L.terrace.tables[s.table];
    const face = Math.atan2(t.x - s.x, t.y - s.y); // the sitter faces the table
    const chair = new THREE.Group();
    const seat = mesh(new THREE.BoxGeometry(0.42, 0.05, 0.42), white, { cast: true });
    seat.position.y = 0.43;
    const back = mesh(new THREE.BoxGeometry(0.42, 0.42, 0.05), white, { cast: true });
    back.position.set(0, 0.66, -0.2);
    chair.add(seat, back);
    for (const [ox, oz] of [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]]) {
      const leg = mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.42, 6), metal);
      leg.position.set(ox, 0.21, oz);
      chair.add(leg);
    }
    chair.rotation.y = face;
    add(chair, ...[s.x * U, 0, s.y * U]);
  }
  // string lights over the terrace
  const bulbMat = new THREE.MeshBasicMaterial({ color: '#fff1c2' });
  const tables = L.terrace.tables.map(P);
  const lx0 = Math.min(...tables.map((t) => t[0])) - 1.6;
  const lx1 = Math.max(...tables.map((t) => t[0])) + 1.6;
  const lz = Math.max(...tables.map((t) => t[1])) + 1.2;
  for (const x of [lx0, lx1]) add(mesh(new THREE.CylinderGeometry(0.04, 0.05, 2.7, 8), mat('#5b4636'), { cast: true }), x, 1.35, lz);
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.06, 8, 6), bulbMat, 18);
  for (let k = 0; k < 18; k++) {
    const t = k / 17;
    bulbs.setMatrixAt(k, new THREE.Matrix4().makeTranslation(lx0 + (lx1 - lx0) * t, 2.6 - 0.6 * Math.sin(Math.PI * t), lz));
  }
  root.add(bulbs);
  // the coffee cart
  {
    const [x, z] = P(L.terrace.cart);
    block(1.3, 1.0, 0.8, mat('#7cc6b2'), x, 0.6, z);
    block(1.5, 0.06, 1.0, white, x, 1.75, z);
    for (const sx of [-0.6, 0.6]) add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.65, 6), white), x + sx, 1.42, z + 0.4);
    for (const sx of [-0.45, 0.45]) {
      const w = mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.06, 16), metal);
      w.rotation.x = Math.PI / 2;
      add(w, x + sx, 0.16, z + 0.42);
    }
    sign('COFFEE', x, 1.2, z + 0.41, 0, [0.9, 0.24], { bg: '#ffffff', ink: '#3f8f7c', font: 72 });
  }
  // the vending machine, facing the middle of the terrace
  {
    const [x, z] = P(L.terrace.vending);
    const [tx, tz] = P(L.terrace);
    vendingMachine(x, z, Math.atan2(tx - x, tz - z), '#e85d5d', 2);
  }
  // the golden-poop sign: tap it to go and make a wish
  {
    const [x, z] = P(L.wish);
    add(mesh(new THREE.CylinderGeometry(0.06, 0.07, 1.25, 10), mat('#8a5a34'), { cast: true }), x, 0.62, z);
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.8, 0.7), M.hit);
    hit.position.set(x, 1.55, z);
    hit.userData.wish = true;
    root.add(hit);
    wishHits.push(hit);
    new GLTFLoader().load('/models/golden-poop.glb', (gltf) => {
      const poop = gltf.scene;
      poop.traverse((o) => {
        if (o.isMesh) o.material = new THREE.MeshStandardMaterial({ color: '#f0bf55', metalness: 0.75, roughness: 0.3, emissive: '#5a3d08', emissiveIntensity: 0.4 });
      });
      poop.scale.setScalar(0.28);
      poop.position.set(x, 1.27, z);
      root.add(poop);
      kit.onSignPoop?.(poop);
    });
  }

  // ---------- the public restroom: an open-fronted pavilion, ten stalls along the back, sinks on the east wall ----------
  {
    const p = L.public;
    const x0 = p.x0 * U;
    const x1 = p.x1 * U;
    const z0 = p.y0 * U;
    const z1 = p.y1 * U;
    const floor = new THREE.MeshPhongMaterial({ map: tiled(tex.floor, (x1 - x0) / 1.2, (z1 - z0) / 1.2), shininess: 28, specular: '#3a3428' });
    strip(x0, z0, x1, z1, floor, 0.015);
    const tile = (w, h) => new THREE.MeshLambertMaterial({ map: tiled(tex.tile, w / 1.2, h / 1.2) });
    block(x1 - x0 + 0.4, 3.0, 0.2, tile(x1 - x0, 3), (x0 + x1) / 2, 1.5, z0 - 0.1);    // back wall
    for (const x of [x0, x1]) block(0.2, 3.0, z1 - z0, tile(z1 - z0, 3), x, 1.5, (z0 + z1) / 2); // side walls
    // the sink counter along the east wall, with a long mirror above it
    const sc = L.sinkCounter;
    const cx = ((sc.x0 + sc.x1) / 2) * U;
    const cz = ((sc.y0 + sc.y1) / 2) * U;
    const cw = (sc.x1 - sc.x0) * U;
    const cd = (sc.y1 - sc.y0) * U;
    block(cw, 0.82, cd, tile(cd, 0.82), cx, 0.41, cz);
    block(cw + 0.08, 0.06, cd + 0.08, mat('#fbfbf8'), cx, 0.85, cz);
    const chrome = new THREE.MeshPhongMaterial({ color: '#d4dbe2', shininess: 110, specular: '#ffffff' });
    for (const s of L.sinks) {
      const z = s.y * U;
      add(mesh(new THREE.CylinderGeometry(0.2, 0.18, 0.03, 20), mat('#ffffff')), cx - 0.05, 0.88, z);
      add(mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.28, 8), chrome), cx + 0.25, 1.02, z);
      add(mesh(new THREE.BoxGeometry(0.26, 0.035, 0.035), chrome), cx + 0.13, 1.15, z);
    }
    const mirror = new THREE.Mesh(new THREE.PlaneGeometry(cd - 0.1, 0.8), new THREE.MeshPhongMaterial({ color: '#d9ecf2', emissive: '#3d5560', shininess: 140 }));
    mirror.rotation.y = -Math.PI / 2;
    add(mirror, x1 - 0.12, 1.55, cz);
    planter(x0 + 0.8, z1 - 0.6, 1.1, 3, 'snake');
  }

  // ---------- the private restroom: a closed, warmer building; each door opens into a room of its own ----------
  {
    const p = L.private;
    const x0 = p.x0 * U;
    const x1 = p.x1 * U;
    const z0 = p.y0 * U;
    const z1 = p.y1 * U;
    const wall = new THREE.MeshLambertMaterial({ map: tiled(tex.brick, (x1 - x0) / 0.8, 3.2 / 0.4), color: '#ffe9d6' });
    block(x1 - x0, 3.2, z1 - z0, wall, (x0 + x1) / 2, 1.6, (z0 + z1) / 2);
    block(x1 - x0 + 0.6, 0.2, z1 - z0 + 0.6, mat('#b8775a'), (x0 + x1) / 2, 3.3, (z0 + z1) / 2); // roof
    block(x1 - x0 + 0.3, 0.32, 0.2, mat('#6b4a36'), (x0 + x1) / 2, 2.9, z1 + 0.1);                  // a wooden fascia
    // little warm lamps between the doors
    const glow = new THREE.MeshBasicMaterial({ color: '#ffe3a6' });
    for (let k = 0; k <= 8; k++) {
      add(new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), glow), x0 + 0.2 + k * L.stallW * U - 0.01, 2.35, z1 + 0.08);
    }
    planter(x0 - 0.5, z1 + 0.5, 1.1, 5);
    planter(x1 + 0.5, z1 + 0.5, 1.1, 6);
  }

  // ---------- the 쾌변 exercise ground: a wide lawn in a clearing, mats in rows, a white picket fence ----------
  {
    const [x, z] = P(L.exercise);
    const r = L.exercise.r * U;
    disc(r, new THREE.MeshLambertMaterial({ color: '#b9e08a' }), x, z, 0.008, 64);
    const matColors = ['#ffc2a8', '#9fd8c7', '#ffe28a', '#c9b8f0', '#a9d2ec', '#ffd6e0'];
    L.mats.forEach((m, k) => {
      block(m.w * U, 0.03, m.d * U, mat(matColors[k % matColors.length]), m.x * U, 0.02, m.y * U, { receive: true });
    });
    // the fence goes round the lawn, open on the plaza side (west) where the path comes in
    picketArc(x, z, r + 0.15, -Math.PI * 0.8, Math.PI * 0.8);
    flowerPatch(x - r * 0.15, z - r - 0.6, 1.6, 26, 11);
    flowerPatch(x - r * 0.2, z + r + 0.6, 1.6, 26, 12);
  }

  // ---------- the bushes: a thicket out west where the forest starts, where animals (and anyone without a stall) go ----------
  {
    const [bx, bz] = P(L.bush);
    const r = L.bush.r * U;
    disc(r + 0.4, new THREE.MeshLambertMaterial({ color: '#94c461' }), bx, bz, 0.004, 48); // under the walking path
    const onPath = (x, z) => {
      const d = Math.hypot(x - C, z - C);
      return d > PR - PW / 2 - 0.4 && d < PR + PW / 2 + 0.4;
    };
    const n = 80;
    const balls = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshLambertMaterial({ color: '#ffffff' }), n); // soft round shrubs
    const colors = ['#5fae57', '#4b9446', '#7cc26a'];
    const m4 = new THREE.Matrix4();
    for (let k = 0; k < n; k++) {
      const a = rnd(k + 400) * Math.PI * 2;
      const d = 2.6 + Math.sqrt(rnd(k + 500)) * (r - 3.0); // a clearing in the middle, where people squat
      let s = 0.45 + rnd(k + 600) * 0.6;
      const x = bx + Math.cos(a) * d;
      const z = bz + Math.sin(a) * d;
      if (onPath(x, z)) s = 0; // keep the walking path clear
      m4.compose(new THREE.Vector3(x, s * 0.2, z), new THREE.Quaternion(), new THREE.Vector3(s * 0.65, s * 0.45, s * 0.65)); // about waist high: you hide in it, but still show
      balls.setMatrixAt(k, m4);
      balls.setColorAt(k, new THREE.Color(colors[k % 3]));
    }
    balls.castShadow = true;
    root.add(balls);
    const blades = new THREE.InstancedMesh(new THREE.ConeGeometry(0.06, 0.5, 5), new THREE.MeshLambertMaterial({ color: '#6dbb4f' }), 160);
    for (let k = 0; k < 160; k++) {
      const a = rnd(k + 700) * Math.PI * 2;
      const d = Math.sqrt(rnd(k + 800)) * r;
      blades.setMatrixAt(k, new THREE.Matrix4().makeTranslation(bx + Math.cos(a) * d, 0.25, bz + Math.sin(a) * d));
    }
    root.add(blades);
  }

  // ---------- the gate ----------
  {
    const [x, z] = P(L.gate);
    const wood = mat('#8a5a34');
    for (const sx of [-1.2, 1.2]) add(mesh(new THREE.CylinderGeometry(0.14, 0.16, 2.7, 10), wood, { cast: true }), x + sx, 1.35, z);
    block(3.0, 0.32, 0.3, wood, x, 2.7, z);
    sign('똥타', x, 2.7, z - 0.16, Math.PI, [1.2, 0.32], { bg: '#ffe28a', ink: '#5b3a0c', font: 80 });
    sign('똥타', x, 2.7, z + 0.16, 0, [1.2, 0.32], { bg: '#ffe28a', ink: '#5b3a0c', font: 80 });
  }

  // ---------- lamps along the path, trees round the outside ----------
  const lampCount = 24;
  const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.06, 1.5, 6), mat('#5b4636'), lampCount);
  const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.14, 10, 8), new THREE.MeshBasicMaterial({ color: '#fff1c2' }), lampCount);
  for (let k = 0; k < lampCount; k++) {
    const a = (k / lampCount) * Math.PI * 2 + 0.1;
    const x = C + Math.cos(a) * L.lampR * U;
    const z = C + Math.sin(a) * L.lampR * U;
    posts.setMatrixAt(k, new THREE.Matrix4().makeTranslation(x, 0.75, z));
    heads.setMatrixAt(k, new THREE.Matrix4().makeTranslation(x, 1.55, z));
  }
  root.add(posts, heads);

  // ---------- trees, 동물의 숲 style: round, soft broadleaf trees and some cedars ----------
  // the forest beyond the path is scenery; the few trees on the grounds (L.trees) are obstacles on the server too
  const treeSpots = [];
  for (let k = 0; k < 140; k++) {
    const a = rnd(k) * Math.PI * 2;
    const r = (L.treeR0 + rnd(k + 100) * (L.treeR1 - L.treeR0)) * U;
    const x = C + Math.cos(a) * r;
    const z = C + Math.sin(a) * r;
    if (Math.abs(L.gate.x * U - x) < 3 && z > C) continue; // keep the way in clear
    if (Math.hypot(x - L.bush.x * U, z - L.bush.y * U) < L.bush.r * U * 0.6) continue; // a clearing in the thicket
    treeSpots.push({ x, z, y: groundY(r), s: 1.0 + rnd(k + 200) * 0.8, cedar: rnd(k + 300) < 0.3, k });
  }
  L.trees.forEach((t, n) => treeSpots.push({ x: t.x * U, z: t.y * U, y: 0, s: t.s, cedar: false, k: 600 + n }));
  const round = treeSpots.filter((t) => !t.cedar);
  const cedars = treeSpots.filter((t) => t.cedar);
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.14, 0.2, 1, 8), mat('#9a6a44'), treeSpots.length);
  const crowns = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshLambertMaterial({ color: '#ffffff' }), round.length * 3);
  const tiers = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 12), new THREE.MeshLambertMaterial({ color: '#ffffff' }), cedars.length * 3);
  const crownColors = ['#5dbb63', '#4fae5a', '#6cc46c', '#58b55f'];
  const cedarColors = ['#3f9a62', '#368d58'];
  const m4 = new THREE.Matrix4();
  const q0 = new THREE.Quaternion();
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  treeSpots.forEach((t, i) => {
    const trunkH = (t.cedar ? 0.8 : 1.1) * t.s;
    trunks.setMatrixAt(i, m4.compose(v(t.x, t.y + trunkH / 2, t.z), q0, v(t.s, trunkH, t.s)));
  });
  round.forEach((t, i) => {
    const s = t.s;
    const c = new THREE.Color(crownColors[t.k % crownColors.length]);
    const side = rnd(t.k + 900) * Math.PI * 2;
    const blobs = [
      [0, 1.75, 0, 0.95, 0.85],                                                     // the big round crown
      [Math.cos(side) * 0.6, 1.5, Math.sin(side) * 0.6, 0.6, 0.85],                // two soft bumps on its sides
      [Math.cos(side + 2.4) * 0.55, 1.95, Math.sin(side + 2.4) * 0.55, 0.55, 0.85],
    ];
    blobs.forEach(([ox, oy, oz, r, sy], n) => {
      crowns.setMatrixAt(i * 3 + n, m4.compose(v(t.x + ox * s, t.y + oy * s, t.z + oz * s), q0, v(r * s, r * s * sy, r * s)));
      crowns.setColorAt(i * 3 + n, n ? c.clone().offsetHSL(0, 0, 0.03) : c);
    });
  });
  cedars.forEach((t, i) => {
    const s = t.s;
    [[1.15, 0.95, 0.9], [1.7, 0.75, 0.8], [2.2, 0.5, 0.7]].forEach(([y, r, h], n) => {
      tiers.setMatrixAt(i * 3 + n, m4.compose(v(t.x, t.y + y * s, t.z), q0, v(r * s, h * s, r * s)));
      tiers.setColorAt(i * 3 + n, new THREE.Color(cedarColors[(t.k + n) % 2]));
    });
  });
  trunks.castShadow = crowns.castShadow = tiers.castShadow = true;
  root.add(trunks, crowns, tiers);

  // flowers round the beanstalk's mound
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + 0.3;
    flowerPatch(L.bean.x * U + Math.cos(a) * 1.25, L.bean.y * U + Math.sin(a) * 1.25, 0.3, 6, 50 + k);
  }

  // ---------- the garden between the two restrooms ----------
  flowerPatch(L.garden.x * U, L.garden.y * U, 2.0, 46, 20);
  for (const [px, pz] of [[L.private.x0, L.private.y1], [L.private.x1, L.private.y1], [L.public.x0, L.public.y1], [L.public.x1, L.public.y1]]) {
    flowerPatch(px * U + (px === L.private.x0 || px === L.public.x0 ? -0.6 : 0.6), pz * U + 0.4, 0.5, 10, px % 7);
  }

  // ---------- the pond: clear water, a sandy rim, pebbles and lily pads ----------
  {
    const [x, z] = P(L.pond);
    const r = L.pond.r * U;
    disc(r + 0.35, mat('#ead9aa'), x, z, 0.009, 48);
    disc(r, new THREE.MeshPhongMaterial({ color: '#79c6e6', shininess: 90, specular: '#ffffff', emissive: '#1d4a60', emissiveIntensity: 0.25 }), x, z, 0.02, 48);
    const pebbles = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), mat('#c9c2b2'), 14);
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2 + rnd(k + 70) * 0.3;
      const sz = 0.14 + rnd(k + 80) * 0.14;
      pebbles.setMatrixAt(k, m4.compose(v(x + Math.cos(a) * (r + 0.2), sz * 0.3, z + Math.sin(a) * (r + 0.2)), q0, v(sz * 1.3, sz * 0.7, sz)));
    }
    pebbles.castShadow = true;
    root.add(pebbles);
    const pad = mat('#6dbb5a');
    for (let k = 0; k < 4; k++) {
      const a = rnd(k + 40) * Math.PI * 2;
      const d = r * (0.3 + rnd(k + 50) * 0.45);
      const lily = mesh(new THREE.CircleGeometry(0.22, 16, 0.3, Math.PI * 1.8), pad);
      lily.rotation.set(-Math.PI / 2, 0, a);
      add(lily, x + Math.cos(a) * d, 0.03, z + Math.sin(a) * d);
    }
    flowerPatch(x - r - 0.8, z + 0.6, 0.7, 14, 33);
    flowerPatch(x + r + 0.7, z - 0.9, 0.6, 12, 34);
  }

  // flowers either side of the way in
  flowerPatch(L.gate.x * U - 2.2, L.gate.y * U - 1.4, 0.9, 18, 40);
  flowerPatch(L.gate.x * U + 2.2, L.gate.y * U - 1.4, 0.9, 18, 41);

  // ---------- build the flowers and fences gathered above ----------
  {
    const petals = ['#ffffff', '#ff9ec4', '#ffe066', '#ff7a7a', '#c59cf0', '#ffb36b'];
    const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.075, 10, 6), new THREE.MeshLambertMaterial({ color: '#ffffff' }), flowers.length);
    const leafs = new THREE.InstancedMesh(new THREE.ConeGeometry(0.06, 0.2, 5), mat('#4f9e45'), flowers.length);
    flowers.forEach((f, k) => {
      heads.setMatrixAt(k, m4.compose(v(f.x, 0.2 * f.s, f.z), q0, v(f.s, f.s * 0.6, f.s)));
      heads.setColorAt(k, new THREE.Color(petals[f.c]));
      leafs.setMatrixAt(k, m4.compose(v(f.x, 0.1 * f.s, f.z), q0, v(f.s, f.s, f.s)));
    });
    root.add(heads, leafs);
    const white = mat('#fbf8f0');
    const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.07, 0.62, 0.05), white, pickets.length);
    pickets.forEach((p, k) => posts.setMatrixAt(k, m4.compose(v(p.x, 0.31, p.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -p.a, 0)), v(1, 1, 1))));
    const bars = new THREE.InstancedMesh(new THREE.BoxGeometry(0.04, 0.05, 1), white, rails.length * 2);
    rails.forEach((r, k) => {
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, r.rot, 0));
      bars.setMatrixAt(k * 2, m4.compose(v(r.x, 0.22, r.z), q, v(1, 1, r.len)));
      bars.setMatrixAt(k * 2 + 1, m4.compose(v(r.x, 0.46, r.z), q, v(1, 1, r.len)));
    });
    posts.castShadow = bars.castShadow = true;
    root.add(posts, bars);
  }

  // low hills on the far rim, softened by the haze
  const hillMat = new THREE.MeshLambertMaterial({ color: '#8fbf78', flatShading: true });
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2 + rnd(k + 300) * 0.3;
    const r = 120 + rnd(k + 400) * 30;
    const hill = mesh(new THREE.SphereGeometry(18 + rnd(k + 500) * 14, 10, 6), hillMat);
    hill.scale.y = 0.45;
    add(hill, C + Math.cos(a) * r, groundY(r) - 2, C + Math.sin(a) * r);
  }

  // ---------- night lights: a few warm lights where people gather ----------
  lampLights.length = 0;
  const light = (x, z, share, y = 3.2) => {
    const l = new THREE.PointLight(lampColor, lampPower * share, 16, 1.6);
    l.position.set(x, y, z);
    lamps.add(l);
    lampLights.push([l, share]);
  };
  light(C, C, 1.4);
  light(((L.public.x0 + L.public.x1) / 2) * U, ((L.public.y0 + L.public.y1) / 2) * U, 1.1);
  light(((L.private.x0 + L.private.x1) / 2) * U, L.private.y1 * U + 1.5, 0.9);
  light(...P(L.exercise), 0.8);

  return { ground };
}
