// 3D people: one chibi character from Blender (public/models/person.glb, made by tools/blender/person.py).
// Everyone who comes as a person looks the same, like the monks on 산사; they are posed in code
// (legs and arms swing on their joints) and the face is a drawn decal that changes with the mood.
import * as THREE from '/vendor/three.module.js';
import { GLTFLoader } from '/vendor/jsm/loaders/GLTFLoader.js';

export const HIP_Y = 0.17; // hip joints above the feet (matches the Blender script)
export const HEIGHT = 1.0;

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

// the one look: fair skin, soft brown hair, a butter-yellow tee, sky-blue shorts, white sneakers
export const LOOK = { skin: '#fff1e8', hair: '#6b4630', shirt: '#ffe28a', pants: '#8db6ea', shoes: '#fbf8f2', undies: '#ffffff' };

// soft cartoon shading: three flat tones instead of a smooth gradient
const toonRamp = (() => {
  const t = new THREE.DataTexture(new Uint8Array([150, 150, 150, 255, 210, 210, 210, 255, 255, 255, 255, 255]), 3, 1);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
})();
const mats = new Map();
function matOf(color) {
  let m = mats.get(color);
  if (!m) {
    m = new THREE.MeshToonMaterial({ color, gradientMap: toonRamp });
    mats.set(color, m);
  }
  return m;
}

// ---------- faces: drawn once per expression, shared by everyone ----------

const INK = '#2a1f2b';
const FW = 256;
const FH = 200;
const EYE_Y = 116; // low-set, wide-apart eyes read as cute
const EYE_DX = 52;

function drawFace(expr) {
  const c = document.createElement('canvas');
  c.width = FW;
  c.height = FH;
  const g = c.getContext('2d');
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = INK;
  g.fillStyle = INK;
  g.lineWidth = 6;
  const cx = FW / 2;
  const line = (pts) => {
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.stroke();
  };
  // big glossy eyes: a tall dark oval with one large and one small highlight
  const dotEyes = (big = 1) => {
    for (const s of [-1, 1]) {
      const x = cx + s * EYE_DX;
      g.fillStyle = INK;
      g.beginPath();
      g.ellipse(x, EYE_Y, 12 * big, 17 * big, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(x - 4 * big, EYE_Y - 7 * big, 5 * big, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.arc(x + 4 * big, EYE_Y + 7 * big, 2.2 * big, 0, Math.PI * 2);
      g.fill();
    }
  };
  // soft round blush that fades at the edges
  const cheeks = () => {
    for (const s of [-1, 1]) {
      const x = cx + s * 84;
      const y = EYE_Y + 30;
      const grad = g.createRadialGradient(x, y, 0, x, y, 24);
      grad.addColorStop(0, 'rgba(255, 140, 155, 0.6)');
      grad.addColorStop(1, 'rgba(255, 140, 155, 0)');
      g.fillStyle = grad;
      g.fillRect(x - 26, y - 26, 52, 52);
    }
  };
  const smile = (w = 10, d = 5) => {
    g.beginPath();
    g.moveTo(cx - w, 148);
    g.quadraticCurveTo(cx, 148 + d * 2, cx + w, 148);
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
    smile(expr === 'ok' ? 14 : 9, expr === 'ok' ? 8 : 5);
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

export function makePerson(hair = LOOK.hair) {
  const root = template ? template.clone(true) : new THREE.Group();
  const parts = {};
  root.traverse((o) => {
    if (o.name) parts[o.name] = o;
    if (o.isMesh) o.frustumCulled = true;
  });
  const paint = (names, color) => names.forEach((n) => parts[n] && (parts[n].material = matOf(color)));
  paint(['head', 'ear_L', 'ear_R', 'hand_L', 'hand_R', 'leg_L', 'leg_R'], LOOK.skin);
  paint(['hair', 'tuft'], hair);
  paint(['torso', 'arm_L', 'arm_R'], LOOK.shirt);
  paint(['hips', 'cuff_L', 'cuff_R'], LOOK.pants);
  paint(['shoe_L', 'shoe_R'], LOOK.shoes);
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
  return { group, spin, root, parts, face, rest, expr: 'idle', down: false };
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
  const { parts } = p;
  if (parts.hips) parts.hips.material = matOf(down ? LOOK.undies : LOOK.pants);
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
