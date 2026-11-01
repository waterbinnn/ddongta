// The private toilet room behind a door of the private restroom (프리미엄 화장실). There is only one: whoever goes in
// sees their own room, and nobody else's. A roomy, hotel-like bathroom you can get up and walk about in:
// bright white marble floor and walls with a brass line, a cove of soft light round the ceiling and a skylight in it,
// the toilet in a lit niche on the back wall, a long floating vanity with two basins under a glowing round mirror,
// a big window with a bench of folded towels below it, and the door out in the same wall.
// The room is closed all round so the camera sits inside it.
import * as THREE from '/vendor/three.module.js';

export const ROOM = { W: 4.0, D: 3.6, FRONT: 1.7, H: 3.0 }; // width, depth to the back wall, room in front of the origin, height
const TOILET = { x: -0.7, z: -3.15 };

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


// white marble, in big slabs with soft grey veins and fine joints; the canvas holds 2 × 2 slabs
// (the floor's are 60 cm tiles, the walls' tall panels)
function stoneTileTex(repeatX, repeatY) {
  return canvasTex(512, 512, (g) => {
    const rand = seeded(41);
    for (let ty = 0; ty < 2; ty++) {
      for (let tx = 0; tx < 2; tx++) {
        const tone = 0.98 + rand() * 0.03;
        g.fillStyle = `rgb(${Math.round(242 * tone)}, ${Math.round(239 * tone)}, ${Math.round(234 * tone)})`;
        g.fillRect(tx * 256, ty * 256, 256, 256);
        for (let k = 0; k < 6; k++) { // the veins
          g.strokeStyle = `rgba(150, 152, 158, ${0.1 + rand() * 0.18})`;
          g.lineWidth = 0.6 + rand() * 1.4;
          g.beginPath();
          const y0 = ty * 256 + rand() * 256;
          g.moveTo(tx * 256, y0);
          g.bezierCurveTo(tx * 256 + 80, y0 + (rand() - 0.5) * 120, tx * 256 + 170, y0 + (rand() - 0.5) * 120, tx * 256 + 256, y0 + (rand() - 0.5) * 80);
          g.stroke();
        }
        g.fillStyle = 'rgba(190, 185, 178, 0.6)'; // the joints
        g.fillRect(tx * 256, ty * 256, 256, 2);
        g.fillRect(tx * 256, ty * 256, 2, 256);
      }
    }
  }, [repeatX, repeatY]);
}

// wooden slats (tinted for the door and the niche behind the toilet); the canvas is 60 cm wide
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

// smooth plaster, faintly mottled (the ceiling)
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
  const phong = (color, extra = {}) => new THREE.MeshPhongMaterial({ color, ...extra });
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
  const glow = (color) => new THREE.MeshBasicMaterial({ color }); // lit from within: light strips, the mirror's ring
  const blockers = []; // furniture you walk round: [x0, x1, z0, z1]
  const block = (x, z, w, d) => blockers.push([x - w / 2, x + w / 2, z - d / 2, z + d / 2]);

  // ---------- floor, walls, ceiling: a closed box, so the camera is always inside ----------
  const depth = D + FRONT;
  const midZ = (FRONT - D) / 2;
  const floor = add(new THREE.PlaneGeometry(W, depth), lambert('#ffffff', { map: stoneTileTex(W / 1.2, depth / 1.2) }), 0, 0, midZ, { cast: false });
  floor.rotation.x = -Math.PI / 2;
  // each wall: white marble panels floor to ceiling, like a hotel bathroom, a thin brass line inlaid at 1.15 m
  const PANEL = 1.15;
  const marble = (w) => phong('#ffffff', { map: stoneTileTex(w / 1.2, H / 1.5), shininess: 40, specular: '#3a3a3a' });
  const wall = (w, rotY, x, z) => {
    const panel = add(new THREE.PlaneGeometry(w, H), marble(w), x, H / 2, z, { cast: false });
    panel.rotation.y = rotY;
  };
  wall(W, 0, 0, -D);                       // back
  wall(depth, Math.PI / 2, -W / 2, midZ);  // left
  wall(depth, -Math.PI / 2, W / 2, midZ);  // right
  wall(W, Math.PI, 0, FRONT);              // front, behind the camera
  const brass = phong('#c9a15a', { shininess: 90, specular: '#fff1c8' });
  for (const x of [-W / 2 + 0.015, W / 2 - 0.015]) box(0.03, 0.035, depth, brass, x, PANEL, midZ, { cast: false });
  for (const z of [-D + 0.015, FRONT - 0.015]) box(W, 0.035, 0.03, brass, 0, PANEL, z, { cast: false });
  for (const x of [-W / 2 + 0.02, W / 2 - 0.02]) box(0.04, 0.08, depth, lambert('#d8d2c8'), x, 0.04, midZ, { cast: false }); // skirting
  for (const z of [-D + 0.02, FRONT - 0.02]) box(W, 0.08, 0.04, lambert('#d8d2c8'), 0, 0.04, z, { cast: false });

  // the ceiling: dark wooden battens, a cove of warm light all round its edge, and a skylight over the middle
  const SKY = { hw: 0.85, hd: 0.85, z: -1.2, well: 0.35 };
  const ceilingMat = lambert('#f6f3ee', { map: plasterTex(W / 1.2, depth / 1.2) }); // smooth white plaster
  const ceilingPart = (x0, x1, z0, z1) => {
    const part = add(new THREE.PlaneGeometry(x1 - x0, z1 - z0), ceilingMat, (x0 + x1) / 2, H, (z0 + z1) / 2, { cast: false });
    part.rotation.x = Math.PI / 2;
  };
  ceilingPart(-W / 2, W / 2, -D, SKY.z - SKY.hd);
  ceilingPart(-W / 2, W / 2, SKY.z + SKY.hd, FRONT);
  ceilingPart(-W / 2, -SKY.hw, SKY.z - SKY.hd, SKY.z + SKY.hd);
  ceilingPart(SKY.hw, W / 2, SKY.z - SKY.hd, SKY.z + SKY.hd);
  const shaft = lambert('#f1ede6', { side: THREE.DoubleSide });
  for (const [w, rotY, x, z] of [[SKY.hw * 2, 0, 0, SKY.z - SKY.hd], [SKY.hw * 2, Math.PI, 0, SKY.z + SKY.hd], [SKY.hd * 2, Math.PI / 2, -SKY.hw, SKY.z], [SKY.hd * 2, -Math.PI / 2, SKY.hw, SKY.z]]) {
    const side = add(new THREE.PlaneGeometry(w, SKY.well), shaft, x, H + SKY.well / 2, z, { cast: false });
    side.rotation.y = rotY;
  }
  const oak = lambert('#5e4532');
  for (const z of [SKY.z - SKY.hd, SKY.z + SKY.hd]) box(SKY.hw * 2 + 0.1, 0.06, 0.06, oak, 0, H - 0.03, z, { cast: false });
  for (const x of [-SKY.hw, SKY.hw]) box(0.06, 0.06, SKY.hd * 2 + 0.1, oak, x, H - 0.03, SKY.z, { cast: false });
  const pane = add(new THREE.PlaneGeometry(SKY.hw * 2, SKY.hd * 2), new THREE.MeshBasicMaterial({ color: '#dff0fa', transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide }), 0, H + SKY.well, SKY.z, { cast: false, receive: false });
  pane.rotation.x = Math.PI / 2;
  box(SKY.hw * 2 + 0.04, 0.03, 0.03, oak, 0, H + SKY.well, SKY.z, { cast: false });
  const cove = glow('#ffd79a');
  for (const x of [-W / 2 + 0.04, W / 2 - 0.04]) box(0.02, 0.02, depth - 0.1, cove, x, H - 0.12, midZ, { cast: false, receive: false });
  for (const z of [-D + 0.04, FRONT - 0.04]) box(W - 0.1, 0.02, 0.02, cove, 0, H - 0.12, z, { cast: false, receive: false });
  for (const x of [-W / 2 + 0.06, W / 2 - 0.06]) box(0.06, 0.03, depth, lambert('#efebe4'), x, H - 0.1, midZ, { cast: false }); // the ledge hiding it
  for (const z of [-D + 0.06, FRONT - 0.06]) box(W, 0.03, 0.06, lambert('#efebe4'), 0, H - 0.1, z, { cast: false });

  // ---------- the toilet in a niche on the back wall, a lit shelf above it ----------
  const porcelain = phong('#fbfaf6', { shininess: 80 });
  const tx = TOILET.x;
  const tz = TOILET.z;
  box(1.1, 2.2, 0.02, lambert('#8a6446', { map: slatTex(1.8) }), tx, 1.1, -D + 0.01, { cast: false }); // the niche's back: warm walnut against the marble
  box(1.1, 0.04, 0.2, lambert('#3a2c22'), tx, 1.45, -D + 0.1); // a shelf
  box(1.06, 0.015, 0.015, glow('#ffd79a'), tx, 1.43, -D + 0.19, { cast: false, receive: false }); // lit from under its lip
  box(0.5, 0.36, 0.18, porcelain, tx, 0.66, tz - 0.2); // a slim cistern
  cyl(0.2, 0.17, 0.38, porcelain, tx, 0.19, tz + 0.08);
  cyl(0.23, 0.23, 0.05, porcelain, tx, 0.42, tz + 0.12);
  box(0.1, 0.02, 0.05, brass, tx, 0.85, tz - 0.2); // a brass flush plate
  for (const k of [0, 1]) box(0.09, 0.12, 0.09, phong(k ? '#e8e1d4' : '#3a3633', { shininess: 40 }), tx - 0.25 + k * 0.5, 1.53, -D + 0.1); // two jars on the shelf
  box(0.5, 0.64, 0.03, lambert('#1f1b19'), tx, 2.05, -D + 0.03); // a framed print over it
  box(0.42, 0.56, 0.01, lambert('#ffffff', { map: pictureTex() }), tx, 2.05, -D + 0.05, { cast: false });
  // a brass paper holder, and a little side table with a magazine
  const roll = cyl(0.06, 0.06, 0.11, lambert('#ffffff'), tx - 0.5, 0.72, tz + 0.15, 20);
  roll.rotation.z = Math.PI / 2;
  box(0.16, 0.02, 0.02, brass, tx - 0.5, 0.79, tz + 0.15);
  const walnut = lambert('#4a382c');
  cyl(0.2, 0.2, 0.03, walnut, tx + 0.65, 0.55, tz + 0.1);
  cyl(0.025, 0.025, 0.52, brass, tx + 0.65, 0.27, tz + 0.1, 10);
  cyl(0.14, 0.16, 0.02, brass, tx + 0.65, 0.01, tz + 0.1);
  const mag = box(0.28, 0.012, 0.2, lambert('#ffffff', { map: magazineTex() }), tx + 0.65, 0.572, tz + 0.1);
  mag.rotation.y = -0.3;
  block(tx, tz, 0.6, 0.9);
  block(tx + 0.65, tz + 0.1, 0.45, 0.45);

  // ---------- the vanity along the right wall: floating walnut, a stone top, two basins, a glowing round mirror ----------
  const vz = -1.1; // its middle
  const vx = W / 2 - 0.3;
  box(0.55, 0.42, 1.7, walnut, vx, 0.6, vz);
  for (const z of [vz - 0.43, vz + 0.43]) box(0.02, 0.02, 0.5, brass, vx - 0.28, 0.62, z); // drawer pulls
  box(0.58, 0.05, 1.76, phong('#ece6dc', { shininess: 70 }), vx, 0.835, vz);
  const basins = [vz - 0.42, vz + 0.42];
  for (const z of basins) {
    cyl(0.17, 0.13, 0.13, porcelain, vx + 0.02, 0.92, z, 28);
    const spout = cyl(0.012, 0.012, 0.16, brass, W / 2 - 0.06, 1.08, z, 10);
    spout.rotation.z = Math.PI / 2;
    cyl(0.02, 0.02, 0.2, brass, W / 2 - 0.05, 0.98, z, 10);
  }
  // the round mirror, with a warm ring of light behind it
  const ringMat = glow('#ffd79a');
  const ring = add(new THREE.TorusGeometry(0.42, 0.025, 10, 48), ringMat, W / 2 - 0.03, 1.72, vz, { cast: false, receive: false });
  ring.rotation.y = Math.PI / 2;
  const mirror = add(new THREE.CircleGeometry(0.42, 48), phong('#cfe0e6', { shininess: 150, specular: '#ffffff', emissive: '#28343a' }), W / 2 - 0.035, 1.72, vz, { cast: false });
  mirror.rotation.y = -Math.PI / 2;
  const mirrorLight = new THREE.PointLight('#ffd9a8', 1.2, 3, 1.6);
  mirrorLight.position.set(W / 2 - 0.4, 1.7, vz);
  group.add(mirrorLight);
  // a brass towel rail beside it, with a towel
  for (const y of [0.9, 1.1, 1.3]) {
    const bar = cyl(0.012, 0.012, 0.55, brass, W / 2 - 0.08, y, vz + 1.25, 10);
    bar.rotation.x = Math.PI / 2;
  }
  box(0.04, 0.5, 0.42, lambert('#e9e2d4'), W / 2 - 0.09, 1.02, vz + 1.25);
  block(vx, vz, 0.6, 1.8);

  // ---------- a big window on the left wall, a bench of folded towels below it ----------
  const cream = lambert('#2e2620'); // dark window frame
  const windowMat = new THREE.MeshBasicMaterial({ color: '#bfe0f7', map: windowTex() });
  const wz = -1.0;
  const glass = add(new THREE.PlaneGeometry(1.5, 1.2), windowMat, -W / 2 + 0.01, 1.85, wz, { cast: false, receive: false });
  glass.rotation.y = Math.PI / 2;
  box(0.05, 0.05, 1.56, cream, -W / 2 + 0.03, 1.85, wz);
  box(0.05, 0.06, 1.6, cream, -W / 2 + 0.03, 2.47, wz);
  box(0.14, 0.05, 1.64, lambert('#3a2c22'), -W / 2 + 0.07, 1.23, wz);
  for (const z of [wz - 0.77, wz, wz + 0.77]) box(0.05, 1.24, 0.05, cream, -W / 2 + 0.03, 1.85, z);
  box(0.45, 0.06, 1.4, walnut, -W / 2 + 0.25, 0.45, wz); // the bench
  for (const z of [wz - 0.6, wz + 0.6]) box(0.4, 0.42, 0.06, walnut, -W / 2 + 0.25, 0.21, z);
  for (const [z, c] of [[wz - 0.3, '#ece6da'], [wz + 0.05, '#d9cbb8'], [wz + 0.35, '#ece6da']]) box(0.32, 0.12, 0.26, lambert(c), -W / 2 + 0.25, 0.54, z);
  block(-W / 2 + 0.25, wz, 0.5, 1.45);

  // ---------- the door out, in the left wall near the front: oak, a brass handle, the room number on a plaque ----------
  const doorZ = 0.95;
  const doorWood = lambert('#6b4a32', { map: slatTex(1) });
  box(0.06, 2.15, 0.94, doorWood, -W / 2 + 0.03, 1.075, doorZ);
  for (const z of [doorZ - 0.5, doorZ + 0.5]) box(0.08, 2.25, 0.07, lambert('#3a2c22'), -W / 2 + 0.04, 1.125, z); // the frame
  box(0.08, 0.07, 1.07, lambert('#3a2c22'), -W / 2 + 0.04, 2.215, doorZ);
  for (const y of [0.55, 1.6]) box(0.015, 0.5, 0.7, lambert('#5e412c'), -W / 2 + 0.065, y, doorZ, { cast: false }); // two raised panels
  const handle = cyl(0.014, 0.014, 0.16, brass, -W / 2 + 0.1, 1.0, doorZ - 0.33, 10);
  handle.rotation.x = Math.PI / 2;
  cyl(0.03, 0.03, 0.03, brass, -W / 2 + 0.075, 1.0, doorZ - 0.38, 14).rotation.z = Math.PI / 2;
  box(0.012, 0.09, 0.2, brass, -W / 2 + 0.065, 1.95, doorZ, { cast: false }); // a little brass plaque

  // ---------- a round upholstered stool in the back corner, to sit and rest on (facing into the room) ----------
  const stoolAt = { x: 0.75, z: -2.85 };
  const seatTop = 0.46;
  cyl(0.26, 0.24, 0.14, lambert('#b5835a'), stoolAt.x, seatTop - 0.07, stoolAt.z, 32); // a camel leather cushion
  cyl(0.27, 0.27, 0.02, brass, stoolAt.x, seatTop - 0.15, stoolAt.z, 32); // a brass band under it
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    const leg = cyl(0.015, 0.012, 0.34, brass, stoolAt.x + Math.cos(a) * 0.17, 0.16, stoolAt.z + Math.sin(a) * 0.17, 8);
    leg.rotation.set(Math.sin(a) * 0.15, 0, -Math.cos(a) * 0.15); // splayed out a little
  }
  block(stoolAt.x, stoolAt.z, 0.5, 0.5);

  // ---------- a hotel loveseat along the right wall by the front, cushions and all, and a brass floor lamp ----------
  const sofaAt = { x: W / 2 - 0.42, z: 1.0 };
  const fabric = lambert('#c9b9a2'); // oatmeal bouclé
  box(0.75, 0.12, 1.3, walnut, sofaAt.x, 0.08, sofaAt.z); // the walnut base
  box(0.62, 0.17, 1.12, fabric, sofaAt.x - 0.05, 0.31, sofaAt.z); // the seat cushion
  box(0.18, 0.46, 1.12, fabric, W / 2 - 0.12, 0.6, sofaAt.z); // the back
  for (const s of [-1, 1]) box(0.75, 0.46, 0.11, fabric, sofaAt.x, 0.37, sofaAt.z + s * 0.6); // the arms
  for (const [dz, c, tilt] of [[-0.33, '#8a5a3c', 0.25], [0.33, '#3d4a5c', -0.2]]) {
    const pillow = box(0.12, 0.32, 0.32, lambert(c), W / 2 - 0.27, 0.56, sofaAt.z + dz);
    pillow.rotation.set(tilt, 0, 0.18);
  }
  block(sofaAt.x, sofaAt.z, 0.8, 1.35);
  // the floor lamp in the back right corner, behind the stool: a brass stem, a linen drum shade glowing warm
  const flX = W / 2 - 0.35;
  const flZ = -D + 0.35;
  cyl(0.16, 0.18, 0.03, brass, flX, 0.015, flZ, 24);
  cyl(0.012, 0.012, 1.45, brass, flX, 0.74, flZ, 8);
  const shadeMat = new THREE.MeshLambertMaterial({ color: '#f1e6d2', emissive: '#ffbf75', emissiveIntensity: 0.6, side: THREE.DoubleSide });
  cyl(0.2, 0.24, 0.3, shadeMat, flX, 1.52, flZ, 32, { cast: false });
  const floorLight = new THREE.PointLight('#ffcf98', 0.9, 4, 1.6);
  floorLight.position.set(flX, 1.45, flZ);
  group.add(floorLight);
  block(flX, flZ, 0.35, 0.35);

  // ---------- light: soft and low, a warm point in the middle and a little fill from behind the camera ----------
  const lamp = new THREE.PointLight('#ffe2bd', 4.4, 10, 1.3); // brighter now the room is pale
  lamp.position.set(0, H - 0.5, -1.6);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(512, 512);
  lamp.shadow.bias = -0.004;
  group.add(lamp);
  const fill = new THREE.PointLight('#fff0dc', 1.5, 8, 1.2);
  fill.position.set(0, 2.0, FRONT - 0.4);
  group.add(fill);

  // the lighting moods: warm (as it is), dim (low and cosy), party (the colours go round); dancing brings the party
  const lights = [[lamp, 4.4], [fill, 1.5], [mirrorLight, 1.2], [floorLight, 0.9]];
  const warm = new THREE.Color('#ffe2bd');
  const coveWarm = new THREE.Color('#ffd79a');
  const hue = new THREE.Color();
  let moodNow = 'warm';
  const mood = {
    get name() {
      return moodNow;
    },
    set(name) {
      moodNow = name;
      const dim = name === 'dim' ? 0.35 : 1;
      for (const [l, base] of lights) {
        l.intensity = base * dim;
        l.color.copy(warm);
      }
      cove.color.copy(coveWarm).multiplyScalar(name === 'dim' ? 0.45 : 1);
      ringMat.color.copy(cove.color);
      shadeMat.emissiveIntensity = name === 'dim' ? 0.35 : 0.6;
    },
    // every frame: in party mode the colours go round, the light pulsing a little to the beat
    tick(t, party) {
      if (!party && moodNow !== 'party') return;
      hue.setHSL((t * 0.12) % 1, 0.85, 0.6);
      cove.color.copy(hue);
      ringMat.color.setHSL((t * 0.12 + 0.5) % 1, 0.85, 0.6);
      lamp.color.copy(hue);
      lamp.intensity = 2.4 + Math.abs(Math.sin(t * 7.5)) * 1.2;
      mirrorLight.color.setHSL((t * 0.12 + 0.33) % 1, 0.8, 0.6);
    },
  };

  // where the sitter's hips go (facing out of the room, toward the camera)
  const seat = new THREE.Group();
  seat.position.set(tx, SEAT_TOP - HIP_Y, tz + 0.3);
  group.add(seat);

  return {
    group, seat, windowMat, blockers,
    // places to sit and rest: where the hips go, which way you face, where you get up to, and how near counts as by it
    seats: [
      { label: '스툴에 앉기', at: new THREE.Vector3(stoolAt.x, seatTop - HIP_Y, stoolAt.z), turn: 0, up: { x: stoolAt.x, z: stoolAt.z + 0.55 }, near: 0.95 },
      { label: '소파에 앉기', at: new THREE.Vector3(W / 2 - 0.55, 0.45 - HIP_Y, sofaAt.z), turn: -Math.PI / 2, up: { x: W / 2 - 1.15, z: sofaAt.z }, near: 1.25 },
    ],
    mood, magazine: () => new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.008, 0.21), new THREE.MeshLambertMaterial({ map: magazineTex() })),
    door: { x: -W / 2, z: doorZ, half: 0.42 }, // walk into it and you're out (local)
    entry: { x: -W / 2 + 0.75, z: doorZ, turn: Math.PI / 2 }, // where you stand on coming in, facing into the room (local)
    bounds: { x0: -W / 2 + 0.3, x1: W / 2 - 0.3, z0: -D + 0.3, z1: FRONT - 0.35 }, // where you can walk
    aim: new THREE.Vector3(-0.2, 0, -2.4),              // what the camera looks at, sitting down (local)
    bowl: new THREE.Vector3(tx, 0.6, tz + 0.1),         // where a poop leaves from (local)
    head: new THREE.Vector3(tx, 1.5, tz + 0.3),         // over the sitter's head (local)
    knock: new THREE.Vector3(0.6, 1.6, -1.6),           // where a knock on the door shows (local)
    washSpot: new THREE.Vector3(vx - 0.62, 0, basins[0]), // where you stand to wash, facing the basin (local)
    standSpot: new THREE.Vector3(tx + 0.4, 0, tz + 1.0), // getting up, just in front of the toilet (local)
    tap: new THREE.Vector3(W / 2 - 0.14, 1.06, basins[0]), // the water falls from here into the basin (local)
  };
}
