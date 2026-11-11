const crypto = require('crypto');
const { findById } = require('./users');

const COOKIE_NAME = 'attendance_session';
const SESSION_SECONDS = 8 * 60 * 60; // 8 hours

// Login only works when SESSION_SECRET is set and long enough. If it is missing
// every protected request is refused: it fails closed.
function configured() {
  return (process.env.SESSION_SECRET || '').length >= 16;
}

function sign(payload) {
  return crypto.createHmac('sha256', process.env.SESSION_SECRET).update(payload).digest('base64url');
}

// A token is "<base64url payload>.<signature>". The payload holds only the user's id
// and an expiry time. The role is NOT stored in it: it is read from the database on
// every request, so removing a user or changing a role takes effect immediately.
function createToken(user) {
  const payload = Buffer.from(
    JSON.stringify({ uid: String(user._id), exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS })
  ).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

// Returns the payload { uid, exp } for a valid, unexpired token, otherwise null.
function verifyToken(token) {
  if (!configured() || typeof token !== 'string') return null;

  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const [payload, signature] = parts;

  const given = Buffer.from(signature);
  const expected = Buffer.from(sign(payload));
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    const valid = typeof data.uid === 'string' && Number.isInteger(data.exp) && data.exp > Math.floor(Date.now() / 1000);
    return valid ? data : null;
  } catch {
    return null;
  }
}

function readCookie(req, name) {
  const header = req.headers && req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i !== -1 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

// The logged-in user (loaded fresh from the database), or null.
async function getCurrentUser(req) {
  const session = verifyToken(readCookie(req, COOKIE_NAME));
  return session ? findById(session.uid) : null;
}

// Use at the top of every protected route:
//   const user = await requireAuth(req, res); if (!user) return;
// Sends 401 and returns null when nobody valid is logged in.
async function requireAuth(req, res) {
  const user = await getCurrentUser(req);
  if (!user) {
    res.status(401).json({ error: 'Please log in.' });
    return null;
  }
  return user;
}

// Like requireAuth, but the user must also have one of the given roles (403 otherwise).
async function requireRole(req, res, ...roles) {
  const user = await requireAuth(req, res);
  if (!user) return null;
  if (!roles.includes(user.role)) {
    res.status(403).json({ error: 'Your account is not allowed to do that.' });
    return null;
  }
  return user;
}

function cookieAttributes() {
  // HttpOnly: scripts cannot read it. SameSite=Strict: not sent from other sites.
  // Secure: HTTPS only (on Vercel; plain http://localhost cannot set Secure cookies).
  return `Path=/; HttpOnly; SameSite=Strict${process.env.VERCEL ? '; Secure' : ''}`;
}

function setSessionCookie(res, user) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${createToken(user)}; ${cookieAttributes()}; Max-Age=${SESSION_SECONDS}`);
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; ${cookieAttributes()}; Max-Age=0`);
}

module.exports = {
  configured,
  getCurrentUser,
  requireAuth,
  requireRole,
  setSessionCookie,
  clearSessionCookie,
};
