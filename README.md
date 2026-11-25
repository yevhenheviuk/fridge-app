# Наш Дім (fridge-app)

One home app for two: fridge inventory with expiry priorities, shopping list
with staples, meal plans with kcal for two people, expenses, savings goals,
todos, calendar and an ideas → projects board. Built with AI (Claude).

- **Frontend:** static PWA on GitHub Pages (this repo root, no build step)
- **Backend:** Cloudflare Worker `fridge-mcp` + D1 database `home` (`worker/`)
- **Claude:** the same worker is a remote MCP server, so Claude can read and change everything

Every screen is a self-contained feature in `features/<id>/` — see
[CLAUDE.md](CLAUDE.md) for the map and the rules for working on one feature.

## Setup

```
cd worker
npm i
npx wrangler d1 migrations apply home --remote
npx wrangler secret put APP_PASSWORD     # the household password for the app
npx wrangler deploy
```
Other secrets: `MCP_TOKEN` (connector URL is `/mcp/<MCP_TOKEN>`), `VAPID_PRIVATE`; var `VAPID_PUBLIC`.
