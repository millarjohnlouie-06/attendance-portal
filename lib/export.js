const ExcelJS = require('exceljs');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

const STATUSES = ['Present', 'Absent', 'Late', 'Excused'];

const dayOf = (value) => (value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10));

// Present and Late count as attended; Excused is left out. Same rule as the Reports tab.
function attendanceRate(list) {
  const counted = list.filter((r) => r.status !== 'Excused').length;
  const attended = list.filter((r) => r.status === 'Present' || r.status === 'Late').length;
  return counted ? attended / counted : null;
}

function countsOf(list) {
  const counts = {};
  for (const s of STATUSES) counts[s] = list.filter((r) => r.status === s).length;
  return counts;
}

function groupBy(records, key) {
  const groups = new Map();
  for (const r of records) groups.set(r[key], [...(groups.get(r[key]) || []), r]);
  return [...groups].sort((a, b) => String(a[0]).localeCompare(String(b[0])));
}

const percent = (fraction) => (fraction === null ? 'n/a' : `${Math.round(fraction * 100)}%`);

// ---- Excel -----------------------------------------------------------------

const STATUS_FILL = { Present: 'FFE7F6EC', Absent: 'FFFDECEC', Late: 'FFFFF4E0', Excused: 'FFE8EEFC' };
const STATUS_FONT = { Present: 'FF1A7F45', Absent: 'FFC62828', Late: 'FF8A5200', Excused: 'FF2D54C4' };
const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F5EFF' } };
const HEADER_FONT = { bold: true, color: { argb: 'FFFFFFFF' } };

async function buildWorkbook(records, meta) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Attendance Portal';
  wb.created = meta.generatedAt;

  // Sheet 1: one row per record, ready to sort and filter in Excel.
  const ws = wb.addWorksheet('Attendance', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    { header: 'Date', key: 'date', width: 13 },
    { header: 'Student', key: 'studentName', width: 28 },
    { header: 'Subject', key: 'subjectName', width: 26 },
    { header: 'Section', key: 'section', width: 14 },
    { header: 'Status', key: 'status', width: 11 },
    { header: 'Recorded by', key: 'createdBy', width: 16 },
    { header: 'Last edited by', key: 'updatedBy', width: 16 },
  ];
  const head = ws.getRow(1);
  head.font = HEADER_FONT;
  head.fill = HEADER_FILL;
  head.alignment = { vertical: 'middle' };
  head.height = 20;

  for (const r of records) {
    const row = ws.addRow({
      date: r.date, // a real date, so Excel can sort and filter it as one
      studentName: r.studentName,
      subjectName: r.subjectName,
      section: r.section,
      status: r.status,
      createdBy: r.createdBy || '',
      updatedBy: r.updatedBy || '',
    });
    row.getCell('date').numFmt = 'yyyy-mm-dd';
    row.getCell('date').alignment = { horizontal: 'left' };
    const status = row.getCell('status');
    if (STATUS_FILL[r.status]) {
      status.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STATUS_FILL[r.status] } };
      status.font = { bold: true, color: { argb: STATUS_FONT[r.status] } };
    }
  }
  ws.autoFilter = { from: 'A1', to: `G${Math.max(1, records.length + 1)}` };

  // Sheet 2: totals and rates for exactly the rows exported.
  const sm = wb.addWorksheet('Summary');
  sm.columns = [{ width: 30 }, { width: 11 }, { width: 11 }, { width: 11 }, { width: 11 }, { width: 11 }, { width: 14 }];
  sm.getCell('A1').value = 'Attendance summary';
  sm.getCell('A1').font = { bold: true, size: 16 };
  const info = [
    ['Generated', `${meta.generatedAt.toISOString().replace('T', ' ').slice(0, 16)} UTC`],
    ['Exported by', meta.exportedBy],
    ['Filters', meta.filters.length ? meta.filters.join('; ') : 'None (all records)'],
  ];
  if (meta.truncated) info.push(['Note', `Only the first ${meta.limit} records are included.`]);
  info.push(['Records', records.length]);
  info.push(['Attendance rate', percent(attendanceRate(records))]);
  let rowNo = 3;
  for (const [label, value] of info) {
    sm.getCell(`A${rowNo}`).value = label;
    sm.getCell(`A${rowNo}`).font = { bold: true };
    sm.getCell(`B${rowNo}`).value = value;
    sm.getCell(`B${rowNo}`).alignment = { horizontal: 'left' };
    rowNo += 1;
  }
  sm.getCell(`A${rowNo}`).value = 'Present and Late count as attended. Excused records are left out of the rate.';
  sm.getCell(`A${rowNo}`).font = { italic: true, color: { argb: 'FF667085' } };
  rowNo += 2;

  const table = (title, groups) => {
    sm.getCell(`A${rowNo}`).value = title;
    sm.getCell(`A${rowNo}`).font = { bold: true, size: 12 };
    rowNo += 1;
    const header = sm.getRow(rowNo);
    header.values = [title === 'Overall' ? '' : title.replace('By ', ''), 'Total', ...STATUSES, 'Rate'];
    header.font = HEADER_FONT;
    header.fill = HEADER_FILL;
    rowNo += 1;
    for (const [name, list] of groups) {
      const c = countsOf(list);
      const row = sm.getRow(rowNo);
      row.values = [name, list.length, ...STATUSES.map((s) => c[s]), attendanceRate(list) === null ? 'n/a' : attendanceRate(list)];
      if (attendanceRate(list) !== null) row.getCell(7).numFmt = '0%';
      row.getCell(7).alignment = { horizontal: 'right' };
      rowNo += 1;
    }
    rowNo += 1;
  };
  table('Overall', [['All exported records', records]]);
  table('By subject', groupBy(records, 'subjectName'));
  table('By section', groupBy(records, 'section'));

  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ---- PDF -------------------------------------------------------------------

const PAGE = { w: 595.28, h: 841.89, margin: 40 };
const COLUMNS = [
  { key: 'date', title: 'Date', w: 62 },
  { key: 'studentName', title: 'Student', w: 150 },
  { key: 'subjectName', title: 'Subject', w: 130 },
  { key: 'section', title: 'Section', w: 82 },
  { key: 'status', title: 'Status', w: 55 },
];
const ROW_H = 17;
const STATUS_RGB = {
  Present: rgb(0.1, 0.5, 0.27),
  Absent: rgb(0.78, 0.16, 0.16),
  Late: rgb(0.54, 0.32, 0),
  Excused: rgb(0.18, 0.33, 0.77),
};

async function buildPdf(records, meta) {
  const pdf = await PDFDocument.create();
  pdf.setTitle('Attendance report');
  pdf.setCreator('Attendance Portal');
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  // The built-in PDF fonts only cover Western European letters; anything else is shown as "?"
  // (the Excel export keeps every character).
  const supported = new Set(font.getCharacterSet());
  const safe = (text) => Array.from(String(text)).map((ch) => (supported.has(ch.codePointAt(0)) ? ch : '?')).join('');
  const fit = (text, f, size, maxWidth) => {
    let s = safe(text);
    if (f.widthOfTextAtSize(s, size) <= maxWidth) return s;
    while (s.length > 1 && f.widthOfTextAtSize(`${s}...`, size) > maxWidth) s = s.slice(0, -1);
    return `${s}...`;
  };

  const gray = rgb(0.4, 0.44, 0.52);
  const ink = rgb(0.11, 0.14, 0.19);
  let page;
  let y;

  const drawTableHeader = () => {
    page.drawRectangle({ x: PAGE.margin, y: y - 4, width: COLUMNS.reduce((a, c) => a + c.w, 0), height: ROW_H, color: rgb(0.12, 0.37, 1) });
    let x = PAGE.margin + 4;
    for (const col of COLUMNS) {
      page.drawText(col.title, { x, y: y + 1, size: 9, font: bold, color: rgb(1, 1, 1) });
      x += col.w;
    }
    y -= ROW_H;
  };
  const newPage = () => {
    page = pdf.addPage([PAGE.w, PAGE.h]);
    y = PAGE.h - PAGE.margin;
  };

  // First page: title, details, totals.
  newPage();
  page.drawText('Attendance report', { x: PAGE.margin, y: y - 14, size: 20, font: bold, color: ink });
  y -= 36;
  const lines = [
    `Generated ${meta.generatedAt.toISOString().replace('T', ' ').slice(0, 16)} UTC by ${meta.exportedBy}`,
    `Filters: ${meta.filters.length ? meta.filters.join('; ') : 'none (all records)'}`,
  ];
  if (meta.truncated) lines.push(`Only the first ${meta.limit} records are included.`);
  for (const line of lines) {
    page.drawText(fit(line, font, 9, PAGE.w - PAGE.margin * 2), { x: PAGE.margin, y, size: 9, font, color: gray });
    y -= 13;
  }
  y -= 6;

  const counts = countsOf(records);
  const summary = `${records.length} records   |   Present ${counts.Present}   Absent ${counts.Absent}   Late ${counts.Late}   Excused ${counts.Excused}   |   Attendance rate ${percent(attendanceRate(records))}`;
  page.drawText(safe(summary), { x: PAGE.margin, y, size: 10, font: bold, color: ink });
  y -= 14;
  page.drawText('Present and Late count as attended. Excused records are left out of the rate.', { x: PAGE.margin, y, size: 8, font, color: gray });
  y -= 22;

  drawTableHeader();

  if (!records.length) {
    page.drawText('No records match these filters.', { x: PAGE.margin + 4, y: y - 6, size: 10, font, color: gray });
  }

  records.forEach((r, i) => {
    if (y < PAGE.margin + 30) {
      newPage();
      drawTableHeader();
    }
    if (i % 2 === 1) {
      page.drawRectangle({ x: PAGE.margin, y: y - 4, width: COLUMNS.reduce((a, c) => a + c.w, 0), height: ROW_H, color: rgb(0.965, 0.972, 0.98) });
    }
    let x = PAGE.margin + 4;
    for (const col of COLUMNS) {
      const raw = col.key === 'date' ? dayOf(r.date) : r[col.key];
      const isStatus = col.key === 'status';
      page.drawText(fit(raw, isStatus ? bold : font, 9, col.w - 8), {
        x, y: y + 1, size: 9, font: isStatus ? bold : font, color: isStatus ? STATUS_RGB[r.status] || ink : ink,
      });
      x += col.w;
    }
    y -= ROW_H;
  });

  // Page numbers, now that the total is known.
  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    const label = `Attendance Portal  -  Page ${i + 1} of ${pages.length}`;
    p.drawText(label, { x: (PAGE.w - font.widthOfTextAtSize(label, 8)) / 2, y: 22, size: 8, font, color: gray });
  });

  return Buffer.from(await pdf.save());
}

module.exports = { buildWorkbook, buildPdf, attendanceRate, countsOf };
