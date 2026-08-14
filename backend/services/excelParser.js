/**
 * excelParser.js
 * Reads Excel/CSV files and extracts records with name and tax ID.
 *
 * Critical: MST (Tax ID) must ALWAYS be read as a string.
 * Leading zeros (e.g., 046091004230) must be preserved.
 */

const XLSX = require('xlsx');

const MAX_ROWS = parseInt(process.env.MAX_ROWS || '20000', 10);

// Auto-detection patterns for column names (case-insensitive, trimmed)
const NAME_COLUMN_PATTERNS = [
  'họ tên', 'ho ten', 'hoten', 'tên', 'ten', 'name', 'full name', 'fullname',
  'họ và tên', 'ho va ten', 'hovaten', 'hoten', 'nguoi nop thue', 'người nộp thuế',
];

const TAX_COLUMN_PATTERNS = [
  'mã số thuế', 'ma so thue', 'masothue', 'mst', 'tax id', 'tax code',
  'taxid', 'taxcode', 'mã số', 'ma so', 'mã thuế', 'ma thue',
];

/**
 * Normalize a string for comparison (lowercase, trim, remove extra spaces).
 * @param {string} str
 * @returns {string}
 */
function normalize(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Find the best column match for name or tax patterns.
 * @param {string[]} headers
 * @param {string[]} patterns
 * @returns {string|null}
 */
function detectColumn(headers, patterns) {
  const normHeaders = headers.map(normalize);
  for (const pattern of patterns) {
    const idx = normHeaders.findIndex((h) => h === pattern);
    if (idx !== -1) return headers[idx];
  }
  // Partial match fallback
  for (const pattern of patterns) {
    const idx = normHeaders.findIndex((h) => h.includes(pattern));
    if (idx !== -1) return headers[idx];
  }
  return null;
}

/**
 * Read a cell value as a string, preserving leading zeros.
 * @param {object} cell - XLSX cell object
 * @returns {string}
 */
function readCellAsString(cell) {
  if (!cell) return '';

  // If cell has a text value (w = formatted text), use it first
  // This preserves leading zeros in formatted cells
  if (cell.w !== undefined && cell.w !== null) {
    return String(cell.w).trim();
  }

  // Fall back to raw value
  if (cell.v !== undefined && cell.v !== null) {
    return String(cell.v).trim();
  }

  return '';
}

/**
 * Parse an Excel/CSV buffer and extract records.
 *
 * @param {Buffer} buffer - File buffer
 * @param {string} mimetype - MIME type
 * @param {string|null} [nameColumn] - Manual override for name column
 * @param {string|null} [taxColumn]  - Manual override for tax column
 * @returns {{
 *   records: Array<{ index: number, name: string, taxId: string }>,
 *   headers: string[],
 *   detectedNameColumn: string|null,
 *   detectedTaxColumn: string|null,
 *   totalRows: number,
 *   errors: string[]
 * }}
 */
function parseExcel(buffer, mimetype, nameColumn = null, taxColumn = null) {
  const errors = [];

  let workbook;
  try {
    workbook = XLSX.read(buffer, {
      type: 'buffer',
      cellText: true,   // generate .w (formatted text) for all cells
      cellDates: false, // don't parse dates specially
      raw: false,       // use formatted values
    });
  } catch (err) {
    throw new Error(`Không thể đọc file: ${err.message}`);
  }

  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  if (!sheet) {
    throw new Error('File không có sheet dữ liệu');
  }

  // Get sheet range
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:A1');
  const totalRows = range.e.r - range.s.r; // exclude header row

  // Read header row
  const headers = [];
  for (let col = range.s.c; col <= range.e.c; col++) {
    const cellAddr = XLSX.utils.encode_cell({ r: range.s.r, c: col });
    const cell = sheet[cellAddr];
    const val = cell ? String(cell.v || cell.w || '').trim() : '';
    headers.push(val);
  }

  // Filter out empty headers
  const validHeaders = headers.filter((h) => h !== '');

  // Detect columns
  const detectedNameColumn = nameColumn || detectColumn(validHeaders, NAME_COLUMN_PATTERNS);
  const detectedTaxColumn = taxColumn || detectColumn(validHeaders, TAX_COLUMN_PATTERNS);

  if (!detectedNameColumn) {
    errors.push('Không tìm thấy cột Họ tên. Vui lòng chọn thủ công.');
  }
  if (!detectedTaxColumn) {
    errors.push('Không tìm thấy cột Mã số thuế. Vui lòng chọn thủ công.');
  }

  if (errors.length > 0) {
    return {
      records: [],
      headers: validHeaders,
      detectedNameColumn,
      detectedTaxColumn,
      totalRows,
      errors,
    };
  }

  // Find column indices
  const nameColIdx = headers.indexOf(detectedNameColumn);
  const taxColIdx = headers.indexOf(detectedTaxColumn);

  // Read data rows
  const records = [];
  const dataRowCount = Math.min(range.e.r - range.s.r, MAX_ROWS);

  for (let row = range.s.r + 1; row <= range.s.r + dataRowCount; row++) {
    const nameCellAddr = XLSX.utils.encode_cell({ r: row, c: nameColIdx });
    const taxCellAddr = XLSX.utils.encode_cell({ r: row, c: taxColIdx });

    const nameCell = sheet[nameCellAddr];
    const taxCell = sheet[taxCellAddr];

    const name = readCellAsString(nameCell);
    const taxId = readCellAsString(taxCell);

    // Skip completely empty rows
    if (!name && !taxId) continue;

    records.push({
      index: records.length,
      name: name || '',
      taxId: taxId || '',
    });
  }

  return {
    records,
    headers: validHeaders,
    detectedNameColumn,
    detectedTaxColumn,
    totalRows: records.length,
    errors,
  };
}

module.exports = {
  parseExcel,
  detectColumn,
  NAME_COLUMN_PATTERNS,
  TAX_COLUMN_PATTERNS,
};
