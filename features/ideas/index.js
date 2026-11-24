// 💡 Ідеї — raw ideas inbox → projects with a stream of notes and a pinned
// "next step". Telegram: «💡 думка» lands in ideas.
import { el, toast, todayIso, fmtDate, ago, daysAgo, confirmTap } from '../../app/core.js';
import { data, db } from '../../app/db.js';
import { meOrFirst, personName, addXp, persons } from '../../app/people.js';

const STS = { hot: '🔥 Гаряча', grow: '🌱 Росте', cold: '🧊 Заморожена', done: '✅ Зроблено' };
const ORDER = { hot: 0, grow: 1, cold: 2, done: 3 };
const EMO = ['💡', '🚀', '🎲', '🧪', '🎨', '🛠️', '📚', '🎬', '🥕', '🎮', '🎵', '💰'];
const R = {};
let openP = null;

function init(root) {
  /* list mode */
  R.cap = el('textarea', { class: 'inp', placeholder: 'Гаряча думка? Кидай сюди, як є', 'aria-label': 'Нова ідея' });
  R.ideas = el('ul', { class: 'list' });
  R.projects = el('ul', { class: 'list' });
  R.pNew = el('input', { class: 'inp', placeholder: 'Новий проект', autocomplete: 'off' });
  R.listMode = el('div', {},
    el('section', { class: 'card capture' }, R.cap,
      el('div', { class: 'cap-row' }, el('span', { class: 'hint', style: 'margin:0' }, 'Або напиши боту «💡 думка»'),
        el('button', { class: 'btn btn-main', onclick: addIdea }, 'Зберегти'))),
    el('section', { class: 'group' }, el('h2', {}, 'Сирі ідеї'), R.ideas),
    el('section', { class: 'group' }, el('h2', {}, 'Проекти'), R.projects,
      el('form', { class: 'addrow', onsubmit: addProject }, R.pNew, el('button', { class: 'btn', type: 'submit' }, '+'))));
  R.cap.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) addIdea(); });

  /* project mode */
  R.emo = el('button', { class: 'p-emo', 'aria-label': 'Змінити емодзі' });
  R.pT = el('input', { class: 'inp p-title', 'aria-label': 'Назва проекту' });
  R.seg = el('div', { class: 'chips' });
  R.next = el('div');
  R.stream = el('div', { class: 'stream' });
  R.note = el('textarea', { class: 'inp', rows: 1, placeholder: 'Кинь думку…', 'aria-label': 'Нова думка' });
  R.pDel = el('button', { class: 'btn btn-sm btn-danger' }, 'Видалити проект');
  R.projMode = el('div', { hidden: true },
    el('button', { class: 'btn btn-sm back', onclick: close }, '‹ Усі ідеї'),
    el('section', { class: 'card' }, el('div', { class: 'p-head' }, R.emo, R.pT), R.seg),
    R.next, R.stream,
    el('div', { class: 'composer' }, R.note, el('button', { class: 'btn btn-main', 'aria-label': 'Надіслати', onclick: sendNote }, '➤')),
    el('p', {}, R.pDel));
  R.note.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendNote(); } });
  R.note.addEventListener('input', () => { R.note.style.height = 'auto'; R.note.style.height = Math.min(140, R.note.scrollHeight) + 'px'; });
  R.pT.addEventListener('change', () => { const t = R.pT.value.trim().slice(0, 120); if (t) db.projects.update(openP, { title: t }); });
  R.emo.onclick = () => { const p = cur(); db.projects.update(p.id, { emoji: EMO[(EMO.indexOf(p.emoji) + 1) % EMO.length] }); };
  R.pDel.onclick = () => confirmTap(R.pDel, async () => { const id = openP; close(); await db.projects.remove(id); toast('Проект видалено'); });
  root.append(R.listMode, R.projMode);
}

const cur = () => data.projects.find(p => p.id === openP);
const open = id => { openP = id; render(); scrollTo(0, 0); };
function close() { openP = null; render(); scrollTo(0, 0); }

async function addIdea() {
  const text = R.cap.value.trim().slice(0, 2000); if (!text) return;
  if (!(await db.ideas.add({ text, person: meOrFirst() }))) return;
  R.cap.value = ''; toast('Збережено. Не втече 🔥'); addXp(2);
}
async function addProject(e) {
  e.preventDefault();
  const title = R.pNew.value.trim().slice(0, 120); if (!title) return;
  const rows = await db.projects.add({ title, emoji: EMO[data.projects.length % EMO.length] });
  if (rows?.[0]) { R.pNew.value = ''; open(rows[0].id); }
}
async function ideaToProject(i) {
  const title = i.text.length > 40 ? i.text.slice(0, 38).trim() + '…' : i.text;
  const rows = await db.projects.add({ title, emoji: EMO[data.projects.length % EMO.length] });
  if (!rows?.[0]) return;
  await db.project_notes.add({ project_id: rows[0].id, text: i.text, d: i.d, person: i.person });
  await db.ideas.remove(i.id);
  addXp(5); toast('Ідея стала проектом'); open(rows[0].id);
}
async function sendNote() {
  const text = R.note.value.trim().slice(0, 4000); if (!text || !openP) return;
  R.note.value = ''; R.note.style.height = 'auto';
  await db.project_notes.add({ project_id: openP, text, person: meOrFirst() });
  await db.projects.update(openP, { updated: todayIso() });
  addXp(1); R.note.focus(); scrollTo(0, document.body.scrollHeight);
}
async function setStatus(p, st) {
  await db.projects.update(p.id, { status: st });
  if (st === 'done' && p.status !== 'done') { addXp(30); toast('🎉 Проект закрито, +30 XP'); }
}
async function togglePin(n) {
  const was = n.pin;
  const pinned = data.project_notes.filter(x => x.project_id === n.project_id && x.pin);
  for (const x of pinned) await db.project_notes.update(x.id, { pin: false });
  if (!was) await db.project_notes.update(n.id, { pin: true });
}

function renderList() {
  R.ideas.replaceChildren(...(data.ideas.length ? data.ideas.map(i => el('li', { class: 'row' }, el('span', { class: 'emoji' }, '💭'),
    el('span', { style: 'min-width:0' }, el('span', { class: 'name wrap-text' }, i.text), el('span', { class: 'meta' }, ago(i.d))),
    el('button', { class: 'btn btn-sm', onclick: () => ideaToProject(i) }, 'У проект'),
    el('button', { class: 'x', 'aria-label': 'Видалити ідею', onclick: () => db.ideas.remove(i.id) }, '✕')))
    : [el('p', { class: 'empty' }, 'Порожньо. Голова чиста або все вже в проектах')]));
  const ps = [...data.projects].sort((a, b) => ORDER[a.status] - ORDER[b.status] || b.updated.localeCompare(a.updated));
  R.projects.replaceChildren(...(ps.length ? ps.map(p => {
    const n = data.project_notes.filter(x => x.project_id === p.id).length;
    const cool = (p.status === 'hot' || p.status === 'grow') && daysAgo(p.updated) >= 7;
    return el('li', {}, el('button', { class: 'row prow', onclick: () => open(p.id) }, el('span', { class: 'emoji' }, p.emoji || '💡'),
      el('span', { style: 'min-width:0' }, el('span', { class: 'name' }, p.title),
        el('span', { class: 'meta' }, `${STS[p.status]} · ${n} думок`, cool ? el('span', { class: 'cool' }, ' · остигає') : null)),
      el('span', { class: 'rt' }, ago(p.updated)), el('span')));
  }) : [el('p', { class: 'empty' }, 'Проектів ще нема')]));
}
function renderProject(p) {
  const notes = data.project_notes.filter(n => n.project_id === p.id).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const pin = notes.find(n => n.pin);
  R.emo.textContent = p.emoji || '💡';
  if (document.activeElement !== R.pT) R.pT.value = p.title;
  R.seg.replaceChildren(...Object.entries(STS).map(([k, v]) => el('button', { class: 'chip', 'aria-pressed': String(p.status === k), onclick: () => setStatus(p, k) }, v)));
  R.next.replaceChildren(pin ? el('div', { class: 'next' }, el('b', {}, 'Наступний крок'), pin.text)
    : el('p', { class: 'hint' }, 'Познач 📍 одну думку як наступний крок, щоб завжди знати, з чого почати'));
  const me = meOrFirst(), multi = persons().length > 1;
  let lastD = '';
  const out = [];
  notes.forEach(n => {
    if (n.d !== lastD) { out.push(el('div', { class: 'day-sep' }, fmtDate(n.d))); lastD = n.d; }
    const mine = !multi || n.person === me || !n.person;
    out.push(el('div', { class: 'bub' + (mine ? '' : ' other') + (n.pin ? ' pin' : '') },
      mine ? null : el('span', { class: 'by' }, personName(n.person)), n.text,
      el('div', { class: 'bmeta' },
        el('button', { 'aria-label': n.pin ? 'Зняти наступний крок' : 'Зробити наступним кроком', onclick: () => togglePin(n) }, n.pin ? '📌' : '📍'),
        el('button', { 'aria-label': 'Видалити думку', onclick: () => db.project_notes.remove(n.id) }, '✕'))));
  });
  R.stream.replaceChildren(...(out.length ? out : [el('p', { class: 'empty' }, 'Накидуй усе, що спадає на думку')]));
}
function render() {
  const p = openP && cur();
  if (openP && !p) openP = null;
  R.listMode.hidden = !!p; R.projMode.hidden = !p;
  if (p) renderProject(p); else renderList();
}

export default {
  id: 'ideas', icon: '💡', name: 'Ідеї',
  tables: { ideas: { order: ['created_at', false] }, projects: {}, project_notes: {} },
  init, render,
  count: () => (data.ideas.length ? `${data.ideas.length} сирих` : ''),
  actions: { openProject: id => open(id) },
};
