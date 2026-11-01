// 3D characters: one chibi person from Blender (public/models/person.glb, made by tools/blender/person.py) and six
// animals (public/models/animal-<kind>.glb, tools/blender/animals.py) built on the same joints, so the same poses fit
// them all. Everyone who comes as a person looks the same apart from hair colour; they are posed in code
// (legs and arms swing on their joints) and the face is a drawn decal that changes with the mood.
import * as THREE from '/vendor/three.module.js';
import { GLTFLoader } from '/vendor/jsm/loaders/GLTFLoader.js';
import { clone as cloneRigged } from '/vendor/jsm/utils/SkeletonUtils.js';

export const HIP_Y = 0.21; // hip joints above the feet (matches the Blender script)
export const HEIGHT = 1.04;

export const ANIMALS = ['elephant', 'dog', 'cat', 'giraffe', 'wombat']; // the animals wandering about the place
const templates = {};
const loadModel = (kind, url) =>
  new Promise((resolve) => {
    new GLTFLoader().load(
      url,
      (gltf) => {
        templates[kind] = gltf.scene;
        resolve();
      },
      undefined,
      (err) => {
        console.warn(`could not load the ${kind} model`, err);
        resolve();
      },
    );
  });
export const peopleReady = Promise.all([loadModel('person', '/models/person.glb'), ...ANIMALS.map((k) => loadModel(k, `/models/animal-${k}.glb`))]);

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
const INK = '#2d201a'; // a very dark brown: it has to show on fur at night too, when everything else goes dark
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
  const dots = (r = 9.5) =>
    eyes((x) => {
      g.beginPath();
      g.arc(x, EYE_Y, r, 0, Math.PI * 2);
      g.fill();
      // a little white catchlight, so the eyes stand out on dark fur
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(x + r * 0.35, EYE_Y - r * 0.35, r * 0.32, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = INK;
    });
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
  } else if (expr === 'urgent') {
    dots();
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

// the face sits on a slice of sphere just over the front of the head (one per kind of head: they share geometry)
const faceGeos = new WeakMap();
function faceGeometry(head) {
  if (faceGeos.has(head.geometry)) return faceGeos.get(head.geometry);
  head.geometry.computeBoundingBox();
  const box = head.geometry.boundingBox;
  const size = box.getSize(new THREE.Vector3());
  const r = size.z / 2; // depth radius; the head is a slightly squashed ball
  const g = new THREE.SphereGeometry(r * 1.015, 32, 20, Math.PI / 2 - 0.95, 1.9, Math.PI / 2 - 0.62, 1.5);
  g.scale(size.x / size.z, size.y / size.z, 1);
  g.translate(...box.getCenter(new THREE.Vector3()).toArray());
  faceGeos.set(head.geometry, g);
  return g;
}

// ---------- one person ----------

// a person, or one of the animals
export const makeCharacter = (kind, hair) => (ANIMALS.includes(kind) && templates[kind] ? makeAnimal(kind) : makePerson(hair));

export function makePerson(hair = LOOK.hair) {
  const root = templates.person ? cloneRigged(templates.person) : new THREE.Group(); // keeps the shorts bound to their own bones
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
  return withCrown({ group, spin, root, parts, face, rest, bones, expr: 'idle', down: false, skin: LOOK.skin, height: HEIGHT, size: 1 });
}

// an animal: the same joints as a person, in fur. Its colours come with the model (by part), drawn in the same
// soft cartoon shading; the small ones are made smaller at the hips in the model, which is moved up to the whole
// animal here so the poses (which move the hips about) shrink with it.
export function makeAnimal(kind) {
  const root = templates[kind].clone(true);
  const parts = {};
  root.traverse((o) => {
    if (o.name) parts[o.name] = o;
    if (o.isMesh) o.material = matOf(`#${o.material.color.getHexString()}`);
  });
  const size = parts.hips.scale.x;
  parts.hips.scale.setScalar(1);
  parts.hips.position.y = HIP_Y;
  root.scale.setScalar(size);
  const face = new THREE.Mesh(faceGeometry(parts.head), new THREE.MeshBasicMaterial({ map: faceTex('idle'), transparent: true, depthWrite: false }));
  parts.head.add(face);
  // the torso's own mesh (with its belly, spots...) goes under a joint of its own, so the body can stretch out on
  // all fours without stretching the front legs and the head fixed to it
  const body = parts.torso;
  const torso = new THREE.Group();
  torso.position.copy(body.position);
  body.parent.add(torso);
  body.position.set(0, 0, 0);
  torso.add(body);
  for (const n of ['arm_L', 'arm_R', 'head', 'neck']) if (parts[n]?.parent === body) torso.add(parts[n]);
  parts.torso = torso;
  parts.body = body;
  const group = new THREE.Group();
  const spin = new THREE.Group();
  spin.add(root);
  group.add(spin);
  const rest = {};
  for (const n of ['hips', 'torso', 'head', 'neck', 'arm_L', 'arm_R', 'leg_L', 'leg_R', 'hand_L', 'hand_R', 'tail']) if (parts[n]) rest[n] = parts[n].position.clone();
  root.updateMatrixWorld(true);
  const height = new THREE.Box3().setFromObject(root).max.y; // the top of the head, or of the ears
  return withCrown({ group, spin, root, parts, face, rest, bones: {}, expr: 'idle', down: false, kind, skin: `#${parts.head.material.color.getHexString()}`, height, size, quad: fourLegs(parts, BODY[kind] || 1) });
}

// The top of someone as they are posed right now, in world height: the crown of the head, plus what stands up
// above it (hair, a cat's ears). Name tags and pops go here, so they come down with an animal on all fours.
const crownV = new THREE.Vector3();
function crownY(p) {
  const h = p.parts.head;
  if (!h.geometry.boundingBox) h.geometry.computeBoundingBox();
  h.updateWorldMatrix(true, false);
  return h.localToWorld(crownV.set(0, h.geometry.boundingBox.max.y, 0)).y;
}
function withCrown(p) {
  if (!p.parts.head) return p;
  p.group.updateMatrixWorld(true);
  p.above = Math.max(0, p.height - crownY(p));
  return p;
}
export const crownOf = (p) => (p.parts.head ? crownY(p) : p.group.position.y + p.height);

// On all fours: the body stretches out long (most for the cat, whose chibi body is stubby) and
// tips forward at the waist, just far enough that the front legs (made like the hind legs) stand on the ground.
// If they still fall short, they stretch a little (the foot keeps its shape and just moves down).
const BODY = { cat: 1.7, dog: 1.4, wombat: 1.25, elephant: 1.15, giraffe: 1.2 };
function fourLegs(P, long) {
  for (const n of ['arm_L', 'hand_L']) P[n].geometry.computeBoundingBox();
  const armReach = -P.arm_L.geometry.boundingBox.min.y; // shoulder to the end of the arm
  const pawBelow = -P.hand_L.geometry.boundingBox.min.y - armReach; // and how far the paw hangs below that
  const shoulder = P.arm_L.position.y * long; // how far along the stretched body the shoulders sit
  const waistY = HIP_Y + P.torso.position.y;
  const pitch = Math.min(1.9, Math.max(Math.PI / 2, Math.acos(Math.max(-1, Math.min(1, (armReach + pawBelow - waistY) / shoulder)))));
  const shoulderY = waistY + shoulder * Math.cos(pitch); // where the shoulders end up
  const k = Math.max(1, (shoulderY - pawBelow) / armReach);
  // the round bottom of the body reaches back past the hips once it lies along the ground: the hind legs and the
  // tail go back to the end of it, so the legs stand at the two ends of the body, not bunched under the front
  P.body.geometry.computeBoundingBox();
  const back = -P.body.geometry.boundingBox.min.y * long * Math.sin(pitch) * 0.8;
  return { long, pitch, k, back, handY: (-armReach * (k - 1)) / k };
}

export function disposePerson(p) {
  p.face?.material.dispose();
}

// the face's colour: going red as you push (0 to 1), yellow when 변비 sets in (0 to 1).
// Each person gets their own skin material for the head the first time, so others aren't tinted too.
const RED = new THREE.Color('#ff7f6e');
const YELLOW = new THREE.Color('#ecd24a');
export function setFlush(p, red = 0, yellow = 0) {
  const key = `${red.toFixed(2)}|${yellow.toFixed(2)}`;
  if (p.flushKey === key || !p.parts.head) return;
  p.flushKey = key;
  if (!p.flushMat) {
    p.flushMat = p.parts.head.material.clone();
    for (const n of ['head', 'ear_L', 'ear_R']) if (p.parts[n]) p.parts[n].material = p.flushMat;
  }
  p.flushMat.color.set(p.skin).lerp(RED, red * 0.65).lerp(YELLOW, yellow * 0.75);
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

// mode: 'stand' | 'walk' | 'sit' | 'wash' | 'pondwash' | 'roll' | 'jump' | 'squat' (in the bushes) | 'lie'
//       and the 쾌변 체조 moves: 'bridge' | 'boat' | 'twist' | 'bow'
export function pose(p, { mode = 'stand', phase = 0, t = 0, strain = false, seed = 0, upright = false }) {
  const { parts: P, rest } = p;
  if (!P.hips) return;
  for (const n of ['hips', 'torso', 'head', 'arm_L', 'arm_R', 'leg_L', 'leg_R']) {
    P[n].rotation.set(0, 0, 0);
    P[n].position.copy(rest[n]);
  }
  P.torso.scale.set(1, 1, 1);
  if (p.quad) {
    for (const n of ['arm_L', 'arm_R']) P[n].scale.set(1, 1, 1);
    for (const n of ['hand_L', 'hand_R']) {
      P[n].scale.set(1, 1, 1);
      P[n].position.copy(rest[n]);
    }
    P.neck?.rotation.set(0, 0, 0);
    if (P.neck) P.neck.position.copy(rest.neck);
    if (P.tail) P.tail.position.copy(rest.tail);
    P.body.scale.set(1, 1, 1);
  }
  p.spin.position.set(0, 0, 0);
  p.spin.rotation.set(0, 0, 0);
  p.root.position.set(0, 0, 0);
  // a tail wagging gently, faster on the move
  if (P.tail) P.tail.rotation.set(0, Math.sin(t * (mode === 'walk' ? 9 : 3) + seed) * 0.35, 0);

  const breathe = Math.sin(t * 1.9 + seed) * 0.015;
  if (p.quad && !upright && (mode === 'walk' || mode === 'stand')) {
    // an animal standing and walking about on all fours, like a real one (it gets up on two legs for everything else)
    const { pitch, long, back } = p.quad;
    P.torso.rotation.x = pitch;
    for (const n of ['leg_L', 'leg_R', 'tail']) if (P[n]) P[n].position.z = rest[n].z - back;
    P.body.scale.y = long; // the body stretched out, the shoulders and the head moved out to its front end
    (P.neck || P.head).position.y = rest[P.neck ? 'neck' : 'head'].y * long;
    for (const n of ['arm_L', 'arm_R']) {
      P[n].position.y = rest[n].y * long;
      P[n].rotation.x = -pitch;
      P[n].scale.y = p.quad.k;
    }
    for (const n of ['hand_L', 'hand_R']) {
      P[n].scale.y = 1 / p.quad.k;
      P[n].position.y = rest[n].y + p.quad.handY;
    }
    if (P.neck) P.neck.rotation.x = -pitch - 0.05; // the giraffe holds its neck up
    else P.head.rotation.x = -pitch - 0.35; // chin up, so the face shows to the camera above
    if (mode === 'walk') {
      // a walking gait: each front leg goes with the hind leg on the other side
      const s = Math.sin(phase);
      P.leg_L.rotation.x = s * 0.5;
      P.leg_R.rotation.x = -s * 0.5;
      P.arm_L.rotation.x -= s * 0.5;
      P.arm_R.rotation.x += s * 0.5;
      P.hips.position.y += Math.abs(Math.cos(phase)) * 0.015;
      P.head.rotation.z = s * 0.05;
    } else {
      P.torso.scale.y = 1 + breathe;
      P.head.rotation.y = Math.sin(t * 0.6 + seed) * 0.3; // looking about
    }
  } else if (mode === 'walk') {
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
  } else if (mode === 'bridge') {
    // 엉덩이 조이며 브릿지: lying on the back, lifting the hips and lowering them again
    const k = (1 - Math.cos(t * 2.4)) / 2; // 0 down, 1 hips up
    p.spin.rotation.x = -Math.PI / 2 - 0.4 * k;
    p.spin.position.set(0, 0.12 + 0.3 * k, 0.45);
    P.leg_L.rotation.set(1.3 * k, 0, 0.12);
    P.leg_R.rotation.set(1.3 * k, 0, -0.12);
    P.arm_L.rotation.set(0, 0, 0.2);
    P.arm_R.rotation.set(0, 0, -0.2);
  } else if (mode === 'lie') {
    // 눕기: flat on the back in the grass, arms and legs out a little, breathing slowly
    p.spin.rotation.x = -Math.PI / 2;
    p.spin.position.set(0, 0.13, 0.45);
    P.torso.scale.y = 1 + breathe * 0.6;
    P.arm_L.rotation.set(0, 0, 0.55);
    P.arm_R.rotation.set(0, 0, -0.55);
    P.leg_L.rotation.set(0, 0, 0.12);
    P.leg_R.rotation.set(0, 0, -0.12);
    P.head.rotation.y = Math.sin(t * 0.4 + seed) * 0.15;
  } else if (mode === 'boat') {
    // 보트 자세: sitting on the bottom, leaning back, legs and arms up in a V, wobbling a little
    const w = Math.sin(t * 3) * 0.05;
    P.hips.position.y -= 0.17;
    P.torso.rotation.x = -0.55 + w;
    P.leg_L.rotation.set(-2.0 - w, 0, 0.08);
    P.leg_R.rotation.set(-2.0 - w, 0, -0.08);
    P.arm_L.rotation.set(-1.5, 0, -0.1);
    P.arm_R.rotation.set(-1.5, 0, 0.1);
  } else if (mode === 'twist') {
    // 허리 비틀기: arms out to the sides, twisting at the waist
    const w = Math.sin(t * 3.4);
    P.torso.rotation.y = w * 0.65;
    P.arm_L.rotation.z = 1.35;
    P.arm_R.rotation.z = -1.35;
    P.head.rotation.y = -w * 0.3;
  } else if (mode === 'bow') {
    // 활 자세: on the belly, reaching back for the ankles, chest and legs up, rocking
    p.spin.rotation.x = Math.PI / 2 + Math.sin(t * 2.5) * 0.15;
    p.spin.position.set(0, 0.16, -0.45);
    P.torso.rotation.x = -0.35;
    P.head.rotation.x = -0.3;
    P.leg_L.rotation.set(1.5, 0, 0.1);
    P.leg_R.rotation.set(1.5, 0, -0.1);
    P.arm_L.rotation.set(2.5, 0, -0.15);
    P.arm_R.rotation.set(2.5, 0, 0.15);
  } else if (mode === 'rub') {
    // rubbing the golden poop: both hands out in front, going round and round
    const a = t * 9;
    P.arm_L.rotation.set(-1.35 + Math.sin(a) * 0.15, 0, -0.15 + Math.cos(a) * 0.12);
    P.arm_R.rotation.set(-1.35 - Math.sin(a) * 0.15, 0, 0.15 - Math.cos(a) * 0.12);
    P.torso.rotation.x = 0.12;
    P.head.rotation.x = -0.15; // looking up at it
  } else if (mode === 'pray') {
    // 합장: palms together at the chest, a slow bow
    const bow = Math.sin(Math.PI * Math.min(1, t / 2.4)) * 0.35;
    P.arm_L.rotation.set(-1.1, 0, -0.65);
    P.arm_R.rotation.set(-1.1, 0, 0.65);
    P.torso.rotation.x = bow;
    P.head.rotation.x = 0.15 + bow * 0.5;
  } else if (mode === 'kick') {
    // a kick at the vending machine: the right leg swings forward hard, arms out for balance
    const k = Math.sin(Math.PI * Math.min(1, t / 0.45));
    P.leg_R.rotation.x = -1.5 * k;
    P.leg_L.rotation.x = 0.2 * k;
    P.torso.rotation.x = -0.2 * k;
    P.arm_L.rotation.z = 0.9 * k;
    P.arm_R.rotation.z = -0.9 * k;
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
