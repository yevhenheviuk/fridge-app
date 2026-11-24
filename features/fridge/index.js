// 🧊 Запаси — what's in the fridge/freezer/pantry, sorted by "eat first".
import { el, html, toast, today, iso, plusDays, parse, daysLeft, plural, pDays, pref, savePref } from '../../app/core.js';
import { data, db } from '../../app/db.js';
import { persons } from '../../app/people.js';
import { CATS, ZONES, cat, zoneName, guessCat, norm } from '../../shared/food.js';
import { inStock, stapleFor, logEvent } from '../../shared/kitchen.js';

const QUICK = [['Сьогодні', 0], ['+1', 1], ['+2', 2], ['+3', 3], ['+5', 5], ['+7', 7], ['+14', 14], ['+30', 30], ['Без дати', null]];
const SORTS = [{ id: 'exp', n: 'За терміном' }, { id: 'new', n: 'Нещодавно додані' }, { id: 'old', n: 'Давно додані' }, { id: 'name', n: 'За назвою А–Я' }, { id: 'cat', n: 'За категорією' }];
const GROUPS = ['Горить — з’їсти першим', 'Найближчі дні', 'Цього тижня', 'Є час', 'Без дати'];

let zoneFilter = 'all', catFilter = pref('fridge.cat', 'all'), sortBy = pref('fridge.sort', 'exp'), searchQ = '';
if (!SORTS.some(x => x.id === sortBy)) sortBy = 'exp';
let editing = null, fromShop = null, catTouched = false, form = { cat: 'other', zone: 'fridge' };
const R = {}; // element refs

/* ---------- status ---------- */
function status(it) {
  const d = daysLeft(it.exp);
  if (d === null) return { c: 'var(--line)', txt: 'без дати', big: '—', small: '' };
  if (d < 0) return { c: 'var(--dead)', txt: `прострочено ${-d} ${pDays(d)} тому`, big: '!', small: 'прострочено' };
  if (d === 0) return { c: 'var(--hot)', txt: 'останній день — сьогодні', big: '0', small: 'сьогодні' };
  if (d === 1) return { c: 'var(--hot)', txt: 'до завтра', big: '1', small: 'день' };
  if (d <= 4) return { c: 'var(--soon)', txt: `ще ${d} ${pDays(d)}`, big: d, small: pDays(d) };
  if (d <= 7) return { c: 'var(--week)', txt: `ще ${d} ${pDays(d)}`, big: d, small: pDays(d) };
  return { c: 'var(--fresh)', txt: `ще ${d} ${pDays(d)}`, big: d, small: pDays(d) };
}
function rank(it) { const d = daysLeft(it.exp); let r = d === null ? 9999 : d; if (it.zone === 'freezer' && d === null) r = 10000; if (it.pinned) r -= 100000; return r; }
function groupOf(it) { const d = daysLeft(it.exp); if (it.pinned || (d !== null && d <= 1)) return 0; if (d === null) return 4; if (d <= 4) return 1; if (d <= 7) return 2; return 3; }
const addedAt = it => it.created_at || (it.added ? it.added + 'T00:00:00' : '');
function addedTxt(it) {
  if (!it.added && !it.created_at) return '';
  const d = Math.round((today() - parse((it.added || it.created_at).slice(0, 10))) / 864e5);
  return d <= 0 ? 'додано сьогодні' : d === 1 ? 'додано вчора' : `додано ${d} ${pDays(d)} тому`;
}
// Trigger foods are "not for Yevhen" — label uses his profile name.
const triggerOwner = () => (persons().find(p => p.id === 'yevhen') || persons()[0]).name;

/* ---------- skeleton ---------- */
function init(root) {
  R.hero = el('section', { class: 'hero', 'aria-live': 'polite' });
  R.search = el('input', { class: 'inp', type: 'search', autocomplete: 'off', enterkeyhint: 'search', placeholder: 'Пошук продукту', 'aria-label': 'Пошук продукту' });
  R.clr = el('button', { class: 'clr', type: 'button', 'aria-label': 'Очистити пошук', hidden: true }, '✕');
  R.tabs = el('nav', { class: 'tabs', 'aria-label': 'Де лежить' });
  R.catTabs = el('nav', { class: 'tabs', 'aria-label': 'Категорія' });
  R.sort = el('select', { class: 'inp sort' }, ...SORTS.map(o => el('option', { value: o.id }, o.n)));
  R.groups = el('div');
  root.append(R.hero,
    el('div', { class: 'search', role: 'search' }, el('span', { class: 'ico', 'aria-hidden': 'true' }, '🔍'), R.search, R.clr),
    R.tabs, el('div', { class: 'tools' }, R.catTabs, el('label', { class: 'sortrow' }, 'Сортувати ', R.sort)), R.groups);
  R.search.addEventListener('input', () => { searchQ = R.search.value; R.clr.hidden = !searchQ; render(); });
  R.clr.onclick = () => { searchQ = ''; R.search.value = ''; R.clr.hidden = true; render(); R.search.focus(); };
  R.sort.onchange = () => { sortBy = R.sort.value; savePref('fridge.sort', sortBy); render(); };
  initSheet();
}

/* ---------- render ---------- */
function render() {
  const items = data.items;
  const sorted = [...items].sort((a, b) => rank(a) - rank(b) || (a.name || '').localeCompare(b.name || '', 'uk'));
  const q = norm(searchQ);
  const hit = i => !q || norm(i.name).includes(q) || norm(i.qty).includes(q) || norm(cat(i.cat).n).includes(q);
  const found = sorted.filter(hit);
  const inZone = found.filter(i => zoneFilter === 'all' || i.zone === zoneFilter);
  const shown = inZone.filter(i => catFilter === 'all' || (i.cat || 'other') === catFilter);

  const hero = R.hero; hero.replaceChildren(); hero.className = 'hero';
  const first = sorted.find(i => i.zone !== 'freezer' || daysLeft(i.exp) !== null) || sorted[0];
  if (!first) {
    hero.classList.add('hero-empty'); hero.style.removeProperty('--c');
    hero.append(el('p', { class: 'hero-kicker' }, 'Поки порожньо'), el('p', { class: 'hero-name' }, 'Внеси, що зараз лежить у холодильнику — я розставлю, що їсти першим.'));
  } else {
    const s = status(first); hero.style.setProperty('--c', s.c);
    hero.append(el('p', { class: 'hero-kicker' }, first.pinned ? 'Позначено — з’їсти першим' : 'Спочатку використай'),
      el('p', { class: 'hero-name' }, `${cat(first.cat).e} ${first.name}`),
      el('p', { class: 'hero-when' }, s.txt + (first.qty ? ` · ${first.qty}` : '')));
  }

  R.tabs.replaceChildren(...[{ id: 'all', n: 'Усе' }, ...ZONES].map(z => {
    const n = z.id === 'all' ? found.length : found.filter(i => i.zone === z.id).length;
    return el('button', { class: 'tab', 'aria-pressed': String(zoneFilter === z.id), onclick: () => { zoneFilter = z.id; render(); } }, `${z.n}${n ? ` ${n}` : ''}`);
  }));
  const present = CATS.filter(c => c.id === catFilter || inZone.some(i => (i.cat || 'other') === c.id));
  R.catTabs.replaceChildren(...[{ id: 'all', e: '', n: 'Усі' }, ...present].map(c => {
    const n = c.id === 'all' ? inZone.length : inZone.filter(i => (i.cat || 'other') === c.id).length;
    return el('button', { class: 'tab cat-tab', 'aria-pressed': String(catFilter === c.id), onclick: () => { catFilter = c.id; savePref('fridge.cat', c.id); render(); } }, `${c.e ? c.e + ' ' : ''}${c.n}${n ? ` ${n}` : ''}`);
  }));
  R.sort.value = sortBy;

  const byName = (a, b) => (a.name || '').localeCompare(b.name || '', 'uk');
  let sections;
  if (sortBy === 'exp') { const b = [[], [], [], [], []]; shown.forEach(i => b[groupOf(i)].push(i)); sections = b.map((x, i) => [GROUPS[i], x]); }
  else if (sortBy === 'cat') sections = CATS.map(c => [`${c.e} ${c.n}`, shown.filter(i => (i.cat || 'other') === c.id)]);
  else if (sortBy === 'name') sections = [[null, [...shown].sort(byName)]];
  else { const dir = sortBy === 'new' ? -1 : 1; sections = [[null, [...shown].sort((a, b) => dir * addedAt(a).localeCompare(addedAt(b)) || byName(a, b))]]; }

  R.groups.replaceChildren();
  sections.forEach(([title, list]) => {
    if (!list.length) return;
    const ul = el('ul', { class: 'list' });
    list.forEach(it => {
      const s = status(it);
      const meta = [it.qty, zoneFilter === 'all' ? zoneName(it.zone) : null, (sortBy === 'new' || sortBy === 'old') ? addedTxt(it) : s.txt].filter(Boolean).join(' · ');
      ul.append(el('li', { class: 'item', style: `--c:${s.c}` },
        el('span', { class: 'emoji', 'aria-hidden': 'true' }, cat(it.cat).e),
        el('button', { class: 'body', onclick: () => openSheet(it), 'aria-label': `Змінити: ${it.name}` },
          el('span', { class: 'name' }, it.pinned ? el('span', { class: 'pin' }, '● ') : null, it.name),
          el('span', { class: 'meta' }, it.trig ? el('span', { class: 'trig' }, '⚠ тригер · ') : null, meta)),
        el('span', { class: 'days', 'aria-hidden': 'true' }, el('b', {}, String(s.big)), el('small', {}, s.small)),
        el('button', { class: 'used', title: 'Використав', 'aria-label': `Використав: ${it.name}`, onclick: () => removeItem(it, 'Використано') }, '✓')));
    });
    R.groups.append(el('section', { class: 'group' }, title ? el('h2', {}, title) : null, ul));
  });
  if (items.length && !shown.length) {
    if (q && found.length) R.groups.append(el('p', { class: 'empty' }, `Тут не знайшов, але є ще ${found.length} в інших розділах. `,
      el('button', { class: 'btn', type: 'button', onclick: () => { zoneFilter = 'all'; catFilter = 'all'; savePref('fridge.cat', 'all'); render(); } }, 'Показати')));
    else R.groups.append(el('p', { class: 'empty' }, q ? `Нічого не знайшов за «${searchQ.trim()}».` : catFilter !== 'all' ? 'У цій категорії тут нічого.' : 'Тут поки нічого.'));
  }
}

/* ---------- add / edit sheet ---------- */
const $s = sel => R.dlg.querySelector(sel);
function initSheet() {
  R.dlg = html(`
<dialog data-feature="fridge">
  <form class="sheet" method="dialog">
    <h3 data-r="title">Додати продукт</h3>
    <label class="f" for="fr-name">Що це</label>
    <input class="inp" id="fr-name" autocomplete="off" placeholder="Напр. курячі стегна" required>
    <label class="f" for="fr-qty">Скільки (необов'язково)</label>
    <input class="inp" id="fr-qty" autocomplete="off" placeholder="500 г, пів пачки, 3 шт">
    <label class="f">Категорія</label><div class="chips" data-r="cat"></div>
    <label class="f">Де лежить</label><div class="chips" data-r="zone"></div>
    <label class="f" for="fr-exp">Вжити до</label><div class="chips" data-r="quick"></div>
    <input class="inp" type="date" id="fr-exp" style="margin-top:8px">
    <label class="check"><input type="checkbox" id="fr-pin"> З'їсти першим, незалежно від дати</label>
    <label class="check"><input type="checkbox" id="fr-staple"> Завжди тримати вдома</label>
    <label class="check"><input type="checkbox" id="fr-trig"> <span data-r="trigLabel">Тригер</span></label>
    <div class="actions">
      <button type="submit" class="btn btn-main" data-r="save">Додати</button>
      <button type="button" class="btn" data-r="close">Готово</button>
    </div>
    <div class="actions" data-r="delRow" hidden>
      <button type="button" class="btn" data-r="used">Використав</button>
      <button type="button" class="btn btn-danger" data-r="toss">Викинув</button>
    </div>
    <p class="hint" data-r="hint">Після додавання форма очиститься, щоб одразу внести наступне.</p>
  </form>
</dialog>`);
  document.body.append(R.dlg);
  const r = k => $s(`[data-r="${k}"]`);
  $s('#fr-name').addEventListener('input', () => { if (catTouched) return; form.cat = guessCat($s('#fr-name').value); chips(r('cat'), CATS, 'cat'); });
  r('close').onclick = () => R.dlg.close();
  r('used').onclick = () => { const it = editing; R.dlg.close(); removeItem(it, 'Використано'); };
  r('toss').onclick = () => { const it = editing; R.dlg.close(); removeItem(it, 'Викинуто'); };
  $s('form').addEventListener('submit', submit);
  R.r = r;
}
function chips(host, list, key) {
  host.replaceChildren(...list.map(o => el('button', {
    type: 'button', class: 'chip', 'aria-pressed': String(form[key] === o.id),
    onclick: () => { form[key] = o.id; if (key === 'cat') catTouched = true; chips(host, list, key); },
  }, o.e ? `${o.e} ${o.n}` : o.n)));
}
function openSheet(it, prefill) {
  const r = R.r;
  editing = it || null; fromShop = prefill || null; const src = it || prefill || {};
  catTouched = !!(it || (prefill && prefill.cat && prefill.cat !== 'other'));
  form = { cat: src.cat || 'other', zone: src.zone || 'fridge' };
  $s('#fr-name').value = src.name || ''; $s('#fr-qty').value = src.qty || ''; $s('#fr-exp').value = it?.exp || '';
  $s('#fr-pin').checked = !!it?.pinned; $s('#fr-trig').checked = !!it?.trig; $s('#fr-staple').checked = !!(src.name && stapleFor(src.name));
  const o = triggerOwner();
  r('trigLabel').textContent = `Тригер — не для ${o === 'Я' ? 'мене' : o}`;
  r('title').textContent = it ? 'Змінити' : prefill ? 'Купив — куди поклав?' : 'Додати продукт';
  r('save').textContent = it ? 'Зберегти' : 'Додати';
  r('close').textContent = it || prefill ? 'Скасувати' : 'Готово';
  r('delRow').hidden = !it; r('hint').hidden = !!(it || prefill);
  chips(r('cat'), CATS, 'cat'); chips(r('zone'), ZONES, 'zone');
  r('quick').replaceChildren(...QUICK.map(([label, n]) => el('button', { type: 'button', class: 'chip', onclick: () => { $s('#fr-exp').value = n === null ? '' : plusDays(n); } }, label)));
  R.dlg.showModal();
  if (!it && !prefill) setTimeout(() => $s('#fr-name').focus(), 50);
}
async function submit(e) {
  e.preventDefault();
  const name = $s('#fr-name').value.trim(); if (!name) { $s('#fr-name').focus(); return; }
  const d = { name, qty: $s('#fr-qty').value.trim(), cat: form.cat, zone: form.zone, exp: $s('#fr-exp').value || null, pinned: $s('#fr-pin').checked, trig: $s('#fr-trig').checked };
  const st = stapleFor(name);
  if ($s('#fr-staple').checked && !st) await db.staples.add({ name, cat: form.cat, zone: form.zone });
  if (!$s('#fr-staple').checked && st && norm(st.name) === norm(name)) await db.staples.remove(st.id);
  if (editing) { await db.items.update(editing.id, d); R.dlg.close(); toast('Збережено'); return; }
  d.added = iso(today());
  await db.items.add(d);
  logEvent(fromShop ? 'bought' : 'add', d);
  if (fromShop) { if (fromShop.kind === 'manual') await db.shopping.remove(fromShop.id); R.dlg.close(); toast(`У запасах: ${name}`); return; }
  toast(`Додано: ${name}`);
  $s('#fr-name').value = ''; $s('#fr-qty').value = ''; $s('#fr-exp').value = '';
  $s('#fr-pin').checked = false; $s('#fr-trig').checked = false; $s('#fr-staple').checked = false;
  catTouched = false; form.cat = 'other'; chips(R.r('cat'), CATS, 'cat'); $s('#fr-name').focus();
}

/* ---------- used / tossed ---------- */
async function removeItem(it, verb) {
  if (!it) return;
  await db.items.remove(it.id);
  logEvent(verb === 'Використано' ? 'used' : 'tossed', it);
  const st = stapleFor(it.name);
  if (st) { setTimeout(() => toast(inStock(st.name) ? `${verb}: ${it.name}` : `${verb}: ${it.name} · вже в покупках`), 50); return; }
  if (data.shopping.some(s => norm(s.name) === norm(it.name))) { toast(`${verb}: ${it.name}`); return; }
  toast(`${verb}: ${it.name}`, {
    label: 'Докупити',
    fn: () => db.shopping.add({ name: it.name, cat: it.cat, zone: it.zone, added: iso(today()) }).then(() => { logEvent('shop_add', it); toast('Додано в покупки'); }),
  });
}

export default {
  id: 'fridge', icon: '🧊', name: 'Запаси', title: 'Холодильник',
  tables: { items: {}, staples: {}, shopping: {}, log: { order: ['t', false], limit: 500 } },
  init, render,
  count: () => (data.items.length ? `${data.items.length} ${plural(data.items.length, 'продукт', 'продукти', 'продуктів')}` : ''),
  fab: { label: '+ Додати', onClick: () => openSheet() },
  actions: {
    // Open the add sheet prefilled from a shopping entry ("Купив — куди поклав?")
    openSheet: (item, prefill) => openSheet(item, prefill),
  },
};
