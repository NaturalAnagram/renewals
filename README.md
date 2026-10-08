# Renewals

A simple tracker for things that expire — insurance, licenses, passports, vehicle tabs — with
when each one expires and how to renew it.

**Status:** phase 2 — plain HTML/CSS/JS, hosted on GitHub Pages, synced with Supabase. See [PLAN.md](PLAN.md).

## Live site
https://naturalanagram.github.io/renewals/ — served by GitHub Pages from `main`; every push to `main` redeploys it.
Sign in from **Data** (an emailed sign-in link) to sync your items across devices through Supabase.
Signed out, everything is saved in that browser only.

## Run it locally
Open `index.html` in a browser. Your data is stored in that browser only; use **Data → Export backup**
to save a copy.

Or serve it locally (handy for testing on your phone over Wi-Fi):
```bash
python3 -m http.server 5173
```
then visit http://localhost:5173.

## Push reminders
Turn them on per device from **Data → Notifications** (signed in). On Android, use Chrome or the
installed app; on iPhone, the app must be installed to the Home Screen. Reminders arrive at 9 AM local
time when an item enters its "remind me" window, then 7 days, 1 day, and on the day it expires.
Marking an item renewed moves its date, so its reminders stop until the next cycle.

The reminders are sent by a Supabase Edge Function, `supabase/functions/send-reminders`, which runs
hourly. One-time setup in the Supabase dashboard:
1. **Database → Extensions:** enable `pg_cron` and `pg_net`.
2. **Edge Functions → Secrets:** add `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `CRON_SECRET` from
   `.secrets/push.env` (gitignored; never commit it), and `VAPID_SUBJECT` = `mailto:` + your email.
3. **Edge Functions → Deploy a new function → Via Editor:** name it `send-reminders`, paste in
   `supabase/functions/send-reminders/index.ts`, deploy, then turn **Verify JWT** off in its settings.
4. **Project Settings → Vault:** add a secret named `reminders_cron_secret` with the `CRON_SECRET` value.
5. **SQL Editor:** run `supabase/push.sql`.

To test without waiting for 9 AM, call the function with `?anyHour=1` and the cron secret:
```bash
curl -X POST "https://mwalbyzlcfbonuqgfule.supabase.co/functions/v1/send-reminders?anyHour=1" -H "Authorization: Bearer $(grep CRON_SECRET .secrets/push.env | cut -d= -f2)"
```

## Keeping the database awake
Supabase pauses free-tier projects after 7 days without activity. A GitHub Actions workflow,
`.github/workflows/keepalive.yml`, calls a tiny `keepalive()` database function every 3 days to
prevent that. One-time setup: run `supabase/keepalive.sql` in the **SQL Editor**, then run the
workflow once by hand from the repo's **Actions** tab to check it succeeds.

GitHub turns off scheduled workflows in a public repo after 60 days with no commits (it emails a
warning first); re-enable it from the Actions tab, or push any commit.
