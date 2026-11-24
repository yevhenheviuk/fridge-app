// MCP tools for feature: calendar (table events; todos with due dates are in todo tools).
import { brusselsDate, pick } from '../lib/time.js';

export default [
  {
    name: 'list_events',
    description: 'Calendar events from a date (default today) for N days (default 30).',
    inputSchema: { type: 'object', properties: { from: { type: 'string' }, days: { type: 'number' } } },
    async run(a, s) {
      const from = a.from || brusselsDate();
      const to = brusselsDate(new Date(new Date(from + 'T12:00:00Z').getTime() + (a.days || 30) * 864e5));
      const rows = await s.select('events', `&d=gte.${from}&d=lte.${to}&order=d.asc`);
      return { events: rows.map(r => pick(r, ['id', 'd', 'h', 'title'])) };
    },
  },
  {
    name: 'add_event',
    description: 'Add a calendar event. d: YYYY-MM-DD, h: "HH:MM" or omitted for all day.',
    inputSchema: { type: 'object', required: ['title', 'd'], properties: { title: { type: 'string' }, d: { type: 'string' }, h: { type: 'string' } } },
    async run(a, s) { return { added: pick((await s.insert('events', [pick(a, ['title', 'd', 'h'])]))[0], ['id', 'd', 'h', 'title']) }; },
  },
  {
    name: 'delete_event',
    description: 'Delete calendar events by id.',
    inputSchema: { type: 'object', required: ['ids'], properties: { ids: { type: 'array', items: { type: 'string' } } } },
    async run(a, s) { return { removed: (await s.remove('events', a.ids)).map(r => r.title) }; },
  },
];
