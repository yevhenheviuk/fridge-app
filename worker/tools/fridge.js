// MCP tools for feature: fridge (table items; writes log).
import { brusselsDate, dayDiff, pick } from '../lib/time.js';

export const ITEM_FIELDS = {
  name: { type: 'string' },
  qty: { type: 'string', description: 'Free text: "500 г", "пів пачки", "3 шт"' },
  cat: { type: 'string', description: 'dairy, egg, meat, deli, fish, veg, fruit, greens, ready, semi, canned, grain, bread, sauce, oil, spice, spread, sweet, drink, sport, other' },
  zone: { type: 'string', enum: ['fridge', 'freezer', 'pantry'] },
  exp: { type: ['string', 'null'], description: 'Best-before date YYYY-MM-DD, or null' },
  pinned: { type: 'boolean', description: 'Eat first' },
  trig: { type: 'boolean', description: 'Trigger food for the owner (only for others)' },
};
const KEYS = Object.keys(ITEM_FIELDS);
const daysLeft = exp => (exp ? dayDiff(exp, brusselsDate()) : null);

export default [
  {
    name: 'list_items',
    description: 'List products in stock, soonest expiry first, with days left. Optional zone filter.',
    inputSchema: { type: 'object', properties: { zone: { type: 'string', enum: ['fridge', 'freezer', 'pantry'] } } },
    async run(a, s) {
      let rows = await s.select('items', a.zone ? `&zone=eq.${a.zone}` : '');
      rows = rows.map(r => ({ id: r.id, name: r.name, qty: r.qty, cat: r.cat, zone: r.zone, exp: r.exp, days_left: daysLeft(r.exp), pinned: r.pinned, trig: r.trig }));
      rows.sort((x, y) => (y.pinned - x.pinned) || ((x.days_left ?? 1e4) - (y.days_left ?? 1e4)));
      return { today: brusselsDate(), count: rows.length, items: rows };
    },
  },
  {
    name: 'add_items',
    description: 'Add one or more products to stock.',
    inputSchema: { type: 'object', required: ['items'], properties: { items: { type: 'array', items: { type: 'object', required: ['name'], properties: ITEM_FIELDS } } } },
    async run(a, s) {
      const rows = await s.insert('items', a.items.map(i => pick(i, KEYS)));
      await s.insert('log', rows.map(r => ({ type: 'add', name: r.name, cat: r.cat, qty: r.qty })));
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
    description: 'Remove products from stock and log why: used (eaten/cooked) or tossed (thrown away).',
    inputSchema: { type: 'object', required: ['ids', 'reason'], properties: { ids: { type: 'array', items: { type: 'string' } }, reason: { type: 'string', enum: ['used', 'tossed'] } } },
    async run(a, s) {
      const rows = await s.remove('items', a.ids);
      if (rows.length) await s.insert('log', rows.map(r => ({ type: a.reason, name: r.name, cat: r.cat, qty: r.qty })));
      return { removed: rows.map(r => r.name), reason: a.reason };
    },
  },
];
