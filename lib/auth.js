const crypto = require('crypto');

const COOKIE_NAME = 'attendance_session';
const SESSION_SECONDS = 8 * 60 * 60; // 8 hours

// Login only works when both variables are set. If either is missing (or the
// secret is too short) every protected request is refused: it fails closed.
function configured() {
  const secret = process.env.SESSION_SECRET || '';
  return Boolean(process.env.ADMIN_PASSWORD) && secret.length >= 16;
}

function sign(payload) {
  return crypto.createHmac('sha256', process.env.SESSION_SECRET).update(payload).digest('base64url');
}

// A token is "<base64url payload>.<signature>"; the payload only holds an expiry time.
function createToken() {
  const payload = Buffer.from(
    JSON.stringify({ exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS })
  ).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

function verifyToken(token) {
  if (!configured() || typeof token !== 'string') return false;

  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return false;
  const [payload, signature] = parts;

  const given = Buffer.from(signature);
  const expected = Buffer.from(sign(payload));
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return false;

  try {
    const { exp } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return Number.isInteger(exp) && exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

// Compares SHA-256 digests so the comparison time does not depend on the input.
function passwordMatches(input) {
  if (!configured() || typeof input !== 'string') return false;
  const digest = (s) => crypto.createHash('sha256').update(s).digest();
  return crypto.timingSafeEqual(digest(input), digest(process.env.ADMIN_PASSWORD));
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

function isAuthenticated(req) {
  return verifyToken(readCookie(req, COOKIE_NAME));
}

// Use at the top of every protected route: if (!requireAuth(req, res)) return;
function requireAuth(req, res) {
  if (isAuthenticated(req)) return true;
  res.status(401).json({ error: 'Please log in.' });
  return false;
}

function cookieAttributes() {
  // HttpOnly: scripts cannot read it. SameSite=Strict: not sent from other sites.
  // Secure: HTTPS only (on Vercel; plain http://localhost cannot set Secure cookies).
  return `Path=/; HttpOnly; SameSite=Strict${process.env.VERCEL ? '; Secure' : ''}`;
}

function setSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${createToken()}; ${cookieAttributes()}; Max-Age=${SESSION_SECONDS}`);
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; ${cookieAttributes()}; Max-Age=0`);
}

module.exports = {
  configured,
  passwordMatches,
  isAuthenticated,
  requireAuth,
  setSessionCookie,
  clearSessionCookie,
};
