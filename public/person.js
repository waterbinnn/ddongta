// 3D people: a chibi model from Blender (public/models/person.glb, made by tools/blender/person.py),
// painted per visitor and posed in code: legs and arms swing on their joints, the face is a drawn decal.
import * as THREE from '/vendor/three.module.js';
import { GLTFLoader } from '/vendor/jsm/loaders/GLTFLoader.js';

export const HIP_Y = 0.3; // hip joints above the feet (matches the Blender script)
export const HEIGHT = 1.08;

let template = null;
export const peopleReady = new Promise((resolve) => {
  new GLTFLoader().load(
    '/models/person.glb',
    (gltf) => {
      template = gltf.scene;
      resolve();
    },
    undefined,
    (err) => {
      console.warn('could not load the person model', err);
      resolve();
    },
  );
});

const HAIRS = ['hair_short', 'hair_bob', 'hair_long', 'hair_bun', 'hair_pigtails', 'cap'];
const HAIR_FOR = { short: 'hair_short', buzz: 'hair_short', curly: 'hair_bob', bob: 'hair_bob', long: 'hair_long', ponytail: 'hair_long', bun: 'hair_bun', pigtails: 'hair_pigtails', cap: 'cap' };
const SHOE = '#2c2630';
const UNDIES = '#f7f4ee';

const mats = new Map();
function matOf(color) {
  let m = mats.get(color);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color });
    mats.set(color, m);
  }
  return m;
}

// ---------- faces: drawn once per expression, shared by everyone ----------

const INK = '#2a1f2b';
const FW = 256;
const FH = 200;
const EYE_Y = 112; // low-set eyes, like the pixel faces
const EYE_DX = 46;

function drawFace(expr) {
  const c = document.createElement('canvas');
  c.width = FW;
  c.height = FH;
  const g = c.getContext('2d');
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = INK;
  g.fillStyle = INK;
  g.lineWidth = 7;
  const cx = FW / 2;
  const line = (pts) => {
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.stroke();
  };
  const dotEyes = (big = 1) => {
    for (const s of [-1, 1]) {
      g.fillStyle = INK;
      g.beginPath();
      g.ellipse(cx + s * EYE_DX, EYE_Y, 11 * big, 14 * big, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(cx + s * EYE_DX - 3 * big, EYE_Y - 5 * big, 4 * big, 0, Math.PI * 2);
      g.fill();
    }
  };
  const cheeks = () => {
    g.fillStyle = 'rgba(255, 140, 160, 0.55)';
    for (const s of [-1, 1]) {
      g.beginPath();
      g.ellipse(cx + s * 80, EYE_Y + 28, 17, 10, 0, 0, Math.PI * 2);
      g.fill();
    }
  };
  const smile = (w = 16, d = 8) => {
    g.beginPath();
    g.moveTo(cx - w, 146);
    g.quadraticCurveTo(cx, 146 + d * 2, cx + w, 146);
    g.stroke();
  };
  const sweat = () => {
    g.fillStyle = '#7cc6ff';
    g.beginPath();
    g.moveTo(222, 46);
    g.quadraticCurveTo(236, 70, 222, 78);
    g.quadraticCurveTo(208, 70, 222, 46);
    g.fill();
  };
  cheeks();
  if (expr === 'idle' || expr === 'ok') {
    dotEyes();
    smile(expr === 'ok' ? 20 : 15, expr === 'ok' ? 11 : 7);
  } else if (expr === 'neutral') {
    dotEyes();
    line([[cx - 14, 150], [cx + 14, 150]]);
  } else if (expr === 'urgent') {
    dotEyes();
    line([[cx - 18, 152], [cx - 8, 146], [cx, 152], [cx + 8, 146], [cx + 18, 152]]);
    sweat();
  } else if (expr === 'strain') {
    for (const s of [-1, 1]) line([[cx + s * (EYE_DX + 12), EYE_Y - 12], [cx + s * (EYE_DX - 10), EYE_Y], [cx + s * (EYE_DX + 12), EYE_Y + 12]]);
    line([[cx - 20, 150], [cx - 10, 144], [cx, 152], [cx + 10, 144], [cx + 20, 150]]);
    sweat();
  } else if (expr === 'bliss') {
    for (const s of [-1, 1]) {
      g.beginPath();
      g.arc(cx + s * EYE_DX, EYE_Y + 6, 13, Math.PI * 1.1, Math.PI * 1.9);
      g.stroke();
    }
    g.fillStyle = INK;
    g.beginPath();
    g.moveTo(cx - 20, 142);
    g.quadraticCurveTo(cx, 178, cx + 20, 142);
    g.closePath();
    g.fill();
    g.fillStyle = '#ff6b81';
    g.beginPath();
    g.ellipse(cx, 156, 9, 6, 0, 0, Math.PI * 2);
    g.fill();
  } else if (expr === 'relaxed') {
    for (const s of [-1, 1]) {
      g.beginPath();
      g.arc(cx + s * EYE_DX, EYE_Y - 4, 12, Math.PI * 0.15, Math.PI * 0.85);
      g.stroke();
    }
    g.beginPath();
    g.ellipse(cx, 150, 6, 5, 0, 0, Math.PI * 2);
    g.stroke();
  } else if (expr === 'dizzy') {
    for (const s of [-1, 1]) {
      const x = cx + s * EYE_DX;
      line([[x - 11, EYE_Y - 11], [x + 11, EYE_Y + 11]]);
      line([[x + 11, EYE_Y - 11], [x - 11, EYE_Y + 11]]);
    }
    line([[cx - 20, 150], [cx - 10, 144], [cx, 150], [cx + 10, 144], [cx + 20, 150]]);
  } else if (expr === 'shock') {
    for (const s of [-1, 1]) {
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.ellipse(cx + s * EYE_DX, EYE_Y, 16, 18, 0, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.fillStyle = INK;
      g.beginPath();
      g.arc(cx + s * EYE_DX, EYE_Y + 2, 6, 0, Math.PI * 2);
      g.fill();
    }
    g.beginPath();
    g.ellipse(cx, 154, 10, 13, 0, 0, Math.PI * 2);
    g.fill();
    sweat();
  } else {
    dotEyes();
    smile();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
const faces = new Map();
const faceTex = (expr) => {
  if (!faces.has(expr)) faces.set(expr, drawFace(expr));
  return faces.get(expr);
};

// the face sits on a slice of sphere just over the front of the head
let faceGeo = null;
function faceGeometry(head) {
  if (faceGeo) return faceGeo;
  head.geometry.computeBoundingBox();
  const box = head.geometry.boundingBox;
  const size = box.getSize(new THREE.Vector3());
  const r = size.z / 2; // depth radius; the head is a slightly squashed ball
  const g = new THREE.SphereGeometry(r * 1.015, 32, 20, Math.PI / 2 - 0.95, 1.9, Math.PI / 2 - 0.62, 1.5);
  g.scale(size.x / size.z, size.y / size.z, 1);
  g.translate(...box.getCenter(new THREE.Vector3()).toArray());
  faceGeo = g;
  return g;
}

// ---------- one person ----------

export function makePerson(look) {
  const root = template ? template.clone(true) : new THREE.Group();
  const parts = {};
  root.traverse((o) => {
    if (o.name) parts[o.name] = o;
    if (o.isMesh) o.frustumCulled = true;
  });
  const hair = HAIR_FOR[look.style] || 'hair_short';
  for (const n of HAIRS) if (parts[n]) parts[n].visible = n === hair;
  const paint = (names, color) => names.forEach((n) => parts[n] && (parts[n].material = matOf(color)));
  paint(['head', 'hand_L', 'hand_R'], look.skin);
  paint(HAIRS, look.h);
  paint(['cap'], look.cap);
  paint(['torso', 'arm_L', 'arm_R'], look.c);
  paint(['hips', 'leg_L', 'leg_R', 'cuff_L', 'cuff_R'], look.pants);
  paint(['shoe_L', 'shoe_R'], SHOE);
  for (const n of ['cuff_L', 'cuff_R']) if (parts[n]) parts[n].visible = false;

  let face = null;
  if (parts.head) {
    face = new THREE.Mesh(faceGeometry(parts.head), new THREE.MeshBasicMaterial({ map: faceTex('idle'), transparent: true, depthWrite: false }));
    parts.head.add(face);
  }
  // group (placed in the world, turned to face where it walks) > spin (tumbling) > the model
  const group = new THREE.Group();
  const spin = new THREE.Group();
  spin.add(root);
  group.add(spin);
  const rest = {};
  for (const n of ['hips', 'torso', 'head', 'arm_L', 'arm_R', 'leg_L', 'leg_R']) if (parts[n]) rest[n] = parts[n].position.clone();
  return { group, spin, root, parts, face, rest, look, expr: 'idle', down: false };
}

export function disposePerson(p) {
  p.face?.material.dispose();
}

export function setFace(p, expr) {
  if (p.expr === expr || !p.face) return;
  p.expr = expr;
  p.face.material.map = faceTex(expr);
}

// pants round the ankles: bare legs, white undies, the pants bunched at the feet
export function setPantsDown(p, down) {
  if (p.down === down) return;
  p.down = down;
  const { parts, look } = p;
  for (const n of ['leg_L', 'leg_R']) if (parts[n]) parts[n].material = matOf(down ? look.skin : look.pants);
  if (parts.hips) parts.hips.material = matOf(down ? UNDIES : look.pants);
  for (const n of ['cuff_L', 'cuff_R']) if (parts[n]) parts[n].visible = down;
}

// mode: 'stand' | 'walk' | 'sit' | 'wash' | 'roll' | 'jump'
export function pose(p, { mode = 'stand', phase = 0, t = 0, strain = false, seed = 0 }) {
  const { parts: P, rest } = p;
  if (!P.hips) return;
  for (const n of ['hips', 'torso', 'head', 'arm_L', 'arm_R', 'leg_L', 'leg_R']) {
    P[n].rotation.set(0, 0, 0);
    P[n].position.copy(rest[n]);
  }
  P.torso.scale.set(1, 1, 1);
  p.spin.position.set(0, 0, 0);
  p.spin.rotation.set(0, 0, 0);
  p.root.position.set(0, 0, 0);

  const breathe = Math.sin(t * 1.9 + seed) * 0.015;
  if (mode === 'walk') {
    const s = Math.sin(phase);
    P.leg_L.rotation.x = s * 0.6;
    P.leg_R.rotation.x = -s * 0.6;
    P.arm_L.rotation.x = -s * 0.55;
    P.arm_R.rotation.x = s * 0.55;
    P.arm_L.rotation.z = 0.12;
    P.arm_R.rotation.z = -0.12;
    P.hips.position.y += Math.abs(Math.cos(phase)) * 0.025;
    P.torso.rotation.y = s * 0.08;
    P.head.rotation.z = s * 0.04;
  } else if (mode === 'sit') {
    // perched on a seat: legs straight out, hands on the knees
    P.leg_L.rotation.x = -1.4;
    P.leg_R.rotation.x = -1.4;
    P.leg_L.rotation.z = 0.08;
    P.leg_R.rotation.z = -0.08;
    P.arm_L.rotation.x = -0.65;
    P.arm_R.rotation.x = -0.65;
    P.torso.scale.y = 1 + breathe;
    if (strain) {
      // pushing: fists in, shoulders up, a little shiver
      const j = Math.sin(t * 60) * 0.02;
      P.arm_L.rotation.set(-1.0, 0, -0.35);
      P.arm_R.rotation.set(-1.0, 0, 0.35);
      P.torso.rotation.x = 0.12 + j;
      P.head.rotation.x = 0.12;
      P.torso.scale.y = 0.97;
    }
  } else if (mode === 'wash') {
    P.arm_L.rotation.x = -1.25 + Math.sin(t * 14) * 0.08;
    P.arm_R.rotation.x = -1.25 - Math.sin(t * 14) * 0.08;
    P.arm_L.rotation.z = -0.25;
    P.arm_R.rotation.z = 0.25;
    P.head.rotation.x = 0.3;
  } else if (mode === 'jump') {
    P.arm_L.rotation.z = 1.2;
    P.arm_R.rotation.z = -1.2;
    P.leg_L.rotation.x = -0.4;
    P.leg_R.rotation.x = 0.2;
  } else if (mode === 'roll') {
    // tumbling head over heels, curled up
    p.spin.position.y = 0.5;
    p.root.position.y = -0.5;
    p.spin.rotation.x = t * 11;
    P.leg_L.rotation.x = -1.2;
    P.leg_R.rotation.x = -1.2;
    P.arm_L.rotation.z = 0.9;
    P.arm_R.rotation.z = -0.9;
  } else {
    // standing: breathing, arms hanging loose
    P.torso.scale.y = 1 + breathe;
    P.arm_L.rotation.z = 0.1 + breathe;
    P.arm_R.rotation.z = -0.1 - breathe;
    P.head.rotation.z = Math.sin(t * 0.7 + seed) * 0.05;
  }
}
