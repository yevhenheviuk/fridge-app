// Daily Web Push (VAPID, empty payload: the service worker fetches the text
// from /push/digest). Subscriptions: table push_subscriptions (hour = Brussels).
import { db } from './lib/db.js';
import { brusselsDate, brusselsHour, dayDiff } from './lib/time.js';
import { CORS, json } from './api.js';

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
    aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: 'https://yevhenheviuk.github.io/fridge-app/',
  });
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, await vapidKey(env), new TextEncoder().encode(unsigned));
  return fetch(endpoint, { method: 'POST', headers: { TTL: '86400', Urgency: 'normal', Authorization: `vapid t=${unsigned}.${b64u(sig)}, k=${env.VAPID_PUBLIC}` }, body: '' });
}

async function digest(env) {
  const s = db(env), t = brusselsDate();
  const [items, todos] = await Promise.all([
    s.rows('items', 'WHERE exp IS NOT NULL AND exp <= ?', brusselsDate(new Date(Date.now() + 864e5))),
    s.rows('todos', 'WHERE done = 0 AND due <= ?', t),
  ]);
  const bucket = { old: [], today: [], tomorrow: [] };
  for (const i of items) { const d = dayDiff(i.exp, t); (d < 0 ? bucket.old : d === 0 ? bucket.today : bucket.tomorrow).push(i.name); }
  const list = a => a.slice(0, 4).join(', ') + (a.length > 4 ? ` +${a.length - 4}` : '');
  const parts = [];
  if (bucket.today.length) parts.push('🔥 Сьогодні: ' + list(bucket.today));
  if (bucket.tomorrow.length) parts.push('⏳ Завтра: ' + list(bucket.tomorrow));
  if (bucket.old.length) parts.push('⚠️ Прострочено: ' + list(bucket.old));
  if (todos.length) parts.push('✅ Справи: ' + list(todos.map(x => x.title)));
  return { title: '🏠 Наш Дім', body: parts.length ? parts.join('\n') : 'Нічого не горить 👌 Відміть, що з’їли й купили сьогодні.' };
}

export async function hourlyPush(env) {
  if (!env.VAPID_PRIVATE) return;
  const s = db(env);
  for (const sub of await s.rows('push_subscriptions', 'WHERE hour = ?', brusselsHour())) {
    try {
      const r = await sendPush(sub.endpoint, env);
      if (r.status === 404 || r.status === 410) await s.remove('push_subscriptions', sub.id);
    } catch (e) { console.log('push failed', e.message); }
  }
}

// /push/key (public), /push/digest and /push/test (need a known subscription endpoint)
export async function handlePush(request, env, url) {
  try {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (url.pathname === '/push/key') return json({ key: env.VAPID_PUBLIC || null });
    if (request.method !== 'POST') return json({ error: 'method' }, 405);
    const { endpoint } = await request.json().catch(() => ({}));
    if (!endpoint) return json({ error: 'no endpoint' }, 400);
    if (!(await db(env).one('push_subscriptions', 'WHERE endpoint = ?', endpoint))) return json({ error: 'unknown subscription' }, 404);
    if (url.pathname === '/push/digest') return json(await digest(env));
    if (url.pathname === '/push/test') { const r = await sendPush(endpoint, env); return json({ ok: r.ok, status: r.status }, r.ok ? 200 : 502); }
    return json({ error: 'not found' }, 404);
  } catch (e) { return json({ error: e.message }, 500); }
}
