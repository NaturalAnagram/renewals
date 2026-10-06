// send-reminders: called every hour by pg_cron (see supabase/push.sql). For each device with
// notifications on where it's 9 AM local time, sends a push for every item that just reached a
// reminder point: the start of its "remind me" window, then 7 days, 1 day, and the expiry day.
// Each reminder goes out once per device (push_sent). Expired items get nothing further.
//
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:you@example.com), CRON_SECRET.
// SUPABASE_URL and SUPABASE_SECRET_KEYS are provided automatically.
// Deploy with "Verify JWT" off; the CRON_SECRET check below is what guards it.
// Add ?anyHour=1 to the URL to skip the 9 AM check when testing.

import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SEND_HOUR = 9;
const env = (name: string) => Deno.env.get(name) ?? '';

Deno.serve(async req => {
  if (req.headers.get('Authorization') !== `Bearer ${env('CRON_SECRET')}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  const anyHour = new URL(req.url).searchParams.has('anyHour');
  webpush.setVapidDetails(env('VAPID_SUBJECT'), env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'));
  const db = createClient(env('SUPABASE_URL'), secretKey());

  const { data: subs, error: subsError } = await db.from('push_subscriptions').select('*');
  if (subsError) throw subsError;
  const due = subs.filter(s => anyHour || localTime(s.time_zone).hour === SEND_HOUR);
  if (!due.length) return Response.json({ devices: 0, sent: 0 });

  const userIds = [...new Set(due.map(s => s.user_id))];
  const { data: rows, error: itemsError } = await db.from('items')
    .select('user_id, id, data').in('user_id', userIds).eq('deleted', false);
  if (itemsError) throw itemsError;
  const { data: sentRows, error: sentError } = await db.from('push_sent')
    .select('endpoint, item_id, expires, stage').in('endpoint', due.map(s => s.endpoint));
  if (sentError) throw sentError;
  const sentKey = (endpoint: string, itemId: string, expires: string, stage: number) =>
    `${endpoint} ${itemId} ${expires} ${stage}`;
  const sent = new Set(sentRows.map(r => sentKey(r.endpoint, r.item_id, r.expires, r.stage)));

  let count = 0;
  for (const sub of due) {
    const today = localTime(sub.time_zone).date;
    for (const row of rows.filter(r => r.user_id === sub.user_id)) {
      const item = row.data;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(item.expires ?? '')) continue;
      const days = daysBetween(today, item.expires);
      const stage = reminderStage(days, Number(item.remind) || 0);
      if (stage === null || sent.has(sentKey(sub.endpoint, row.id, item.expires, stage))) continue;

      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({ title: item.name, body: message(days, item), tag: row.id }),
          { TTL: 60 * 60 * 12 });
      } catch (e) {
        // 404/410: the device unsubscribed or the app was uninstalled. Stop sending to it.
        if (e.statusCode === 404 || e.statusCode === 410) {
          await db.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
          break;
        }
        console.error('Push failed', sub.endpoint, e.statusCode, e.body);
        continue;
      }
      await db.from('push_sent').insert({ endpoint: sub.endpoint, item_id: row.id, expires: item.expires, stage });
      count++;
    }
  }

  // Forget reminders for dates long past.
  await db.from('push_sent').delete().lt('expires', daysAgo(60));
  return Response.json({ devices: due.length, sent: count });
});

// A secret API key (bypasses Row Level Security, so it can read every user's items).
// SUPABASE_SECRET_KEYS is a JSON object of the project's secret keys; the legacy service role
// key is the fallback for projects that still use it.
function secretKey() {
  try {
    const keys = JSON.parse(env('SUPABASE_SECRET_KEYS'));
    const key = keys.default ?? Object.values(keys)[0];
    if (key) return key as string;
  } catch { /* not set */ }
  return env('SUPABASE_SERVICE_ROLE_KEY');
}

// Which reminder an item is at, as days before expiry, or null if it isn't due one.
// Using the closest point at or after today means a missed run (or an item added partway
// through its window) still gets one reminder, not a burst of all the ones it skipped.
function reminderStage(days: number, remind: number): number | null {
  if (days < 0 || days > remind) return null;
  const points = [remind, 7, 1, 0].filter(p => p <= remind && p >= days);
  return Math.min(...points);
}

function message(days: number, item: { expires: string; provider?: string }) {
  const date = new Date(item.expires + 'T00:00:00Z')
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const when = days === 0 ? 'Expires today'
    : days === 1 ? `Expires tomorrow (${date})`
    : `Renew now · expires in ${days} days (${date})`;
  return item.provider ? `${when} · ${item.provider}` : when;
}

// The date (YYYY-MM-DD) and hour right now in a time zone.
function localTime(timeZone: string) {
  let parts;
  try {
    parts = new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date());
  } catch {
    return localTime('UTC');
  }
  const get = (type: string) => parts.find(p => p.type === type)!.value;
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) };
}

function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000);
}

function daysAgo(n: number) {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
}
