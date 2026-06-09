// Resolve heard-node prefixes/pubkeys to names via the CoreScope API (through
// corsproxy.on8ar.eu/cs, which adds CORS for rx.on8ar.eu). The full node list is
// fetched once per session and cached in localStorage (1h TTL). Names are shown
// only when a prefix uniquely resolves (2-byte prefixes can collide).
const BASE = 'https://corsproxy.on8ar.eu/cs/api/nodes';
const LS_KEY = 'rx-node-names';
const TTL_MS = 60 * 60 * 1000;

let maps = null; // { full:Map, p4:Map(4hex->[name]), p6:Map(6hex->[name]) }

function build(list) {
  const full = new Map(), p4 = new Map(), p6 = new Map();
  for (const n of list) {
    const pk = (n.public_key || '').toLowerCase();
    const nm = n.name || '';
    if (!pk || !nm) continue;
    full.set(pk, nm);
    for (const [m, len] of [[p4, 4], [p6, 6]]) {
      const k = pk.slice(0, len);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(nm);
    }
  }
  return { full, p4, p6 };
}

async function fetchAll() {
  let out = [], offset = 0;
  const limit = 500;
  for (let i = 0; i < 20; i++) { // safety cap (10k nodes)
    const r = await fetch(BASE + '?limit=' + limit + '&offset=' + offset);
    if (!r.ok) break;
    const ns = (await r.json()).nodes || [];
    out = out.concat(ns.map((n) => ({ public_key: n.public_key, name: n.name })));
    if (ns.length < limit) break;
    offset += limit;
  }
  return out;
}

export async function loadNodeNames() {
  try {
    const c = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
    if (c && Array.isArray(c.list) && Date.now() - c.t < TTL_MS) { maps = build(c.list); return; }
  } catch (e) { /* ignore cache errors */ }
  const list = await fetchAll();
  if (list.length) {
    maps = build(list);
    try { localStorage.setItem(LS_KEY, JSON.stringify({ t: Date.now(), list })); } catch (e) {}
  }
}

// nameFor returns the node name if the key resolves uniquely, else null.
export function nameFor(key, keylen) {
  if (!maps) return null;
  if (keylen >= 32) return maps.full.get(key) || null;
  const m = keylen === 2 ? maps.p4 : maps.p6;
  const l = m.get(key);
  return l && l.length === 1 ? l[0] : null;
}
