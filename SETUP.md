# Renewals — setup

How the app is hosted and how its Supabase backend is configured.

## Hosting
Served by GitHub Pages from `main`; every push to `main` redeploys https://naturalanagram.github.io/renewals/.

## Run it locally
Open `index.html` in a browser. Your data is stored in that browser only; use **Data → Export backup**
to save a copy.

Or serve it locally (handy for testing on your phone over Wi-Fi):
```bash
python3 -m http.server 5173
```
then visit http://localhost:5173.

## Push reminders
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
Supabase pauses free-tier projects after 7 days without activity. Two independent pings call a tiny
`keepalive()` database function to prevent that, so if one stops the other still covers it. First,
run `supabase/keepalive.sql` in the **SQL Editor**.

**cron-job.org (main):** a free job that never expires. Create a job with:
- **URL:** `https://mwalbyzlcfbonuqgfule.supabase.co/rest/v1/rpc/keepalive`
- **Schedule:** once a day
- **Advanced:** method `POST`; headers `apikey: <the publishable key from sync.js>` and
  `Content-Type: application/json`; body `{}`
- **Notifications:** email on failure

Use **Test run** after saving; a success returns a timestamp. cron-job.org disables a job after many
failures in a row and emails you when it does.

**GitHub Actions (backup):** `.github/workflows/keepalive.yml` makes the same call every 3 days. Run it
once by hand from the repo's **Actions** tab to check it succeeds. GitHub turns off scheduled
workflows in a public repo after 60 days with no commits (it emails a warning first); re-enable it
from the Actions tab, or push any commit.
