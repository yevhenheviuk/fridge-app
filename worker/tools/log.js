// MCP tools for feature: log (table log).
import { pick } from '../lib/time.js';

export default [
  {
    name: 'get_log',
    description: 'Activity log (used, tossed, bought, added, shop_add, meal) for the last N days (default 7).',
    inputSchema: { type: 'object', properties: { days: { type: 'number' } } },
    async run(a, s) {
      const since = new Date(Date.now() - (a.days || 7) * 864e5).toISOString();
      const rows = await s.select('log', `&t=gte.${since}&order=t.desc&limit=300`);
      return { log: rows.map(r => pick(r, ['t', 'type', 'name', 'qty'])) };
    },
  },
];
