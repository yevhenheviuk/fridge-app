# app/ — core (shared by every feature)

Touch this only for cross-cutting changes. Every feature depends on it, so
after a change smoke-test several features, not just one.

| File | What |
|---|---|
| `main.js` | Boot: loads features from `registry.js` (dynamic import, isolated), injects their CSS, builds nav + one `<main data-feature>` per feature, auth, render loop (rAF-debounced on data change). |
| `registry.js` | Ordered list of enabled feature ids. |
| `db.js` | Supabase client, `defineTable` live stores (`data`, `db`), `rpc`, realtime channel, `WORKER` URL. Table options: `order`, `limit`, `since`, `sort`. Two features declaring one table get one store (keep their options identical). |
| `people.js` | `profiles` row → `persons()`, `personName()`, device identity `me()/setMe()`, XP (`addXp`, `level`, table `xp`, rpc `add_xp`). |
| `core.js` | `el`, `html`, date/format helpers, `toast`, `confirmTap`, `pref/savePref` (localStorage `home.*`), the `app` hub (`app.go`, `app.call`, `app.session`). |
| `base.css` | Design tokens (light/dark) and shared components: `.hero .card .row .chk .x .btn .inp .chips .tabs .group .list .bar dialog .sheet .toast .fab`. |

Public surface used by features — keep backward compatible:
`el html $ toast errMsg confirmTap pref savePref app today iso todayIso plusDays parse daysLeft daysAgo fmtDate fmtDay ago plural pDays eur num MONTHS MONTHS_G`
`sb data db rpc WORKER defineTable`
`profiles persons personName me meOrFirst setMe partner addXp xpOf houseXp level`
