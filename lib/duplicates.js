// A record counts as a duplicate when another record has the same student,
// subject and date. Names are compared case-insensitively.
const DUPLICATE_MESSAGE = 'A record for this student, subject and date already exists.';

async function findDuplicate(col, record, excludeId) {
  const filter = {
    date: record.date,
    studentName: record.studentName,
    subjectName: record.subjectName,
  };
  if (excludeId) filter._id = { $ne: excludeId };
  return col.findOne(filter, { collation: { locale: 'en', strength: 2 } });
}

module.exports = { findDuplicate, DUPLICATE_MESSAGE };
