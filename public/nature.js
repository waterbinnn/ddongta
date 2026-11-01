// Natural-looking pieces drawn in code: leafy foliage cards for bushes and tree crowns, grass tufts,
// and irregular stones. Textures are painted on canvases (no image files), so they look the same everywhere.
import * as THREE from '/vendor/three.module.js';

function seeded(seed) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function texture(canvas, { repeat = false } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// a dense cluster of small leaves, lit from above; `solid` fills the gaps with deep shade (for tree crowns)
export function leafTexture(solid = false) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const rand = seeded(solid ? 11 : 5);
  if (solid) {
    g.fillStyle = '#466c34'; // the shade between leaves, not too dark
    g.fillRect(0, 0, 256, 256);
  }
  const n = solid ? 900 : 420;
  for (let k = 0; k < n; k++) {
    const x = rand() * 256;
    const y = rand() * 256;
    // leaves near the middle in the cut-out version, so the card reads as a round clump
    if (!solid && Math.hypot(x - 128, y - 128) > 118 - rand() * 30) continue;
    const light = 1 - y / 300 + (rand() - 0.5) * 0.35; // lighter toward the top, like sun from above
    const r = Math.round(70 + 55 * light);
    const gr = Math.round(120 + 75 * light);
    const b = Math.round(45 + 25 * light);
    g.save();
    g.translate(x, y);
    g.rotate(rand() * Math.PI * 2);
    g.fillStyle = `rgb(${r}, ${gr}, ${b})`;
    g.beginPath();
    g.ellipse(0, 0, 7 + rand() * 5, 3 + rand() * 2, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = `rgba(30, 45, 25, 0.35)`; // the midrib
    g.lineWidth = 0.8;
    g.beginPath();
    g.moveTo(-6, 0);
    g.lineTo(6, 0);
    g.stroke();
    g.restore();
  }
  const t = texture(c, { repeat: solid });
  return t;
}

// a tuft of grass blades rising from the bottom edge
export function grassTuftTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const rand = seeded(23);
  for (let k = 0; k < 46; k++) {
    const x = 64 + (rand() - 0.5) * 70;
    const h = 50 + rand() * 75;
    const lean = (rand() - 0.5) * 50;
    const w = 2 + rand() * 2.5;
    const shade = rand();
    g.fillStyle = shade < 0.4 ? '#5a8040' : shade < 0.8 ? '#73a04c' : '#97bf63';
    g.beginPath();
    g.moveTo(x - w, 128);
    g.quadraticCurveTo(x + lean * 0.3, 128 - h * 0.6, x + lean, 128 - h);
    g.quadraticCurveTo(x + lean * 0.3 + w * 0.5, 128 - h * 0.6, x + w, 128);
    g.fill();
  }
  return texture(c);
}

// rough grey stone with lichen specks
export function stoneTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const rand = seeded(31);
  g.fillStyle = '#8d8a82';
  g.fillRect(0, 0, 128, 128);
  for (let k = 0; k < 1600; k++) {
    const v = 110 + Math.round((rand() - 0.5) * 70);
    g.fillStyle = `rgb(${v}, ${v - 3}, ${v - 9})`;
    g.fillRect(rand() * 128, rand() * 128, 1 + rand() * 2, 1 + rand() * 2);
  }
  for (let k = 0; k < 40; k++) {
    g.fillStyle = rand() < 0.5 ? 'rgba(150, 160, 110, 0.5)' : 'rgba(200, 195, 170, 0.45)';
    g.beginPath();
    g.arc(rand() * 128, rand() * 128, 1 + rand() * 3, 0, Math.PI * 2);
    g.fill();
  }
  return texture(c, { repeat: true });
}

// several upright cards crossing at the middle (and one lying flat), so a clump looks full from any side
export function cardsGeometry(cards = 3, flat = true) {
  const parts = [];
  for (let k = 0; k < cards; k++) {
    const p = new THREE.PlaneGeometry(1, 1);
    p.translate(0, 0.5, 0);
    p.rotateY((k / cards) * Math.PI);
    parts.push(p);
  }
  if (flat) {
    const p = new THREE.PlaneGeometry(1, 1);
    p.rotateX(-Math.PI / 2);
    p.translate(0, 0.55, 0);
    parts.push(p);
  }
  const pos = [];
  const nor = [];
  const uv = [];
  const idx = [];
  for (const p of parts) {
    const base = pos.length / 3;
    pos.push(...p.attributes.position.array);
    // normals pointing up-ish, so both sides of a card catch the light the same
    for (let i = 0; i < p.attributes.position.count; i++) nor.push(0, 1, 0);
    uv.push(...p.attributes.uv.array);
    for (const i of p.index.array) idx.push(base + i);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// a lumpy stone: a ball pushed in and out, flattened
export function stoneGeometry(seed) {
  const g = new THREE.IcosahedronGeometry(1, 2);
  const rand = seeded(seed * 97 + 13);
  const bumps = Array.from({ length: 5 }, () => new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize());
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = v.clone().normalize();
    let r = 1;
    for (const b of bumps) r += Math.max(0, n.dot(b)) * 0.18 - 0.04;
    v.multiplyScalar(r);
    v.y *= 0.6;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

// a tree crown: a soft, lumpy ball (no painted leaves), shaded smoothly
export function crownGeometry(seed) {
  const g = new THREE.IcosahedronGeometry(1, 3);
  const rand = seeded(seed * 53 + 7);
  const bumps = Array.from({ length: 9 }, () => new THREE.Vector3(rand() - 0.5, rand() * 0.8 - 0.2, rand() - 0.5).normalize());
  const p = g.attributes.position;
  const nrm = g.attributes.normal;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = v.clone().normalize();
    let r = 0.92;
    for (const b of bumps) r += Math.pow(Math.max(0, n.dot(b)), 3) * 0.16;
    if (n.y < -0.3) r *= 0.9; // a flatter underside
    v.copy(n).multiplyScalar(r);
    p.setXYZ(i, v.x, v.y, v.z);
    nrm.setXYZ(i, n.x, n.y, n.z); // round-ball normals: smooth light over the lumps
  }
  return g;
}

// ---------- building materials, painted at a size where they read as real surfaces ----------

function canvasOf(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  return c;
}
const speckle = (g, w, h, rand, n, dark, light) => {
  for (let k = 0; k < n; k++) {
    g.fillStyle = rand() < 0.5 ? dark : light;
    g.fillRect(rand() * w, rand() * h, 1 + rand() * 2, 1 + rand() * 2);
  }
};

// wall tiles: 30 cm squares of glazed sky-blue tile, each a shade different, with white grout; the canvas is 1.2 m square
export function wallTileTexture() {
  return texture(canvasOf(512, 512, (g) => {
    const rand = seeded(41);
    g.fillStyle = '#eef6fa'; // grout
    g.fillRect(0, 0, 512, 512);
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        const t = 0.96 + rand() * 0.07;
        const grad = g.createLinearGradient(x * 128, y * 128, x * 128 + 128, y * 128 + 128);
        grad.addColorStop(0, `rgb(${Math.round(196 * t)}, ${Math.round(228 * t)}, ${Math.round(246 * t)})`);
        grad.addColorStop(1, `rgb(${Math.round(170 * t)}, ${Math.round(212 * t)}, ${Math.round(238 * t)})`);
        g.fillStyle = grad;
        g.fillRect(x * 128 + 3, y * 128 + 3, 122, 122);
        g.fillStyle = 'rgba(255, 255, 255, 0.35)'; // the glaze catching the light
        g.fillRect(x * 128 + 10, y * 128 + 8, 60, 5);
      }
    }
    speckle(g, 512, 512, rand, 900, 'rgba(120, 170, 200, 0.12)', 'rgba(255, 255, 255, 0.2)');
  }), { repeat: true });
}

// the floor: 30 cm tiles in a cream and pale butter check, white grout
export function floorSlabTexture() {
  return texture(canvasOf(512, 512, (g) => {
    const rand = seeded(43);
    g.fillStyle = '#f4ecd8';
    g.fillRect(0, 0, 512, 512);
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        const t = 0.97 + rand() * 0.05;
        const [r, gr, b] = (x + y) % 2 ? [255, 236, 176] : [255, 250, 238];
        g.fillStyle = `rgb(${Math.round(r * t)}, ${Math.round(gr * t)}, ${Math.round(b * t)})`;
        g.fillRect(x * 128 + 3, y * 128 + 3, 122, 122);
      }
    }
    speckle(g, 512, 512, rand, 1200, 'rgba(200, 180, 140, 0.15)', 'rgba(255, 255, 255, 0.25)');
  }), { repeat: true });
}

// lime plaster: warm off-white, softly clouded
export function plasterTexture() {
  return texture(canvasOf(256, 256, (g) => {
    const rand = seeded(47);
    g.fillStyle = '#efe9dd';
    g.fillRect(0, 0, 256, 256);
    for (let k = 0; k < 40; k++) {
      const x = rand() * 256;
      const y = rand() * 256;
      const r = 20 + rand() * 50;
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, rand() < 0.5 ? 'rgba(215, 205, 186, 0.12)' : 'rgba(252, 250, 244, 0.18)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      g.fillStyle = grad;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    speckle(g, 256, 256, rand, 900, 'rgba(190, 178, 160, 0.15)', 'rgba(255, 252, 245, 0.25)');
  }), { repeat: true });
}

// the stall doors: painted sky blue, a little brushed, lighter at the top
export function doorWoodCanvas() {
  return canvasOf(160, 104, (g) => {
    const rand = seeded(61);
    const grad = g.createLinearGradient(0, 0, 0, 104);
    grad.addColorStop(0, '#79c3ec');
    grad.addColorStop(1, '#4ea8dc');
    g.fillStyle = grad;
    g.fillRect(0, 0, 160, 104);
    for (let k = 0; k < 40; k++) {
      g.strokeStyle = rand() < 0.5 ? `rgba(40, 110, 160, ${0.08 + rand() * 0.1})` : `rgba(255, 255, 255, ${0.08 + rand() * 0.1})`;
      g.lineWidth = 1;
      const y = rand() * 104;
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(160, y + (rand() - 0.5) * 3);
      g.stroke();
    }
  });
}
