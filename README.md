# Renewals

A simple tracker for things that expire — insurance, licenses, passports, vehicle tabs — with
when each one expires and how to renew it.

**Status:** v1 — local-only, plain HTML/CSS/JS. See [PLAN.md](PLAN.md).

## Live site
https://naturalanagram.github.io/renewals/ — served by GitHub Pages from `main`; every push to `main` redeploys it.
Data is still per-browser until sync is added (phase 2), so use **Export / Import backup** to move items between devices.

## Run it locally
Open `index.html` in a browser. Your data is stored in that browser only; use **Data → Export backup**
to save a copy.

Or serve it locally (handy for testing on your phone over Wi-Fi):
```bash
python3 -m http.server 5173
```
then visit http://localhost:5173.
