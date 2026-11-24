// 💸 Витрати — quick expense entry ("aldi 23"), month total, by-category bars.
import { el, toast, today, iso, parse, eur, fmtDate, MONTHS, confirmTap } from '../../app/core.js';
import { data, db } from '../../app/db.js';
import { meOrFirst, personName, addXp, persons } from '../../app/people.js';
import { EXP_CATS, expCat, catOf, parseExpense } from './parse.js';

const R = {};
let showAll = false;
const since = () => { const d = today(); d.setDate(d.getDate() - 120); return iso(d); };

function init(root) {
  R.inp = el('input', { class: 'inp', placeholder: 'delhaize 47 або кава 3.5', enterkeyhint: 'done', autocomplete: 'off', 'aria-label': 'Витрата: назва і сума' });
  R.hero = el('section', { class: 'hero' });
  R.cats = el('div', { class: 'cats' });
  R.list = el('ul', { class: 'list' });
  R.more = el('button', { class: 'btn btn-sm', onclick: () => { showAll = !showAll; render(); } });
  root.append(
    el('form', { class: 'addrow', onsubmit: add }, R.inp, el('button', { class: 'btn btn-main', type: 'submit' }, 'Додати')),
    el('p', { class: 'hint' }, 'Назва і сума — категорія ставиться сама. Не та? Тапни іконку. Можна й боту в Телеграм: ', el('code', {}, 'aldi 23'), ', а в групі з мінусом: ', el('code', {}, '-aldi 23')),
    R.hero,
    el('section', { class: 'group' }, el('h2', {}, 'За категоріями'), R.cats),
    el('section', { class: 'group' }, el('h2', {}, 'Останні'), R.list, R.more));
}

async function add(e) {
  e.preventDefault();
  const p = parseExpense(R.inp.value);
  if (!p || !(p.amount > 0)) { toast('Напиши назву і суму, напр. «aldi 23»'); return; }
  const cat = catOf(p.title), c = expCat(cat);
  const ok = await db.expenses.add({ title: p.title.slice(0, 100), amount: p.amount, cat, person: meOrFirst() });
  if (!ok) return;
  R.inp.value = ''; R.inp.focus();
  toast(`${c.e} ${c.n}: −${eur(p.amount)}`);
  addXp(2);
}

function render() {
  const t = today(), ym = iso(t).slice(0, 7);
  const exps = data.expenses;
  const m = exps.filter(e => e.d.startsWith(ym));
  const tot = m.reduce((a, e) => a + Number(e.amount), 0);
  const prevD = new Date(t.getFullYear(), t.getMonth() - 1, 1), prevYm = iso(prevD).slice(0, 7);
  const prev = exps.filter(e => e.d.startsWith(prevYm)).reduce((a, e) => a + Number(e.amount), 0);
  const by = EXP_CATS.map(c => ({ ...c, v: m.filter(e => e.cat === c.k).reduce((a, e) => a + Number(e.amount), 0) })).filter(c => c.v > 0).sort((a, b) => b.v - a.v);
  const fun = by.filter(c => c.k === 'cafe' || c.k === 'fun').reduce((a, c) => a + c.v, 0);
  const goal = (data.goals || []).filter(g => Number(g.saved) < Number(g.price)).sort((a, b) => b.saved / b.price - a.saved / a.price)[0];
  const ps = persons().filter(p => p.id !== 'me');
  const perPerson = ps.length > 1 ? ps.map(p => `${p.name}: ${eur(m.filter(e => e.person === p.id).reduce((a, e) => a + Number(e.amount), 0))}`).join(' · ') : '';

  R.hero.replaceChildren(...[
    el('p', { class: 'hero-kicker' }, `${MONTHS[t.getMonth()]} ${t.getFullYear()}`),
    el('p', { class: 'hero-name num' }, eur(tot)),
    prev ? el('p', { class: 'hero-sub' }, `Минулого місяця: ${eur(prev)}`) : null,
    perPerson && tot ? el('p', { class: 'hero-sub' }, perPerson) : null,
    goal && fun > 0 ? el('p', { class: 'hero-sub' }, `Кафе та ігри: ${eur(fun)}. Це ${Math.round(fun / goal.price * 100)}% цілі «${goal.title}».`) : null].filter(Boolean));

  const max = by[0]?.v || 1;
  R.cats.replaceChildren(...(by.length ? by.map(c => el('div', { class: 'cat' },
    el('span', {}, c.e), el('span', {}, c.n), el('b', { class: 'num' }, eur(c.v)),
    el('div', { class: 'bar' }, el('i', { style: `width:${c.v / max * 100}%` })))) : [el('p', { class: 'empty' }, 'Цього місяця ще нічого')]));

  const list = showAll ? exps : exps.slice(0, 20);
  R.list.replaceChildren(...list.map(e => {
    const c = expCat(e.cat);
    const who = ps.length > 1 && e.person ? personName(e.person) : '';
    return el('li', { class: 'row' },
      el('button', { class: 'ic', 'aria-label': `Категорія: ${c.n}. Змінити`, title: c.n, onclick: () => cycleCat(e) }, c.e),
      el('span', { style: 'min-width:0' }, el('span', { class: 'name' }, e.title), el('span', { class: 'meta' }, [fmtDate(e.d), who].filter(Boolean).join(' · '))),
      el('span', { class: 'rt num' }, `−${eur(e.amount)}`),
      el('button', { class: 'x', 'aria-label': `Видалити: ${e.title}`, onclick: ev => confirmTap(ev.currentTarget, () => db.expenses.remove(e.id)) }, '✕'));
  }));
  if (!exps.length) R.list.append(el('p', { class: 'empty' }, 'Тут з’являться витрати'));
  R.more.hidden = exps.length <= 20;
  R.more.textContent = showAll ? 'Згорнути' : `Показати всі (${exps.length})`;
}
function cycleCat(e) {
  const i = EXP_CATS.findIndex(c => c.k === e.cat);
  const next = EXP_CATS[(i + 1) % EXP_CATS.length];
  db.expenses.update(e.id, { cat: next.k });
  toast(`${next.e} ${next.n}`);
}

export default {
  id: 'finance', icon: '💸', name: 'Витрати',
  tables: { expenses: { since: ['d', since], order: ['d', false] }, goals: {} },
  init, render,
  count: () => { const ym = iso(today()).slice(0, 7); const s = data.expenses.filter(e => e.d.startsWith(ym)).reduce((a, e) => a + Number(e.amount), 0); return s ? eur(s) : ''; },
};
