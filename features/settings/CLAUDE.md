# Feature: settings — ⚙️ Налаштування (header button, `nav: false`)

Who am I on this device (sets `home.me` → person for expenses, contributions,
notes), house level from XP, daily push reminder (hour, test), Telegram bot
cheat sheet, account email + logout.

**Own files:** `features/settings/*`
**Owns table:** `push_subscriptions` (endpoint, hour)
**Reads:** `xp` via `app/people.js`
**Server side:** `worker/push.js` (`/push/key`, `/push/test`, digest text), `sw.js` shows the notification.
iOS: push only works for the app added to the Home Screen.
