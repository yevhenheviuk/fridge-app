// Data layer: one Supabase client, one live store per table.
// Features declare the tables they need (`tables` in their index.js);
// core loads them, keeps them fresh via realtime and re-renders.
//
//   data.items                 → current rows (array, never undefined)
//   db.items.add(row|rows)     → insert, reload, returns inserted rows
//   db.items.update(id, patch) → update by id
//   db.items.remove(id)        → delete by id
//   rpc('add_xp', {...})       → call a Postgres function
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { errMsg } from './core.js';

export const WORKER = 'https://fridge-mcp.yevhenheviuk.workers.dev';
const SB_URL = 'https://cfgsgtuzwojcfoyxzrhr.supabase.co';
const SB_KEY = 'sb_publishable_LmFqWvYidx73-nTtUB7HjQ_KNjyEeLc';
export const sb = createClient(SB_URL, SB_KEY);

export const data = {};
export const db = {};
const opts = {};
let onChange = () => {};
export const setOnChange = fn => { onChange = fn; };

/* Table options (all optional):
   order: ['col', ascending]   limit: n   since: ['col', () => 'YYYY-MM-DD']
   sort: (a, b) => …  — client-side sort after load */
export function defineTable(name, o = {}) {
  opts[name] = { ...o, ...opts[name] };
  if (db[name]) return;
  data[name] = [];
  const load = async () => {
    const o = opts[name];
    let q = sb.from(name).select('*');
    if (o.since) q = q.gte(o.since[0], o.since[1]());
    if (o.order) q = q.order(o.order[0], { ascending: !!o.order[1] });
    if (o.limit) q = q.limit(o.limit);
    const { data: rows, error } = await q;
    if (error) { console.warn(name, error); return; }
    data[name] = o.sort ? [...rows].sort(o.sort) : rows || [];
    onChange(name);
  };
  const run = fn => async (...a) => {
    try { const { data: d, error } = await fn(...a); if (error) throw error; await load(); return d || true; }
    catch (e) { errMsg(e); return null; }
  };
  db[name] = {
    load,
    add: run(d => sb.from(name).insert(d).select()),
    update: run((id, d) => sb.from(name).update(d).eq('id', id).select()),
    remove: run(id => sb.from(name).delete().eq('id', id)),
    removeWhere: run((col, val) => sb.from(name).delete().eq(col, val)),
  };
}

export async function rpc(fn, args) {
  const { data: d, error } = await sb.rpc(fn, args);
  if (error) { errMsg(error); return null; }
  return d;
}

export const loadAll = () => Promise.all(Object.values(db).map(s => s.load()));

const extra = {};
// For tables core manages itself (profiles): name → reload fn
export const onTableChange = (name, fn) => { extra[name] = fn; };

export function startRealtime() {
  sb.channel('home').on('postgres_changes', { event: '*', schema: 'public' }, p => {
    if (extra[p.table]) extra[p.table](); else db[p.table]?.load();
  }).subscribe();
  // back to the app → pull fresh
  document.addEventListener('visibilitychange', () => { if (!document.hidden) loadAll(); });
}
