// MCP tools — feature: log (table log).
import { pick } from '../lib/time.js';

export default [
  {
    name: 'get_log',
    description: 'Activity log (used, bought, add, shop_add, meal) for the last N days (default 7).',
    inputSchema: { type: 'object', properties: { days: { type: 'number' } } },
    async run(a, s) {
      const since = new Date(Date.now() - (a.days || 7) * 864e5).toISOString();
      return { log: (await s.rows('log', 'WHERE t >= ? ORDER BY t DESC LIMIT 300', since)).map(r => pick(r, ['t', 'type', 'name', 'qty'])) };
    },
  },
];
