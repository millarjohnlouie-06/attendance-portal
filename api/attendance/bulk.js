const { getCollection } = require('../../lib/db');
const { validateSheet } = require('../../lib/validate');
const { requireRole } = require('../../lib/auth');
const { logEvent, SEP } = require('../../lib/audit');

const NAME_COLLATION = { locale: 'en', strength: 2 }; // case-insensitive, like the duplicate check

// POST /api/attendance/bulk   (admin or teacher)
// Body: { date, subjectName, section, entries: [{ studentName, status }, ...] }
// Saves a whole class sheet at once. For each student, a record for the same
// student + subject + date is updated if it exists (so re-saving a sheet never
// creates duplicates); otherwise a new record is created.
module.exports = async function handler(req, res) {
  try {
    const user = await requireRole(req, res, 'admin', 'teacher');
    if (!user) return;

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Method not allowed.' });
    }

    const { data, error } = validateSheet(req.body);
    if (error) return res.status(400).json({ error });

    const col = await getCollection();
    const now = new Date();

    // What is already saved for this date and subject, so the audit log can say what really changed.
    const existing = await col
      .find(
        { date: data.date, subjectName: data.subjectName, studentName: { $in: data.entries.map((e) => e.studentName) } },
        { collation: NAME_COLLATION }
      )
      .toArray();
    const previous = new Map(existing.map((r) => [r.studentName.toLowerCase(), r.status]));

    const operations = data.entries.map((entry) => ({
      updateOne: {
        filter: { date: data.date, subjectName: data.subjectName, studentName: entry.studentName },
        update: {
          $set: { section: data.section, status: entry.status, updatedAt: now, updatedBy: user.username },
          $setOnInsert: {
            date: data.date,
            subjectName: data.subjectName,
            studentName: entry.studentName,
            createdAt: now,
            createdBy: user.username,
          },
        },
        upsert: true,
        collation: NAME_COLLATION,
      },
    }));

    const result = await col.bulkWrite(operations, { ordered: false });
    const created = result.upsertedCount || 0;

    const changes = data.entries
      .map((e) => ({ studentName: e.studentName, from: previous.get(e.studentName.toLowerCase()) || null, to: e.status }))
      .filter((c) => c.from !== c.to);
    if (changes.length) {
      const added = changes.filter((c) => c.from === null).length;
      const day = data.date.toISOString().slice(0, 10);
      await logEvent(
        user,
        'sheet.save',
        `Saved class sheet: ${data.subjectName}${SEP}${data.section}${SEP}${day} — ${added} new, ${changes.length - added} changed`,
        { date: day, subjectName: data.subjectName, section: data.section, students: data.entries.length, changes }
      );
    }

    return res.status(200).json({
      saved: data.entries.length,
      created,
      updated: data.entries.length - created,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error. Please try again.' });
  }
};
