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

module.exports = { validateRecord, STATUSES };
