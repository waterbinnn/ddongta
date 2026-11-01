// The private toilet room inside the premium restroom (프리미엄 화장실). There is only one: whoever goes in sees their
// own room, and nobody else's. A bathroom in the manner of Aman's: warm cream lime walls, a speckled terrazzo floor,
// a ceiling of light teak battens with a skylight, the whole left wall clear glass onto a walled back garden (built
// right outside it, so it moves as you look); a low light teak vanity against a sage marble wall, the toilet behind a
// slatted screen, a daybed and a rattan stool that both face the window, a plant, and the door out. The room is
// closed on the other sides so the camera sits inside it.
import * as THREE from '/vendor/three.module.js';

export const ROOM = { W: 5.6, D: 4.4, FRONT: 1.7, H: 3.0 }; // width, depth to the back wall, room in front of the origin, height
const SCREEN_X = 0.55; // the slatted screen that closes off the toilet's corner
const TOILET = { x: (SCREEN_X + ROOM.W / 2) / 2, z: -ROOM.D + 0.45 }; // in the middle of its own wide corner, plenty of floor before it
const WIN = { z: -1.6, w: 4.2 }; // the glass along the left wall: its middle and its length

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

// pale sage marble, softly veined (the feature wall)
function greenMarbleTex(repeatX, repeatY) {
  return canvasTex(256, 256, (g) => {
    const rand = seeded(61);
    g.fillStyle = '#b4c6b6';
    g.fillRect(0, 0, 256, 256);
    for (let k = 0; k < 14; k++) {
      g.strokeStyle = `rgba(${rand() < 0.5 ? '240, 246, 240' : '120, 146, 128'}, ${0.25 + rand() * 0.35})`;
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
    g.fillStyle = '#c99862';
    g.fillRect(0, 0, 128, 256);
    for (let k = 0; k < 40; k++) {
      g.strokeStyle = `rgba(${rand() < 0.5 ? '160, 112, 70' : '222, 182, 132'}, ${0.25 + rand() * 0.3})`;
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
  const wood = lambert('#f4e4cc', { map: teakTex(1, 1) }); // light honey teak, for the frames, battens and furniture
  const teak = lambert('#ffffff', { map: teakTex(1, 1) });
  const brass = phong('#c9a15a', { shininess: 90, specular: '#fff1c8' });
  const greenMarble = (rx, ry) => phong('#ffffff', { map: greenMarbleTex(rx, ry), shininess: 70, specular: '#ffffff' });
  const stoneBowl = phong('#d9d2c4', { shininess: 30 }); // pale honed stone basins
  const linen = lambert('#f6f2ea');

  // ---------- floor, walls, ceiling: a closed box, so the camera is always inside ----------
  const depth = D + FRONT;
  const midZ = (FRONT - D) / 2;
  const floor = add(new THREE.PlaneGeometry(W, depth), phong('#ffffff', { map: terrazzoTex(W / 1.0, depth / 1.0), shininess: 25 }), 0, 0, midZ, { cast: false });
  floor.rotation.x = -Math.PI / 2;
  const lime = (w) => lambert('#ffffff', { map: limeTex(w / 1.6, H / 1.6) });
  // (the walls and ceiling cast shadows, so the garden's sun comes in only through the glass and the skylight)
  const wall = (w, rotY, x, z, material) => {
    const panel = add(new THREE.PlaneGeometry(w, H), material ?? lime(w), x, H / 2, z);
    panel.rotation.y = rotY;
    return panel;
  };
  wall(W, 0, 0, -D);                       // back
  // the left wall is mostly glass (below): solid only either side of it
  for (const [z0, z1] of [[-D, WIN.z - WIN.w / 2], [WIN.z + WIN.w / 2, FRONT]]) wall(z1 - z0, Math.PI / 2, -W / 2, (z0 + z1) / 2, lime(z1 - z0));
  wall(depth, -Math.PI / 2, W / 2, midZ);  // right
  wall(W, Math.PI, 0, FRONT);              // front, behind the camera
  for (const x of [-W / 2 + 0.02, W / 2 - 0.02]) box(0.04, 0.08, depth, wood, x, 0.04, midZ, { cast: false }); // teak skirting
  for (const z of [-D + 0.02, FRONT - 0.02]) box(W, 0.08, 0.04, wood, 0, 0.04, z, { cast: false });

  // no ceiling: the room is open to the sky, the walls finished along the top with a thick teak cap
  // (each wall's cap and whatever hangs on it, by side: when the camera stands back outside a wall to look in, the
  // page hides that wall's things, since the wall itself doesn't show from outside)
  const sides = { back: [], front: [], left: [], right: [] };
  for (const [side, w, d, x, z] of [['back', W + 0.24, 0.24, 0, -D - 0.1], ['front', W + 0.24, 0.24, 0, FRONT + 0.1], ['left', 0.24, depth + 0.2, -W / 2 - 0.1, midZ], ['right', 0.24, depth + 0.2, W / 2 + 0.1, midZ]]) {
    sides[side].push(box(w, 0.14, d, wood, x, H + 0.07, z));
  }
  const cove = glow('#fff1d6'); // (the lighting moods still tint it)

  // ---------- the left wall: glass, floor to ceiling, onto the back garden, in light teak frames ----------
  const windowMat = new THREE.MeshBasicMaterial({ color: '#e8f4fa', transparent: true, opacity: 0.06, depthWrite: false }); // clear glass
  const wz = WIN.z;
  const ww = WIN.w;
  const glass = add(new THREE.PlaneGeometry(ww, H - 0.3), windowMat, -W / 2 + 0.01, (H - 0.3) / 2 + 0.12, wz, { cast: false, receive: false });
  glass.rotation.y = Math.PI / 2;
  for (const z of [wz - ww / 2, wz - ww / 6, wz + ww / 6, wz + ww / 2]) box(0.1, H - 0.1, 0.08, wood, -W / 2 + 0.04, H / 2, z); // mullions
  box(0.1, 0.1, ww + 0.08, wood, -W / 2 + 0.04, 0.1, wz);
  box(0.1, 0.12, ww + 0.08, wood, -W / 2 + 0.04, H - 0.14, wz);
  box(0.1, 0.1, ww + 0.08, wood, -W / 2 + 0.04, H - 0.05, wz); // closing the gap up to the ceiling
  // a soft warm light by the window (nothing stands before the glass, so the garden fills it)
  const floorLight = new THREE.PointLight('#ffc78a', 1.1, 5, 1.5);
  floorLight.position.set(-W / 2 + 0.9, H - 1.15, wz);
  group.add(floorLight);

  // ---------- the back wall: a sage marble feature wall behind a low floating vanity in light teak,
  // two pale stone basins at a height little hands can reach, brass taps, two mirrors in brass, sconces ----------
  const vx = -1.0; // the vanity's middle
  const vz = -D + 0.27;
  const VTOP = 0.42; // the counter, low (everyone here is about a metre tall)
  wall(2.0, 0, vx, -D + 0.01, greenMarble(2, 2.4));
  box(1.9, 0.08, 0.5, phong('#e9e1d2', { shininess: 40 }), vx, VTOP, vz); // the stone top
  box(1.84, 0.22, 0.46, wood, vx, VTOP - 0.15, vz); // the drawer below it
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

  // ---------- the toilet in the back right corner, its own wide corner behind a slatted light teak screen, a shelf
  // over it and a rug before it ----------
  const porcelain = phong('#fbfaf6', { shininess: 80 });
  const tx = TOILET.x;
  const tz = TOILET.z;
  // the screen stands well off from it, so the toilet has a whole corner of the room to itself
  for (let k = 0; k < 11; k++) box(0.04, 2.1, 0.07, wood, SCREEN_X, 1.05, -D + 0.08 + k * 0.12); // the screen
  block(SCREEN_X, -D + 0.66, 0.12, 1.32);
  // a round woven rug on the floor before the toilet
  const rug = add(new THREE.CircleGeometry(0.6, 40), lambert('#d9c39a'), tx, 0.004, tz + 1.0, { cast: false });
  rug.rotation.x = -Math.PI / 2;
  const rugRim = add(new THREE.RingGeometry(0.52, 0.56, 40), lambert('#b99a68'), tx, 0.005, tz + 1.0, { cast: false });
  rugRim.rotation.x = -Math.PI / 2;
  box(0.9, 0.04, 0.22, wood, tx, 1.4, -D + 0.12); // a shelf
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
  // the paper on a slim brass stand beside it
  const rollX = tx + 0.42;
  cyl(0.012, 0.012, 0.7, brass, rollX, 0.35, tz + 0.05, 8);
  cyl(0.09, 0.09, 0.015, brass, rollX, 0.008, tz + 0.05, 20);
  const roll = cyl(0.06, 0.06, 0.11, lambert('#ffffff'), rollX + 0.06, 0.6, tz + 0.05, 20);
  roll.rotation.z = Math.PI / 2;
  block(rollX, tz + 0.05, 0.2, 0.2);
  block(tx, tz, 0.6, 0.9);

  // ---------- the door out, at the front of the right wall: light teak slats, a brass pull ----------
  const doorZ = 0.95;
  sides.right.push(box(0.06, 2.15, 0.94, wood, W / 2 - 0.03, 1.075, doorZ));
  for (let k = 0; k < 8; k++) sides.right.push(box(0.012, 2.05, 0.06, lambert('#b98a5a'), W / 2 - 0.065, 1.075, doorZ - 0.4 + k * 0.115, { cast: false }));
  for (const z of [doorZ - 0.5, doorZ + 0.5]) sides.right.push(box(0.08, 2.25, 0.07, wood, W / 2 - 0.04, 1.125, z)); // the frame
  sides.right.push(box(0.08, 0.07, 1.07, wood, W / 2 - 0.04, 2.215, doorZ));
  sides.right.push(box(0.03, 0.4, 0.03, brass, W / 2 - 0.09, 1.0, doorZ + 0.32)); // a long brass pull

  // ---------- a daybed right before the window, facing out onto the garden, white linen, a cushion or two ----------
  const sofaAt = { x: -W / 2 + 1.2, z: WIN.z };
  box(0.8, 0.28, 1.5, wood, sofaAt.x, 0.14, sofaAt.z); // the frame
  box(0.74, 0.12, 1.42, linen, sofaAt.x, 0.34, sofaAt.z); // the mattress
  box(0.16, 0.42, 1.42, linen, sofaAt.x + 0.32, 0.6, sofaAt.z); // the back cushion, on the side away from the window
  box(0.08, 0.5, 1.5, wood, sofaAt.x + 0.4, 0.45, sofaAt.z); // its timber back
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

  // ---------- a plant by the vanity ----------
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
  plant(vx - 1.2, -D + 0.35, 0.8);
  plant(W / 2 - 0.3, -D + 0.3, 0.9); // and one in the toilet's back corner, out of the way

  // ---------- the little things that make it a room: rugs, a side table, a towel ladder, a floor lamp, a picture ----------
  // a big woven rug over all the open floor, from beside the daybed to the door and up to the toilet's corner,
  // cream with a warm border
  const rugX = [sofaAt.x + 0.65, W / 2 - 0.35];
  const rugZ = [tz + 1.65, FRONT - 0.35];
  const [rw, rd] = [rugX[1] - rugX[0], rugZ[1] - rugZ[0]];
  const [rx, rz] = [(rugX[0] + rugX[1]) / 2, (rugZ[0] + rugZ[1]) / 2];
  const bigRug = add(new THREE.PlaneGeometry(rw - 0.2, rd - 0.2), lambert('#efe2c8'), rx, 0.004, rz, { cast: false });
  bigRug.rotation.x = -Math.PI / 2;
  const rugBorder = add(new THREE.PlaneGeometry(rw, rd), lambert('#c9a46e'), rx, 0.003, rz, { cast: false });
  rugBorder.rotation.x = -Math.PI / 2;
  // a round teak side table by the daybed: a candle in a glass, a little stack of books, a cup of tea
  const sideX = sofaAt.x;
  const sideZ = sofaAt.z + 1.05;
  cyl(0.24, 0.24, 0.04, wood, sideX, 0.46, sideZ, 28);
  cyl(0.03, 0.05, 0.44, wood, sideX, 0.22, sideZ, 10);
  cyl(0.14, 0.16, 0.02, wood, sideX, 0.01, sideZ, 20);
  cyl(0.035, 0.035, 0.08, new THREE.MeshLambertMaterial({ color: '#fff3d6', emissive: '#ffb860', emissiveIntensity: 0.5 }), sideX - 0.09, 0.52, sideZ - 0.05, 12); // the candle
  for (const [k, c] of [[0, '#7d8b6a'], [1, '#c9a46e'], [2, '#f3ece0']]) box(0.17 - k * 0.01, 0.03, 0.12, lambert(c), sideX + 0.06, 0.495 + k * 0.03, sideZ + 0.04);
  cyl(0.035, 0.03, 0.05, porcelain, sideX - 0.05, 0.505, sideZ + 0.1, 12); // tea
  block(sideX, sideZ, 0.5, 0.5);
  // a floor lamp in the front corner by the window, beside the stool: a slim brass stem, a linen shade glowing warm
  const lampX = -W / 2 + 0.35;
  const lampZ = FRONT - 0.3;
  cyl(0.012, 0.012, 1.45, brass, lampX, 0.73, lampZ, 8);
  cyl(0.12, 0.12, 0.02, brass, lampX, 0.01, lampZ, 20);
  const shade = new THREE.MeshLambertMaterial({ color: '#f3e6cc', emissive: '#ffcf8a', emissiveIntensity: 0.45, side: THREE.DoubleSide });
  add(new THREE.CylinderGeometry(0.16, 0.22, 0.28, 24, 1, true), shade, lampX, 1.5, lampZ, { cast: false });
  block(lampX, lampZ, 0.35, 0.35);
  // a teak towel ladder against the back wall, between the vanity and the screen, white towels over its rungs
  const ladX = (vx + 0.975 + SCREEN_X) / 2;
  for (const dx of [-0.17, 0.17]) {
    const rail = box(0.035, 1.6, 0.035, wood, ladX + dx, 0.78, -D + 0.2);
    rail.rotation.x = -0.12;
  }
  for (let k = 0; k < 4; k++) box(0.34, 0.025, 0.025, wood, ladX, 0.35 + k * 0.36, -D + 0.25 - k * 0.043);
  box(0.3, 0.32, 0.03, lambert('#fbf8f2'), ladX, 0.9, -D + 0.17);
  box(0.3, 0.26, 0.03, lambert('#e9dcc6'), ladX, 1.25, -D + 0.13);
  block(ladX, -D + 0.2, 0.45, 0.3);
  // by the toilet, a little teak stool with a stack of magazines and a scented candle
  const nsX = tx - 0.6;
  box(0.32, 0.32, 0.3, wood, nsX, 0.16, tz + 0.05);
  for (const [k, c] of [[0, '#e5484d'], [1, '#2f80c8'], [2, '#ffe28a']]) {
    const mag = box(0.2, 0.012, 0.26, lambert(c), nsX, 0.33 + k * 0.013, tz + 0.05);
    mag.rotation.y = (k - 1) * 0.15;
  }
  block(nsX, tz + 0.05, 0.36, 0.34);
  // a picture on the right wall: soft round shapes in garden colours, in a thin teak frame
  const art = canvasTex(256, 320, (g) => {
    g.fillStyle = '#f6efe2';
    g.fillRect(0, 0, 256, 320);
    for (const [x, y, r, c] of [[90, 120, 70, '#c9a46e'], [170, 190, 60, '#9fb89a'], [110, 230, 40, '#e9b8a0'], [185, 95, 28, '#d8cfbf']]) {
      g.fillStyle = c;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
  });
  const artZ = (doorZ - 0.5 + tz + 1.4) / 2;
  sides.right.push(box(0.04, 1.06, 0.86, wood, W / 2 - 0.03, 1.5, artZ));
  const canvasArt = add(new THREE.PlaneGeometry(0.78, 0.98), lambert('#ffffff', { map: art }), W / 2 - 0.055, 1.5, artZ, { cast: false });
  canvasArt.rotation.y = -Math.PI / 2;
  sides.right.push(canvasArt);

  // ---------- the garden outside the glass: real, right there, so it shifts as you look round ----------
  // a lawn, a stone step, a lotus pond, banana plants and bird-of-paradise, opening out onto tall trees and the sky. Nobody comes here but a few animals (placed by the page: see `outside.animals`).
  const OX = -W / 2; // the glass
  const outside = new THREE.Group();
  group.add(outside);
  const put = (geo, material, x, y, z, { cast = true, receive = true } = {}) => add(geo, material, x, y, z, { cast, receive, parent: outside });
  const lawn = put(new THREE.PlaneGeometry(60, 60), lambert('#8cbf66'), OX - 4, -0.02, wz, { cast: false }); // (all round: the room is open above, so you see over its walls)
  lawn.rotation.x = -Math.PI / 2;
  put(new THREE.BoxGeometry(0.9, 0.06, ww + 0.8), lambert('#ddd5c6'), OX - 0.45, 0.03, wz); // a stone step out
  // the lotus pond
  const pond = { x: OX - 2.8, z: wz - 0.3 };
  const pondRim = put(new THREE.CylinderGeometry(1.7, 1.75, 0.12, 40), lambert('#d8cfbf'), pond.x, 0.06, pond.z);
  pondRim.scale.x = 0.62;
  const pondWater = put(new THREE.CylinderGeometry(1.56, 1.56, 0.02, 40), phong('#5fa7a8', { shininess: 120, specular: '#ffffff' }), pond.x, 0.12, pond.z, { cast: false });
  pondWater.scale.x = 0.62;
  const padMat = lambert('#5f9a4c');
  const lotus = lambert('#f3a7c0');
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + 0.4;
    const d = 0.4 + (k % 3) * 0.32;
    const px = pond.x + Math.cos(a) * d * 0.6;
    const pz = pond.z + Math.sin(a) * d;
    const pad = put(new THREE.CircleGeometry(0.17, 14, 0.3, Math.PI * 1.8), padMat, px, 0.135, pz, { cast: false });
    pad.rotation.x = -Math.PI / 2;
    if (k % 2 === 0) put(new THREE.ConeGeometry(0.06, 0.12, 6), lotus, px, 0.19, pz, { cast: false });
  }
  for (const [x, z, r] of [[OX - 1.2, wz - 1.8, 0.26], [OX - 1.45, wz - 2.05, 0.18], [OX - 4.4, wz + 0.6, 0.3]]) {
    const rock = put(new THREE.SphereGeometry(r, 14, 10), lambert('#b5ada0'), x, r * 0.3, z);
    rock.scale.y = 0.6;
  }
  // banana plants: great paddle leaves on short trunks
  const bananaLeaf = lambert('#6aa84f', { side: THREE.DoubleSide });
  const trunk = lambert('#7d8a4c');
  for (const [bx, bz, h] of [[OX - 1.8, wz - 2.9, 1.5], [OX - 6.2, wz + 3.2, 1.9], [OX - 1.6, wz + 3.2, 1.3]]) {
    put(new THREE.CylinderGeometry(0.07, 0.1, h, 8), trunk, bx, h / 2, bz);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      const leaf = put(new THREE.SphereGeometry(1, 12, 6), bananaLeaf, bx + Math.cos(a) * 0.5, h + 0.12, bz + Math.sin(a) * 0.5);
      leaf.scale.set(0.7, 0.03, 0.24);
      leaf.rotation.set(0, -a, -0.45);
    }
  }
  // no wall round the garden: it just opens out onto the lawn and the trees, so it feels open. (wallX is where the
  // planting thins out into the trees beyond)
  const wallX = OX - 7.5;
  const gz0 = wz - 7;
  const gz1 = wz + 7;
  // bird-of-paradise along the garden's far edge, orange flowers
  const bopLeaf = lambert('#4f8a46', { side: THREE.DoubleSide });
  const bopFlower = lambert('#f08a2c');
  for (let c = 0; c < 7; c++) {
    const bx = wallX + 0.45;
    const bz = gz0 + 1.2 + c * ((gz1 - gz0 - 2.4) / 6);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      const leaf = put(new THREE.SphereGeometry(1, 10, 6), bopLeaf, bx + Math.cos(a) * 0.12, 0.45, bz + Math.sin(a) * 0.12);
      leaf.scale.set(0.12, 0.42, 0.04);
      leaf.rotation.set(Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4);
    }
    put(new THREE.ConeGeometry(0.05, 0.22, 6), bopFlower, bx + 0.08, 0.95, bz, { cast: false }).rotation.z = 1.1;
  }
  // a frangipani by the step: a crooked grey trunk, a few clusters of white flowers
  const fx = OX - 1.3;
  const fz = wz - 3.8;
  const bark = lambert('#9a9088');
  put(new THREE.CylinderGeometry(0.05, 0.08, 1.6, 8), bark, fx, 0.8, fz).rotation.z = 0.15;
  for (const [dx, dy, dz] of [[-0.3, 1.7, 0.1], [0.15, 1.85, -0.25], [0.05, 1.6, 0.35]]) {
    const tuft = put(new THREE.SphereGeometry(0.32, 12, 8), lambert('#5d8f43'), fx + dx, dy, fz + dz);
    tuft.scale.y = 0.45;
    for (let k = 0; k < 4; k++) put(new THREE.SphereGeometry(0.05, 8, 6), lambert('#fbf6ee'), fx + dx + Math.cos(k * 1.6) * 0.2, dy + 0.12, fz + dz + Math.sin(k * 1.6) * 0.2, { cast: false });
  }
  // beyond the wall: big round trees and tall palms, so the view has depth and a skyline
  const leafy = [lambert('#4d8a45'), lambert('#3f7a3c'), lambert('#5a9650')];
  const rnd = seeded(77);
  for (let k = 0; k < 14; k++) {
    const x = wallX - 1.5 - rnd() * 7;
    const z = wz - 11 + k * 1.7 + (rnd() - 0.5) * 0.8;
    const h = 2.6 + rnd() * 2.5;
    put(new THREE.CylinderGeometry(0.16, 0.24, h, 8), lambert('#6b5544'), x, h / 2, z);
    for (let b = 0; b < 3; b++) {
      const r = 1.1 + rnd() * 0.9;
      put(new THREE.SphereGeometry(r, 16, 12), leafy[(k + b) % 3], x + (rnd() - 0.5) * 1.2, h + (rnd() - 0.2) * 0.9, z + (rnd() - 0.5) * 1.2);
    }
  }
  // and round the other sides of the room, well off (clear of the camera when it stands back), more trees
  const ring = [];
  for (let k = 0; k < 9; k++) ring.push([W / 2 + 7.5 + rnd() * 3, -D - 2 + k * 1.2]); // the right
  for (let k = 0; k < 8; k++) ring.push([-W / 2 + k * 1.1, -D - 7.5 - rnd() * 3]); // behind
  for (let k = 0; k < 8; k++) ring.push([-W / 2 + k * 1.1, FRONT + 7.5 + rnd() * 3]); // in front
  ring.forEach(([x, z], k) => {
    const h = 2.4 + rnd() * 2;
    put(new THREE.CylinderGeometry(0.16, 0.24, h, 8), lambert('#6b5544'), x, h / 2, z);
    for (let b = 0; b < 2; b++) put(new THREE.SphereGeometry(1.1 + rnd() * 0.8, 16, 12), leafy[(k + b) % 3], x + (rnd() - 0.5), h + rnd() * 0.6, z + (rnd() - 0.5));
  });
  const frond = lambert('#5f9a48', { side: THREE.DoubleSide });
  for (const [x, z, h, lean] of [[wallX - 1.0, wz - 2.2, 6.2, 0.18], [wallX - 0.8, wz + 2.6, 5.4, -0.15], [OX - 5.5, gz1 + 1.2, 6.8, 0.1]]) {
    const palm = new THREE.Group();
    palm.position.set(x, 0, z);
    palm.rotation.x = lean;
    outside.add(palm);
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, h, 10), lambert('#9c8466'));
    t.position.y = h / 2;
    t.castShadow = true;
    palm.add(t);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const f = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 6), frond);
      f.scale.set(1.3, 0.04, 0.26);
      f.position.set(Math.cos(a) * 1.1, h - 0.15, Math.sin(a) * 1.1);
      f.rotation.set(0, -a, -0.35);
      f.castShadow = true;
      palm.add(f);
    }
  }
  // the garden's own sun (or moon), slanting in through the glass: the page matches it to the sky outside
  const gardenSun = new THREE.DirectionalLight('#fff4e0', 1.2);
  gardenSun.position.set(OX - 9, 8, wz - 3);
  gardenSun.target.position.set(OX - 2, 0, wz);
  gardenSun.castShadow = true;
  gardenSun.shadow.mapSize.set(1024, 1024);
  Object.assign(gardenSun.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, near: 1, far: 30 });
  gardenSun.shadow.bias = -0.0015;
  group.add(gardenSun, gardenSun.target);

  // ---------- light: bright and warm; daylight through the glass; a fill from behind the camera ----------
  const lamp = new THREE.PointLight('#ffe9cc', 4.2, 11, 1.3);
  lamp.position.set(0.2, H - 0.5, -1.6);
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
    group, seat, blockers, sides,
    // the garden outside the glass: its light (matched to the sky by the page), and where its animals amble
    // ([kind, x, z, how far it wanders], local)
    outside: {
      sun: gardenSun,
      animals: [['giraffe', OX - 5.6, wz - 3.4, 0.5], ['elephant', OX - 5.0, wz + 1.3, 0.6], ['dog', OX - 1.3, wz + 1.8, 0.35], ['cat', OX - 3.6, wz - 2.9, 0.3], ['wombat', OX - 3.4, wz + 2.1, 0.3]],
    },
    // places to sit and rest: where the hips go, which way you face (both look out of the window), where you get up
    // to, how near counts as by it, and the view: the camera up in the corner by the door, looking out of the window
    // past you, so you're small at the side of the picture and the garden fills the rest (local)
    seats: [
      { label: '스툴에 앉기', at: new THREE.Vector3(stoolAt.x, seatTop - HIP_Y, stoolAt.z), turn: -Math.PI / 2, up: { x: stoolAt.x + 0.55, z: stoolAt.z }, near: 0.95,
        view: { cam: new THREE.Vector3(W / 2 - 0.25, 1.9, FRONT - 0.25), aim: new THREE.Vector3(-W / 2 + 0.4, 0, 0.2) } },
      { label: '소파에 앉기', at: new THREE.Vector3(sofaAt.x - 0.05, 0.42 - HIP_Y, sofaAt.z), turn: -Math.PI / 2, up: { x: sofaAt.x + 0.2, z: sofaAt.z + 1.05 }, near: 1.2,
        view: { cam: new THREE.Vector3(sofaAt.x + 2.4, 2.3, sofaAt.z + 1.8), aim: new THREE.Vector3(sofaAt.x - 1.0, 0, sofaAt.z - 0.3) } },
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
