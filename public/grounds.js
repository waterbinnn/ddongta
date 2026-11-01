// The v2 grounds: the plaza with its café terrace, the two restrooms, the 쾌변 exercise ground, the bushes,
// the walking path round it all, trees, lamps and the gate. Everything comes from the server's layout
// (lib/layout.js, centimetres; x east, y south) so the page and the server agree on where things are.
// The stalls themselves are built by app.js (makeStall); this file builds everything around them.
import * as THREE from '/vendor/three.module.js';
import { GLTFLoader } from '/vendor/jsm/loaders/GLTFLoader.js';
import {
  leafTexture, grassTuftTexture, stoneTexture, cardsGeometry, stoneGeometry, crownGeometry,
  wallTileTexture, floorSlabTexture, plasterTexture,
} from './nature.js';
const rep = (t, x, y) => {
  t.repeat.set(x, y);
  return t;
};

const U = 0.01; // centimetres to metres
const rnd = (k) => {
  const v = Math.sin(k * 91.3 + 7.1) * 43758.5453;
  return v - Math.floor(v);
};

// a flat sign: text painted on a canvas, readable from across the plaza
function signTexture(text, { bg = '#fffaf0', ink = '#4a3520', w = 512, h = 128, font = 64 } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.beginPath();
  g.roundRect(4, 4, w - 8, h - 8, h * 0.22);
  g.fill();
  g.fillStyle = ink;
  g.font = `bold ${font}px -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function buildGrounds(kit) {
  const { L, root, lamps, lampLights, glows, mesh, mat, tex, vendingMachine, M, wishHits, lampColor, lampPower } = kit;
  glows.length = 0; // things that change from day to night: (dark) => void, dark 0 by day and 1 at night
  const C = L.center * U; // the plaza's middle, in metres (x and z)
  const P = (p) => [p.x * U, p.y * U]; // a layout point to world x, z

  const add = (o, x, y, z) => {
    o.position.set(x, y, z);
    root.add(o);
    return o;
  };
  const block = (w, h, d, material, x, y, z, opts = { cast: true, receive: true }) => add(mesh(new THREE.BoxGeometry(w, h, d), material, opts), x, y, z);
  const disc = (r, material, x, z, y = 0.01, segs = 64) => {
    const m = mesh(new THREE.CircleGeometry(r, segs), material, { receive: true });
    m.rotation.x = -Math.PI / 2;
    return add(m, x, y, z);
  };
  const strip = (x0, z0, x1, z1, material, y = 0.009) => {
    const m = mesh(new THREE.PlaneGeometry(Math.abs(x1 - x0), Math.abs(z1 - z0)), material, { receive: true });
    m.rotation.x = -Math.PI / 2;
    return add(m, (x0 + x1) / 2, y, (z0 + z1) / 2);
  };
  // flowers are gathered as they're placed, then drawn in a few instanced meshes at the end
  const flowers = [];
  function flowerPatch(x, z, r, n, seed) {
    for (let k = 0; k < n; k++) {
      const a = rnd(seed * 31 + k) * Math.PI * 2;
      const d = Math.sqrt(rnd(seed * 17 + k + 3)) * r;
      flowers.push({ x: x + Math.cos(a) * d, z: z + Math.sin(a) * d, c: (seed + Math.floor(k / 5)) % 6, s: 0.8 + rnd(seed + k * 7) * 0.5 });
    }
  }
  const sign = (text, x, y, z, rotY = 0, size = [2.2, 0.55], style = {}) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(...size), new THREE.MeshBasicMaterial({ map: signTexture(text, style), transparent: true }));
    m.rotation.y = rotY;
    return add(m, x, y, z);
  };

  // ---------- ground: grass that stays flat round the grounds and curves away like a small planet ----------
  const FLAT_R = L.flatR * U;
  const CURVE_R = 70;
  const groundY = (r) => (r <= FLAT_R ? -0.02 : -0.02 - ((r - FLAT_R) ** 2) / (2 * CURVE_R));
  const rings = 60;
  const segs = 96;
  const verts = [];
  const uvs = [];
  const idx = [];
  for (let i = 0; i <= rings; i++) {
    const r = (220 * i * i) / (rings * rings);
    for (let j = 0; j <= segs; j++) {
      const a = (j / segs) * Math.PI * 2;
      verts.push(Math.cos(a) * r, groundY(r), Math.sin(a) * r);
      uvs.push((Math.cos(a) * r) / 1.6, (Math.sin(a) * r) / 1.6);
    }
  }
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < segs; j++) {
      const p0 = i * (segs + 1) + j;
      const p1 = p0 + segs + 1;
      idx.push(p0, p0 + 1, p1, p0 + 1, p1 + 1, p1); // wound so the grass faces up
    }
  }
  const gg = new THREE.BufferGeometry();
  gg.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  gg.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  gg.setIndex(idx);
  gg.computeVertexNormals();
  const grassMap = new THREE.CanvasTexture(tex.grass);
  grassMap.colorSpace = THREE.SRGBColorSpace;
  grassMap.wrapS = grassMap.wrapT = THREE.RepeatWrapping;
  grassMap.anisotropy = 8;
  const ground = add(mesh(gg, new THREE.MeshLambertMaterial({ map: grassMap }), { receive: true }), C, 0, C);

  // bright yellow gold: half metal so the yellow itself shows, a gleam on top, and a warm glow from within by day
  // that dims at night so it doesn't shine like a lamp in the dark
  const goldMat = new THREE.MeshStandardMaterial({ color: '#ffd400', metalness: 0.5, roughness: 0.25, envMap: kit.goldEnv, envMapIntensity: 1.1, emissive: '#c99400', emissiveIntensity: 0.35 });
  glows.push((dark) => {
    goldMat.emissiveIntensity = 0.35 - 0.31 * dark;
    goldMat.envMapIntensity = 1.1 - 0.75 * dark; // the studio light it reflects goes down with the sun
  });

  // ---------- the terrace: colourful picnic mats on the grass, a beach parasol at each, string lights, vending machines ----------
  const white = mat('#fffaf0');
  const metal = mat('#3b3a36');
  const matStripes = [['#e5484d', '#fff4e6'], ['#2f80c8', '#ffe28a'], ['#16a34a', '#fdf6d8'], ['#f08a24', '#ffffff'], ['#8e5bd8', '#ffe1ec']];
  const shades = ['#ff7a59', '#4fb3e8', '#ffd43b', '#6dd3a0'];
  L.terrace.picnics.forEach((m, k) => {
    const [x, z] = P(m);
    // a woven mat in bold stripes, with a fringe of the lighter colour at the ends
    const [a, b] = matStripes[k % matStripes.length];
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 192;
    const g = c.getContext('2d');
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 ? b : a;
      g.fillRect(i * 32, 0, 32, 192);
    }
    g.fillStyle = 'rgba(255, 255, 255, 0.12)'; // the weave
    for (let y = 0; y < 192; y += 6) g.fillRect(0, y, 256, 2);
    g.fillStyle = b;
    g.fillRect(0, 0, 256, 10);
    g.fillRect(0, 182, 256, 10);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    const rug = mesh(new THREE.BoxGeometry(1.8, 0.02, 1.35), new THREE.MeshLambertMaterial({ map: t }), { receive: true });
    rug.rotation.y = m.rot + Math.PI / 2; // its stripes run across, its long side between the two places
    add(rug, x, 0.012, z);
    // a beach parasol planted at the mat's side, leaning over it
    const px = x + Math.cos(m.rot) * 0.7;
    const pz = z - Math.sin(m.rot) * 0.7;
    const pole = mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.1, 8), white);
    pole.position.set(px, 1.05, pz);
    root.add(pole);
    const shade = mesh(new THREE.ConeGeometry(1.2, 0.42, 12), mat(shades[k % shades.length]), { cast: true });
    shade.position.set(px, 2.15, pz);
    root.add(shade);
    // a picnic basket on the mat
    const basket = mesh(new THREE.BoxGeometry(0.28, 0.16, 0.2), mat('#c9965e'), { cast: true });
    basket.position.set(x - Math.cos(m.rot) * 0.45, 0.1, z + Math.sin(m.rot) * 0.45);
    basket.rotation.y = m.rot;
    root.add(basket);
  });
  // string lights over the terrace
  const bulbMat = new THREE.MeshBasicMaterial({ color: '#fff1c2' });
  const tables = L.terrace.picnics.map(P);
  const lx0 = Math.min(...tables.map((t) => t[0])) - 1.6;
  const lx1 = Math.max(...tables.map((t) => t[0])) + 1.6;
  const lz = Math.max(...tables.map((t) => t[1])) + 1.4;
  for (const x of [lx0, lx1]) add(mesh(new THREE.CylinderGeometry(0.04, 0.05, 2.7, 8), mat('#5b4636'), { cast: true }), x, 1.35, lz);
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.06, 8, 6), bulbMat, 18);
  for (let k = 0; k < 18; k++) {
    const t = k / 17;
    bulbs.setMatrixAt(k, new THREE.Matrix4().makeTranslation(lx0 + (lx1 - lx0) * t, 2.6 - 0.6 * Math.sin(Math.PI * t), lz));
  }
  root.add(bulbs);
  // two vending machines, facing the middle of the terrace
  {
    const [tx, tz] = P(L.terrace);
    L.terrace.vendings.forEach((v, k) => {
      const [x, z] = P(v);
      vendingMachine(x, z, Math.atan2(tx - x, tz - z), k ? '#3f7fb5' : '#b8463e');
    });
  }
  // the golden poop: a statue as big as a temple's Buddha, on a round pale-stone pedestal like a park monument's.
  // Rub it, put your palms together, make a wish (all right there; tapping it walks you up to it)
  {
    const [x, z] = P(L.wish);
    const stone = new THREE.MeshPhongMaterial({ map: rep(plasterTexture(), 2, 1), color: '#e6e0d4', shininess: 25 }); // pale, smooth stone
    const disc = (rTop, rBottom, h, y) => {
      const m = mesh(new THREE.CylinderGeometry(rTop, rBottom, h, 64), stone, { cast: true, receive: true });
      m.position.set(x, y + h / 2, z);
      root.add(m);
    };
    disc(1.45, 1.45, 0.14, 0); // two low round steps
    disc(1.24, 1.24, 0.14, 0.14);
    disc(1.06, 1.0, 0.06, 0.28); // a moulding at the foot of the drum
    disc(0.98, 0.98, 0.34, 0.34); // the drum
    disc(1.14, 1.0, 0.1, 0.68); // a cornice it sits on
    // a brass plaque on the front, facing the way in
    const plaque = mesh(new THREE.BoxGeometry(0.62, 0.16, 0.02), new THREE.MeshPhongMaterial({ color: '#c9a15a', shininess: 90, specular: '#fff1c8' }));
    plaque.position.set(x, 0.51, z + 0.985);
    root.add(plaque);
    const hit = new THREE.Mesh(new THREE.BoxGeometry(2.6, 4.8, 2.6), M.hit);
    hit.position.set(x, 2.4, z);
    hit.userData.wish = true;
    root.add(hit);
    wishHits.push(hit);
    new GLTFLoader().load('/models/golden-poop.glb', (gltf) => {
      const poop = gltf.scene;
      poop.traverse((o) => {
        if (o.isMesh) {
          o.material = goldMat;
          o.castShadow = true;
        }
      });
      poop.scale.setScalar(2.3);
      poop.position.set(x, 0.78, z);
      root.add(poop);
    });
    // a soft light on it at night, no more than the lanterns round it
    const glow = new THREE.PointLight(lampColor, lampPower * 0.25, 7, 1.8);
    glow.position.set(x, 3.6, z + 2.4);
    lamps.add(glow);
  }

  // ---------- the public restroom: an open-fronted pavilion, ten stalls along the back, sinks on the east wall ----------
  {
    const p = L.public;
    const x0 = p.x0 * U;
    const x1 = p.x1 * U;
    const z0 = p.y0 * U;
    const z1 = p.y1 * U;
    const floor = new THREE.MeshPhongMaterial({ map: rep(floorSlabTexture(), (x1 - x0) / 1.2, (z1 - z0) / 1.2), shininess: 30, specular: '#3a3428' });
    strip(x0, z0, x1, z1, floor, 0.015);
    const tile = (w, h) => new THREE.MeshLambertMaterial({ map: rep(wallTileTexture(), w / 1.2, h / 1.2) });
    const WH = L.wallH * U; // walls well over head height, so the building towers over you
    block(x1 - x0 + 0.4, WH, 0.2, tile(x1 - x0, WH), (x0 + x1) / 2, WH / 2, z0 - 0.1);    // back wall
    for (const x of [x0, x1]) block(0.2, WH, z1 - z0, tile(z1 - z0, WH), x, WH / 2, (z0 + z1) / 2); // side walls
    for (const x of [x0, x1]) block(0.34, 0.16, z1 - z0 + 0.1, mat('#ffffff'), x, WH + 0.08, (z0 + z1) / 2); // white copings
    block(x1 - x0 + 0.5, 0.16, 0.34, mat('#ffffff'), (x0 + x1) / 2, WH + 0.08, z0 - 0.1);
    // the sink counter along the east wall, with a long mirror above it
    const sc = L.sinkCounter;
    const cx = ((sc.x0 + sc.x1) / 2) * U;
    const cz = ((sc.y0 + sc.y1) / 2) * U;
    const cw = (sc.x1 - sc.x0) * U;
    const cd = (sc.y1 - sc.y0) * U;
    // a counter low enough for little hands (everyone here is about a metre tall)
    block(cw, 0.46, cd, tile(cd, 0.46), cx, 0.23, cz);
    block(cw + 0.08, 0.05, cd + 0.08, mat('#fbfbf8'), cx, 0.485, cz);
    const chrome = new THREE.MeshPhongMaterial({ color: '#d4dbe2', shininess: 110, specular: '#ffffff' });
    for (const s of L.sinks.filter((k) => !k.pond)) { // the pond's washing spots have no basin
      const z = s.y * U;
      // the basin near the front edge, where a hand can reach it; the tap behind it
      const front = sc.x0 * U;
      add(mesh(new THREE.CylinderGeometry(0.19, 0.16, 0.08, 20), mat('#ffffff')), front + 0.27, 0.54, z);
      add(mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.2, 8), chrome), front + 0.52, 0.6, z);
      add(mesh(new THREE.BoxGeometry(0.24, 0.035, 0.035), chrome), front + 0.41, 0.69, z);
    }
    const mirror = new THREE.Mesh(new THREE.PlaneGeometry(cd - 0.1, 0.8), new THREE.MeshPhongMaterial({ color: '#d9ecf2', emissive: '#3d5560', shininess: 140 }));
    mirror.rotation.y = -Math.PI / 2;
    add(mirror, x1 - 0.12, 1.15, cz);
  }

  // ---------- the premium restroom: a villa in the manner of Aman's tropical pavilions. Long and low; cream lime walls
  // on a honed stone base; a veranda of light teak posts and a teak deck before the doors; a steep pitched roof of
  // dark wooden shingles with timber-latticed gables and upswept finials; two long, still, dark reflecting pools with
  // lilies and floating candles either side of a stepping-stone path; stone lanterns, frangipani and palms ----------
  {
    const p = L.private;
    const x0 = p.x0 * U;
    const x1 = p.x1 * U;
    const z0 = p.y0 * U;
    const z1 = p.y1 * U;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const W = x1 - x0;
    const D = z1 - z0;
    const canvasMat = (w, h, draw, extra = {}, Mat = THREE.MeshLambertMaterial) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      draw(c.getContext('2d'));
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      return new Mat({ map: t, ...extra });
    };
    const wood = mat('#a8794c'); // a light honey teak
    const teakDeck = canvasMat(256, 64, (g) => {
      g.fillStyle = '#c8955f';
      g.fillRect(0, 0, 256, 64);
      for (let k = 0; k < 8; k++) {
        g.fillStyle = k % 2 ? '#bd8a55' : '#d29f69';
        g.fillRect(0, k * 8, 256, 7);
        g.fillStyle = 'rgba(60, 36, 18, 0.6)';
        g.fillRect(0, k * 8 + 7, 256, 1);
        g.fillRect(((k * 97) % 200) + 20, k * 8, 1, 7);
      }
    });
    teakDeck.map.repeat.set((W + 1.2) / 2, 1.3 / 0.5);
    const WALL = 3.0;
    // the walls: bright lime white, a honed stone base, a light teak band at the top
    block(W, WALL, D, mat('#faf5ec'), cx, WALL / 2, cz);
    block(W + 0.1, 0.3, D + 0.05, mat('#d6cfc3'), cx, 0.15, cz - 0.025);
    block(W + 0.04, 0.16, D + 0.04, wood, cx, WALL - 0.08, cz);
    // the veranda: a teak deck a step up, light teak posts on stone footings along its edge
    block(W + 1.2, 0.1, 1.3, teakDeck, cx, 0.05, z1 + 0.65, { receive: true });
    block(W + 1.24, 0.04, 0.06, wood, cx, 0.08, z1 + 1.3);
    const posts = L.templeColumns.map((c) => [c.x * U, c.y * U]);
    const E = 3.1; // the eaves
    const m4 = new THREE.Matrix4();
    for (const [geo, material, y] of [
      [new THREE.BoxGeometry(0.3, 0.16, 0.3), mat('#d6cfc3'), 0.18],
      [new THREE.BoxGeometry(0.17, E - 0.26, 0.17), wood, 0.26 + (E - 0.26) / 2],
    ]) {
      const im = new THREE.InstancedMesh(geo, material, posts.length);
      posts.forEach(([x, z], k) => im.setMatrixAt(k, m4.makeTranslation(x, y, z)));
      im.castShadow = im.receiveShadow = true;
      root.add(im);
    }
    block(W + 1.0, 0.22, 0.2, wood, cx, E - 0.11, posts[0][1]); // the beam across the post tops
    // the veranda's ceiling: teak boards under the eaves
    const ceil = mesh(new THREE.PlaneGeometry(W + 1.0, 1.25), teakDeck);
    ceil.rotation.x = Math.PI / 2;
    add(ceil, cx, E - 0.22, z1 + 0.62);
    // a woven lantern hung from the beam over each post, glowing at night
    const lantern = new THREE.MeshLambertMaterial({ color: '#d6b07a', emissive: '#ffb860', emissiveIntensity: 0.05 });
    const lanterns = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.11, 0.13, 0.3, 14), lantern, posts.length);
    posts.forEach(([x, z], k) => lanterns.setMatrixAt(k, m4.makeTranslation(x, E - 0.55, z - 0.35)));
    root.add(lanterns);
    // the roof: steep, pitched, the ridge along the building, warm wooden shingles, the eaves reaching out over the deck
    const shingle = canvasMat(128, 128, (g) => {
      for (let row = 0; row < 8; row++) {
        for (let k = 0; k < 8; k++) {
          const t = 0.85 + rnd(row * 8 + k + 900) * 0.3;
          g.fillStyle = `rgb(${Math.round(150 * t)}, ${Math.round(124 * t)}, ${Math.round(96 * t)})`;
          g.fillRect(k * 16 + (row % 2) * 8, row * 16, 15, 15);
        }
        g.fillStyle = 'rgba(70, 50, 34, 0.45)';
        g.fillRect(0, row * 16 + 15, 128, 1);
      }
    }, { side: THREE.DoubleSide });
    shingle.map.repeat.set(10, 4);
    const zf = posts[0][1] + 0.55;
    const zb = z0 - 0.6;
    const ridgeZ = (zf + zb) / 2;
    const rise = 2.3;
    const rx0 = x0 - 0.7;
    const rx1 = x1 + 0.7;
    const top = E + rise;
    const v = [[rx0, E, zf], [rx1, E, zf], [rx1, top, ridgeZ], [rx0, top, ridgeZ], [rx1, E, zb], [rx0, E, zb]];
    const slopes = [[0, 1, 2], [0, 2, 3], [4, 5, 3], [4, 3, 2]];
    const uvs = [[0, 0], [1, 0], [1, 1], [0, 1], [1, 0], [0, 0]];
    const roofGeo = new THREE.BufferGeometry();
    roofGeo.setAttribute('position', new THREE.Float32BufferAttribute(slopes.flat().flatMap((k) => v[k]), 3));
    roofGeo.setAttribute('uv', new THREE.Float32BufferAttribute(slopes.flat().flatMap((k) => uvs[k]), 2));
    roofGeo.computeVertexNormals();
    root.add(mesh(roofGeo, shingle, { cast: true, receive: true }));
    // the gables: a timber lattice in each triangle, set back a little under the roof's edge
    const lattice = canvasMat(64, 64, (g) => {
      g.fillStyle = '#a07650';
      g.fillRect(0, 0, 64, 64);
      g.strokeStyle = '#d6b48a';
      g.lineWidth = 3;
      for (let k = -64; k < 128; k += 12) {
        g.beginPath();
        g.moveTo(k, 0);
        g.lineTo(k + 64, 64);
        g.moveTo(k + 64, 0);
        g.lineTo(k, 64);
        g.stroke();
      }
    }, { side: THREE.DoubleSide });
    lattice.map.repeat.set(4, 2);
    for (const gx of [x0 - 0.05, x1 + 0.05]) {
      const gv = [[gx, E, zf - 0.35], [gx, E, zb + 0.35], [gx, top - 0.25, ridgeZ]];
      const gg = new THREE.BufferGeometry();
      gg.setAttribute('position', new THREE.Float32BufferAttribute(gv.flat(), 3));
      gg.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2));
      gg.computeVertexNormals();
      root.add(mesh(gg, lattice));
    }
    // dark bargeboards up the gable edges, a ridge cap, and upswept finials at the ends of the ridge
    const slope = Math.atan2(rise, zf - ridgeZ);
    for (const gx of [rx0, rx1]) {
      for (const [zEdge, s] of [[zf, 1], [zb, -1]]) {
        const barge = mesh(new THREE.BoxGeometry(0.08, 0.2, Math.hypot(zEdge - ridgeZ, rise) + 0.1), wood, { cast: true });
        barge.rotation.x = s * slope;
        add(barge, gx, E + rise / 2 + 0.06, (zEdge + ridgeZ) / 2);
      }
      const finial = mesh(new THREE.ConeGeometry(0.07, 0.7, 8), wood, { cast: true });
      finial.rotation.z = gx < cx ? 0.6 : -0.6;
      add(finial, gx + (gx < cx ? -0.15 : 0.15), top + 0.3, ridgeZ);
    }
    block(rx1 - rx0 + 0.1, 0.16, 0.22, wood, cx, top + 0.02, ridgeZ);
    block(rx1 - rx0, 0.16, 0.06, wood, cx, E - 0.02, zf); // the front fascia
    // a warm light hidden under the beam, for the doors at night
    const strip = new THREE.MeshLambertMaterial({ color: '#fff1d6', emissive: '#ffc070', emissiveIntensity: 0.2 });
    block(W + 0.8, 0.02, 0.04, strip, cx, E - 0.23, posts[0][1] - 0.12);
    // the reflecting pools: dark, still water in a cream stone edge, lily pads and floating candles
    const water = new THREE.MeshPhongMaterial({ color: '#1f3b3f', shininess: 140, specular: '#9fc7cf', emissive: '#0a1517' });
    const coping = mat('#e2d8c4');
    const flame = new THREE.MeshLambertMaterial({ color: '#ffd28a', emissive: '#ffb050', emissiveIntensity: 0.2 });
    for (const pool of L.villaPools) {
      const [px0, px1, pz0, pz1] = [pool.x0 * U, pool.x1 * U, pool.y0 * U, pool.y1 * U];
      const pw = px1 - px0;
      const pd = pz1 - pz0;
      const pcx = (px0 + px1) / 2;
      const pcz = (pz0 + pz1) / 2;
      block(pw + 0.3, 0.12, pd + 0.3, coping, pcx, 0.06, pcz);
      block(pw, 0.02, pd, water, pcx, 0.125, pcz, { receive: true });
      for (let k = 0; k < 5; k++) {
        const lily = mesh(new THREE.CircleGeometry(0.2, 14, 0.3, Math.PI * 1.8), mat('#4f7a44'));
        lily.rotation.x = -Math.PI / 2;
        add(lily, px0 + (0.1 + 0.8 * rnd(k + pcx * 10)) * pw, 0.14, pz0 + (0.2 + 0.6 * rnd(k + 33 + pcx)) * pd);
      }
      for (let k = 0; k < 3; k++) {
        const x = px0 + ((k + 0.5) / 3) * pw;
        add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.06, 12), mat('#f4efe4')), x, 0.16, pcz + (k % 2 ? 0.25 : -0.25));
        add(mesh(new THREE.ConeGeometry(0.02, 0.06, 8), flame, { cast: false }), x, 0.22, pcz + (k % 2 ? 0.25 : -0.25));
      }
    }
    // the path between the pools: big slate stepping stones in gravel
    block(1.8, 0.02, (L.villaPools[0].y1 - L.villaPools[0].y0) * U + 0.3, mat('#cfc6b4'), cx, 0.01, (L.villaPools[0].y0 + L.villaPools[0].y1) / 2 * U);
    for (let k = 0; k < 3; k++) block(1.1, 0.06, 0.42, mat('#5f6466'), cx, 0.04, z1 + 1.55 + k * 0.55);
    // stone lanterns at the head of the path, glowing at night
    const glowStone = new THREE.MeshLambertMaterial({ color: '#efe6d2', emissive: '#ffc070', emissiveIntensity: 0.05 });
    for (const sx of [-1.2, 1.2]) {
      const lx = cx + sx;
      const lz = z1 + 3.1;
      add(mesh(new THREE.BoxGeometry(0.34, 0.5, 0.34), mat('#d6cfc3')), lx, 0.25, lz);
      add(mesh(new THREE.BoxGeometry(0.3, 0.26, 0.3), glowStone), lx, 0.63, lz);
      add(mesh(new THREE.BoxGeometry(0.42, 0.08, 0.42), mat('#8f877c')), lx, 0.8, lz);
    }
    // two frangipani trees by the pools: a grey branching trunk, rosettes of long leaves, white flowers with yellow hearts
    const bark = mat('#8b8378');
    const leafMat = new THREE.MeshLambertMaterial({ color: '#4a7d3c', side: THREE.DoubleSide });
    const petal = mat('#fbf7ee');
    for (const [fx, fz] of [[x0 - 0.2, z1 + 3.4], [x1 + 0.2, z1 + 3.4]]) {
      add(mesh(new THREE.CylinderGeometry(0.06, 0.09, 1.4, 8), bark), fx, 0.7, fz);
      for (let b = 0; b < 4; b++) {
        const a = (b / 4) * Math.PI * 2 + 0.4;
        const br = mesh(new THREE.CylinderGeometry(0.035, 0.05, 1.0, 6), bark);
        br.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6);
        add(br, fx + Math.cos(a) * 0.28, 1.75, fz + Math.sin(a) * 0.28);
        const tx = fx + Math.cos(a) * 0.58;
        const tz = fz + Math.sin(a) * 0.58;
        for (let l = 0; l < 6; l++) {
          const la = (l / 6) * Math.PI * 2;
          const leaf = mesh(new THREE.SphereGeometry(1, 10, 6), leafMat);
          leaf.scale.set(0.32, 0.03, 0.09);
          leaf.position.set(tx + Math.cos(la) * 0.26, 2.2, tz + Math.sin(la) * 0.26);
          leaf.rotation.set(0, -la, 0.35);
          root.add(leaf);
        }
        for (let f = 0; f < 4; f++) {
          add(mesh(new THREE.SphereGeometry(0.05, 8, 6), petal, { cast: false }), tx + Math.cos(f * 1.6) * 0.09, 2.27, tz + Math.sin(f * 1.6) * 0.09);
        }
      }
    }
    glows.push((dark) => {
      strip.emissiveIntensity = 0.2 + 0.9 * dark;
      lantern.emissiveIntensity = 0.05 + 1.0 * dark;
      flame.emissiveIntensity = 0.2 + 1.0 * dark;
      glowStone.emissiveIntensity = 0.05 + 0.9 * dark;
    });
    // the back garden behind the villa, open, with no wall round it: a soft lawn, a lotus pond in a stone edge,
    // banana plants, bird-of-paradise, rocks and a frangipani
    {
      const G = L.villaGarden;
      const [gx0, gx1, gz0, gz1] = [G.x0 * U, G.x1 * U, G.y0 * U, G.y1 * U];
      const gcx = (gx0 + gx1) / 2;
      const gcz = (gz0 + gz1) / 2;
      const capMat = mat('#d8cfbf');
      block(gx1 - gx0, 0.03, gz1 - gz0, mat('#8fbf6a'), gcx, 0.015, gcz, { receive: true }); // the lawn, greener
      // the lotus pond, toward the back, pink flowers on the pads
      const pondX = gcx - 1.2;
      const pondZ = gz0 + 2.2;
      const rim = mesh(new THREE.CylinderGeometry(1.75, 1.8, 0.14, 40), capMat);
      rim.scale.z = 0.55;
      add(rim, pondX, 0.07, pondZ);
      const water = mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.02, 40), new THREE.MeshPhongMaterial({ color: '#5fa7a8', shininess: 120, specular: '#ffffff' }));
      water.scale.z = 0.55;
      add(water, pondX, 0.14, pondZ);
      for (let k = 0; k < 7; k++) {
        const a = rnd(k + 300) * Math.PI * 2;
        const d = 0.3 + rnd(k + 310) * 1.0;
        const px = pondX + Math.cos(a) * d;
        const pz = pondZ + Math.sin(a) * d * 0.5;
        const pad = mesh(new THREE.CircleGeometry(0.2, 14, 0.3, Math.PI * 1.8), mat('#5f9a4c'));
        pad.rotation.x = -Math.PI / 2;
        add(pad, px, 0.16, pz);
        if (k % 2 === 0) add(mesh(new THREE.ConeGeometry(0.07, 0.12, 6), mat('#f3a7c0'), { cast: false }), px + 0.05, 0.22, pz);
      }
      // banana plants: a few great paddle leaves on short trunks
      const banana = new THREE.MeshLambertMaterial({ color: '#6aa84f', side: THREE.DoubleSide });
      for (const [bx, bz, h] of [[gx0 + 0.8, gz0 + 0.9, 1.6], [gx1 - 0.9, gz0 + 1.0, 1.9], [gx1 - 1.6, gz1 - 1.3, 1.4]]) {
        add(mesh(new THREE.CylinderGeometry(0.07, 0.1, h, 8), mat('#7d8a4c')), bx, h / 2, bz);
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2;
          const leaf = mesh(new THREE.SphereGeometry(1, 12, 6), banana);
          leaf.scale.set(0.75, 0.03, 0.25);
          leaf.position.set(bx + Math.cos(a) * 0.55, h + 0.15, bz + Math.sin(a) * 0.55);
          leaf.rotation.set(0, -a, -0.5);
          root.add(leaf);
        }
      }
      // bird-of-paradise clumps along the walls, orange flowers
      const bop = new THREE.MeshLambertMaterial({ color: '#4f8a46', side: THREE.DoubleSide });
      for (let c = 0; c < 6; c++) {
        const bx = gx0 + 0.5 + (c / 5) * (gx1 - gx0 - 1.0);
        const bz = gz0 + 0.45;
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * Math.PI * 2;
          const leaf = mesh(new THREE.SphereGeometry(1, 10, 6), bop);
          leaf.scale.set(0.12, 0.42, 0.04);
          leaf.position.set(bx + Math.cos(a) * 0.12, 0.45, bz + Math.sin(a) * 0.12);
          leaf.rotation.set(Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4);
          root.add(leaf);
        }
        add(mesh(new THREE.ConeGeometry(0.05, 0.22, 6), mat('#f08a2c'), { cast: false }), bx + 0.08, 0.95, bz).rotation.z = -1.1;
      }
      // a few smooth rocks by the pond
      for (let k = 0; k < 5; k++) {
        const rock = mesh(new THREE.SphereGeometry(0.22 + rnd(k + 330) * 0.15, 12, 8), mat('#b5ada0'));
        rock.scale.y = 0.55;
        add(rock, pondX + 1.9 + rnd(k + 340) * 0.8, 0.08, pondZ - 0.4 + k * 0.25);
      }
    }
    // the palms: a ringed trunk curving up, a crown of drooping fronds, a few coconuts
    const trunkMat = mat('#8a7458');
    const frondMat = new THREE.MeshLambertMaterial({ color: '#4f8f3e', side: THREE.DoubleSide });
    for (const palm of L.palms) {
      const [px, pz] = P(palm);
      const n = 8;
      let x = px;
      let y = 0;
      for (let k = 0; k < n; k++) {
        const seg = palm.h / n;
        const lean = palm.lean * (k / n) * (k / n);
        const piece = mesh(new THREE.CylinderGeometry(0.11 - k * 0.006, 0.13 - k * 0.006, seg + 0.02, 10), trunkMat);
        piece.rotation.z = -lean * 0.6;
        add(piece, x, y + seg / 2, pz);
        x += Math.sin(lean * 0.6) * seg;
        y += seg;
      }
      for (let k = 0; k < 9; k++) {
        const a = (k / 9) * Math.PI * 2;
        const frond = mesh(new THREE.SphereGeometry(1, 12, 6), frondMat);
        frond.scale.set(1.5, 0.05, 0.28);
        frond.position.set(x + Math.cos(a) * 1.2, y - 0.35, pz + Math.sin(a) * 1.2);
        frond.rotation.set(0, -a, -0.45);
        root.add(frond);
      }
      for (let k = 0; k < 3; k++) add(mesh(new THREE.SphereGeometry(0.1, 10, 8), mat('#6b5a2c')), x + Math.cos(k * 2) * 0.15, y - 0.15, pz + Math.sin(k * 2) * 0.15);
    }
  }





  // ---------- the 쾌변 exercise ground: a wide open lawn in a clearing, mats in rows, walk in from any side ----------
  {
    const [x, z] = P(L.exercise);
    const r = L.exercise.r * U;
    disc(r, new THREE.MeshLambertMaterial({ color: '#a2c47c' }), x, z, 0.008, 64);
    const matColors = ['#e0b9a0', '#b5cfa6', '#ecd29c', '#c9bbdc', '#a9c9d4', '#ecc6c6']; // soft cotton colours
    L.mats.forEach((m, k) => {
      block(m.w * U, 0.03, m.d * U, mat(matColors[k % matColors.length]), m.x * U, 0.02, m.y * U, { receive: true });
    });
    flowerPatch(x - r * 0.15, z - r - 0.6, 1.6, 26, 11);
    flowerPatch(x - r * 0.2, z + r + 0.6, 1.6, 26, 12);
  }

  // ---------- the bushes: a big thicket out west where the forest starts, and smaller patches here and there.
  // Animals (and anyone without a stall) go in any of them ----------
  {
    const leafy = new THREE.MeshLambertMaterial({ map: leafTexture(), alphaTest: 0.5, side: THREE.DoubleSide });
    const tuft = new THREE.MeshLambertMaterial({ map: grassTuftTexture(), alphaTest: 0.4, side: THREE.DoubleSide });
    const ground = new THREE.MeshLambertMaterial({ color: '#86b062' });
    const tints = ['#ffffff', '#e8eedc', '#f4f0dc'];
    const m4 = new THREE.Matrix4();
    const spots = []; // [x, z, shrub size] for every shrub
    const blades = []; // [x, z, size, turn] for every tuft of grass
    L.bushes.forEach((b, n) => {
      const bx = b.x * U;
      const bz = b.y * U;
      const r = b.r * U;
      const big = n === 0;
      disc(r + 0.4, ground, bx, bz, 0.004, 40);
      const area = r * r;
      const shrubs = Math.round(area * (big ? 2.6 : 1.3));
      for (let k = 0; k < shrubs; k++) {
        const seed = n * 1000 + k;
        const a = rnd(seed + 400) * Math.PI * 2;
        // the big thicket keeps a clearing in the middle, where people squat; small patches are dense right through
        const d = big ? 2.6 + Math.sqrt(rnd(seed + 500)) * (r - 3.0) : 0.6 + Math.sqrt(rnd(seed + 500)) * (r - 0.6);
        spots.push([bx + Math.cos(a) * d, bz + Math.sin(a) * d, 0.55 + rnd(seed + 600) * 0.55, rnd(seed + 650) * Math.PI]);
      }
      const tufts = Math.round(area * 20);
      for (let k = 0; k < tufts; k++) {
        const seed = n * 5000 + k;
        const a = rnd(seed + 700) * Math.PI * 2;
        const d = Math.sqrt(rnd(seed * 1.37 + 800)) * (r + 0.6);
        blades.push([bx + Math.cos(a) * d, bz + Math.sin(a) * d, 0.5 + rnd(seed + 900) * 0.45, rnd(seed + 950) * Math.PI]);
      }
    });
    // leafy shrubs: crossed cards of painted leaves round a shaded core, about waist high
    const shrubMesh = new THREE.InstancedMesh(cardsGeometry(3, true), leafy, spots.length);
    const cores = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), mat('#466c34'), spots.length); // the shade inside
    spots.forEach(([x, z, s, turn], k) => {
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, turn, 0));
      shrubMesh.setMatrixAt(k, m4.compose(new THREE.Vector3(x, -0.05, z), q, new THREE.Vector3(s * 1.2, s * 0.85, s * 1.2)));
      shrubMesh.setColorAt(k, new THREE.Color(tints[k % 3]));
      cores.setMatrixAt(k, m4.compose(new THREE.Vector3(x, s * 0.25, z), q, new THREE.Vector3(s * 0.35, s * 0.25, s * 0.35)));
    });
    shrubMesh.castShadow = true;
    // tall grass all through
    const tuftMesh = new THREE.InstancedMesh(cardsGeometry(2, false), tuft, blades.length);
    blades.forEach(([x, z, s, turn], k) => {
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, turn, 0));
      tuftMesh.setMatrixAt(k, m4.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(s, s, s)));
    });
    root.add(shrubMesh, cores, tuftMesh);
  }

  // ---------- lamps: low black garden bollards lining the way in, tall old-fashioned park lamps round the courtyard.
  // Frosted glass by day; at night it glows, with a soft halo round it and a pool of warm light on the ground ----------
  {
    const wood = mat('#4a3a2c');
    const stone = mat('#8d8a82');
    const paper = new THREE.MeshLambertMaterial({ color: '#f6efdc', emissive: '#ffb85c', emissiveIntensity: 0.05 }); // frosted glass
    const glowTex = (inner, size = 128) => {
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const g = c.getContext('2d');
      const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      grad.addColorStop(0, inner);
      grad.addColorStop(0.35, 'rgba(255, 190, 110, 0.35)');
      grad.addColorStop(1, 'rgba(255, 170, 90, 0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, size, size);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    };
    const haloMat = new THREE.SpriteMaterial({ map: glowTex('rgba(255, 225, 160, 0.9)'), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 });
    const poolMat = new THREE.MeshBasicMaterial({ map: glowTex('rgba(255, 200, 120, 0.55)'), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 });
    glows.push((dark) => {
      paper.emissiveIntensity = 0.05 + 1.05 * dark;
      haloMat.opacity = dark * 0.9;
      poolMat.opacity = dark * 0.8;
    });
    const iron = new THREE.MeshPhongMaterial({ color: '#26272b', shininess: 60, specular: '#555555' }); // black cast iron
    const cyl = (rt, rb, ht, segs = 16) => new THREE.CylinderGeometry(rt, rb, ht, segs);
    // [geometry, material, height] for each part
    const design = (low) =>
      low
        ? [
            // a garden bollard: a short black post with a glass lamp on top under a little round cap
            [cyl(0.075, 0.09, 0.08), iron, 0.04],
            [cyl(0.05, 0.055, 0.42), iron, 0.29],
            [cyl(0.075, 0.07, 0.03), iron, 0.515],
            [cyl(0.065, 0.065, 0.13), paper, 0.6],
            [cyl(0.03, 0.1, 0.05), iron, 0.69],
            [new THREE.SphereGeometry(0.022, 8, 6), iron, 0.73],
          ]
        : [
            // an old park lamp: a stepped base, a slim fluted post, a collar, and a four-sided glass lantern with a cap
            [cyl(0.13, 0.16, 0.12), iron, 0.06],
            [cyl(0.075, 0.12, 0.25), iron, 0.245],
            [cyl(0.045, 0.06, 2.0, 12), iron, 1.37],
            [cyl(0.07, 0.07, 0.05), iron, 2.4],
            [cyl(0.03, 0.06, 0.08), iron, 2.46],
            [cyl(0.14, 0.135, 0.34, 4).rotateY(Math.PI / 4), paper, 2.67], // the glass
            [new THREE.BoxGeometry(0.27, 0.03, 0.27), iron, 2.855],
            [cyl(0.02, 0.2, 0.14, 4).rotateY(Math.PI / 4), iron, 2.94],
            [cyl(0.012, 0.012, 0.08, 6), iron, 3.04],
            [new THREE.SphereGeometry(0.03, 8, 6), iron, 3.09],
          ];
    const m4 = new THREE.Matrix4();
    for (const [low, list] of [[false, L.lampPosts.filter((l) => !l.low)], [true, L.lampPosts.filter((l) => l.low)]]) {
      if (!list.length) continue;
      const h = low ? 0.6 : 2.67; // the middle of the glass, above the ground
      for (const [geo, material, y] of design(low)) {
        const im = new THREE.InstancedMesh(geo, material, list.length);
        list.forEach((l, k) => {
          const [x, z] = P(l);
          im.setMatrixAt(k, m4.makeTranslation(x, y, z));
        });
        im.castShadow = material !== paper;
        root.add(im);
      }
      const pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), poolMat, list.length);
      const r = low ? 2.4 : 4.2;
      list.forEach((l, k) => {
        const [x, z] = P(l);
        pools.setMatrixAt(k, m4.compose(new THREE.Vector3(x, 0.03, z), new THREE.Quaternion(), new THREE.Vector3(r, 1, r)));
        const halo = new THREE.Sprite(haloMat);
        halo.scale.setScalar(low ? 0.9 : 1.3);
        halo.position.set(x, h, z);
        root.add(halo);
      });
      pools.renderOrder = 1;
      root.add(pools);
    }
  }

  // ---------- trees, 동물의 숲 style: round, soft broadleaf trees and some cedars ----------
  // the forest beyond the path is scenery; the few trees on the grounds (L.trees) are obstacles on the server too
  const treeSpots = [];
  const W = L.walk;
  for (let k = 0; k < 170; k++) {
    // round the oval you can walk on, from just past its edge out into the woods
    const a = rnd(k) * Math.PI * 2;
    const e = 1.08 + rnd(k + 100) * 0.75;
    const x = (W.x + Math.cos(a) * W.rx * e) * U;
    const z = (W.y + Math.sin(a) * W.ry * e) * U;
    // keep the way in open: none just behind and beside the entrance, where the camera stands as you arrive
    if (Math.abs(x - L.gate.x * U) < 9 && z > L.gate.y * U - 3 && z < L.gate.y * U + 14) continue;
    if (Math.hypot(x - L.bush.x * U, z - L.bush.y * U) < L.bush.r * U * 0.6) continue; // a clearing in the thicket
    const r = Math.hypot(x - C, z - C);
    treeSpots.push({ x, z, y: groundY(r), s: 1.7 + rnd(k + 200) * 1.5, cedar: rnd(k + 300) < 0.3, k }); // 4 to 8 m tall
  }
  L.trees.forEach((t, n) => treeSpots.push({ x: t.x * U, z: t.y * U, y: 0, s: t.s * 1.5, cedar: false, k: 600 + n }));
  const round = treeSpots.filter((t) => !t.cedar);
  const cedars = treeSpots.filter((t) => t.cedar);
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.14, 0.2, 1, 8), mat('#5b4636'), treeSpots.length);
  const crowns = new THREE.InstancedMesh(crownGeometry(1), new THREE.MeshLambertMaterial({ color: '#ffffff' }), round.length * 3);
  const tiers = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 12), new THREE.MeshLambertMaterial({ color: '#ffffff' }), cedars.length * 3);
  const crownColors = ['#5f9a4a', '#548d43', '#6aa553', '#5a9447']; // fresh, natural greens
  const cedarColors = ['#3f7048', '#38643f'];
  const m4 = new THREE.Matrix4();
  const q0 = new THREE.Quaternion();
  const stoneTex = stoneTexture();
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  treeSpots.forEach((t, i) => {
    const trunkH = (t.cedar ? 0.8 : 1.1) * t.s;
    trunks.setMatrixAt(i, m4.compose(v(t.x, t.y + trunkH / 2, t.z), q0, v(t.s, trunkH, t.s)));
  });
  round.forEach((t, i) => {
    const s = t.s;
    const c = new THREE.Color(crownColors[t.k % crownColors.length]);
    const side = rnd(t.k + 900) * Math.PI * 2;
    const blobs = [
      [0, 1.75, 0, 0.95, 0.85],                                                     // the big round crown
      [Math.cos(side) * 0.6, 1.5, Math.sin(side) * 0.6, 0.6, 0.85],                // two soft bumps on its sides
      [Math.cos(side + 2.4) * 0.55, 1.95, Math.sin(side + 2.4) * 0.55, 0.55, 0.85],
    ];
    blobs.forEach(([ox, oy, oz, r, sy], n) => {
      crowns.setMatrixAt(i * 3 + n, m4.compose(v(t.x + ox * s, t.y + oy * s, t.z + oz * s), q0, v(r * s, r * s * sy, r * s)));
      crowns.setColorAt(i * 3 + n, n ? c.clone().offsetHSL(0, 0, 0.03) : c);
    });
  });
  cedars.forEach((t, i) => {
    const s = t.s;
    [[1.15, 0.95, 0.9], [1.7, 0.75, 0.8], [2.2, 0.5, 0.7]].forEach(([y, r, h], n) => {
      tiers.setMatrixAt(i * 3 + n, m4.compose(v(t.x, t.y + y * s, t.z), q0, v(r * s, h * s, r * s)));
      tiers.setColorAt(i * 3 + n, new THREE.Color(cedarColors[(t.k + n) % 2]));
    });
  });
  trunks.castShadow = crowns.castShadow = tiers.castShadow = true;
  root.add(trunks, crowns, tiers);

  // flowers round the beanstalk's mound
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + 0.3;
    flowerPatch(L.bean.x * U + Math.cos(a) * 1.25, L.bean.y * U + Math.sin(a) * 1.25, 0.3, 6, 50 + k);
  }

  // ---------- stones and grass tufts here and there, out of everyone's way ----------
  {
    const rocks = [];
    for (let k = 0; k < 60 && rocks.length < 26; k++) {
      const a = rnd(k + 1200) * Math.PI * 2;
      const d = (6 + rnd(k + 1300) * 14) ;
      const x = C + Math.cos(a) * d;
      const z = C + Math.sin(a) * d;
      const cm = { x: x / U, y: z / U };
      // clear of everything in the way, and of the two restroom buildings (their tiled floors too)
      const clear = [...L.obstacles, L.public, L.private].every((o) => cm.x < o.x0 - 80 || cm.x > o.x1 + 80 || cm.y < o.y0 - 80 || cm.y > o.y1 + 80);
      const offLawn = Math.hypot(cm.x - L.exercise.x, cm.y - L.exercise.y) > L.exercise.r + 60;
      if (clear && offLawn) rocks.push([x, z, k]);
    }
    const rockMesh = new THREE.InstancedMesh(stoneGeometry(2), new THREE.MeshLambertMaterial({ map: stoneTex }), rocks.length);
    rocks.forEach(([x, z, k], i) => {
      const sz = 0.12 + rnd(k + 1400) * 0.3;
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rnd(k + 1500) * Math.PI * 2, 0));
      rockMesh.setMatrixAt(i, m4.compose(v(x, sz * 0.25, z), q, v(sz * 1.2, sz, sz)));
    });
    rockMesh.castShadow = rockMesh.receiveShadow = true;
    root.add(rockMesh);
    const tuft = new THREE.MeshLambertMaterial({ map: grassTuftTexture(), alphaTest: 0.4, side: THREE.DoubleSide });
    const tufts = new THREE.InstancedMesh(cardsGeometry(2, false), tuft, rocks.length * 3);
    rocks.forEach(([x, z, k], i) => {
      for (let n = 0; n < 3; n++) {
        const a = rnd(k + n * 7 + 1600) * Math.PI * 2;
        const s = 0.3 + rnd(k + n + 1700) * 0.25;
        tufts.setMatrixAt(i * 3 + n, m4.compose(v(x + Math.cos(a) * 0.4, 0, z + Math.sin(a) * 0.4), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, a, 0)), v(s, s, s)));
      }
    });
    root.add(tufts);
  }

  // ---------- the garden between the two restrooms ----------
  flowerPatch(L.garden.x * U, L.garden.y * U, 2.0, 46, 20);
  for (const [px, pz] of [[L.private.x0, L.private.y1], [L.private.x1, L.private.y1], [L.public.x0, L.public.y1], [L.public.x1, L.public.y1]]) {
    flowerPatch(px * U + (px === L.private.x0 || px === L.public.x0 ? -0.6 : 0.6), pz * U + 0.4, 0.5, 10, px % 7);
  }

  // ---------- the pond: clear water, a sandy rim, pebbles and lily pads ----------
  {
    const [x, z] = P(L.pond);
    const r = L.pond.r * U;
    disc(r + 0.35, mat('#a39a86'), x, z, 0.009, 48); // a rim of grey stones
    disc(r, new THREE.MeshPhongMaterial({ color: '#86cfd8', shininess: 100, specular: '#ffffff', emissive: '#2d6670', emissiveIntensity: 0.25 }), x, z, 0.02, 48); // clear, bright water
    const pebbles = new THREE.InstancedMesh(stoneGeometry(1), new THREE.MeshLambertMaterial({ map: stoneTex }), 14);
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2 + rnd(k + 70) * 0.3;
      const sz = 0.14 + rnd(k + 80) * 0.14;
      pebbles.setMatrixAt(k, m4.compose(v(x + Math.cos(a) * (r + 0.2), sz * 0.3, z + Math.sin(a) * (r + 0.2)), q0, v(sz * 1.3, sz * 0.7, sz)));
    }
    pebbles.castShadow = true;
    root.add(pebbles);
    const pad = mat('#5f7d4c');
    for (let k = 0; k < 4; k++) {
      const a = rnd(k + 40) * Math.PI * 2;
      const d = r * (0.3 + rnd(k + 50) * 0.45);
      const lily = mesh(new THREE.CircleGeometry(0.22, 16, 0.3, Math.PI * 1.8), pad);
      lily.rotation.set(-Math.PI / 2, 0, a);
      add(lily, x + Math.cos(a) * d, 0.03, z + Math.sin(a) * d);
    }
    flowerPatch(x - r - 0.8, z + 0.6, 0.7, 14, 33);
    flowerPatch(x + r + 0.7, z - 0.9, 0.6, 12, 34);
  }

  // flowers either side of the way in
  flowerPatch(L.gate.x * U - 2.2, L.gate.y * U - 1.4, 0.9, 18, 40);
  flowerPatch(L.gate.x * U + 2.2, L.gate.y * U - 1.4, 0.9, 18, 41);

  // ---------- build the flowers gathered above ----------
  {
    const petals = ['#ffffff', '#f6c9d4', '#f7e39a', '#d9c8f0', '#ffffff', '#f4d1a8']; // small wild flowers in soft colours
    const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.075, 10, 6), new THREE.MeshLambertMaterial({ color: '#ffffff' }), flowers.length);
    const leafs = new THREE.InstancedMesh(new THREE.ConeGeometry(0.06, 0.2, 5), mat('#5d7a49'), flowers.length);
    flowers.forEach((f, k) => {
      heads.setMatrixAt(k, m4.compose(v(f.x, 0.2 * f.s, f.z), q0, v(f.s * 0.6, f.s * 0.4, f.s * 0.6)));
      heads.setColorAt(k, new THREE.Color(petals[f.c]));
      leafs.setMatrixAt(k, m4.compose(v(f.x, 0.1 * f.s, f.z), q0, v(f.s, f.s, f.s)));
    });
    root.add(heads, leafs);
  }

  // mountains far off, blue in the haze, so the place has a horizon round it
  const peakMat = new THREE.MeshLambertMaterial({ color: '#8a9aa3', flatShading: true });
  for (let k = 0; k < 18; k++) {
    const a = (k / 18) * Math.PI * 2 + rnd(k + 800) * 0.25;
    const r = 175 + rnd(k + 810) * 25;
    const peak = mesh(new THREE.ConeGeometry(30 + rnd(k + 820) * 25, 35 + rnd(k + 830) * 40, 7), peakMat);
    add(peak, C + Math.cos(a) * r, groundY(r) + 8, C + Math.sin(a) * r);
  }
  // low hills on the far rim, softened by the haze
  const hillMat = new THREE.MeshLambertMaterial({ color: '#7d9268', flatShading: true });
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2 + rnd(k + 300) * 0.3;
    const r = 120 + rnd(k + 400) * 30;
    const hill = mesh(new THREE.SphereGeometry(18 + rnd(k + 500) * 14, 10, 6), hillMat);
    hill.scale.y = 0.45;
    add(hill, C + Math.cos(a) * r, groundY(r) - 2, C + Math.sin(a) * r);
  }

  // ---------- night lights: a few warm lights where people gather ----------
  lampLights.length = 0;
  const light = (x, z, share, y = 3.8) => {
    const l = new THREE.PointLight(lampColor, lampPower * share, 16, 1.6);
    l.position.set(x, y, z);
    lamps.add(l);
    lampLights.push([l, share]);
  };
  light(...P(L.bean), 1.4);
  light(((L.public.x0 + L.public.x1) / 2) * U, ((L.public.y0 + L.public.y1) / 2) * U, 1.1);
  light(((L.private.x0 + L.private.x1) / 2) * U, L.private.y1 * U + 1.5, 0.9);
  light(...P(L.exercise), 0.8);

  return { ground };
}
