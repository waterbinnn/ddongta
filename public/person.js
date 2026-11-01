// 3D people: one chibi character from Blender (public/models/person.glb, made by tools/blender/person.py).
// Everyone who comes as a person looks the same apart from hair colour; they are posed in code
// (legs and arms swing on their joints) and the face is a drawn decal that changes with the mood.
import * as THREE from '/vendor/three.module.js';
import { GLTFLoader } from '/vendor/jsm/loaders/GLTFLoader.js';
import { clone as cloneRigged } from '/vendor/jsm/utils/SkeletonUtils.js';

export const HIP_Y = 0.21; // hip joints above the feet (matches the Blender script)
export const HEIGHT = 1.04;

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

// the one look: warm peach skin, soft brown hair, a butter-yellow tee, sky-blue shorts, white sneakers
export const LOOK = { skin: '#ffd8bf', hair: '#6b4630', shirt: '#ffe28a', pants: '#8db6ea', shoes: '#fbf8f2', undies: '#ffc9d6' }; // pale pink briefs, so they show against the skin

// the only thing that differs between people: hair colour, picked from their id so it stays the same
const HAIR_COLORS = ['#6b4630', '#2b2226', '#8a4b2a', '#d9814a', '#e8c26a'];
export function hairFor(id) {
  let x = Math.imul((id | 0) + 1, 2654435761) >>> 0;
  x ^= x >>> 15;
  return HAIR_COLORS[(x >>> 0) % HAIR_COLORS.length];
}

// soft cartoon shading: three flat tones instead of a smooth gradient
const toonRamp = (() => {
  const t = new THREE.DataTexture(new Uint8Array([178, 178, 178, 255, 222, 222, 222, 255, 255, 255, 255, 255]), 3, 1);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
})();
const mats = new Map();
function matOf(color, both = false) {
  const key = both ? `${color}|both` : color;
  let m = mats.get(key);
  if (!m) {
    m = new THREE.MeshToonMaterial({ color, gradientMap: toonRamp, side: both ? THREE.DoubleSide : THREE.FrontSide });
    mats.set(key, m);
  }
  return m;
}

// ---------- faces: drawn once per expression, shared by everyone ----------

// Plain dot eyes and round blush, no mouth (like 사우나 고요); the face only changes while pooping and so on.
const INK = '#6b4a3a'; // soft brown, not black
const FW = 256;
const FH = 200;
const EYE_Y = 130; // below the fringe
const EYE_DX = 50;

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
  const eyes = (draw) => [-1, 1].forEach((s) => draw(cx + s * EYE_DX, s));
  const line = (pts) => {
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.stroke();
  };
  const dots = (r = 8.5) =>
    eyes((x) => {
      g.beginPath();
      g.arc(x, EYE_Y, r, 0, Math.PI * 2);
      g.fill();
    });
  const sweat = () => {
    g.fillStyle = '#9fd3f5';
    g.beginPath();
    g.moveTo(214, 52);
    g.quadraticCurveTo(226, 72, 214, 80);
    g.quadraticCurveTo(202, 72, 214, 52);
    g.fill();
    g.fillStyle = INK;
  };
  // flat round blush
  g.fillStyle = 'rgba(240, 160, 165, 0.5)';
  eyes((x, s) => {
    g.beginPath();
    g.arc(x + s * 30, EYE_Y + 26, 16, 0, Math.PI * 2);
    g.fill();
  });
  g.fillStyle = INK;

  if (expr === 'strain') {
    // > <  squeezing hard
    eyes((x, s) => line([[x + s * 9, EYE_Y - 9], [x - s * 7, EYE_Y], [x + s * 9, EYE_Y + 9]]));
    sweat();
  } else if (expr === 'urgent') {
    dots();
    sweat();
  } else if (expr === 'bliss') {
    // ^ ^  done, ahh
    eyes((x) => {
      g.beginPath();
      g.arc(x, EYE_Y + 5, 10, Math.PI * 1.15, Math.PI * 1.85);
      g.stroke();
    });
  } else if (expr === 'relaxed') {
    // - -  calm
    eyes((x) => line([[x - 9, EYE_Y], [x + 9, EYE_Y]]));
  } else if (expr === 'dizzy') {
    eyes((x) => {
      line([[x - 8, EYE_Y - 8], [x + 8, EYE_Y + 8]]);
      line([[x + 8, EYE_Y - 8], [x - 8, EYE_Y + 8]]);
    });
  } else if (expr === 'shock') {
    dots(11);
    g.beginPath();
    g.ellipse(cx, EYE_Y + 30, 6, 8, 0, 0, Math.PI * 2);
    g.fill();
    sweat();
  } else {
    dots(); // idle, ok, neutral: just the dots
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
  const root = template ? cloneRigged(template) : new THREE.Group(); // keeps the shorts bound to their own bones
  const parts = {};
  root.traverse((o) => {
    if (o.name) parts[o.name] = o;
    if (o.isMesh) o.frustumCulled = true;
  });
  const paint = (names, color) => names.forEach((n) => parts[n] && (parts[n].material = matOf(color)));
  paint(['head', 'ear_L', 'ear_R', 'hand_L', 'hand_R', 'leg_L', 'leg_R'], LOOK.skin);
  if (parts.hair) parts.hair.material = matOf(hair, true); // an open shell: its inside can show at the edge
  paint(['torso', 'arm_L', 'arm_R'], LOOK.shirt);
  paint(['shorts', 'cuff_L', 'cuff_R'], LOOK.pants);
  paint(['briefs'], LOOK.undies);
  if (parts.briefs) parts.briefs.visible = false;
  if (parts.shorts) parts.shorts.frustumCulled = false; // skinned: its bounds move with the legs
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
  for (const n of ['hips', 'torso', 'head', 'arm_L', 'arm_R', 'leg_L', 'leg_R', 'rig']) if (parts[n]) rest[n] = parts[n].position.clone();
  // each thigh bone of the shorts turns with its leg; keep how the bone sits at rest to turn it the same way
  root.updateMatrixWorld(true);
  const bones = {};
  for (const n of ['thigh_L', 'thigh_R']) {
    const b = parts[n];
    if (!b?.isBone) continue;
    const world = b.getWorldQuaternion(new THREE.Quaternion());
    bones[n] = { bone: b, local: b.quaternion.clone(), world, worldInv: world.clone().invert() };
  }
  return { group, spin, root, parts, face, rest, bones, expr: 'idle', down: false };
}

export function disposePerson(p) {
  p.face?.material.dispose();
}

export function setFace(p, expr) {
  if (p.expr === expr || !p.face) return;
  p.expr = expr;
  p.face.material.map = faceTex(expr);
}

// shorts pulled down: white briefs, bare legs, the shorts bunched round the ankles
export function setPantsDown(p, down) {
  if (p.down === down) return;
  p.down = down;
  const { parts } = p;
  if (parts.shorts) parts.shorts.visible = !down;
  if (parts.briefs) parts.briefs.visible = down;
  for (const n of ['cuff_L', 'cuff_R']) if (parts[n]) parts[n].visible = down;
}

// turn each thigh bone of the shorts exactly as its leg turned, so the shorts follow the legs
const qLeg = new THREE.Quaternion();
function followLegs(p) {
  const { parts: P, bones, rest } = p;
  if (P.rig) P.rig.position.copy(rest.rig).add(P.hips.position).sub(rest.hips); // bob with the hips
  for (const [leg, name] of [['leg_L', 'thigh_L'], ['leg_R', 'thigh_R']]) {
    const b = bones[name];
    if (!b) continue;
    qLeg.setFromEuler(P[leg].rotation);
    // the leg's turn, seen from the bone's own frame
    b.bone.quaternion.copy(b.local).multiply(b.worldInv.clone().multiply(qLeg).multiply(b.world));
  }
}

// mode: 'stand' | 'walk' | 'sit' | 'wash' | 'pondwash' | 'roll' | 'jump' | 'squat' (in the bushes)
//       and the 쾌변 체조 moves: 'rub' (belly rub) | 'deep' (deep squats) | 'hug' (hugging the knees) | 'twist' (waist twists)
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
    P.leg_L.rotation.x = s * 0.55;
    P.leg_R.rotation.x = -s * 0.55;
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
  } else if (mode === 'squat') {
    // squatting low in the bushes: bottom near the ground, knees out, hands on the knees
    P.hips.position.y -= 0.12;
    P.leg_L.rotation.set(-1.35, 0, 0.45);
    P.leg_R.rotation.set(-1.35, 0, -0.45);
    P.torso.rotation.x = 0.22;
    P.arm_L.rotation.set(-0.9, 0, -0.2);
    P.arm_R.rotation.set(-0.9, 0, 0.2);
    P.head.rotation.z = Math.sin(t * 0.8 + seed) * 0.06; // glancing about
    if (strain) {
      const j = Math.sin(t * 60) * 0.02;
      P.arm_L.rotation.set(-1.0, 0, -0.35);
      P.arm_R.rotation.set(-1.0, 0, 0.35);
      P.torso.rotation.x = 0.3 + j;
      P.head.rotation.set(0.15, 0, 0);
    }
  } else if (mode === 'pondwash') {
    // crouched at the pond's edge, rubbing hands in the water
    P.hips.position.y -= 0.12;
    P.leg_L.rotation.set(-1.35, 0, 0.4);
    P.leg_R.rotation.set(-1.35, 0, -0.4);
    P.torso.rotation.x = 0.4;
    P.arm_L.rotation.set(-1.1 + Math.sin(t * 14) * 0.1, 0, -0.2);
    P.arm_R.rotation.set(-1.1 - Math.sin(t * 14) * 0.1, 0, 0.2);
    P.head.rotation.x = 0.25;
  } else if (mode === 'rub') {
    // rubbing the belly round and round, clockwise, looking down at it
    const a = t * 5;
    P.arm_R.rotation.set(-0.75 + Math.sin(a) * 0.2, 0, 0.8 + Math.cos(a) * 0.2);
    P.arm_L.rotation.set(-0.4, 0, -0.5);
    P.head.rotation.x = 0.3;
    P.torso.rotation.y = Math.sin(a) * 0.06;
    P.torso.scale.y = 1 + breathe;
  } else if (mode === 'deep') {
    // deep squats: down and up, arms out in front for balance
    const k = (1 - Math.cos(t * 3.2)) / 2; // 0 standing, 1 all the way down
    P.hips.position.y -= 0.12 * k;
    P.leg_L.rotation.set(-1.35 * k, 0, 0.35 * k);
    P.leg_R.rotation.set(-1.35 * k, 0, -0.35 * k);
    P.arm_L.rotation.x = -1.45 * k;
    P.arm_R.rotation.x = -1.45 * k;
    P.torso.rotation.x = 0.15 * k;
  } else if (mode === 'hug') {
    // sitting on the ground hugging the knees, rocking back and forth
    const rock = Math.sin(t * 2.6) * 0.12;
    P.hips.position.y -= 0.13;
    P.leg_L.rotation.set(-2.0, 0, 0.12);
    P.leg_R.rotation.set(-2.0, 0, -0.12);
    P.torso.rotation.x = 0.3 + rock;
    P.arm_L.rotation.set(-1.25, 0, -0.45);
    P.arm_R.rotation.set(-1.25, 0, 0.45);
    P.head.rotation.x = 0.1;
  } else if (mode === 'twist') {
    // arms out to the sides, twisting at the waist
    const s = Math.sin(t * 3.4);
    P.torso.rotation.y = s * 0.65;
    P.arm_L.rotation.z = 1.35;
    P.arm_R.rotation.z = -1.35;
    P.head.rotation.y = -s * 0.3;
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
  followLegs(p);
}
