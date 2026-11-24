// 📅 Календар — month grid with events + todos that have a due date.
// Owns `events`; reads `todos` (owned by feature todo).
import { el, toast, todayIso, iso, parse, fmtDate, MONTHS, confirmTap } from '../../app/core.js';
import { data, db } from '../../app/db.js';

const R = {};
let sel = null, month = null;
const since = () => { const d = new Date(); d.setDate(d.getDate() - 60); return iso(d); };
const itemsOn = d => [
  ...data.events.filter(e => e.d === d).map(e => ({ k: 'e', ...e })),
  ...data.todos.filter(t => t.due === d).map(t => ({ k: 't', ...t })),
];

function init(root) {
  R.head = el('b');
  R.grid = el('div', { class: 'grid' });
  R.dayH = el('h2');
  R.day = el('ul', { class: 'list' });
  R.title = el('input', { class: 'inp', placeholder: 'Подія на цей день', autocomplete: 'off' });
  R.time = el('input', { class: 'inp inp-sm', type: 'time', 'aria-label': 'Час (необов.)' });
  root.append(
    el('section', { class: 'cal' },
      el('div', { class: 'cal-h' }, R.head, el('span', {},
        el('button', { class: 'x', 'aria-label': 'Попередній місяць', onclick: () => shift(-1) }, '‹'),
        el('button', { class: 'x', 'aria-label': 'Наступний місяць', onclick: () => shift(1) }, '›'))),
      R.grid),
    el('section', { class: 'group' }, R.dayH, R.day,
      el('form', { class: 'addrow', onsubmit: add }, R.title, R.time, el('button', { class: 'btn btn-main', type: 'submit' }, '+'))),
    el('p', { class: 'hint' }, 'О 8:00 бот нагадує в Телеграм-групі про події і справи на сьогодні.'));
}
const shift = n => { month = new Date(month.getFullYear(), month.getMonth() + n, 1); render(); };
async function add(e) {
  e.preventDefault();
  const title = R.title.value.trim().slice(0, 200); if (!title) return;
  if (await db.events.add({ title, d: sel, h: R.time.value || null })) { R.title.value = ''; R.time.value = ''; toast(`📌 ${fmtDate(sel)}`); }
}

function render() {
  const t = todayIso();
  sel = sel || t;
  if (!month) { const d = parse(t); month = new Date(d.getFullYear(), d.getMonth(), 1); }
  const y = month.getFullYear(), m = month.getMonth(), off = (new Date(y, m, 1).getDay() + 6) % 7;
  R.head.textContent = `${MONTHS[m]} ${y}`;
  const cells = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'].map(d => el('div', { class: 'dow' }, d));
  for (let i = 0; i < 42; i++) {
    const d = new Date(y, m, 1 - off + i), k = iso(d), n = itemsOn(k).length;
    cells.push(el('button', {
      class: ['day', d.getMonth() !== m && 'out', k === t && 'today', k === sel && 'sel'].filter(Boolean).join(' '),
      'aria-label': `${fmtDate(k)}${n ? `, ${n}` : ''}`,
      onclick: () => { sel = k; if (d.getMonth() !== m) month = new Date(d.getFullYear(), d.getMonth(), 1); render(); },
    }, el('span', { class: 'num' }, String(d.getDate())), el('span', { class: 'dots' }, ...Array.from({ length: Math.min(n, 3) }, () => el('i')))));
  }
  R.grid.replaceChildren(...cells);
  R.dayH.textContent = fmtDate(sel) + (sel === t ? ' · сьогодні' : '');
  const its = itemsOn(sel).sort((a, b) => (a.h || '99').localeCompare(b.h || '99'));
  R.day.replaceChildren(...(its.length ? its.map(i => i.k === 'e'
    ? el('li', { class: 'row' }, el('span', { class: 'emoji' }, '📌'),
      el('span', { style: 'min-width:0' }, el('span', { class: 'name wrap-text' }, i.title), el('span', { class: 'meta' }, i.h || 'весь день')),
      el('span'), el('button', { class: 'x', 'aria-label': `Видалити: ${i.title}`, onclick: e => confirmTap(e.currentTarget, () => db.events.remove(i.id)) }, '✕'))
    : el('li', { class: 'row' + (i.done ? ' off' : '') }, el('span', { class: 'emoji' }, '✅'),
      el('span', { style: 'min-width:0' }, el('span', { class: 'name wrap-text' }, i.title), el('span', { class: 'meta' }, 'справа')), el('span'), el('span')))
    : [el('p', { class: 'empty' }, 'Вільний день')]));
}

export default {
  id: 'calendar', icon: '📅', name: 'Календар',
  tables: { events: { since: ['d', since], order: ['d', true] }, todos: { order: ['created_at', false] } },
  init, render,
  badge: () => data.events.filter(e => e.d === todayIso()).length,
};
