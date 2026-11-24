// Supabase REST with the secret key (bypasses RLS).
// db(env)   → scoped to the household's USER_ID (MCP tools, Telegram bot)
// rest(env) → raw, unscoped (push subscriptions, app_meta)

function headers(env, prefer) {
  const h = { apikey: env.SUPABASE_KEY, 'Content-Type': 'application/json' };
  if (env.SUPABASE_KEY.startsWith('eyJ')) h.Authorization = 'Bearer ' + env.SUPABASE_KEY; // legacy service_role key
  if (prefer) h.Prefer = prefer;
  return h;
}
const base = env => env.SUPABASE_URL.replace(/\/+$/, '') + '/rest/v1/';

export async function rest(env, method, path, body, prefer) {
  const r = await fetch(base(env) + path, { method, headers: headers(env, prefer), body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${t}`);
  return t ? JSON.parse(t) : null;
}

export function db(env) {
  const uid = env.USER_ID;
  const own = `user_id=eq.${uid}`;
  const withUser = rows => rows.map(r => ({ ...r, user_id: uid }));
  return {
    uid,
    select: (table, q = '') => rest(env, 'GET', `${table}?${own}&select=*${q}`),
    insert: (table, rows) => rest(env, 'POST', table, withUser(rows), 'return=representation'),
    upsert: (table, rows, onConflict) => rest(env, 'POST', `${table}?on_conflict=${onConflict}`, withUser(rows), 'resolution=merge-duplicates,return=representation'),
    update: (table, id, fields) => rest(env, 'PATCH', `${table}?${own}&id=eq.${encodeURIComponent(id)}`, fields, 'return=representation'),
    updateWhere: (table, q, fields) => rest(env, 'PATCH', `${table}?${own}&${q}`, fields, 'return=representation'),
    remove: (table, ids) => rest(env, 'DELETE', `${table}?${own}&id=in.(${ids.map(encodeURIComponent).join(',')})`, null, 'return=representation'),
    rpc: (fn, args) => rest(env, 'POST', `rpc/${fn}`, args),
    addXp: (person, n) => (person ? rest(env, 'POST', 'rpc/add_xp', { p_person: person, p_n: n, p_user: uid }).catch(() => null) : null),
  };
}

// worker-only key/value settings (Telegram group id, person map, …)
export const meta = {
  get: async (env, k) => (await rest(env, 'GET', `app_meta?k=eq.${encodeURIComponent(k)}&select=v`))[0]?.v ?? null,
  set: (env, k, v) => rest(env, 'POST', 'app_meta?on_conflict=k', [{ k, v: String(v) }], 'resolution=merge-duplicates'),
  del: (env, k) => rest(env, 'DELETE', `app_meta?k=eq.${encodeURIComponent(k)}`),
};
