// MCP tools for feature: finance (table expenses). Parser shared with the app.
import { EXP_CATS, catOf } from '../../features/finance/parse.js';
import { daysBefore, pick } from '../lib/time.js';

const CAT_KEYS = EXP_CATS.map(c => c.k);
export default [
  {
    name: 'list_expenses',
    description: 'Expenses for the last N days (default 31), newest first, with totals per category and per person.',
    inputSchema: { type: 'object', properties: { days: { type: 'number' } } },
    async run(a, s) {
      const rows = await s.select('expenses', `&d=gte.${daysBefore(a.days || 31)}&order=d.desc`);
      const sum = key => rows.reduce((m, r) => { m[r[key] || '?'] = Math.round(((m[r[key] || '?'] || 0) + Number(r.amount)) * 100) / 100; return m; }, {});
      return { total: rows.reduce((x, r) => x + Number(r.amount), 0), by_cat: sum('cat'), by_person: sum('person'), expenses: rows.map(r => pick(r, ['id', 'd', 'title', 'amount', 'cat', 'person'])) };
    },
  },
  {
    name: 'add_expense',
    description: `Record an expense in euros. cat is guessed from the title if omitted (${CAT_KEYS.join(', ')}). person: "yevhen" | "oleksandra".`,
    inputSchema: { type: 'object', required: ['title', 'amount'], properties: { title: { type: 'string' }, amount: { type: 'number' }, cat: { type: 'string', enum: CAT_KEYS }, person: { type: 'string' }, d: { type: 'string', description: 'YYYY-MM-DD, default today' } } },
    async run(a, s) {
      const row = { title: a.title, amount: a.amount, cat: a.cat || catOf(a.title), person: a.person || '' };
      if (a.d) row.d = a.d;
      const [r] = await s.insert('expenses', [row]);
      return { added: pick(r, ['id', 'd', 'title', 'amount', 'cat']) };
    },
  },
  {
    name: 'delete_expense',
    description: 'Delete expenses by id.',
    inputSchema: { type: 'object', required: ['ids'], properties: { ids: { type: 'array', items: { type: 'string' } } } },
    async run(a, s) { return { removed: (await s.remove('expenses', a.ids)).map(r => r.title) }; },
  },
];
