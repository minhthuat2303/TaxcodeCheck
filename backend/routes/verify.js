/**
 * verify.js - Verification routes
 *
 * POST /api/verify/start   - Start a verification session, returns sessionId
 * GET  /api/verify/stream/:sessionId - SSE stream for progress
 * GET  /api/verify/result/:sessionId - Get final results
 * POST /api/verify/cancel/:sessionId - Cancel ongoing verification
 */

const express = require('express');
const router = express.Router();

const { processQueue, processBatch, verifyWithRetry } = require('../services/queue');
const { buildUrl } = require('../services/urlBuilder');
const logger = require('../utils/logger');

// In-memory store for verification sessions
// { sessionId: { status, records, results, progress, cancelled } }
const sessions = new Map();

// Clean up sessions after 30 minutes
const SESSION_TTL_MS = 30 * 60 * 1000;

function cleanupSession(sessionId) {
  setTimeout(() => {
    sessions.delete(sessionId);
    logger.log('info', `[verify] Session ${sessionId} cleaned up`);
  }, SESSION_TTL_MS);
}

function generateSessionId() {
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * POST /api/verify/single
 * Body: { taxId: string, name: string }
 * Checks a single tax ID + name with the same backend verification logic
 */
router.post('/single', async (req, res) => {
  try {
    const { taxId, name } = req.body;

    if (!taxId || String(taxId).trim() === '') {
      return res.status(400).json({ error: 'Vui lòng nhập mã số thuế' });
    }

    const cleanTaxId = String(taxId).trim();
    const cleanName  = name ? String(name).trim() : '';

    const { url, nameSlug } = buildUrl(cleanTaxId, cleanName);
    logger.log('info', `[verify/single] Checking ${cleanTaxId} - ${cleanName} → ${url}`);

    const result = await verifyWithRetry(url, cleanTaxId);

    return res.json({
      success: true,
      name: cleanName,
      taxId: cleanTaxId,
      nameSlug,
      url,
      ...result,
      checkedAt: new Date().toISOString(),
    });
  } catch (err) {
    logger.log('error', '[verify/single] Error', err.message);
    return res.status(500).json({ error: `Lỗi kiểm tra: ${err.message}` });
  }
});

/**
 * POST /api/verify/batch
 * Body: { records: [{ index, name, taxId, url }] }
 * Processes a small batch of records synchronously (Vercel-compatible & serverless-ready)
 */
router.post('/batch', async (req, res) => {
  try {
    const { records } = req.body;
    if (!records || !Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ error: 'Không có dữ liệu để kiểm tra' });
    }

    const results = await processBatch(records);
    return res.json({ success: true, results });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/verify/start
 * Body: { records: [{ index, name, taxId, url }] }
 * Returns: { sessionId }
 */
router.post('/start', (req, res) => {
  const { records } = req.body;

  if (!records || !Array.isArray(records) || records.length === 0) {
    return res.status(400).json({ error: 'Không có dữ liệu để kiểm tra' });
  }

  const MAX_ROWS = parseInt(process.env.MAX_ROWS || '20000', 10);
  if (records.length > MAX_ROWS) {
    return res.status(400).json({
      error: `Vượt quá giới hạn ${MAX_ROWS} dòng`,
    });
  }

  const sessionId = generateSessionId();

  const session = {
    status: 'running', // pending | running | done | cancelled
    records,
    results: new Array(records.length).fill(null),
    completedCount: 0,
    sseClients: [], // SSE response objects
    cancelled: false,
  };

  sessions.set(sessionId, session);
  cleanupSession(sessionId);

  logger.log('info', `[verify] Session started: ${sessionId}, ${records.length} records`);

  // Start verification immediately
  startVerification(sessionId, session);

  return res.json({ sessionId, total: records.length });
});

/**
 * GET /api/verify/stream/:sessionId
 * Server-Sent Events stream for real-time progress.
 */
router.get('/stream/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = sessions.get(sessionId);

  if (!session) {
    return res.status(404).json({ error: 'Session không tồn tại' });
  }

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering
  res.flushHeaders();

  // Register this client
  session.sseClients.push(res);

  // Send initial state
  sendSSE(res, 'connected', {
    sessionId,
    total: session.records.length,
    status: session.status,
  });

  // If already done, send all results
  if (session.status === 'done') {
    sendSSE(res, 'complete', buildSummary(session));
    res.end();
    return;
  }

  // If pending, start processing
  if (session.status === 'pending') {
    session.status = 'running';
    startVerification(sessionId, session);
  }

  // Clean up on client disconnect
  req.on('close', () => {
    const idx = session.sseClients.indexOf(res);
    if (idx !== -1) session.sseClients.splice(idx, 1);
  });
});

/**
 * GET /api/verify/result/:sessionId
 * Returns the current/final results (for reconnection or polling fallback).
 */
router.get('/result/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = sessions.get(sessionId);

  if (!session) {
    return res.status(404).json({ error: 'Session không tồn tại' });
  }

  return res.json({
    sessionId,
    status: session.status,
    total: session.records.length,
    completedCount: session.completedCount,
    results: session.results.map((result, i) => {
      if (!result) return null;
      const record = session.records[i];
      return {
        index: i,
        name: record?.name || '',
        taxId: record?.taxId || '',
        url: record?.url || '',
        ...result,
      };
    }),
    summary: buildSummary(session),
  });
});

/**
 * POST /api/verify/cancel/:sessionId
 */
router.post('/cancel/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = sessions.get(sessionId);

  if (!session) {
    return res.status(404).json({ error: 'Session không tồn tại' });
  }

  session.cancelled = true;
  session.status = 'cancelled';

  broadcastSSE(session, 'cancelled', { sessionId });
  closeAllSSE(session);

  return res.json({ success: true });
});

// ——— Internal helpers ———

function sendSSE(res, event, data) {
  try {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  } catch {
    // Client may have disconnected
  }
}

function broadcastSSE(session, event, data) {
  for (const client of session.sseClients) {
    sendSSE(client, event, data);
  }
}

function closeAllSSE(session) {
  for (const client of session.sseClients) {
    try { client.end(); } catch { /* ignore */ }
  }
  session.sseClients = [];
}

function buildSummary(session) {
  const counts = { VALID: 0, INVALID: 0, TIMEOUT: 0, RATE_LIMITED: 0, API_ERROR: 0, ACCESS_BLOCKED: 0, INVALID_FORMAT: 0 };
  for (const r of session.results) {
    if (r && counts[r.status] !== undefined) counts[r.status]++;
  }
  return {
    total: session.records.length,
    completed: session.completedCount,
    ...counts,
  };
}

/**
 * Start async verification for a session.
 */
async function startVerification(sessionId, session) {
  try {
    await processQueue(session.records, (index, record, result) => {
      if (session.cancelled) return;

      session.results[index] = result;
      session.completedCount++;

      const progressData = {
        index,
        name: record.name,
        taxId: record.taxId,
        url: record.url,
        ...result,
        completed: session.completedCount,
        total: session.records.length,
        summary: buildSummary(session),
      };

      broadcastSSE(session, 'progress', progressData);
    });

    if (!session.cancelled) {
      session.status = 'done';
      broadcastSSE(session, 'complete', buildSummary(session));
      closeAllSSE(session);
      logger.log('info', `[verify] Session ${sessionId} complete`);
    }
  } catch (err) {
    logger.log('error', `[verify] Session ${sessionId} error`, err.message);
    session.status = 'error';
    broadcastSSE(session, 'error', { message: err.message });
    closeAllSSE(session);
  }
}

module.exports = router;
