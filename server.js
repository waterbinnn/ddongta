const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const VENDOR = { '/vendor/three.module.js': path.join(__dirname, 'node_modules/three/build/three.module.js') };

// world layout (shared with public/app.js)
// The room is a plaza: stalls line three walls in a U (20 at the back, 15 down each side),
// the open middle has a round wash basin, and the entrance is in the front wall.
// Coordinates are centimeters: x across the room, y from the back wall toward the entrance.
const STALL_W = 110;
const ROOM_W = 2200;
const ROOM_D = 2300;
const SIDE_START = 170; // side banks start a little away from the back corners
const BACK_COUNT = 20;
const SIDE_COUNT = 15;
const ENTER_RANGE = 75; // how close to a stall's door you must be
const BASIN = { x: ROOM_W / 2, y: 1050, r: 130 };

const MAX_STALLS = 50;
const ROOM_CAP = 70; // 50 stalls + a line of 20
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
const PUSH_PER_TICK = 5; // about 3s of holding = one poop
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
const TURN_MS = 10000; // how long a freed stall is held for the head of the line
const BELL_GAP_MS = 5500;

const ADJ = ['급한', '묵직한', '시원한', '조용한', '다급한', '느긋한', '수상한', '당당한', '촉촉한', '굳센', '쾌활한', '소심한', '배부른', '졸린', '비장한'];
const NOUN = ['고구마', '바나나', '감자', '옥수수', '두부', '호떡', '만두', '푸딩', '식빵', '김밥', '도토리', '양배추', '순두부', '찐빵', '군밤'];
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

const kstDate = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
let today = kstDate();
let flushedToday = 0;

const newMeta = () => ({ pile: 0, hp: DOOR_HP, knockedAt: 0, reservedFor: 0, reservedUntil: 0 });

const rooms = [];
for (const theme of OPEN_THEMES) {
  const label = THEMES[theme];
  for (let no = 1; no <= SERVERS_PER_THEME; no++) {
    rooms.push({
      id: `${theme}-${no}`, theme, label, no,
      stalls: Array(MAX_STALLS).fill(null), // all 50 stalls from the start
      meta: Array.from({ length: MAX_STALLS }, newMeta),
      users: new Set(),
      dirty: false,
    });
  }
}
const isFull = (room) => room.users.size >= ROOM_CAP;
// each stall: the left corner of its door line, its rotation (three.js y rotation), and
// the spot in front of the door where people stand to enter or knock
const LAYOUT = (() => {
  const list = [];
  const add = (cx, cy, rot) => {
    const ax = Math.cos(rot);
    const ay = -Math.sin(rot); // along the door
    const fx = Math.sin(rot);
    const fy = Math.cos(rot); // facing out of the stall
    const doorX = cx + ax * STALL_W / 2;
    const doorY = cy + ay * STALL_W / 2;
    list.push({ cx, cy, rot, fx, fy, x: Math.round(doorX + fx * 45), y: Math.round(doorY + fy * 45) });
  };
  for (let i = 0; i < BACK_COUNT; i++) add(i * STALL_W, 0, 0);
  for (let j = 0; j < SIDE_COUNT; j++) add(0, SIDE_START + (j + 1) * STALL_W, Math.PI / 2);
  for (let j = 0; j < SIDE_COUNT; j++) add(ROOM_W, SIDE_START + j * STALL_W, -Math.PI / 2);
  return list;
})();
const clampX = (x) => clamp(x, 45, ROOM_W - 45);
const clampY = (y) => clamp(y, 45, ROOM_D - 40);
const isReserved = (room, i, now = Date.now()) => room.meta[i].reservedFor && room.meta[i].reservedUntil > now;

// The line only exists once all 50 stalls are taken.
function lineActive(room) {
  const now = Date.now();
  return !room.stalls.some((s, i) => !s && !isReserved(room, i, now));
}

function lineOrder(room) {
  return [...room.users].filter((u) => u.stall === -1).sort((a, b) => a.outsideSince - b.outsideSince);
}

// A stall just became free: if people are waiting, hold it for the head of the line.
function offerStall(room, i) {
  if (i >= room.stalls.length || room.stalls[i]) return;
  const now = Date.now();
  // only hold stalls for people when there's an actual line, i.e. no other stall is free
  if (room.stalls.some((s, j) => j !== i && !s && !isReserved(room, j, now))) return;
  const holders = new Set(room.meta.filter((m, j) => isReserved(room, j, now)).map((m) => m.reservedFor));
  const head = lineOrder(room).find((u) => !holders.has(u.id));
  if (!head) return;
  room.meta[i].reservedFor = head.id;
  room.meta[i].reservedUntil = now + TURN_MS;
  send(head.ws, { t: 'turn', stall: i, ms: TURN_MS });
  room.dirty = true;
}

// drop any stall this user was holding and pass it to the next person in line
function releaseReservations(room, user) {
  room.meta.forEach((m, j) => {
    if (m.reservedFor !== user.id) return;
    m.reservedFor = 0;
    offerStall(room, j);
  });
}

function sit(room, user, i) {
  room.stalls[i] = user;
  user.stall = i;
  user.bench = false;
  user.holding = false;
  room.meta[i].hp = DOOR_HP;
  room.meta[i].reservedFor = 0;
  releaseReservations(room, user);
  room.dirty = true;
}

function leaveStall(room, user) {
  if (user.stall === -1) return -1;
  const i = user.stall;
  room.stalls[i] = null;
  room.meta[i].hp = DOOR_HP;
  room.meta[i].pile = 0; // your tower leaves with you
  user.x = LAYOUT[i].x;
  user.y = LAYOUT[i].y;
  user.stall = -1;
  user.holding = false;
  user.outsideSince = Date.now();
  room.dirty = true;
  return i;
}

function breakDoor(room, i, breaker) {
  const now = Date.now();
  const victim = room.stalls[i];
  room.stalls[i] = null;
  room.meta[i].pile = 0;
  victim.stall = -1;
  victim.holding = false;
  victim.progress = 0;
  victim.outsideSince = now; // back of the line
  // tumble out of the door into the plaza
  const L = LAYOUT[i];
  const side = (Math.random() - 0.5) * 240;
  const out = 200 + Math.random() * 120;
  victim.x = L.x;
  victim.y = L.y;
  victim.roll = {
    fx: L.x, fy: L.y,
    tx: clampX(L.x + L.fx * out + L.fy * side),
    ty: clampY(L.y + L.fy * out + L.fx * side),
    t0: now,
  };
  victim.pantsUntil = now + ROLL_MS + PANTS_MS;
  breaker.progress = 0;
  sit(room, breaker, i);
  broadcast(room, { t: 'break', stall: i, by: breaker.id, victim: victim.id });
  broadcast(room, { t: 'toast', text: `💥 ${breaker.name}님이 ${i + 1}번 칸 문을 부쉈어요! ${victim.name}님 데굴데굴~` });
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
  const line = lineActive(room) ? lineOrder(room) : [];
  const place = new Map(line.map((u, k) => [u.id, k + 1]));
  return JSON.stringify({
    t: 'state',
    flushed: flushedToday,
    stalls: room.stalls.map((u) => (u ? u.id : 0)),
    piles: room.meta.map((m) => m.pile),
    hp: room.meta.map((m) => Math.round(m.hp)),
    held: room.meta.map((m, i) => (isReserved(room, i, now) ? m.reservedFor : 0)),
    users: [...room.users].map((u) => ({
      id: u.id, name: u.name, c: u.color, x: Math.round(u.x), y: Math.round(u.y), d: u.dir,
      s: u.stall, p: u.progress, n: u.count, h: u.holding,
      r: u.roll ? 1 : 0, pd: u.pantsUntil > now ? 1 : 0, q: place.get(u.id) || 0, b: u.bench ? 1 : 0,
    })),
  });
}

setInterval(() => {
  const d = kstDate();
  if (d !== today) {
    today = d;
    flushedToday = 0;
  }
  const now = Date.now();
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
      if (!u.holding || u.stall === -1) continue;
      u.progress += PUSH_PER_TICK;
      room.dirty = true;
      if (u.progress >= 100) {
        u.progress = 0;
        u.count++;
        flushedToday++;
        const m = room.meta[u.stall];
        m.pile++; // every stall keeps its own poop tower
        const gold = Math.random() < GOLD_CHANCE;
        broadcast(room, { t: 'poop', id: u.id, n: u.count, stall: u.stall, pile: m.pile, ...(gold && { gold: 1 }) });
      }
    }
    room.meta.forEach((m, i) => {
      if (room.stalls[i] && m.hp < DOOR_HP && now - m.knockedAt > HP_REGEN_DELAY_MS) {
        m.hp = Math.min(DOOR_HP, m.hp + HP_REGEN_PER_TICK);
        room.dirty = true;
      }
      // a missed turn passes to the next person in line
      if (m.reservedFor && m.reservedUntil <= now) {
        const late = [...room.users].find((u) => u.id === m.reservedFor);
        m.reservedFor = 0;
        if (late) late.outsideSince = now;
        offerStall(room, i);
        room.dirty = true;
      }
    });
    if (room.dirty) {
      room.dirty = false;
      broadcast(room, snapshot(room));
    }
  }
}, TICK_MS);

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/rooms') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify(rooms.map((r) => ({ id: r.id, theme: r.theme, label: r.label, no: r.no, online: r.users.size, max: ROOM_CAP }))));
  }
  const file = VENDOR[url.pathname] || path.join(PUBLIC_DIR, url.pathname === '/' ? 'index.html' : path.normalize(url.pathname));
  if (!VENDOR[url.pathname] && !file.startsWith(PUBLIC_DIR)) {
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

wss.on('connection', (ws, req) => {
  const q = new URL(req.url, 'http://localhost').searchParams;
  const wanted = rooms.find((r) => r.id === q.get('room')) || rooms[0];
  const room = !isFull(wanted) ? wanted : rooms.find((r) => r.theme === wanted.theme && !isFull(r)) || rooms.find((r) => !isFull(r));
  if (!room) {
    send(ws, { t: 'full' });
    return ws.close();
  }
  const notice = wanted !== room ? `${wanted.label}이 꽉 차서 ${room.label}로 안내했어요` : null;

  const now = Date.now();
  const user = {
    id: nextId++,
    name: isValidName(q.get('name')) ? q.get('name') : `${pick(ADJ)} ${pick(NOUN)}`,
    color: pick(COLORS),
    ws,
    x: ROOM_W / 2 + (Math.random() - 0.5) * 300,
    y: ROOM_D - 260 - Math.random() * 120,
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
    bench: false,
    outsideSince: now,
    roll: null,
    pantsUntil: 0,
  };
  room.users.add(user);
  room.dirty = true;

  send(ws, {
    t: 'welcome', you: user.id, name: user.name, room: room.id, theme: room.theme, label: room.label, no: room.no, notice,
    layout: { stalls: LAYOUT, w: ROOM_W, d: ROOM_D, basin: BASIN },
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
      user.x = clampX(Number(m.x) || 0);
      user.y = clampY(Number(m.y) || 0);
      user.dir = m.d === -1 ? -1 : 1;
      user.bench = false; // moving gets you up off the bench
      room.dirty = true;
    } else if (m.t === 'enter' && user.stall === -1 && !user.roll) {
      if (!validStall || room.stalls[i] || !nearStall(i)) return;
      if (isReserved(room, i) && room.meta[i].reservedFor !== user.id) {
        send(ws, { t: 'toast', text: `${i + 1}번 칸은 대기 1번 손님 차례예요`, direct: true });
        return;
      }
      sit(room, user, i);
      broadcast(room, { t: 'toast', text: `${user.name}님이 ${i + 1}번 칸에 들어갔어요` });
    } else if (m.t === 'knock' && user.stall === -1 && !user.roll) {
      if (!validStall || !room.stalls[i] || !nearStall(i)) return;
      const now = Date.now();
      if (now - user.lastKnock < KNOCK_GAP_MS) return;
      user.lastKnock = now;
      const meta = room.meta[i];
      meta.hp = Math.max(0, meta.hp - KNOCK_DMG);
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
    } else if (m.t === 'wash' && user.stall === -1 && !user.roll) {
      const now = Date.now();
      if (now - user.lastWash < 2000) return;
      user.lastWash = now;
      broadcast(room, { t: 'wash', id: user.id });
    } else if (m.t === 'bell' && user.stall !== -1) {
      const now = Date.now();
      if (now - user.lastBell < BELL_GAP_MS) return;
      user.lastBell = now;
      broadcast(room, { t: 'bell', stall: user.stall, id: user.id });
    } else if (m.t === 'exit') {
      const freed = leaveStall(room, user);
      if (freed !== -1) offerStall(room, freed);
    } else if (m.t === 'hold') {
      user.holding = Boolean(m.on) && user.stall !== -1;
      room.dirty = true;
    } else if (m.t === 'chat') {
      const now = Date.now();
      if (now - user.lastChat < CHAT_GAP_MS) return;
      const text = cleanChat(m.text);
      if (!text) return;
      user.lastChat = now;
      broadcast(room, { t: 'chat', id: user.id, name: user.name, text });
    }
  });

  ws.on('close', () => {
    const freed = leaveStall(room, user);
    room.users.delete(user);
    releaseReservations(room, user);
    if (freed !== -1) offerStall(room, freed);
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
