# Feature: fridge — 🧊 Запаси

What's in stock (fridge / freezer / pantry), ranked by "eat first": pinned →
expiry. Hero card = the one thing to use next. Add/edit bottom sheet with
category guess, quick expiry chips, "always keep at home", trigger flag.

**Own files:** `features/fridge/*`, `worker/tools/fridge.js`
**Owns table:** `items` (name, qty, cat, zone, exp, pinned, trig, added)
**Reads/writes:** `staples` (sheet checkbox), `shopping` ("Докупити" toast), `log` via `logEvent`
**Shared deps:** `shared/food.js` (categories, guessCat), `shared/kitchen.js`
**Public actions:** `openSheet(item|null, prefill)` — shopping calls it when an item is bought.
**MCP:** list_items, add_items, update_item, remove_items (remove writes log used/tossed)
**Elsewhere:** the daily push digest lists items expiring today/tomorrow (`worker/push.js`).

Gotchas: `trig` = not for Yevhen (label uses profile `yevhen`). Status colours:
≤1 day hot, ≤4 soon, ≤7 week, else fresh. Category ids are stored in DB — don't rename.
