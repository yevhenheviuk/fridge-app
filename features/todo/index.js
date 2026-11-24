// ✅ Справи — shared todos with optional due date and owner, +10 XP each.
// Due todos also show in calendar and in the 8:00 Telegram / push digest.
import { el, todayIso, fmtDate, plural, confirmTap } from '../../app/core.js';
import { data, db } from '../../app/db.js';
import { persons, personName, addXp } from '../../app/people.js';

const R = {};
let owner = 'both';
const recent = () => { const d = new Date(Date.now() - 14 * 864e5); return d.toISOString(); };
const open = () => data.todos.filter(t => !t.done).sort((a, b) => (a.due || '9').localeCompare(b.due || '9'));

function init(root) {
  R.title = el('input', { class: 'inp', placeholder: 'Нова справа', autocomplete: 'off', style: 'flex-basis:100%' });
  R.due = el('input', { class: 'inp', type: 'date', 'aria-label': 'Коли', style: 'flex:1 1 140px' });
  R.owner = el('div', { class: 'chips' });
  R.open = el('ul', { class: 'list' });
  R.done = el('section', { class: 'group' });
  root.append(
    el('form', { class: 'addrow', onsubmit: add }, R.title, R.due, el('button', { class: 'btn btn-main', type: 'submit' }, '+')),
    el('div', { class: 'owner-row' }, el('span', { class: 'hint', style: 'margin:0' }, 'Чия:'), R.owner),
    el('section', { class: 'group' }, el('h2', {}, 'Треба зробити'), R.open), R.done);
}
async function add(e) {
  e.preventDefault();
  const title = R.title.value.trim().slice(0, 200); if (!title) return;
  if (await db.todos.add({ title, owner, due: R.due.value || null })) { R.title.value = ''; R.due.value = ''; R.title.focus(); }
}
async function toggle(t) {
  const done = !t.done;
  await db.todos.update(t.id, { done, done_at: done ? new Date().toISOString() : null });
  addXp(done ? 10 : -10);
}
function row(t) {
  const late = t.due && t.due < todayIso() && !t.done;
  const meta = [t.due ? fmtDate(t.due) : null, persons().length > 1 ? personName(t.owner) : null].filter(Boolean).join(' · ');
  return el('li', { class: 'row' + (t.done ? ' off' : '') },
    el('button', { class: 'chk' + (t.done ? ' on' : ''), 'aria-label': t.done ? `Повернути: ${t.title}` : `Виконано: ${t.title}`, onclick: () => toggle(t) }, t.done ? '✓' : ''),
    el('span', { style: 'min-width:0' }, el('span', { class: 'name wrap-text' }, t.title), meta ? el('span', { class: 'meta' + (late ? ' late' : '') }, meta) : null),
    el('span'),
    el('button', { class: 'x', 'aria-label': `Видалити: ${t.title}`, onclick: e => confirmTap(e.currentTarget, () => db.todos.remove(t.id)) }, '✕'));
}
function render() {
  const ps = persons().filter(p => p.id !== 'me');
  R.owner.parentElement.hidden = ps.length < 2;
  R.owner.replaceChildren(...[{ id: 'both', name: 'Обоє' }, ...ps].map(p =>
    el('button', { type: 'button', class: 'chip', 'aria-pressed': String(owner === p.id), onclick: () => { owner = p.id; render(); } }, p.name)));
  const o = open(), done = data.todos.filter(t => t.done && (t.done_at || '') >= recent());
  R.open.replaceChildren(...(o.length ? o.map(row) : [el('p', { class: 'empty' }, 'Чисто. Можна відпочити')]));
  R.done.hidden = !done.length;
  R.done.replaceChildren(el('h2', {}, 'Зроблено за 2 тижні', el('span', { class: 'hint', style: 'margin:0' }, '+10 XP кожна')), el('ul', { class: 'list' }, ...done.map(row)));
}

export default {
  id: 'todo', icon: '✅', name: 'Справи',
  tables: { todos: { order: ['created_at', false] } },
  init, render,
  count: () => { const n = open().length; return n ? `${n} ${plural(n, 'справа', 'справи', 'справ')}` : ''; },
  badge: () => open().filter(t => t.due && t.due <= todayIso()).length,
};
