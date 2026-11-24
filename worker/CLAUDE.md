# worker/ — Cloudflare Worker `fridge-mcp`

| File | What | Touch when |
|---|---|---|
| `index.js` | Router + hourly cron | adding a route |
| `mcp.js` | MCP JSON-RPC server; registers `tools/*.js` | adding a tools file |
| `tools/<feature>.js` | MCP tools of one feature: `[{name, description, inputSchema, run(args, db, env)}]` | working on that feature |
| `push.js` | Web Push (VAPID), `/push/key|digest|test`, daily digest text | push / digest text |
| `telegram.js` | Bot webhook, quick input, 8:00 daily, Sunday 19:00 weekly, 🎉 closed goals | bot behaviour |
| `lib/supabase.js` | `db(env)` scoped to USER_ID (+`rpc`, `addXp`), `rest`, `meta` (table `app_meta`) | rarely |
| `lib/time.js` | Brussels date/hour, `eur`, `esc`, `pick` | rarely |

- Pure modules shared with the app are imported directly:
  `../features/finance/parse.js`, `../shared/food.js` — keep them free of DOM/Supabase.
- **Don't rename existing MCP tools** — Claude's connector and chats rely on them.
- Telegram person map: `app_meta` key `tg:<telegram user id>` → person id (`/iam yevhen`).
- Cron is hourly; `telegramHourly` decides what to send by Brussels hour, guarded by
  `daily_sent` / `weekly_sent` in `app_meta`.

Deploy: `npx wrangler deploy` from this folder. Check without deploying:
`npx wrangler deploy --dry-run --outdir /tmp/wb`.
Vars: `SUPABASE_URL USER_ID VAPID_PUBLIC APP_URL?` · secrets: `SUPABASE_KEY MCP_TOKEN VAPID_PRIVATE BOT_TOKEN`.
Telegram one-time setup after deploy: open `https://fridge-mcp.<sub>.workers.dev/tg/setup/<MCP_TOKEN>`.
