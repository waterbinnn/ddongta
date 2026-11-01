// The animals: no one plays them. They live here, walking about the grounds on their own and doing what everyone
// does: going in the bushes (and leaving it there for someone to pick up), 쾌변 체조 on the lawn, kicking the vending
// machines, rubbing the golden poop, resting on the picnic mats. They have no names.
// There are more of them when few people are about, so the place never feels empty, and none in an empty room.

const KINDS = ['elephant', 'dog', 'cat', 'giraffe', 'wombat'];
const SPEED = 95; // cm a second: an amble
const MOST = 5;

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];

function createNpcs({ GROUNDS, settle, inBush, broadcast, dropPoop, EX_MOVES, EX_MS }) {
  const L = GROUNDS;
  let nextId = -1; // negative, so they never clash with visitors' ids

  // how many animals a room wants: lots when you're alone, a few once people come
  const wanted = (humans) => (humans ? Math.max(1, Math.min(MOST, 7 - humans)) : 0);

  // somewhere to go and something to do there
  function plan(npc, room) {
    const doing = pick(['bush', 'bush', 'lawn', 'lawn', 'vend', 'wish', 'mat', 'stroll', 'stroll']);
    if (doing === 'bush') {
      const b = pick(L.bushes);
      for (let k = 0; k < 12; k++) {
        const a = rand(0, Math.PI * 2);
        const d = rand(0.15, 0.6) * b.r;
        const p = { x: b.x + Math.cos(a) * d, y: b.y + Math.sin(a) * d };
        if (inBush(p)) return { doing, ...p };
      }
    } else if (doing === 'lawn') {
      const a = rand(0, Math.PI * 2);
      const d = rand(0, 0.55) * L.exercise.r;
      return { doing, x: L.exercise.x + Math.cos(a) * d, y: L.exercise.y + Math.sin(a) * d };
    } else if (doing === 'vend') {
      const v = Math.floor(Math.random() * L.terrace.vendings.length);
      const at = L.terrace.vendings[v];
      return { doing, v, x: at.x + rand(-50, 50), y: at.y + rand(70, 110) };
    } else if (doing === 'wish') {
      return { doing, x: L.wish.x + rand(-120, 120), y: L.wish.y + 240 };
    } else if (doing === 'mat') {
      const everyone = [...room.users, ...room.npcs];
      const free = L.seats.filter((s) => !everyone.some((u) => u !== npc && Math.hypot(u.x - s.x, u.y - s.y) < 40));
      if (free.length) return { doing, ...pick(free) };
    }
    const s = pick(L.spots);
    return { doing: 'stroll', x: s.x + rand(-160, 160), y: s.y + rand(-160, 160) };
  }

  function make(room, placed) {
    const here = new Set([...room.npcs].map((n) => n.kind));
    const kind = pick(KINDS.filter((k) => !here.has(k)).length ? KINDS.filter((k) => !here.has(k)) : KINDS);
    const npc = {
      id: nextId--, npc: true, kind, name: '', color: '#888888', ws: null,
      x: L.spawn.x + rand(-120, 120), y: L.spawn.y - rand(0, 80), dir: 1, stall: -1,
      progress: 0, count: 0, holding: false, bench: false, roll: null, pantsUntil: 0,
      squat: false, ex: '', exUntil: 0, exCount: 0, lastEx: 0, signal: true, pile: 0, under: false, underGold: false,
      pocket: [], stuck: false, checked: false, stuckMoves: 0,
      goal: null, step: '', until: 0, best: Infinity, stalledAt: 0, reps: 0, leaving: false,
    };
    if (placed) {
      // the first ones are already about the place when you arrive, not all queued at the gate
      const g = plan(npc, room);
      Object.assign(npc, { x: g.x + rand(-200, 200), y: g.y + rand(-200, 200) });
      settle(npc);
    }
    room.npcs.add(npc);
    room.dirty = true;
    return npc;
  }

  // the animal decides what to do next
  function next(npc, room, now) {
    npc.goal = npc.leaving ? { doing: 'leave', x: L.spawn.x, y: L.spawn.y + 60 } : plan(npc, room);
    npc.step = 'go';
    npc.best = Infinity;
    npc.stalledAt = now;
  }

  function walk(npc, room, now, dt) {
    const dx = npc.goal.x - npc.x;
    const dy = npc.goal.y - npc.y;
    const d = Math.hypot(dx, dy);
    if (d < 25) return true;
    const s = Math.min(d, SPEED * dt);
    npc.x += (dx / d) * s;
    npc.y += (dy / d) * s;
    settle(npc);
    if (Math.abs(dx) > 5) npc.dir = dx < 0 ? -1 : 1;
    room.dirty = true;
    // caught on a tree or a wall: give up on this and find something else
    if (d < npc.best - 20) {
      npc.best = d;
      npc.stalledAt = now;
    } else if (now - npc.stalledAt > 5000) {
      if (npc.leaving) return true;
      next(npc, room, now);
    }
    return false;
  }

  // arrived: start doing the thing
  function start(npc, room, now) {
    const g = npc.goal;
    npc.step = 'do';
    npc.reps = 0;
    if (g.doing === 'bush' && inBush(npc)) {
      npc.squat = true;
      npc.under = false;
      npc.signal = true; // no 변비 for the animals
      npc.holding = true;
      npc.until = now + 30000; // in case
    } else if (g.doing === 'mat') {
      npc.bench = true;
      npc.until = now + rand(15000, 35000);
    } else npc.until = now + rand(800, 2000);
    room.dirty = true;
  }

  function act(npc, room, now) {
    const g = npc.goal;
    if (g.doing === 'bush') {
      if (npc.under && npc.holding) {
        npc.holding = false; // done: sit a moment longer, then up (and the poop stays on the ground)
        npc.until = now + rand(1500, 3500);
      } else if (now >= npc.until) {
        if (npc.under) dropPoop(room, npc);
        npc.squat = false;
        npc.holding = false;
        npc.under = false;
        room.dirty = true;
        next(npc, room, now);
      }
      return;
    }
    if (now < npc.until) return;
    if (g.doing === 'lawn' && npc.reps < 3) {
      npc.ex = pick(EX_MOVES);
      npc.exUntil = now + EX_MS;
      npc.reps++;
      npc.until = now + EX_MS + rand(400, 1500);
    } else if (g.doing === 'vend' && npc.reps < 3) {
      broadcast(room, { t: 'kick', id: npc.id, v: g.v });
      npc.reps++;
      npc.until = now + rand(900, 1800);
    } else if (g.doing === 'wish' && npc.reps < 2) {
      npc.ex = npc.reps ? 'pray' : 'rub';
      npc.exUntil = now + (npc.ex === 'rub' ? 2200 : 2600);
      broadcast(room, { t: npc.ex, id: npc.id });
      npc.reps++;
      npc.until = npc.exUntil + rand(500, 1500);
    } else if (g.doing === 'stroll' && npc.reps < 1) {
      npc.reps++;
      npc.until = now + rand(2500, 7000); // just standing about, looking around
    } else {
      npc.bench = false;
      next(npc, room, now);
    }
    room.dirty = true;
  }

  // every tick, for every room
  function update(room, now, dt) {
    const want = wanted(room.users.size);
    if (!want) {
      if (room.npcs.size) {
        room.npcs.clear(); // nobody to see them
        room.dirty = true;
      }
      return;
    }
    const staying = [...room.npcs].filter((n) => !n.leaving);
    if (!room.npcs.size) {
      for (let k = 0; k < want; k++) next(make(room, true), room, now); // a room just woken up: fill it at once
    } else if (staying.length < want && now >= (room.npcNext || 0)) {
      next(make(room, false), room, now); // one more wanders in through the gate, now and then
      room.npcNext = now + 8000;
    } else if (staying.length > want) {
      const n = staying.find((s) => !s.squat && !s.bench) || staying[0];
      n.leaving = true; // off out through the gate
      n.squat = n.holding = n.bench = false;
      n.ex = '';
      next(n, room, now);
    }
    for (const npc of room.npcs) {
      if (!npc.goal) next(npc, room, now);
      if (npc.step === 'go') {
        if (walk(npc, room, now, dt)) {
          if (npc.leaving) {
            room.npcs.delete(npc);
            room.dirty = true;
            continue;
          }
          start(npc, room, now);
        }
      } else act(npc, room, now);
    }
  }

  return { update };
}

module.exports = { createNpcs };
