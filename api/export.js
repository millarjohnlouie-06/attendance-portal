const { getCollection } = require('../lib/db');
const { requireRole } = require('../lib/auth');
const { parseDate } = require('../lib/validate');
const { buildWorkbook, buildPdf } = require('../lib/export');
const { logEvent } = require('../lib/audit');

const MAX_ROWS = 20000;
const SORT_KEYS = ['date', 'studentName', 'subjectName', 'section', 'status'];
const NAME_COLLATION = { locale: 'en', strength: 2 };

const FORMATS = {
  xlsx: { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', label: 'Excel' },
  pdf: { type: 'application/pdf', label: 'PDF' },
};

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// GET /api/export?format=xlsx|pdf   (admin or teacher)
//   &q=<text>            same text filter as the Records tab (student, subject or section)
//   &from=YYYY-MM-DD &to=YYYY-MM-DD   optional date range
//   &sort=<column> &dir=1|-1          same order as the table on screen
// Responds with the file as a download.
module.exports = async function handler(req, res) {
  try {
    const user = await requireRole(req, res, 'admin', 'teacher');
    if (!user) return;

    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ error: 'Method not allowed.' });
    }

    const query = req.query || {};
    const format = FORMATS[query.format];
    if (!format) return res.status(400).json({ error: 'Format must be xlsx or pdf.' });

    const filter = {};
    const filters = [];

    const q = typeof query.q === 'string' ? query.q.trim().slice(0, 100) : '';
    if (q) {
      const re = new RegExp(escapeRegex(q), 'i');
      filter.$or = [{ studentName: re }, { subjectName: re }, { section: re }];
      filters.push(`text contains "${q}"`);
    }

    const range = {};
    if (query.from) {
      const from = parseDate(query.from);
      if (!from) return res.status(400).json({ error: 'From date must be YYYY-MM-DD.' });
      range.$gte = from;
      filters.push(`from ${query.from}`);
    }
    if (query.to) {
      const to = parseDate(query.to);
      if (!to) return res.status(400).json({ error: 'To date must be YYYY-MM-DD.' });
      range.$lte = to;
      filters.push(`to ${query.to}`);
    }
    if (range.$gte && range.$lte && range.$gte > range.$lte) {
      return res.status(400).json({ error: 'The From date must not be after the To date.' });
    }
    if (range.$gte || range.$lte) filter.date = range;

    let sort = { date: -1, studentName: 1 };
    if (query.sort) {
      if (!SORT_KEYS.includes(query.sort)) return res.status(400).json({ error: 'Cannot sort by that column.' });
      sort = { [query.sort]: query.dir === '-1' ? -1 : 1, date: -1, studentName: 1 };
    }

    const col = await getCollection();
    const rows = await col.find(filter, { collation: NAME_COLLATION }).sort(sort).limit(MAX_ROWS + 1).toArray();
    const truncated = rows.length > MAX_ROWS;
    const records = truncated ? rows.slice(0, MAX_ROWS) : rows;

    const meta = { generatedAt: new Date(), exportedBy: user.username, filters, truncated, limit: MAX_ROWS };
    const file = query.format === 'xlsx' ? await buildWorkbook(records, meta) : await buildPdf(records, meta);

    await logEvent(user, 'export.records', `Exported ${records.length} record(s) to ${format.label}${filters.length ? ` (${filters.join('; ')})` : ''}`, {
      format: query.format, count: records.length, filters,
    });

    res.statusCode = 200;
    res.setHeader('Content-Type', format.type);
    res.setHeader('Content-Disposition', `attachment; filename="attendance-${meta.generatedAt.toISOString().slice(0, 10)}.${query.format}"`);
    res.setHeader('Content-Length', String(file.length));
    res.setHeader('Cache-Control', 'no-store');
    return res.end(file);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Could not create the file. Please try again.' });
  }
};
