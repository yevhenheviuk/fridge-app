// MCP tools for feature: ideas (tables ideas, projects, project_notes).
import { brusselsDate, pick } from '../lib/time.js';

export default [
  {
    name: 'list_ideas',
    description: 'Raw ideas and projects (status hot|grow|cold|done) with their notes. project_id returns one project with all notes.',
    inputSchema: { type: 'object', properties: { project_id: { type: 'string' } } },
    async run(a, s) {
      if (a.project_id) {
        const [[p], notes] = await Promise.all([s.select('projects', `&id=eq.${a.project_id}`), s.select('project_notes', `&project_id=eq.${a.project_id}&order=created_at.asc`)]);
        return { project: p, notes: notes.map(n => pick(n, ['id', 'd', 'text', 'pin', 'person'])) };
      }
      const [ideas, projects, notes] = await Promise.all([s.select('ideas', '&order=created_at.desc'), s.select('projects', '&order=updated.desc'), s.select('project_notes', '&select=project_id,pin,text')]);
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
      if (a.project_id) {
        const [n] = await s.insert('project_notes', [{ project_id: a.project_id, text: a.text, person: a.person || '' }]);
        await s.update('projects', a.project_id, { updated: brusselsDate() });
        return { note: n.id };
      }
      return { idea: (await s.insert('ideas', [{ text: a.text, person: a.person || '' }]))[0].id };
    },
  },
];
