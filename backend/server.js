/**
 * server.js - Express entry point
 * MaSoThue Excel Tax ID Verification Backend
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const logger = require('./utils/logger');

const uploadRouter = require('./routes/upload');
const verifyRouter = require('./routes/verify');
const exportRouter = require('./routes/export');
const sampleRouter = require('./routes/sample');

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// ——— Middleware ———
app.use(cors({
  origin: '*', // For MVP local use; restrict in production
  methods: ['GET', 'POST', 'OPTIONS'],
}));

// Increase JSON body size limit for large record arrays
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve frontend static files
const frontendPath = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendPath));

// ——— API Routes ———
app.use('/api/upload', uploadRouter);
app.use('/api/verify', verifyRouter);
app.use('/api/export', exportRouter);
app.use('/api/sample-template', sampleRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    config: {
      maxFileSizeMB: process.env.MAX_FILE_SIZE_MB || '20',
      maxRows: process.env.MAX_ROWS || '20000',
      concurrency: process.env.VERIFY_CONCURRENCY || '5',
      timeoutMs: process.env.REQUEST_TIMEOUT_MS || '10000',
    },
  });
});

// Fallback: serve index.html for any unmatched route (SPA support)
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// ——— Global error handler ———
app.use((err, req, res, next) => {
  logger.log('error', '[server] Unhandled error', err.message);
  res.status(500).json({ error: 'Lỗi máy chủ nội bộ' });
});

// ——— Start server ———
app.listen(PORT, () => {
  logger.info(`✅ Server running at http://localhost:${PORT}`);
  logger.info(`   Frontend: http://localhost:${PORT}`);
  logger.info(`   API:      http://localhost:${PORT}/api`);
});

module.exports = app; // for testing
