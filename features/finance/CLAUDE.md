# Feature: finance — 💸 Витрати

Quick entry "назва сума" (`delhaize 47`, `кава 3,5`, `47 aldi`), auto category,
tap the icon to cycle category, month total vs last month, per-person split,
"cafe+games = X% of your nearest goal", by-category bars, recent list.

**Own files:** `features/finance/*` (incl. `parse.js`), `worker/tools/finance.js`
**Owns table:** `expenses` (title, amount, cat, d, person) — app loads last 120 days
**Reads:** `goals` (hint line only)
**`parse.js` is PURE and also used by the worker** (Telegram + MCP): `EXP_CATS`, `catOf`, `parseExpense`.
Adding shop keywords → `EXP_CATS[].w`. Renaming a category key needs a data migration.
**MCP:** list_expenses, add_expense, delete_expense
**Telegram:** private «aldi 23», group «-aldi 23» / «💸 …». Weekly digest sums the week.
**XP:** +2 per expense.
