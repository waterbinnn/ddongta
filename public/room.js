// The private toilet room behind a door of the private restroom (개인 화장실). There is only one: whoever goes in
// sees their own room, and nobody else's. It follows the blockout in tools/blender/concept_stall.py
// (Blender x, y, z become x, z-up, -y here): cream brick-tile walls, a soft pink floor, a window with the sky,
// the toilet against the back wall, a side table with a magazine, a sink with a mirror, a chest with a diffuser,
// a framed picture and a pendant lamp. The room is closed all round so the camera sits inside it.
import * as THREE from '/vendor/three.module.js';

export const ROOM = { W: 2.3, D: 2.6, FRONT: 1.6, H: 2.6 }; // width, depth to the back wall, room in front of the origin, height
const TOILET = { x: -0.35, z: -2.15 };

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(...repeat);
  }
  return t;
}

// brick tiles 30 x 15 cm in rows, half a tile offset each row; the canvas holds 4 x 4 of them (1.2 x 0.6 m)
function brickTex(repeatX, repeatY) {
  return canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = '#e4c6a8';
    g.fillRect(0, 0, w, h);
    const tw = w / 4;
    const th = h / 4;
    for (let row = 0; row < 4; row++) {
      const shift = (row % 2) * (tw / 2);
      for (let col = -1; col < 5; col++) {
        const x = col * tw + shift;
        const shade = 0.96 + (((row * 7 + col * 13) % 5) / 5) * 0.06;
        g.fillStyle = `rgb(${Math.round(243 * shade)}, ${Math.round(220 * shade)}, ${Math.round(196 * shade)})`;
        g.beginPath();
        g.roundRect(x + 3, row * th + 3, tw - 6, th - 6, 5);
        g.fill();
        g.fillStyle = 'rgba(255,255,255,0.22)'; // a soft glaze along the top
        g.fillRect(x + 8, row * th + 6, tw - 16, 5);
      }
    }
  }, [repeatX, repeatY]);
}

// a soft pink tiled floor, 21 cm tiles
function floorTex(repeatX, repeatY) {
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#f6dbe2';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#ead0d8';
    for (const p of [0, w / 2]) {
      g.fillRect(p, 0, 2, h);
      g.fillRect(0, p, w, 2);
    }
  }, [repeatX, repeatY]);
}

// the magazine on the side table
function magazineTex() {
  return canvasTex(160, 120, (g, w, h) => {
    g.fillStyle = '#f6efe0';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#e9b949'; // left page: a cover photo of something golden
    g.fillRect(8, 8, w / 2 - 14, h - 16);
    g.fillStyle = '#8a5a2b';
    g.font = 'bold 15px -apple-system, "Apple SD Gothic Neo", sans-serif';
    g.textAlign = 'center';
    g.fillText('오늘의', w / 4, 40);
    g.fillText('읽을거리', w / 4, 60);
    g.fillStyle = '#cdbfa9'; // right page: lines of text
    for (let k = 0; k < 7; k++) g.fillRect(w / 2 + 8, 14 + k * 14, w / 2 - 18 - (k % 3) * 10, 4);
    g.fillStyle = '#d9cbb4';
    g.fillRect(w / 2 - 1, 0, 2, h);
  });
}

// the framed picture: a little golden poop on cream, like a museum print
function pictureTex() {
  return canvasTex(128, 160, (g, w, h) => {
    g.fillStyle = '#efe8dc';
    g.fillRect(0, 0, w, h);
    const tiers = [[64, 112, 40, 14], [64, 92, 30, 12], [64, 74, 20, 10]];
    for (const [x, y, rx, ry] of tiers) {
      g.fillStyle = '#c99a3a';
      g.beginPath();
      g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(255,240,190,0.55)';
      g.beginPath();
      g.ellipse(x - rx * 0.3, y - ry * 0.35, rx * 0.35, ry * 0.3, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#c99a3a';
    g.beginPath();
    g.moveTo(58, 66);
    g.quadraticCurveTo(66, 50, 72, 58);
    g.quadraticCurveTo(70, 66, 64, 66);
    g.fill();
  });
}

// the sky outside the window: pale clouds on white, tinted by the time of day through the material colour
function windowTex() {
  return canvasTex(128, 112, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(1, '#f0f0f0');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.9)';
    for (const [x, y, r] of [[30, 40, 14], [46, 36, 18], [62, 42, 12], [96, 74, 10], [108, 70, 13]]) {
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
  });
}

export function buildPrivateRoom({ SEAT_TOP, HIP_Y }) {
  const { W, D, FRONT, H } = ROOM;
  const group = new THREE.Group();
  group.visible = false;
  const lambert = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
  const add = (geo, material, x, y, z, { cast = true, receive = true, parent = group } = {}) => {
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y, z);
    m.castShadow = cast;
    m.receiveShadow = receive;
    parent.add(m);
    return m;
  };
  const box = (w, h, d, material, x, y, z, opts) => add(new THREE.BoxGeometry(w, h, d), material, x, y, z, opts);
  const cyl = (r1, r2, h, material, x, y, z, segs = 24, opts) => add(new THREE.CylinderGeometry(r1, r2, h, segs), material, x, y, z, opts);
  const ball = (r, material, x, y, z, opts) => add(new THREE.SphereGeometry(r, 16, 12), material, x, y, z, opts);

  // ---------- floor, walls, ceiling: a closed box, so the camera is always inside ----------
  const depth = D + FRONT;
  const midZ = (FRONT - D) / 2;
  const floor = add(new THREE.PlaneGeometry(W, depth), lambert('#ffffff', { map: floorTex(W / 0.42, depth / 0.42) }), 0, 0, midZ, { cast: false });
  floor.rotation.x = -Math.PI / 2;
  const wall = (w, rotY, x, z) => {
    const m = add(new THREE.PlaneGeometry(w, H), lambert('#ffffff', { map: brickTex(w / 1.2, H / 0.6) }), x, H / 2, z, { cast: false });
    m.rotation.y = rotY;
    return m;
  };
  wall(W, 0, 0, -D);                       // back
  wall(depth, Math.PI / 2, -W / 2, midZ);  // left
  wall(depth, -Math.PI / 2, W / 2, midZ);  // right
  wall(W, Math.PI, 0, FRONT);              // front, behind the camera
  const ceiling = add(new THREE.PlaneGeometry(W, depth), lambert('#fbf3e8'), 0, H, midZ, { cast: false });
  ceiling.rotation.x = Math.PI / 2;
  const trim = lambert('#d8b48f');
  for (const x of [-W / 2 + 0.02, W / 2 - 0.02]) box(0.04, 0.1, depth, trim, x, 0.05, midZ, { cast: false }); // skirting
  box(W, 0.1, 0.04, trim, 0, 0.05, -D + 0.02, { cast: false });

  // ---------- the window on the left wall, with the sky behind it ----------
  const cream = lambert('#fbf6ea');
  const windowMat = new THREE.MeshBasicMaterial({ color: '#bfe0f7', map: windowTex() });
  const glass = add(new THREE.PlaneGeometry(0.9, 0.75), windowMat, -W / 2 + 0.01, 1.6, -1.0, { cast: false, receive: false });
  glass.rotation.y = Math.PI / 2;
  box(0.05, 0.05, 0.96, cream, -W / 2 + 0.03, 1.6, -1.0);   // cross bar
  box(0.05, 0.05, 1.0, cream, -W / 2 + 0.03, 1.98, -1.0);   // top
  box(0.1, 0.05, 1.04, cream, -W / 2 + 0.05, 1.22, -1.0);   // sill
  for (const z of [-0.53, -1.47]) box(0.05, 0.8, 0.05, cream, -W / 2 + 0.03, 1.6, z);

  // ---------- the toilet against the back wall ----------
  const porcelain = new THREE.MeshPhongMaterial({ color: '#fbfaf6', shininess: 60 });
  const tx = TOILET.x;
  box(0.44, 0.42, 0.2, porcelain, tx, 0.62, TOILET.z - 0.2);
  cyl(0.2, 0.16, 0.4, porcelain, tx, 0.2, TOILET.z + 0.08);
  cyl(0.23, 0.23, 0.05, porcelain, tx, 0.42, TOILET.z + 0.12);
  cyl(0.02, 0.02, 0.06, lambert('#c9c4bb'), tx + 0.16, 0.86, TOILET.z - 0.2);
  // a paper roll on the wall beside it
  const roll = cyl(0.06, 0.06, 0.11, lambert('#ffffff'), -W / 2 + 0.1, 0.72, TOILET.z + 0.3, 20);
  roll.rotation.z = Math.PI / 2;
  box(0.04, 0.03, 0.03, lambert('#c9c4bb'), -W / 2 + 0.03, 0.8, TOILET.z + 0.3);

  // ---------- the side table: a magazine to read, a spare roll and a plunger ----------
  const walnut = lambert('#3f3833');
  box(0.42, 0.6, 0.38, walnut, tx + 0.62, 0.3, TOILET.z - 0.05);
  const mag = box(0.3, 0.012, 0.22, lambert('#ffffff', { map: magazineTex() }), tx + 0.56, 0.607, TOILET.z - 0.1);
  mag.rotation.y = -0.2;
  box(0.18, 0.02, 0.02, lambert('#cfc6ba'), tx + 0.62, 0.42, TOILET.z + 0.15);
  const spare = cyl(0.06, 0.06, 0.12, lambert('#ffffff'), tx + 0.62, 0.14, TOILET.z + 0.1, 20);
  spare.rotation.x = Math.PI / 2;
  cyl(0.09, 0.06, 0.06, lambert('#2e2a28'), tx + 0.98, 0.03, TOILET.z + 0.05);
  cyl(0.012, 0.012, 0.55, lambert('#f2efe8'), tx + 0.98, 0.32, TOILET.z + 0.05, 8);

  // ---------- the sink on a stand, towels, a mirror ----------
  const steel = lambert('#9aa3a0');
  const sx = 0.85;
  const sz = -1.25;
  box(0.04, 0.8, 0.42, steel, sx + 0.18, 0.4, sz);
  box(0.04, 0.8, 0.42, steel, sx - 0.2, 0.4, sz);
  box(0.42, 0.04, 0.46, lambert('#f6efe0'), sx - 0.02, 0.79, sz);
  box(0.38, 0.03, 0.4, steel, sx - 0.02, 0.35, sz);
  box(0.3, 0.1, 0.3, lambert('#f8e7c9'), sx - 0.02, 0.42, sz);
  cyl(0.17, 0.12, 0.14, porcelain, sx - 0.02, 0.88, sz);
  const tap = cyl(0.015, 0.015, 0.22, lambert('#e9e6df'), W / 2 - 0.12, 1.02, sz, 10);
  tap.rotation.z = Math.PI / 2;
  box(0.03, 0.62, 0.5, lambert('#8fa79d'), W / 2 - 0.02, 1.55, sz);
  box(0.01, 0.54, 0.42, new THREE.MeshPhongMaterial({ color: '#dfeef0', shininess: 120 }), W / 2 - 0.04, 1.55, sz, { cast: false });

  // ---------- a chest of drawers with a diffuser ----------
  box(0.3, 0.9, 0.55, walnut, W / 2 - 0.17, 0.45, -0.55);
  for (const y of [0.25, 0.55]) box(0.02, 0.02, 0.18, lambert('#cfc6ba'), W / 2 - 0.33, y, -0.55);
  cyl(0.06, 0.06, 0.16, lambert('#b98f63', { transparent: true, opacity: 0.9 }), W / 2 - 0.17, 0.98, -0.55);
  const stickMat = lambert('#d4a96b');
  for (let k = 0; k < 4; k++) {
    const a = k * 0.4 - 0.6;
    const stick = cyl(0.006, 0.006, 0.3, stickMat, W / 2 - 0.17 + Math.sin(a) * 0.04, 1.16, -0.55, 6, { cast: false });
    stick.rotation.set(0.15 * (k - 1.5), 0, -a * 0.3);
  }

  // ---------- a framed picture, the pendant lamp ----------
  box(0.5, 0.62, 0.03, lambert('#2e2a28'), 0.35, 1.7, -D + 0.02);
  box(0.42, 0.54, 0.01, lambert('#ffffff', { map: pictureTex() }), 0.35, 1.7, -D + 0.04, { cast: false });
  cyl(0.006, 0.006, 0.2, lambert('#2e2a28'), 0.2, 2.5, -1.4, 6, { cast: false });
  cyl(0.04, 0.22, 0.16, new THREE.MeshLambertMaterial({ color: '#2e2a28', side: THREE.DoubleSide }), 0.2, 2.32, -1.4, 24, { cast: false });
  ball(0.07, new THREE.MeshBasicMaterial({ color: '#fff3d6' }), 0.2, 2.22, -1.4, { cast: false, receive: false });
  const lamp = new THREE.PointLight('#ffd6a3', 6, 7, 1.4);
  lamp.position.set(0.2, 2.1, -1.4);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(512, 512);
  lamp.shadow.bias = -0.004;
  group.add(lamp);
  const fill = new THREE.PointLight('#fff1dc', 1.6, 6, 1.2); // soft light from behind the camera, so faces aren't dark
  fill.position.set(0, 1.9, 1.0);
  group.add(fill);

  // where things go: the sitter's hips (facing out of the room, toward the camera), the poop tower on the side table
  const seat = new THREE.Group();
  seat.position.set(tx, SEAT_TOP - HIP_Y, TOILET.z + 0.3);
  const pile = new THREE.Group();
  pile.position.set(tx + 0.76, 0.62, TOILET.z + 0.06); // on the side table, beside the magazine
  pile.scale.setScalar(0.7);
  group.add(seat, pile);

  return {
    group, seat, pile, windowMat,
    aim: new THREE.Vector3(-0.1, 0, -1.9),             // what the camera looks at (local)
    bowl: new THREE.Vector3(tx, 0.6, TOILET.z + 0.1),   // where a poop leaves from (local)
    head: new THREE.Vector3(tx, 1.5, TOILET.z + 0.3),   // over the sitter's head (local)
    knock: new THREE.Vector3(0.45, 1.55, -1.1),        // where a knock on the door shows (local)
    washSpot: new THREE.Vector3(sx - 0.48, 0, sz),     // where you stand to wash, facing the sink (local)
    tap: new THREE.Vector3(sx - 0.02, 1.0, sz),         // the water falls from here into the basin (local)
  };
}
