# Feature: goals — 🎯 Цілі

Savings goals with progress bars and contributions per person; wishlist
(«хотілки») that can be turned into a goal; closed goals section.

**Own files:** `features/goals/*`, `worker/tools/goals.js`
**Owns tables:** `goals` (emoji, title, price, saved, owner, done_at, announced), `goal_contribs` (goal_id, person, amount, d), `wishes`
**DB function:** `goal_contribute(p_goal, p_person, p_amount)` — atomic, caps at remaining, sets done_at. Always contribute through it.
**MCP:** list_goals, add_goal (wish=true for a wish), contribute_goal
**Telegram:** worker posts 🎉 with who-gave-how-much when `done_at` set and `announced=false` (hourly).
**Read by:** finance (hint), weekly digest (nearest goal).
**XP:** max(5, amount/10) per contribution, +50 when a goal closes.
