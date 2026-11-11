const { getAuditCollection } = require('./db');

// The audit log is an append-only history: one document per change, written by the
// server after the change succeeds. There is no route that edits or deletes entries.
//
// { at, actor, actorRole, action, summary, details }
//   summary : one readable line, shown in the Audit log tab
//   details : the structured data behind it (for a delete, the full record that was removed)
const ACTIONS = [
  'record.create', 'record.update', 'record.delete', 'sheet.save',
  'user.create', 'user.delete',
  'login.success', 'login.failed',
  'export.records',
];

// The filter on the Audit log tab picks a group: everything before the dot.
const ACTION_GROUPS = ['record', 'sheet', 'user', 'login', 'export'];

const SEP = ' · ';

const dayOf = (value) => (value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10));

// Just the fields a person cares about, with the date as plain "YYYY-MM-DD".
function snapshot(r) {
  return {
    _id: String(r._id),
    date: dayOf(r.date),
    studentName: r.studentName,
    subjectName: r.subjectName,
    section: r.section,
    status: r.status,
  };
}

function describeRecord(r) {
  const s = snapshot(r);
  return [s.studentName, s.subjectName, s.section, s.date, s.status].join(SEP);
}

const FIELDS = ['date', 'studentName', 'subjectName', 'section', 'status'];

// [{ field, from, to }] for every field that is different.
function diffRecords(before, after) {
  const b = snapshot(before);
  const a = snapshot(after);
  return FIELDS.filter((k) => b[k] !== a[k]).map((k) => ({ field: k, from: b[k], to: a[k] }));
}

// Never throws. If the log cannot be written, the change the user asked for still
// goes through and the problem is recorded in the server log.
async function logEvent(actor, action, summary, details) {
  try {
    const col = await getAuditCollection();
    await col.insertOne({
      at: new Date(),
      actor: actor ? actor.username : null,
      actorRole: actor ? actor.role : null,
      action,
      summary,
      details: details || null,
    });
  } catch (err) {
    console.error('Audit log write failed:', err);
  }
}

module.exports = { ACTIONS, ACTION_GROUPS, SEP, snapshot, describeRecord, diffRecords, logEvent };
