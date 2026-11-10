const { getCollection, toObjectId } = require('../../lib/db');
const { validateRecord } = require('../../lib/validate');
const { findDuplicate, DUPLICATE_MESSAGE } = require('../../lib/duplicates');
const { requireAuth } = require('../../lib/auth');

// PUT    /api/attendance/:id -> replace the editable fields (all required)
// PATCH  /api/attendance/:id -> update only the fields that are sent
// DELETE /api/attendance/:id -> remove the record
// PUT and PATCH return 409 if the result would duplicate another record,
// unless ?force=1 is sent.
module.exports = async function handler(req, res) {
  try {
    if (!requireAuth(req, res)) return;

    const id = toObjectId(req.query.id);
    if (!id) return res.status(400).json({ error: 'Invalid record id.' });

    const col = await getCollection();

    if (req.method === 'PUT' || req.method === 'PATCH') {
      const partial = req.method === 'PATCH';
      const { data, error } = validateRecord(req.body, { partial });
      if (error) return res.status(400).json({ error });

      if (req.query.force !== '1') {
        // For PATCH, merge with the stored record so the check sees the final values.
        const existing = partial ? await col.findOne({ _id: id }) : null;
        if (partial && !existing) return res.status(404).json({ error: 'Record not found.' });

        const duplicate = await findDuplicate(col, partial ? { ...existing, ...data } : data, id);
        if (duplicate) return res.status(409).json({ error: DUPLICATE_MESSAGE, duplicate });
      }

      const updated = await col.findOneAndUpdate(
        { _id: id },
        { $set: { ...data, updatedAt: new Date() } },
        { returnDocument: 'after' }
      );
      if (!updated) return res.status(404).json({ error: 'Record not found.' });
      return res.status(200).json(updated);
    }

    if (req.method === 'DELETE') {
      const result = await col.deleteOne({ _id: id });
      if (result.deletedCount === 0) return res.status(404).json({ error: 'Record not found.' });
      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', 'PUT, PATCH, DELETE');
    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error. Please try again.' });
  }
};
