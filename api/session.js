const { configured, getCurrentUser, setSessionCookie, clearSessionCookie } = require('../lib/auth');
const { authenticate, bootstrapAdmin, findByUsername, publicUser } = require('../lib/users');
const { logEvent } = require('../lib/audit');

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
      let user = await authenticate(username, password);
      let firstRun = false;
      if (!user) {
        user = await bootstrapAdmin(username, password);
        firstRun = Boolean(user);
      }
      if (!user) {
        // Only failed logins for a REAL account are logged, so someone guessing random
        // usernames cannot fill the audit log.
        const target = typeof username === 'string' ? await findByUsername(username) : null;
        if (target) await logEvent({ username: target.username, role: target.role }, 'login.failed', `Failed login for "${target.username}"`);
        await sleep(600); // slows down password guessing
        return res.status(401).json({ error: 'Incorrect username or password.' });
      }
      if (firstRun) await logEvent(user, 'user.create', 'First admin account created (first-run setup)', { username: user.username, role: user.role });
      await logEvent(user, 'login.success', `${user.username} logged in`);
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
