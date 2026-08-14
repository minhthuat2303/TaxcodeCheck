/**
 * create-test-excel.js
 * Script tạo file Excel test mẫu với họ tên và MST thật/giả
 */

const XLSX = require('xlsx');
const path = require('path');

const testData = [
  // Headers
  ['Họ tên', 'Mã số thuế'],
  // Dòng test (một số MST thật từ các doanh nghiệp công khai, một số giả)
  ['Nguyễn Văn Long',          '046091004230'],  // test MST thật
  ['Trần Văn A',               '079123456789'],  // MST giả → INVALID
  ['Đặng Thị Hồng',            '0100233488'],    // dạng MST doanh nghiệp
  ['Lê Thị Bích',              '000000000001'],  // MST giả → INVALID
  ['Phạm Văn Bình',            '079099001234'],  // MST giả → INVALID
  ['Vũ Thị  Lan',              '046091004230'],  // Duplicate MST (cache test)
  ['Nguyễn  Văn   Minh',       '001234567890'],  // Multiple spaces in name
  ['Hồ Ngọc Hà',               '8765432100'],   // Dạng MST cá nhân
  ['Võ Thị Kim Tuyến',         '0101234567'],   // MST doanh nghiệp giả
  ['Trần Đình Khoa',           '046099999999'],  // MST giả → INVALID
];

const wb = XLSX.utils.book_new();
const ws = XLSX.utils.aoa_to_sheet(testData);

// Style header row
ws['!cols'] = [{ wch: 30 }, { wch: 20 }];

// Force MST column (B) as text to preserve leading zeros
const range = XLSX.utils.decode_range(ws['!ref']);
for (let row = range.s.r + 1; row <= range.e.r; row++) {
  const cell = ws[XLSX.utils.encode_cell({ r: row, c: 1 })];
  if (cell) {
    cell.t = 's'; // string type
    cell.z = '@'; // text format
  }
}

XLSX.utils.book_append_sheet(wb, ws, 'Danh sách MST');

const outPath = path.join(__dirname, '..', 'test-data.xlsx');
XLSX.writeFile(wb, outPath);
console.log(`✅ Test Excel created: ${outPath}`);
console.log(`   ${testData.length - 1} rows`);
