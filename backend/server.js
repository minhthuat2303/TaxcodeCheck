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

// Serve static files from frontend and public
const frontendPath = path.join(__dirname, '..', 'frontend');
const publicPath = path.join(__dirname, '..', 'public');
app.use(express.static(frontendPath));
app.use(express.static(publicPath));

// ——— API Routes (Support both /api/path and /path on Vercel) ———
app.use(['/api/upload', '/upload'], uploadRouter);
app.use(['/api/verify', '/verify'], verifyRouter);
app.use(['/api/export', '/export'], exportRouter);
app.use(['/api/sample-template', '/sample-template'], sampleRouter);

// Health check
const healthHandler = (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    config: {
      maxFileSizeMB: process.env.MAX_FILE_SIZE_MB || '20',
      maxRows: process.env.MAX_ROWS || '20000',
      concurrency: process.env.VERIFY_CONCURRENCY || '2',
      timeoutMs: process.env.REQUEST_TIMEOUT_MS || '10000',
    },
  });
};
app.get(['/api/health', '/health'], healthHandler);

// Fallback: serve index.html for SPA support
app.get('*', (req, res) => {
  const fs = require('fs');
  const indexInFrontend = path.join(frontendPath, 'index.html');
  const indexInPublic = path.join(publicPath, 'index.html');
  if (fs.existsSync(indexInFrontend)) {
    return res.sendFile(indexInFrontend);
  } else if (fs.existsSync(indexInPublic)) {
    return res.sendFile(indexInPublic);
  }
  res.status(404).send('Page not found');
});

// ——— Global error handler ———
app.use((err, req, res, next) => {
  logger.log('error', '[server] Unhandled error', err.message);
  res.status(500).json({ error: 'Lỗi máy chủ nội bộ' });
});

// ——— Start server (only when not running inside Vercel serverless) ———
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    logger.info(`✅ Server running at http://localhost:${PORT}`);
    logger.info(`   Frontend: http://localhost:${PORT}`);
    logger.info(`   API:      http://localhost:${PORT}/api`);
  });
}

module.exports = app;
