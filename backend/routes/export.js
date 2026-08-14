/**
 * export.js - POST /api/export
 * Generates an Excel file from verification results and streams it as a download.
 */

const express = require('express');
const XLSX = require('xlsx');
const router = express.Router();

const logger = require('../utils/logger');

/**
 * POST /api/export
 * Body: { results: [...] }
 * Returns: Excel file download
 */
router.post('/', (req, res) => {
  try {
    const { results } = req.body;

    if (!results || !Array.isArray(results) || results.length === 0) {
      return res.status(400).json({ error: 'Không có dữ liệu để xuất' });
    }

    // Build worksheet rows
    const rows = results.map((r, i) => ({
      STT: i + 1,
      'Họ tên': r.name || '',
      'Mã số thuế': r.taxId || '',
      'URL tra cứu': r.url || '',
      'Final URL': r.finalUrl || '',
      'HTTP Status': r.httpStatus !== null && r.httpStatus !== undefined ? r.httpStatus : '',
      'Kết quả': r.status || '',
      'Thông báo': r.message || '',
      'Thời gian kiểm tra': r.checkedAt || new Date().toISOString(),
    }));

    // Force MST column as text to preserve leading zeros
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(rows);

    // Set column widths
    worksheet['!cols'] = [
      { wch: 5 },   // STT
      { wch: 30 },  // Họ tên
      { wch: 18 },  // MST
      { wch: 55 },  // URL tra cứu
      { wch: 55 },  // Final URL
      { wch: 12 },  // HTTP Status
      { wch: 16 },  // Kết quả
      { wch: 40 },  // Thông báo
      { wch: 22 },  // Thời gian
    ];

    // Force MST column (C) to text format
    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1:I1');
    for (let row = range.s.r + 1; row <= range.e.r; row++) {
      const cellAddr = XLSX.utils.encode_cell({ r: row, c: 2 }); // Column C = MST
      if (worksheet[cellAddr]) {
        worksheet[cellAddr].t = 's'; // force string type
        worksheet[cellAddr].z = '@'; // text format
      }
    }

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Kết quả kiểm tra');

    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    const today = new Date().toISOString().split('T')[0];
    const filename = `tax-verification-result-${today}.xlsx`;

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Length', excelBuffer.length);

    logger.log('info', `[export] Exported ${results.length} records`);

    return res.send(excelBuffer);
  } catch (err) {
    logger.log('error', '[export] Error', err.message);
    return res.status(500).json({ error: `Lỗi xuất file: ${err.message}` });
  }
});

module.exports = router;
