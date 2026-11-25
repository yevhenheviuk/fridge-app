// ⚙️ Налаштування — who am I on this device, house level (XP),
// daily push reminder, logout. Opened from the header.
import { el, toast, app } from '../../app/core.js';
import { api, WORKER } from '../../app/db.js';
import { houseXp, level } from '../../app/people.js';

const R = {};
let pushSub = null, pushChecked = false;
const hh = h => String(h).padStart(2, '0') + ':00';
const u8 = b => Uint8Array.from(atob(b.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - b.length % 4) % 4)), c => c.charCodeAt(0));

function init(root) {
  R.lvl = el('div');
  R.pushStatus = el('p', { class: 'sub' }, 'Перевіряю…');
  R.hour = el('select', { class: 'inp', 'aria-label': 'Година нагадування' }, ...Array.from({ length: 24 }, (_, h) => el('option', { value: String(h) }, hh(h))));
  R.hour.value = '21';
  R.toggle = el('button', { class: 'btn btn-main', disabled: true, onclick: togglePush }, 'Увімкнути');
  R.test = el('button', { class: 'btn', style: 'margin-top:8px', hidden: true, onclick: testPush }, 'Надіслати тест');
  root.append(
    el('section', { class: 'card' }, el('h2', {}, '🏠 Рівень дому'), R.lvl),
    // cards contributed by features: `settings(box)` in their index.js
    ...Object.values(app.features).filter(f => f.id !== 'settings' && f.settings).map(f => { const box = el('section', { class: 'card' }); f.settings(box); return box; }),
    el('section', { class: 'card' }, el('h2', {}, '🔔 Щоденне нагадування'), R.pushStatus,
      el('div', { class: 'addrow', style: 'margin-top:0' }, R.hour, R.toggle), R.test),
    el('div', { class: 'account' }, el('span', {}, 'Дані: Cloudflare D1 · Claude бачить їх через MCP'), el('button', { class: 'btn', onclick: () => app.logout() }, 'Вийти')));
  R.hour.onchange = changeHour;
}

function render() {
  const H = level(houseXp());
  R.lvl.replaceChildren(
    el('p', { class: 'lvl num' }, `Рівень ${H.l}`, el('small', {}, ` · ${H.p}/100 XP`)),
    el('div', { class: 'bar' }, el('i', { style: `width:${H.p}%` })),
    el('p', { class: 'hint' }, 'Спільний: XP за справи (+10), внески в цілі й витрати.'));
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
  if (pushSub) { try { row = (await api('/rows/push_subscriptions?eq=' + encodeURIComponent('endpoint.' + pushSub.endpoint)))[0] || null; } catch { row = null; } }
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
      await api('/rows/push_subscriptions?eq=' + encodeURIComponent('endpoint.' + pushSub.endpoint), { method: 'DELETE' });
      await pushSub.unsubscribe(); pushSub = null; toast('Нагадування вимкнено');
    } else {
      if (perm !== 'granted') { await pushState(); return; }
      const { key } = await fetch(WORKER + '/push/key').then(r => r.json());
      if (!key) throw new Error('no key');
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: u8(key) });
      await api('/rows/push_subscriptions?onConflict=endpoint', { method: 'POST', body: { endpoint: sub.endpoint, hour: Number(R.hour.value) } });
      toast(`Готово! Щодня о ${hh(R.hour.value)}`);
    }
  } catch (e) { console.warn(e); toast('Не вийшло. Перевір інтернет і спробуй ще раз'); }
  await pushState();
}
async function changeHour() {
  if (!pushSub) return;
  const h = Number(R.hour.value);
  try { await api('/rows/push_subscriptions?eq=' + encodeURIComponent('endpoint.' + pushSub.endpoint), { method: 'PATCH', body: { hour: h } }); }
  catch { toast('Не збереглося'); return; }
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
