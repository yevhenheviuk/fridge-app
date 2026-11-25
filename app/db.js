// Data layer: talks to the worker's REST API (worker/api.js, Cloudflare D1).
// Features declare the tables they need (`tables` in their index.js);
// core loads them and keeps them fresh by polling /api/ver every 15 s
// (only tables whose version changed are re-loaded).
//
//   data.items                 → current rows (array, never undefined)
//   db.items.add(row|rows)     → insert, reload, returns inserted rows
//   db.items.update(id, patch) → update by id
//   db.items.remove(id)        → delete by id
//   rpc('add_xp', {...})       → server function (worker/api.js)
//   api(path, {method, body})  → raw call, e.g. api('/rows/push_subscriptions?eq=endpoint.…')
import { errMsg, pref, savePref } from './core.js';

export const WORKER = 'https://fridge-mcp.yevhenheviuk.workers.dev';

/* ---------- auth (one household password → token) ---------- */
let token = pref('token', '');
let onAuthLost = () => {};
export const hasToken = () => !!token;
export const setOnAuthLost = fn => { onAuthLost = fn; };
export async function login(password) {
  const r = await fetch(WORKER + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(r.status === 401 ? 'Невірний пароль' : j.error || 'Сервер недоступний');
  token = j.token; savePref('token', token);
}
export function logout() { token = ''; savePref('token', ''); }

export async function api(path, { method = 'GET', body } = {}) {
  const r = await fetch(WORKER + '/api' + path, {
    method,
    headers: { Authorization: 'Bearer ' + token, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (r.status === 401) { logout(); onAuthLost(); throw new Error('auth'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

/* ---------- live table stores ---------- */
export const data = {};
export const db = {};
const opts = {};
const known = {}; // table → last seen version
let onChange = () => {};
export const setOnChange = fn => { onChange = fn; };

/* Table options (all optional):
   order: ['col', ascending]   limit: n   since: ['col', () => 'YYYY-MM-DD']
   sort: (a, b) => …  — client-side sort after load */
export function defineTable(name, o = {}) {
  opts[name] = { ...o, ...opts[name] };
  if (db[name]) return;
  data[name] = [];
  const t = encodeURIComponent(name);
  const load = async () => {
    const o = opts[name], q = new URLSearchParams();
    if (o.since) q.set('gte', `${o.since[0]}.${o.since[1]()}`);
    if (o.order) q.set('order', `${o.order[0]}.${o.order[1] ? 'asc' : 'desc'}`);
    if (o.limit) q.set('limit', o.limit);
    try {
      const rows = await api(`/rows/${t}?${q}`);
      data[name] = o.sort ? [...rows].sort(o.sort) : rows;
      onChange(name);
    } catch (e) { if (e.message !== 'auth') console.warn(name, e); }
  };
  const run = fn => async (...a) => {
    try { const r = await fn(...a); known[name] = r.ver; await load(); return r.rows || true; }
    catch (e) { if (e.message !== 'auth') errMsg(e); return null; }
  };
  db[name] = {
    load,
    add: run(d => api(`/rows/${t}`, { method: 'POST', body: d })),
    update: run((id, d) => api(`/rows/${t}/${encodeURIComponent(id)}`, { method: 'PATCH', body: d })),
    remove: run(id => api(`/rows/${t}/${encodeURIComponent(id)}`, { method: 'DELETE' })),
  };
}

export async function rpc(fn, args) {
  try { return await api('/rpc/' + fn, { method: 'POST', body: args }); }
  catch (e) { if (e.message !== 'auth') errMsg(e); return null; }
}

export const loadAll = () => Promise.all(Object.values(db).map(s => s.load()));

// Pull versions; reload only tables that changed (partner's edits, Claude via MCP).
async function sync() {
  let v;
  try { v = await api('/ver'); } catch { return; }
  const stale = Object.keys(db).filter(t => (v[t] || 0) !== (known[t] ?? -1));
  Object.assign(known, v);
  Object.keys(db).forEach(t => { if (!(t in v)) known[t] = 0; });
  await Promise.all(stale.map(t => db[t].load()));
}
let timer;
export async function startSync() {
  await sync();
  clearInterval(timer);
  timer = setInterval(() => { if (!document.hidden) sync(); }, 15000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
}
