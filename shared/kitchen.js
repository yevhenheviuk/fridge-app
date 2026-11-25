// Kitchen state helpers shared by fridge, shopping and meals (browser only).
// Reads live rows from app/db.js; the tables themselves are declared by the
// features that use them (items, staples, shopping, log).
import { data, db } from '../app/db.js';
import { norm } from './food.js';

export const inStock = name => {
  const n = norm(name);
  return data.items.some(i => norm(i.name).includes(n) || (n.includes(norm(i.name)) && norm(i.name).length > 2));
};
export const stapleFor = name => {
  const n = norm(name);
  return data.staples.find(s => norm(s.name) === n || n.includes(norm(s.name)));
};

// Shopping list = manual rows + staples that ran out (virtual rows, id 'st-…').
export function shopEntries() {
  const out = data.shopping.map(s => ({ kind: 'manual', ...s }));
  data.staples.forEach(st => {
    if (inStock(st.name)) return;
    if (out.some(o => norm(o.name) === norm(st.name))) return;
    out.push({ kind: 'staple', id: 'st-' + st.id, name: st.name, cat: st.cat, zone: st.zone });
  });
  return out;
}

// Activity log (feature: log). Types: add, bought, used, shop_add, meal. Returns inserted rows.
export function logEvent(type, it) {
  if (!db.log) return Promise.resolve(null);
  const d = { t: new Date().toISOString(), type, name: it.name || '', cat: it.cat || 'other' };
  if (it.qty) d.qty = it.qty;
  return db.log.add(d);
}
