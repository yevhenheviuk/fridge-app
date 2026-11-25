// MCP tools — feature: finance (table expenses). Parser shared with the app.
import { EXP_CATS, catOf } from '../../features/finance/parse.js';
import { brusselsDate, daysBefore, pick } from '../lib/time.js';

const CAT_KEYS = EXP_CATS.map(c => c.k);
export default [
  {
    name: 'list_expenses',
    description: 'Expenses for the last N days (default 31), newest first, with totals per category and per person.',
    inputSchema: { type: 'object', properties: { days: { type: 'number' } } },
    async run(a, s) {
      const rows = await s.rows('expenses', 'WHERE d >= ? ORDER BY d DESC', daysBefore(a.days || 31));
      const sum = key => rows.reduce((m, r) => { const k = r[key] || '?'; m[k] = Math.round(((m[k] || 0) + r.amount) * 100) / 100; return m; }, {});
      return { total: Math.round(rows.reduce((x, r) => x + r.amount, 0) * 100) / 100, by_cat: sum('cat'), by_person: sum('person'), expenses: rows.map(r => pick(r, ['id', 'd', 'title', 'amount', 'cat', 'person'])) };
    },
  },
  {
    name: 'add_expense',
    description: `Record an expense in euros. cat is guessed from the title if omitted (${CAT_KEYS.join(', ')}). person: "yevhen" | "oleksandra".`,
    inputSchema: { type: 'object', required: ['title', 'amount'], properties: { title: { type: 'string' }, amount: { type: 'number' }, cat: { type: 'string', enum: CAT_KEYS }, person: { type: 'string' }, d: { type: 'string', description: 'YYYY-MM-DD, default today' } } },
    async run(a, s) {
      const [r] = await s.insert('expenses', [{ title: a.title, amount: a.amount, cat: a.cat || catOf(a.title), person: a.person || '', d: a.d || brusselsDate() }]);
      if (a.person) await s.addXp(a.person, 2);
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
