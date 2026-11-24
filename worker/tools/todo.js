// MCP tools for feature: todo (table todos).
import { pick } from '../lib/time.js';

const F = ['id', 'title', 'owner', 'due', 'done'];
export default [
  {
    name: 'list_todos',
    description: 'Open todos (soonest due first). include_done=true also returns todos finished in the last 14 days.',
    inputSchema: { type: 'object', properties: { include_done: { type: 'boolean' } } },
    async run(a, s) {
      const rows = await s.select('todos', a.include_done ? '' : '&done=eq.false');
      rows.sort((x, y) => (x.due || '9').localeCompare(y.due || '9'));
      return { todos: rows.filter(r => !r.done || (r.done_at || '') >= new Date(Date.now() - 14 * 864e5).toISOString()).map(r => pick(r, F)) };
    },
  },
  {
    name: 'add_todos',
    description: 'Add todos. owner: "both" (default) | "yevhen" | "oleksandra". due: YYYY-MM-DD or omitted.',
    inputSchema: { type: 'object', required: ['todos'], properties: { todos: { type: 'array', items: { type: 'object', required: ['title'], properties: { title: { type: 'string' }, owner: { type: 'string' }, due: { type: 'string' } } } } } },
    async run(a, s) { return { added: (await s.insert('todos', a.todos.map(t => pick(t, ['title', 'owner', 'due'])))).map(r => pick(r, F)) }; },
  },
  {
    name: 'complete_todo',
    description: 'Mark a todo done (done=false to reopen).',
    inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' }, done: { type: 'boolean' } } },
    async run(a, s) {
      const done = a.done !== false;
      return { updated: (await s.update('todos', a.id, { done, done_at: done ? new Date().toISOString() : null })).map(r => pick(r, F)) };
    },
  },
];
