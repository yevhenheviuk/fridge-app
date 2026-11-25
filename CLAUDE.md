# Наш Дім (fridge-app)

Home app for Yevhen and Oleksandra (Sasha): fridge, shopping, meal plans,
expenses, savings goals, todos. UI language: Ukrainian.

**Stack:** static PWA on GitHub Pages (no build, ES modules) → Cloudflare Worker
`fridge-mcp` (REST API + MCP server for Claude + Web Push) → Cloudflare D1 `home`.
One household password. Everything is shared — no per-person data, except
meal plans (kcal per person).

## Work on one feature at a time

1. Find the feature in the map below and read **only** `features/<id>/CLAUDE.md`.
2. Change only that feature's files: `features/<id>/*`, `worker/tools/<id>.js`,
   and a **new** `worker/migrations/000N_<id>.sql` if tables change.
3. Don't open or edit other features, `app/`, `shared/`, `worker/*.js` unless the
   task truly needs it — then read that folder's CLAUDE.md first.
4. Other features are reached only via their public actions
   (`app.call('<id>', '<action>')`) or tables they list as readable.
   Never import from another feature's folder.

| id | Nav | Owns tables | MCP tools |
|---|---|---|---|
| `fridge` | 🧊 Запаси | items | list_items, add_items, update_item, remove_items |
| `shopping` | 🛒 Покупки | shopping, staples | get_shopping, add_shopping, remove_shopping |
| `meals` | 🍽 Раціон | plans, profiles | get_profiles, set_profiles, get_plan, set_plan |
| `finance` | 💸 Витрати | expenses | list_expenses, add_expense, delete_expense |
| `goals` | 🎯 Цілі | goals, goal_contribs, wishes | list_goals, add_goal, contribute_goal |
| `todo` | ✅ Справи | todos | list_todos, add_todos, complete_todo |
| `log` | 📜 Журнал | log | get_log |
| `settings` | ⚙️ header | push_subscriptions, xp | — (shows `settings(box)` cards of other features) |

## Adding a feature (e.g. «Рецепти»)

1. `worker/migrations/0003_recipes.sql` — tables need `id TEXT PRIMARY KEY`;
   use `BOOLEAN` / `JSON` column types for auto conversion. Nothing else to
   register: the API discovers tables from the schema.
2. `features/recipes/` — `index.js`, `style.css`, `CLAUDE.md` (copy `todo/` as the template).
3. Add `'recipes'` to `app/registry.js` (position = nav order).
4. Optional MCP tools: `worker/tools/recipes.js`, then one import line in `worker/mcp.js`.
5. Add a row to the table above.

## Feature module contract

```js
export default {
  id, icon, name, title?, nav?: false,
  tables: { todos: { order: ['created_at', false], limit?, since?: ['d', () => 'YYYY-MM-DD'] } },
  init(root) {},    // once after login: build skeleton + dialogs (inputs live here)
  render(root) {},  // on every data change while visible: update lists only
  count?(), badge?(), fab?: { label, onClick }, actions?: { … },
  settings?(box) {},  // optional card on the ⚙️ page (per-device prefs via pref/savePref)
};
```
Data: `data.<table>`, `db.<table>.add/update/remove`, `rpc(fn, args)`, `api(path)` from `app/db.js`.
Render with `el()` — never innerHTML with user data. CSS selectors start with
`[data-feature="<id>"]`. Send dates as local `todayIso()`.

## Conventions

- Dates `YYYY-MM-DD` Europe/Brussels; money in euros (REAL).
- Person ids `yevhen`, `oleksandra` exist only in meal plans (`kcal: {yevhen, oleksandra}`).
- `trig=true` items are trigger foods for Yevhen — never suggest them to him.
- Never save a meal plan the user hasn't approved.
- Repo is **public**: no personal data or secrets in commits.
- Bump `CACHE` in `sw.js` when shipping frontend changes.

## Run & deploy

- Local: `cd worker && npm i && npx wrangler d1 migrations apply home --local && npx wrangler dev`
  (`.dev.vars`: `APP_PASSWORD=…`, `MCP_TOKEN=…`), serve the repo root with any static server,
  and point `WORKER` in `app/db.js` to `http://localhost:8787` while testing (don't commit that).
- Schema: `cd worker && npx wrangler d1 migrations apply home --remote`
- Worker: `cd worker && npx wrangler deploy`
- Frontend: merge to `main` → GitHub Pages.
