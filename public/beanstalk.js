// The beanstalk in the garden between the restrooms. Everyone's poop goes to it as fertilizer, in every room,
// and it never stops growing: 5 cm for every poop, from the day it was planted (kept by the server).
import * as THREE from '/vendor/three.module.js';

const CM_PER_POOP = 5;
const DRAW_MAX = 300; // past this many metres it's lost in the sky anyway
export const beanHeight = (total) => 1.2 + (total * CM_PER_POOP) / 100; // a seedling of 1.2 m to start with
export const heightText = (m) => (m < 1 ? `${Math.round(m * 100)}cm` : m < 100 ? `${m.toFixed(1)}m` : `${Math.round(m)}m`);

export function makeBeanstalk(x, z) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  const stalkMat = new THREE.MeshLambertMaterial({ color: '#6cbf45' });
  const leafMat = new THREE.MeshLambertMaterial({ color: '#5bb43c', side: THREE.DoubleSide });
  const leafGeo = new THREE.SphereGeometry(1, 12, 8);
  leafGeo.translate(1, 0, 0); // pivot at the stem end, so a leaf sticks out from the stalk

  // a mound of rich dark earth at the foot
  const mound = new THREE.Mesh(new THREE.SphereGeometry(0.75, 20, 10), new THREE.MeshLambertMaterial({ color: '#6b4a32' }));
  mound.scale.y = 0.28;
  mound.receiveShadow = true;
  group.add(mound);

  let strands = [];
  let leaves = null;
  let curl = null;
  let shown = 0;
  let target = beanHeight(0);

  // two strands winding round each other, broad leaves all the way up, a curl at the very top
  const strandAt = (y, phase) => {
    const a = y * 1.4 + phase;
    const r = 0.1 + 0.04 * Math.sin(y * 0.6);
    return new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
  };
  function build(h) {
    for (const s of strands) {
      group.remove(s);
      s.geometry.dispose();
    }
    if (leaves) {
      group.remove(leaves);
      leaves.dispose();
    }
    if (curl) {
      group.remove(curl);
      curl.geometry.dispose();
    }
    const draw = Math.min(h, DRAW_MAX);
    const n = Math.max(8, Math.ceil(draw * 5));
    strands = [0, Math.PI].map((phase, k) => {
      const pts = [];
      for (let i = 0; i <= n; i++) pts.push(strandAt((draw * i) / n, phase));
      const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), n * 2, k ? 0.05 : 0.065, 7), stalkMat);
      tube.castShadow = true;
      group.add(tube);
      return tube;
    });
    const count = Math.floor(draw / 0.32);
    leaves = new THREE.InstancedMesh(leafGeo, leafMat, Math.max(1, count));
    leaves.count = count;
    const m4 = new THREE.Matrix4();
    for (let k = 0; k < count; k++) {
      const y = 0.25 + k * 0.32;
      const a = k * 2.4; // round and round, like real leaves
      const size = 0.16 + 0.06 * Math.sin(k * 1.7);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -a, 0.35));
      m4.compose(strandAt(y, 0), q, new THREE.Vector3(size * 1.4, size * 0.12, size));
      leaves.setMatrixAt(k, m4);
    }
    leaves.castShadow = true;
    group.add(leaves);
    curl = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.025, 6, 16, Math.PI * 1.5), stalkMat);
    curl.position.copy(strandAt(draw, 0)).add(new THREE.Vector3(0, 0.1, 0));
    curl.rotation.y = draw;
    group.add(curl);
  }

  return {
    group,
    setTotal(total) {
      target = beanHeight(total);
    },
    get height() {
      return shown;
    },
    // grow smoothly toward the latest height
    update(dt) {
      if (Math.abs(target - shown) < 0.004) return;
      shown = shown ? shown + (target - shown) * Math.min(1, dt * 2.5) : target;
      if (Math.abs(target - shown) < 0.004) shown = target;
      build(shown);
    },
    // where fertilizer lands: on the stalk, at a height you can still see
    landing() {
      return group.localToWorld(new THREE.Vector3(0, Math.min(shown, 3) * 0.7 + 0.3, 0));
    },
  };
}
