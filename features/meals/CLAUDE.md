# Feature: meals — 🍽 Раціон

People cards (kcal target, goal, foods to avoid), the latest meal plan by day
with kcal per person and ✓ cooked, and per-person "what we ate" history
(confirmed = meals ticked; otherwise planned values shown greyed).

**Own files:** `features/meals/*`, `worker/tools/meals.js`
**Owns tables:** `plans` (start, title, notes, days jsonb), `profiles` (people jsonb — read app-wide via `app/people.js`)
**Writes:** `log` type `meal` when a meal is ticked
**Plan shape:** `days: [{date, meals:[{slot, name, recipe, kcal:{yevhen, oleksandra}, done}]}]`
**MCP:** get_profiles, set_profiles, get_plan, set_plan (only after the user approved the plan)

Plans are written by Claude via MCP; the app only ticks `done`.
