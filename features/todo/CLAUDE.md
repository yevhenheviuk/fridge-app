# Feature: todo — ✅ Справи

Shared todos with optional due date. Overdue dates
in red. Done ones from the last 14 days shown below. Nav badge = due today/overdue.

**Own files:** `features/todo/*`, `worker/tools/todo.js`
**Owns table:** `todos` (title, due, done, done_at; `owner` unused)
**Read by:** push digest
**MCP:** list_todos, add_todos, complete_todo
**XP:** +10 done, −10 when reopened.
