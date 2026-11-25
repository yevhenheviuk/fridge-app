# Feature: settings — ⚙️ Налаштування (header button, `nav: false`)

Shared house level (XP), cards contributed by other features (any feature with
`settings(box)` in its index.js — e.g. fridge's long-press action), daily push
reminder (hour, test), logout.

**Own files:** `features/settings/*`
**Owns tables:** `push_subscriptions` (endpoint, hour) via `api('/rows/push_subscriptions?eq=endpoint.…')`, `xp`
**Server side:** `worker/push.js` (`/push/key`, `/push/test`, digest text), `sw.js` shows the notification.
iOS: push only works for the app added to the Home Screen.
