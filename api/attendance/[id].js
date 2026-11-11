const { getCollection, toObjectId } = require('../../lib/db');
const { validateRecord } = require('../../lib/validate');
const { findDuplicate, DUPLICATE_MESSAGE } = require('../../lib/duplicates');
const { requireRole } = require('../../lib/auth');
const { logEvent, snapshot, describeRecord, diffRecords } = require('../../lib/audit');

// PUT    /api/attendance/:id -> replace the editable fields (all required)   admin or teacher
// PATCH  /api/attendance/:id -> update only the fields that are sent         admin or teacher
// DELETE /api/attendance/:id -> remove the record                            admin only
// PUT and PATCH return 409 if the result would duplicate another record,
// unless ?force=1 is sent.
module.exports = async function handler(req, res) {
  try {
    // Teachers may edit; only an admin may delete. Students cannot change anything.
    const user = req.method === 'DELETE'
      ? await requireRole(req, res, 'admin')
      : await requireRole(req, res, 'admin', 'teacher');
    if (!user) return;

    const id = toObjectId(req.query.id);
    if (!id) return res.status(400).json({ error: 'Invalid record id.' });

    const col = await getCollection();

    if (req.method === 'PUT' || req.method === 'PATCH') {
      const partial = req.method === 'PATCH';
      const { data, error } = validateRecord(req.body, { partial });
      if (error) return res.status(400).json({ error });

      const before = await col.findOne({ _id: id });
      if (!before) return res.status(404).json({ error: 'Record not found.' });

      if (req.query.force !== '1') {
        // For PATCH, merge with the stored record so the check sees the final values.
        const duplicate = await findDuplicate(col, partial ? { ...before, ...data } : data, id);
        if (duplicate) return res.status(409).json({ error: DUPLICATE_MESSAGE, duplicate });
      }

      const updated = await col.findOneAndUpdate(
        { _id: id },
        { $set: { ...data, updatedAt: new Date(), updatedBy: user.username } },
        { returnDocument: 'after' }
      );
      if (!updated) return res.status(404).json({ error: 'Record not found.' });

      const changes = diffRecords(before, updated);
      if (changes.length) {
        const what = changes.map((c) => `${c.field} ${c.from} → ${c.to}`).join(', ');
        await logEvent(
          user,
          'record.update',
          `Edited record for ${before.studentName} (${before.subjectName}, ${snapshot(before).date}): ${what}`,
          { before: snapshot(before), after: snapshot(updated), changes }
        );
      }
      return res.status(200).json(updated);
    }

    if (req.method === 'DELETE') {
      const removed = await col.findOneAndDelete({ _id: id });
      if (!removed) return res.status(404).json({ error: 'Record not found.' });
      // The whole record is kept in the log, so a delete can always be traced and re-entered.
      await logEvent(user, 'record.delete', `Deleted record: ${describeRecord(removed)}`, { before: snapshot(removed) });
      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', 'PUT, PATCH, DELETE');
    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error. Please try again.' });
  }
};
