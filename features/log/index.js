// 📜 Журнал — kitchen activity log (last 500 events) + 7-day stats.
// There is no "tossed" any more: old tossed rows are shown as used.
// Writers: shared/kitchen.js logEvent() and the worker's MCP tools.
import { el, today, plural } from '../../app/core.js';
import { data, db } from '../../app/db.js';

const LOGT = {
  add: { i: '➕', n: 'Додано в запаси' }, bought: { i: '🛍', n: 'Куплено' }, used: { i: '✅', n: 'Використано' },
  tossed: { i: '✅', n: 'Використано' }, shop_add: { i: '📝', n: 'У список покупок' }, meal: { i: '🍽', n: 'Приготовано' },
};
const FILTERS = [['all', 'Усе'], ['used', 'Використано'], ['in', 'Додано й куплено'], ['shop_add', 'Покупки'], ['meal', 'Раціон']];
const isUsed = l => l.type === 'used' || l.type === 'tossed'; // old "tossed" rows count as used
const R = {};
let filter = 'all';

function init(root) {
  R.stats = el('div', { class: 'stats' });
  R.tabs = el('nav', { class: 'tabs', 'aria-label': 'Фільтр журналу' });
  R.list = el('div');
  root.append(el('p', { class: 'hint', style: 'margin:14px 4px 0' }, 'Останні 7 днів'), R.stats, R.tabs, R.list);
}
function dayLabel(ts) {
  const d = new Date(ts); d.setHours(0, 0, 0, 0); const diff = Math.round((today() - d) / 864e5);
  if (diff === 0) return 'Сьогодні'; if (diff === 1) return 'Вчора';
  return d.toLocaleDateString('uk-UA', { weekday: 'long', day: 'numeric', month: 'long' });
}
function render() {
  const logs = data.log;
  const week = Date.now() - 7 * 864e5;
  const recent = logs.filter(l => new Date(l.t).getTime() >= week);
  const cnt = t => recent.filter(l => l.type === t).length;
  R.stats.replaceChildren(
    el('div', { class: 'stat good' }, el('b', {}, String(recent.filter(isUsed).length)), el('span', {}, 'використано')),
    el('div', { class: 'stat' }, el('b', {}, String(cnt('bought') + cnt('add'))), el('span', {}, 'додано')),
    el('div', { class: 'stat' }, el('b', {}, String(cnt('shop_add'))), el('span', {}, 'у покупки')),
    el('div', { class: 'stat' }, el('b', {}, String(cnt('meal'))), el('span', {}, 'страв')));
  R.tabs.replaceChildren(...FILTERS.map(([id, n]) => el('button', { class: 'tab', 'aria-pressed': String(filter === id), onclick: () => { filter = id; render(); } }, n)));
  const list = logs.filter(l => filter === 'all' || (filter === 'in' ? (l.type === 'add' || l.type === 'bought') : filter === 'used' ? isUsed(l) : l.type === filter));
  R.list.replaceChildren();
  if (!list.length) { R.list.append(el('p', { class: 'empty' }, logs.length ? 'Тут поки нічого.' : 'Журнал почнеться з наступної дії: додай, використай чи купи щось — і воно з’явиться тут.')); return; }
  const groups = new Map();
  list.forEach(l => { const k = dayLabel(l.t); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(l); });
  for (const [k, arr] of groups) {
    const ul = el('ul', { class: 'list' });
    arr.forEach(l => {
      const T = LOGT[l.type] || { i: '•', n: l.type };
      ul.append(el('li', { class: 'lrow' },
        el('span', { class: 'ltime' }, new Date(l.t).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })),
        el('span', { class: 'emoji', 'aria-hidden': 'true' }, T.i),
        el('span', { style: 'min-width:0' }, el('span', { class: 'name' }, l.name), el('span', { class: 'meta' }, [T.n, l.qty].filter(Boolean).join(' · '))),
        el('button', { class: 'x', 'aria-label': `Видалити запис: ${l.name}`, title: 'Видалити запис', onclick: () => db.log.remove(l.id) }, '✕')));
    });
    R.list.append(el('section', { class: 'group' }, el('h2', { style: 'text-transform:capitalize' }, k), ul));
  }
}

export default {
  id: 'log', icon: '📜', name: 'Журнал',
  tables: { log: { order: ['t', false], limit: 500 } },
  init, render,
  count: () => (data.log.length ? `${data.log.length} ${plural(data.log.length, 'запис', 'записи', 'записів')}` : ''),
};
