// Push reminders: turns notifications on or off for this device (Data → Notifications).
// Turning them on subscribes this browser through the service worker and saves the subscription
// to Supabase; the send-reminders function (supabase/functions) sends the reminders from there,
// so they arrive with the app closed. Each device is separate, so a phone can get reminders
// while a computer signed in to the same account doesn't.

// Public half of the VAPID key pair; the private half is a secret on the send-reminders function.
const VAPID_PUBLIC_KEY = 'BPJ5VIC7nB9sg5_IdPD6_E_OBJRljJDUySftwYH02SZ7F6bRrdEi0Rn6Fhw960-YAwu9AiD2D7oodyJPdRcEn8k';

const push = {
  supported: 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window,
  user: null,
  on: false,      // this device has a push subscription
  busy: false,
  message: '',
};

async function currentSubscription() {
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

// Saves (or refreshes) this device's subscription, including its time zone.
async function saveSubscription(sub) {
  const { keys } = sub.toJSON();
  const { error } = await sb.from('push_subscriptions').upsert({
    endpoint: sub.endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
    time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
  if (error) throw error;
}

async function enablePush() {
  if (await Notification.requestPermission() !== 'granted') return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64UrlToBytes(VAPID_PUBLIC_KEY),
  });
  try {
    await saveSubscription(sub);
  } catch (e) {
    await sub.unsubscribe();
    throw e;
  }
  push.on = true;
}

// Also called by signOut() in sync.js, while still signed in, so the server stops sending here.
async function disablePush() {
  if (!push.supported) return;
  const sub = await currentSubscription();
  if (!sub) return;
  if (push.user) {
    const { error } = await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
    if (error) throw error;
  }
  await sub.unsubscribe();
  push.on = false;
}

async function onPushUser(user) {
  push.user = user;
  renderNotifications();
  if (push.supported) {
    const sub = await currentSubscription();
    push.on = !!sub;
    // Keeps the server's copy current (e.g. after a time zone change). Ignored if offline.
    if (sub && user) saveSubscription(sub).catch(() => {});
  }
  renderNotifications();
}

function renderNotifications() {
  const el = $('#notify');
  const message = push.message ? `<p class="error">${esc(push.message)}</p>` : '';
  let body;

  if (!push.supported) {
    body = `<p class="hint">This browser can't get notifications. On a phone, install the app to your Home Screen
      and open it from there.</p>`;
  } else if (!push.user) {
    body = '<p class="hint">Sign in to get reminders on this device.</p>';
  } else if (Notification.permission === 'denied') {
    body = `<p class="hint">Notifications are blocked for this site. Allow them in your browser's site settings,
      then come back here.</p>`;
  } else if (push.on) {
    body = `
      <p class="hint">On for this device. Reminders arrive at 9 AM when an item enters its reminder window,
        then 7 days, 1 day, and on the day it expires.</p>
      <button data-push="off" ${push.busy ? 'disabled' : ''}>Turn off for this device</button>`;
  } else {
    body = `
      <p class="hint">Off for this device. Turn them on to get reminders even when the app is closed.</p>
      <button class="primary" data-push="on" ${push.busy ? 'disabled' : ''}>🔔 Turn on for this device</button>`;
  }
  el.innerHTML = `<h3>Notifications</h3>${body}${message}`;
}

$('#notify').addEventListener('click', async e => {
  const action = e.target.closest('[data-push]')?.dataset.push;
  if (!action) return;
  push.busy = true;
  push.message = '';
  renderNotifications();
  try {
    if (action === 'on') await enablePush();
    else await disablePush();
  } catch (err) {
    console.error('Notification setting failed', err);
    push.message = navigator.onLine ? "Couldn't change notifications. Try again."
      : "You're offline. Try again when you're back online.";
  } finally {
    push.busy = false;
    renderNotifications();
  }
});

function base64UrlToBytes(s) {
  const b64 = (s + '='.repeat((4 - s.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

if (sb) sb.auth.onAuthStateChange((_event, session) => setTimeout(() => onPushUser(session?.user || null)));
renderNotifications();
