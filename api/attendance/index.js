const { getCollection } = require('../../lib/db');
const { validateRecord } = require('../../lib/validate');
const { findDuplicate, DUPLICATE_MESSAGE } = require('../../lib/duplicates');
const { requireAuth, requireRole } = require('../../lib/auth');
const { logEvent, snapshot, describeRecord } = require('../../lib/audit');

const NAME_COLLATION = { locale: 'en', strength: 2 }; // case-insensitive, like the duplicate check

// GET  /api/attendance  -> list records (newest date first).
//                          Admins and teachers get everything; a student gets only their own.
// POST /api/attendance  -> create a record (admin or teacher). 409 if it duplicates one, unless ?force=1
module.exports = async function handler(req, res) {
  try {
    const user = req.method === 'GET'
      ? await requireAuth(req, res)
      : await requireRole(req, res, 'admin', 'teacher');
    if (!user) return;

    const col = await getCollection();

    if (req.method === 'GET') {
      res.setHeader('Cache-Control', 'no-store');

      if (user.role === 'student') {
        // Chosen here on the server, never taken from the request, so a student
        // cannot ask for anyone else's records. Who entered them is not shared.
        if (!user.studentName) return res.status(200).json([]);
        const own = await col
          .find({ studentName: user.studentName }, { collation: NAME_COLLATION, projection: { createdBy: 0, updatedBy: 0 } })
          .sort({ date: -1, subjectName: 1 })
          .limit(1000)
          .toArray();
        return res.status(200).json(own);
      }

      const records = await col
        .find({})
        .sort({ date: -1, studentName: 1 })
        .limit(1000)
        .toArray();
      return res.status(200).json(records);
    }

    if (req.method === 'POST') {
      const { data, error } = validateRecord(req.body);
      if (error) return res.status(400).json({ error });

      const force = Boolean(req.query && req.query.force === '1');
      if (!force) {
        const duplicate = await findDuplicate(col, data);
        if (duplicate) return res.status(409).json({ error: DUPLICATE_MESSAGE, duplicate });
      }

      const doc = { ...data, createdAt: new Date(), createdBy: user.username };
      const result = await col.insertOne(doc);
      const saved = { ...doc, _id: result.insertedId };
      await logEvent(user, 'record.create', `Added record: ${describeRecord(saved)}`, { after: snapshot(saved) });
      return res.status(201).json(saved);
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (err) {
    console.error(err); // full detail stays in server logs only
    return res.status(500).json({ error: 'Server error. Please try again.' });
  }
};
