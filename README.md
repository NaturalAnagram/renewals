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
