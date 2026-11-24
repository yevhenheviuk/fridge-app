// MCP tools for feature: meals (tables plans, profiles).
import { pick } from '../lib/time.js';

export default [
  {
    name: 'get_profiles',
    description: 'Get the people the meals are planned for: goals, daily kcal targets and foods to avoid.',
    inputSchema: { type: 'object', properties: {} },
    async run(a, s) { return { people: (await s.select('profiles'))[0]?.people || [] }; },
  },
  {
    name: 'set_profiles',
    description: 'Replace the people list. Each person: {id, name, goal, kcal, avoid}. Ids used in meal kcal: "yevhen", "oleksandra".',
    inputSchema: { type: 'object', required: ['people'], properties: { people: { type: 'array', items: { type: 'object' } } } },
    async run(a, s) { await s.upsert('profiles', [{ people: a.people, updated_at: new Date().toISOString() }], 'user_id'); return { ok: true }; },
  },
  {
    name: 'get_plan',
    description: 'Get the meal plan starting on a date (YYYY-MM-DD). Without a date returns the latest plans.',
    inputSchema: { type: 'object', properties: { start: { type: 'string' } } },
    async run(a, s) {
      const rows = a.start ? await s.select('plans', `&start=eq.${a.start}`) : await s.select('plans', '&order=start.desc&limit=3');
      return { plans: rows.map(r => pick(r, ['id', 'start', 'title', 'notes', 'days'])) };
    },
  },
  {
    name: 'set_plan',
    description: 'Create or replace a meal plan. days: [{date, meals:[{slot, name, recipe, kcal:{yevhen, oleksandra}, done:false}]}]. Only after the user approved it.',
    inputSchema: { type: 'object', required: ['start', 'days'], properties: { start: { type: 'string' }, title: { type: 'string' }, notes: { type: 'string' }, days: { type: 'array', items: { type: 'object' } } } },
    async run(a, s) {
      const rows = await s.upsert('plans', [{ start: a.start, title: a.title || '', notes: a.notes || '', days: a.days }], 'user_id,start');
      return { saved: rows.map(r => ({ id: r.id, start: r.start })) };
    },
  },
];
