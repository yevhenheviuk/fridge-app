# Feature: log — 📜 Журнал

Kitchen activity for the last 500 events, grouped by day, filter tabs, and
7-day stats: used, tossed, added, "вчасно" % (used / (used+tossed)).

**Own files:** `features/log/*`, `worker/tools/log.js`
**Owns table:** `log` (t, type, name, cat, qty). Types: add, bought, used, tossed, shop_add, meal.
**Written by:** `shared/kitchen.js logEvent()` (fridge, shopping, meals), worker tools and Telegram «купити».
**MCP:** get_log
New log type → add it to `LOGT` here and to the MCP description.
