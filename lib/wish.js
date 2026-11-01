// The golden poop statue on the grounds: everyone's rubs are counted (today and ever) and wishes are kept
// for a day. Both are shared by every room and saved in the key value store when there is one.

const WISH_MAX = 40;
const WISH_KEEP_MS = 24 * 3600e3;
const RECENT = 30;

function createWish({ kv, kstDate, clean }) {
  let day = kstDate();
  let rubsToday = 0;
  let rubsAll = 0;
  let wishes = []; // { text, at }
  let saveAt = 0;
  let loaded = false;

  const store = () => kv()?.isReady && kv();

  // load what was saved before a restart
  const load = async () => {
    const db = store();
    if (!db) return;
    try {
      const [today, all, list] = await Promise.all([db.get(`wish:rubs:${day}`), db.get('wish:rubs'), db.get('wish:list')]);
      rubsToday = Math.max(rubsToday, Number(today) || 0);
      rubsAll = Math.max(rubsAll, Number(all) || 0);
      for (const x of JSON.parse(list || '[]')) {
        if (x && typeof x.text === 'string' && Date.now() - x.at < WISH_KEEP_MS) wishes.push({ text: x.text, at: x.at });
      }
    } catch (err) {
      console.warn('wish: could not load', err.message);
    }
  };

  const save = () => {
    const db = store();
    if (!db) return;
    db.multi()
      .set('wish:rubs', String(rubsAll))
      .set(`wish:rubs:${day}`, String(rubsToday))
      .expire(`wish:rubs:${day}`, 3 * 86400)
      .set('wish:list', JSON.stringify(wishes.slice(-RECENT)))
      .exec()
      .catch(() => {});
  };

  setInterval(() => {
    if (!loaded && store()) {
      loaded = true;
      load();
    }
    const d = kstDate();
    if (d !== day) {
      day = d;
      rubsToday = 0;
    }
    if (saveAt && Date.now() > saveAt) {
      saveAt = 0;
      save();
    }
  }, 1000);
  const saveSoon = () => (saveAt ||= Date.now() + 5000);

  // a rub on the statue; returns how many there have been today
  function rubHere() {
    rubsToday++;
    rubsAll++;
    saveSoon();
    return rubsToday;
  }

  // a wish made at the statue; returns the cleaned text (empty if nothing was left of it)
  function wishHere(raw) {
    const text = clean(raw).slice(0, WISH_MAX);
    if (!text) return '';
    wishes.push({ text, at: Date.now() });
    if (wishes.length > RECENT * 2) wishes = wishes.slice(-RECENT);
    saveAt = Date.now(); // wishes are saved straight away
    return text;
  }

  return { rubHere, wishHere };
}

module.exports = { createWish };
