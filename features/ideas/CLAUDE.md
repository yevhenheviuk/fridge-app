# Feature: ideas — 💡 Ідеї

Two modes in one view:
- **List:** capture box for raw ideas, ideas inbox («У проект»), projects sorted
  by status (🔥 hot, 🌱 grow, 🧊 cold, ✅ done) with "остигає" after 7 days untouched.
- **Project:** emoji + title, status chips, pinned "next step", chat-like stream
  of notes (mine right, partner left), composer at the bottom.

**Own files:** `features/ideas/*`, `worker/tools/ideas.js`
**Owns tables:** `ideas` (text, d, person), `projects` (emoji, title, status, updated), `project_notes` (project_id, text, d, pin, person)
**Public actions:** `openProject(id)`
**MCP:** list_ideas (optionally one project with notes), add_idea (or a note with project_id)
**Telegram:** «💡 думка», «ідея: …», `/idea …` → ideas. Weekly digest lists cooling projects.
**XP:** idea +2, idea→project +5, note +1, project done +30.
Only one note per project is pinned.
