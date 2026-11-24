-- Daily push notifications: one row per device subscription
create table push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  endpoint   text not null unique,
  hour       int  not null default 21 check (hour between 0 and 23),  -- Europe/Brussels
  created_at timestamptz not null default now()
);
alter table push_subscriptions enable row level security;
create policy "own rows" on push_subscriptions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on push_subscriptions to authenticated, service_role;
