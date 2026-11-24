# Наш Дім (fridge-app)

One home app for Yevhen and Oleksandra (Sasha): fridge, shopping, meal plans,
expenses, savings goals, todos, calendar, ideas. UI language: Ukrainian.

Stack: static PWA (GitHub Pages, no build step, ES modules) + Supabase
(Postgres, RLS, realtime) + one Cloudflare Worker `fridge-mcp` (MCP server for
Claude, Web Push, Telegram bot). One shared Supabase login per household;
"who am I" is chosen per device (`app/people.js`).

## Rule #1: work on one feature at a time

The app is split into **features**. When a task is about one feature:

1. Read `features/<id>/CLAUDE.md` first — it is that feature's contract.
2. Change only the files it lists as its own:
   `features/<id>/*`, `worker/tools/<id>.js`, and a **new** migration in
   `supabase/migrations/` if the schema changes.
3. Don't edit other features, `app/`, `shared/` or `worker/*.js` unless the task
   really needs it. If it does, say so and read that area's CLAUDE.md first —
   those are shared and every feature depends on them.
4. Talk to another feature only through its **public actions**
   (`app.call('<id>', '<action>', …)`) or through **tables** it lists as
   readable. Never import from another feature's folder.

## Feature map

| id | Nav | Owns tables | Reads | MCP tools (`worker/tools/`) | Telegram |
|---|---|---|---|---|---|
| `fridge` | 🧊 Запаси | items | staples, shopping, log | fridge.js | daily "з'їсти сьогодні" |
| `shopping` | 🛒 Покупки | shopping, staples | items | shopping.js | «купити …» |
| `meals` | 🍽 Раціон | plans, profiles* | — | meals.js | — |
| `finance` | 💸 Витрати | expenses | goals | finance.js | «aldi 23» |
| `goals` | 🎯 Цілі | goals, goal_contribs, wishes | — | goals.js | 🎉 when closed |
| `todo` | ✅ Справи | todos | — | todo.js | daily 8:00 |
| `calendar` | 📅 Календар | events | todos | calendar.js | daily 8:00 |
| `ideas` | 💡 Ідеї | ideas, projects, project_notes | — | ideas.js | «💡 думка» |
| `log` | 📜 Журнал | log | — | log.js | — |
| `settings` | ⚙️ (header) | push_subscriptions | xp | — | — |

\* `profiles` (people, kcal goals) is read by everyone through `app/people.js`.

## Layout

```
index.html            shell only (header, nav, auth, toast) — rarely changes
app/                  core: boot, data layer, people/XP, base styles → app/CLAUDE.md
shared/food.js        food categories + guessCat (PURE: app + worker)
shared/kitchen.js     inStock / staples / shopEntries / logEvent (fridge+shopping+meals)
features/<id>/        index.js, style.css, CLAUDE.md (+ pure helpers, e.g. finance/parse.js)
worker/               Cloudflare Worker → worker/CLAUDE.md
supabase/migrations/  numbered SQL, applied by hand in Supabase SQL Editor
sw.js                 service worker (shell cache, push display)
```

## Feature module contract (`features/<id>/index.js`)

```js
export default {
  id: 'todo', icon: '✅', name: 'Справи', title?: 'Заголовок', nav?: false,
  tables: { todos: { order: ['created_at', false] } },  // core loads + keeps live
  init(root) {},     // once after login: build static skeleton/dialogs inside root
  render(root) {},   // on every data change while visible — update lists only
  count?() {},       // text right of the title
  badge?() {},       // number on the nav button
  fab?: { label, onClick },
  actions?: { … },   // public API for other features (document it!)
};
```

- Data: `data.<table>` (rows), `db.<table>.add/update/remove(...)`, `rpc(fn, args)` from `app/db.js`.
- Render with `el()` (never innerHTML with user data). `html()` is only for static markup.
- Inputs live in the skeleton built by `init`, so a re-render never wipes what someone is typing.
- CSS goes in `features/<id>/style.css`, every selector prefixed with `[data-feature="<id>"]`.
  Dialogs appended to `<body>` carry `data-feature="<id>"` too. Shared components → `app/base.css`.
- A feature that throws is isolated by `app/main.js`; the rest of the app keeps working.

## Adding a feature

1. `features/<id>/index.js`, `style.css`, `CLAUDE.md` (copy a small one like `todo`).
2. Add the id to `app/registry.js` (order = nav order).
3. New tables → `supabase/migrations/NNN_<id>.sql` (user_id + RLS "own rows" + grant +
   realtime publication — copy the pattern from 003).
4. Optional MCP tools → `worker/tools/<id>.js` and register it in `worker/mcp.js`.
5. Add a row to the feature map above.

## Conventions

- Dates `YYYY-MM-DD`, Europe/Brussels. Money is euros, `numeric` in DB → wrap with `Number()`.
- Person ids: `yevhen`, `oleksandra`; `owner: 'both'` = shared.
- `trig=true` items are trigger foods for Yevhen — never suggest them to him.
- Never save a meal plan the user hasn't approved.
- The repo is **public**: no personal data, secrets or Telegram ids in commits.
- Bump `CACHE` in `sw.js` when shipping frontend changes.

## Test locally

No build. Serve the folder (`npx serve .`) and open it; Supabase is live data,
so prefer a test account. Syntax check: `node --check <file>`.
Worker bundle check: `cd worker && npx wrangler deploy --dry-run`.

## Deploy

- Frontend: merge to `main` → GitHub Pages.
- Worker: `cd worker && npx wrangler deploy` (vars/secrets stay in the dashboard).
- Schema: run the new `supabase/migrations/NNN_*.sql` in Supabase → SQL Editor.
