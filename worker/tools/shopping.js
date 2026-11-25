// MCP tools — feature: shopping (tables shopping, staples; reads items).
import { brusselsDate, pick } from '../lib/time.js';
import { ITEM_FIELDS } from './fridge.js';

export default [
  {
    name: 'get_shopping',
    description: 'Get the shopping list plus staples (always-at-home products) with whether each is in stock.',
    inputSchema: { type: 'object', properties: {} },
    async run(a, s) {
      const [shop, staples, items] = await Promise.all([s.rows('shopping'), s.rows('staples'), s.rows('items')]);
      const n = x => (x || '').toLowerCase().trim();
      return {
        shopping: shop.map(r => pick(r, ['id', 'name', 'qty', 'note', 'cat', 'source'])),
        staples: staples.map(st => ({ id: st.id, name: st.name, in_stock: items.some(i => n(i.name).includes(n(st.name))) })),
      };
    },
  },
  {
    name: 'add_shopping',
    description: 'Add items to the shopping list. Use source "plan" for items needed by a meal plan.',
    inputSchema: {
      type: 'object', required: ['items'],
      properties: { items: { type: 'array', items: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, qty: { type: 'string' }, note: { type: 'string' }, cat: ITEM_FIELDS.cat, zone: ITEM_FIELDS.zone, source: { type: 'string', enum: ['manual', 'plan'] } } } } },
    },
    async run(a, s) {
      const rows = await s.insert('shopping', a.items.map(i => ({ ...pick(i, ['name', 'qty', 'note', 'cat', 'zone', 'source']), added: brusselsDate() })));
      await s.insert('log', rows.map(r => ({ type: 'shop_add', name: r.name, cat: r.cat, qty: r.qty })));
      return { added: rows.map(r => ({ id: r.id, name: r.name })) };
    },
  },
  {
    name: 'remove_shopping',
    description: 'Remove items from the shopping list by id.',
    inputSchema: { type: 'object', required: ['ids'], properties: { ids: { type: 'array', items: { type: 'string' } } } },
    async run(a, s) { return { removed: (await s.remove('shopping', a.ids)).map(r => r.name) }; },
  },
];
