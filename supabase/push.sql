-- Renewals — push reminders. Run once in the project's SQL Editor, after schema.sql.

-- One row per device that turned on notifications. A subscription belongs to one browser on one
-- device, so turning notifications on for a phone doesn't turn them on for a computer.
create table public.push_subscriptions (
  endpoint   text primary key,
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  p256dh     text not null,
  auth       text not null,
  time_zone  text not null,  -- reminders go out at 9 AM in this time zone
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

create policy "Users manage their own push subscriptions"
  on public.push_subscriptions for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.push_subscriptions to authenticated;

-- Reminders already sent, so each one goes out once per device. Keyed on the expiry date as well,
-- so moving the date (Mark renewed, or an edit) starts the next cycle's reminders fresh.
-- Only the send-reminders function touches this table; signed-in users get no access.
create table public.push_sent (
  endpoint text not null references public.push_subscriptions on delete cascade,
  item_id  text not null,
  expires  date not null,
  stage    int  not null,  -- days before expiry: the item's remind days, 7, 1, or 0
  sent_at  timestamptz not null default now(),
  primary key (endpoint, item_id, expires, stage)
);

alter table public.push_sent enable row level security;

-- Run the send-reminders function every hour. It only sends to devices where it's 9 AM local time.
-- Needs the pg_cron and pg_net extensions (Database → Extensions), and a Vault secret named
-- reminders_cron_secret holding the same value as the function's CRON_SECRET.
select cron.schedule('send-reminders', '0 * * * *', $$
  select net.http_post(
    url := 'https://mwalbyzlcfbonuqgfule.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object('Authorization', 'Bearer ' ||
      (select decrypted_secret from vault.decrypted_secrets where name = 'reminders_cron_secret'))
  );
$$);
