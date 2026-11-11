const { MongoClient, ObjectId } = require('mongodb');

// Cache the client across invocations so warm serverless functions reuse one
// connection pool instead of opening a new connection on every request.
const cache = global._attendanceMongo || (global._attendanceMongo = { promise: null });

async function getDb() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI environment variable is not set.');

  if (!cache.promise) {
    cache.promise = new MongoClient(uri, { maxPoolSize: 5 })
      .connect()
      .catch((err) => {
        cache.promise = null; // allow a retry on the next request
        throw err;
      });
  }

  const client = await cache.promise;
  return client.db(process.env.MONGODB_DB || 'LabAttendanceDB_Millar');
}

async function getCollection() {
  const db = await getDb();
  return db.collection(process.env.MONGODB_COLLECTION || 'attendance_records');
}

// Login accounts live in their own collection (created automatically on the first insert).
async function getUsersCollection() {
  const db = await getDb();
  return db.collection(process.env.MONGODB_USERS_COLLECTION || 'users');
}

// Returns an ObjectId for a valid 24-character hex string, otherwise null.
function toObjectId(value) {
  return typeof value === 'string' && /^[0-9a-fA-F]{24}$/.test(value)
    ? new ObjectId(value)
    : null;
}

module.exports = { getCollection, getUsersCollection, toObjectId };
