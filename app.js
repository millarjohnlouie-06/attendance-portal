const API = '/api/attendance';
const SESSION_API = '/api/session';
const USERS_API = '/api/users';
const AUDIT_API = '/api/audit';
const EXPORT_API = '/api/export';

const loginSection = document.getElementById('login');
const loginForm = document.getElementById('login-form');
const loginBtn = document.getElementById('login-btn');
const usernameEl = document.getElementById('username');
const passwordEl = document.getElementById('password');
const logoutBtn = document.getElementById('logout-btn');
const userChip = document.getElementById('user-chip');
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

const tabButtons = document.querySelectorAll('.tab');
const panelRecords = document.getElementById('panel-records');
const panelSheet = document.getElementById('panel-sheet');
const panelUsers = document.getElementById('panel-users');
const tabUsersBtn = document.getElementById('tab-btn-users');
const panelAudit = document.getElementById('panel-audit');
const tabAuditBtn = document.getElementById('tab-btn-audit');
const panelMe = document.getElementById('panel-me');
const tabsNav = document.querySelector('.tabs');

const meNameEl = document.getElementById('me-name');
const meSubjectEl = document.getElementById('me-subject');
const meTilesEl = document.getElementById('me-tiles');
const meRateEl = document.getElementById('me-rate');
const meRowsEl = document.getElementById('me-rows');
const meEmptyEl = document.getElementById('me-empty');

const exportFromEl = document.getElementById('export-from');
const exportToEl = document.getElementById('export-to');
const exportXlsxBtn = document.getElementById('export-xlsx');
const exportPdfBtn = document.getElementById('export-pdf');

const auditGroupEl = document.getElementById('audit-group');
const auditActorEl = document.getElementById('audit-actor');
const auditRowsEl = document.getElementById('audit-rows');
const auditEmptyEl = document.getElementById('audit-empty');
const auditCountEl = document.getElementById('audit-count');
const auditMoreBtn = document.getElementById('audit-more');

const newStudentFieldEl = document.getElementById('new-student-field');
const newStudentEl = document.getElementById('new-student');

const userForm = document.getElementById('user-form');
const newUsernameEl = document.getElementById('new-username');
const newPasswordEl = document.getElementById('new-password');
const newRoleEl = document.getElementById('new-role');
const userAddBtn = document.getElementById('user-add-btn');
const usersRowsEl = document.getElementById('users-rows');
const usersEmptyEl = document.getElementById('users-empty');
const usersCountEl = document.getElementById('users-count');

const sheetSetup = document.getElementById('sheet-setup');
const sheetSectionEl = document.getElementById('sheet-section');
const sheetSubjectEl = document.getElementById('sheet-subject');
const sheetDateEl = document.getElementById('sheet-date');
const sheetLoadBtn = document.getElementById('sheet-load-btn');
const sheetChangeBtn = document.getElementById('sheet-change-btn');
const sheetRoster = document.getElementById('sheet-roster');
const sheetNoteEl = document.getElementById('sheet-note');
const sheetSummaryEl = document.getElementById('sheet-summary');
const sheetRowsEl = document.getElementById('sheet-rows');
const sheetEmptyEl = document.getElementById('sheet-empty');
const sheetAddForm = document.getElementById('sheet-add-form');
const sheetAddNames = document.getElementById('sheet-add-names');
const sheetSaveBtn = document.getElementById('sheet-save-btn');
const sheetAllPresent = document.getElementById('sheet-all-present');

const STATUSES = ['Present', 'Absent', 'Late', 'Excused'];

let currentUser = null; // { _id, username, role } while logged in
let users = []; // accounts, loaded only for admins
let records = [];
let editingId = null;
let toastTimer = null;
let sheet = null; // { section, subject, date, rows: [{ studentName, status }], dirty } once a class is loaded
let auditItems = []; // audit log entries loaded so far (admin only)
let auditNext = null; // marker for the next (older) page, or null when there is no more
let auditSeq = 0; // bumped on every request so a slow, outdated response can be ignored

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

const isAdmin = () => Boolean(currentUser) && currentUser.role === 'admin';
const isStudent = () => Boolean(currentUser) && currentUser.role === 'student';
const roleLabel = (role) => role.charAt(0).toUpperCase() + role.slice(1);

function showLogin(message) {
  currentUser = null;
  records = [];
  users = [];
  auditSeq += 1; // ignore any audit request still on its way
  auditItems = [];
  auditNext = null;
  editingId = null;
  closeSheet();
  userForm.reset();
  syncRoleFields();
  selectTab('records');
  appSection.hidden = true;
  logoutBtn.hidden = true;
  userChip.hidden = true;
  tabsNav.hidden = false;
  tabUsersBtn.hidden = true;
  tabAuditBtn.hidden = true;
  loginSection.hidden = false;
  usernameEl.value = '';
  passwordEl.value = '';
  usernameEl.focus();
  if (message) showToast(message, 'error');
}

function showApp(user) {
  currentUser = user;
  passwordEl.value = '';
  loginSection.hidden = true;
  appSection.hidden = false;
  logoutBtn.hidden = false;
  userChip.textContent = `${user.username} · ${roleLabel(user.role)}`;
  userChip.hidden = false;
  toastEl.hidden = true; // do not carry a message (such as "logged out") over from the last person
  tabsNav.hidden = isStudent(); // a student only has the one "My attendance" view
  tabUsersBtn.hidden = !isAdmin();
  tabAuditBtn.hidden = !isAdmin();
  selectTab('records'); // a student is sent to "My attendance" by selectTab
  sheetDateEl.value = todayISO();
  resetForm();
  loadRecords();
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginBtn.disabled = true;
  try {
    const session = await request(SESSION_API, {
      method: 'POST',
      body: JSON.stringify({ username: usernameEl.value, password: passwordEl.value }),
      quiet401: true,
    });
    showApp(session.user);
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
    if (session && session.authenticated && session.user) {
      showApp(session.user);
      return;
    }
  } catch { /* fall through to the login screen */ }
  showLogin();
}

// ---- rendering (textContent only, so stored text can never run as HTML) -----

function cell(text, label) {
  const td = document.createElement('td');
  if (label) td.dataset.label = label;
  td.textContent = text;
  return td;
}

function renderRows() {
  const q = filterEl.value.trim().toLowerCase();
  let visible = q
    ? records.filter((r) =>
        [r.studentName, r.subjectName, r.section].some((v) => String(v).toLowerCase().includes(q)))
    : records.slice();
  if (sort.key) {
    const f = (r) => (sort.key === 'date' ? isoDay(r.date) : String(r[sort.key]).toLowerCase());
    visible.sort((x, y) => (f(x) < f(y) ? -sort.dir : f(x) > f(y) ? sort.dir : 0));
  }
  document.querySelectorAll('#panel-records th[data-sort]').forEach((th) =>
    th.setAttribute('aria-sort', th.dataset.sort === sort.key ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'));

  rowsEl.replaceChildren();

  for (const r of visible) {
    const tr = document.createElement('tr');
    if (r._id === editingId) tr.className = 'editing';

    tr.append(cell(formatDay(r.date), 'Date'), cell(r.studentName, 'Student'), cell(r.subjectName, 'Subject'), cell(r.section, 'Section'));

    const statusTd = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = `badge ${r.status}`;
    badge.textContent = r.status;
    statusTd.dataset.label = 'Status';
    statusTd.append(badge);
    tr.append(statusTd);

    const actionsTd = document.createElement('td');
    actionsTd.className = 'row-actions';
    // Teachers can add and edit; only admins get the Delete button (the server enforces this too).
    const actions = [['edit', 'Edit', '']];
    if (isAdmin()) actions.push(['delete', 'Delete', ' danger']);
    for (const [action, label, extra] of actions) {
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

  renderTiles(visible);
  countEl.textContent = records.length ? `(${visible.length} of ${records.length})` : '';
  emptyEl.hidden = visible.length > 0;
  if (!visible.length) {
    emptyEl.textContent = records.length ? 'No records match your filter.' : 'No records yet. Add one above, or mark a whole class on the Class sheet tab.';
  }
}

// ---- data actions ----------------------------------------------------------

async function loadRecords() {
  emptyEl.hidden = true;
  rowsEl.replaceChildren(...Array.from({ length: 5 }, skelRow));
  try {
    records = await request(API);
    renderRows();
    refreshSuggestions();
    pickReportDay();
    renderReports();
    if (isStudent()) renderMe();
  } catch (err) {
    records = [];
    renderRows();
    emptyEl.hidden = false;
    emptyEl.textContent = 'Could not load records.';
    if (isStudent()) renderMe();
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
  const ok = await ask(
    `Delete the record for ${r.studentName} (${r.subjectName}, ${formatDay(r.date)})?\nThis cannot be undone.`, 'Delete', true
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
  return `Possible duplicate\n${d.studentName} already has a "${d.status}" record for ${d.subjectName} on ${formatDay(d.date)}.\nSave this one anyway?`;
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
      if (!(await ask(duplicateMessage(err.body.duplicate), 'Save anyway'))) {
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

// ---- tabs ------------------------------------------------------------------

function selectTab(name) {
  if ((name === 'users' || name === 'audit') && !isAdmin()) name = 'records'; // admin only
  name = isStudent() ? 'me' : (name === 'me' ? 'records' : name); // students see only their own page
  panelRecords.hidden = name !== 'records';
  panelSheet.hidden = name !== 'sheet';
  panelReports.hidden = name !== 'reports';
  panelUsers.hidden = name !== 'users';
  panelAudit.hidden = name !== 'audit';
  panelMe.hidden = name !== 'me';
  if (name === 'reports') renderReports();
  if (name === 'users') loadUsers();
  if (name === 'audit') loadAudit(true);
  for (const btn of tabButtons) {
    const active = btn.dataset.tab === name;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', String(active));
  }
}

for (const btn of tabButtons) {
  btn.addEventListener('click', () => selectTab(btn.dataset.tab));
}

// ---- accounts (admin only) -------------------------------------------------

async function loadUsers() {
  try {
    users = await request(USERS_API);
    renderUsers();
  } catch (err) {
    users = [];
    renderUsers();
    reportError(err);
  }
}

function renderUsers() {
  usersRowsEl.replaceChildren();
  for (const u of users) {
    const tr = document.createElement('tr');
    const you = currentUser && u._id === currentUser._id;
    tr.append(
      cell(you ? `${u.username} (you)` : u.username, 'Username'),
      cell(u.role === 'student' && u.studentName ? `Student · ${u.studentName}` : roleLabel(u.role), 'Role'),
      cell(formatDay(u.createdAt), 'Created')
    );

    const actionsTd = document.createElement('td');
    actionsTd.className = 'row-actions';
    if (you) { // you cannot delete your own account
      actionsTd.append(Object.assign(document.createElement('span'), { className: 'muted', textContent: '—' }));
    } else {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn small danger';
      btn.dataset.id = u._id;
      btn.textContent = 'Delete';
      actionsTd.append(btn);
    }
    tr.append(actionsTd);
    usersRowsEl.append(tr);
  }
  usersCountEl.textContent = users.length ? `(${users.length})` : '';
  usersEmptyEl.hidden = users.length > 0;
}

userForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!userForm.reportValidity()) return;

  userAddBtn.disabled = true;
  try {
    const created = await request(USERS_API, {
      method: 'POST',
      body: JSON.stringify({
        username: newUsernameEl.value,
        password: newPasswordEl.value,
        role: newRoleEl.value,
        studentName: newRoleEl.value === 'student' ? newStudentEl.value : undefined,
      }),
    });
    showToast(`Account "${created.username}" created.`);
    userForm.reset();
    syncRoleFields();
    await loadUsers();
  } catch (err) {
    reportError(err);
  } finally {
    userAddBtn.disabled = false;
  }
});

// Only student accounts need the student's name.
function syncRoleFields() {
  const student = newRoleEl.value === 'student';
  newStudentFieldEl.hidden = !student;
  newStudentEl.required = student;
}
newRoleEl.addEventListener('change', syncRoleFields);

usersRowsEl.addEventListener('click', async (event) => {
  const btn = event.target.closest('button[data-id]');
  if (!btn) return;
  const u = users.find((x) => x._id === btn.dataset.id);
  if (!u) return;
  const ok = await ask(`Delete the account "${u.username}"?\nThey will no longer be able to log in. Their attendance records are kept.`, 'Delete', true);
  if (!ok) return;
  try {
    await request(`${USERS_API}/${u._id}`, { method: 'DELETE' });
    showToast('Account deleted.');
    await loadUsers();
  } catch (err) {
    reportError(err);
  }
});

// ---- my attendance (student view, read only) ---------------------------------

function renderMe() {
  // Show the name as it is written in the records (the account may have been typed in lower case).
  const shownName = (records[0] && records[0].studentName) || (currentUser && currentUser.studentName) || '';
  meNameEl.textContent = shownName ? `· ${shownName}` : '';

  const subjects = [...new Set(records.map((r) => r.subjectName))].sort((a, b) => a.localeCompare(b));
  const keep = meSubjectEl.value;
  meSubjectEl.replaceChildren(new Option('All subjects', ''), ...subjects.map((s) => new Option(s, s)));
  meSubjectEl.value = subjects.includes(keep) ? keep : '';

  const list = meSubjectEl.value ? records.filter((r) => r.subjectName === meSubjectEl.value) : records;
  renderTiles(list, meTilesEl);
  const pct = rate(list);
  meRateEl.textContent = pct === null ? '' : `Attendance rate: ${pct}%. Present and Late count as attended; Excused is left out.`;

  meRowsEl.replaceChildren();
  for (const r of list) {
    const tr = document.createElement('tr');
    tr.append(cell(formatDay(r.date), 'Date'), cell(r.subjectName, 'Subject'), cell(r.section, 'Section'));
    const statusTd = document.createElement('td');
    statusTd.dataset.label = 'Status';
    const badge = document.createElement('span');
    badge.className = `badge ${r.status}`;
    badge.textContent = r.status;
    statusTd.append(badge);
    tr.append(statusTd);
    meRowsEl.append(tr);
  }
  meEmptyEl.hidden = list.length > 0;
  meEmptyEl.textContent = records.length
    ? 'No records for this subject.'
    : 'No attendance has been recorded for you yet.';
}

meSubjectEl.addEventListener('change', renderMe);

// ---- export to Excel / PDF -----------------------------------------------------

async function downloadExport(format) {
  const params = new URLSearchParams({ format });
  const q = filterEl.value.trim();
  if (q) params.set('q', q);
  if (exportFromEl.value) params.set('from', exportFromEl.value);
  if (exportToEl.value) params.set('to', exportToEl.value);
  if (sort.key) { // same order as the table on screen
    params.set('sort', sort.key);
    params.set('dir', String(sort.dir));
  }

  const buttons = [exportXlsxBtn, exportPdfBtn];
  for (const b of buttons) b.disabled = true;
  showToast('Preparing your file...');
  try {
    const res = await fetch(`${EXPORT_API}?${params}`);
    if (!res.ok) {
      if (res.status === 401) {
        showLogin('Your session has ended. Please log in again.');
        return;
      }
      let message = `Export failed (${res.status}).`;
      try { message = (await res.json()).error || message; } catch { /* not JSON */ }
      throw new Error(message);
    }
    const blob = await res.blob();
    const named = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '');
    const url = URL.createObjectURL(blob);
    const link = Object.assign(document.createElement('a'), { href: url, download: named ? named[1] : `attendance.${format}` });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    showToast('Your download has started.');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    for (const b of buttons) b.disabled = false;
  }
}

exportXlsxBtn.addEventListener('click', () => downloadExport('xlsx'));
exportPdfBtn.addEventListener('click', () => downloadExport('pdf'));

// ---- audit log (admin only) ----------------------------------------------------

// Loads the first page (reset) or the next, older page.
async function loadAudit(reset) {
  const seq = ++auditSeq;
  const params = new URLSearchParams({ limit: '50' });
  if (auditGroupEl.value) params.set('group', auditGroupEl.value);
  if (auditActorEl.value) params.set('actor', auditActorEl.value);
  if (!reset && auditNext) params.set('before', auditNext);
  auditMoreBtn.disabled = true;
  try {
    const page = await request(`${AUDIT_API}?${params}`);
    if (seq !== auditSeq) return; // a newer request (or a logout) replaced this one
    auditItems = reset ? page.items : [...auditItems, ...page.items];
    auditNext = page.nextBefore;
    if (page.actors) fillAuditActors(page.actors);
    renderAudit();
  } catch (err) {
    if (seq === auditSeq) reportError(err);
  } finally {
    auditMoreBtn.disabled = false;
  }
}

function fillAuditActors(actors) {
  const keep = auditActorEl.value;
  auditActorEl.replaceChildren(new Option('Everyone', ''), ...actors.map((a) => new Option(a, a)));
  auditActorEl.value = actors.includes(keep) ? keep : '';
}

function renderAudit() {
  auditRowsEl.replaceChildren();
  for (const e of auditItems) {
    const tr = document.createElement('tr');

    const when = cell(new Date(e.at).toLocaleString(), 'When');
    when.className = 'audit-when';

    const who = cell(e.actor ? `${e.actor}${e.actorRole ? ` (${e.actorRole})` : ''}` : 'System', 'Who');

    const what = document.createElement('td');
    what.className = 'audit-what';
    what.dataset.label = 'What happened';
    what.append(document.createTextNode(e.summary));
    if (e.details) {
      const box = document.createElement('details');
      box.className = 'audit-details';
      const label = document.createElement('summary');
      label.textContent = 'Details';
      const pre = document.createElement('pre');
      pre.textContent = JSON.stringify(e.details, null, 2);
      box.append(label, pre);
      what.append(box);
    }

    tr.append(when, who, what);
    auditRowsEl.append(tr);
  }
  auditCountEl.textContent = auditItems.length ? `(${auditItems.length}${auditNext ? '+' : ''} shown)` : '';
  auditEmptyEl.hidden = auditItems.length > 0;
  auditMoreBtn.hidden = !auditNext;
}

auditGroupEl.addEventListener('change', () => loadAudit(true));
auditActorEl.addEventListener('change', () => loadAudit(true));
auditMoreBtn.addEventListener('click', () => loadAudit(false));

// ---- class sheet -----------------------------------------------------------

const same = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

// Offer the sections and subjects already in the database so names stay consistent.
function refreshSuggestions() {
  const fill = (id, values) => {
    const list = document.getElementById(id);
    list.replaceChildren();
    for (const v of [...new Set(values)].sort((a, b) => a.localeCompare(b))) {
      const opt = document.createElement('option');
      opt.value = v;
      list.append(opt);
    }
  };
  fill('section-list', records.map((r) => r.section));
  fill('subject-list', records.map((r) => r.subjectName));
  fill('student-list', records.map((r) => r.studentName)); // for the student-name field when adding an account
}

function setSheetLocked(locked) {
  for (const el of [sheetSectionEl, sheetSubjectEl, sheetDateEl]) el.disabled = locked;
  sheetLoadBtn.hidden = locked;
  sheetChangeBtn.hidden = !locked;
}

function closeSheet() {
  sheet = null;
  sheetRoster.hidden = true;
  sheetRowsEl.replaceChildren();
  sheetAddNames.value = '';
  setSheetLocked(false);
}

// Builds the roster: every student seen in this section, with the status already
// saved for this subject and date, or Present by default.
function openSheet(section, subject, date) {
  const known = [];
  for (const r of records) {
    if (same(r.section, section) && !known.some((n) => same(n, r.studentName))) known.push(r.studentName);
  }
  known.sort((a, b) => a.localeCompare(b));

  let alreadySaved = 0;
  const rows = known.map((studentName) => {
    const existing = records.find((r) =>
      same(r.studentName, studentName) && same(r.subjectName, subject) && isoDay(r.date) === date);
    if (existing) alreadySaved += 1;
    return { studentName, status: existing ? existing.status : 'Present' };
  });

  sheet = { section, subject, date, rows, dirty: false, alreadySaved };
  setSheetLocked(true);
  sheetRoster.hidden = false;
  renderSheet();
}

function renderSheet() {
  if (!sheet) return;
  sheetRowsEl.replaceChildren();

  sheet.rows.forEach((row, i) => {
    const tr = document.createElement('tr');
    tr.append(cell(String(i + 1)), cell(row.studentName));
    tr.children[0].className = 'num';

    const statusTd = document.createElement('td');
    statusTd.className = 'wide';
    const group = document.createElement('div');
    group.className = 'seg';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', `Status for ${row.studentName}`);
    for (const status of STATUSES) {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.index = String(i);
      b.dataset.status = status;
      b.className = `seg-btn ${status}${status === row.status ? ' on' : ''}`;
      b.setAttribute('aria-pressed', String(status === row.status));
      b.textContent = status;
      group.append(b);
    }
    statusTd.append(group);
    tr.append(statusTd);

    const removeTd = document.createElement('td');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn small';
    btn.dataset.remove = String(i);
    btn.textContent = 'Remove';
    btn.title = 'Remove from this sheet only. Saved records are not deleted.';
    removeTd.append(btn);
    tr.append(removeTd);

    sheetRowsEl.append(tr);
  });

  sheetEmptyEl.hidden = sheet.rows.length > 0;
  sheetSaveBtn.disabled = sheet.rows.length === 0;
  sheetAllPresent.disabled = sheet.rows.length === 0;

  sheetNoteEl.textContent =
    `${sheet.subject} \u00b7 ${sheet.section} \u00b7 ${formatDay(sheet.date)}. ` +
    (sheet.alreadySaved
      ? `${sheet.alreadySaved} student(s) already have a record for this date and subject; saving updates them.`
      : 'No records for this date and subject yet.');
  renderSummary();
}

function renderSummary() {
  sheetSummaryEl.replaceChildren();
  for (const status of STATUSES) {
    const badge = document.createElement('span');
    badge.className = `badge ${status}`;
    badge.textContent = `${status}: ${sheet.rows.filter((r) => r.status === status).length}`;
    sheetSummaryEl.append(badge);
  }
}

sheetSetup.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!sheetSetup.reportValidity()) return;
  const section = sheetSectionEl.value.trim().replace(/\s+/g, ' ');
  const subject = sheetSubjectEl.value.trim().replace(/\s+/g, ' ');
  if (!section || !subject) {
    showToast('Enter a section and a subject.', 'error');
    return;
  }
  openSheet(section, subject, sheetDateEl.value);
});

sheetChangeBtn.addEventListener('click', async () => {
  if (sheet && sheet.dirty && !(await ask('Discard unsaved changes?\nThe statuses you changed have not been saved.', 'Discard', true))) return;
  closeSheet();
});

sheetRowsEl.addEventListener('click', (event) => {
  const seg = event.target.closest('button[data-status]');
  if (seg && sheet) {
    sheet.rows[Number(seg.dataset.index)].status = seg.dataset.status;
    sheet.dirty = true;
    for (const b of seg.parentElement.children) {
      b.classList.toggle('on', b === seg);
      b.setAttribute('aria-pressed', String(b === seg));
    }
    renderSummary();
    return;
  }
  const btn = event.target.closest('button[data-remove]');
  if (!btn || !sheet) return;
  sheet.rows.splice(Number(btn.dataset.remove), 1);
  sheet.dirty = true;
  renderSheet();
});

sheetAllPresent.addEventListener('click', () => {
  if (!sheet) return;
  for (const row of sheet.rows) row.status = 'Present';
  sheet.dirty = true;
  renderSheet();
});

sheetAddForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!sheet) return;
  const names = sheetAddNames.value.split(/\r?\n/).map((n) => n.trim().replace(/\s+/g, ' ')).filter(Boolean);
  if (!names.length) {
    showToast('Type at least one student name.', 'error');
    return;
  }
  let added = 0;
  let skipped = 0;
  for (const name of names) {
    if (name.length > 100 || sheet.rows.some((r) => same(r.studentName, name))) {
      skipped += 1;
      continue;
    }
    sheet.rows.push({ studentName: name, status: 'Present' });
    added += 1;
  }
  sheetAddNames.value = '';
  if (added) sheet.dirty = true;
  renderSheet();
  showToast(
    `${added} student(s) added.${skipped ? ` ${skipped} skipped (already on the sheet or too long).` : ''}`,
    added ? 'ok' : 'error'
  );
});

sheetSaveBtn.addEventListener('click', async () => {
  if (!sheet || !sheet.rows.length) return;
  const { section, subject, date, rows } = sheet;
  const ok = await ask(`Save attendance for ${rows.length} student(s)?\n${subject}, ${section}, ${formatDay(date)}`, 'Save sheet');
  if (!ok) return;

  sheetSaveBtn.disabled = true;
  try {
    const result = await request(`${API}/bulk`, {
      method: 'POST',
      body: JSON.stringify({
        date,
        subjectName: subject,
        section,
        entries: rows.map((r) => ({ studentName: r.studentName, status: r.status })),
      }),
    });
    showToast(`Sheet saved: ${result.created} new, ${result.updated} updated.`);
    sheet.dirty = false;
    await loadRecords();
    if (sheet) { // still open (not logged out meanwhile)
      sheet.alreadySaved = rows.length;
      renderSheet();
    }
  } catch (err) {
    reportError(err);
  } finally {
    sheetSaveBtn.disabled = !sheet || sheet.rows.length === 0;
  }
});

// ---- dialogs, tiles, sorting, reports, theme --------------------------------

const dlg = document.getElementById('dlg');
const dlgTitle = document.getElementById('dlg-title');
const dlgMsg = document.getElementById('dlg-msg');
const dlgOk = document.getElementById('dlg-ok');
const panelReports = document.getElementById('panel-reports');
const tilesEl = document.getElementById('tiles');
const repGroup = document.getElementById('rep-group');
const repDate = document.getElementById('rep-date');
const repBars = document.getElementById('rep-bars');
const repDonut = document.getElementById('rep-donut');
const repLegend = document.getElementById('rep-legend');
const themeBtn = document.getElementById('theme-btn');
let sort = { key: null, dir: 1 };
let repDateTouched = false;

// First line of the message is the title, the rest is the detail.
function ask(message, okLabel = 'Confirm', danger = false) {
  const [title, ...rest] = message.split('\n');
  dlgTitle.textContent = title;
  dlgMsg.textContent = rest.join('\n').trim();
  dlgMsg.hidden = !dlgMsg.textContent;
  dlgOk.textContent = okLabel;
  dlgOk.className = `btn ${danger ? 'danger' : 'primary'}`;
  dlg.returnValue = 'cancel';
  return new Promise((resolve) => {
    dlg.addEventListener('close', () => resolve(dlg.returnValue === 'ok'), { once: true });
    dlg.showModal();
  });
}

function skelRow() {
  const tr = document.createElement('tr');
  for (let i = 0; i < 6; i += 1) {
    const td = document.createElement('td');
    td.append(Object.assign(document.createElement('span'), { className: 'skel' }));
    tr.append(td);
  }
  return tr;
}

function renderTiles(list, target = tilesEl) {
  target.replaceChildren();
  for (const s of ['Total', ...STATUSES]) {
    const tile = document.createElement('div');
    tile.className = `tile ${s}`;
    const num = document.createElement('b');
    num.textContent = s === 'Total' ? list.length : list.filter((r) => r.status === s).length;
    const label = document.createElement('span');
    label.textContent = s;
    tile.append(num, label);
    target.append(tile);
  }
}

document.querySelector('#panel-records thead').addEventListener('click', (event) => {
  const th = event.target.closest('th[data-sort]');
  if (!th) return;
  sort = sort.key === th.dataset.sort ? { key: sort.key, dir: -sort.dir } : { key: th.dataset.sort, dir: 1 };
  renderRows();
});

function rate(list) {
  const counted = list.filter((r) => r.status !== 'Excused').length;
  const attended = list.filter((r) => r.status === 'Present' || r.status === 'Late').length;
  return counted ? Math.round((attended / counted) * 100) : null;
}

// Show today if it has records, otherwise the most recent day that does.
function pickReportDay() {
  if (repDateTouched) return;
  const days = records.map((r) => isoDay(r.date)).sort();
  repDate.value = days.includes(todayISO()) || !days.length ? todayISO() : days[days.length - 1];
}

function renderReports() {
  const key = repGroup.value;
  const groups = new Map();
  for (const r of records) groups.set(r[key], [...(groups.get(r[key]) || []), r]);
  repBars.replaceChildren();
  [...groups]
    .map(([name, list]) => ({ name, pct: rate(list), n: list.length }))
    .filter((g) => g.pct !== null)
    .sort((x, y) => y.pct - x.pct)
    .forEach((g) => {
      const row = document.createElement('div');
      row.className = 'bar-row';
      const name = Object.assign(document.createElement('span'), { className: 'bar-name', textContent: g.name, title: `${g.name}: ${g.n} records` });
      const track = Object.assign(document.createElement('div'), { className: 'bar-track' });
      const fill = Object.assign(document.createElement('div'), { className: 'bar-fill' });
      fill.style.width = `${g.pct}%`;
      track.append(fill);
      row.append(name, track, Object.assign(document.createElement('span'), { textContent: `${g.pct}%` }));
      repBars.append(row);
    });
  document.getElementById('rep-bars-empty').hidden = repBars.children.length > 0;

  const day = records.filter((r) => isoDay(r.date) === repDate.value);
  document.getElementById('rep-donut-empty').hidden = day.length > 0;
  repDonut.hidden = repLegend.hidden = !day.length;
  repLegend.replaceChildren();
  let from = 0;
  const stops = [];
  for (const s of STATUSES) {
    const n = day.filter((r) => r.status === s).length;
    stops.push(`var(--c-${s}) ${(from / day.length) * 100}% ${((from + n) / day.length) * 100}%`);
    from += n;
    const li = document.createElement('li');
    const dot = document.createElement('i');
    dot.style.setProperty('--tc', `var(--c-${s})`);
    li.append(dot, `${s}: ${n}`);
    repLegend.append(li);
  }
  repDonut.style.background = day.length ? `conic-gradient(${stops.join(',')})` : '';
  repDonut.dataset.total = day.length;
  repDonut.setAttribute('aria-label', `${day.length} records on ${repDate.value}`);
}

repGroup.addEventListener('change', renderReports);
repDate.addEventListener('input', () => { repDateTouched = true; renderReports(); });

function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  themeBtn.textContent = t === 'dark' ? 'Light mode' : 'Dark mode';
  themeBtn.setAttribute('aria-label', t === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
}
themeBtn.addEventListener('click', () => {
  const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem('theme', t); } catch { /* private mode: the choice just won't persist */ }
  applyTheme(t);
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
  try { if (localStorage.getItem('theme')) return; } catch { /* ignore */ }
  applyTheme(e.matches ? 'dark' : 'light');
});
applyTheme(document.documentElement.dataset.theme || 'light');

init();
