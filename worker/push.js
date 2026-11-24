// Daily Web Push (VAPID, empty payload: the service worker fetches the text
// from /push/digest). Subscriptions: table push_subscriptions (hour = Brussels).
import { rest } from './lib/supabase.js';
import { brusselsDate, brusselsHour, dayDiff } from './lib/time.js';

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

async function digestFor(userId, env) {
  const t = brusselsDate();
  const [items, todos, events] = await Promise.all([
    rest(env, 'GET', `items?user_id=eq.${userId}&select=name,exp`),
    rest(env, 'GET', `todos?user_id=eq.${userId}&done=eq.false&due=lte.${t}&select=title`).catch(() => []),
    rest(env, 'GET', `events?user_id=eq.${userId}&d=eq.${t}&select=title,h&order=h.asc`).catch(() => []),
  ]);
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
  if (events.length) parts.push('📌 ' + list(events.map(e => (e.h ? e.h + ' ' : '') + e.title)));
  if (todos.length) parts.push('✅ Справи: ' + list(todos.map(x => x.title)));
  return { title: '🏠 Наш Дім', body: parts.length ? parts.join('\n') : 'Нічого не горить 👌 Відміть, що з’їли й купили сьогодні.' };
}

export async function hourlyPush(env) {
  if (!env.VAPID_PRIVATE) return;
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

export async function handlePush(request, env, url) {
  try {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (url.pathname === '/push/key') return json({ key: env.VAPID_PUBLIC || null });
    if (request.method !== 'POST') return json({ error: 'method' }, 405);
    let endpoint;
    try { ({ endpoint } = await request.json()); } catch { return json({ error: 'bad json' }, 400); }
    if (!endpoint) return json({ error: 'no endpoint' }, 400);
    const [sub] = await rest(env, 'GET', `push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}&select=user_id`);
    if (!sub) return json({ error: 'unknown subscription' }, 404);
    if (url.pathname === '/push/digest') return json(await digestFor(sub.user_id, env));
    if (url.pathname === '/push/test') { const r = await sendPush(endpoint, env); return json({ ok: r.ok, status: r.status }, r.ok ? 200 : 502); }
    return json({ error: 'not found' }, 404);
  } catch (e) { return json({ error: e.message }, 500); }
}
