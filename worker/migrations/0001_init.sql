-- D1 schema for Наш Дім. One household, no per-user rows.
-- Column types matter: BOOLEAN columns come back as true/false and JSON
-- columns are parsed automatically by worker/lib/db.js.
-- New feature tables → a new file 000N_<feature>.sql, then:
--   cd worker && npx wrangler d1 migrations apply home --remote

-- ===== fridge =====
CREATE TABLE items (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  qty        TEXT NOT NULL DEFAULT '',
  cat        TEXT NOT NULL DEFAULT 'other',
  zone       TEXT NOT NULL DEFAULT 'fridge',      -- fridge | freezer | pantry
  exp        TEXT,                                 -- best before YYYY-MM-DD
  pinned     BOOLEAN NOT NULL DEFAULT 0,          -- eat first
  trig       BOOLEAN NOT NULL DEFAULT 0,          -- trigger food (not for Yevhen)
  added      TEXT NOT NULL DEFAULT (date('now')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- ===== shopping =====
CREATE TABLE shopping (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  qty        TEXT NOT NULL DEFAULT '',
  note       TEXT NOT NULL DEFAULT '',
  cat        TEXT NOT NULL DEFAULT 'other',
  zone       TEXT NOT NULL DEFAULT 'fridge',
  source     TEXT NOT NULL DEFAULT 'manual',      -- manual | plan
  added      TEXT NOT NULL DEFAULT (date('now')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE staples (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  cat        TEXT NOT NULL DEFAULT 'other',
  zone       TEXT NOT NULL DEFAULT 'fridge',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- ===== meals =====
CREATE TABLE plans (
  id         TEXT PRIMARY KEY,
  start      TEXT NOT NULL UNIQUE,
  title      TEXT NOT NULL DEFAULT '',
  notes      TEXT NOT NULL DEFAULT '',
  days       JSON NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE profiles (                             -- single row, id = 'main'
  id         TEXT PRIMARY KEY,
  people     JSON NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- ===== log =====
CREATE TABLE log (
  id   TEXT PRIMARY KEY,
  t    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  type TEXT NOT NULL,                              -- add bought used tossed shop_add meal
  name TEXT NOT NULL DEFAULT '',
  cat  TEXT NOT NULL DEFAULT 'other',
  qty  TEXT NOT NULL DEFAULT ''
);
CREATE INDEX log_t ON log (t DESC);

-- ===== settings =====
CREATE TABLE push_subscriptions (
  id         TEXT PRIMARY KEY,
  endpoint   TEXT NOT NULL UNIQUE,
  hour       INTEGER NOT NULL DEFAULT 21 CHECK (hour BETWEEN 0 AND 23),  -- Europe/Brussels
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE xp (person TEXT PRIMARY KEY, xp INTEGER NOT NULL DEFAULT 0);

-- ===== goals =====
CREATE TABLE goals (
  id         TEXT PRIMARY KEY,
  emoji      TEXT NOT NULL DEFAULT '⭐',
  title      TEXT NOT NULL,
  price      REAL NOT NULL CHECK (price > 0),
  saved      REAL NOT NULL DEFAULT 0,
  owner      TEXT NOT NULL DEFAULT 'both',
  done_at    TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE goal_contribs (
  id         TEXT PRIMARY KEY,
  goal_id    TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  person     TEXT NOT NULL DEFAULT '',
  amount     REAL NOT NULL CHECK (amount > 0),
  d          TEXT NOT NULL DEFAULT (date('now')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE wishes (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  price      REAL NOT NULL DEFAULT 0,
  owner      TEXT NOT NULL DEFAULT 'both',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- ===== finance =====
CREATE TABLE expenses (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  amount     REAL NOT NULL CHECK (amount > 0),
  cat        TEXT NOT NULL DEFAULT 'other',
  d          TEXT NOT NULL DEFAULT (date('now')),
  person     TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX expenses_d ON expenses (d DESC);

-- ===== todo =====
CREATE TABLE todos (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  owner      TEXT NOT NULL DEFAULT 'both',
  due        TEXT,
  done       BOOLEAN NOT NULL DEFAULT 0,
  done_at    TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- ===== calendar =====
CREATE TABLE events (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  d          TEXT NOT NULL,
  h          TEXT,                                 -- 'HH:MM', null = all day
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- ===== ideas =====
CREATE TABLE ideas (
  id         TEXT PRIMARY KEY,
  text       TEXT NOT NULL,
  d          TEXT NOT NULL DEFAULT (date('now')),
  person     TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE projects (
  id         TEXT PRIMARY KEY,
  emoji      TEXT NOT NULL DEFAULT '💡',
  title      TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'hot' CHECK (status IN ('hot','grow','cold','done')),
  updated    TEXT NOT NULL DEFAULT (date('now')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE project_notes (
  id         TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  text       TEXT NOT NULL,
  d          TEXT NOT NULL DEFAULT (date('now')),
  pin        BOOLEAN NOT NULL DEFAULT 0,          -- next step
  person     TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- ===== internal (not exposed by the API) =====
CREATE TABLE _meta (k TEXT PRIMARY KEY, v TEXT);
CREATE TABLE _ver (t TEXT PRIMARY KEY, v INTEGER NOT NULL DEFAULT 0);  -- bumped on every write → app polls
