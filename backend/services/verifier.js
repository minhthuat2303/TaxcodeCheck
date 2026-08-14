/**
 * verifier.js
 * Core HTTP verification logic.
 * Follows redirects, examines the final URL, and classifies the result.
 *
 * Status codes:
 *   VALID         - final URL retained taxId in first path segment
 *   INVALID       - redirected to homepage or 404
 *   TIMEOUT       - request exceeded REQUEST_TIMEOUT_MS
 *   RATE_LIMITED  - HTTP 429 received
 *   API_ERROR     - network error, 5xx, DNS failure
 *   ACCESS_BLOCKED - bot protection / CAPTCHA detected
 *   INVALID_FORMAT - MST is empty or malformed
 */

const axios = require('axios');
const { isHomepage, taxIdMatchesUrl } = require('./urlBuilder');
const logger = require('../utils/logger');

const TIMEOUT_MS = parseInt(process.env.REQUEST_TIMEOUT_MS || '10000', 10);

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

/**
 * Verify a single masothue.com URL.
 *
 * @param {string} url     - Full URL to request
 * @param {string} taxId   - Tax ID string for final URL validation
 * @returns {Promise<{
 *   status: string,
 *   finalUrl: string|null,
 *   httpStatus: number|null,
 *   message: string
 * }>}
 */
async function verifyUrl(url, taxId) {
  // Basic format validation
  if (!taxId || taxId.trim() === '') {
    return {
      status: 'INVALID_FORMAT',
      finalUrl: null,
      httpStatus: null,
      message: 'Mã số thuế trống hoặc không hợp lệ',
    };
  }

  let finalUrl = null;
  let httpStatus = null;

  try {
    const response = await axios.get(url, {
      timeout: TIMEOUT_MS,
      maxRedirects: 10,           // follow up to 10 redirects
      validateStatus: () => true, // don't throw on any HTTP status
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control': 'max-age=0',
        Referer: 'https://www.google.com/',
        'Sec-Ch-Ua': '"Google Chrome";v="125", "Chromium";v="125", "Not.A/Brand";v="24"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'cross-site',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
      },
    });

    finalUrl = response.request?.res?.responseUrl || response.config?.url || url;
    httpStatus = response.status;

    logger.log('info', `[verifyUrl] ${url} → ${finalUrl} [${httpStatus}]`);

    // Handle 404 → INVALID
    if (httpStatus === 404) {
      return {
        status: 'INVALID',
        finalUrl,
        httpStatus,
        message: 'Trang không tồn tại (404)',
      };
    }

    // Handle 429 → RATE_LIMITED
    if (httpStatus === 429) {
      const retryHeader = response.headers?.['retry-after'];
      let retryAfterMs = 4000;
      if (retryHeader) {
        const parsedSec = parseInt(retryHeader, 10);
        if (!isNaN(parsedSec)) retryAfterMs = parsedSec * 1000;
      }

      return {
        status: 'RATE_LIMITED',
        finalUrl,
        httpStatus,
        retryAfterMs,
        message: 'Quá nhiều yêu cầu, bị giới hạn tốc độ (429)',
      };
    }

    // Handle 5xx → API_ERROR
    if (httpStatus >= 500) {
      return {
        status: 'API_ERROR',
        finalUrl,
        httpStatus,
        message: `Lỗi máy chủ (${httpStatus})`,
      };
    }

    // Handle bot protection (403 with possible CAPTCHA)
    if (httpStatus === 403) {
      // Check if it looks like a bot protection page
      const html = typeof response.data === 'string' ? response.data : '';
      if (
        html.toLowerCase().includes('captcha') ||
        html.toLowerCase().includes('cloudflare') ||
        html.toLowerCase().includes('access denied')
      ) {
        return {
          status: 'ACCESS_BLOCKED',
          finalUrl,
          httpStatus,
          message: 'Bị chặn bởi hệ thống bảo vệ bot',
        };
      }
      return {
        status: 'API_ERROR',
        finalUrl,
        httpStatus,
        message: `Bị từ chối truy cập (403)`,
      };
    }

    // For 200/301/302 — check final URL
    // If redirected to homepage → INVALID
    if (isHomepage(finalUrl)) {
      return {
        status: 'INVALID',
        finalUrl,
        httpStatus,
        message: 'Chuyển hướng về trang chủ — MST không tồn tại',
      };
    }

    // Exact segment match: finalUrl must have taxId as first path segment prefix
    if (!taxIdMatchesUrl(finalUrl, taxId)) {
      return {
        status: 'INVALID',
        finalUrl,
        httpStatus,
        message: 'URL cuối không khớp MST',
      };
    }

    // Optionally check HTML content for signs of a valid tax info page
    const html = typeof response.data === 'string' ? response.data : '';
    if (html && !containsTaxPageIndicators(html, taxId)) {
      return {
        status: 'INVALID',
        finalUrl,
        httpStatus,
        message: 'Trang không chứa thông tin MST hợp lệ',
      };
    }

    return {
      status: 'VALID',
      finalUrl,
      httpStatus,
      message: 'MST hợp lệ và tồn tại',
    };
  } catch (err) {
    // Timeout
    if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
      return {
        status: 'TIMEOUT',
        finalUrl,
        httpStatus,
        message: `Hết thời gian chờ (>${TIMEOUT_MS}ms)`,
      };
    }

    // DNS / network errors
    if (
      err.code === 'ENOTFOUND' ||
      err.code === 'ECONNREFUSED' ||
      err.code === 'ECONNRESET' ||
      err.code === 'ERR_NETWORK'
    ) {
      return {
        status: 'API_ERROR',
        finalUrl,
        httpStatus,
        message: `Lỗi mạng: ${err.code}`,
      };
    }

    logger.log('error', `[verifyUrl] Unexpected error for ${url}`, err.message);
    return {
      status: 'API_ERROR',
      finalUrl,
      httpStatus,
      message: `Lỗi không xác định: ${err.message}`,
    };
  }
}

/**
 * Check page HTML for indicators that it's a valid MST detail page.
 * @param {string} html
 * @param {string} taxId
 * @returns {boolean}
 */
function containsTaxPageIndicators(html, taxId) {
  // masothue.com detail pages typically contain the MST in the page content
  // and have structured data about the company/individual
  const lowerHtml = html.toLowerCase();

  // Homepage or error indicators
  if (
    lowerHtml.includes('không tìm thấy') ||
    lowerHtml.includes('not found') ||
    lowerHtml.includes('page not found')
  ) {
    return false;
  }

  // Check tax ID appears in content (not just URL)
  if (taxId && html.includes(taxId)) {
    return true;
  }

  // Check for typical MST page structure
  if (
    lowerHtml.includes('mã số thuế') ||
    lowerHtml.includes('tax id') ||
    lowerHtml.includes('tên doanh nghiệp') ||
    lowerHtml.includes('họ và tên')
  ) {
    return true;
  }

  return false;
}

module.exports = { verifyUrl, containsTaxPageIndicators };
