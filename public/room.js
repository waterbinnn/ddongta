// The private toilet room inside the premium restroom (프리미엄 화장실). There is only one: whoever goes in sees their
// own room, and nobody else's. A Southeast Asian resort bathroom you can get up and walk about in: big pale grey-green
// stone tiles on the walls, a dark slate floor, a freestanding stone tub before a tall window of teak louvres looking out
// on palms, a teak vanity with stone vessel basins and two mirrors, a rattan pendant, plants, a daybed, a rattan stool,
// and the door out. The room is closed all round so the camera sits inside it.
import * as THREE from '/vendor/three.module.js';

export const ROOM = { W: 4.0, D: 3.6, FRONT: 1.7, H: 3.0 }; // width, depth to the back wall, room in front of the origin, height
const TOILET = { x: -0.15, z: -3.15 };

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


// big pale stone tiles, grey with a green cast and soft cloudy veins (the walls); the canvas holds 2 × 2 tiles
function stoneTex(repeatX, repeatY) {
  return canvasTex(512, 512, (g) => {
    const rand = seeded(41);
    for (let ty = 0; ty < 2; ty++) {
      for (let tx = 0; tx < 2; tx++) {
        const tone = 0.95 + rand() * 0.08;
        g.fillStyle = `rgb(${Math.round(206 * tone)}, ${Math.round(212 * tone)}, ${Math.round(207 * tone)})`;
        g.fillRect(tx * 256, ty * 256, 256, 256);
        for (let k = 0; k < 9; k++) { // soft clouds and veins
          g.fillStyle = `rgba(${rand() < 0.5 ? '170, 180, 176' : '232, 236, 232'}, ${0.18 + rand() * 0.2})`;
          g.beginPath();
          g.ellipse(tx * 256 + rand() * 256, ty * 256 + rand() * 256, 30 + rand() * 90, 8 + rand() * 20, rand() * 3, 0, Math.PI * 2);
          g.fill();
        }
        g.fillStyle = 'rgba(150, 156, 152, 0.7)'; // the joints
        g.fillRect(tx * 256, ty * 256, 256, 2);
        g.fillRect(tx * 256, ty * 256, 2, 256);
      }
    }
  }, [repeatX, repeatY]);
}

// the floor: dark slate tiles, 60 cm, faintly mottled
function slateTex(repeatX, repeatY) {
  return canvasTex(256, 256, (g) => {
    const rand = seeded(7);
    for (let ty = 0; ty < 2; ty++) {
      for (let tx = 0; tx < 2; tx++) {
        const tone = 0.9 + rand() * 0.15;
        g.fillStyle = `rgb(${Math.round(62 * tone)}, ${Math.round(68 * tone)}, ${Math.round(70 * tone)})`;
        g.fillRect(tx * 128, ty * 128, 128, 128);
        for (let k = 0; k < 120; k++) {
          g.fillStyle = rand() < 0.5 ? 'rgba(90, 98, 100, 0.25)' : 'rgba(40, 44, 46, 0.25)';
          g.fillRect(tx * 128 + rand() * 128, ty * 128 + rand() * 128, 2 + rand() * 6, 1 + rand() * 3);
        }
        g.fillStyle = 'rgba(25, 28, 30, 0.9)';
        g.fillRect(tx * 128, ty * 128, 128, 2);
        g.fillRect(tx * 128, ty * 128, 2, 128);
      }
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

// the view out of the big window: a bright sky, the sea far off, palms and broad green leaves close by
function viewTex() {
  return canvasTex(512, 384, (g, w, h) => {
    const sky = g.createLinearGradient(0, 0, 0, h * 0.55);
    sky.addColorStop(0, '#8cc6ec');
    sky.addColorStop(1, '#d9eef8');
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#3f9cc4'; // the sea
    g.fillRect(0, h * 0.5, w, h * 0.08);
    const rand = seeded(23);
    const leaf = (x, y, len, a, c) => {
      g.fillStyle = c;
      g.beginPath();
      g.ellipse(x + Math.cos(a) * len * 0.5, y + Math.sin(a) * len * 0.5, len * 0.5, len * 0.12, a, 0, Math.PI * 2);
      g.fill();
    };
    for (const [px, top] of [[90, 60], [400, 40], [300, 110]]) {
      g.strokeStyle = '#6b5a44';
      g.lineWidth = 10;
      g.beginPath();
      g.moveTo(px + 30, h);
      g.quadraticCurveTo(px + 10, h * 0.6, px, top);
      g.stroke();
      for (let k = 0; k < 10; k++) leaf(px, top, 70 + rand() * 40, (k / 10) * Math.PI * 2, k % 2 ? '#3f7d3a' : '#4f9447');
    }
    for (let k = 0; k < 40; k++) leaf(rand() * w, h * 0.62 + rand() * h * 0.4, 50 + rand() * 60, -Math.PI / 2 + (rand() - 0.5) * 2.2, ['#2f6b34', '#4a8d42', '#5fa451'][k % 3]);
  });
}

// wooden slats (tinted for the door); the canvas is 60 cm wide
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
  const teak = lambert('#ffffff', { map: teakTex(1, 1) });
  const brass = phong('#c9a15a', { shininess: 90, specular: '#fff1c8' });
  const blackMetal = phong('#2a2a2a', { shininess: 40 });
  const stoneBowl = phong('#8a8e8c', { shininess: 30 }); // grey stone, like the basins and the tub's outside
  const towel = lambert('#f7f5f0');

  // ---------- floor, walls, ceiling: a closed box, so the camera is always inside ----------
  const depth = D + FRONT;
  const midZ = (FRONT - D) / 2;
  const floor = add(new THREE.PlaneGeometry(W, depth), lambert('#ffffff', { map: slateTex(W / 1.2, depth / 1.2) }), 0, 0, midZ, { cast: false });
  floor.rotation.x = -Math.PI / 2;
  const wall = (w, rotY, x, z) => {
    const panel = add(new THREE.PlaneGeometry(w, H), phong('#ffffff', { map: stoneTex(w / 1.2, H / 1.2), shininess: 20, specular: '#222222' }), x, H / 2, z, { cast: false });
    panel.rotation.y = rotY;
  };
  wall(W, 0, 0, -D);                       // back
  wall(depth, Math.PI / 2, -W / 2, midZ);  // left
  wall(depth, -Math.PI / 2, W / 2, midZ);  // right
  wall(W, Math.PI, 0, FRONT);              // front, behind the camera

  // the ceiling: plain white, a skylight over the middle, little round downlights
  const SKY = { hw: 0.7, hd: 0.7, z: -1.0, well: 0.3 };
  const ceilingMat = lambert('#f7f5f1', { map: plasterTex(W / 1.2, depth / 1.2) });
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
  for (const z of [SKY.z - SKY.hd, SKY.z + SKY.hd]) box(SKY.hw * 2 + 0.1, 0.06, 0.06, teak, 0, H - 0.03, z, { cast: false });
  for (const x of [-SKY.hw, SKY.hw]) box(0.06, 0.06, SKY.hd * 2 + 0.1, teak, x, H - 0.03, SKY.z, { cast: false });
  const pane = add(new THREE.PlaneGeometry(SKY.hw * 2, SKY.hd * 2), new THREE.MeshBasicMaterial({ color: '#dff0fa', transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide }), 0, H + SKY.well, SKY.z, { cast: false, receive: false });
  pane.rotation.x = Math.PI / 2;
  const cove = glow('#fff1d6'); // the downlights' glow
  for (const [x, z] of [[-1.2, -2.8], [1.2, -2.8], [-1.2, 0.6], [1.2, 0.6], [0, 1.0], [0, -3.0]]) {
    const d = add(new THREE.CircleGeometry(0.05, 16), cove, x, H - 0.005, z, { cast: false, receive: false });
    d.rotation.x = Math.PI / 2;
  }

  // ---------- the toilet against the back wall, before a panel of teak slats with a shelf ----------
  const porcelain = phong('#fbfaf6', { shininess: 80 });
  const tx = TOILET.x;
  const tz = TOILET.z;
  for (let k = 0; k < 9; k++) box(0.1, 2.3, 0.03, teak, tx - 0.48 + k * 0.12, 1.15, -D + 0.02, { cast: false }); // the slats
  box(1.1, 0.04, 0.22, teak, tx, 1.5, -D + 0.12); // a teak shelf
  cyl(0.06, 0.05, 0.12, stoneBowl, tx - 0.32, 1.58, -D + 0.12, 16); // a stone pot with an orchid
  for (let k = 0; k < 3; k++) {
    const stem = cyl(0.006, 0.006, 0.36, lambert('#4f7a3a'), tx - 0.32 + (k - 1) * 0.03, 1.8, -D + 0.12, 6);
    stem.rotation.z = (k - 1) * 0.2;
    add(new THREE.SphereGeometry(0.035, 10, 8), lambert('#f6f0f4'), tx - 0.32 + (k - 1) * 0.08, 1.97 - Math.abs(k - 1) * 0.04, -D + 0.14);
  }
  box(0.18, 0.1, 0.12, lambert('#c9a77a'), tx + 0.3, 1.57, -D + 0.12); // a woven basket
  box(0.5, 0.36, 0.18, porcelain, tx, 0.66, tz - 0.2); // a slim cistern
  cyl(0.2, 0.17, 0.38, porcelain, tx, 0.19, tz + 0.08);
  cyl(0.23, 0.23, 0.05, porcelain, tx, 0.42, tz + 0.12);
  box(0.1, 0.02, 0.05, brass, tx, 0.85, tz - 0.2); // a brass flush plate
  const roll = cyl(0.06, 0.06, 0.11, lambert('#ffffff'), tx - 0.5, 0.72, tz + 0.15, 20);
  roll.rotation.z = Math.PI / 2;
  box(0.16, 0.02, 0.02, brass, tx - 0.5, 0.79, tz + 0.15);
  // a little teak side table with a magazine
  cyl(0.2, 0.2, 0.03, teak, tx + 0.65, 0.55, tz + 0.1);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    cyl(0.018, 0.018, 0.54, teak, tx + 0.65 + Math.cos(a) * 0.12, 0.27, tz + 0.1 + Math.sin(a) * 0.12, 6);
  }
  const mag = box(0.28, 0.012, 0.2, lambert('#ffffff', { map: magazineTex() }), tx + 0.65, 0.572, tz + 0.1);
  mag.rotation.y = -0.3;
  block(tx, tz, 0.6, 0.9);
  block(tx + 0.65, tz + 0.1, 0.45, 0.45);

  // ---------- the vanity along the right wall: teak, a stone top, an open slatted shelf of rolled towels,
  // two grey stone vessel basins, two mirrors in black frames and brass sconces ----------
  const vz = -1.1; // its middle
  const vx = W / 2 - 0.3;
  box(0.56, 0.06, 1.8, phong('#d8cdbb', { shininess: 30 }), vx, 0.84, vz); // the stone top
  box(0.52, 0.12, 1.76, teak, vx, 0.75, vz); // the apron
  for (const z of [vz - 0.85, vz, vz + 0.85]) for (const x of [vx - 0.23, vx + 0.23]) box(0.06, 0.7, 0.06, teak, x, 0.35, z); // legs
  for (let k = 0; k < 7; k++) box(0.5, 0.025, 0.2, teak, vx, 0.18, vz - 0.75 + k * 0.25); // the slatted shelf
  for (let k = 0; k < 4; k++) {
    const r = cyl(0.07, 0.07, 0.36, towel, vx, 0.27, vz - 0.6 + k * 0.4, 16); // rolled towels
    r.rotation.x = Math.PI / 2;
  }
  const basins = [vz - 0.45, vz + 0.45];
  const ringMat = glow('#ffd79a'); // the sconces' glow
  for (const z of basins) {
    add(new THREE.SphereGeometry(0.2, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), stoneBowl, vx - 0.02, 1.05, z); // the bowl
    add(new THREE.CircleGeometry(0.18, 24).rotateX(-Math.PI / 2), phong('#b9bfbd'), vx - 0.02, 1.0, z, { cast: false }); // its inside
    const spout = cyl(0.012, 0.012, 0.2, brass, W / 2 - 0.08, 1.2, z, 10);
    spout.rotation.z = Math.PI / 2;
    box(0.03, 0.72, 0.5, blackMetal, W / 2 - 0.02, 1.85, z); // the mirror's frame
    box(0.01, 0.66, 0.44, phong('#cfe0e6', { shininess: 150, specular: '#ffffff', emissive: '#28343a' }), W / 2 - 0.04, 1.85, z, { cast: false });
  }
  for (const z of [vz - 0.9, vz, vz + 0.9]) { // brass sconces beside and between the mirrors
    box(0.05, 0.05, 0.05, brass, W / 2 - 0.04, 1.95, z);
    cyl(0.045, 0.045, 0.14, ringMat, W / 2 - 0.1, 1.95, z, 16, { cast: false });
  }
  const mirrorLight = new THREE.PointLight('#ffd9a8', 1.2, 3, 1.6);
  mirrorLight.position.set(W / 2 - 0.4, 1.8, vz);
  group.add(mirrorLight);
  block(vx, vz, 0.6, 1.85);

  // ---------- the tall window on the left wall: the garden and the sea outside, teak louvres across the top,
  // and a freestanding stone tub in front of it with a teak towel ladder ----------
  const windowMat = new THREE.MeshBasicMaterial({ color: '#ffffff', map: viewTex() });
  const wz = -1.75;
  const ww = 2.3;
  const glass = add(new THREE.PlaneGeometry(ww, 2.3), windowMat, -W / 2 + 0.01, 1.5, wz, { cast: false, receive: false });
  glass.rotation.y = Math.PI / 2;
  for (const z of [wz - ww / 2, wz + ww / 2]) box(0.1, 2.45, 0.1, teak, -W / 2 + 0.04, 1.5, z); // the frame
  for (const y of [0.32, 2.68]) box(0.1, 0.1, ww + 0.1, teak, -W / 2 + 0.04, y, wz);
  box(0.08, 2.3, 0.05, teak, -W / 2 + 0.04, 1.5, wz); // a mullion
  for (let k = 0; k < 11; k++) { // louvres, tilted, across the top
    const slat = box(0.12, 0.012, ww - 0.1, teak, -W / 2 + 0.09, 2.6 - k * 0.075, wz, { cast: false });
    slat.rotation.z = 0.5;
  }
  // the tub: an oval stone bowl, white inside, water in it
  const tubAt = { x: -W / 2 + 0.75, z: wz };
  const tub = add(new THREE.CylinderGeometry(0.5, 0.42, 0.55, 40), phong('#eceae4', { shininess: 40 }), tubAt.x, 0.28, tubAt.z);
  tub.scale.z = 1.75;
  const water = add(new THREE.CircleGeometry(0.44, 40).rotateX(-Math.PI / 2), phong('#a9d4dc', { shininess: 120, transparent: true, opacity: 0.85 }), tubAt.x, 0.5, tubAt.z, { cast: false });
  water.scale.z = 1.75;
  const filler = cyl(0.02, 0.02, 0.9, brass, tubAt.x + 0.55, 0.45, tubAt.z - 0.7, 10); // a standing brass filler
  box(0.2, 0.03, 0.03, brass, tubAt.x + 0.47, 0.88, tubAt.z - 0.7);
  filler.castShadow = false;
  block(tubAt.x, tubAt.z, 1.05, 1.8);
  // the towel ladder, leaning by the window's end
  const lx = -W / 2 + 0.3;
  const lz = wz + ww / 2 + 0.35;
  for (const dz of [-0.25, 0.25]) {
    const rail = box(0.05, 1.6, 0.05, teak, lx, 0.8, lz + dz);
    rail.rotation.z = -0.12;
  }
  for (const y of [0.45, 0.85, 1.25]) box(0.04, 0.04, 0.55, teak, lx + y * 0.12 - 0.1, y, lz);
  box(0.05, 0.45, 0.45, towel, lx + 0.02, 0.92, lz);
  block(lx, lz, 0.35, 0.6);
  // a big tropical plant in a stone pot in the back left corner, broad leaves on long stems
  const plantAt = { x: -W / 2 + 0.4, z: -D + 0.4 };
  cyl(0.24, 0.2, 0.45, stoneBowl, plantAt.x, 0.225, plantAt.z, 24);
  const leafMat = lambert('#3f7d3a', { side: THREE.DoubleSide });
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2;
    const h = 1.0 + (k % 3) * 0.3;
    const stem = cyl(0.012, 0.015, h, lambert('#5d7f3a'), plantAt.x + Math.cos(a) * 0.08, 0.45 + h / 2, plantAt.z + Math.sin(a) * 0.08, 6);
    stem.rotation.set(Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25);
    const leaf = add(new THREE.SphereGeometry(0.2, 12, 8), leafMat, plantAt.x + Math.cos(a) * (0.08 + h * 0.25), 0.45 + h * 0.97, plantAt.z + Math.sin(a) * (0.08 + h * 0.25));
    leaf.scale.set(0.45, 0.06, 1.3);
    leaf.rotation.set(0.5, -a, 0.3);
  }
  block(plantAt.x, plantAt.z, 0.5, 0.5);

  // ---------- the door out, in the left wall near the front: dark teak, a brass handle ----------
  const doorZ = 0.95;
  const doorWood = lambert('#4a3424', { map: slatTex(1) });
  box(0.06, 2.15, 0.94, doorWood, -W / 2 + 0.03, 1.075, doorZ);
  for (const z of [doorZ - 0.5, doorZ + 0.5]) box(0.08, 2.25, 0.07, teak, -W / 2 + 0.04, 1.125, z); // the frame
  box(0.08, 0.07, 1.07, teak, -W / 2 + 0.04, 2.215, doorZ);
  const handle = cyl(0.014, 0.014, 0.16, brass, -W / 2 + 0.1, 1.0, doorZ - 0.33, 10);
  handle.rotation.x = Math.PI / 2;
  cyl(0.03, 0.03, 0.03, brass, -W / 2 + 0.075, 1.0, doorZ - 0.38, 14).rotation.z = Math.PI / 2;

  // ---------- a rattan stool in the back corner, to sit and rest on (facing into the room) ----------
  const stoolAt = { x: 0.85, z: -2.9 };
  const seatTop = 0.46;
  const rattan = lambert('#c9a46e');
  cyl(0.22, 0.25, seatTop, rattan, stoolAt.x, seatTop / 2, stoolAt.z, 24); // a woven drum
  for (let k = 0; k < 5; k++) cyl(0.252, 0.252, 0.012, lambert('#a9844f'), stoolAt.x, 0.06 + k * 0.09, stoolAt.z, 24, { cast: false }); // the weave's bands
  cyl(0.23, 0.23, 0.04, towel, stoolAt.x, seatTop + 0.01, stoolAt.z, 24); // a linen cushion
  block(stoolAt.x, stoolAt.z, 0.5, 0.5);

  // ---------- a teak daybed along the right wall by the front, white cushions ----------
  const sofaAt = { x: W / 2 - 0.42, z: 1.0 };
  const linen = lambert('#f1ede4');
  box(0.75, 0.3, 1.3, teak, sofaAt.x, 0.15, sofaAt.z); // the frame
  box(0.66, 0.12, 1.2, linen, sofaAt.x - 0.03, 0.36, sofaAt.z); // the mattress
  box(0.16, 0.5, 1.2, linen, W / 2 - 0.12, 0.62, sofaAt.z); // the back cushion
  for (const s of [-1, 1]) box(0.75, 0.42, 0.08, teak, sofaAt.x, 0.39, sofaAt.z + s * 0.62); // teak arms
  for (const [dz, c, tilt] of [[-0.33, '#c9a46e', 0.25], [0.33, '#7d8b6a', -0.2]]) {
    const pillow = box(0.12, 0.32, 0.32, lambert(c), W / 2 - 0.27, 0.56, sofaAt.z + dz);
    pillow.rotation.set(tilt, 0, 0.18);
  }
  block(sofaAt.x, sofaAt.z, 0.8, 1.35);

  // ---------- a rattan pendant over the tub, glowing warm ----------
  const flX = tubAt.x + 0.2;
  const flZ = tubAt.z;
  cyl(0.006, 0.006, 0.8, blackMetal, flX, H - 0.4, flZ, 6, { cast: false });
  const shadeMat = new THREE.MeshLambertMaterial({ color: '#d6b07a', emissive: '#ffb860', emissiveIntensity: 0.6, side: THREE.DoubleSide });
  add(new THREE.SphereGeometry(0.28, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), shadeMat, flX, H - 0.95, flZ, { cast: false });
  const floorLight = new THREE.PointLight('#ffc78a', 1.1, 5, 1.5);
  floorLight.position.set(flX, H - 1.1, flZ);
  group.add(floorLight);

  // ---------- light: bright and warm, daylight from the window and a fill from behind the camera ----------
  const lamp = new THREE.PointLight('#ffe9cc', 4.6, 11, 1.3);
  lamp.position.set(0, H - 0.5, -1.4);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(512, 512);
  lamp.shadow.bias = -0.004;
  group.add(lamp);
  const fill = new THREE.PointLight('#f4f8ff', 1.6, 8, 1.2);
  fill.position.set(0, 2.0, FRONT - 0.4);
  group.add(fill);
  const daylight = new THREE.PointLight('#eaf6ff', 1.4, 5, 1.4); // through the big window
  daylight.position.set(-W / 2 + 0.6, 1.8, wz);
  group.add(daylight);

  // the lighting moods: warm (as it is), dim (low and cosy), party (the colours go round); dancing brings the party
  const lights = [[lamp, 4.6], [fill, 1.6], [mirrorLight, 1.2], [floorLight, 1.1], [daylight, 1.4]];
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
    // places to sit and rest: where the hips go, which way you face, where you get up to, and how near counts as by it
    seats: [
      { label: '스툴에 앉기', at: new THREE.Vector3(stoolAt.x, seatTop - HIP_Y, stoolAt.z), turn: 0, up: { x: stoolAt.x, z: stoolAt.z + 0.55 }, near: 0.95 },
      { label: '소파에 앉기', at: new THREE.Vector3(W / 2 - 0.55, 0.45 - HIP_Y, sofaAt.z), turn: -Math.PI / 2, up: { x: W / 2 - 1.15, z: sofaAt.z }, near: 1.25 },
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
    door: { x: -W / 2, z: doorZ, half: 0.42 }, // walk into it and you're out (local)
    entry: { x: -W / 2 + 0.75, z: doorZ, turn: Math.PI / 2 }, // where you stand on coming in, facing into the room (local)
    bounds: { x0: -W / 2 + 0.3, x1: W / 2 - 0.3, z0: -D + 0.3, z1: FRONT - 0.35 }, // where you can walk
    aim: new THREE.Vector3(0.1, 0, -2.4),               // what the camera looks at, sitting down (local)
    bowl: new THREE.Vector3(tx, 0.6, tz + 0.1),         // where a poop leaves from (local)
    head: new THREE.Vector3(tx, 1.5, tz + 0.3),         // over the sitter's head (local)
    knock: new THREE.Vector3(0.6, 1.6, -1.6),           // where a knock on the door shows (local)
    washSpot: new THREE.Vector3(vx - 0.62, 0, basins[0]), // where you stand to wash, facing the basin (local)
    standSpot: new THREE.Vector3(tx + 0.4, 0, tz + 1.0), // getting up, just in front of the toilet (local)
    tap: new THREE.Vector3(W / 2 - 0.16, 1.18, basins[0]), // the water falls from here into the basin (local)
  };
}
