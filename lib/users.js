const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { getUsersCollection, toObjectId } = require('./db');
const { cleanText, MAX_LEN } = require('./validate');

// admin   : everything, including deleting records and managing accounts
// teacher : add / edit records, class sheets, reports, exports
// student : read-only view of their OWN attendance (linked by studentName)
const ROLES = ['admin', 'teacher', 'student'];
const USERNAME_PATTERN = /^[a-z0-9._-]{3,30}$/;
const MIN_PASSWORD = 8;
const MAX_PASSWORD_BYTES = 72; // bcrypt only looks at the first 72 bytes
const BCRYPT_ROUNDS = 10;

// Compared against when a username does not exist, so a failed login takes about
// as long whether or not the account is real (otherwise response time reveals usernames).
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_ROUNDS);

function normalizeUsername(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

// What is safe to send to the browser. The password hash never leaves the server.
function publicUser(user) {
  const out = {
    _id: String(user._id),
    username: user.username,
    role: user.role,
    createdAt: user.createdAt,
  };
  if (user.studentName) out.studentName = user.studentName;
  return out;
}

// Returns { data } or { error } for a new account.
function validateNewUser(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Request body must be a JSON object.' };
  }
  const username = normalizeUsername(body.username);
  if (!USERNAME_PATTERN.test(username)) {
    return { error: 'Username must be 3-30 characters: letters, numbers, dot, dash or underscore.' };
  }
  const { password, role } = body;
  if (typeof password !== 'string' || password.length < MIN_PASSWORD) {
    return { error: `Password must be at least ${MIN_PASSWORD} characters.` };
  }
  if (Buffer.byteLength(password) > MAX_PASSWORD_BYTES) {
    return { error: `Password is too long (maximum ${MAX_PASSWORD_BYTES} bytes).` };
  }
  if (!ROLES.includes(role)) {
    return { error: `Role must be one of: ${ROLES.join(', ')}.` };
  }

  const data = { username, password, role };
  if (role === 'student') {
    // The name must be written the same way as in the attendance records
    // (capitals and extra spaces do not matter).
    const studentName = cleanText(body.studentName);
    if (studentName.length < 2) return { error: 'Student accounts need the student’s name, as written in the records.' };
    if (studentName.length > MAX_LEN) return { error: `Student name must be ${MAX_LEN} characters or fewer.` };
    data.studentName = studentName;
  }
  return { data };
}

async function findByUsername(username) {
  const col = await getUsersCollection();
  return col.findOne({ username: normalizeUsername(username) });
}

async function findById(id) {
  const oid = toObjectId(typeof id === 'string' ? id : '');
  if (!oid) return null;
  const col = await getUsersCollection();
  return col.findOne({ _id: oid });
}

async function listUsers() {
  const col = await getUsersCollection();
  return col.find({}).sort({ username: 1 }).toArray();
}

async function countAdmins() {
  const col = await getUsersCollection();
  return col.countDocuments({ role: 'admin' });
}

async function deleteUser(id) {
  const col = await getUsersCollection();
  const result = await col.deleteOne({ _id: id });
  return result.deletedCount > 0;
}

// Inserts an account. Returns { user } or { error } (error when the username is taken).
async function createUser({ username, password, role, studentName }) {
  const col = await getUsersCollection();
  await col.createIndex({ username: 1 }, { unique: true }); // no-op once it exists
  const doc = {
    username: normalizeUsername(username),
    passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
    role,
    createdAt: new Date(),
  };
  if (role === 'student') doc.studentName = studentName;
  try {
    const result = await col.insertOne(doc);
    return { user: { ...doc, _id: result.insertedId } };
  } catch (err) {
    if (err && err.code === 11000) return { error: 'That username is already taken.' };
    throw err;
  }
}

// Returns the user when the username and password are right, otherwise null.
async function authenticate(username, password) {
  if (typeof username !== 'string' || typeof password !== 'string') return null;
  const user = await findByUsername(username);
  const ok = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);
  return user && ok ? user : null;
}

// First-run setup. While the users collection is empty, logging in as "admin" with the
// ADMIN_PASSWORD environment variable creates the first admin account, so the password
// you already set on Vercel keeps working. Once any account exists this does nothing.
async function bootstrapAdmin(username, password) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || typeof password !== 'string') return null;
  if (normalizeUsername(username) !== 'admin') return null;

  const digest = (s) => crypto.createHash('sha256').update(s).digest();
  if (!crypto.timingSafeEqual(digest(password), digest(expected))) return null;

  const col = await getUsersCollection();
  if ((await col.countDocuments({}, { limit: 1 })) > 0) return null;

  const created = await createUser({ username: 'admin', password, role: 'admin' });
  // If two first logins race, the unique index lets only one win; use the winner.
  return created.user || findByUsername('admin');
}

module.exports = {
  ROLES,
  publicUser,
  validateNewUser,
  findByUsername,
  findById,
  listUsers,
  countAdmins,
  deleteUser,
  createUser,
  authenticate,
  bootstrapAdmin,
};
