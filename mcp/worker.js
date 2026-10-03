// Fridge App — remote MCP server (Cloudflare Worker, no dependencies)
// Lets Claude read and update the fridge, shopping list, meal plans and profiles.
//
// Environment variables (Cloudflare → Worker → Settings → Variables and Secrets):
//   SUPABASE_URL  — https://<project>.supabase.co
//   SUPABASE_KEY  — Supabase secret key (sb_secret_…)            [secret]
//   USER_ID       — the app user's UUID (Supabase → Authentication → Users)
//   MCP_TOKEN     — long random string; the connector URL is /mcp/<MCP_TOKEN>   [secret]
//   VAPID_PUBLIC  — Web Push public key (base64url, 65 bytes)
//   VAPID_PRIVATE — Web Push private key (base64url, 32 bytes)                  [secret]
//
// Cron trigger "0 * * * *": every hour the worker sends the daily push
// to subscriptions whose chosen hour (Europe/Brussels) is now.

const SERVER = { name: 'fridge-app', version: '1.0.0' };

const ITEM_FIELDS = {
  name: { type: 'string' },
  qty: { type: 'string', description: 'Free text: "500 г", "пів пачки", "3 шт"' },
  cat: { type: 'string', description: 'dairy, egg, meat, deli, fish, veg, fruit, greens, ready, semi, canned, grain, bread, sauce, oil, spice, spread, sweet, drink, sport, other' },
  zone: { type: 'string', enum: ['fridge', 'freezer', 'pantry'] },
  exp: { type: ['string', 'null'], description: 'Best-before date YYYY-MM-DD, or null' },
  pinned: { type: 'boolean', description: 'Eat first' },
  trig: { type: 'boolean', description: 'Trigger food for the owner (only for others)' },
};

const TOOLS = [
  {
    name: 'list_items',
    description: 'List products in stock, soonest expiry first, with days left. Optional zone filter.',
    inputSchema: { type: 'object', properties: { zone: { type: 'string', enum: ['fridge', 'freezer', 'pantry'] } } },
  },
  {
    name: 'add_items',
    description: 'Add one or more products to stock.',
    inputSchema: {
      type: 'object', required: ['items'],
      properties: { items: { type: 'array', items: { type: 'object', required: ['name'], properties: ITEM_FIELDS } } },
    },
  },
  {
    name: 'update_item',
    description: 'Change fields of a product in stock (by id).',
    inputSchema: { type: 'object', required: ['id', 'fields'], properties: { id: { type: 'string' }, fields: { type: 'object', properties: ITEM_FIELDS } } },
  },
  {
    name: 'remove_items',
    description: 'Remove products from stock and log why: used (eaten/cooked) or tossed (thrown away).',
    inputSchema: {
      type: 'object', required: ['ids', 'reason'],
      properties: { ids: { type: 'array', items: { type: 'string' } }, reason: { type: 'string', enum: ['used', 'tossed'] } },
    },
  },
  {
    name: 'get_shopping',
    description: 'Get the shopping list plus staples (always-at-home products) with whether each is in stock.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'add_shopping',
    description: 'Add items to the shopping list. Use source "plan" for items needed by a meal plan.',
    inputSchema: {
      type: 'object', required: ['items'],
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object', required: ['name'],
            properties: { name: { type: 'string' }, qty: { type: 'string' }, note: { type: 'string' }, cat: ITEM_FIELDS.cat, zone: ITEM_FIELDS.zone, source: { type: 'string', enum: ['manual', 'plan'] } },
          },
        },
      },
    },
  },
  {
    name: 'remove_shopping',
    description: 'Remove items from the shopping list by id.',
    inputSchema: { type: 'object', required: ['ids'], properties: { ids: { type: 'array', items: { type: 'string' } } } },
  },
  {
    name: 'get_profiles',
    description: 'Get the people the meals are planned for: goals, daily kcal targets and foods to avoid.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'set_profiles',
    description: 'Replace the people list. Each person: {id, name, goal, kcal, avoid}. Ids used in meal kcal: "yevhen", "oleksandra".',
    inputSchema: { type: 'object', required: ['people'], properties: { people: { type: 'array', items: { type: 'object' } } } },
  },
  {
    name: 'get_plan',
    description: 'Get the meal plan starting on a date (YYYY-MM-DD). Without a date returns the latest plans.',
    inputSchema: { type: 'object', properties: { start: { type: 'string' } } },
  },
  {
    name: 'set_plan',
    description: 'Create or replace a meal plan. days: [{date, meals:[{slot, name, recipe, kcal:{yevhen, oleksandra}, done:false}]}]. Only after the user approved it.',
    inputSchema: {
      type: 'object', required: ['start', 'days'],
      properties: { start: { type: 'string' }, title: { type: 'string' }, notes: { type: 'string' }, days: { type: 'array', items: { type: 'object' } } },
    },
  },
  {
    name: 'get_log',
    description: 'Activity log (used, tossed, bought, added, shop_add, meal) for the last N days (default 7).',
    inputSchema: { type: 'object', properties: { days: { type: 'number' } } },
  },
];

// ---------- Supabase REST ----------
function db(env) {
  const base = env.SUPABASE_URL.replace(/\/+$/, '') + '/rest/v1/';
  const headers = { apikey: env.SUPABASE_KEY, 'Content-Type': 'application/json' };
  if (env.SUPABASE_KEY.startsWith('eyJ')) headers.Authorization = 'Bearer ' + env.SUPABASE_KEY; // legacy service_role key
  const uid = env.USER_ID;
  async function call(method, path, body, prefer) {
    const h = { ...headers };
    if (prefer) h.Prefer = prefer;
    const r = await fetch(base + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
    const text = await r.text();
    if (!r.ok) throw new Error(`Supabase ${r.status}: ${text}`);
    return text ? JSON.parse(text) : null;
  }
  const own = `user_id=eq.${uid}`;
  return {
    select: (table, q = '') => call('GET', `${table}?${own}&select=*${q}`),
    insert: (table, rows) => call('POST', table, rows.map(r => ({ ...r, user_id: uid })), 'return=representation'),
    upsert: (table, rows, onConflict) =>
      call('POST', `${table}?on_conflict=${onConflict}`, rows.map(r => ({ ...r, user_id: uid })), 'resolution=merge-duplicates,return=representation'),
    update: (table, id, fields) => call('PATCH', `${table}?${own}&id=eq.${encodeURIComponent(id)}`, fields, 'return=representation'),
    remove: (table, ids) => call('DELETE', `${table}?${own}&id=in.(${ids.map(encodeURIComponent).join(',')})`, null, 'return=representation'),
  };
}

const today = () => new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Brussels' }));
function daysLeft(exp) {
  if (!exp) return null;
  const t = today(); t.setHours(0, 0, 0, 0);
  const [y, m, d] = exp.split('-').map(Number);
  return Math.round((new Date(y, m - 1, d) - t) / 864e5);
}
const pick = (o, keys) => Object.fromEntries(keys.filter(k => o[k] !== undefined).map(k => [k, o[k]]));
const ITEM_KEYS = Object.keys(ITEM_FIELDS);

async function runTool(name, a, env) {
  const s = db(env);
  switch (name) {
    case 'list_items': {
      let rows = await s.select('items', a.zone ? `&zone=eq.${a.zone}` : '');
      rows = rows.map(r => ({ id: r.id, name: r.name, qty: r.qty, cat: r.cat, zone: r.zone, exp: r.exp, days_left: daysLeft(r.exp), pinned: r.pinned, trig: r.trig }));
      rows.sort((x, y) => (y.pinned - x.pinned) || ((x.days_left ?? 1e4) - (y.days_left ?? 1e4)));
      return { today: today().toISOString().slice(0, 10), count: rows.length, items: rows };
    }
    case 'add_items': {
      const rows = await s.insert('items', a.items.map(i => pick(i, ITEM_KEYS)));
      await s.insert('log', rows.map(r => ({ type: 'add', name: r.name, cat: r.cat, qty: r.qty })));
      return { added: rows.map(r => ({ id: r.id, name: r.name })) };
    }
    case 'update_item': {
      const rows = await s.update('items', a.id, pick(a.fields || {}, ITEM_KEYS));
      return { updated: rows };
    }
    case 'remove_items': {
      const rows = await s.remove('items', a.ids);
      if (rows.length) await s.insert('log', rows.map(r => ({ type: a.reason, name: r.name, cat: r.cat, qty: r.qty })));
      return { removed: rows.map(r => r.name), reason: a.reason };
    }
    case 'get_shopping': {
      const [shop, staples, items] = await Promise.all([s.select('shopping'), s.select('staples'), s.select('items')]);
      const n = x => (x || '').toLowerCase().trim();
      return {
        shopping: shop.map(r => pick(r, ['id', 'name', 'qty', 'note', 'cat', 'source'])),
        staples: staples.map(st => ({ id: st.id, name: st.name, in_stock: items.some(i => n(i.name).includes(n(st.name))) })),
      };
    }
    case 'add_shopping': {
      const rows = await s.insert('shopping', a.items.map(i => pick(i, ['name', 'qty', 'note', 'cat', 'zone', 'source'])));
      await s.insert('log', rows.map(r => ({ type: 'shop_add', name: r.name, cat: r.cat, qty: r.qty })));
      return { added: rows.map(r => ({ id: r.id, name: r.name })) };
    }
    case 'remove_shopping': {
      const rows = await s.remove('shopping', a.ids);
      return { removed: rows.map(r => r.name) };
    }
    case 'get_profiles': {
      const rows = await s.select('profiles');
      return { people: rows[0]?.people || [] };
    }
    case 'set_profiles': {
      await s.upsert('profiles', [{ people: a.people, updated_at: new Date().toISOString() }], 'user_id');
      return { ok: true };
    }
    case 'get_plan': {
      const rows = a.start ? await s.select('plans', `&start=eq.${a.start}`) : await s.select('plans', '&order=start.desc&limit=3');
      return { plans: rows.map(r => pick(r, ['id', 'start', 'title', 'notes', 'days'])) };
    }
    case 'set_plan': {
      const rows = await s.upsert('plans', [{ start: a.start, title: a.title || '', notes: a.notes || '', days: a.days }], 'user_id,start');
      return { saved: rows.map(r => ({ id: r.id, start: r.start })) };
    }
    case 'get_log': {
      const since = new Date(Date.now() - (a.days || 7) * 864e5).toISOString();
      const rows = await s.select('log', `&t=gte.${since}&order=t.desc&limit=300`);
      return { log: rows.map(r => pick(r, ['t', 'type', 'name', 'qty'])) };
    }
    default:
      throw new Error('Unknown tool: ' + name);
  }
}

// ---------- Web Push (VAPID, no payload: the app fetches the text itself) ----------
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const ub64 = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), c => c.charCodeAt(0));
const enc = o => b64u(new TextEncoder().encode(JSON.stringify(o)));

let vapidKeyCache;
async function vapidKey(env) {
  if (vapidKeyCache) return vapidKeyCache;
  const pub = ub64(env.VAPID_PUBLIC);
  const jwk = { kty: 'EC', crv: 'P-256', d: env.VAPID_PRIVATE, x: b64u(pub.slice(1, 33)), y: b64u(pub.slice(33, 65)), ext: true };
  vapidKeyCache = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  return vapidKeyCache;
}
async function sendPush(endpoint, env) {
  const unsigned = enc({ typ: 'JWT', alg: 'ES256' }) + '.' + enc({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: 'https://yevhenheviuk.github.io/fridge-app/',
  });
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, await vapidKey(env), new TextEncoder().encode(unsigned));
  return fetch(endpoint, {
    method: 'POST',
    headers: { TTL: '86400', Urgency: 'normal', Authorization: `vapid t=${unsigned}.${b64u(sig)}, k=${env.VAPID_PUBLIC}` },
    body: '',
  });
}

// Service-role REST call without the single-user filter (subscriptions belong to any user)
async function rest(env, method, path, body) {
  const headers = { apikey: env.SUPABASE_KEY, 'Content-Type': 'application/json' };
  if (env.SUPABASE_KEY.startsWith('eyJ')) headers.Authorization = 'Bearer ' + env.SUPABASE_KEY;
  const r = await fetch(env.SUPABASE_URL.replace(/\/+$/, '') + '/rest/v1/' + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${t}`);
  return t ? JSON.parse(t) : null;
}
const brusselsDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels' }).format(new Date());
const brusselsHour = () => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Brussels', hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
const dayDiff = (a, b) => { const [y1, m1, d1] = a.split('-').map(Number), [y2, m2, d2] = b.split('-').map(Number); return Math.round((Date.UTC(y1, m1 - 1, d1) - Date.UTC(y2, m2 - 1, d2)) / 864e5); };

async function digestFor(userId, env) {
  const items = await rest(env, 'GET', `items?user_id=eq.${userId}&select=name,exp`);
  const t = brusselsDate();
  const bucket = { old: [], today: [], tomorrow: [] };
  for (const i of items) {
    if (!i.exp) continue;
    const d = dayDiff(i.exp, t);
    if (d < 0) bucket.old.push(i.name); else if (d === 0) bucket.today.push(i.name); else if (d === 1) bucket.tomorrow.push(i.name);
  }
  const list = a => a.slice(0, 4).join(', ') + (a.length > 4 ? ` +${a.length - 4}` : '');
  const parts = [];
  if (bucket.today.length) parts.push('🔥 Сьогодні: ' + list(bucket.today));
  if (bucket.tomorrow.length) parts.push('⏳ Завтра: ' + list(bucket.tomorrow));
  if (bucket.old.length) parts.push('⚠️ Прострочено: ' + list(bucket.old));
  return {
    title: '🧊 Час оновити холодильник',
    body: parts.length ? parts.join('\n') : 'Нічого не горить 👌 Відміть, що з\u2019їли й купили сьогодні.',
  };
}

async function dailyPush(env) {
  const subs = await rest(env, 'GET', `push_subscriptions?hour=eq.${brusselsHour()}&select=id,endpoint`);
  for (const s of subs) {
    try {
      const r = await sendPush(s.endpoint, env);
      if (r.status === 404 || r.status === 410) await rest(env, 'DELETE', `push_subscriptions?id=eq.${s.id}`);
    } catch (e) { console.log('push failed', e.message); }
  }
}

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

async function handlePush(request, env, url) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (url.pathname === '/push/key') return json({ key: env.VAPID_PUBLIC || null });
  if (request.method !== 'POST') return json({ error: 'method' }, 405);
  let endpoint;
  try { ({ endpoint } = await request.json()); } catch { return json({ error: 'bad json' }, 400); }
  if (!endpoint) return json({ error: 'no endpoint' }, 400);
  const [sub] = await rest(env, 'GET', `push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}&select=user_id`);
  if (!sub) return json({ error: 'unknown subscription' }, 404);
  if (url.pathname === '/push/digest') return json(await digestFor(sub.user_id, env));
  if (url.pathname === '/push/test') {
    const r = await sendPush(endpoint, env);
    return json({ ok: r.ok, status: r.status }, r.ok ? 200 : 502);
  }
  return json({ error: 'not found' }, 404);
}

// ---------- MCP (JSON-RPC over Streamable HTTP, stateless) ----------
async function handleRpc(msg, env) {
  const { id, method, params } = msg;
  const ok = result => ({ jsonrpc: '2.0', id, result });
  const err = (code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });
  if (id === undefined || id === null) return null; // notification, no reply
  switch (method) {
    case 'initialize':
      return ok({
        protocolVersion: params?.protocolVersion || '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: SERVER,
        instructions: 'Home fridge of Yevhen and Oleksandra (Sasha). Dates are Europe/Brussels. Items with trig=true are trigger foods for Yevhen — only for Sasha. Never save a meal plan the user has not approved.',
      });
    case 'ping':
      return ok({});
    case 'tools/list':
      return ok({ tools: TOOLS });
    case 'tools/call':
      try {
        const out = await runTool(params.name, params.arguments || {}, env);
        return ok({ content: [{ type: 'text', text: JSON.stringify(out) }] });
      } catch (e) {
        return ok({ content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true });
      }
    default:
      return err(-32601, 'Method not found: ' + method);
  }
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(dailyPush(env));
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/push/')) {
      try { return await handlePush(request, env, url); } catch (e) { return json({ error: e.message }, 500); }
    }
    if (!env.MCP_TOKEN || url.pathname !== `/mcp/${env.MCP_TOKEN}`) return new Response('Not found', { status: 404 });

    if (request.method === 'GET') {
      // MCP clients asking for an SSE stream: not supported (stateless server)
      if ((request.headers.get('accept') || '').includes('text/event-stream')) return new Response(null, { status: 405 });
      // Plain browser visit = health check
      try {
        const rows = await db(env).select('items', '&limit=1000');
        return Response.json({ ok: true, items: rows.length });
      } catch (e) {
        return Response.json({ ok: false, error: e.message }, { status: 500 });
      }
    }
    if (request.method === 'DELETE') return new Response(null, { status: 204 });
    if (request.method !== 'POST') return new Response(null, { status: 405 });

    let body;
    try { body = await request.json(); } catch { return Response.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, { status: 400 }); }
    const batch = Array.isArray(body);
    const replies = (await Promise.all((batch ? body : [body]).map(m => handleRpc(m, env)))).filter(Boolean);
    if (!replies.length) return new Response(null, { status: 202 });
    return Response.json(batch ? replies : replies[0]);
  },
};
