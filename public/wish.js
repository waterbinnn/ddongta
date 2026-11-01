// 똥타 · the wish page: one golden poop in a dark room, rubbed by everyone.
// Rubbing turns it and wears the gold off where people touch it; golden poops in the toilet gild it back.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const $ = (s) => document.querySelector(s);
const LAP = 108;
const ZONES = 12; // 3 height bands x 4 sides, same split as the server
const RUB_PX = 26; // this much rubbing on the poop counts as one rub
const RUB_GAP_MS = 70;

// ---------- scene ----------

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
$('#scene').append(renderer.domElement);

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
const key = new THREE.DirectionalLight(0xffe2b0, 2.2);
key.position.set(2.5, 5, 4);
const rim = new THREE.DirectionalLight(0xffc070, 1.4);
rim.position.set(-3, 2, -4);
scene.add(key, rim, new THREE.AmbientLight(0x3a2a18, 0.6));

// the poop floats over a soft pool of light
const pool = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,200,110,0.38)');
  grad.addColorStop(0.5, 'rgba(255,170,70,0.12)');
  grad.addColorStop(1, 'rgba(255,170,70,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 4.2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = -0.35;
  scene.add(m);
  return m;
})();

// ---------- the gold that wears off ----------
// Each fragment finds where it sits on the poop (height band, side) and blends the four nearest zones,
// so worn patches fade into each other instead of showing hard edges.

const wearShown = new Float32Array(ZONES); // eases toward the server's numbers
const wearTarget = new Float32Array(ZONES);
const glow = new Float32Array(ZONES); // someone just rubbed here
const uniforms = { uWear: { value: wearShown }, uGlow: { value: glow }, uH: { value: 2.3 }, uFlash: { value: 0 } };

const material = new THREE.MeshStandardMaterial({ color: 0xf0bf55, metalness: 1, roughness: 0.26, envMapIntensity: 1.25 });
material.onBeforeCompile = (shader) => {
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vObj;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = transformed;');
  shader.fragmentShader = shader.fragmentShader
    .replace(
      '#include <common>',
      `#include <common>
      varying vec3 vObj;
      uniform float uWear[${ZONES}];
      uniform float uGlow[${ZONES}];
      uniform float uH;
      uniform float uFlash;
      float zoneMix(float v[${ZONES}]) {
        float band = clamp(clamp(vObj.y / uH, 0.0, 1.0) * 3.0 - 0.5, 0.0, 2.0);
        int b0 = int(floor(band));
        int b1 = min(b0 + 1, 2);
        float fb = band - float(b0);
        float side = (atan(vObj.z, vObj.x) + PI) / (2.0 * PI) * 4.0 - 0.5;
        float fs = fract(side);
        int s0 = int(mod(floor(side) + 4.0, 4.0));
        int s1 = int(mod(float(s0) + 1.0, 4.0));
        return mix(mix(v[b0 * 4 + s0], v[b0 * 4 + s1], fs), mix(v[b1 * 4 + s0], v[b1 * 4 + s1], fs), fb);
      }
      float hash3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      float noise3(vec3 p) {
        vec3 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(hash3(i), hash3(i + vec3(1,0,0)), f.x), mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x), mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y), f.z);
      }`,
    )
    .replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      float w = zoneMix(uWear);
      float n = noise3(vObj * 5.0) * 0.65 + noise3(vObj * 13.0) * 0.35;
      // worn metal shows up in blotches first, like a statue's nose rubbed bright by hands
      float kWear = smoothstep(0.0, 1.0, clamp(w * 1.35 + (n - 0.5) * 0.7 * smoothstep(0.0, 0.12, w), 0.0, 1.0));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.36, 0.17, 0.08), kWear); // dull bronze under the gold`,
    )
    .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.58, kWear);')
    .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 0.7, kWear);')
    .replace(
      '#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.72, 0.3) * (zoneMix(uGlow) * 0.35 + uFlash * 0.5);',
    );
};

const poop = new THREE.Group(); // turned by rubbing, bobbing gently
scene.add(poop);
let model = null;
let height = 2.3;

new GLTFLoader().load('/models/golden-poop.glb', (gltf) => {
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    o.material = material;
    model = o;
  });
  // sit it on y = 0, centred, so zones match on the page and the server
  const g = model.geometry;
  gltf.scene.updateMatrixWorld(true);
  g.applyMatrix4(model.matrixWorld);
  model.position.set(0, 0, 0);
  model.rotation.set(0, 0, 0);
  model.scale.set(1, 1, 1);
  g.computeBoundingBox();
  const box = g.boundingBox;
  g.translate(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
  g.computeBoundingBox();
  height = g.boundingBox.max.y;
  uniforms.uH.value = height;
  poop.add(model);
  fit();
});

// ---------- sizing ----------

function fit() {
  const w = innerWidth;
  const h = innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  // keep the poop about half the screen tall, and fully inside a narrow phone screen
  const half = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const need = Math.max(height * 0.95 / half, 1.75 / (half * camera.aspect));
  const dist = Math.max(6, need);
  camera.position.set(0, height * 0.62 + dist * 0.18, dist);
  camera.lookAt(0, height * 0.42, 0); // looks a little low, so the poop sits above the middle, clear of the controls
  camera.updateProjectionMatrix();
}
addEventListener('resize', fit);
fit();

// ---------- sound (made on the spot; the first touch wakes it) ----------

let audio = null;
let soundOn = true;
try {
  soundOn = localStorage.getItem('ddongta.sound') !== 'off';
} catch {}
const ICON_ON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>';
const ICON_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>';
function showSound() {
  $('#sndBtn').innerHTML = soundOn ? ICON_ON : ICON_OFF;
  $('#sndBtn').setAttribute('aria-label', soundOn ? '소리 끄기' : '소리 켜기');
}
showSound();
$('#sndBtn').addEventListener('click', () => {
  soundOn = !soundOn;
  try {
    // shared with the toilet page: 'off' there and here mean the same
    if (soundOn) localStorage.getItem('ddongta.sound') === 'off' && localStorage.setItem('ddongta.sound', 'fx');
    else localStorage.setItem('ddongta.sound', 'off');
  } catch {}
  showSound();
});
const wake = () => {
  if (!audio) audio = new AudioContext();
  if (audio.state !== 'running') audio.resume().catch(() => {});
};
addEventListener('pointerdown', wake, true);
addEventListener('keydown', wake, true);

let noiseBuf = null;
function rubSound() {
  if (!soundOn || !audio) return;
  const t = audio.currentTime;
  if (!noiseBuf) {
    noiseBuf = audio.createBuffer(1, audio.sampleRate * 0.3, audio.sampleRate);
    const ch = noiseBuf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
  }
  const src = audio.createBufferSource();
  src.buffer = noiseBuf;
  const bp = audio.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 1.2;
  bp.frequency.setValueAtTime(2400 + Math.random() * 500, t);
  bp.frequency.exponentialRampToValueAtTime(900, t + 0.16);
  const g = audio.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.16, t + 0.03);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
  src.connect(bp).connect(g).connect(audio.destination);
  src.start(t);
  src.stop(t + 0.2);
}
// a temple-ish bell: a few inharmonic partials ringing out
function bell(volume = 0.22) {
  if (!soundOn || !audio) return;
  const t = audio.currentTime;
  for (const [ratio, amp, decay] of [[1, 1, 3.2], [2.76, 0.45, 2.2], [5.4, 0.22, 1.4], [8.93, 0.1, 0.9]]) {
    const o = audio.createOscillator();
    o.frequency.value = 392 * ratio;
    const g = audio.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(volume * amp, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    o.connect(g).connect(audio.destination);
    o.start(t);
    o.stop(t + decay + 0.05);
  }
}
const buzz = (ms) => {
  try {
    navigator.vibrate?.(ms);
  } catch {}
};

// ---------- my count: this lap and all time, kept in this browser ----------

let mine = 0;
try {
  mine = Number(localStorage.getItem('ddongta.wish.mine')) || 0;
} catch {}
const fmt = (n) => n.toLocaleString('ko-KR');
function showMine() {
  $('#lap').textContent = `이번 바퀴 ${mine % LAP}번`;
  $('#mine').textContent = `모두 ${fmt(mine)}번`;
}
showMine();

// ---------- gold dust where a rub lands ----------

const dust = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,240,190,1)');
  grad.addColorStop(0.4, 'rgba(255,200,90,0.7)');
  grad.addColorStop(1, 'rgba(255,180,60,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
})();
const specks = [];
const speckMat = new THREE.SpriteMaterial({ map: dust, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
function sparkle(at, count = 6) {
  for (let i = 0; i < count; i++) {
    const s = new THREE.Sprite(speckMat.clone());
    s.position.copy(at);
    s.scale.setScalar(0.12 + Math.random() * 0.1);
    const v = new THREE.Vector3((Math.random() - 0.5) * 0.9, 0.4 + Math.random() * 0.8, (Math.random() - 0.5) * 0.9);
    scene.add(s);
    specks.push({ s, v, life: 0.6 + Math.random() * 0.4, age: 0 });
  }
}

// ---------- rubbing ----------

const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function hit(x, y) {
  if (!model) return null;
  ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  return ray.intersectObject(model, false)[0] || null;
}
function zoneOf(point) {
  const p = model.worldToLocal(point.clone());
  const band = Math.min(2, Math.floor(THREE.MathUtils.clamp(p.y / height, 0, 0.999) * 3));
  const side = Math.floor(((Math.atan2(p.z, p.x) + Math.PI) / (2 * Math.PI)) * 4) % 4;
  return band * 4 + side;
}

let lastRub = 0;
let hintShown = true;
function rub(point) {
  const now = performance.now();
  if (now - lastRub < RUB_GAP_MS) return;
  lastRub = now;
  const z = zoneOf(point);
  send({ t: 'rub', z });
  wearTarget[z] = Math.min(0.9, wearTarget[z] + 0.0005);
  mine++;
  try {
    localStorage.setItem('ddongta.wish.mine', String(mine));
  } catch {}
  showMine();
  rubSound();
  buzz(6);
  sparkle(point);
  if (hintShown) {
    hintShown = false;
    $('#hint').classList.add('out');
  }
  if (mine % LAP === 0) {
    bell();
    buzz([20, 60, 20]);
    sparkle(point, 24);
    notice(`${fmt(mine / LAP)}바퀴 문질렀어요`);
  }
}

let spin = 0.12; // radians per second; rubbing pushes it around
let drag = null;
const canvas = renderer.domElement;
canvas.addEventListener('pointerdown', (e) => {
  drag = { id: e.pointerId, x: e.clientX, y: e.clientY, run: 0, onPoop: !!hit(e.clientX, e.clientY) };
  canvas.setPointerCapture(e.pointerId);
  canvas.classList.add('rubbing');
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const dx = e.clientX - drag.x;
  const dy = e.clientY - drag.y;
  drag.x = e.clientX;
  drag.y = e.clientY;
  spin = THREE.MathUtils.clamp(spin + dx * 0.012, -4, 4); // the poop turns the way you rub, like a bead under the thumb
  const h = hit(e.clientX, e.clientY);
  if (!h) return;
  drag.run += Math.hypot(dx, dy);
  if (drag.run >= RUB_PX) {
    drag.run = 0;
    rub(h.point);
  }
});
const endDrag = () => {
  drag = null;
  canvas.classList.remove('rubbing');
};
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

// Space held down rubs the side facing you
let spaceHeld = false;
let spaceTimer = 0;
addEventListener('keydown', (e) => {
  if (e.code !== 'Space' || document.activeElement === $('#wishInput')) return;
  e.preventDefault();
  spaceHeld = true;
});
addEventListener('keyup', (e) => {
  if (e.code === 'Space') spaceHeld = false;
});

// ---------- the line in the middle: golden-poop news, finished laps ----------

let noticeTimer = 0;
function notice(text) {
  const el = $('#notice');
  el.textContent = text;
  el.hidden = false;
  el.classList.remove('out');
  $('#hint').classList.add('out');
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => {
    el.classList.add('out');
    noticeTimer = setTimeout(() => (el.hidden = true), 800);
  }, 2600);
}

// ---------- floating wishes ----------

const floats = [];
const hiddenIds = new Set();
function project(v) {
  const p = v.clone().project(camera);
  return { x: (p.x + 1) / 2 * innerWidth, y: (1 - p.y) / 2 * innerHeight };
}
// a wish rises from the poop (new ones) or drifts up along the edges (older ones)
function float(text, { id = 0, mine: isMine = false, old = false } = {}) {
  if (id && hiddenIds.has(id)) return;
  const el = document.createElement('div');
  el.className = `wish${isMine ? ' mine' : ''}${old ? ' old' : ''}`;
  const span = document.createElement('span');
  span.textContent = text;
  el.append(span);
  if (id && !isMine) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = '✕';
    b.title = '이 소원 가리기';
    b.setAttribute('aria-label', '이 소원 가리기');
    b.addEventListener('click', () => {
      hiddenIds.add(id);
      send({ t: 'hide', id });
      el.remove();
    });
    el.append(b);
  }
  $('#floats').append(el);
  const w = el.offsetWidth;
  let x;
  let y;
  if (old) {
    const left = Math.random() < 0.5;
    x = left ? 12 + Math.random() * innerWidth * 0.12 : innerWidth - w - 12 - Math.random() * innerWidth * 0.12;
    y = innerHeight * (0.45 + Math.random() * 0.2);
  } else {
    const top = project(new THREE.Vector3(0, height * 0.75, 0));
    x = THREE.MathUtils.clamp(top.x - w / 2 + (Math.random() - 0.5) * 120, 12, innerWidth - w - 12);
    y = top.y;
  }
  floats.push({ el, id, x, y, vy: old ? 14 : 26, life: old ? 16 : 9, age: 0, sway: Math.random() * 6 });
  if (!old) sparkle(new THREE.Vector3(0, height * 0.9, 0), isMine ? 18 : 8);
}
let backlog = []; // recent wishes, shown one by one along the edges
setInterval(() => {
  if (!backlog.length || document.hidden) return;
  const w = backlog.shift();
  backlog.push(w);
  float(w.text, { id: w.id, old: true });
}, 6000);

let lastWish = 0;
$('#wishForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('#wishInput');
  const text = input.value.replace(/\s+/g, ' ').trim();
  if (!text) return;
  if (Date.now() - lastWish < 8000) {
    notice('조금 뒤에 다시 띄울 수 있어요');
    return;
  }
  lastWish = Date.now();
  send({ t: 'wish', text });
  float(text, { mine: true });
  hintShown = false;
  $('#hint').classList.add('out');
  bell(0.12);
  input.value = '';
  input.blur();
});

// ---------- talking to the server ----------

let ws = null;
let online = 0;
function connect() {
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws?wish=1`);
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.t === 'w') {
      m.wear.forEach((v, i) => (wearTarget[i] = v));
      if (m.hello) wearShown.set(wearTarget); // no fading in on arrival
      for (const z of m.touched || []) glow[z] = Math.max(glow[z], 0.8);
      online = m.online;
      $('#today').textContent = `오늘 ${fmt(m.today)}번 문질러졌어요`;
      $('#online').textContent = online > 1 ? `${fmt(online)}명이 같이 빌고 있어요` : '지금은 혼자 빌고 있어요';
      if (m.wishes) backlog = m.wishes.filter((w) => !hiddenIds.has(w.id));
    } else if (m.t === 'wish') {
      float(m.text, { id: m.id });
      backlog.push({ id: m.id, text: m.text });
      if (backlog.length > 12) backlog.shift();
    } else if (m.t === 'unwish') {
      hiddenIds.add(m.id);
      backlog = backlog.filter((w) => w.id !== m.id);
      for (const f of floats) if (f.id === m.id) f.el.remove();
    } else if (m.t === 'gild') {
      uniforms.uFlash.value = 1;
      notice('누군가 황금똥을 눴어요. 금칠이 조금 돌아왔어요');
    }
  };
  ws.onclose = () => setTimeout(connect, 2000);
}
function send(msg) {
  if (ws?.readyState === 1) ws.send(JSON.stringify(msg));
}
connect();

// ---------- loop ----------

const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.elapsedTime;

  // turning: rubbing pushes it, then it settles back to a slow idle turn
  spin += (0.12 - spin) * Math.min(1, dt * 1.6);
  poop.rotation.y += spin * dt;
  poop.position.y = Math.sin(t * 0.9) * 0.05; // breathing
  pool.material.opacity = 0.85 + Math.sin(t * 0.9) * 0.1;

  if (spaceHeld && model) {
    spaceTimer -= dt;
    if (spaceTimer <= 0) {
      spaceTimer = 0.2;
      spin = Math.min(4, spin + 0.5);
      const h = hit(innerWidth / 2 + (Math.random() - 0.5) * 40, project(new THREE.Vector3(0, height * 0.45, 0)).y);
      if (h) rub(h.point);
    }
  }

  for (let i = 0; i < ZONES; i++) {
    wearShown[i] += (wearTarget[i] - wearShown[i]) * Math.min(1, dt * 2);
    glow[i] = Math.max(0, glow[i] - dt * 1.4);
  }
  uniforms.uFlash.value = Math.max(0, uniforms.uFlash.value - dt * 0.6);

  for (let i = specks.length - 1; i >= 0; i--) {
    const p = specks[i];
    p.age += dt;
    p.v.y -= dt * 0.6;
    p.s.position.addScaledVector(p.v, dt);
    p.s.material.opacity = Math.max(0, 1 - p.age / p.life);
    if (p.age >= p.life) {
      scene.remove(p.s);
      p.s.material.dispose();
      specks.splice(i, 1);
    }
  }

  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i];
    f.age += dt;
    f.y -= f.vy * dt;
    const k = f.age / f.life;
    const opacity = Math.min(1, f.age * 2) * (k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1);
    f.el.style.opacity = opacity;
    f.el.style.transform = `translate(${f.x + Math.sin(f.age * 0.8 + f.sway) * 6}px, ${f.y}px)`;
    if (k >= 1 || !f.el.isConnected) {
      f.el.remove();
      floats.splice(i, 1);
    }
  }

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
