// ⚙️ Налаштування — who am I on this device, house level (XP),
// daily push reminder, Telegram bot hint, account. Opened from the header.
import { el, toast, app } from '../../app/core.js';
import { sb, WORKER } from '../../app/db.js';
import { persons, me, setMe, xpOf, houseXp, level } from '../../app/people.js';

const R = {};
let pushSub = null, pushChecked = false;
const hh = h => String(h).padStart(2, '0') + ':00';
const u8 = b => Uint8Array.from(atob(b.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - b.length % 4) % 4)), c => c.charCodeAt(0));

function init(root) {
  R.who = el('div', { class: 'chips' });
  R.lvl = el('div');
  R.pushStatus = el('p', { class: 'sub' }, 'Перевіряю…');
  R.hour = el('select', { class: 'inp', 'aria-label': 'Година нагадування' }, ...Array.from({ length: 24 }, (_, h) => el('option', { value: String(h) }, hh(h))));
  R.hour.value = '21';
  R.toggle = el('button', { class: 'btn btn-main', disabled: true, onclick: togglePush }, 'Увімкнути');
  R.test = el('button', { class: 'btn', style: 'margin-top:8px', hidden: true, onclick: testPush }, 'Надіслати тест');
  R.email = el('span');
  root.append(
    el('section', { class: 'card' }, el('h2', {}, '👤 Хто я на цьому пристрої'),
      el('p', { class: 'sub' }, 'Від цього залежить, чиї витрати, внески й думки.'), R.who),
    el('section', { class: 'card' }, el('h2', {}, '🏠 Рівень дому'), R.lvl),
    el('section', { class: 'card' }, el('h2', {}, '🔔 Щоденне нагадування'), R.pushStatus,
      el('div', { class: 'addrow', style: 'margin-top:0' }, R.hour, R.toggle), R.test),
    el('section', { class: 'card' }, el('h2', {}, '✈️ Телеграм-бот'),
      el('p', { class: 'sub', style: 'margin:0' }, 'Пиши боту швидко, не відкриваючи аппку: ', el('code', {}, 'aldi 23'), ' — витрата, ',
        el('code', {}, '💡 думка'), ' — ідея, ', el('code', {}, 'купити молоко, хліб'), ' — покупки. У групі о 8:00 — справи й події на день, у неділю — підсумок тижня.')),
    el('div', { class: 'account' }, R.email, el('button', { class: 'btn', onclick: async () => { await sb.auth.signOut(); location.reload(); } }, 'Вийти')));
  R.hour.onchange = changeHour;
}

function render() {
  const ps = persons().filter(p => p.id !== 'me');
  R.who.replaceChildren(...(ps.length ? ps.map(p => el('button', { class: 'chip', 'aria-pressed': String(me() === p.id), onclick: () => { setMe(p.id); toast(`Привіт, ${p.name}!`); } }, p.name))
    : [el('span', { class: 'hint' }, 'Людей ще немає — попроси Claude заповнити профілі (set_profiles).')]));
  const H = level(houseXp());
  R.lvl.replaceChildren(
    el('p', { class: 'lvl num' }, `Рівень ${H.l}`, el('small', {}, ` · ${H.p}/100 XP`)),
    el('div', { class: 'bar' }, el('i', { style: `width:${H.p}%` })),
    el('p', { class: 'hint' }, ps.map(p => `${p.name}: ${xpOf(p.id)} XP`).join(' · ') || ''),
    el('p', { class: 'hint' }, 'XP за справи (+10), внески в цілі, ідеї, витрати й закриті проекти.'));
  R.email.textContent = app.session?.user?.email || '';
  if (!pushChecked) { pushChecked = true; pushState(); }
}

/* ---------- push ---------- */
async function pushState() {
  const st = R.pushStatus, tg = R.toggle;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
  if (ios && !standalone) { st.textContent = 'На iPhone сповіщення працюють, коли застосунок додано на початковий екран: Safari → «Поділитися» → «На початковий екран». Потім відкрий його з іконки.'; tg.disabled = true; return; }
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) { st.textContent = 'Цей браузер не підтримує сповіщення.'; tg.disabled = true; return; }
  const reg = await navigator.serviceWorker.ready;
  pushSub = await reg.pushManager.getSubscription();
  let row = null;
  if (pushSub) { const { data } = await sb.from('push_subscriptions').select('hour').eq('endpoint', pushSub.endpoint).maybeSingle(); row = data; }
  tg.disabled = false;
  if (pushSub && row) {
    R.hour.value = String(row.hour);
    st.textContent = `Увімкнено: щодня о ${hh(row.hour)} — що горить у холодильнику, справи й події на день.`;
    tg.textContent = 'Вимкнути'; tg.classList.remove('btn-main'); R.test.hidden = false;
  } else {
    st.textContent = Notification.permission === 'denied' ? 'Сповіщення заборонені. Дозволь їх для застосунку в налаштуваннях телефону.' : 'Вимкнено. Обери годину й увімкни.';
    tg.textContent = 'Увімкнути'; tg.classList.add('btn-main'); R.test.hidden = true;
  }
}
async function togglePush() {
  R.toggle.disabled = true;
  try {
    // iOS: ask for permission first, straight from the tap, before any other await
    const perm = pushSub ? 'granted' : await Notification.requestPermission();
    const reg = await navigator.serviceWorker.ready;
    if (pushSub) {
      await sb.from('push_subscriptions').delete().eq('endpoint', pushSub.endpoint);
      await pushSub.unsubscribe(); pushSub = null; toast('Нагадування вимкнено');
    } else {
      if (perm !== 'granted') { await pushState(); return; }
      const { key } = await fetch(WORKER + '/push/key').then(r => r.json());
      if (!key) throw new Error('no key');
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: u8(key) });
      const { error } = await sb.from('push_subscriptions').upsert({ endpoint: sub.endpoint, hour: Number(R.hour.value) }, { onConflict: 'endpoint' });
      if (error) throw error;
      toast(`Готово! Щодня о ${hh(R.hour.value)}`);
    }
  } catch (e) { console.warn(e); toast('Не вийшло. Перевір інтернет і спробуй ще раз'); }
  await pushState();
}
async function changeHour() {
  if (!pushSub) return;
  const h = Number(R.hour.value);
  const { error } = await sb.from('push_subscriptions').update({ hour: h }).eq('endpoint', pushSub.endpoint);
  if (error) { toast('Не збереглося'); return; }
  toast(`Тепер о ${hh(h)}`); pushState();
}
async function testPush() {
  if (!pushSub) return;
  try {
    const r = await fetch(WORKER + '/push/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: pushSub.endpoint }) });
    toast(r.ok ? 'Тестове сповіщення надіслано' : 'Сервер не зміг надіслати сповіщення');
  } catch { toast('Немає зв’язку з сервером'); }
}

export default {
  id: 'settings', icon: '⚙️', name: 'Налаштування', nav: false,
  tables: {},
  init, render,
};
