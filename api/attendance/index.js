const { getCollection } = require('../../lib/db');
const { validateRecord } = require('../../lib/validate');
const { findDuplicate, DUPLICATE_MESSAGE } = require('../../lib/duplicates');
const { requireAuth } = require('../../lib/auth');

// GET  /api/attendance  -> list all records (newest date first)
// POST /api/attendance  -> create a record (409 if it duplicates one, unless ?force=1)
module.exports = async function handler(req, res) {
  try {
    if (!requireAuth(req, res)) return;

    const col = await getCollection();

    if (req.method === 'GET') {
      const records = await col
        .find({})
        .sort({ date: -1, studentName: 1 })
        .limit(1000)
        .toArray();
      res.setHeader('Cache-Control', 'no-store');
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

      const doc = { ...data, createdAt: new Date() };
      const result = await col.insertOne(doc);
      return res.status(201).json({ ...doc, _id: result.insertedId });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (err) {
    console.error(err); // full detail stays in server logs only
    return res.status(500).json({ error: 'Server error. Please try again.' });
  }
};
