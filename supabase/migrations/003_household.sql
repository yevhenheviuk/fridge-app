-- 003 — household features ported from nash-domik:
-- goals + wishes, expenses, todos, calendar events, ideas + projects, XP.
-- Run once in Supabase → SQL Editor. Same rules as 001: every row belongs
-- to the (shared) login, RLS keeps it private.
-- "person" / "owner" columns hold a profile id from profiles.people
-- ('yevhen', 'oleksandra') or 'both'.

-- ---------- goals (feature: goals) ----------
create table goals (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  emoji      text not null default '⭐',
  title      text not null,
  price      numeric(12,2) not null check (price > 0),
  saved      numeric(12,2) not null default 0,
  owner      text not null default 'both',
  done_at    timestamptz,
  announced  boolean not null default false,          -- worker posted 🎉 to Telegram
  created_at timestamptz not null default now()
);
create table goal_contribs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  goal_id    uuid not null references goals on delete cascade,
  person     text not null default '',
  amount     numeric(12,2) not null check (amount > 0),
  d          date not null default current_date,
  created_at timestamptz not null default now()
);
create table wishes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  title      text not null,
  price      numeric(12,2) not null default 0,
  owner      text not null default 'both',
  created_at timestamptz not null default now()
);

-- ---------- expenses (feature: finance) ----------
create table expenses (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  title      text not null,
  amount     numeric(12,2) not null check (amount > 0),
  cat        text not null default 'other',           -- see features/finance/parse.js
  d          date not null default current_date,
  person     text not null default '',
  created_at timestamptz not null default now()
);
create index expenses_user_d on expenses (user_id, d desc);

-- ---------- todos (feature: todo) ----------
create table todos (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  title      text not null,
  owner      text not null default 'both',
  due        date,
  done       boolean not null default false,
  done_at    timestamptz,
  created_at timestamptz not null default now()
);

-- ---------- events (feature: calendar) ----------
create table events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  title      text not null,
  d          date not null,
  h          text check (h is null or h ~ '^\d{2}:\d{2}$'),   -- 'HH:MM', null = all day
  created_at timestamptz not null default now()
);

-- ---------- ideas & projects (feature: ideas) ----------
create table ideas (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  text       text not null,
  d          date not null default current_date,
  person     text not null default '',
  created_at timestamptz not null default now()
);
create table projects (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  emoji      text not null default '💡',
  title      text not null,
  status     text not null default 'hot' check (status in ('hot','grow','cold','done')),
  updated    date not null default current_date,
  created_at timestamptz not null default now()
);
create table project_notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  project_id uuid not null references projects on delete cascade,
  text       text not null,
  d          date not null default current_date,
  pin        boolean not null default false,          -- "next step"
  person     text not null default '',
  created_at timestamptz not null default now()
);

-- ---------- XP (app core: app/people.js) ----------
create table xp (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  person  text not null,
  xp      int  not null default 0,
  primary key (user_id, person)
);

-- ---------- worker-only settings (Telegram group, person map) ----------
-- RLS on, no policies: only the worker's secret key can read/write it.
create table app_meta (k text primary key, v text);
alter table app_meta enable row level security;

-- ---------- access ----------
grant select, insert, update, delete
  on goals, goal_contribs, wishes, expenses, todos, events, ideas, projects, project_notes, xp
  to authenticated;
alter table goals         enable row level security;
alter table goal_contribs enable row level security;
alter table wishes        enable row level security;
alter table expenses      enable row level security;
alter table todos         enable row level security;
alter table events        enable row level security;
alter table ideas         enable row level security;
alter table projects      enable row level security;
alter table project_notes enable row level security;
alter table xp            enable row level security;
create policy "own rows" on goals         for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on goal_contribs for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on wishes        for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on expenses      for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on todos         for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on events        for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on ideas         for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on projects      for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on project_notes for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on xp            for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- functions ----------
-- Atomic XP bump. The app calls it as the user; the worker passes p_user.
create function add_xp(p_person text, p_n int, p_user uuid default auth.uid())
returns void language sql security invoker as $$
  insert into xp (user_id, person, xp) values (p_user, p_person, greatest(p_n, 0))
  on conflict (user_id, person) do update set xp = greatest(0, xp.xp + p_n);
$$;

-- Atomic goal contribution: caps at the remaining amount, closes the goal.
create function goal_contribute(p_goal uuid, p_person text, p_amount numeric)
returns json language plpgsql security invoker as $$
declare g goals; v_add numeric; v_closed boolean;
begin
  select * into g from goals where id = p_goal for update;
  if not found then raise exception 'goal not found'; end if;
  v_add := least(p_amount, g.price - g.saved);
  if v_add <= 0 then return json_build_object('added', 0, 'saved', g.saved, 'price', g.price, 'closed', true); end if;
  v_closed := g.saved + v_add >= g.price - 0.001;
  update goals set saved = saved + v_add, done_at = case when v_closed then now() else null end where id = g.id;
  insert into goal_contribs (user_id, goal_id, person, amount) values (g.user_id, g.id, p_person, v_add);
  return json_build_object('added', v_add, 'saved', g.saved + v_add, 'price', g.price, 'closed', v_closed);
end $$;

grant execute on function add_xp(text, int, uuid), goal_contribute(uuid, text, numeric) to authenticated;

-- ---------- live updates ----------
alter publication supabase_realtime add table
  goals, goal_contribs, wishes, expenses, todos, events, ideas, projects, project_notes, xp, log;
