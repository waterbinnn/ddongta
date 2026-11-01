// The private toilet room behind a door of the private restroom (개인 화장실). There is only one: whoever goes in
// sees their own room, and nobody else's. It follows the blockout in tools/blender/concept_stall.py
// (Blender x, y, z become x, z-up, -y here), in bathhouse materials: hinoki slats under lime plaster, an oak floor, a window with the sky,
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

function seeded(seed) {
  let v = seed;
  return () => (v = (v * 16807) % 2147483647) / 2147483647;
}

// warm oak floorboards, 12 cm wide, staggered joints; the canvas holds 4 boards (48 cm) by 1.2 m
function floorTex(repeatX, repeatY) {
  return canvasTex(256, 640, (g) => {
    const rand = seeded(9);
    for (let b = 0; b < 4; b++) {
      const x = b * 64;
      const tone = 0.94 + rand() * 0.1;
      g.fillStyle = `rgb(${Math.round(196 * tone)}, ${Math.round(160 * tone)}, ${Math.round(118 * tone)})`;
      g.fillRect(x, 0, 64, 640);
      for (let k = 0; k < 26; k++) { // the grain
        g.strokeStyle = `rgba(140, 100, 65, ${0.12 + rand() * 0.15})`;
        g.lineWidth = 1 + rand();
        const gx = x + 4 + rand() * 56;
        g.beginPath();
        g.moveTo(gx, 0);
        g.bezierCurveTo(gx + (rand() - 0.5) * 10, 200, gx + (rand() - 0.5) * 10, 440, gx + (rand() - 0.5) * 6, 640);
        g.stroke();
      }
      g.fillStyle = 'rgba(90, 60, 35, 0.55)'; // the gap between boards
      g.fillRect(x, 0, 2, 640);
      const joint = (b % 2 ? 160 : 480) + Math.round(rand() * 40); // where one board ends and the next begins
      g.fillRect(x, joint, 64, 2);
    }
  }, [repeatX, repeatY]);
}

// the lower walls: vertical slats of pale hinoki, like a bathhouse; the canvas is 60 cm wide
function slatTex(repeatX) {
  return canvasTex(256, 256, (g) => {
    const rand = seeded(17);
    for (let k = 0; k < 6; k++) {
      const x = k * 42.6;
      const tone = 0.95 + rand() * 0.07;
      g.fillStyle = `rgb(${Math.round(222 * tone)}, ${Math.round(196 * tone)}, ${Math.round(158 * tone)})`;
      g.fillRect(x, 0, 42.6, 256);
      for (let n = 0; n < 8; n++) {
        g.strokeStyle = `rgba(170, 130, 90, ${0.1 + rand() * 0.12})`;
        g.beginPath();
        const gx = x + 3 + rand() * 36;
        g.moveTo(gx, 0);
        g.lineTo(gx + (rand() - 0.5) * 4, 256);
        g.stroke();
      }
      g.fillStyle = 'rgba(110, 80, 50, 0.45)';
      g.fillRect(x, 0, 2, 256);
    }
  }, [repeatX, 1]);
}

// the upper walls: smooth lime plaster, faintly mottled
function plasterTex(repeatX, repeatY) {
  return canvasTex(128, 128, (g) => {
    const rand = seeded(29);
    g.fillStyle = '#ece6da';
    g.fillRect(0, 0, 128, 128);
    for (let k = 0; k < 500; k++) {
      g.fillStyle = rand() < 0.5 ? 'rgba(205, 195, 178, 0.3)' : 'rgba(250, 247, 240, 0.4)';
      g.fillRect(rand() * 128, rand() * 128, 1 + rand() * 4, 1 + rand() * 3);
    }
  }, [repeatX, repeatY]);
}

// the ceiling: light wooden battens
function ceilingTex(repeatX, repeatY) {
  return canvasTex(128, 128, (g) => {
    g.fillStyle = '#e6d3b4';
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = 'rgba(120, 90, 60, 0.35)';
    for (let x = 0; x < 128; x += 16) g.fillRect(x, 0, 2, 128);
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
  const floor = add(new THREE.PlaneGeometry(W, depth), lambert('#ffffff', { map: floorTex(W / 0.48, depth / 1.2) }), 0, 0, midZ, { cast: false });
  floor.rotation.x = -Math.PI / 2;
  // each wall: hinoki slats up to a rail at 1.05 m, lime plaster above
  const PANEL = 1.05;
  const wall = (w, rotY, x, z) => {
    const upper = add(new THREE.PlaneGeometry(w, H - PANEL), lambert('#5a4f45', { map: plasterTex(w / 1.2, (H - PANEL) / 1.2) }), x, PANEL + (H - PANEL) / 2, z, { cast: false }); // a deep, dark wall colour
    upper.rotation.y = rotY;
    const lower = add(new THREE.PlaneGeometry(w, PANEL), lambert('#ffffff', { map: slatTex(w / 0.6) }), x, PANEL / 2, z, { cast: false });
    lower.rotation.y = rotY;
    return upper;
  };
  wall(W, 0, 0, -D);                       // back
  wall(depth, Math.PI / 2, -W / 2, midZ);  // left
  wall(depth, -Math.PI / 2, W / 2, midZ);  // right
  wall(W, Math.PI, 0, FRONT);              // front, behind the camera
  const ceiling = add(new THREE.PlaneGeometry(W, depth), lambert('#ffffff', { map: ceilingTex(W / 0.8, depth / 0.8) }), 0, H, midZ, { cast: false });
  ceiling.rotation.x = Math.PI / 2;
  // a dark wooden rail along the top of the slats
  const trim = lambert('#7a5a3c');
  for (const x of [-W / 2 + 0.02, W / 2 - 0.02]) box(0.04, 0.05, depth, trim, x, PANEL, midZ, { cast: false });
  box(W, 0.05, 0.04, trim, 0, PANEL, -D + 0.02, { cast: false });

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
  const steel = lambert('#8a6a4a'); // a wooden washstand
  const sx = 0.85;
  const sz = -1.25;
  box(0.04, 0.8, 0.42, steel, sx + 0.18, 0.4, sz);
  box(0.04, 0.8, 0.42, steel, sx - 0.2, 0.4, sz);
  box(0.42, 0.04, 0.46, lambert('#a4825e'), sx - 0.02, 0.79, sz);
  box(0.38, 0.03, 0.4, steel, sx - 0.02, 0.35, sz);
  box(0.3, 0.1, 0.3, lambert('#ece6da'), sx - 0.02, 0.42, sz); // folded linen towels
  cyl(0.17, 0.12, 0.14, porcelain, sx - 0.02, 0.88, sz);
  const tap = cyl(0.015, 0.015, 0.22, lambert('#e9e6df'), W / 2 - 0.12, 1.02, sz, 10);
  tap.rotation.z = Math.PI / 2;
  box(0.03, 0.62, 0.5, lambert('#5a4330'), W / 2 - 0.02, 1.55, sz); // a dark wooden mirror frame
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
  const lamp = new THREE.PointLight('#ffcf98', 4, 7, 1.4); // a low, warm light
  lamp.position.set(0.2, 2.1, -1.4);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(512, 512);
  lamp.shadow.bias = -0.004;
  group.add(lamp);
  const fill = new THREE.PointLight('#ffe6c8', 0.9, 6, 1.2); // soft light from behind the camera, so faces aren't lost in the dark
  fill.position.set(0, 1.9, 1.0);
  group.add(fill);

  // where the sitter's hips go (facing out of the room, toward the camera)
  const seat = new THREE.Group();
  seat.position.set(tx, SEAT_TOP - HIP_Y, TOILET.z + 0.3);
  group.add(seat);

  return {
    group, seat, windowMat,
    aim: new THREE.Vector3(-0.1, 0, -1.9),             // what the camera looks at (local)
    bowl: new THREE.Vector3(tx, 0.6, TOILET.z + 0.1),   // where a poop leaves from (local)
    head: new THREE.Vector3(tx, 1.5, TOILET.z + 0.3),   // over the sitter's head (local)
    knock: new THREE.Vector3(0.45, 1.55, -1.1),        // where a knock on the door shows (local)
    washSpot: new THREE.Vector3(sx - 0.48, 0, sz),     // where you stand to wash, facing the sink (local)
    standSpot: new THREE.Vector3(tx + 0.5, 0, TOILET.z + 0.85), // standing up, beside the toilet (local)
    tap: new THREE.Vector3(sx - 0.02, 1.0, sz),         // the water falls from here into the basin (local)
  };
}
