const { getCollection } = require('../../lib/db');
const { validateSheet } = require('../../lib/validate');
const { requireAuth } = require('../../lib/auth');

const NAME_COLLATION = { locale: 'en', strength: 2 }; // case-insensitive, like the duplicate check

// POST /api/attendance/bulk
// Body: { date, subjectName, section, entries: [{ studentName, status }, ...] }
// Saves a whole class sheet at once. For each student, a record for the same
// student + subject + date is updated if it exists (so re-saving a sheet never
// creates duplicates); otherwise a new record is created.
module.exports = async function handler(req, res) {
  try {
    if (!requireAuth(req, res)) return;

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Method not allowed.' });
    }

    const { data, error } = validateSheet(req.body);
    if (error) return res.status(400).json({ error });

    const col = await getCollection();
    const now = new Date();

    const operations = data.entries.map((entry) => ({
      updateOne: {
        filter: { date: data.date, subjectName: data.subjectName, studentName: entry.studentName },
        update: {
          $set: { section: data.section, status: entry.status, updatedAt: now },
          $setOnInsert: {
            date: data.date,
            subjectName: data.subjectName,
            studentName: entry.studentName,
            createdAt: now,
          },
        },
        upsert: true,
        collation: NAME_COLLATION,
      },
    }));

    const result = await col.bulkWrite(operations, { ordered: false });
    const created = result.upsertedCount || 0;
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
