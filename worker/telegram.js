// Telegram bot (ported from nash-domik): quick input, group digests, 🎉 on closed goals.
//
// Routes:  POST /tg/hook               ← Telegram webhook (secret header checked)
//          GET  /tg/setup/<MCP_TOKEN>  ← one-time: webhook, commands, menu button
// Secret:  BOT_TOKEN.  Optional var: APP_URL (PWA link for buttons).
// State in app_meta: group_id, thread_id, bot_username, tg:<telegram user id> → person id.
//
// Quick input (private chat, or bound group):
//   «aldi 23» (group: «-aldi 23»)  → expenses   (features/finance/parse.js)
//   «💡 думка», «/idea думка»       → ideas
//   «купити молоко, хліб», «/buy …» → shopping   (shared/food.js guesses category)
//   «/iam yevhen»                   → link your Telegram account to a person
import { db, meta } from './lib/supabase.js';
import { brusselsDate, brusselsHour, brusselsWeekday, daysBefore, esc, eur } from './lib/time.js';
import { EXP_CATS, expCat, catOf, parseExpense } from '../features/finance/parse.js';
import { guessCat } from '../shared/food.js';

const enc = new TextEncoder();
const APP = env => env.APP_URL || 'https://yevhenheviuk.github.io/fridge-app/';

async function hmacHex(key, msg) {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return [...new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(msg)))].map(x => x.toString(16).padStart(2, '0')).join('');
}
const webhookSecret = async env => (await hmacHex('nash-dim-webhook', env.BOT_TOKEN)).slice(0, 48);

async function tg(env, method, body) {
  try {
    const r = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return await r.json();
  } catch (e) { console.error('telegram', method, e); return { ok: false }; }
}
const openButton = env => ({ reply_markup: { inline_keyboard: [[{ text: '🏠 Відкрити Наш Дім', url: APP(env) }]] } });

async function notify(env, text, extra = {}) {
  const chat = await meta.get(env, 'group_id');
  if (!chat) return;
  const thread = await meta.get(env, 'thread_id');
  await tg(env, 'sendMessage', { chat_id: chat, text, parse_mode: 'HTML', disable_web_page_preview: true, ...(thread ? { message_thread_id: Number(thread) } : {}), ...extra });
}

async function people(env) {
  return (await db(env).select('profiles'))[0]?.people?.filter(p => p.id !== 'me') || [];
}
// Telegram user → person id. Only members of the bound group get one.
async function personOf(env, from) {
  const known = await meta.get(env, 'tg:' + from.id);
  if (known) return { person: known };
  const group = await meta.get(env, 'group_id');
  if (!group) return { error: 'nogroup' };
  const m = await tg(env, 'getChatMember', { chat_id: group, user_id: from.id });
  if (!m.ok || !['creator', 'administrator', 'member', 'restricted'].includes(m.result?.status)) return { error: 'forbidden' };
  return { error: 'unlinked' };
}

/* ---------- webhook ---------- */
async function handleUpdate(env, upd) {
  const m = upd.message;
  if (!m) return;
  const chat = m.chat, text = (m.text || '').trim(), isPrivate = chat.type === 'private';
  const group = await meta.get(env, 'group_id');
  if (m.migrate_to_chat_id && String(chat.id) === group) { await meta.set(env, 'group_id', m.migrate_to_chat_id); return; }
  if (!text || !m.from || m.from.is_bot) return;
  const cmd = text.split(/[\s@]/)[0].toLowerCase();
  const reply = (t, extra = {}) => tg(env, 'sendMessage', { chat_id: chat.id, text: t, parse_mode: 'HTML', ...(m.message_thread_id ? { message_thread_id: m.message_thread_id } : {}), ...extra });
  const react = emoji => tg(env, 'setMessageReaction', { chat_id: chat.id, message_id: m.message_id, reaction: [{ type: 'emoji', emoji }] });

  if (cmd === '/bind' && !isPrivate) {
    if (group && group !== String(chat.id)) return reply('Я вже прив\'язаний до іншої групи.');
    await meta.set(env, 'group_id', chat.id);
    if (m.is_topic_message && m.message_thread_id) await meta.set(env, 'thread_id', m.message_thread_id); else await meta.del(env, 'thread_id');
    return reply('🏠 Готово, це тепер ваш дім.\nСюди я писатиму про закриті цілі, справи на день і підсумки тижня.\n\nЗакріпи це повідомлення, і кнопка завжди буде під рукою 👇', openButton(env));
  }
  if (cmd === '/start' || cmd === '/app') {
    if (!isPrivate) return reply('🏠 <b>Наш Дім</b>', openButton(env));
    return reply('🏠 <b>Наш Дім</b>\n\nСюди можна писати швидко, не відкриваючи аппку:\n• <code>delhaize 47</code> — витрата\n• <code>💡 будь-яка думка</code> — сира ідея\n• <code>купити молоко, хліб</code> — у покупки', openButton(env));
  }

  // далі — тільки свої, і тільки у прив'язаній групі або в особистих
  if (!isPrivate && String(chat.id) !== group) return;
  const who = await personOf(env, m.from);
  if (cmd === '/iam') {
    if (who.error && who.error !== 'unlinked') return isPrivate ? reply('Я працюю тільки для учасників вашої спільної групи.') : null;
    const ps = await people(env), want = text.split(/\s+/)[1]?.toLowerCase();
    const p = ps.find(x => x.id === want || x.name.toLowerCase() === want);
    if (!p) return reply(`Хто ти? Напиши ${ps.map(x => `<code>/iam ${esc(x.id)}</code> (${esc(x.name)})`).join(' або ')}`);
    await meta.set(env, 'tg:' + m.from.id, p.id);
    return reply(`Привіт, ${esc(p.name)}! Тепер я знаю, чиї це витрати й ідеї.`);
  }
  if (who.error) {
    if (!isPrivate) return;
    if (who.error === 'unlinked') { const ps = await people(env); return reply(`Спершу скажи, хто ти: ${ps.map(x => `<code>/iam ${esc(x.id)}</code>`).join(' або ')}`); }
    return reply(who.error === 'nogroup' ? 'Додай мене у вашу спільну групу і напиши там /bind.' : 'Я працюю тільки для учасників вашої спільної групи.');
  }
  const s = db(env), person = who.person;

  let mm = text.match(/^(?:💡|ідея:?|idea:?|\/idea)\s*([\s\S]+)/iu);
  if (mm) {
    await s.insert('ideas', [{ text: mm[1].trim().slice(0, 2000), person }]);
    await s.addXp(person, 2);
    return react('✍');
  }
  mm = text.match(/^(?:🛒|купити:?|\/buy)\s*([\s\S]+)/iu);
  if (mm) {
    const names = mm[1].split(/[,;\n]/).map(x => x.trim()).filter(Boolean).slice(0, 30).map(x => x.slice(0, 120));
    if (names.length) {
      const rows = names.map(name => ({ name, cat: guessCat(name), zone: 'fridge' }));
      await s.insert('shopping', rows);
      await s.insert('log', rows.map(r => ({ type: 'shop_add', name: r.name, cat: r.cat })));
    }
    return react('👍');
  }
  // у групі витрата тільки з мінусом або 💸 на початку, щоб звичайні повідомлення не ставали витратами
  const expenseLike = isPrivate || /^[-−💸]/u.test(text);
  const p = expenseLike && text.length <= 80 ? parseExpense(text) : null;
  if (p && p.amount > 0) {
    const cat = catOf(p.title), c = expCat(cat);
    await s.insert('expenses', [{ title: p.title, amount: p.amount, cat, person }]);
    await s.addXp(person, 2);
    return isPrivate ? reply(`${c.e} ${c.n} · −${eur(p.amount)}`) : react('👌');
  }
  if (isPrivate) return reply('Не зрозумів 🤔 Спробуй <code>aldi 23</code>, <code>💡 думка</code> або <code>купити молоко</code>.');
}

/* ---------- scheduled messages ---------- */
async function announceGoals(env) {
  const s = db(env);
  const done = await s.select('goals', '&done_at=not.is.null&announced=eq.false');
  for (const g of done) {
    const [contribs, ps] = await Promise.all([s.select('goal_contribs', `&goal_id=eq.${g.id}`), people(env)]);
    const by = {};
    contribs.forEach(c => { by[c.person] = (by[c.person] || 0) + Number(c.amount); });
    const lines = Object.entries(by).sort((a, b) => b[1] - a[1]).map(([p, v]) => `${esc(ps.find(x => x.id === p)?.name || p || '—')}: ${eur(v)}`);
    await notify(env, `🎉 <b>Ціль закрита!</b>\n${g.emoji || '⭐'} ${esc(g.title)} · ${eur(g.price)}\n\n${lines.join('\n')}`);
    await s.update('goals', g.id, { announced: true });
  }
}

async function daily(env) {
  const s = db(env), d = brusselsDate();
  const [todos, events, items, ps] = await Promise.all([
    s.select('todos', `&done=eq.false&due=lte.${d}&order=due.asc`),
    s.select('events', `&d=eq.${d}&order=h.asc`),
    s.select('items', `&exp=lte.${d}`),
    people(env),
  ]);
  if (!todos.length && !events.length && !items.length) return;
  const owner = o => (o === 'both' ? 'обоє' : esc(ps.find(p => p.id === o)?.name || ''));
  const lines = ['☀️ <b>Сьогодні</b>'];
  events.forEach(e => lines.push(`📌 ${e.h ? e.h + ' ' : ''}${esc(e.title)}`));
  todos.filter(t => t.due === d).forEach(t => lines.push(`✅ ${esc(t.title)} · ${owner(t.owner)}`));
  if (items.length) lines.push(`🧊 З'їсти сьогодні: ${items.slice(0, 6).map(i => esc(i.name)).join(', ')}${items.length > 6 ? ` +${items.length - 6}` : ''}`);
  const late = todos.filter(t => t.due < d);
  if (late.length) lines.push('', '⏰ <b>Висить з минулих днів</b>', ...late.map(t => `• ${esc(t.title)} · ${owner(t.owner)}`));
  await notify(env, lines.join('\n'), openButton(env));
}

async function weekly(env) {
  const s = db(env), from = daysBefore(6);
  const [exp, contrib, doneTodos, cooling, goals, xp, log] = await Promise.all([
    s.select('expenses', `&d=gte.${from}`),
    s.select('goal_contribs', `&d=gte.${from}`),
    s.select('todos', `&done=eq.true&done_at=gte.${from}`),
    s.select('projects', `&status=in.(hot,grow)&updated=lt.${daysBefore(7)}&limit=3`),
    s.select('goals', '&done_at=is.null'),
    s.select('xp'),
    s.select('log', `&t=gte.${from}&type=in.(used,tossed)`),
  ]);
  const sum = a => a.reduce((x, r) => x + Number(r.amount), 0);
  const byCat = EXP_CATS.map(c => ({ c, v: sum(exp.filter(e => e.cat === c.k)) })).filter(x => x.v > 0).sort((a, b) => b.v - a.v).slice(0, 2);
  const lines = ['📊 <b>Підсумок тижня</b>', '',
    `💸 Витрачено: <b>${eur(sum(exp))}</b>${byCat.length ? ' (більше всього: ' + byCat.map(x => x.c.n.toLowerCase()).join(', ') + ')' : ''}`,
    `🎯 Внесено в цілі: <b>${eur(sum(contrib))}</b>`,
    `✅ Закрито справ: <b>${doneTodos.length}</b>`];
  const tossed = log.filter(l => l.type === 'tossed').length;
  if (log.length) lines.push(`🧊 Використано вчасно: <b>${log.length - tossed}</b>${tossed ? `, викинуто: ${tossed}` : ' 👌'}`);
  const goal = goals.sort((a, b) => b.saved / b.price - a.saved / a.price)[0];
  if (goal) lines.push(`\nНайближча ціль: ${goal.emoji || '⭐'} ${esc(goal.title)}, ${Math.round(goal.saved / goal.price * 100)}%, лишилось ${eur(goal.price - goal.saved)}`);
  lines.push('', `🏠 Рівень дому: ${Math.floor(xp.reduce((x, r) => x + r.xp, 0) / 100) + 1}`);
  if (cooling.length) lines.push('', '🧊 Давно не чіпали: ' + cooling.map(p => `${p.emoji || '💡'} ${esc(p.title)}`).join(', '));
  await notify(env, lines.join('\n'));
}

// Runs every hour from the worker cron. Each message once per day (app_meta guards).
export async function telegramHourly(env) {
  if (!env.BOT_TOKEN || !(await meta.get(env, 'group_id'))) return;
  await announceGoals(env);
  const h = brusselsHour(), d = brusselsDate();
  if (h === 8 && (await meta.get(env, 'daily_sent')) !== d) { await meta.set(env, 'daily_sent', d); await daily(env); }
  if (h === 19 && brusselsWeekday() === 'Sun' && (await meta.get(env, 'weekly_sent')) !== d) { await meta.set(env, 'weekly_sent', d); await weekly(env); }
}

/* ---------- routes ---------- */
export async function handleTelegram(request, env, url, ctx) {
  if (!env.BOT_TOKEN) return new Response('BOT_TOKEN is not set', { status: 503 });
  if (url.pathname === '/tg/hook' && request.method === 'POST') {
    if (request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== (await webhookSecret(env))) return new Response('no', { status: 403 });
    const upd = await request.json();
    ctx.waitUntil(handleUpdate(env, upd).catch(e => console.error('update', e)));
    return new Response('ok');
  }
  if (env.MCP_TOKEN && url.pathname === `/tg/setup/${env.MCP_TOKEN}`) {
    const me = await tg(env, 'getMe', {});
    if (!me.ok) return new Response('BOT_TOKEN неправильний: ' + JSON.stringify(me), { status: 500 });
    await meta.set(env, 'bot_username', me.result.username);
    const wh = await tg(env, 'setWebhook', { url: `${url.origin}/tg/hook`, secret_token: await webhookSecret(env), allowed_updates: ['message'], drop_pending_updates: true });
    const mb = await tg(env, 'setChatMenuButton', { menu_button: { type: 'web_app', text: 'Наш Дім', web_app: { url: APP(env) } } });
    await tg(env, 'setMyCommands', { commands: [
      { command: 'app', description: 'Відкрити Наш Дім' }, { command: 'idea', description: 'Записати сиру ідею' },
      { command: 'buy', description: 'Додати в покупки' }, { command: 'iam', description: 'Сказати боту, хто ти' }] });
    return new Response(`Бот @${me.result.username}\nwebhook: ${wh.ok ? 'ok' : JSON.stringify(wh)}\nкнопка меню: ${mb.ok ? 'ok' : JSON.stringify(mb)}\n\nДалі: якщо бот ще не в групі — додай і напиши там /bind`, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
  }
  return new Response('Not found', { status: 404 });
}
