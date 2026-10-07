# Renewals Tracker — Plan

## Context
You want one place to see everything in your life that expires (auto/renters insurance, license,
passport, vehicle tabs, etc.), how soon each one expires, and exactly how to renew it.
It should end up on your phone, but v1 is local-only so we can refine how it works and looks first.

Decisions so far:
- Location: `~/code/renewals`
- Stack: plain HTML/CSS/JS, nothing to install, open `index.html` in a browser
- Reminders: in-app status colors + calendar export (.ics)
- Fields per item: provider, link, phone (plus the essentials below). No cost and no reference numbers.

## What an item looks like
| Field | Required | Example |
|---|---|---|
| Name | yes | "Civic — auto insurance" |
| Category | yes | Vehicle · Insurance · ID & Travel · Home · Other |
| Expires on | yes | 2027-03-14 |
| Renews every | no | 6 months / 1 yr / 8 yr / one-time. Used by the "Mark renewed" button |
| Remind me | yes (default 30) | Days before expiry. A passport might be ~270, tabs ~30 |
| Provider | no | "Progressive", "State DMV" |
| Renewal link | no | https://… → a one-tap **Renew ↗** button |
| Phone | no | Tap-to-call on a phone |
| Notes | no | "Need emissions test + proof of insurance" |

**Status is calculated from the date** (it's never stored), and each status gets its own color:
🔴 Expired · 🟠 Renew now (inside the item's reminder window) · 🟡 Coming up (twice the reminder window, with 30–90 days of extra lead time) · 🟢 OK

## Screens (mobile-first, also works on desktop)
1. **Dashboard**
   - Four summary tiles (Expired / Renew now / Coming up / OK). Tap one to filter by it.
   - Search box + category filter.
   - List sorted by soonest expiry. Each row shows an icon, name, provider, date, and a status pill ("in 12 days").
2. **Expanded item** (tap a row): provider, link, phone, notes, cycle, reminder,
   plus the actions **Renew ↗**, **Mark renewed** (moves the date forward one cycle and asks you to confirm first), **Edit**, **Delete**.
3. **Add / Edit form**: quick-start templates that prefill the category, cycle, and reminder
   (Auto insurance, Renters insurance, Driver's license, Passport, Vehicle tabs, Lease).
4. **Data menu**: Export backup (.json) · Import backup · Export to calendar (.ics) ·
   Load sample items · Delete all.
- Automatic light/dark theme, and a large "+ Add" button that sits where your thumb reaches on a phone.

## Storage (v1)
- The browser's `localStorage`, which is tied to this browser on this computer.
- A JSON export/import for backups. The same format becomes the import path for the phase 2 online version.

## Files
```
~/code/renewals/
  index.html    – markup
  styles.css    – styling, light/dark theme
  app.js        – data, status logic, rendering, export/import
  PLAN.md       – this plan + roadmap
```
(These are split into separate files rather than one big HTML file so they're easier to edit as we refine.)

## Roadmap after v1
- **Phase 2 — on your phone:** host the same files for free (GitHub Pages or Netlify) and add a backend
  with login so your data syncs between your PC and phone. I recommend **Supabase**: free tier,
  built-in login, and each user can only read their own rows. Then make it an installable PWA
  (a home-screen icon that also works offline).
- **Phase 3 — later ideas:** email reminders (push reminders are done), document photos, renewal history, sharing with a household member.

## Build steps (once you approve)
1. Move the session to `~/code/renewals` and copy over the draft PLAN.md, updated to match this plan.
2. Write `index.html`, `styles.css`, `app.js`.
3. Open it in the in-app browser, load the sample items, and check everything in the Verification list below.
4. Show you screenshots (desktop + phone width) so you can refine the look.

## Verification
- Add, edit, and delete items. Data is still there after a page reload.
- Status colors are right for items that are expired, due within the reminder window, coming up, and later.
- "Mark renewed" moves the date forward correctly, including month-end dates (Jan 31 + 1 mo → Feb 28/29).
- Search, category filter, and the summary-tile filters all work.
- A JSON export re-imports without losing anything. The .ics file imports into Apple/Google Calendar with alerts.
- No horizontal scrolling at phone width (375px), and dark mode is readable.
