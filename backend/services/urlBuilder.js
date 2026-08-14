/**
 * urlBuilder.js
 * Builds lookup URLs for masothue.com from tax ID and name.
 */

const { slugify } = require('./slugify');

const BASE_URL = 'https://masothue.com';

/**
 * Build the masothue.com lookup URL.
 * Format: https://masothue.com/{taxId}-{nameSlug}
 *
 * @param {string} taxId  - Tax ID (must remain as string)
 * @param {string} name   - Full name (Vietnamese)
 * @returns {{ url: string, nameSlug: string }}
 */
function buildUrl(taxId, name) {
  const nameSlug = slugify(name);
  const url = `${BASE_URL}/${taxId}-${nameSlug}`;
  return { url, nameSlug };
}

/**
 * Check if a URL is the masothue homepage (redirect target = INVALID).
 * @param {string} url
 * @returns {boolean}
 */
function isHomepage(url) {
  if (!url) return true;
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname === 'masothue.com' &&
      (parsed.pathname === '/' || parsed.pathname === '')
    );
  } catch {
    return false;
  }
}

/**
 * Exact-match check: does the final URL's first path segment start with taxId?
 * Prevents false positives like "123046091004230" matching "046091004230".
 *
 * @param {string} finalUrl
 * @param {string} taxId
 * @returns {boolean}
 */
function taxIdMatchesUrl(finalUrl, taxId) {
  if (!finalUrl || !taxId) return false;
  try {
    const parsed = new URL(finalUrl);
    // pathname: "/046091004230-nguyen-van-long"
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length === 0) return false;

    const firstSegment = parts[0]; // "046091004230-nguyen-van-long"
    const idPart = firstSegment.split('-')[0]; // "046091004230"

    return idPart === taxId;
  } catch {
    return false;
  }
}

module.exports = { buildUrl, isHomepage, taxIdMatchesUrl, BASE_URL };
