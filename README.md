# Наш Дім (fridge-app)

One home app for two: fridge inventory with expiry priorities, shopping list
with staples, meal plans with kcal for two people, expenses, savings goals,
todos, calendar and an ideas → projects board. Built with AI (Claude).
PWA + Supabase + Cloudflare Worker (MCP server for Claude, Web Push, Telegram bot).

Every screen is a self-contained feature in `features/<id>/` — see
[CLAUDE.md](CLAUDE.md) for the map and the rules for working on one feature.

## Setup

1. Supabase → SQL Editor: run `supabase/migrations/*.sql` in order (skip ones already applied).
2. Worker: `cd worker && npx wrangler deploy`; set vars/secrets listed in `worker/index.js`.
3. Telegram (optional): add secret `BOT_TOKEN`, open `/tg/setup/<MCP_TOKEN>` on the worker,
   add the bot to your group, write `/bind` there and `/iam <your id>` to the bot.
4. Frontend: GitHub Pages from `main`.
