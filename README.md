# Renewals

A simple tracker for things that expire — insurance, licenses, passports, vehicle tabs — with
when each one expires and how to renew it.

**Status:** v1 — local-only, plain HTML/CSS/JS. See [PLAN.md](PLAN.md).

## Run it
Open `index.html` in a browser. Your data is stored in that browser only; use **Data → Export backup**
to save a copy.

Or serve it locally (handy for testing on your phone over Wi-Fi):
```bash
python3 -m http.server 5173
```
then visit http://localhost:5173.
