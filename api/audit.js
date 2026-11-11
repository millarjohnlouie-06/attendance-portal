const { getAuditCollection, toObjectId } = require('../lib/db');
const { requireRole } = require('../lib/auth');
const { ACTION_GROUPS } = require('../lib/audit');

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

// GET /api/audit   (admin only, read only: the log can never be changed through the API)
//   ?group=record|sheet|user|login|export   only this kind of event
//   ?actor=<username>                        only this person's actions
//   ?before=<id>                             the next page: entries older than this one
//   ?limit=50
// Returns { items, nextBefore, actors } newest first. `actors` (everyone who appears
// in the log) is only included on the first page.
module.exports = async function handler(req, res) {
  try {
    const admin = await requireRole(req, res, 'admin');
    if (!admin) return;

    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ error: 'Method not allowed.' });
    }
    res.setHeader('Cache-Control', 'no-store');

    const { group, actor, before } = req.query || {};
    const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(req.query && req.query.limit, 10) || DEFAULT_LIMIT));

    const filter = {};
    if (group) {
      if (!ACTION_GROUPS.includes(group)) return res.status(400).json({ error: 'Unknown event type.' });
      filter.action = { $regex: `^${group}\\.` };
    }
    if (actor) {
      if (typeof actor !== 'string' || actor.length > 50) return res.status(400).json({ error: 'Invalid username.' });
      filter.actor = actor;
    }
    if (before) {
      const cursor = toObjectId(before);
      if (!cursor) return res.status(400).json({ error: 'Invalid page marker.' });
      filter._id = { $lt: cursor };
    }

    const col = await getAuditCollection();
    const rows = await col.find(filter).sort({ _id: -1 }).limit(limit + 1).toArray();
    const page = rows.slice(0, limit);

    const body = {
      items: page.map((e) => ({
        _id: String(e._id),
        at: e.at,
        actor: e.actor,
        actorRole: e.actorRole,
        action: e.action,
        summary: e.summary,
        details: e.details,
      })),
      nextBefore: rows.length > limit ? String(page[page.length - 1]._id) : null,
    };
    if (!before) {
      body.actors = ((await col.distinct('actor')) || []).filter(Boolean).sort();
    }
    return res.status(200).json(body);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error. Please try again.' });
  }
};
