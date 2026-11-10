const STATUSES = ['Present', 'Absent', 'Late', 'Excused'];
const MAX_LEN = 100;

const TEXT_FIELDS = {
  subjectName: 'Subject name',
  section: 'Section',
  studentName: 'Student name',
};

function cleanText(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

// Accepts "YYYY-MM-DD" and returns a Date at UTC midnight, or null if invalid.
function parseDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) return null;
  return d;
}

// Returns { data } on success or { error } on failure.
// partial = true (PATCH) only checks the fields that were sent.
function validateRecord(body, { partial = false } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Request body must be a JSON object.' };
  }

  const data = {};

  for (const [key, label] of Object.entries(TEXT_FIELDS)) {
    if (partial && body[key] === undefined) continue;
    const value = cleanText(body[key]);
    if (!value) return { error: `${label} is required.` };
    if (value.length > MAX_LEN) {
      return { error: `${label} must be ${MAX_LEN} characters or fewer.` };
    }
    data[key] = value;
  }

  if (!(partial && body.date === undefined)) {
    const date = parseDate(body.date);
    if (!date) return { error: 'Date must be a valid date (YYYY-MM-DD).' };
    data.date = date;
  }

  if (!(partial && body.status === undefined)) {
    const status = body.status === undefined ? 'Present' : body.status;
    if (!STATUSES.includes(status)) {
      return { error: `Status must be one of: ${STATUSES.join(', ')}.` };
    }
    data.status = status;
  }

  if (Object.keys(data).length === 0) return { error: 'No fields to update.' };
  return { data };
}

const MAX_SHEET_ROWS = 200;

// Validates a whole class sheet: one date, subject and section, plus a status
// for each student. Returns { data } or { error }.
function validateSheet(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Request body must be a JSON object.' };
  }

  const subjectName = cleanText(body.subjectName);
  const section = cleanText(body.section);
  if (!subjectName) return { error: 'Subject name is required.' };
  if (!section) return { error: 'Section is required.' };
  if (subjectName.length > MAX_LEN) return { error: `Subject name must be ${MAX_LEN} characters or fewer.` };
  if (section.length > MAX_LEN) return { error: `Section must be ${MAX_LEN} characters or fewer.` };

  const date = parseDate(body.date);
  if (!date) return { error: 'Date must be a valid date (YYYY-MM-DD).' };

  if (!Array.isArray(body.entries) || body.entries.length === 0) {
    return { error: 'Add at least one student to the sheet.' };
  }
  if (body.entries.length > MAX_SHEET_ROWS) {
    return { error: `A sheet can hold at most ${MAX_SHEET_ROWS} students.` };
  }

  const seen = new Set();
  const entries = [];
  for (const entry of body.entries) {
    if (!entry || typeof entry !== 'object') return { error: 'Each sheet row must be an object.' };
    const studentName = cleanText(entry.studentName);
    if (!studentName) return { error: 'Every student needs a name.' };
    if (studentName.length > MAX_LEN) {
      return { error: `Student name must be ${MAX_LEN} characters or fewer.` };
    }
    if (!STATUSES.includes(entry.status)) {
      return { error: `Status must be one of: ${STATUSES.join(', ')}.` };
    }
    const key = studentName.toLowerCase();
    if (seen.has(key)) return { error: `${studentName} appears more than once on the sheet.` };
    seen.add(key);
    entries.push({ studentName, status: entry.status });
  }

  return { data: { date, subjectName, section, entries } };
}

module.exports = { validateRecord, validateSheet, STATUSES, MAX_SHEET_ROWS };
