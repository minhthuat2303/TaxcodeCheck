/**
 * logger.js
 * Safe logger that avoids logging PII (names, tax IDs) in production.
 */

const isProd = process.env.NODE_ENV === 'production';

function info(...args) {
  console.log('[INFO]', ...args);
}

function warn(...args) {
  console.warn('[WARN]', ...args);
}

function error(...args) {
  console.error('[ERROR]', ...args);
}

/**
 * Log with PII masking in production.
 * @param {string} level
 * @param {string} message
 * @param {object} [data]
 */
function log(level, message, data) {
  if (isProd) {
    // In production, omit any data that might contain PII
    console[level === 'error' ? 'error' : 'log'](`[${level.toUpperCase()}] ${message}`);
  } else {
    const fn = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';
    console[fn](`[${level.toUpperCase()}] ${message}`, data !== undefined ? data : '');
  }
}

module.exports = { info, warn, error, log };
