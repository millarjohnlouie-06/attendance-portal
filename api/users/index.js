const { requireRole } = require('../../lib/auth');
const { listUsers, createUser, validateNewUser, publicUser } = require('../../lib/users');

// Admin only.
// GET  /api/users -> list accounts (never includes password hashes)
// POST /api/users -> create an account { username, password, role }
module.exports = async function handler(req, res) {
  try {
    const admin = await requireRole(req, res, 'admin');
    if (!admin) return;

    res.setHeader('Cache-Control', 'no-store');

    if (req.method === 'GET') {
      const users = await listUsers();
      return res.status(200).json(users.map(publicUser));
    }

    if (req.method === 'POST') {
      const { data, error } = validateNewUser(req.body);
      if (error) return res.status(400).json({ error });

      const created = await createUser(data);
      if (created.error) return res.status(409).json({ error: created.error });
      return res.status(201).json(publicUser(created.user));
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error. Please try again.' });
  }
};
