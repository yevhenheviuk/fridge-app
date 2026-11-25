// REST API for the PWA (GitHub Pages → this worker). One household, one password.
//
//   POST   /api/login                {password} → {token}
//   GET    /api/ver                  → {table: version}  (app polls this)
//   GET    /api/rows/:t              ?order=col|col.desc &limit=n &gte=col.value &eq=col.value
//   POST   /api/rows/:t              row | rows   (?onConflict=uniqueCol → upsert)
//   PATCH  /api/rows/:t/:id          patch        (or ?eq=col.value instead of :id)
//   DELETE /api/rows/:t/:id                       (or ?eq=col.value)
//   POST   /api/rpc/add_xp           {person, n}
//   POST   /api/rpc/goal_contribute  {goal, person, amount, d}
//
// Secret APP_PASSWORD (Cloudflare → Worker → Settings → Variables and Secrets).
import { db, tableInfo, col, HttpError } from './lib/db.js';

const enc = new TextEncoder();
async function hmac(key, msg) {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return [...new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(msg)))].map(b => b.toString(16).padStart(2, '0')).join('');
}
const tokenFor = env => hmac(env.APP_PASSWORD, 'nash-dim-app-v1');
function same(a, b) { if (a.length !== b.length) return false; let x = 0; for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i); return x === 0; }
const split = s => { const i = s.indexOf('.'); return i < 0 ? [s, ''] : [s.slice(0, i), s.slice(i + 1)]; };

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};
export const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS } });

export async function handleApi(req, env, url) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (!env.APP_PASSWORD) return json({ error: 'APP_PASSWORD is not set on the worker' }, 503);
  try {
    const path = url.pathname.replace(/^\/api\/?/, '').split('/').map(decodeURIComponent);

    if (path[0] === 'login' && req.method === 'POST') {
      const { password } = await req.json().catch(() => ({}));
      const ok = same(await hmac('cmp', String(password || '')), await hmac('cmp', env.APP_PASSWORD));
      if (!ok) { await new Promise(r => setTimeout(r, 800)); return json({ error: 'wrong password' }, 401); }
      return json({ token: await tokenFor(env) });
    }
    const auth = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!auth || !same(auth, await tokenFor(env))) return json({ error: 'auth' }, 401);

    const s = db(env);
    if (path[0] === 'ver') return json(await s.versions());

    if (path[0] === 'rpc' && req.method === 'POST') {
      const a = await req.json();
      if (path[1] === 'add_xp') { await s.addXp(a.person, Number(a.n) || 0); return json({ ok: true }); }
      if (path[1] === 'goal_contribute') return json(await s.goalContribute(a.goal, a.person, a.amount, a.d));
      throw new HttpError(404, 'unknown rpc');
    }

    if (path[0] === 'rows' && path[1]) {
      const t = path[1], id = path[2];
      const ti = await tableInfo(env, t);
      const q = url.searchParams;
      const eq = q.get('eq') ? split(q.get('eq')) : null;
      if (eq) col(ti, eq[0]);
      const where = id ? ['id', id] : eq;
      const written = async rows => json({ rows, ver: (await s.versions())[t] || 0 });

      if (req.method === 'GET') {
        const conds = [], args = [];
        if (eq) { conds.push(`${eq[0]} = ?`); args.push(eq[1]); }
        if (q.get('gte')) { const [c, v] = split(q.get('gte')); conds.push(`${col(ti, c)} >= ?`); args.push(v); }
        let sql = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
        if (q.get('order')) { const [c, dir] = split(q.get('order')); sql += ` ORDER BY ${col(ti, c)} ${dir === 'desc' ? 'DESC' : 'ASC'}`; }
        const lim = parseInt(q.get('limit'), 10);
        if (lim > 0) sql += ` LIMIT ${Math.min(lim, 5000)}`;
        return json(await s.rows(t, sql, ...args));
      }
      if (req.method === 'POST') return written(await s.insert(t, await req.json(), q.get('onConflict') || undefined));
      if (req.method === 'PATCH') { if (!where) throw new HttpError(400, 'id or eq required'); return written(await s.update(t, where, await req.json())); }
      if (req.method === 'DELETE') {
        if (!where) throw new HttpError(400, 'id or eq required');
        return written(id ? await s.remove(t, id) : await s.removeWhere(t, eq[0], eq[1]));
      }
    }
    return json({ error: 'not found' }, 404);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    const msg = String(e.message || e);
    if (/constraint|NOT NULL|CHECK|no such column|SQLITE/i.test(msg)) return json({ error: msg }, 400);
    console.error(e);
    return json({ error: 'server error' }, 500);
  }
}
