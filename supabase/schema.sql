-- Fridge App — database schema (Supabase / Postgres)
-- Every row belongs to a user; Row Level Security makes sure
-- each user only ever sees and changes their own data.

-- Products in stock
create table items (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  name       text not null,
  qty        text not null default '',
  cat        text not null default 'other',
  zone       text not null default 'fridge',   -- fridge | freezer | pantry
  exp        date,                              -- best before; null = no date
  pinned     boolean not null default false,    -- "eat first"
  trig       boolean not null default false,    -- trigger food (not for the owner)
  added      date not null default current_date,
  created_at timestamptz not null default now()
);

-- Shopping list
create table shopping (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  name       text not null,
  qty        text not null default '',
  note       text not null default '',
  cat        text not null default 'other',
  zone       text not null default 'fridge',
  source     text not null default 'manual',    -- manual | plan
  added      date not null default current_date,
  created_at timestamptz not null default now()
);

-- Products to always keep at home
create table staples (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  name       text not null,
  cat        text not null default 'other',
  zone       text not null default 'fridge',
  created_at timestamptz not null default now()
);

-- Daily meal plans (meals stored as JSON)
create table plans (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  start      date not null,
  title      text not null default '',
  notes      text not null default '',
  days       jsonb not null default '[]',
  created_at timestamptz not null default now(),
  unique (user_id, start)
);

-- People, goals and calorie targets
create table profiles (
  user_id    uuid primary key default auth.uid() references auth.users on delete cascade,
  people     jsonb not null default '[]',
  updated_at timestamptz not null default now()
);

-- Activity log: used / tossed / bought / added ...
create table log (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  t          timestamptz not null default now(),
  type       text not null,
  name       text not null default '',
  cat        text not null default 'other',
  qty        text not null default ''
);
create index log_user_time on log (user_id, t desc);

-- API access: only logged-in users, never anonymous visitors
-- (new tables are not auto-exposed, so we grant explicitly)
grant usage on schema public to authenticated;
grant select, insert, update, delete
  on items, shopping, staples, plans, profiles, log
  to authenticated;

-- Row Level Security: only your own rows
alter table items    enable row level security;
alter table shopping enable row level security;
alter table staples  enable row level security;
alter table plans    enable row level security;
alter table profiles enable row level security;
alter table log      enable row level security;

create policy "own rows" on items    for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on shopping for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on staples  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on plans    for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on profiles for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on log      for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Live updates in the app (changes appear instantly on every device)
alter publication supabase_realtime add table items, shopping, staples, plans, profiles;
