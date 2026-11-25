# Feature: fridge — 🧊 Запаси

What's in stock (fridge / freezer / pantry), ranked by "eat first": pinned →
expiry. Hero card = the one thing to use next. Add/edit bottom sheet with
category guess, quick expiry chips, "always keep at home", trigger flag.

Gestures on a row (`swipeable()`): swipe → = used + back on the shopping list,
swipe ← = used, long press = action chosen in ⚙️ (`HOLD`: ±days to expiry, clear
date, toggle eat-first, open editor; pref `fridge.hold`, default +1). Tap = edit,
✓ = used. Every "used" toast has «Повернути» (undo). There is no "tossed".

**Own files:** `features/fridge/*`, `worker/tools/fridge.js`
**Owns table:** `items` (name, qty, cat, zone, exp, pinned, trig, added)
**Reads/writes:** `staples` (sheet checkbox), `shopping` (swipe →), `log` via `logEvent`
**Shared deps:** `shared/food.js` (categories, guessCat), `shared/kitchen.js`
**Public actions:** `openSheet(item|null, prefill)` — shopping calls it when an item is bought.
**Settings card:** `settings(box)` — long-press action picker.
**MCP:** list_items, add_items, update_item, remove_items (= used; `add_to_shopping` optional)
**Elsewhere:** the daily push digest lists items expiring today/tomorrow (`worker/push.js`).

Gotchas: `trig` = not for Yevhen (label uses profile `yevhen`). Status colours:
≤1 day hot, ≤4 soon, ≤7 week, else fresh. Category ids are stored in DB — don't rename.
