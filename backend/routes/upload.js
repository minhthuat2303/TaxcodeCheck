/**
 * upload.js - POST /api/upload
 * Accepts a multipart file upload, parses Excel, returns preview data.
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const router = express.Router();

const { parseExcel } = require('../services/excelParser');
const { buildUrl } = require('../services/urlBuilder');
const logger = require('../utils/logger');

const MAX_FILE_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE_MB || '20', 10);
const ALLOWED_EXTENSIONS = ['.xlsx', '.xls', '.csv'];
const ALLOWED_MIMETYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
  'application/csv',
  'text/plain', // some CSV uploads arrive as text/plain
];

// Use memory storage — no files saved to disk
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE_MB * 1024 * 1024 },
  fileFilter(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return cb(new Error(`Định dạng file không được hỗ trợ. Chỉ chấp nhận: ${ALLOWED_EXTENSIONS.join(', ')}`));
    }
    cb(null, true);
  },
});

/**
 * POST /api/upload
 * Body: multipart/form-data with field "file"
 * Optional fields: nameColumn, taxColumn (for manual mapping)
 */
router.post('/', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Không có file được upload' });
    }

    const { nameColumn, taxColumn } = req.body;
    const { buffer, mimetype, originalname, size } = req.file;

    logger.log('info', `[upload] File received: ${originalname}, size: ${size}`);

    // Parse Excel
    const parsed = parseExcel(
      buffer,
      mimetype,
      nameColumn || null,
      taxColumn || null
    );

    // Build preview URLs (first 20 rows)
    const preview = parsed.records.slice(0, 20).map((rec, i) => {
      const { url, nameSlug } = buildUrl(rec.taxId, rec.name);
      return {
        stt: i + 1,
        name: rec.name,
        taxId: rec.taxId,
        nameSlug,
        previewUrl: url,
      };
    });

    return res.json({
      success: true,
      filename: originalname,
      size,
      totalRows: parsed.totalRows,
      headers: parsed.headers,
      detectedNameColumn: parsed.detectedNameColumn,
      detectedTaxColumn: parsed.detectedTaxColumn,
      preview,
      errors: parsed.errors,
      needsMapping: parsed.errors.length > 0,
      // Store the full records in session-like store for verification
      // We encode the records into the response for the client to send back
      // (stateless design — no server-side session needed for small files)
      records: parsed.records.map((r) => {
        const { url, nameSlug } = buildUrl(r.taxId, r.name);
        return {
          index: r.index,
          name: r.name,
          taxId: r.taxId,
          nameSlug,
          url,
        };
      }),
    });
  } catch (err) {
    logger.log('error', '[upload] Error', err.message);

    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error: `File quá lớn. Tối đa ${MAX_FILE_SIZE_MB}MB`,
      });
    }

    return res.status(400).json({ error: err.message });
  }
});

module.exports = router;
