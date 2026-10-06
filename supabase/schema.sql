-- Renewals — Supabase schema. Run once in the project's SQL Editor.

-- One row per tracked item. The item itself is stored as JSON, the same shape as the
-- app's backup file, so new fields later don't need database changes.
create table public.items (
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  id         text not null,
  data       jsonb not null,
  updated_at timestamptz not null default now(),
  deleted    boolean not null default false,  -- deletes are marked, so they sync to other devices
  primary key (user_id, id)
);

-- Row Level Security: each signed-in user can only see and change their own rows.
alter table public.items enable row level security;

create policy "Users manage their own items"
  on public.items for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- New tables aren't exposed to the Data API automatically, so grant signed-in users access.
-- Signed-out visitors (anon) get nothing.
grant select, insert, update, delete on public.items to authenticated;
