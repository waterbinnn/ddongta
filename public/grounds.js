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
  const strip = (x0, z0, x1, z1, material, y = 0.009) => {
    const m = mesh(new THREE.PlaneGeometry(Math.abs(x1 - x0), Math.abs(z1 - z0)), material, { receive: true });
    m.rotation.x = -Math.PI / 2;
    return add(m, (x0 + x1) / 2, y, (z0 + z1) / 2);
  };
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
  const FLAT_R = 26;
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
  const ring = mesh(new THREE.RingGeometry(14.15, 15.85, 128), dirt, { receive: true });
  ring.rotation.x = -Math.PI / 2;
  add(ring, C, 0.006, C);
  const paving = new THREE.MeshLambertMaterial({ map: tiled(tex.pavement, 1, 1) });
  paving.map.repeat.set(14, 14);
  disc(6.2, paving, C, C, 0.012);
  for (const r of [5.4, 3.6]) {
    const line = mesh(new THREE.RingGeometry(r - 0.04, r + 0.04, 96), new THREE.MeshLambertMaterial({ color: '#d6c7a2' }));
    line.rotation.x = -Math.PI / 2;
    add(line, C, 0.014, C);
  }
  strip(C - 0.75, C + 6.0, C + 0.75, C + 14.3, dirt);                     // south, to the gate
  strip(C + 6.0, C - 0.75, C + 8.6, C + 0.75, dirt);                      // east, to the exercise ground
  strip(C - 10.6, C - 0.75, C - 6.0, C + 0.75, dirt);                     // west, to the bushes
  // a paved forecourt in front of both restrooms, joining the plaza
  const court = new THREE.MeshLambertMaterial({ map: tiled(tex.pavement, 1, 1) });
  court.map.repeat.set(22, 4);
  strip(L.private.x0 * U - 0.6, L.private.y1 * U, L.public.x1 * U + 0.6, C - 5.9, court, 0.011);

  // ---------- plaza: café terrace, coffee cart, vending machine, the golden-poop sign ----------
  const white = mat('#fffaf0');
  const metal = mat('#3b3a36');
  const shades = ['#9fd8c7', '#ffc2a8', '#ffe28a'];
  L.plaza.tables.forEach((t, k) => {
    const [x, z] = P(t);
    add(mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.04, 28), white, { cast: true, receive: true }), x, 0.74, z);
    add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.72, 8), metal), x, 0.37, z);
    add(mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.03, 16), metal), x, 0.02, z);
    add(mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.6, 8), white), x, 1.5, z);
    add(mesh(new THREE.ConeGeometry(1.2, 0.42, 12), mat(shades[k % 3]), { cast: true }), x, 2.25, z);
    add(mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.09, 12), mat('#ffffff')), x + 0.14, 0.81, z + 0.06); // a cup
  });
  for (const s of L.seats) {
    const t = L.plaza.tables[s.table];
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
  const tables = L.plaza.tables.map(P);
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
    const [x, z] = P(L.plaza.cart);
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
  // the vending machine, facing the middle of the plaza
  {
    const [x, z] = P(L.plaza.vending);
    vendingMachine(x, z, Math.atan2(C - x, C - z), '#e85d5d', 2);
  }
  // the golden-poop sign: tap it to go and make a wish
  {
    const [x, z] = P(L.plaza.sign);
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
    block(x1 - x0 + 0.4, 0.45, 0.25, mat('#a9d2ec'), (x0 + x1) / 2, 2.85, z1);          // a header across the open front
    sign('공중화장실', (x0 + x1) / 2, 2.85, z1 + 0.14, 0, [2.6, 0.42], { bg: '#ffffff', ink: '#2f6fa0', font: 70 });
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
    sign('개인 화장실', (x0 + x1) / 2, 2.9, z1 + 0.21, 0, [2.6, 0.42], { bg: '#fff6e8', ink: '#6b4a36', font: 70 });
    // little warm lamps between the doors
    const glow = new THREE.MeshBasicMaterial({ color: '#ffe3a6' });
    for (let k = 0; k <= 8; k++) {
      add(new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), glow), x0 + 0.2 + k * L.stallW * U - 0.01, 2.35, z1 + 0.08);
    }
    planter(x0 - 0.5, z1 + 0.5, 1.1, 5);
    planter(x1 + 0.5, z1 + 0.5, 1.1, 6);
  }

  // ---------- the 쾌변 exercise ground: a softer lawn, mats in two rows, a board ----------
  {
    const [x, z] = P(L.exercise);
    disc(3.4, new THREE.MeshLambertMaterial({ color: '#b6dc84' }), x, z, 0.008, 48);
    const matColors = ['#ffc2a8', '#9fd8c7', '#ffe28a', '#c9b8f0', '#a9d2ec', '#ffd6e0'];
    L.mats.forEach((m, k) => {
      block(m.w * U, 0.03, m.d * U, mat(matColors[k % matColors.length]), m.x * U, 0.02, m.y * U, { receive: true });
    });
    for (const sx of [-0.9, 0.9]) add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 8), mat('#8a5a34'), { cast: true }), x + sx, 0.8, z - 3.0);
    sign('쾌변 체조', x, 1.45, z - 2.97, 0, [2.0, 0.5], { bg: '#fffaf0', ink: '#c0563a', font: 72 });
  }

  // ---------- the bushes: a thicket out west where the forest starts, where animals (and anyone without a stall) go ----------
  {
    const [bx, bz] = P(L.bush);
    const r = L.bush.r * U;
    disc(r + 0.4, new THREE.MeshLambertMaterial({ color: '#94c461' }), bx, bz, 0.004, 48); // under the walking path
    const onPath = (x, z) => {
      const d = Math.hypot(x - C, z - C);
      return d > 13.7 && d < 16.3;
    };
    const n = 80;
    const balls = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true }), n);
    const colors = ['#5fae57', '#4b9446', '#7cc26a'];
    const m4 = new THREE.Matrix4();
    for (let k = 0; k < n; k++) {
      const a = rnd(k + 400) * Math.PI * 2;
      const d = Math.sqrt(rnd(k + 500)) * (r - 0.4);
      let s = 0.45 + rnd(k + 600) * 0.6;
      const x = bx + Math.cos(a) * d;
      const z = bz + Math.sin(a) * d;
      if (onPath(x, z)) s = 0; // keep the walking path clear
      m4.compose(new THREE.Vector3(x, s * 0.5, z), new THREE.Quaternion(), new THREE.Vector3(s, s * 0.8, s));
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
    add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.3, 8), mat('#8a5a34'), { cast: true }), bx + r + 0.3, 0.65, bz - 1.2);
    sign('풀숲 · 동물 화장실', bx + r + 0.31, 1.3, bz - 1.2, Math.PI / 2, [1.8, 0.4], { bg: '#f3f9e8', ink: '#3f7a3a', font: 56 });
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
  const lampCount = 16;
  const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.06, 1.5, 6), mat('#5b4636'), lampCount);
  const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.14, 10, 8), new THREE.MeshBasicMaterial({ color: '#fff1c2' }), lampCount);
  for (let k = 0; k < lampCount; k++) {
    const a = (k / lampCount) * Math.PI * 2 + 0.1;
    const x = C + Math.cos(a) * 16.3;
    const z = C + Math.sin(a) * 16.3;
    posts.setMatrixAt(k, new THREE.Matrix4().makeTranslation(x, 0.75, z));
    heads.setMatrixAt(k, new THREE.Matrix4().makeTranslation(x, 1.55, z));
  }
  root.add(posts, heads);

  const treeCount = 44;
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.18, 1.2, 6), mat('#8a5a3a'), treeCount);
  const leaves = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.75, 0), new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true }), treeCount * 3);
  const leafColors = ['#5fae57', '#4b9446', '#7cc26a'];
  const m4 = new THREE.Matrix4();
  const none = new THREE.Matrix4().makeScale(0, 0, 0); // a skipped tree takes no space
  for (let k = 0; k < treeCount; k++) {
    trunks.setMatrixAt(k, none);
    for (let n = 0; n < 3; n++) {
      leaves.setMatrixAt(k * 3 + n, none);
      leaves.setColorAt(k * 3 + n, new THREE.Color(leafColors[n]));
    }
    const a = rnd(k) * Math.PI * 2;
    const r = 18.6 + rnd(k + 100) * 8;
    const x = C + Math.cos(a) * r;
    const z = C + Math.sin(a) * r;
    const gx = (L.gate.x * U) - x;
    if (Math.abs(gx) < 3 && z > C + 13) continue; // keep the way in clear
    if (Math.hypot(x - L.bush.x * U, z - L.bush.y * U) < L.bush.r * U * 0.6) continue; // a clearing in the thicket
    const size = 1.2 + rnd(k + 200) * 1.4;
    const y = groundY(r);
    m4.compose(new THREE.Vector3(x, y + 0.6 * size, z), new THREE.Quaternion(), new THREE.Vector3(size, size, size));
    trunks.setMatrixAt(k, m4);
    for (let n = 0; n < 3; n++) {
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd(k + n) * 3, rnd(k * 2 + n) * 3, 0));
      const s = size * (1 - n * 0.16);
      m4.compose(new THREE.Vector3(x + (rnd(k * 3 + n) - 0.5) * 0.5 * size, y + (1.4 + n * 0.55) * size, z + (rnd(k * 5 + n) - 0.5) * 0.5 * size), q, new THREE.Vector3(s, s, s));
      leaves.setMatrixAt(k * 3 + n, m4);
      leaves.setColorAt(k * 3 + n, new THREE.Color(leafColors[(k + n) % 3]));
    }
  }
  trunks.castShadow = leaves.castShadow = true;
  root.add(trunks, leaves);

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
