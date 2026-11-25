// MCP tools — feature: ideas (tables ideas, projects, project_notes).
import { brusselsDate, pick } from '../lib/time.js';

export default [
  {
    name: 'list_ideas',
    description: 'Raw ideas and projects (status hot|grow|cold|done) with note counts and next step. project_id returns one project with all notes.',
    inputSchema: { type: 'object', properties: { project_id: { type: 'string' } } },
    async run(a, s) {
      if (a.project_id) {
        const [p, notes] = await Promise.all([s.one('projects', 'WHERE id = ?', a.project_id), s.rows('project_notes', 'WHERE project_id = ? ORDER BY created_at', a.project_id)]);
        return { project: p, notes: notes.map(n => pick(n, ['id', 'd', 'text', 'pin', 'person'])) };
      }
      const [ideas, projects, notes] = await Promise.all([s.rows('ideas', 'ORDER BY created_at DESC'), s.rows('projects', 'ORDER BY updated DESC'), s.rows('project_notes')]);
      return {
        ideas: ideas.map(i => pick(i, ['id', 'd', 'text', 'person'])),
        projects: projects.map(p => ({ ...pick(p, ['id', 'emoji', 'title', 'status', 'updated']), notes: notes.filter(n => n.project_id === p.id).length, next_step: notes.find(n => n.project_id === p.id && n.pin)?.text || null })),
      };
    },
  },
  {
    name: 'add_idea',
    description: 'Save a raw idea, or a note into a project when project_id is given.',
    inputSchema: { type: 'object', required: ['text'], properties: { text: { type: 'string' }, project_id: { type: 'string' }, person: { type: 'string' } } },
    async run(a, s) {
      const d = brusselsDate();
      if (a.project_id) {
        const [n] = await s.insert('project_notes', [{ project_id: a.project_id, text: a.text, person: a.person || '', d }]);
        await s.update('projects', a.project_id, { updated: d });
        return { note: n.id };
      }
      return { idea: (await s.insert('ideas', [{ text: a.text, person: a.person || '', d }]))[0].id };
    },
  },
];
