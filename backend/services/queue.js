/**
 * queue.js
 * Concurrency-limited verification queue with:
 * - Safe concurrency defaults
 * - Global Circuit Breaker / Pause when 429 is encountered
 * - Jittered exponential backoff retry for rate-limiting & timeouts
 * - URL-level in-memory cache
 */

const pLimit = require('p-limit');
const { verifyUrl } = require('./verifier');
const logger = require('../utils/logger');

const DEFAULT_CONCURRENCY = parseInt(process.env.VERIFY_CONCURRENCY || '2', 10);
const DEFAULT_DELAY_MS    = parseInt(process.env.REQUEST_DELAY_MS || '600', 10);
const MAX_RETRY           = parseInt(process.env.MAX_RETRY || '4', 10);

// Global timestamp until which all workers must pause (triggered by 429)
let globalPauseUntil = 0;

/**
 * Sleep for ms milliseconds.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Ensures worker honors any active global pause triggered by 429.
 */
async function waitIfPaused() {
  const now = Date.now();
  if (now < globalPauseUntil) {
    const waitTime = globalPauseUntil - now;
    logger.log('info', `[queue] Global cooldown active. Pausing worker for ${waitTime}ms`);
    await sleep(waitTime);
  }
}

/**
 * Trigger global pause when 429 is hit across all workers.
 * @param {number} pauseDurationMs
 */
function triggerGlobalPause(pauseDurationMs = 4000) {
  const targetTime = Date.now() + pauseDurationMs;
  if (targetTime > globalPauseUntil) {
    globalPauseUntil = targetTime;
    logger.log('warn', `[queue] ⚠️ HTTP 429 detected! Triggering global pause for ${pauseDurationMs}ms across all queue workers.`);
  }
}

/**
 * Verify a single URL with smart retry logic.
 *
 * @param {string} url
 * @param {string} taxId
 * @returns {Promise<object>} result
 */
async function verifyWithRetry(url, taxId) {
  let attempt = 0;
  let lastResult = null;

  while (attempt <= MAX_RETRY) {
    await waitIfPaused();

    if (attempt > 0) {
      // Jittered backoff: 2s, 4.5s, 8s, 12s
      const jitter = Math.floor(Math.random() * 800);
      const backoff = (attempt * 2200) + jitter;
      logger.log('info', `[queue] Retry ${attempt}/${MAX_RETRY} for ${url}, waiting ${backoff}ms`);
      await sleep(backoff);
    }

    const result = await verifyUrl(url, taxId);
    lastResult = result;

    // Terminal statuses that should NOT be retried
    if (
      result.status === 'VALID' ||
      result.status === 'INVALID' ||
      result.status === 'INVALID_FORMAT' ||
      result.status === 'ACCESS_BLOCKED'
    ) {
      return result;
    }

    // If Rate-Limited (429), trigger global cooldown for all workers
    if (result.status === 'RATE_LIMITED') {
      const cooldown = result.retryAfterMs || 4000;
      triggerGlobalPause(cooldown);
      attempt++;
      continue;
    }

    // Transient errors (timeout, 5xx, network)
    if (result.status === 'TIMEOUT' || result.status === 'API_ERROR') {
      attempt++;
      continue;
    }

    return result;
  }

  return lastResult;
}

/**
 * Process all records with concurrency control and real-time progress.
 *
 * @param {Array<{ index: number, name: string, taxId: string, url: string }>} records
 * @param {Function} onProgress - called with (index, record, result)
 * @param {number} [concurrency] - custom concurrency override
 * @returns {Promise<Array>} results
 */
async function processQueue(records, onProgress, concurrency = DEFAULT_CONCURRENCY) {
  const limit = pLimit(concurrency);
  const cache = new Map();
  const results = new Array(records.length).fill(null);

  const tasks = records.map((record) =>
    limit(async () => {
      await waitIfPaused();

      // Add a slight delay + jitter between sequential requests
      const jitter = Math.floor(Math.random() * 200);
      await sleep(DEFAULT_DELAY_MS + jitter);

      const { index, url, taxId } = record;

      // In-memory session cache hit
      if (cache.has(url)) {
        const cached = { ...cache.get(url), cached: true };
        results[index] = cached;
        if (onProgress) onProgress(index, record, cached);
        return cached;
      }

      const result = await verifyWithRetry(url, taxId);
      cache.set(url, result);
      results[index] = result;

      if (onProgress) onProgress(index, record, result);
      return result;
    })
  );

  await Promise.all(tasks);
  return results;
}

/**
 * Process a small batch of records (useful for Vercel serverless function calls).
 * @param {Array<{ index: number, name: string, taxId: string, url: string }>} records
 * @returns {Promise<Array>}
 */
async function processBatch(records) {
  return processQueue(records, null, 2);
}

module.exports = {
  processQueue,
  processBatch,
  verifyWithRetry,
  triggerGlobalPause,
};
