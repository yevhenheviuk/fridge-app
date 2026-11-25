// MCP tools — feature: goals (tables goals, goal_contribs, wishes).
import { brusselsDate, pick } from '../lib/time.js';

export default [
  {
    name: 'list_goals',
    description: 'Savings goals (saved / price) with contributions per person, plus the wishlist.',
    inputSchema: { type: 'object', properties: {} },
    async run(a, s) {
      const [goals, contribs, wishes] = await Promise.all([s.rows('goals', 'ORDER BY created_at DESC'), s.rows('goal_contribs'), s.rows('wishes')]);
      return {
        goals: goals.map(g => ({ ...pick(g, ['id', 'emoji', 'title', 'price', 'saved', 'done_at']),
          by_person: contribs.filter(c => c.goal_id === g.id).reduce((m, c) => { m[c.person || '?'] = (m[c.person || '?'] || 0) + c.amount; return m; }, {}) })),
        wishes: wishes.map(w => pick(w, ['id', 'title', 'price'])),
      };
    },
  },
  {
    name: 'add_goal',
    description: 'Create a savings goal (price in euros), or a wish when wish=true (price optional).',
    inputSchema: { type: 'object', required: ['title'], properties: { title: { type: 'string' }, price: { type: 'number' }, emoji: { type: 'string' }, wish: { type: 'boolean' } } },
    async run(a, s) {
      if (a.wish) return { wish: pick((await s.insert('wishes', [{ title: a.title, price: a.price || 0 }]))[0], ['id', 'title']) };
      if (!(a.price > 0)) throw new Error('price required for a goal');
      return { goal: pick((await s.insert('goals', [{ title: a.title, price: a.price, emoji: a.emoji || '⭐' }]))[0], ['id', 'title', 'price']) };
    },
  },
  {
    name: 'contribute_goal',
    description: 'Put money into a goal (capped at what is left; closes the goal when full). person: "yevhen" | "oleksandra".',
    inputSchema: { type: 'object', required: ['goal_id', 'amount', 'person'], properties: { goal_id: { type: 'string' }, amount: { type: 'number' }, person: { type: 'string' } } },
    async run(a, s) {
      const r = await s.goalContribute(a.goal_id, a.person, a.amount, brusselsDate());
      if (r.added > 0) await s.addXp(a.person, Math.max(5, Math.round(r.added / 10)) + (r.closed ? 50 : 0));
      return r;
    },
  },
];
