# app/ — core (shared by every feature)

Touch only for cross-cutting changes; every feature depends on it, so smoke-test
several features afterwards.

| File | What |
|---|---|
| `main.js` | Boot: loads features from `registry.js` (isolated dynamic imports), injects their CSS, nav, one `<main data-feature>` per feature, password login, render loop. |
| `registry.js` | Ordered list of enabled feature ids. |
| `db.js` | Worker REST client: `login/logout`, `api()`, `defineTable` live stores (`data`, `db`), `rpc`, sync = poll `/api/ver` every 15 s and reload only changed tables. `WORKER` URL. |
| `people.js` | `profiles` row 'main' → `persons()`, `personName()`, device identity `me()/setMe()`, XP (`addXp`, `level`, table `xp`). |
| `core.js` | `el`, `html`, dates/format, `toast`, `confirmTap`, `pref/savePref` (localStorage `home.*`), `app` hub (`go`, `call`, `render`, `logout`). |
| `base.css` | Tokens (light/dark) + shared components: `.hero .card .row .chk .x .btn .inp .chips .tabs .group .list .bar dialog .sheet .toast .fab`. |
