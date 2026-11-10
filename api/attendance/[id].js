const { getCollection, toObjectId } = require('../../lib/db');
const { validateRecord } = require('../../lib/validate');

// PUT    /api/attendance/:id -> replace the editable fields (all required)
// PATCH  /api/attendance/:id -> update only the fields that are sent
// DELETE /api/attendance/:id -> remove the record
module.exports = async function handler(req, res) {
  try {
    const id = toObjectId(req.query.id);
    if (!id) return res.status(400).json({ error: 'Invalid record id.' });

    const col = await getCollection();

    if (req.method === 'PUT' || req.method === 'PATCH') {
      const { data, error } = validateRecord(req.body, { partial: req.method === 'PATCH' });
      if (error) return res.status(400).json({ error });

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
