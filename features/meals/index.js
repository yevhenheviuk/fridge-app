// 🍽 Раціон — meal plans (written by Claude via MCP set_plan), kcal per person,
// and "what each of us ate" history.
// Plan shape: plans.days = [{date, meals:[{slot, name, recipe, kcal:{yevhen, oleksandra}, done}]}]
import { el, today, iso, parse, pDays, fmtDay } from '../../app/core.js';
import { data, db } from '../../app/db.js';
import { profiles } from '../../app/people.js';
import { logEvent } from '../../shared/kitchen.js';

const R = {};
let histPerson = 'oleksandra';

function init(root) {
  R.people = el('div', { class: 'people' });
  R.box = el('div');
  root.append(R.people, R.box);
}

function render() {
  const ppl = profiles();
  R.people.replaceChildren(...ppl.map(p => el('div', { class: 'person' },
    el('b', {}, p.name),
    el('div', { class: 'kcal' }, p.kcal ? String(p.kcal) : '—', el('small', {}, p.kcal ? ' ккал/день' : ' ціль ще не пораховано')),
    p.goal ? el('p', {}, p.goal) : null,
    p.avoid ? el('p', {}, 'Уникати: ' + p.avoid) : null)));
  const box = R.box; box.replaceChildren();
  const plan = [...data.plans].sort((a, b) => (b.start || '').localeCompare(a.start || ''))[0];
  if (!plan) {
    box.append(el('section', { class: 'card' }, el('h2', {}, 'Раціону ще немає'),
      el('p', { class: 'sub', style: 'margin:0' }, 'Попроси в чаті проєкту скласти меню на кілька днів — воно з’явиться тут разом з калоріями, а потрібні продукти одразу впадуть у покупки.')));
    renderHistory(box); return;
  }
  box.append(el('section', { class: 'card' }, el('h2', {}, plan.title || 'Раціон'), plan.notes ? el('p', { class: 'sub', style: 'margin:0;white-space:pre-wrap' }, plan.notes) : null));
  const t = iso(today());
  (plan.days || []).forEach((d, di) => {
    const cls = 'day' + (d.date < t ? ' past' : '') + (d.date === t ? ' today' : '');
    const totals = ppl.map(p => {
      const sum = (d.meals || []).reduce((a, m) => a + ((m.kcal && m.kcal[p.id]) || 0), 0);
      if (!sum) return null;
      return el('span', { class: p.kcal && sum > p.kcal * 1.05 ? 'over' : null }, `${p.name} `, el('b', {}, String(sum)), p.kcal ? ` / ${p.kcal}` : '', ' ');
    }).filter(Boolean);
    const card = el('section', { class: cls }, el('div', { class: 'day-h' }, el('h3', {}, (d.date === t ? 'Сьогодні · ' : '') + (d.date ? fmtDay(d.date) : `День ${di + 1}`)), el('span', { class: 'tot' }, ...totals)));
    (d.meals || []).forEach((m, mi) => {
      const who = ppl.filter(p => m.kcal && m.kcal[p.id]).map(p => `${p.name} ${m.kcal[p.id]}`).join(' · ');
      card.append(el('div', { class: 'meal' + (m.done ? ' done' : '') },
        el('input', { type: 'checkbox', checked: !!m.done, 'aria-label': `Приготовано: ${m.name}`, onchange: e => toggleMeal(plan, di, mi, e.target.checked) }),
        el('div', {}, el('div', { class: 'mslot' }, m.slot || ''), el('div', { class: 'mname' }, m.name),
          who ? el('div', { class: 'mk' }, who + ' ккал') : null,
          m.recipe ? el('details', {}, el('summary', {}, 'Як приготувати'), el('p', {}, m.recipe)) : null)));
    });
    box.append(card);
  });
  renderHistory(box);
}

/* ---------- history: what each person ate, per day ---------- */
function historyDays(pid) {
  const map = new Map();
  data.plans.forEach(pl => (pl.days || []).forEach(d => {
    if (!d.date) return;
    (d.meals || []).forEach(m => {
      if (!(m.kcal && m.kcal[pid])) return;
      if (!map.has(d.date)) map.set(d.date, []);
      map.get(d.date).push(m);
    });
  }));
  return [...map.entries()].filter(([d]) => d <= iso(today())).sort((a, b) => b[0].localeCompare(a[0])).map(([date, meals]) => {
    const eaten = meals.filter(m => m.done), confirmed = eaten.length > 0, list = confirmed ? eaten : meals;
    return { date, meals: list, sum: list.reduce((a, m) => a + (m.kcal[pid] || 0), 0), confirmed };
  });
}
function renderHistory(box) {
  const ppl = profiles().filter(p => p.id !== 'me');
  if (!ppl.length) return;
  if (!ppl.some(p => p.id === histPerson)) histPerson = ppl[0].id;
  const p = ppl.find(x => x.id === histPerson);
  const days = historyDays(p.id);
  box.append(el('div', { class: 'hist-h' }, el('h2', {}, 'Що з’їли по днях'),
    el('div', { class: 'chips' }, ...ppl.map(x => el('button', { class: 'chip', 'aria-pressed': String(x.id === histPerson), onclick: () => { histPerson = x.id; render(); } }, x.name)))));
  if (!days.length) { box.append(el('p', { class: 'empty' }, 'Тут з’являтимуться дні, коли щось записано в раціон.')); return; }
  const t = iso(today());
  const week = days.filter(d => d.confirmed && d.date < t && (today() - parse(d.date)) / 864e5 <= 7);
  if (week.length) {
    const avg = Math.round(week.reduce((a, d) => a + d.sum, 0) / week.length);
    box.append(el('p', { class: 'avg' }, `Середнє за ${week.length} ${pDays(week.length)} цього тижня: `, el('b', {}, `${avg} ккал`), p.kcal ? ` з ${p.kcal}` : ''));
  }
  days.slice(0, 30).forEach(d => {
    const pct = p.kcal ? Math.min(100, Math.round(d.sum / p.kcal * 100)) : 0;
    const over = p.kcal && d.sum > p.kcal * 1.05, left = p.kcal ? p.kcal - d.sum : null;
    const det = el('details', { class: 'hday', open: d.date === t || null },
      el('summary', {},
        el('span', { class: 'hd' }, (d.date === t ? 'Сьогодні · ' : '') + fmtDay(d.date)),
        el('span', { class: 'hk' + (over ? ' over' : '') }, String(d.sum), el('small', {}, p.kcal ? ` / ${p.kcal}` : ' ккал')),
        p.kcal ? el('span', { class: 'bar' + (over ? ' over' : '') }, el('i', { style: `width:${pct}%` })) : null));
    if (!d.confirmed) det.append(el('p', { class: 'hint' }, 'За планом — нічого не відмічено як з’їдене.'));
    else if (d.date === t && left !== null) det.append(el('p', { class: 'hint' }, left >= 0 ? `Ще можна ${left} ккал` : `Понад ціль на ${-left} ккал`));
    d.meals.forEach(m => det.append(el('div', { class: 'hmeal' + (d.confirmed ? '' : ' plan') },
      el('div', {}, m.slot ? el('div', { class: 'mslot' }, m.slot) : null, el('div', {}, (m.name || '').replace(new RegExp('^' + p.name + ':\\s*'), ''))),
      el('span', { class: 'mk' }, `${m.kcal[p.id]} ккал`))));
    box.append(det);
  });
}
async function toggleMeal(plan, di, mi, done) {
  const days = JSON.parse(JSON.stringify(plan.days)); days[di].meals[mi].done = done;
  await db.plans.update(plan.id, { days });
  if (done) logEvent('meal', { name: days[di].meals[mi].name, cat: 'ready' });
}

export default {
  id: 'meals', icon: '🍽', name: 'Раціон',
  tables: { plans: {}, log: { order: ['t', false], limit: 500 } },
  init, render,
};
