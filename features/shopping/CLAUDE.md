# Feature: shopping — 🛒 Покупки

Shopping list grouped by food category + "always at home" staples. A staple
that is not in stock appears in the list automatically (virtual row, id `st-…`).
Quick add accepts several items separated by commas. ○ = bought → opens the
fridge sheet ("Купив — куди поклав?") so it lands in stock.

**Own files:** `features/shopping/*`, `worker/tools/shopping.js`
**Owns tables:** `shopping` (name, qty, note, cat, zone, source manual|plan), `staples`
**Reads:** `items` (in-stock check)
**Shared deps:** `shared/kitchen.js` (`shopEntries`, `inStock`, `stapleFor`, `logEvent`), `shared/food.js`
**Calls:** `app.call('fridge', 'openSheet', null, entry)`
**MCP:** get_shopping, add_shopping (source "plan" from meal plans), remove_shopping
**Telegram:** «купити молоко, хліб» / `/buy …` → rows here (worker/telegram.js)
