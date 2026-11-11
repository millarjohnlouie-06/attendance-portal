const { toObjectId } = require('../../lib/db');
const { requireRole } = require('../../lib/auth');
const { findById, countAdmins, deleteUser } = require('../../lib/users');

// Admin only.
// DELETE /api/users/:id -> remove an account (not your own, and never the last admin)
module.exports = async function handler(req, res) {
  try {
    const admin = await requireRole(req, res, 'admin');
    if (!admin) return;

    if (req.method !== 'DELETE') {
      res.setHeader('Allow', 'DELETE');
      return res.status(405).json({ error: 'Method not allowed.' });
    }

    const id = toObjectId(req.query.id);
    if (!id) return res.status(400).json({ error: 'Invalid user id.' });

    if (String(id) === String(admin._id)) {
      return res.status(400).json({ error: 'You cannot delete your own account.' });
    }

    const target = await findById(String(id));
    if (!target) return res.status(404).json({ error: 'User not found.' });

    if (target.role === 'admin' && (await countAdmins()) <= 1) {
      return res.status(400).json({ error: 'You cannot delete the last admin.' });
    }

    await deleteUser(id);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error. Please try again.' });
  }
};
