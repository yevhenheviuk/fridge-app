// ONE-TIME import Supabase → D1. Delete this file (and its route in index.js)
// once _meta.migrated_supabase is set. Runs from GET /migrate-supabase or the cron,
// only while SUPABASE_URL / SUPABASE_KEY / USER_ID are still set on the worker.
import { db, tableInfo } from './lib/db.js';

const TABLES = ['items', 'shopping', 'staples', 'plans', 'profiles', 'log', 'push_subscriptions'];

async function fetchAll(env, table) {
  const h = { apikey: env.SUPABASE_KEY };
  if (env.SUPABASE_KEY.startsWith('eyJ')) h.Authorization = 'Bearer ' + env.SUPABASE_KEY;
  const base = env.SUPABASE_URL.replace(/\/+$/, '') + `/rest/v1/${table}?user_id=eq.${env.USER_ID}&select=*`;
  const out = [];
  for (let off = 0; ; off += 1000) {
    const r = await fetch(`${base}&limit=1000&offset=${off}`, { headers: h });
    if (!r.ok) throw new Error(`${table}: ${r.status} ${await r.text()}`);
    const rows = await r.json();
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}

export async function migrateSupabase(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY || !env.USER_ID) return { skipped: 'no supabase vars' };
  const s = db(env);
  const done = await s.meta.get('migrated_supabase');
  if (done) return { skipped: 'already migrated at ' + done };
  const counts = {};
  for (const t of TABLES) {
    const ti = await tableInfo(env, t);
    let rows = await fetchAll(env, t);
    if (t === 'profiles') rows = rows.slice(0, 1).map(r => ({ ...r, id: 'main' }));
    rows = rows.map(r => Object.fromEntries(Object.entries(r).filter(([k]) => ti.cols.has(k))));
    for (let i = 0; i < rows.length; i += 50) await s.insert(t, rows.slice(i, i + 50), 'id');
    counts[t] = rows.length;
  }
  await s.meta.set('migrated_supabase', new Date().toISOString());
  return { migrated: counts };
}
