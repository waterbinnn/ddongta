// The private toilet room inside the premium restroom (프리미엄 화장실). There is only one: whoever goes in sees their
// own room, and nobody else's. A bathroom in the manner of Aman's: warm cream lime walls, a speckled terrazzo floor,
// a ceiling of dark timber battens with a skylight, the whole left wall glass onto the real grounds outside with a
// green marble tub before it; a low dark timber vanity against a green marble wall, the toilet behind a slatted screen,
// a daybed and a rattan stool that both face the window, plants, a rattan pendant, and the door out. The room is
// closed all round so the camera sits inside it.
import * as THREE from '/vendor/three.module.js';

export const ROOM = { W: 4.0, D: 3.6, FRONT: 1.7, H: 3.0 }; // width, depth to the back wall, room in front of the origin, height
const TOILET = { x: 1.35, z: -3.15 };

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


// warm cream lime plaster, softly clouded (the walls)
function limeTex(repeatX, repeatY) {
  return canvasTex(256, 256, (g) => {
    const rand = seeded(31);
    g.fillStyle = '#ebe0cc';
    g.fillRect(0, 0, 256, 256);
    for (let k = 0; k < 60; k++) {
      g.fillStyle = `rgba(${rand() < 0.5 ? '214, 200, 176' : '246, 240, 228'}, ${0.25 + rand() * 0.25})`;
      g.beginPath();
      g.ellipse(rand() * 256, rand() * 256, 20 + rand() * 60, 10 + rand() * 30, rand() * 3, 0, Math.PI * 2);
      g.fill();
    }
  }, [repeatX, repeatY]);
}

// terrazzo: warm cream with chips of grey, ochre and white (the floor)
function terrazzoTex(repeatX, repeatY) {
  return canvasTex(256, 256, (g) => {
    const rand = seeded(19);
    g.fillStyle = '#e6dccb';
    g.fillRect(0, 0, 256, 256);
    for (let k = 0; k < 900; k++) {
      g.fillStyle = ['#9a948a', '#c9a77a', '#f6f2ea', '#7d7b75', '#b8ad9b'][k % 5];
      const r = 0.6 + rand() * 2.2;
      g.beginPath();
      g.ellipse(rand() * 256, rand() * 256, r, r * (0.5 + rand() * 0.5), rand() * 3, 0, Math.PI * 2);
      g.fill();
    }
  }, [repeatX, repeatY]);
}

// green marble, deep and veined (the feature wall, the tub)
function greenMarbleTex(repeatX, repeatY) {
  return canvasTex(256, 256, (g) => {
    const rand = seeded(61);
    g.fillStyle = '#3f5a4c';
    g.fillRect(0, 0, 256, 256);
    for (let k = 0; k < 14; k++) {
      g.strokeStyle = `rgba(${rand() < 0.5 ? '170, 196, 180' : '30, 46, 38'}, ${0.25 + rand() * 0.35})`;
      g.lineWidth = 0.8 + rand() * 2.5;
      g.beginPath();
      const y = rand() * 256;
      g.moveTo(0, y);
      g.bezierCurveTo(80, y + (rand() - 0.5) * 140, 170, y + (rand() - 0.5) * 140, 256, y + (rand() - 0.5) * 100);
      g.stroke();
    }
  }, [repeatX, repeatY]);
}

// teak: warm honey wood with long fine grain
function teakTex(repeatX, repeatY) {
  return canvasTex(128, 256, (g) => {
    const rand = seeded(13);
    g.fillStyle = '#a8703f';
    g.fillRect(0, 0, 128, 256);
    for (let k = 0; k < 40; k++) {
      g.strokeStyle = `rgba(${rand() < 0.5 ? '120, 72, 36' : '196, 140, 86'}, ${0.25 + rand() * 0.3})`;
      g.lineWidth = 1 + rand() * 2;
      const x = rand() * 128;
      g.beginPath();
      g.moveTo(x, 0);
      g.bezierCurveTo(x + (rand() - 0.5) * 12, 90, x + (rand() - 0.5) * 12, 170, x + (rand() - 0.5) * 8, 256);
      g.stroke();
    }
  }, [repeatX, repeatY]);
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
  const glow = (color) => new THREE.MeshBasicMaterial({ color }); // lit from within: downlights, the sconces
  const blockers = []; // furniture you walk round: [x0, x1, z0, z1]
  const block = (x, z, w, d) => blockers.push([x - w / 2, x + w / 2, z - d / 2, z + d / 2]);
  const darkWood = lambert('#3e2e22', { map: teakTex(1, 1) });
  const teak = lambert('#ffffff', { map: teakTex(1, 1) });
  const brass = phong('#c9a15a', { shininess: 90, specular: '#fff1c8' });
  const greenMarble = (rx, ry) => phong('#ffffff', { map: greenMarbleTex(rx, ry), shininess: 70, specular: '#4a5a52' });
  const stoneBowl = phong('#d9d2c4', { shininess: 30 }); // pale honed stone basins
  const linen = lambert('#f6f2ea');

  // ---------- floor, walls, ceiling: a closed box, so the camera is always inside ----------
  const depth = D + FRONT;
  const midZ = (FRONT - D) / 2;
  const floor = add(new THREE.PlaneGeometry(W, depth), phong('#ffffff', { map: terrazzoTex(W / 1.0, depth / 1.0), shininess: 25 }), 0, 0, midZ, { cast: false });
  floor.rotation.x = -Math.PI / 2;
  const lime = (w) => lambert('#ffffff', { map: limeTex(w / 1.6, H / 1.6) });
  const wall = (w, rotY, x, z, material) => {
    const panel = add(new THREE.PlaneGeometry(w, H), material ?? lime(w), x, H / 2, z, { cast: false });
    panel.rotation.y = rotY;
  };
  wall(W, 0, 0, -D);                       // back
  wall(depth, Math.PI / 2, -W / 2, midZ);  // left (mostly glass)
  wall(depth, -Math.PI / 2, W / 2, midZ);  // right
  wall(W, Math.PI, 0, FRONT);              // front, behind the camera
  for (const x of [-W / 2 + 0.02, W / 2 - 0.02]) box(0.04, 0.08, depth, darkWood, x, 0.04, midZ, { cast: false }); // dark skirting
  for (const z of [-D + 0.02, FRONT - 0.02]) box(W, 0.08, 0.04, darkWood, 0, 0.04, z, { cast: false });

  // the ceiling: dark timber battens over a cream ground, a skylight in the middle
  const SKY = { hw: 0.65, hd: 0.65, z: -1.0, well: 0.3 };
  const ceilingMat = lambert('#efe6d6');
  const ceilingPart = (x0, x1, z0, z1) => {
    const part = add(new THREE.PlaneGeometry(x1 - x0, z1 - z0), ceilingMat, (x0 + x1) / 2, H, (z0 + z1) / 2, { cast: false });
    part.rotation.x = Math.PI / 2;
  };
  ceilingPart(-W / 2, W / 2, -D, SKY.z - SKY.hd);
  ceilingPart(-W / 2, W / 2, SKY.z + SKY.hd, FRONT);
  ceilingPart(-W / 2, -SKY.hw, SKY.z - SKY.hd, SKY.z + SKY.hd);
  ceilingPart(SKY.hw, W / 2, SKY.z - SKY.hd, SKY.z + SKY.hd);
  for (let x = -W / 2 + 0.25; x < W / 2; x += 0.3) { // the battens, broken by the skylight
    if (Math.abs(x) > SKY.hw + 0.05) box(0.07, 0.08, depth, darkWood, x, H - 0.04, midZ, { cast: false });
    else for (const [a, b] of [[-D, SKY.z - SKY.hd], [SKY.z + SKY.hd, FRONT]]) box(0.07, 0.08, b - a, darkWood, x, H - 0.04, (a + b) / 2, { cast: false });
  }
  const shaft = lambert('#efe6d6', { side: THREE.DoubleSide });
  for (const [w, rotY, x, z] of [[SKY.hw * 2, 0, 0, SKY.z - SKY.hd], [SKY.hw * 2, Math.PI, 0, SKY.z + SKY.hd], [SKY.hd * 2, Math.PI / 2, -SKY.hw, SKY.z], [SKY.hd * 2, -Math.PI / 2, SKY.hw, SKY.z]]) {
    const side = add(new THREE.PlaneGeometry(w, SKY.well), shaft, x, H + SKY.well / 2, z, { cast: false });
    side.rotation.y = rotY;
  }
  const pane = add(new THREE.PlaneGeometry(SKY.hw * 2, SKY.hd * 2), new THREE.MeshBasicMaterial({ color: '#dff0fa', transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide }), 0, H + SKY.well, SKY.z, { cast: false, receive: false });
  pane.rotation.x = Math.PI / 2;
  const cove = glow('#fff1d6'); // little downlights between the battens
  for (const [x, z] of [[-1.0, -3.0], [1.0, 0.7], [-1.0, 0.7], [0.4, -2.6]]) {
    const d = add(new THREE.CircleGeometry(0.045, 16), cove, x, H - 0.09, z, { cast: false, receive: false });
    d.rotation.x = Math.PI / 2;
  }

  // ---------- the left wall: glass, floor to ceiling, onto the grounds outside, in dark timber frames ----------
  const windowMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const wz = -1.3;
  const ww = 3.6;
  const glass = add(new THREE.PlaneGeometry(ww, H - 0.3), windowMat, -W / 2 + 0.01, (H - 0.3) / 2 + 0.12, wz, { cast: false, receive: false });
  glass.rotation.y = Math.PI / 2;
  for (const z of [wz - ww / 2, wz - ww / 6, wz + ww / 6, wz + ww / 2]) box(0.1, H - 0.1, 0.08, darkWood, -W / 2 + 0.04, H / 2, z); // mullions
  box(0.1, 0.1, ww + 0.08, darkWood, -W / 2 + 0.04, 0.1, wz);
  box(0.1, 0.12, ww + 0.08, darkWood, -W / 2 + 0.04, H - 0.14, wz);
  // the tub before it: a carved bowl of green marble, white within, still water
  const tubAt = { x: -W / 2 + 0.8, z: wz };
  const tubMat = greenMarble(2, 1);
  tubMat.side = THREE.DoubleSide;
  const tub = add(new THREE.CylinderGeometry(0.5, 0.44, 0.52, 40, 1, true), tubMat, tubAt.x, 0.26, tubAt.z); // open, so you see in
  tub.scale.z = 1.7;
  const rim = add(new THREE.TorusGeometry(0.47, 0.035, 8, 40).rotateX(Math.PI / 2), tubMat, tubAt.x, 0.52, tubAt.z);
  rim.scale.z = 1.7;
  const inside = add(new THREE.CylinderGeometry(0.43, 0.38, 0.4, 40, 1, true), phong('#f4f1ea', { shininess: 60, side: THREE.BackSide }), tubAt.x, 0.3, tubAt.z, { cast: false });
  inside.scale.z = 1.7;
  const water = add(new THREE.CircleGeometry(0.42, 40).rotateX(-Math.PI / 2), phong('#9fd0d8', { shininess: 120, transparent: true, opacity: 0.85 }), tubAt.x, 0.4, tubAt.z, { cast: false });
  water.scale.z = 1.7;
  const filler = cyl(0.02, 0.02, 0.9, brass, tubAt.x + 0.6, 0.45, tubAt.z - 0.65, 10);
  filler.castShadow = false;
  box(0.22, 0.03, 0.03, brass, tubAt.x + 0.5, 0.88, tubAt.z - 0.65);
  block(tubAt.x, tubAt.z, 1.05, 1.75);
  // a rattan pendant over the tub, glowing warm
  cyl(0.006, 0.006, 0.9, darkWood, tubAt.x + 0.15, H - 0.45, tubAt.z, 6, { cast: false });
  const shadeMat = new THREE.MeshLambertMaterial({ color: '#d6b07a', emissive: '#ffb860', emissiveIntensity: 0.6, side: THREE.DoubleSide });
  add(new THREE.SphereGeometry(0.3, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), shadeMat, tubAt.x + 0.15, H - 1.0, tubAt.z, { cast: false });
  const floorLight = new THREE.PointLight('#ffc78a', 1.1, 5, 1.5);
  floorLight.position.set(tubAt.x + 0.15, H - 1.15, tubAt.z);
  group.add(floorLight);

  // ---------- the back wall: a green marble feature wall behind a low floating vanity in dark timber,
  // two pale stone basins at a height little hands can reach, brass taps, two mirrors in brass, sconces ----------
  const vx = -0.45; // the vanity's middle
  const vz = -D + 0.27;
  const VTOP = 0.42; // the counter, low (everyone here is about a metre tall)
  wall(2.0, 0, vx, -D + 0.01, greenMarble(2, 2.4));
  box(1.9, 0.08, 0.5, phong('#e9e1d2', { shininess: 40 }), vx, VTOP, vz); // the stone top
  box(1.84, 0.22, 0.46, darkWood, vx, VTOP - 0.15, vz); // the drawer below it
  for (const x of [vx - 0.45, vx + 0.45]) box(0.24, 0.02, 0.02, brass, x, VTOP - 0.15, vz + 0.24); // pulls
  const basins = [vx - 0.45, vx + 0.45];
  const basinTop = VTOP + 0.16;
  const ringMat = glow('#ffd79a'); // the sconces' glow
  for (const x of basins) {
    cyl(0.2, 0.15, 0.13, stoneBowl, x, VTOP + 0.105, vz + 0.04, 28); // the bowl
    add(new THREE.CircleGeometry(0.17, 24).rotateX(-Math.PI / 2), phong('#b9b2a4'), x, basinTop + 0.001, vz + 0.04, { cast: false });
    const spout = cyl(0.012, 0.012, 0.2, brass, x, basinTop + 0.12, -D + 0.12, 10); // a tap out of the wall
    spout.rotation.x = Math.PI / 2;
    box(0.5, 0.7, 0.03, brass, x, 1.25, -D + 0.03); // the mirror's frame
    box(0.44, 0.64, 0.01, phong('#cfe0e6', { shininess: 150, specular: '#ffffff', emissive: '#28343a' }), x, 1.25, -D + 0.05, { cast: false });
  }
  for (const x of [vx - 0.9, vx, vx + 0.9]) { // brass sconces beside and between the mirrors
    box(0.05, 0.05, 0.05, brass, x, 1.35, -D + 0.04);
    cyl(0.04, 0.04, 0.14, ringMat, x, 1.35, -D + 0.1, 16, { cast: false });
  }
  const mirrorLight = new THREE.PointLight('#ffd9a8', 1.1, 3, 1.6);
  mirrorLight.position.set(vx, 1.4, -D + 0.6);
  group.add(mirrorLight);
  block(vx, vz, 1.95, 0.55);

  // ---------- the toilet in the back right corner, behind a slatted dark timber screen, a shelf over it ----------
  const porcelain = phong('#fbfaf6', { shininess: 80 });
  const tx = TOILET.x;
  const tz = TOILET.z;
  for (let k = 0; k < 9; k++) box(0.04, 2.1, 0.07, darkWood, 0.72, 1.05, -D + 0.08 + k * 0.12); // the screen
  block(0.72, -D + 0.55, 0.12, 1.1);
  box(0.9, 0.04, 0.22, darkWood, tx, 1.4, -D + 0.12); // a shelf
  cyl(0.06, 0.05, 0.12, stoneBowl, tx - 0.25, 1.48, -D + 0.12, 16); // a stone pot with an orchid
  for (let k = 0; k < 3; k++) {
    const stem = cyl(0.006, 0.006, 0.34, lambert('#4f7a3a'), tx - 0.25 + (k - 1) * 0.03, 1.7, -D + 0.12, 6);
    stem.rotation.z = (k - 1) * 0.2;
    add(new THREE.SphereGeometry(0.035, 10, 8), lambert('#f6f0f4'), tx - 0.25 + (k - 1) * 0.08, 1.86 - Math.abs(k - 1) * 0.04, -D + 0.14);
  }
  box(0.18, 0.1, 0.12, lambert('#c9a77a'), tx + 0.2, 1.47, -D + 0.12); // a woven basket
  box(0.5, 0.36, 0.18, porcelain, tx, 0.66, tz - 0.2); // a slim cistern
  cyl(0.2, 0.17, 0.38, porcelain, tx, 0.19, tz + 0.08);
  cyl(0.23, 0.23, 0.05, porcelain, tx, 0.42, tz + 0.12);
  box(0.1, 0.02, 0.05, brass, tx, 0.85, tz - 0.2);
  const roll = cyl(0.06, 0.06, 0.11, lambert('#ffffff'), W / 2 - 0.1, 0.72, tz + 0.15, 20);
  roll.rotation.z = Math.PI / 2;
  box(0.03, 0.02, 0.16, brass, W / 2 - 0.03, 0.79, tz + 0.15);
  block(tx, tz, 0.6, 0.9);

  // ---------- the door out, at the front of the right wall: dark timber slats, a brass pull ----------
  const doorZ = 0.95;
  box(0.06, 2.15, 0.94, darkWood, W / 2 - 0.03, 1.075, doorZ);
  for (let k = 0; k < 8; k++) box(0.012, 2.05, 0.06, lambert('#4e3a2a'), W / 2 - 0.065, 1.075, doorZ - 0.4 + k * 0.115, { cast: false });
  for (const z of [doorZ - 0.5, doorZ + 0.5]) box(0.08, 2.25, 0.07, darkWood, W / 2 - 0.04, 1.125, z); // the frame
  box(0.08, 0.07, 1.07, darkWood, W / 2 - 0.04, 2.215, doorZ);
  box(0.03, 0.4, 0.03, brass, W / 2 - 0.09, 1.0, doorZ + 0.32); // a long brass pull

  // ---------- a daybed in the middle of the room facing the window, white linen, a cushion or two ----------
  const sofaAt = { x: 0.85, z: -0.7 };
  box(0.8, 0.28, 1.5, darkWood, sofaAt.x, 0.14, sofaAt.z); // the frame
  box(0.74, 0.12, 1.42, linen, sofaAt.x, 0.34, sofaAt.z); // the mattress
  box(0.16, 0.42, 1.42, linen, sofaAt.x + 0.32, 0.6, sofaAt.z); // the back cushion, on the side away from the window
  box(0.08, 0.5, 1.5, darkWood, sofaAt.x + 0.4, 0.45, sofaAt.z); // its timber back
  for (const [dz, c] of [[-0.42, '#c9a46e'], [0.42, '#7d8b6a']]) {
    const pillow = box(0.12, 0.3, 0.3, lambert(c), sofaAt.x + 0.2, 0.55, sofaAt.z + dz);
    pillow.rotation.z = -0.2;
  }
  block(sofaAt.x, sofaAt.z, 0.85, 1.55);

  // ---------- a rattan stool by the window's front end, facing out ----------
  const stoolAt = { x: -W / 2 + 0.75, z: 1.0 };
  const seatTop = 0.46;
  const rattan = lambert('#c9a46e');
  cyl(0.22, 0.25, seatTop, rattan, stoolAt.x, seatTop / 2, stoolAt.z, 24);
  for (let k = 0; k < 5; k++) cyl(0.252, 0.252, 0.012, lambert('#a9844f'), stoolAt.x, 0.06 + k * 0.09, stoolAt.z, 24, { cast: false });
  cyl(0.23, 0.23, 0.04, linen, stoolAt.x, seatTop + 0.01, stoolAt.z, 24);
  block(stoolAt.x, stoolAt.z, 0.5, 0.5);

  // ---------- plants: a tall one in the front right corner, a smaller one by the vanity ----------
  const plant = (px, pz, scale) => {
    cyl(0.22 * scale, 0.18 * scale, 0.42 * scale, stoneBowl, px, 0.21 * scale, pz, 24);
    const leafMat = lambert('#3f7d3a', { side: THREE.DoubleSide });
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2;
      const h = (0.9 + (k % 3) * 0.3) * scale;
      const stem = cyl(0.012, 0.015, h, lambert('#5d7f3a'), px + Math.cos(a) * 0.07, 0.42 * scale + h / 2, pz + Math.sin(a) * 0.07, 6);
      stem.rotation.set(Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25);
      const leaf = add(new THREE.SphereGeometry(0.2 * scale, 12, 8), leafMat, px + Math.cos(a) * (0.07 + h * 0.25), 0.42 * scale + h * 0.97, pz + Math.sin(a) * (0.07 + h * 0.25));
      leaf.scale.set(0.45, 0.06, 1.3);
      leaf.rotation.set(0.5, -a, 0.3);
    }
    block(px, pz, 0.5 * scale, 0.5 * scale);
  };
  plant(W / 2 - 0.4, FRONT - 0.45, 1);
  plant(vx - 1.2, -D + 0.35, 0.8);

  // ---------- light: bright and warm; daylight through the glass; a fill from behind the camera ----------
  const lamp = new THREE.PointLight('#ffe9cc', 4.2, 11, 1.3);
  lamp.position.set(0.3, H - 0.5, -1.4);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(512, 512);
  lamp.shadow.bias = -0.004;
  group.add(lamp);
  const fill = new THREE.PointLight('#fff6ea', 1.5, 8, 1.2);
  fill.position.set(0, 2.0, FRONT - 0.4);
  group.add(fill);
  const daylight = new THREE.PointLight('#eaf6ff', 1.6, 6, 1.4); // through the glass wall
  daylight.position.set(-W / 2 + 0.7, 1.8, wz);
  group.add(daylight);

  // the lighting moods: warm (as it is), dim (low and cosy), party (the colours go round); dancing brings the party
  const lights = [[lamp, 4.2], [fill, 1.5], [mirrorLight, 1.1], [floorLight, 1.1], [daylight, 1.6]];
  const warm = new THREE.Color('#ffe9cc');
  const coveWarm = new THREE.Color('#fff1d6');
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
      ringMat.color.set('#ffd79a').multiplyScalar(name === 'dim' ? 0.6 : 1);
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
    // places to sit and rest: where the hips go, which way you face (both look out of the window, the camera behind),
    // where you get up to, and how near counts as by it
    seats: [
      { label: '스툴에 앉기', at: new THREE.Vector3(stoolAt.x, seatTop - HIP_Y, stoolAt.z), turn: -Math.PI / 2, up: { x: stoolAt.x + 0.55, z: stoolAt.z }, near: 0.95, behind: true },
      { label: '소파에 앉기', at: new THREE.Vector3(sofaAt.x - 0.05, 0.42 - HIP_Y, sofaAt.z), turn: -Math.PI / 2, up: { x: sofaAt.x - 0.7, z: sofaAt.z }, near: 1.2, behind: true },
    ],
    mood,
    // a hardback, open: a red cloth cover and two cream pages either side of the spine
    book: () => {
      const g = new THREE.Group();
      const cover = new THREE.MeshLambertMaterial({ color: '#7a2e24' });
      const paper = new THREE.MeshLambertMaterial({ color: '#f6efdf' });
      for (const side of [-1, 1]) {
        const half = new THREE.Group();
        half.rotation.z = side * 0.18; // the pages rise a little from the spine
        const c = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.008, 0.21), cover);
        c.position.x = side * 0.075;
        const pages = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.014, 0.2), paper);
        pages.position.set(side * 0.072, 0.011, 0);
        half.add(c, pages);
        g.add(half);
      }
      return g;
    },
    door: { x: W / 2, z: doorZ, half: 0.42, side: 1 }, // walk into it and you're out (local)
    entry: { x: W / 2 - 0.75, z: doorZ, turn: -Math.PI / 2 }, // where you stand on coming in, facing into the room (local)
    bounds: { x0: -W / 2 + 0.3, x1: W / 2 - 0.3, z0: -D + 0.3, z1: FRONT - 0.35 }, // where you can walk
    aim: new THREE.Vector3(tx - 0.3, 0, tz + 0.6),        // what the camera looks at, sitting on the toilet (local)
    bowl: new THREE.Vector3(tx, 0.6, tz + 0.1),         // where a poop leaves from (local)
    head: new THREE.Vector3(tx, 1.5, tz + 0.3),         // over the sitter's head (local)
    knock: new THREE.Vector3(W / 2 - 0.4, 1.6, doorZ),  // where a knock on the door shows (local)
    washSpot: new THREE.Vector3(basins[0], 0, vz + 0.6), // where you stand to wash, facing the basin (local)
    washTurn: Math.PI,                                  // facing the back wall
    basinTop,
    standSpot: new THREE.Vector3(tx - 0.2, 0, tz + 0.95), // getting up, just in front of the toilet (local)
    tap: new THREE.Vector3(basins[0], basinTop + 0.12, -D + 0.2), // the water falls from here into the basin (local)
  };
}
