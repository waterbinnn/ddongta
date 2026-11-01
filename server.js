const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const { createWish } = require('./lib/wish');
const { LAYOUT: GROUNDS, settle, inBush, nearBean, nearVending, nearWish, onLawn } = require('./lib/layout');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const VENDOR = { '/vendor/three.module.js': path.join(__dirname, 'node_modules/three/build/three.module.js') };
// three.js add-ons (model loaders, skinned-model cloning) for the page
const JSM_DIR = path.join(__dirname, 'node_modules/three/examples/jsm');

// the grounds (two restrooms, the plaza, the exercise ground, the bushes) live in lib/layout.js
const LAYOUT = GROUNDS.stalls;
const ENTER_RANGE = GROUNDS.enterRange;

const MAX_STALLS = LAYOUT.length; // 8 private rooms + 10 public stalls
// there is no line any more (no stall? the bushes), so the cap is about keeping the grounds lively, not crowded
const ROOM_CAP = 80;
const SERVERS_PER_THEME = 1; // more servers per theme are on the backlog until there are users
const THEMES = {
  company: '회사 화장실',
  highway: '고속도로 휴게소',
  usa: '미국 화장실',
  outhouse: '옛날 뒷간',
};
// one toilet for now; the other themes are on the backlog
const OPEN_THEMES = ['usa'];

const TICK_MS = 150;
const PUSH_PER_TICK = 10; // about 1.5s of holding = one poop
const GOLD_CHANCE = Number(process.env.GOLD_CHANCE) || 0.05; // now and then a golden one
const CHAT_MAX = 80;
const CHAT_GAP_MS = 700;

// door fights
const DOOR_HP = 100;
const KNOCK_DMG = 6; // ~17 knocks alone, much faster in a group
const KNOCK_GAP_MS = 280;
const HP_REGEN_DELAY_MS = 2500;
const HP_REGEN_PER_TICK = 2;
const ROLL_MS = 1600;
const PANTS_MS = 4000;
const BELL_GAP_MS = 5500;

// random names (PLAN 3장): 「형용사 + 화장실·광장 물건」, 30 x 30, nothing rude and no 「똥」
const ADJ = ['개운한', '시원한', '느긋한', '뽀송한', '말랑한', '따끈한', '촉촉한', '홀가분한', '든든한', '졸린', '조용한', '수줍은', '꾸벅꾸벅 조는', '콧노래 부르는', '멍때리는',
  '기지개 켜는', '여유로운', '상쾌한', '포근한', '나른한', '설레는', '해맑은', '꼼꼼한', '느릿한', '반짝이는', '산뜻한', '다정한', '엉뚱한', '차분한', '한가로운'];
const NOUN = ['두루마리', '휴지심', '비누거품', '물방울', '방향제', '환풍기', '타일', '세면대', '에티켓벨', '바나나우유', '연유라떼', '요구르트', '푸룬', '파라솔', '체조 매트',
  '풀잎', '구름', '달빛', '손수건', '슬리퍼', '수도꼭지', '거울', '돗자리', '콩나무', '조약돌', '연잎', '등불', '솔방울', '햇살', '바람'];
// a name nobody else in the room has right now
function freshName(room) {
  const taken = new Set([...room.users].map((u) => u.name));
  for (let k = 0; k < 20; k++) {
    const name = `${pick(ADJ)} ${pick(NOUN)}`;
    if (!taken.has(name)) return name;
  }
  return `${pick(ADJ)} ${pick(NOUN)}`;
}
const COLORS = ['#ff8a65', '#4fc3f7', '#aed581', '#ffd54f', '#ba68c8', '#4db6ac', '#f06292', '#9575cd', '#ffb74d', '#81c784'];
const BAD_WORDS = /시발|씨발|ㅅㅂ|병신|ㅂㅅ|개새끼|좆|fuck/gi;
const PHONE = /01[016789][-\s.]?\d{3,4}[-\s.]?\d{4}/g;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.m4a': 'audio/mp4',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.glb': 'model/gltf-binary',
};

const pick = (list) => list[Math.floor(Math.random() * list.length)];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function isValidName(name) {
  if (typeof name !== 'string') return false;
  const parts = name.split(' ');
  return parts.length === 2 && ADJ.includes(parts[0]) && NOUN.includes(parts[1]);
}

function cleanChat(text) {
  return String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, CHAT_MAX)
    .replace(BAD_WORDS, (w) => '♡'.repeat(w.length))
    .replace(PHONE, '***-****-****');
}

const kstDate = (ago = 0) => new Date(Date.now() - ago + 9 * 3600e3).toISOString().slice(0, 10);
const DAY_MS = 24 * 3600e3;
let today = kstDate();
let flushedToday = 0;
// the beanstalk: every poop given to it as fertilizer today, in all rooms. At midnight (KST) it goes back to a sprout,
// and yesterday's height stays on its label
let beanstalk = 0;
let beanYesterday = 0;

// "today's poops" survives restarts and deploys when a Key Value store is attached (REDIS_URL on Render)
let kv = null;
if (process.env.REDIS_URL) {
  const { createClient } = require('redis');
  kv = createClient({ url: process.env.REDIS_URL, socket: { reconnectStrategy: (n) => Math.min(1000 * 2 ** n, 60000) } });
  let lastWarn = 0;
  kv.on('error', (err) => {
    if (Date.now() - lastWarn < 60000) return; // at most once a minute
    lastWarn = Date.now();
    console.warn('key value:', err.message);
  });
  kv.connect()
    .then(() => Promise.all([kv.get(`flushed:${today}`), kv.get(`bean:${today}`), kv.get(`bean:${kstDate(DAY_MS)}`)]))
    .then(([saved, bean, yesterday]) => {
      flushedToday = Math.max(flushedToday, Number(saved) || 0);
      beanstalk = Math.max(beanstalk, Number(bean) || 0);
      beanYesterday = Math.max(beanYesterday, Number(yesterday) || 0);
    })
    .catch((err) => console.warn('key value unavailable:', err.message));
}
// the golden poop statue: rubs counted and wishes kept, shared by everyone
const wish = createWish({ kv: () => kv, kstDate, clean: cleanChat });

function countPoop() {
  flushedToday++;
  if (kv?.isReady) kv.multi().incr(`flushed:${today}`).expire(`flushed:${today}`, 3 * 86400).exec().catch(() => {});
}

const newMeta = () => ({ hp: DOOR_HP, knockedAt: 0 });

// Restrooms: the first one is always open; when every open one is full another opens (2호점, 3호점 ...)
// and extra ones close again after standing empty for a while.
const MAX_ROOMS = 20; // 1,400 people
const EMPTY_CLOSE_MS = 10 * 60 * 1000;
const rooms = [];
function openRoom(theme) {
  const used = new Set(rooms.filter((r) => r.theme === theme).map((r) => r.no));
  let no = 1;
  while (used.has(no)) no++;
  const room = {
    id: `${theme}-${no}`, theme, label: THEMES[theme], no,
    stalls: Array(MAX_STALLS).fill(null),
    meta: Array.from({ length: MAX_STALLS }, newMeta),
    users: new Set(),
    dirty: false,
    emptySince: Date.now(),
  };
  rooms.push(room);
  rooms.sort((a, b) => a.no - b.no);
  return room;
}
for (const theme of OPEN_THEMES) for (let k = 0; k < SERVERS_PER_THEME; k++) openRoom(theme);
const isFull = (room) => room.users.size >= ROOM_CAP;
// 쾌변 체조: free moves on the exercise lawn; a few of them and 「신호가 왔다!」
const EX_MOVES = ['bridge', 'bow', 'twist', 'boat'];
const EX_MS = 2600;
const EX_FOR_SIGNAL = 3;

// 변비 and the drinks that cure it (PLAN.md 4장, 6장)
const STUCK_CHANCE = Number(process.env.STUCK_CHANCE) || 0.1; // about one poop in ten gets stuck
const POCKET_MAX = 1; // one drink, held in your hand
const DRINKS = ['banana', 'latte', 'americano', 'yogurt', 'prune'];
const KICK_DROP = 0.3; // about one kick in three drops a drink
const GOLD_CAN = 0.01;

// 변비 goes with one drink or two 쾌변 체조 moves: the colour comes back to the face and the signal comes.
// Sitting down, it all comes out at once; walking about, the next sitting goes smoothly.
function unstick(room, u) {
  if (!u.stuck) return;
  u.stuck = false;
  u.signal = true;
  room.dirty = true;
  broadcast(room, { t: 'signal', id: u.id, cure: 1 });
  if (u.stall !== -1 || u.squat) poopNow(room, u);
  else u.progress = 0;
}

function poopNow(room, u) {
  u.progress = 0;
  u.checked = false;
  u.count++;
  countPoop();
  const gold = Math.random() < GOLD_CHANCE;
  // the first one each time you sit down stays under you (in the bowl, or on the ground in the bushes);
  // every one after that goes on top of your head, and stays there until you give it to the beanstalk
  const under = !u.under;
  if (under) u.under = true;
  else u.pile++;
  broadcast(room, { t: 'poop', id: u.id, n: u.count, pile: u.pile, ...(under && { under: 1 }), ...(u.stall !== -1 ? { stall: u.stall } : { bush: 1 }), ...(gold && { gold: 1 }) });
  u.signal = false; // the signal has been answered
  u.exCount = 0;
  room.dirty = true;
}

function giveDrink(u, drink) {
  if (u.pocket.length >= POCKET_MAX) return false;
  u.pocket.push(drink);
  return true;
}

function sit(room, user, i) {
  room.stalls[i] = user;
  user.stall = i;
  user.bench = false;
  user.squat = false;
  user.under = false; // a fresh seat: the first poop will stay under you
  user.ex = '';
  user.holding = false;
  room.meta[i].hp = DOOR_HP;
  room.dirty = true;
}

function leaveStall(room, user) {
  if (user.stall === -1) return -1;
  const i = user.stall;
  room.stalls[i] = null;
  room.meta[i].hp = DOOR_HP;
  user.x = LAYOUT[i].x;
  user.y = LAYOUT[i].y;
  user.stall = -1;
  user.holding = false;
  user.under = false;
  room.dirty = true;
  return i;
}

function breakDoor(room, i, breaker) {
  const now = Date.now();
  const victim = room.stalls[i];
  room.stalls[i] = null;
  victim.stall = -1;
  victim.holding = false;
  victim.under = false;
  victim.progress = 0;
  // tumble out of the door
  const L = LAYOUT[i];
  const side = (Math.random() - 0.5) * 240;
  const out = 200 + Math.random() * 120;
  victim.x = L.x;
  victim.y = L.y;
  const to = settle({ x: L.x + L.fx * out + L.fy * side, y: L.y + L.fy * out + L.fx * side });
  victim.roll = { fx: L.x, fy: L.y, tx: to.x, ty: to.y, t0: now };
  victim.pantsUntil = now + ROLL_MS + PANTS_MS;
  breaker.progress = 0;
  sit(room, breaker, i);
  broadcast(room, { t: 'break', stall: i, by: breaker.id, victim: victim.id });
  broadcast(room, { t: 'toast', text: `💥 ${breaker.name}님이 공중화장실 ${LAYOUT[i].no}번 칸 문을 부쉈어요! ${victim.name}님 데굴데굴~` });
}

function send(ws, msg) {
  if (ws.readyState === 1) ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg));
}

function broadcast(room, msg) {
  const data = typeof msg === 'string' ? msg : JSON.stringify(msg);
  for (const u of room.users) send(u.ws, data);
}

function snapshot(room) {
  const now = Date.now();
  return JSON.stringify({
    t: 'state',
    flushed: flushedToday,
    bean: beanstalk,
    beanY: beanYesterday,
    stalls: room.stalls.map((u) => (u ? u.id : 0)),
    hp: room.meta.map((m) => Math.round(m.hp)),
    users: [...room.users].map((u) => ({
      id: u.id, name: u.name, c: u.color, x: Math.round(u.x), y: Math.round(u.y), d: u.dir,
      s: u.stall, p: u.progress, n: u.count, h: u.holding,
      r: u.roll ? 1 : 0, pd: u.pantsUntil > now ? 1 : 0, b: u.bench ? 1 : 0,
      q: u.squat ? 1 : 0, ex: u.ex, sg: u.signal ? 1 : 0, pl: u.pile, un: u.under ? 1 : 0,
      pk: u.pocket, cn: u.stuck ? 1 : 0, k: u.kind,
    })),
  });
}

setInterval(() => {
  const d = kstDate();
  if (d !== today) {
    today = d;
    flushedToday = 0;
    beanYesterday = beanstalk; // a new day: the beanstalk starts again from a sprout
    beanstalk = 0;
    for (const r of rooms) r.dirty = true;
  }
  const now = Date.now();
  for (let k = rooms.length - 1; k >= 0; k--) {
    const r = rooms[k];
    if (r.users.size) r.emptySince = now;
    else if (r.no > 1 && now - r.emptySince > EMPTY_CLOSE_MS) rooms.splice(k, 1);
  }
  for (const room of rooms) {
    for (const u of room.users) {
      if (u.roll) {
        const t = Math.min(1, (now - u.roll.t0) / ROLL_MS);
        const e = 1 - (1 - t) * (1 - t);
        u.x = u.roll.fx + (u.roll.tx - u.roll.fx) * e;
        u.y = u.roll.fy + (u.roll.ty - u.roll.fy) * e;
        if (t >= 1) u.roll = null;
        room.dirty = true;
      }
      if (u.pantsUntil && u.pantsUntil <= now) {
        u.pantsUntil = 0;
        room.dirty = true;
      }
      if (u.ex && u.exUntil <= now) {
        u.ex = '';
        room.dirty = true;
      }
      if (!u.holding || (u.stall === -1 && !u.squat)) continue;
      u.progress += PUSH_PER_TICK;
      room.dirty = true;
      // halfway through, now and then it gets stuck: 변비. One drink or two 쾌변 체조 moves get it going again (and the signal keeps it away)
      if (u.progress >= 50 && !u.checked) {
        u.checked = true;
        if (!u.signal && Math.random() < STUCK_CHANCE) {
          u.stuck = true;
          u.stuckMoves = 0;
          broadcast(room, { t: 'stuck', id: u.id });
        }
      }
      if (u.stuck) u.progress = 50;
      else if (u.progress >= 100) poopNow(room, u);
    }
    room.meta.forEach((m, i) => {
      if (room.stalls[i] && m.hp < DOOR_HP && now - m.knockedAt > HP_REGEN_DELAY_MS) {
        m.hp = Math.min(DOOR_HP, m.hp + HP_REGEN_PER_TICK);
        room.dirty = true;
      }
    });
    if (room.dirty) {
      room.dirty = false;
      broadcast(room, snapshot(room));
    }
  }
}, TICK_MS);

// the public address; visits to the Render address are sent here so it never shows
const SITE = 'https://ddongta.com';

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if ((req.headers.host || '').endsWith('.onrender.com')) {
    res.writeHead(301, { location: SITE + url.pathname + url.search });
    return res.end();
  }
  if (url.pathname === '/api/rooms') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify(rooms.map((r) => ({ id: r.id, theme: r.theme, label: r.label, no: r.no, online: r.users.size, max: ROOM_CAP }))));
  }
  const jsm = url.pathname.startsWith('/vendor/jsm/') && path.join(JSM_DIR, path.normalize(url.pathname.slice('/vendor/jsm/'.length)));
  const page = { '/': 'index.html' }[url.pathname];
  const file = VENDOR[url.pathname] || jsm || path.join(PUBLIC_DIR, page || path.normalize(url.pathname));
  if (jsm ? !jsm.startsWith(JSM_DIR + path.sep) : !VENDOR[url.pathname] && !file.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end();
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end('not found');
    }
    // no-cache: browsers (and in-app browsers) check for a newer copy instead of running stale code
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 2048 });
let nextId = 1;

// who you come as, picked at random each time: a person three times in ten, otherwise one of the six animals
const ANIMALS = ['elephant', 'dog', 'cat', 'rabbit', 'giraffe', 'wombat'];
const pickKind = (asked) => (asked === 'person' || ANIMALS.includes(asked) ? asked : Math.random() < 0.3 ? 'person' : pick(ANIMALS)); // ?as= is for trying one out

wss.on('connection', (ws, req) => {
  const q = new URL(req.url, 'http://localhost').searchParams;
  const wanted = rooms.find((r) => r.id === q.get('room')) || rooms[0];
  let room = !isFull(wanted) ? wanted : rooms.find((r) => r.theme === wanted.theme && !isFull(r)) || rooms.find((r) => !isFull(r));
  if (!room && rooms.length < MAX_ROOMS) room = openRoom(wanted.theme);
  if (!room) {
    send(ws, { t: 'full' });
    return ws.close();
  }
  const notice = wanted !== room ? `${wanted.no}호점이 꽉 차서 ${room.no}호점으로 안내했어요` : null;

  const now = Date.now();
  const user = {
    id: nextId++,
    name: isValidName(q.get('name')) ? q.get('name') : freshName(room),
    color: pick(COLORS),
    kind: pickKind(q.get('as')),
    ws,
    x: GROUNDS.spawn.x + (Math.random() - 0.5) * 240, // just inside the gate
    y: GROUNDS.spawn.y - Math.random() * 100,
    dir: 1,
    stall: -1,
    progress: 0,
    count: 0,
    holding: false,
    lastChat: 0,
    lastKnock: 0,
    lastBell: 0,
    lastJump: 0,
    lastWash: 0,
    lastLunch: 0,
    bench: false,
    roll: null,
    pantsUntil: 0,
    squat: false, // squatting in the bushes
    ex: '', // the exercise move being done, until exUntil
    exUntil: 0,
    exCount: 0,
    lastEx: 0,
    signal: false, // 「신호가 왔다!」 after a few moves, until the next poop
    pile: 0, // the poops stacked on your head
    under: false, // a poop under you, where you sit or squat
    pocket: [], // the drink in your hand (one at most)
    stuck: false, // 변비: halfway and going nowhere
    stuckMoves: 0, // 체조 moves done since getting stuck
    checked: false, // whether this poop has already had its chance of getting stuck
    lastKick: 0,
  };
  room.users.add(user);
  room.dirty = true;

  send(ws, {
    t: 'welcome', you: user.id, name: user.name, room: room.id, theme: room.theme, label: room.label, no: room.no, notice,
    layout: GROUNDS,
  });
  broadcast(room, { t: 'toast', text: `${user.name}님이 화장실에 들어왔어요` });

  ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));

  const nearStall = (i) => Math.hypot(user.x - LAYOUT[i].x, user.y - LAYOUT[i].y) <= ENTER_RANGE;

  ws.on('message', (raw) => {
    let m;
    try {
      m = JSON.parse(raw);
    } catch {
      return;
    }
    const i = Number(m.stall);
    const validStall = Number.isInteger(i) && i >= 0 && i < room.stalls.length;

    if (m.t === 'move' && user.stall === -1 && !user.roll) {
      user.x = Number(m.x) || 0;
      user.y = Number(m.y) || 0;
      settle(user);
      user.dir = m.d === -1 ? -1 : 1;
      user.bench = false; // moving gets you up off the bench
      user.ex = '';
      if (user.squat) {
        user.squat = false; // and up out of a squat
        user.holding = false;
        user.under = false;
      }
      room.dirty = true;
    } else if (m.t === 'enter' && user.stall === -1 && !user.roll) {
      if (!validStall || room.stalls[i] || !nearStall(i)) return;
      sit(room, user, i);
      const where = LAYOUT[i].type === 'private' ? `개인 화장실 ${LAYOUT[i].no}호` : `공중화장실 ${LAYOUT[i].no}번 칸`;
      broadcast(room, { t: 'toast', text: `${user.name}님이 ${where}에 들어갔어요` });
    } else if (m.t === 'knock' && user.stall === -1 && !user.roll) {
      if (!validStall || !room.stalls[i] || !nearStall(i)) return;
      const now = Date.now();
      if (now - user.lastKnock < KNOCK_GAP_MS) return;
      user.lastKnock = now;
      const meta = room.meta[i];
      // private rooms are locked: you can knock, but the door won't give
      if (LAYOUT[i].type !== 'private') meta.hp = Math.max(0, meta.hp - KNOCK_DMG);
      meta.knockedAt = now;
      room.dirty = true;
      broadcast(room, { t: 'knock', stall: i, by: user.id, hp: meta.hp });
      if (meta.hp <= 0) breakDoor(room, i, user);
    } else if (m.t === 'bench' && user.stall === -1 && !user.roll) {
      user.bench = Boolean(m.on);
      room.dirty = true;
    } else if (m.t === 'jump' && user.stall === -1 && !user.roll) {
      const now = Date.now();
      if (now - user.lastJump < 450) return;
      user.lastJump = now;
      user.bench = false;
      broadcast(room, { t: 'jump', id: user.id });
    } else if (m.t === 'wash' && !user.roll && (user.stall === -1 || LAYOUT[user.stall].type === 'private')) {
      // at a sink outside, or at the little sink in your own private room
      const now = Date.now();
      if (now - user.lastWash < 2000) return;
      user.lastWash = now;
      broadcast(room, { t: 'wash', id: user.id });
    } else if (m.t === 'pick' && user.under && (user.stall !== -1 || user.squat)) {
      // picking up the poop under you: it goes on top of the pile on your head
      user.under = false;
      user.pile++;
      room.dirty = true;
      broadcast(room, { t: 'pick', id: user.id, pile: user.pile });
    } else if (m.t === 'lunch' && user.stall !== -1) {
      // a lunchbox opened on the lap, in the stall
      const now = Date.now();
      if (now - user.lastLunch < 3000) return;
      user.lastLunch = now;
      broadcast(room, { t: 'lunch', id: user.id });
    } else if (m.t === 'bell' && user.stall !== -1) {
      const now = Date.now();
      if (now - user.lastBell < BELL_GAP_MS) return;
      user.lastBell = now;
      broadcast(room, { t: 'bell', stall: user.stall, id: user.id });
    } else if (m.t === 'exit') {
      leaveStall(room, user);
    } else if (m.t === 'fert' && user.pile > 0 && !user.roll && user.stall === -1 && nearBean(user)) {
      // standing in front of the beanstalk, the tower on your head goes to it as fertilizer
      const n = user.pile;
      user.pile = 0;
      beanstalk += n;
      if (kv?.isReady) kv.multi().incrBy(`bean:${today}`, n).expire(`bean:${today}`, 3 * 24 * 3600).exec().catch(() => {});
      for (const r of rooms) r.dirty = true; // every room's beanstalk grows
      broadcast(room, { t: 'fert', id: user.id, n, total: beanstalk });
    } else if ((m.t === 'rub' || m.t === 'pray') && user.stall === -1 && !user.roll && !user.squat && nearWish(user)) {
      // at the golden poop statue: rub it or put your palms together
      const now = Date.now();
      if (now - user.lastEx < 1200) return;
      user.lastEx = now;
      user.ex = m.t;
      user.exUntil = now + (m.t === 'rub' ? 2200 : 2600);
      user.bench = false;
      room.dirty = true;
      const n = m.t === 'rub' ? wish.rubHere() : 0;
      broadcast(room, { t: m.t, id: user.id, ...(n && { n }) });
    } else if (m.t === 'wish' && user.stall === -1 && nearWish(user)) {
      const now = Date.now();
      if (now - user.lastChat < CHAT_GAP_MS) return;
      const text = wish.wishHere(m.text);
      if (!text) return;
      user.lastChat = now;
      broadcast(room, { t: 'wished', id: user.id, text });
    } else if (m.t === 'kick' && user.stall === -1 && !user.roll && nearVending(user) >= 0) {
      // kicking the vending machine: now and then a drink drops out
      const now = Date.now();
      if (now - user.lastKick < 700) return;
      user.lastKick = now;
      const r = Math.random();
      const drink = r < GOLD_CAN ? 'gold' : r < KICK_DROP ? DRINKS[Math.floor(Math.random() * DRINKS.length)] : '';
      const kept = drink ? giveDrink(user, drink) : false;
      if (kept) room.dirty = true; // the drink shows in your hand
      broadcast(room, { t: 'kick', id: user.id, v: nearVending(user), ...(drink && { drink, kept: kept ? 1 : 0 }) });
    } else if (m.t === 'drink' && user.pocket.length && !user.roll) {
      // drinking: if you're stuck, a gurgle, and a moment later it all comes out
      const k = Number.isInteger(m.k) && m.k >= 0 && m.k < user.pocket.length ? m.k : 0;
      const [drink] = user.pocket.splice(k, 1);
      const wasStuck = user.stuck;
      if (user.stall === -1 && !user.squat) {
        user.ex = 'drink'; // the drinking scene: tipping it back
        user.exUntil = Date.now() + 1600;
      }
      room.dirty = true;
      broadcast(room, { t: 'drink', id: user.id, drink, cure: wasStuck ? 1 : 0 });
      if (wasStuck) setTimeout(() => room.users.has(user) && unstick(room, user), 1800);
    } else if (m.t === 'hold') {
      user.holding = Boolean(m.on) && (user.stall !== -1 || user.squat);
      room.dirty = true;
    } else if (m.t === 'squat' && user.stall === -1 && !user.roll) {
      // only in the bushes; there's no squatting on the plaza
      user.squat = Boolean(m.on) && inBush(user);
      if (!user.squat) user.holding = false;
      user.under = false; // squatting down (or getting up) starts afresh
      user.bench = false;
      user.ex = '';
      room.dirty = true;
    } else if (m.t === 'ex' && user.stall === -1 && !user.roll && !user.squat && EX_MOVES.includes(m.move)) {
      const now = Date.now();
      if (!onLawn(user) || now - user.lastEx < 1200) return;
      user.lastEx = now;
      user.ex = m.move;
      user.exUntil = now + EX_MS;
      user.bench = false;
      user.exCount++;
      room.dirty = true;
      if (user.stuck) {
        user.stuckMoves++;
        if (user.stuckMoves >= 2) unstick(room, user); // two 체조 moves get it going again
      }
      else if (user.exCount >= EX_FOR_SIGNAL && !user.signal) {
        user.signal = true;
        broadcast(room, { t: 'signal', id: user.id });
      }
    }
  });

  ws.on('close', () => {
    leaveStall(room, user);
    room.users.delete(user);
    room.dirty = true;
  });
});

setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);

server.listen(PORT, () => console.log(`ddongta running at http://localhost:${PORT}`));

// Render's free plan puts the server to sleep after 15 minutes without visitors, and the next visitor
// then waits ~50s. A request to our own public address every 10 minutes counts as a visitor.
if (process.env.RENDER) {
  setInterval(() => fetch(`${SITE}/api/rooms`).catch(() => {}), 10 * 60 * 1000);
}
