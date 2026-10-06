// Sync: mirrors this browser's items to Supabase when signed in, so every device shares one list.
// The app stays local-first — it reads and writes localStorage as before, and this file merges
// with the server in the background (after each change, when the tab regains focus, and when
// the device comes back online). The newest change to each item wins; deletes sync too.

// The publishable key is meant to be public: Row Level Security (supabase/schema.sql) is what
// keeps each account's rows private.
const SUPABASE_URL = 'https://mwalbyzlcfbonuqgfule.supabase.co';
const SUPABASE_KEY = 'sb_publishable__3lh7CGRK6ysdCLcVw7W-A_XFXcuBN6';
const OWNER_KEY = 'renewals.v1.owner';  // which account the items in this browser belong to

const sb = window.supabase?.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { flowType: 'implicit', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

const sync = {
  user: null,
  step: 'email',       // sign-in form step: 'email' → 'sent'
  email: '',
  message: '',         // error shown in the account section
  status: '',          // header indicator: syncing | synced | offline | error
  version: 0,          // bumped on every local change
  syncedVersion: 0,    // version last confirmed on the server
  running: null,       // promise of the sync in progress
  again: false,
  timer: null,
};

// ---------- sync ----------

// Called by saveItems() in app.js after every local change.
function queueSync() {
  sync.version++;
  clearTimeout(sync.timer);
  if (sync.user) sync.timer = setTimeout(syncNow, 800);
}

async function syncNow() {
  if (!sb || !sync.user) return;
  if (sync.running) { sync.again = true; return sync.running; }
  sync.running = (async () => {
    do { sync.again = false; await syncOnce(); } while (sync.again);
  })();
  try { await sync.running; } finally { sync.running = null; }
}

async function syncOnce() {
  if (!navigator.onLine) { setStatus('offline'); return; }
  setStatus('syncing');
  const version = sync.version;
  const userId = sync.user.id;

  try {
    const { data: rows, error } = await sb.from('items').select('id, data, updated_at, deleted');
    if (error) throw error;

    const time = s => Date.parse(s) || 0;
    const remote = new Map(rows.map(r => [r.id, r]));
    const local = new Map(items.map(it => [it.id, it]));
    const ids = new Set([...remote.keys(), ...local.keys(), ...Object.keys(deleted)]);
    const merged = [];
    const push = [];

    for (const id of ids) {
      const l = local.get(id);
      const r = remote.get(id);
      const localTime = l ? time(l.updatedAt) : id in deleted ? time(deleted[id]) : -1;
      const remoteTime = r ? time(r.updated_at) : -1;

      if (localTime > remoteTime) {
        if (l) {
          merged.push(l);
          push.push({ user_id: userId, id, data: l, updated_at: l.updatedAt, deleted: false });
        } else {
          push.push({ user_id: userId, id, data: {}, updated_at: deleted[id], deleted: true });
        }
      } else if (r && !r.deleted) {
        merged.push({ ...r.data, id, updatedAt: r.updated_at });
      }
    }

    if (push.length) {
      const { error } = await sb.from('items').upsert(push, { onConflict: 'user_id,id' });
      if (error) throw error;
    }

    // If something changed locally while we were talking to the server, leave it alone;
    // the follow-up run merges it.
    if (sync.version !== version) { sync.again = true; return; }
    items = merged;
    deleted = {};
    saveItems({ fromSync: true });
    sync.syncedVersion = version;
    setStatus('synced');
    render();
  } catch (e) {
    console.error('Sync failed', e);
    setStatus(navigator.onLine ? 'error' : 'offline');
  }
}

function setStatus(status) {
  sync.status = status;
  renderSyncState();
}

// ---------- account ----------

if (sb) {
  // Supabase recommends not awaiting its own calls inside this callback, hence the setTimeout.
  sb.auth.onAuthStateChange((_event, session) => setTimeout(() => onUser(session?.user || null)));
}

function onUser(user) {
  const signedIn = user && user.id !== sync.user?.id;
  sync.user = user;
  if (signedIn) {
    // Items left behind by a different account don't belong in this one.
    const owner = localStorage.getItem(OWNER_KEY);
    if (owner && owner !== user.id) {
      items = [];
      deleted = {};
      saveItems({ fromSync: true });
      render();
    }
    localStorage.setItem(OWNER_KEY, user.id);
    sync.step = 'email';
    sync.message = '';
    syncNow();
  }
  if (!user) sync.status = '';
  renderAccount();
  renderSyncState();
}

// Emails a one-time sign-in link. Opening it loads the app already signed in (detectSessionInUrl).
async function sendLink(email) {
  sync.message = '';
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: location.origin + location.pathname },
  });
  if (error) {
    sync.message = /rate limit/i.test(error.message)
      ? 'Too many sign-in emails were sent recently. Wait a few minutes and try again.'
      : error.message;
  } else {
    sync.email = email;
    sync.step = 'sent';
  }
  renderAccount();
}

async function signOut() {
  if (!confirm('Sign out?\n\nYour items stay in your account and are removed from this device.')) return;
  clearTimeout(sync.timer);
  await syncNow();
  if (sync.version !== sync.syncedVersion &&
      !confirm("Some changes on this device haven't synced yet and will be lost. Sign out anyway?")) return;
  await sb.auth.signOut({ scope: 'local' });
  items = [];
  deleted = {};
  localStorage.removeItem(OWNER_KEY);
  saveItems({ fromSync: true });
  render();
}

// ---------- rendering ----------

function renderSyncState() {
  const text = !sync.user ? ''
    : { syncing: 'Syncing…', synced: '✓ Synced', offline: 'Offline · saved on this device',
        error: "Couldn't sync · will retry" }[sync.status] || '';
  $('#syncState').textContent = text ? ` · ${text}` : '';
}

function renderAccount() {
  const el = $('#account');
  const message = sync.message ? `<p class="error">${esc(sync.message)}</p>` : '';

  if (!sb) {
    el.innerHTML = `<p class="hint">Sync isn't available right now, so everything is saved in this browser only.
      Export a backup now and then.</p>`;
  } else if (sync.user) {
    el.innerHTML = `
      <p class="hint">Signed in as <b>${esc(sync.user.email)}</b>. Your items sync across your devices.</p>
      <div class="actions">
        <button data-sync="now">↻ Sync now</button>
        <button data-sync="signout">Sign out</button>
      </div>`;
  } else if (sync.step === 'sent') {
    el.innerHTML = `
      <p class="hint">We emailed a sign-in link to <b>${esc(sync.email)}</b>. Open it in this browser to finish
        signing in. It can take a minute to arrive, so check your spam folder too.</p>
      <button class="link" data-sync="restart">Use a different email or send a new link</button>`;
  } else {
    el.innerHTML = `
      <p class="hint">Saved in this browser only. Sign in to sync your items across your devices.</p>
      <form class="signin" data-sync-form="email">
        <input name="email" type="email" autocomplete="email" required placeholder="you@example.com"
          aria-label="Email" value="${esc(sync.email)}">
        <button class="primary">Email me a sign-in link</button>
      </form>
      ${message}`;
  }
}

$('#account').addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.target;
  const button = form.querySelector('button');
  button.disabled = true;
  try {
    await sendLink(form.email.value.trim());
  } finally {
    button.disabled = false;
  }
});

$('#account').addEventListener('click', e => {
  const action = e.target.closest('[data-sync]')?.dataset.sync;
  if (action === 'now') syncNow();
  else if (action === 'signout') signOut();
  else if (action === 'restart') { sync.step = 'email'; sync.message = ''; renderAccount(); }
});

document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncNow(); });
window.addEventListener('online', syncNow);
window.addEventListener('offline', () => setStatus('offline'));

renderAccount();
