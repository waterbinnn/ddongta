// The wish page (/wish): one golden poop that everyone rubs.
// Rubbing wears the gold off where people touch it most; every golden poop dropped in the toilet gilds it back a little.
// Everything here is shared by all visitors and kept in the key value store when there is one.

const ZONES = 12; // 3 height bands x 4 sides; the page works out which zone a rub landed on
const RUB_WEAR = Number(process.env.WISH_RUB_WEAR) || 0.0005; // one rub; 2,000 rubs wear a zone through
const GOLD_REFILL = Number(process.env.WISH_GOLD_REFILL) || 0.01; // one golden poop, on every zone
const MAX_WEAR = 0.9; // always a little gold left, so it still reads as a golden poop
const RUB_GAP_MS = 60; // faster than this is a bot, not a hand
const WISH_MAX = 40;
const WISH_GAP_MS = 8000;
const WISH_KEEP_MS = 24 * 3600e3;
const HIDE_LIMIT = 3; // this many people hiding a wish takes it down
const RECENT = 30;
const TICK_MS = 400;

function createWish({ kv, kstDate, clean }) {
  const wear = new Array(ZONES).fill(0);
  let day = kstDate();
  let rubsToday = 0;
  let rubsAll = 0;
  let wishes = []; // { id, text, at, hidden: Set }
  let nextWish = 1;
  const people = new Set();
  let touched = new Set(); // zones rubbed since the last tick, so others see a glow there
  let dirty = false;
  let saveAt = 0;

  const store = () => kv()?.isReady && kv();

  // load what was saved before a restart
  const load = async () => {
    const db = store();
    if (!db) return;
    try {
      const [w, today, all, list] = await Promise.all([db.get('wish:wear'), db.get(`wish:rubs:${day}`), db.get('wish:rubs'), db.get('wish:list')]);
      const saved = JSON.parse(w || 'null');
      if (Array.isArray(saved) && saved.length === ZONES) saved.forEach((v, i) => (wear[i] = Math.max(wear[i], Number(v) || 0)));
      rubsToday = Math.max(rubsToday, Number(today) || 0);
      rubsAll = Math.max(rubsAll, Number(all) || 0);
      for (const x of JSON.parse(list || '[]')) {
        if (x && typeof x.text === 'string' && Date.now() - x.at < WISH_KEEP_MS) wishes.push({ id: nextWish++, text: x.text, at: x.at, hidden: new Set() });
      }
    } catch (err) {
      console.warn('wish: could not load', err.message);
    }
  };
  let loaded = false;

  const save = () => {
    const db = store();
    if (!db) return;
    db.multi()
      .set('wish:wear', JSON.stringify(wear.map((v) => +v.toFixed(5))))
      .set('wish:rubs', String(rubsAll))
      .set(`wish:rubs:${day}`, String(rubsToday))
      .expire(`wish:rubs:${day}`, 3 * 86400)
      .set('wish:list', JSON.stringify(wishes.slice(-RECENT).map(({ text, at }) => ({ text, at }))))
      .exec()
      .catch(() => {});
  };

  const send = (ws, msg) => ws.readyState === 1 && ws.send(JSON.stringify(msg));
  const all = (msg) => {
    const data = JSON.stringify(msg);
    for (const p of people) if (p.ws.readyState === 1) p.ws.send(data);
  };
  const live = () => wishes.filter((w) => w.hidden.size < HIDE_LIMIT && Date.now() - w.at < WISH_KEEP_MS);
  const state = () => ({ t: 'w', wear: wear.map((v) => +v.toFixed(4)), today: rubsToday, all: rubsAll, online: people.size });

  setInterval(() => {
    if (!loaded && store()) {
      loaded = true;
      load().then(() => (dirty = true));
    }
    const d = kstDate();
    if (d !== day) {
      day = d;
      rubsToday = 0;
      dirty = true;
    }
    if (!dirty) return;
    dirty = false;
    all({ ...state(), touched: [...touched] });
    touched = new Set();
    if (Date.now() > saveAt) {
      saveAt = Date.now() + 5000;
      save();
    }
  }, TICK_MS);

  // a new visitor on the wish page
  function join(ws) {
    const me = { ws, lastRub: 0, lastWish: 0 };
    people.add(me);
    dirty = true;
    send(ws, { ...state(), hello: 1, wishes: live().slice(-12).map(({ id, text }) => ({ id, text })) });

    ws.on('message', (raw) => {
      let m;
      try {
        m = JSON.parse(raw);
      } catch {
        return;
      }
      const now = Date.now();
      if (m.t === 'rub') {
        const z = Number(m.z);
        if (!Number.isInteger(z) || z < 0 || z >= ZONES || now - me.lastRub < RUB_GAP_MS) return;
        me.lastRub = now;
        wear[z] = Math.min(MAX_WEAR, wear[z] + RUB_WEAR);
        rubsToday++;
        rubsAll++;
        touched.add(z);
        dirty = true;
      } else if (m.t === 'wish') {
        const text = clean(m.text).slice(0, WISH_MAX);
        if (!text || now - me.lastWish < WISH_GAP_MS) return;
        me.lastWish = now;
        const w = { id: nextWish++, text, at: now, hidden: new Set() };
        wishes.push(w);
        if (wishes.length > RECENT * 2) wishes = wishes.slice(-RECENT);
        // the writer already sees their own wish float up; everyone else gets it now
        const data = JSON.stringify({ t: 'wish', id: w.id, text });
        for (const p of people) if (p !== me && p.ws.readyState === 1) p.ws.send(data);
        saveAt = 0;
        dirty = true;
      } else if (m.t === 'hide') {
        const w = wishes.find((x) => x.id === Number(m.id));
        if (!w) return;
        w.hidden.add(me);
        if (w.hidden.size === HIDE_LIMIT) {
          all({ t: 'unwish', id: w.id });
          saveAt = 0;
          dirty = true;
        }
      }
    });
    ws.on('close', () => {
      people.delete(me);
      dirty = true;
    });
  }

  // the golden poop statue on the grounds: a rub there wears the same gold, a wish there joins the same list
  function rubHere() {
    const z = Math.floor(Math.random() * ZONES);
    wear[z] = Math.min(MAX_WEAR, wear[z] + RUB_WEAR);
    rubsToday++;
    rubsAll++;
    touched.add(z);
    dirty = true;
    return rubsToday;
  }
  function wishHere(raw) {
    const text = clean(raw).slice(0, WISH_MAX);
    if (!text) return '';
    const w = { id: nextWish++, text, at: Date.now(), hidden: new Set() };
    wishes.push(w);
    if (wishes.length > RECENT * 2) wishes = wishes.slice(-RECENT);
    all({ t: 'wish', id: w.id, text });
    saveAt = 0;
    dirty = true;
    return text;
  }
  const rubs = () => rubsToday;

  // someone dropped a golden poop in the toilet: a little gold goes back on, everywhere
  function gild() {
    for (let i = 0; i < ZONES; i++) wear[i] = Math.max(0, wear[i] - GOLD_REFILL);
    all({ t: 'gild' });
    dirty = true;
  }

  return { join, gild, rubHere, wishHere, rubs };
}

module.exports = { createWish };
