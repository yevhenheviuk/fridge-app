# Feature: goals — 🎯 Цілі

Savings goals with progress bars and contributions per person; wishlist
(«хотілки») that can be turned into a goal; closed goals section.

**Own files:** `features/goals/*`, `worker/tools/goals.js`
**Owns tables:** `goals` (emoji, title, price, saved, owner, done_at), `goal_contribs` (goal_id, person, amount, d), `wishes`
**Server function:** `rpc('goal_contribute', {goal, person, amount, d})` (worker/lib/db.js) — caps at remaining, sets done_at. Always contribute through it.
**MCP:** list_goals, add_goal (wish=true for a wish), contribute_goal
**Read by:** finance (hint line).
**XP:** max(5, amount/10) per contribution, +50 when a goal closes.
