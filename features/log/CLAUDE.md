# Feature: log — 📜 Журнал

Kitchen activity for the last 500 events, grouped by day, filter tabs, and
7-day stats: used, added, to shopping, meals cooked.

**Own files:** `features/log/*`, `worker/tools/log.js`
**Owns table:** `log` (t, type, name, cat, qty). Types: add, bought, used, shop_add, meal.
Old `tossed` rows are shown and counted as used.
**Written by:** `shared/kitchen.js logEvent()` (fridge, shopping, meals) and worker MCP tools.
**MCP:** get_log
New log type → add it to `LOGT` here and to the MCP description.
