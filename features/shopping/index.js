// 🛒 Покупки — shopping list + "always at home" staples.
// Tapping ○ (bought) hands the item to the fridge sheet: app.call('fridge','openSheet').
import { el, html, toast, today, iso, plural, app } from '../../app/core.js';
import { data, db } from '../../app/db.js';
import { CATS, cat, guessCat } from '../../shared/food.js';
import { inStock, stapleFor, shopEntries, logEvent } from '../../shared/kitchen.js';

const R = {};
let editingShop = null, shopCat = 'other';

function init(root) {
  R.inp = el('input', { class: 'inp', autocomplete: 'off', placeholder: 'Що купити? Можна через кому', 'aria-label': 'Що купити' });
  R.list = el('div');
  R.staples = el('div', { class: 'staples' });
  R.stapleInp = el('input', { class: 'inp', autocomplete: 'off', placeholder: 'Напр. яйця', 'aria-label': 'Новий постійний продукт' });
  root.append(
    el('form', { class: 'addrow', onsubmit: addShop }, R.inp, el('button', { class: 'btn btn-main', type: 'submit' }, 'Додати')),
    R.list,
    el('section', { class: 'card' },
      el('h2', {}, 'Завжди вдома'),
      el('p', { class: 'sub' }, 'Постійні продукти. Коли закінчуються — самі потрапляють у список.'),
      R.staples,
      el('form', { class: 'addrow', onsubmit: addStaple }, R.stapleInp, el('button', { class: 'btn', type: 'submit' }, '+'))));
  initEdit();
}

async function addShop(e) {
  e.preventDefault();
  const names = R.inp.value.split(/[,;\n]/).map(x => x.trim()).filter(Boolean).slice(0, 30);
  if (!names.length) return;
  const rows = names.map(name => ({ name, cat: guessCat(name), zone: 'fridge', added: iso(today()) }));
  await db.shopping.add(rows);
  rows.forEach(r => logEvent('shop_add', r));
  R.inp.value = ''; R.inp.focus();
}
async function addStaple(e) {
  e.preventDefault();
  const name = R.stapleInp.value.trim(); if (!name) return;
  if (stapleFor(name)) { toast('Вже є в постійних'); return; }
  await db.staples.add({ name, cat: guessCat(name), zone: 'fridge' }); R.stapleInp.value = '';
}

function render() {
  const entries = shopEntries();
  R.list.replaceChildren();
  if (!entries.length) R.list.append(el('p', { class: 'empty' }, 'Список порожній. Коли відмітиш щось як використане, я спитаю, чи докупити.'));
  CATS.forEach(c => {
    const list = entries.filter(e => (e.cat || 'other') === c.id);
    if (!list.length) return;
    const ul = el('ul', { class: 'list' });
    list.forEach(e => {
      const tags = [];
      if (e.kind === 'staple') tags.push(el('span', { class: 'tag' }, 'закінчилось'));
      if (e.source === 'plan') tags.push(el('span', { class: 'tag' }, 'для раціону'));
      ul.append(el('li', { class: 'srow' },
        el('button', { class: 'buy', title: 'Купив', 'aria-label': `Купив: ${e.name}`, onclick: () => app.call('fridge', 'openSheet', null, e) }),
        el('span', { class: 'emoji', 'aria-hidden': 'true' }, c.e),
        el('button', { class: 'body', 'aria-label': `Змінити: ${e.name}`, onclick: () => openEdit(e) },
          el('span', { class: 'name wrap-text' }, e.name, ...tags),
          (e.qty || e.note) ? el('span', { class: 'meta' }, [e.qty, e.note].filter(Boolean).join(' · ')) : null),
        e.kind === 'manual' ? el('button', { class: 'x', 'aria-label': `Прибрати: ${e.name}`, onclick: () => db.shopping.remove(e.id) }, '✕') : el('span')));
    });
    R.list.append(el('section', { class: 'group' }, el('h2', {}, `${c.e} ${c.n}`), ul));
  });
  R.staples.replaceChildren();
  if (!data.staples.length) R.staples.append(el('span', { class: 'count' }, 'Ще нічого не додано.'));
  [...data.staples].sort((a, b) => a.name.localeCompare(b.name, 'uk')).forEach(s => {
    const has = inStock(s.name);
    R.staples.append(el('span', { class: 'staple' + (has ? '' : ' miss'), title: has ? 'Є вдома' : 'Закінчилось' },
      `${cat(s.cat).e} ${s.name}`, el('button', { 'aria-label': `Прибрати з постійних: ${s.name}`, onclick: () => db.staples.remove(s.id) }, '✕')));
  });
}

/* ---------- edit sheet ---------- */
function initEdit() {
  R.dlg = html(`
<dialog data-feature="shopping">
  <form class="sheet" method="dialog">
    <h3 data-r="title">Змінити покупку</h3>
    <label class="f" for="sh-name">Що купити</label>
    <input class="inp" id="sh-name" autocomplete="off" required>
    <label class="f" for="sh-qty">Скільки</label>
    <input class="inp" id="sh-qty" autocomplete="off" placeholder="1 кг, 2 шт, велика пачка">
    <label class="f" for="sh-note">Примітка</label>
    <input class="inp" id="sh-note" autocomplete="off" placeholder="бренд, для чого, де купити">
    <label class="f">Категорія</label><div class="chips" data-r="cat"></div>
    <div class="actions">
      <button type="submit" class="btn btn-main">Зберегти</button>
      <button type="button" class="btn" data-r="cancel">Скасувати</button>
    </div>
    <div class="actions" data-r="delRow"><button type="button" class="btn btn-danger" data-r="del">Прибрати зі списку</button></div>
  </form>
</dialog>`);
  document.body.append(R.dlg);
  const q = s => R.dlg.querySelector(s), r = k => q(`[data-r="${k}"]`);
  R.q = q; R.r = r;
  r('cancel').onclick = () => R.dlg.close();
  r('del').onclick = async () => { const e = editingShop; R.dlg.close(); if (e?.kind === 'manual') { await db.shopping.remove(e.id); toast(`Прибрано: ${e.name}`); } };
  q('form').addEventListener('submit', async ev => {
    ev.preventDefault(); const e = editingShop; if (!e) return;
    const name = q('#sh-name').value.trim(); if (!name) { q('#sh-name').focus(); return; }
    const d = { name, qty: q('#sh-qty').value.trim(), note: q('#sh-note').value.trim(), cat: shopCat };
    if (e.kind === 'manual') await db.shopping.update(e.id, d);
    else await db.shopping.add({ ...d, zone: e.zone || 'fridge', added: iso(today()) });
    R.dlg.close(); toast('Збережено');
  });
}
function catChips() {
  R.r('cat').replaceChildren(...CATS.map(c => el('button', { type: 'button', class: 'chip', 'aria-pressed': String(shopCat === c.id), onclick: () => { shopCat = c.id; catChips(); } }, `${c.e} ${c.n}`)));
}
function openEdit(e) {
  editingShop = e; shopCat = e.cat || 'other';
  R.q('#sh-name').value = e.name || ''; R.q('#sh-qty').value = e.qty || ''; R.q('#sh-note').value = e.note || '';
  R.r('title').textContent = e.kind === 'staple' ? 'Постійний продукт — деталі покупки' : 'Змінити покупку';
  R.r('delRow').hidden = e.kind !== 'manual';
  catChips(); R.dlg.showModal();
}

export default {
  id: 'shopping', icon: '🛒', name: 'Покупки',
  tables: { shopping: {}, staples: {}, items: {}, log: { order: ['t', false], limit: 500 } },
  init, render,
  count: () => { const n = shopEntries().length; return n ? `${n} ${plural(n, 'позиція', 'позиції', 'позицій')}` : ''; },
  badge: () => shopEntries().length,
};
