// MCP tools — feature: fridge (table items; writes log).
import { brusselsDate, dayDiff, pick } from '../lib/time.js';

export const ITEM_FIELDS = {
  name: { type: 'string' },
  qty: { type: 'string', description: 'Free text: "500 г", "пів пачки", "3 шт"' },
  cat: { type: 'string', description: 'dairy, egg, meat, deli, fish, veg, fruit, greens, ready, semi, canned, grain, bread, sauce, oil, spice, spread, sweet, drink, sport, other' },
  zone: { type: 'string', enum: ['fridge', 'freezer', 'pantry'] },
  exp: { type: ['string', 'null'], description: 'Best-before date YYYY-MM-DD, or null' },
  pinned: { type: 'boolean', description: 'Eat first' },
  trig: { type: 'boolean', description: 'Trigger food for Yevhen (only for Sasha)' },
};
const KEYS = Object.keys(ITEM_FIELDS);
const logRows = (rows, type) => rows.map(r => ({ type, name: r.name, cat: r.cat, qty: r.qty || '' }));

export default [
  {
    name: 'list_items',
    description: 'List products in stock, soonest expiry first, with days left. Optional zone filter.',
    inputSchema: { type: 'object', properties: { zone: { type: 'string', enum: ['fridge', 'freezer', 'pantry'] } } },
    async run(a, s) {
      const t = brusselsDate();
      const rows = (a.zone ? await s.rows('items', 'WHERE zone = ?', a.zone) : await s.rows('items'))
        .map(r => ({ ...pick(r, ['id', 'name', 'qty', 'cat', 'zone', 'exp', 'pinned', 'trig']), days_left: r.exp ? dayDiff(r.exp, t) : null }));
      rows.sort((x, y) => (y.pinned - x.pinned) || ((x.days_left ?? 1e4) - (y.days_left ?? 1e4)));
      return { today: t, count: rows.length, items: rows };
    },
  },
  {
    name: 'add_items',
    description: 'Add one or more products to stock.',
    inputSchema: { type: 'object', required: ['items'], properties: { items: { type: 'array', items: { type: 'object', required: ['name'], properties: ITEM_FIELDS } } } },
    async run(a, s) {
      const rows = await s.insert('items', a.items.map(i => ({ ...pick(i, KEYS), added: brusselsDate() })));
      await s.insert('log', logRows(rows, 'add'));
      return { added: rows.map(r => ({ id: r.id, name: r.name })) };
    },
  },
  {
    name: 'update_item',
    description: 'Change fields of a product in stock (by id).',
    inputSchema: { type: 'object', required: ['id', 'fields'], properties: { id: { type: 'string' }, fields: { type: 'object', properties: ITEM_FIELDS } } },
    async run(a, s) { return { updated: await s.update('items', a.id, pick(a.fields || {}, KEYS)) }; },
  },
  {
    name: 'remove_items',
    description: 'Mark products as used (eaten, cooked or gone) — removes them from stock and logs "used". add_to_shopping=true also puts them back on the shopping list.',
    inputSchema: { type: 'object', required: ['ids'], properties: { ids: { type: 'array', items: { type: 'string' } }, add_to_shopping: { type: 'boolean' } } },
    async run(a, s) {
      const rows = await s.remove('items', a.ids);
      if (rows.length) await s.insert('log', logRows(rows, 'used'));
      if (rows.length && a.add_to_shopping) {
        await s.insert('shopping', rows.map(r => ({ name: r.name, cat: r.cat, zone: r.zone, added: brusselsDate() })));
        await s.insert('log', logRows(rows, 'shop_add'));
      }
      return { used: rows.map(r => r.name), added_to_shopping: !!a.add_to_shopping };
    },
  },
];
