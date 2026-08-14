/**
 * sample.js - GET /api/sample-template
 * Generates and downloads a clean Excel template for users.
 */

const express = require('express');
const XLSX = require('xlsx');
const router = express.Router();

router.get('/', (req, res) => {
  try {
    const templateData = [
      ['Họ tên', 'Mã số thuế'],
      ['Nguyễn Văn Long', '046091004230'],
      ['Trần Văn An', '0100233488'],
      ['Lê Thị Mai', '079123456789'],
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(templateData);

    ws['!cols'] = [{ wch: 28 }, { wch: 20 }];

    // Set text format for MST column (B)
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:B4');
    for (let row = range.s.r + 1; row <= range.e.r; row++) {
      const cell = ws[XLSX.utils.encode_cell({ r: row, c: 1 })];
      if (cell) {
        cell.t = 's';
        cell.z = '@';
      }
    }

    XLSX.utils.book_append_sheet(wb, ws, 'Mau_Kiem_Tra_MST');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', 'attachment; filename="mau-kiem-tra-ma-so-thue.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Length', buffer.length);

    return res.send(buffer);
  } catch (err) {
    return res.status(500).json({ error: `Lỗi tạo file mẫu: ${err.message}` });
  }
});

module.exports = router;
