const API = '/api/attendance';

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

async function request(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  let body = null;
  try { body = await res.json(); } catch { /* empty or non-JSON body */ }
  if (!res.ok) {
    const err = new Error((body && body.error) || `Request failed (${res.status}).`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
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
    showToast(err.message, 'error');
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
    showToast(err.message, 'error');
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
    showToast(err.message, 'error');
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

resetForm();
loadRecords();
