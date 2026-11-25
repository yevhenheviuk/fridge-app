# Feature: settings — ⚙️ Налаштування (header button, `nav: false`)

Who am I on this device (sets `home.me` → person for expenses, contributions,
notes), house level from XP, daily push reminder (hour, test), logout.

**Own files:** `features/settings/*`
**Owns tables:** `push_subscriptions` (endpoint, hour) via `api('/rows/push_subscriptions?eq=endpoint.…')`, `xp` (person, xp)
**Server side:** `worker/push.js` (`/push/key`, `/push/test`, digest text), `sw.js` shows the notification.
iOS: push only works for the app added to the Home Screen.
