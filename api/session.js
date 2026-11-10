const {
  configured,
  passwordMatches,
  isAuthenticated,
  setSessionCookie,
  clearSessionCookie,
} = require('../lib/auth');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// GET    /api/session -> { authenticated: true | false }
// POST   /api/session -> log in with { password }; sets the session cookie
// DELETE /api/session -> log out; clears the cookie
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    return res.status(200).json({ authenticated: isAuthenticated(req) });
  }

  if (req.method === 'POST') {
    if (!configured()) {
      console.error('ADMIN_PASSWORD and/or SESSION_SECRET are missing or too short.');
      return res.status(500).json({ error: 'Login is not set up on the server.' });
    }
    const password = req.body && req.body.password;
    if (!passwordMatches(password)) {
      await sleep(600); // slows down password guessing
      return res.status(401).json({ error: 'Incorrect password.' });
    }
    setSessionCookie(res);
    return res.status(200).json({ authenticated: true });
  }

  if (req.method === 'DELETE') {
    clearSessionCookie(res);
    return res.status(200).json({ authenticated: false });
  }

  res.setHeader('Allow', 'GET, POST, DELETE');
  return res.status(405).json({ error: 'Method not allowed.' });
};
