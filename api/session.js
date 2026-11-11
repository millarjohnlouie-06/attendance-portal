const { configured, getCurrentUser, setSessionCookie, clearSessionCookie } = require('../lib/auth');
const { authenticate, bootstrapAdmin, publicUser } = require('../lib/users');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// GET    /api/session -> { authenticated, user }
// POST   /api/session -> log in with { username, password }; sets the session cookie
// DELETE /api/session -> log out; clears the cookie
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  try {
    if (req.method === 'GET') {
      const user = await getCurrentUser(req);
      return res.status(200).json({ authenticated: Boolean(user), user: user ? publicUser(user) : null });
    }

    if (req.method === 'POST') {
      if (!configured()) {
        console.error('SESSION_SECRET is missing or too short.');
        return res.status(500).json({ error: 'Login is not set up on the server.' });
      }
      const { username, password } = req.body || {};
      const user = (await authenticate(username, password)) || (await bootstrapAdmin(username, password));
      if (!user) {
        await sleep(600); // slows down password guessing
        return res.status(401).json({ error: 'Incorrect username or password.' });
      }
      setSessionCookie(res, user);
      return res.status(200).json({ authenticated: true, user: publicUser(user) });
    }

    if (req.method === 'DELETE') {
      clearSessionCookie(res);
      return res.status(200).json({ authenticated: false, user: null });
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (err) {
    console.error(err); // full detail stays in server logs only
    return res.status(500).json({ error: 'Server error. Please try again.' });
  }
};
