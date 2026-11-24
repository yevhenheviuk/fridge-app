# Feature: todo — ✅ Справи

Shared todos with optional due date and owner (Обоє / person). Overdue dates
in red. Done ones from the last 14 days shown below. Nav badge = due today/overdue.

**Own files:** `features/todo/*`, `worker/tools/todo.js`
**Owns table:** `todos` (title, owner, due, done, done_at)
**Read by:** calendar (due dates on the grid), push digest, Telegram 8:00 daily + weekly count
**MCP:** list_todos, add_todos, complete_todo
**XP:** +10 done, −10 when reopened.
