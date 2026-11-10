const API = '/api/attendance';
const SESSION_API = '/api/session';

const loginSection = document.getElementById('login');
const loginForm = document.getElementById('login-form');
const loginBtn = document.getElementById('login-btn');
const passwordEl = document.getElementById('password');
const logoutBtn = document.getElementById('logout-btn');
const appSection = document.getElementById('app');

const form = document.getElementById('record-form');
const formTitle = document.getElementById('form-title');
const submitBtn = document.getElementById('submit-btn');
const cancelBtn = document.getElementById('cancel-btn');
const rowsEl = document.getElementById('rows');
const emptyEl = document.getElementById('empty');
const countEl = document.getElementById('count');
const filterEl = document.getElementById('filter');
const toastEl = document.getElementById('toast');

let records = [];
let editingId = null;
let toastTimer = null;

// ---- helpers ---------------------------------------------------------------

// Sends a JSON request. A 401 from the server (not logged in, or the session
// expired) sends the user back to the login screen. Pass quiet401 to skip that.
async function request(url, options = {}) {
  const { quiet401, ...fetchOptions } = options;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...fetchOptions,
  });
  let body = null;
  try { body = await res.json(); } catch { /* empty or non-JSON body */ }
  if (!res.ok) {
    const err = new Error((body && body.error) || `Request failed (${res.status}).`);
    err.status = res.status;
    err.body = body;
    if (res.status === 401 && !quiet401) {
      err.handled = true; // the login screen already explains what happened
      showLogin('Your session has ended. Please log in again.');
    }
    throw err;
  }
  return body;
}

function reportError(err) {
  if (!err.handled) showToast(err.message, 'error');
}

function showToast(message, type = 'ok') {
  clearTimeout(toastTimer);
  toastEl.textContent = message;
  toastEl.className = `toast ${type}`;
  toastEl.hidden = false;
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, 5000);
}

function todayISO() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function isoDay(value) {
  return String(value).slice(0, 10); // stored at UTC midnight, so the first 10 chars are the date
}

function formatDay(value) {
  return new Date(`${isoDay(value)}T00:00:00Z`).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC',
  });
}

// ---- login / logout --------------------------------------------------------

function showLogin(message) {
  records = [];
  editingId = null;
  appSection.hidden = true;
  logoutBtn.hidden = true;
  loginSection.hidden = false;
  passwordEl.value = '';
  passwordEl.focus();
  if (message) showToast(message, 'error');
}

function showApp() {
  passwordEl.value = '';
  loginSection.hidden = true;
  appSection.hidden = false;
  logoutBtn.hidden = false;
  resetForm();
  loadRecords();
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginBtn.disabled = true;
  try {
    await request(SESSION_API, {
      method: 'POST',
      body: JSON.stringify({ password: passwordEl.value }),
      quiet401: true,
    });
    showApp();
  } catch (err) {
    showToast(err.message, 'error');
    passwordEl.select();
  } finally {
    loginBtn.disabled = false;
  }
});

logoutBtn.addEventListener('click', async () => {
  try {
    await request(SESSION_API, { method: 'DELETE', quiet401: true });
  } catch { /* the cookie may already be gone; show the login screen anyway */ }
  showLogin();
  showToast('You have been logged out.');
});

async function init() {
  try {
    const session = await request(SESSION_API, { quiet401: true });
    if (session && session.authenticated) {
      showApp();
      return;
    }
  } catch { /* fall through to the login screen */ }
  showLogin();
}

// ---- rendering (textContent only, so stored text can never run as HTML) -----

function cell(text) {
  const td = document.createElement('td');
  td.textContent = text;
  return td;
}

function renderRows() {
  const q = filterEl.value.trim().toLowerCase();
  const visible = q
    ? records.filter((r) =>
        [r.studentName, r.subjectName, r.section].some((v) => String(v).toLowerCase().includes(q)))
    : records;

  rowsEl.replaceChildren();

  for (const r of visible) {
    const tr = document.createElement('tr');
    if (r._id === editingId) tr.className = 'editing';

    tr.append(cell(formatDay(r.date)), cell(r.studentName), cell(r.subjectName), cell(r.section));

    const statusTd = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = `badge ${r.status}`;
    badge.textContent = r.status;
    statusTd.append(badge);
    tr.append(statusTd);

    const actionsTd = document.createElement('td');
    actionsTd.className = 'row-actions';
    for (const [action, label, extra] of [['edit', 'Edit', ''], ['delete', 'Delete', ' danger']]) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `btn small${extra}`;
      btn.dataset.action = action;
      btn.dataset.id = r._id;
      btn.textContent = label;
      actionsTd.append(btn);
    }
    tr.append(actionsTd);

    rowsEl.append(tr);
  }

  countEl.textContent = records.length ? `(${visible.length} of ${records.length})` : '';
  emptyEl.hidden = visible.length > 0;
  if (!visible.length) {
    emptyEl.textContent = records.length ? 'No records match your filter.' : 'No attendance records yet.';
  }
}

// ---- data actions ----------------------------------------------------------

async function loadRecords() {
  emptyEl.hidden = false;
  emptyEl.textContent = 'Loading records...';
  try {
    records = await request(API);
    renderRows();
  } catch (err) {
    records = [];
    renderRows();
    emptyEl.hidden = false;
    emptyEl.textContent = 'Could not load records.';
    reportError(err);
  }
}

function resetForm() {
  editingId = null;
  form.reset();
  document.getElementById('date').value = todayISO();
  formTitle.textContent = 'Add attendance record';
  submitBtn.textContent = 'Add record';
  cancelBtn.hidden = true;
  renderRows();
}

function startEdit(id) {
  const r = records.find((x) => x._id === id);
  if (!r) return;
  editingId = id;
  document.getElementById('date').value = isoDay(r.date);
  document.getElementById('studentName').value = r.studentName;
  document.getElementById('subjectName').value = r.subjectName;
  document.getElementById('section').value = r.section;
  document.getElementById('status').value = r.status;
  formTitle.textContent = 'Edit attendance record';
  submitBtn.textContent = 'Save changes';
  cancelBtn.hidden = false;
  renderRows();
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  document.getElementById('studentName').focus();
}

async function removeRecord(id) {
  const r = records.find((x) => x._id === id);
  if (!r) return;
  const ok = window.confirm(
    `Delete the record for ${r.studentName} (${r.subjectName}, ${formatDay(r.date)})?\nThis cannot be undone.`
  );
  if (!ok) return;

  try {
    await request(`${API}/${id}`, { method: 'DELETE' });
    if (editingId === id) resetForm();
    showToast('Record deleted.');
    await loadRecords();
  } catch (err) {
    reportError(err);
  }
}

function duplicateMessage(d) {
  return `${d.studentName} already has a "${d.status}" record for ${d.subjectName} on ${formatDay(d.date)}.\n\nSave this one anyway?`;
}

function save(payload, force) {
  const suffix = force ? '?force=1' : '';
  if (editingId) {
    return request(`${API}/${editingId}${suffix}`, { method: 'PUT', body: JSON.stringify(payload) });
  }
  return request(`${API}${suffix}`, { method: 'POST', body: JSON.stringify(payload) });
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;

  const payload = Object.fromEntries(new FormData(form).entries());
  const wasEditing = Boolean(editingId);

  submitBtn.disabled = true;
  try {
    try {
      await save(payload, false);
    } catch (err) {
      if (err.status !== 409 || !err.body || !err.body.duplicate) throw err;
      // Duplicate found: let the admin decide whether to save it anyway.
      if (!window.confirm(duplicateMessage(err.body.duplicate))) {
        showToast('Not saved: this looks like a duplicate.', 'error');
        return;
      }
      await save(payload, true);
    }
    showToast(wasEditing ? 'Record updated.' : 'Record added.');
    resetForm();
    await loadRecords();
  } catch (err) {
    reportError(err);
  } finally {
    submitBtn.disabled = false;
  }
});

cancelBtn.addEventListener('click', resetForm);
filterEl.addEventListener('input', renderRows);

rowsEl.addEventListener('click', (event) => {
  const btn = event.target.closest('button[data-action]');
  if (!btn) return;
  if (btn.dataset.action === 'edit') startEdit(btn.dataset.id);
  if (btn.dataset.action === 'delete') removeRecord(btn.dataset.id);
});

init();
