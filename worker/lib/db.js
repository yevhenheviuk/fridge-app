// D1 data layer used by the app API (api.js) and MCP tools (tools/*.js).
//
// Tables and columns are discovered from the schema (PRAGMA table_info),
// so a new feature only needs a migration — no registry here.
// BOOLEAN columns ↔ true/false, JSON columns ↔ objects, automatically.
// Every write bumps _ver(t) so the app re-loads only changed tables.
// Names starting with "_" (_meta, _ver) are internal and never exposed.

export class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

const NAME = /^[a-z][a-z0-9_]*$/;
const info = new Map(); // table → { cols:Set, bool:Set, json:Set }

export async function tableInfo(env, t) {
  if (info.has(t)) return info.get(t);
  if (!NAME.test(t || '')) throw new HttpError(404, `unknown table ${t}`);
  const { results } = await env.DB.prepare(`PRAGMA table_info(${t})`).all();
  if (!results.length) throw new HttpError(404, `unknown table ${t}`);
  const ti = { cols: new Set(), bool: new Set(), json: new Set() };
  for (const c of results) {
    ti.cols.add(c.name);
    const type = String(c.type).toUpperCase();
    if (type === 'BOOLEAN') ti.bool.add(c.name);
    if (type === 'JSON') ti.json.add(c.name);
  }
  info.set(t, ti);
  return ti;
}
export const col = (ti, c) => { if (!ti.cols.has(c)) throw new HttpError(400, `unknown column ${c}`); return c; };

function out(ti, r) {
  if (!r) return r;
  for (const c of ti.bool) if (c in r) r[c] = !!r[c];
  for (const c of ti.json) if (typeof r[c] === 'string') { try { r[c] = JSON.parse(r[c]); } catch { /* keep text */ } }
  return r;
}
function val(ti, c, v) {
  if (ti.json.has(c)) return JSON.stringify(v ?? null);
  if (ti.bool.has(c) || typeof v === 'boolean') return v ? 1 : 0;
  if (v !== null && typeof v === 'object') return JSON.stringify(v);
  return v === undefined ? null : v;
}
const fields = (ti, row) => Object.keys(row).filter(k => ti.cols.has(k) && row[k] !== undefined);
const bumpStmt = (env, t) => env.DB.prepare('INSERT INTO _ver (t, v) VALUES (?, 1) ON CONFLICT(t) DO UPDATE SET v = v + 1').bind(t);

export function db(env) {
  const D = env.DB;
  const self = {
    /** SELECT * FROM t [sql] — sql is trusted (built here or in tools) */
    async rows(t, sql = '', ...args) {
      const ti = await tableInfo(env, t);
      const { results } = await D.prepare(`SELECT * FROM ${t} ${sql}`).bind(...args).all();
      return results.map(r => out(ti, r));
    },
    async one(t, sql = '', ...args) { return (await self.rows(t, sql + ' LIMIT 1', ...args))[0] || null; },

    /** insert rows (ids generated). onConflict: unique column → upsert */
    async insert(t, rows, onConflict) {
      if (!Array.isArray(rows)) rows = [rows];
      if (!rows.length) return [];
      const ti = await tableInfo(env, t);
      if (onConflict) col(ti, onConflict);
      const stmts = rows.map(r => {
        r = { ...r };
        if (ti.cols.has('id') && !r.id) r.id = crypto.randomUUID();
        const ks = fields(ti, r);
        const upd = ks.filter(k => k !== onConflict && k !== 'id');
        const conflict = onConflict ? ` ON CONFLICT(${onConflict}) DO ${upd.length ? 'UPDATE SET ' + upd.map(k => `${k}=excluded.${k}`).join(',') : 'NOTHING'}` : '';
        return D.prepare(`INSERT INTO ${t} (${ks.join(',')}) VALUES (${ks.map(() => '?').join(',')})${conflict} RETURNING *`).bind(...ks.map(k => val(ti, k, r[k])));
      });
      const res = await D.batch([...stmts, bumpStmt(env, t)]);
      return res.slice(0, -1).flatMap(x => x.results).map(r => out(ti, r));
    },

    /** update by id, or by where = [column, value] */
    async update(t, idOrWhere, patch) {
      const ti = await tableInfo(env, t);
      const [wc, wv] = Array.isArray(idOrWhere) ? [col(ti, idOrWhere[0]), idOrWhere[1]] : ['id', idOrWhere];
      const ks = fields(ti, patch).filter(k => k !== 'id');
      if (!ks.length) return [];
      const [r] = await D.batch([
        D.prepare(`UPDATE ${t} SET ${ks.map(k => `${k}=?`).join(',')} WHERE ${wc}=? RETURNING *`).bind(...ks.map(k => val(ti, k, patch[k])), wv),
        bumpStmt(env, t)]);
      return r.results.map(x => out(ti, x));
    },

    /** delete by id(s) */
    async remove(t, ids) {
      ids = [].concat(ids);
      if (!ids.length) return [];
      return self._del(t, `id IN (${ids.map(() => '?').join(',')})`, ids);
    },
    /** delete where column = value */
    async removeWhere(t, c, v) {
      const ti = await tableInfo(env, t);
      return self._del(t, `${col(ti, c)} = ?`, [v]);
    },
    async _del(t, where, args) {
      const ti = await tableInfo(env, t);
      // children removed by ON DELETE CASCADE change too
      const children = { goals: ['goal_contribs'] }[t] || [];
      const [r] = await D.batch([D.prepare(`DELETE FROM ${t} WHERE ${where} RETURNING *`).bind(...args), bumpStmt(env, t), ...children.map(c => bumpStmt(env, c))]);
      return r.results.map(x => out(ti, x));
    },

    async versions() {
      const { results } = await D.prepare('SELECT t, v FROM _ver').all();
      return Object.fromEntries(results.map(r => [r.t, r.v]));
    },

    /* ----- domain functions (atomic) ----- */
    async addXp(person, n) {
      if (!person || person === 'me') return;
      await D.batch([
        D.prepare('INSERT INTO xp (person, xp) VALUES (?, max(?, 0)) ON CONFLICT(person) DO UPDATE SET xp = max(0, xp + ?)').bind(person, n, n),
        bumpStmt(env, 'xp')]);
    },
    async goalContribute(goalId, person, amount, d) {
      const g = await self.one('goals', 'WHERE id = ?', goalId);
      if (!g) throw new HttpError(404, 'goal not found');
      const add = Math.round(Math.min(Number(amount), g.price - g.saved) * 100) / 100;
      if (!(add > 0)) return { added: 0, saved: g.saved, price: g.price, closed: true };
      const saved = Math.round((g.saved + add) * 100) / 100, closed = saved >= g.price - 0.001;
      await D.batch([
        D.prepare('UPDATE goals SET saved = ?, done_at = ? WHERE id = ?').bind(saved, closed ? new Date().toISOString() : null, g.id),
        D.prepare('INSERT INTO goal_contribs (id, goal_id, person, amount, d) VALUES (?, ?, ?, ?, ?)').bind(crypto.randomUUID(), g.id, person || '', add, d || new Date().toISOString().slice(0, 10)),
        bumpStmt(env, 'goals'), bumpStmt(env, 'goal_contribs')]);
      return { added: add, saved, price: g.price, closed };
    },
    meta: {
      get: async k => (await D.prepare('SELECT v FROM _meta WHERE k = ?').bind(k).first())?.v ?? null,
      set: (k, v) => D.prepare('INSERT INTO _meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind(k, String(v)).run(),
    },
  };
  return self;
}
