# worker/ — Cloudflare Worker `fridge-mcp` + D1 `home`

| File | What | Touch when |
|---|---|---|
| `tools/<feature>.js` | MCP tools of one feature: `[{name, description, inputSchema, run(args, db, env)}]` | working on that feature |
| `migrations/000N_*.sql` | D1 schema, one new file per change (never edit applied ones) | tables change |
| `mcp.js` | MCP JSON-RPC server; imports every `tools/*.js` | adding a tools file |
| `api.js` | App REST API (`/api/login`, `/api/rows/:t`, `/api/ver`, `/api/rpc/*`) | new server-side function |
| `lib/db.js` | D1 layer: `rows/one/insert/update/remove/removeWhere`, `addXp`, `goalContribute`, versions | rarely |
| `push.js` | Web Push + daily digest text | push / digest |
| `index.js` | Router + hourly cron | new route |

- Tables/columns are discovered via `PRAGMA table_info`; `BOOLEAN` → true/false, `JSON` → objects.
  Tables starting with `_` (`_meta`, `_ver`) are internal and not exposed.
- Every write bumps `_ver` → the app reloads that table. Raw SQL writes in tools must go through `db` helpers.
- Pure modules shared with the app are imported directly (`../features/finance/parse.js`, `../shared/food.js`).
- **Don't rename existing MCP tools** — Claude's connector relies on them.

Secrets: `APP_PASSWORD`, `MCP_TOKEN`, `VAPID_PRIVATE`. Var: `VAPID_PUBLIC`. Binding: `DB`.
