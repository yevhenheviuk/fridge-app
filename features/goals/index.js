// 🎯 Цілі — savings goals with progress, contributions per person, wishlist.
// Contribution is atomic in Postgres: rpc goal_contribute (caps + closes goal).
// The worker posts 🎉 to Telegram when a goal closes (goals.announced).
import { el, toast, eur, num, confirmTap } from '../../app/core.js';
import { data, db, rpc } from '../../app/db.js';
import { meOrFirst, personName, addXp } from '../../app/people.js';

const R = {};
const pct = g => Math.min(100, Number(g.saved) / Number(g.price) * 100);
const isDone = g => Number(g.saved) >= Number(g.price) - 0.001;

function init(root) {
  R.hero = el('section', { class: 'hero' });
  R.goals = el('div', { class: 'glist' });
  R.gT = el('input', { class: 'inp', placeholder: 'Нова ціль', autocomplete: 'off' });
  R.gP = el('input', { class: 'inp inp-sm', inputmode: 'decimal', placeholder: 'Ціна, €', autocomplete: 'off' });
  R.wishes = el('ul', { class: 'list' });
  R.wT = el('input', { class: 'inp', placeholder: 'Хочу…', autocomplete: 'off' });
  R.wP = el('input', { class: 'inp inp-sm', inputmode: 'decimal', placeholder: '€ (необов.)', autocomplete: 'off' });
  R.done = el('section', { class: 'group' });
  root.append(R.hero,
    el('section', { class: 'group' }, el('h2', {}, 'Цілі'), R.goals,
      el('form', { class: 'addrow', onsubmit: addGoal }, R.gT, R.gP, el('button', { class: 'btn btn-main', type: 'submit' }, '+'))),
    el('section', { class: 'group' }, el('h2', {}, 'Хотілки'), R.wishes,
      el('form', { class: 'addrow', onsubmit: addWish }, R.wT, R.wP, el('button', { class: 'btn', type: 'submit' }, '+'))),
    R.done);
}

async function addGoal(e) {
  e.preventDefault();
  const title = R.gT.value.trim().slice(0, 120), price = num(R.gP.value);
  if (!title || !(price > 0)) { toast('Потрібні назва і ціна'); return; }
  if (await db.goals.add({ title, price, owner: 'both' })) { R.gT.value = ''; R.gP.value = ''; }
}
async function addWish(e) {
  e.preventDefault();
  const title = R.wT.value.trim().slice(0, 200); if (!title) return;
  if (await db.wishes.add({ title, price: num(R.wP.value) > 0 ? num(R.wP.value) : 0, owner: 'both' })) { R.wT.value = ''; R.wP.value = ''; }
}
async function contribute(g, input) {
  const a = num(input.value);
  if (!(a > 0)) { toast('Введи суму'); input.focus(); return; }
  const r = await rpc('goal_contribute', { p_goal: g.id, p_person: meOrFirst(), p_amount: a });
  if (!r) return;
  input.value = '';
  await Promise.all([db.goals.load(), db.goal_contribs.load()]);
  if (r.closed) toast(`🎉 «${g.title}» закрито!`); else toast(`+${eur(r.added)} → ${Math.round(r.saved / r.price * 100)}%`);
  addXp(Math.max(5, Math.round(r.added / 10)) + (r.closed ? 50 : 0));
}
async function wishToGoal(w, row) {
  const go = async price => {
    if (!(price > 0)) { toast('Спочатку постав ціну'); return; }
    if (!(await db.goals.add({ emoji: '🎁', title: w.title, price, owner: w.owner }))) return;
    await db.wishes.remove(w.id);
    toast('Хотілка стала ціллю');
  };
  if (Number(w.price) > 0) return go(Number(w.price));
  const inp = el('input', { class: 'inp inp-sm', inputmode: 'decimal', placeholder: 'Ціна €' });
  row.replaceChildren(el('span', { class: 'emoji' }, '🎁'), el('span', { class: 'name' }, w.title), inp,
    el('button', { class: 'btn btn-sm btn-main', onclick: () => go(num(inp.value)) }, 'OK'));
  inp.focus();
}

function goalCard(g) {
  const done = isDone(g);
  const by = data.goal_contribs.filter(c => c.goal_id === g.id).reduce((m, c) => { m[c.person] = (m[c.person] || 0) + Number(c.amount); return m; }, {});
  const who = Object.entries(by).filter(([p]) => p).map(([p, s]) => `${personName(p) || p}: ${eur(s)}`).join(' · ');
  const inp = el('input', { class: 'inp', inputmode: 'decimal', placeholder: 'Сума, €', 'aria-label': `Внести в «${g.title}»` });
  return el('div', { class: 'goal' + (done ? ' done' : '') },
    el('div', { class: 'g-top' }, el('span', { class: 'g-em' }, g.emoji || '⭐'),
      el('span', { style: 'min-width:0' }, el('span', { class: 'name wrap-text' }, g.title), who ? el('span', { class: 'meta' }, who) : null),
      el('button', { class: 'x', 'aria-label': `Видалити ціль: ${g.title}`, onclick: e => confirmTap(e.currentTarget, () => db.goals.remove(g.id)) }, '✕')),
    el('div', { class: 'bar' }, el('i', { style: `width:${pct(g)}%` })),
    el('div', { class: 'g-meta num' }, el('span', {}, el('b', {}, eur(g.saved)), ` з ${eur(g.price)}`),
      el('span', {}, done ? 'Закрито 🎉' : 'лишилось ' + eur(g.price - g.saved))),
    done ? null : el('form', { class: 'addrow', style: 'margin-top:10px', onsubmit: e => { e.preventDefault(); contribute(g, inp); } },
      inp, el('button', { class: 'btn btn-main', type: 'submit' }, 'Внести')));
}

function render() {
  const active = data.goals.filter(g => !isDone(g)), done = data.goals.filter(isDone);
  const tot = active.reduce((a, g) => a + Number(g.price), 0), sv = active.reduce((a, g) => a + Number(g.saved), 0);
  R.hero.replaceChildren(
    el('p', { class: 'hero-kicker' }, 'Зібрано на активні цілі'),
    el('p', { class: 'hero-name num' }, eur(sv), el('span', { class: 'of' }, ` з ${eur(tot)}`)),
    el('div', { class: 'bar', style: 'margin-top:12px' }, el('i', { style: `width:${tot ? sv / tot * 100 : 0}%` })));
  R.goals.replaceChildren(...(active.length ? active.map(goalCard) : [el('p', { class: 'empty' }, 'Додай першу ціль з ціною або перетвори хотілку на ціль')]));
  R.wishes.replaceChildren(...data.wishes.map(w => {
    const row = el('li', { class: 'row' });
    row.append(el('span', { class: 'emoji' }, '🎁'),
      el('span', { style: 'min-width:0' }, el('span', { class: 'name' }, w.title), el('span', { class: 'meta' }, Number(w.price) ? eur(w.price) : 'без ціни')),
      el('button', { class: 'btn btn-sm', onclick: () => wishToGoal(w, row) }, 'У ціль'),
      el('button', { class: 'x', 'aria-label': `Видалити: ${w.title}`, onclick: () => db.wishes.remove(w.id) }, '✕'));
    return row;
  }));
  if (!data.wishes.length) R.wishes.append(el('p', { class: 'empty' }, 'Поки порожньо'));
  R.done.hidden = !done.length;
  R.done.replaceChildren(el('h2', {}, `Закриті · ${done.length}`), el('div', { class: 'glist' }, ...done.map(goalCard)));
}

export default {
  id: 'goals', icon: '🎯', name: 'Цілі',
  tables: { goals: { order: ['created_at', false] }, goal_contribs: {}, wishes: { order: ['created_at', false] } },
  init, render,
  count: () => { const n = data.goals.filter(g => !isDone(g)).length; return n ? `${n} активних` : ''; },
};
