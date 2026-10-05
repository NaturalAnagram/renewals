// Renewals — v1 (local only). Data lives in this browser's localStorage.

const STORAGE_KEY = 'renewals.v1';

const CATEGORIES = {
  vehicle:   { label: 'Vehicle',     icon: '🚗' },
  insurance: { label: 'Insurance',   icon: '🛡️' },
  id:        { label: 'ID & Travel', icon: '🪪' },
  home:      { label: 'Home',        icon: '🏠' },
  other:     { label: 'Other',       icon: '📌' },
};

// Quick-start presets for the add form. cycle is in months, remind in days.
const TEMPLATES = [
  { name: 'Auto insurance',    category: 'insurance', cycle: 6,   remind: 21 },
  { name: 'Renters insurance', category: 'insurance', cycle: 12,  remind: 21 },
  { name: "Driver's license",  category: 'id',        cycle: 96,  remind: 60 },
  { name: 'Passport',          category: 'id',        cycle: 120, remind: 270,
    url: 'https://travel.state.gov/content/travel/en/passports/have-passport/renew.html',
    notes: 'Many countries require 6+ months of validity to enter.' },
  { name: 'Vehicle tabs',      category: 'vehicle',   cycle: 12,  remind: 30 },
  { name: 'Lease',             category: 'home',      cycle: 12,  remind: 60 },
];

const STATUS_LABEL = { expired: 'Expired', soon: 'Renew now', upcoming: 'Coming up', ok: 'OK' };
const UPCOMING_DAYS = 90;
// List order: most urgent status first, then soonest expiry within each status.
const STATUS_RANK = { expired: 0, soon: 1, upcoming: 2, ok: 3 };

// Status icons, so statuses differ by shape as well as color.
const svg = body => `<svg class="si" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const STATUS_ICON = {
  expired:  svg('<path d="M8 2h8l6 6v8l-6 6H8l-6-6V8z"/><path d="M12 7v6M12 17h.01"/>'),
  soon:     svg('<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>'),
  upcoming: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  ok:       svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
};

const $ = sel => document.querySelector(sel);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 10);

let items = loadItems();
const ui = { open: null, status: '', category: '', query: '', editing: null };

// ---------- storage ----------

function loadItems() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}

function saveItems() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); }
  catch { showBanner("Couldn't save in this browser. Export a backup so you don't lose changes."); }
}

// ---------- dates (local time, day precision) ----------

function today() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function parseDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function toIso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDate(iso) {
  return parseDate(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function daysUntil(iso) {
  return Math.round((parseDate(iso) - today()) / 86400000);
}

// Adds months, clamping to the end of shorter months (Jan 31 + 1 mo → Feb 28/29).
function addMonths(iso, months) {
  const d = parseDate(iso);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return toIso(d);
}

function relative(days) {
  if (days === 0) return 'today';
  const a = Math.abs(days);
  const text = a < 60 ? `${a} day${a === 1 ? '' : 's'}`
    : a < 730 ? `${Math.round(a / 30.4)} mo`
    : `${(a / 365).toFixed(1)} yr`;
  return days < 0 ? `${text} ago` : `in ${text}`;
}

function cycleText(months) {
  if (months % 12 === 0) return `${months / 12} year${months === 12 ? '' : 's'}`;
  return `${months} month${months === 1 ? '' : 's'}`;
}

// ---------- status ----------

function statusOf(item) {
  const days = daysUntil(item.expires);
  if (days < 0) return 'expired';
  if (days <= (Number(item.remind) || 0)) return 'soon';
  if (days <= UPCOMING_DAYS) return 'upcoming';
  return 'ok';
}

// ---------- rendering ----------

function render() {
  $('#today').textContent = 'Today · ' +
    today().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  renderStats();
  renderList();
}

function renderStats() {
  const counts = { expired: 0, soon: 0, upcoming: 0, ok: 0 };
  items.forEach(it => counts[statusOf(it)]++);
  $('#stats').innerHTML = Object.keys(counts).map(key => `
    <button class="stat ${key} ${ui.status === key ? 'active' : ''}" data-status="${key}" aria-pressed="${ui.status === key}">
      <b>${counts[key]}</b><span>${STATUS_ICON[key]}${STATUS_LABEL[key]}</span>
    </button>`).join('');
}

function renderList() {
  const list = $('#list');

  if (!items.length) {
    list.innerHTML = `
      <div class="empty">
        Nothing tracked yet. Add the things in your life that expire.
        <div class="actions">
          <button class="primary" data-action="add">+ Add your first item</button>
          <button data-action="samples">Try sample items</button>
        </div>
      </div>`;
    return;
  }

  const q = ui.query.trim().toLowerCase();
  const shown = items
    .filter(it => !ui.status || statusOf(it) === ui.status)
    .filter(it => !ui.category || it.category === ui.category)
    .filter(it => !q || [it.name, it.provider, it.notes].join(' ').toLowerCase().includes(q))
    .sort((a, b) => STATUS_RANK[statusOf(a)] - STATUS_RANK[statusOf(b)] || a.expires.localeCompare(b.expires));

  if (!shown.length) {
    list.innerHTML = '<div class="empty">No items match these filters.</div>';
    return;
  }

  list.innerHTML = shown.map(renderItem).join('');
}

function renderItem(it) {
  const status = statusOf(it);
  const cat = CATEGORIES[it.category] || CATEGORIES.other;
  const open = ui.open === it.id;
  const cycle = Number(it.cycle) || 0;

  const details = [
    ['Provider', esc(it.provider)],
    ['Phone', it.phone && `<a href="tel:${esc(it.phone.replace(/[^\d+]/g, ''))}">${esc(it.phone)}</a>`],
    ['Link', it.url && `<a href="${esc(it.url)}" target="_blank" rel="noopener">${esc(it.url.replace(/^https?:\/\//, ''))}</a>`],
    ['Expires', formatDate(it.expires)],
    ['Renews', cycle ? `every ${cycleText(cycle)}` : 'one-time'],
    ['Reminder', `${Number(it.remind) || 0} days before`],
    ['Notes', esc(it.notes)],
  ].filter(([, v]) => v);

  return `
    <div class="item s-${status} ${open ? 'open' : ''}">
      <button class="row" data-toggle="${it.id}" aria-expanded="${open}">
        <div class="icon" aria-hidden="true">${cat.icon}</div>
        <div>
          <div class="name">${esc(it.name)}</div>
          <div class="meta">${esc(it.provider || cat.label)} · ${formatDate(it.expires)}</div>
        </div>
        <div class="pill">${STATUS_ICON[status]}${STATUS_LABEL[status]}<small>${relative(daysUntil(it.expires))}</small></div>
      </button>
      <div class="details">
        <dl>${details.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
        <div class="actions">
          ${it.url ? `<a class="btn primary" href="${esc(it.url)}" target="_blank" rel="noopener">Renew ↗</a>` : ''}
          ${cycle ? `<button data-renew="${it.id}">✓ Mark renewed</button>` : ''}
          <button data-edit="${it.id}">Edit</button>
          <button class="danger" data-delete="${it.id}">Delete</button>
        </div>
      </div>
    </div>`;
}

function showBanner(message) {
  $('#banner').innerHTML = message
    ? `<div class="banner"><span>${esc(message)}</span><button data-action="dismiss-banner" aria-label="Dismiss">✕</button></div>`
    : '';
}

// ---------- add / edit ----------

const form = $('#form');
const categoryOptions = Object.entries(CATEGORIES)
  .map(([key, c]) => `<option value="${key}">${c.icon} ${c.label}</option>`).join('');
form.category.innerHTML = categoryOptions;
$('#catFilter').insertAdjacentHTML('beforeend', categoryOptions);
$('#templates').innerHTML = TEMPLATES
  .map((t, i) => `<button type="button" data-template="${i}">${CATEGORIES[t.category].icon} ${esc(t.name)}</button>`)
  .join('');

function openEditor(id) {
  const existing = items.find(x => x.id === id);
  ui.editing = existing ? id : null;
  form.reset();
  $('#formTitle').textContent = existing ? 'Edit item' : 'Add item';
  $('#templates').hidden = Boolean(existing);

  const values = existing || { category: 'insurance', cycle: 12, remind: 30 };
  for (const el of form.elements) {
    if (el.name && values[el.name] != null) el.value = values[el.name];
  }
  $('#editDlg').showModal();
  form.name.focus();
}

$('#templates').addEventListener('click', e => {
  const btn = e.target.closest('[data-template]');
  if (!btn) return;
  const t = TEMPLATES[btn.dataset.template];
  form.reset();
  for (const [key, value] of Object.entries(t)) if (form[key]) form[key].value = value;
  form.expires.focus();
});

form.addEventListener('submit', e => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  data.name = data.name.trim();
  data.cycle = Number(data.cycle) || 0;
  data.remind = Number(data.remind) || 0;

  if (ui.editing) {
    Object.assign(items.find(x => x.id === ui.editing), data);
  } else {
    data.id = uid();
    items.push(data);
    ui.open = data.id;
  }
  saveItems();
  $('#editDlg').close();
  render();
});

$('#cancelEdit').addEventListener('click', () => $('#editDlg').close());

// ---------- list & filter interactions ----------

document.addEventListener('click', e => {
  const el = e.target.closest('[data-toggle],[data-edit],[data-delete],[data-renew],[data-status],[data-action]');
  if (!el) return;
  const d = el.dataset;

  if (d.toggle) {
    ui.open = ui.open === d.toggle ? null : d.toggle;
    render();
  } else if (d.edit) {
    openEditor(d.edit);
  } else if (d.delete) {
    const it = items.find(x => x.id === d.delete);
    if (confirm(`Delete "${it.name}"?`)) {
      items = items.filter(x => x.id !== d.delete);
      saveItems();
      render();
    }
  } else if (d.renew) {
    markRenewed(items.find(x => x.id === d.renew));
  } else if (d.status) {
    ui.status = ui.status === d.status ? '' : d.status;
    render();
  } else if (d.action === 'add') {
    openEditor();
  } else if (d.action === 'samples') {
    loadSamples();
  } else if (d.action === 'dismiss-banner') {
    showBanner('');
  }
});

function markRenewed(it) {
  // Roll forward one cycle from the current expiry; if it's long overdue, keep rolling until it's in the future.
  let next = addMonths(it.expires, it.cycle);
  while (daysUntil(next) < 0) next = addMonths(next, it.cycle);
  if (confirm(`Mark "${it.name}" as renewed?\n\nNew expiry: ${formatDate(next)}\n(You can edit the exact date afterwards.)`)) {
    it.expires = next;
    saveItems();
    render();
  }
}

$('#search').addEventListener('input', e => { ui.query = e.target.value; render(); });
$('#catFilter').addEventListener('change', e => { ui.category = e.target.value; render(); });
$('#addBtn').addEventListener('click', () => openEditor());

// ---------- data menu ----------

$('#menuBtn').addEventListener('click', () => $('#menuDlg').showModal());
$('#closeMenu').addEventListener('click', () => $('#menuDlg').close());

function download(filename, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

$('#exportJson').addEventListener('click', () => {
  download(`renewals-backup-${toIso(today())}.json`,
    JSON.stringify({ app: 'renewals', version: 1, exported: new Date().toISOString(), items }, null, 2),
    'application/json');
});

$('#importJson').addEventListener('click', () => $('#fileIn').click());

$('#fileIn').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const incoming = (Array.isArray(data) ? data : data.items || [])
      .filter(x => x && typeof x.name === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x.expires));
    if (!incoming.length) throw new Error('no items');

    const replace = items.length === 0 || confirm(
      `Found ${incoming.length} item(s).\n\nOK = replace your current ${items.length} item(s)\nCancel = add them to your current list`);
    const cleaned = incoming.map(x => ({ ...x, id: replace && x.id ? x.id : uid() }));
    items = replace ? cleaned : items.concat(cleaned);
    saveItems();
    render();
    $('#menuDlg').close();
  } catch {
    alert("That file doesn't look like a Renewals backup.");
  }
});

$('#exportIcs').addEventListener('click', () => {
  const upcoming = items.filter(it => daysUntil(it.expires) >= 0);
  if (!upcoming.length) return alert('No upcoming items to export.');

  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const icsText = s => String(s || '').replace(/[\\;,]/g, m => '\\' + m).replace(/\r?\n/g, '\\n');
  // Alert at 9 AM, `days` before the (all-day) expiry. Relative to the event's midnight start.
  const icsTrigger = days => days > 0 ? `-P${days - 1}DT15H` : 'PT9H';
  // RFC 5545: lines over 75 octets are folded with CRLF + space, without splitting a UTF-8 character.
  const utf8Len = s => new TextEncoder().encode(s).length;
  const fold = line => {
    const out = [];
    let cur = '', limit = 75;
    for (const ch of line) {
      if (utf8Len(cur + ch) > limit) { out.push(cur); cur = ''; limit = 74; }
      cur += ch;
    }
    out.push(cur);
    return out.join('\r\n ');
  };

  const events = upcoming.map(it => {
    const start = it.expires.replace(/-/g, '');
    const nextDay = new Date(parseDate(it.expires));
    nextDay.setDate(nextDay.getDate() + 1);
    const description = [
      it.provider && `Provider: ${it.provider}`,
      it.phone && `Phone: ${it.phone}`,
      it.url && `Renew: ${it.url}`,
      it.notes,
    ].filter(Boolean).join('\n');

    return [
      'BEGIN:VEVENT',
      `UID:${it.id}@renewals`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${start}`,
      `DTEND;VALUE=DATE:${toIso(nextDay).replace(/-/g, '')}`,
      `SUMMARY:${icsText('Expires: ' + it.name)}`,
      description && `DESCRIPTION:${icsText(description)}`,
      it.url && `URL:${it.url}`,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${icsText(`Renew ${it.name}`)}`,
      `TRIGGER:${icsTrigger(Number(it.remind) || 0)}`,
      'END:VALARM',
      'END:VEVENT',
    ].filter(Boolean).map(fold).join('\r\n');
  });

  download('renewals.ics',
    ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Renewals//EN', 'CALSCALE:GREGORIAN', ...events, 'END:VCALENDAR'].join('\r\n'),
    'text/calendar');
});

function loadSamples() {
  const inDays = n => { const d = today(); d.setDate(d.getDate() + n); return toIso(d); };
  const samples = [
    { name: 'Civic — auto insurance', category: 'insurance', expires: inDays(12), cycle: 6, remind: 21,
      provider: 'Progressive', url: 'https://www.progressive.com',
      notes: 'Compare quotes ~3 weeks before. Have VIN + current declarations page.' },
    { name: 'Renters insurance', category: 'insurance', expires: inDays(140), cycle: 12, remind: 21,
      provider: 'Lemonade', url: 'https://www.lemonade.com' },
    { name: "Driver's license", category: 'id', expires: inDays(410), cycle: 96, remind: 60,
      provider: 'State DMV', notes: 'Check if eligible to renew online; otherwise book an appointment.' },
    { name: 'Passport', category: 'id', expires: inDays(220), cycle: 120, remind: 270,
      provider: 'U.S. Dept. of State', url: 'https://travel.state.gov/content/travel/en/passports/have-passport/renew.html',
      notes: 'Need a new passport photo.' },
    { name: 'Civic — vehicle tabs', category: 'vehicle', expires: inDays(-5), cycle: 12, remind: 30,
      provider: 'State DMV', notes: 'Need proof of insurance + emissions test (if required).' },
    { name: 'Apartment lease', category: 'home', expires: inDays(75), cycle: 12, remind: 60,
      provider: 'Property manager', notes: 'Give 60 days notice if moving out.' },
  ].map(x => ({ ...x, phone: '', id: uid() }));
  items = items.concat(samples);
  saveItems();
  render();
  $('#menuDlg').close();
}

$('#loadSamples').addEventListener('click', loadSamples);

$('#clearAll').addEventListener('click', () => {
  if (!items.length) return;
  if (confirm(`Delete all ${items.length} items?\n\nExport a backup first if you want to keep them.`)) {
    items = [];
    saveItems();
    render();
    $('#menuDlg').close();
  }
});

render();
