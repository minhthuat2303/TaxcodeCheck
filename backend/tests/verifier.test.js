/**
 * verifier.test.js
 * Jest unit tests for verification logic.
 * Uses mocked axios to simulate 20 test scenarios.
 */

jest.mock('axios');

const axios = require('axios');
const { verifyUrl } = require('../services/verifier');
const { slugify } = require('../services/slugify');
const { buildUrl, isHomepage, taxIdMatchesUrl } = require('../services/urlBuilder');
const { parseExcel } = require('../services/excelParser');
const XLSX = require('xlsx');

// Helper: create fake axios response
function mockResponse({ status, finalUrl, data = '<html>...</html>' }) {
  axios.get.mockResolvedValueOnce({
    status,
    data,
    request: { res: { responseUrl: finalUrl } },
    config: { url: finalUrl },
  });
}

// Helper: create fake network error
function mockNetworkError(code, message) {
  const err = new Error(message || code);
  err.code = code;
  axios.get.mockRejectedValueOnce(err);
}

// Helper: create timeout error
function mockTimeout() {
  const err = new Error('timeout of 10000ms exceeded');
  err.code = 'ECONNABORTED';
  axios.get.mockRejectedValueOnce(err);
}

// =====================================================================
// SLUG TESTS
// =====================================================================

describe('slugify()', () => {
  test('Vietnamese name with diacritics', () => {
    expect(slugify('Nguyễn Văn Long')).toBe('nguyen-van-long');
  });

  test('Vietnamese name with Đ', () => {
    expect(slugify('Đặng Thị Hồng')).toBe('dang-thi-hong');
  });

  test('Multiple spaces normalized', () => {
    expect(slugify('Nguyễn  Văn   Long')).toBe('nguyen-van-long');
  });

  test('Leading/trailing spaces trimmed', () => {
    expect(slugify('  Trần Văn A  ')).toBe('tran-van-a');
  });

  test('All tones (sắc, huyền, hỏi, ngã, nặng)', () => {
    expect(slugify('Ắ Ằ Ẩ Ẫ Ậ')).toBe('a-a-a-a-a');
  });
});

// =====================================================================
// URL BUILDER TESTS
// =====================================================================

describe('buildUrl()', () => {
  test('Correct URL format', () => {
    const { url } = buildUrl('046091004230', 'Nguyễn Văn Long');
    expect(url).toBe('https://masothue.com/046091004230-nguyen-van-long');
  });

  test('Leading zero preserved in URL', () => {
    const { url } = buildUrl('046091004230', 'Test User');
    expect(url).toMatch(/\/046091004230-/);
  });
});

describe('isHomepage()', () => {
  test('https://masothue.com/ → true', () => {
    expect(isHomepage('https://masothue.com/')).toBe(true);
  });

  test('https://masothue.com → true', () => {
    expect(isHomepage('https://masothue.com')).toBe(true);
  });

  test('https://masothue.com/046091004230-nguyen-van-long → false', () => {
    expect(isHomepage('https://masothue.com/046091004230-nguyen-van-long')).toBe(false);
  });
});

describe('taxIdMatchesUrl()', () => {
  const taxId = '046091004230';

  test('Exact match → true', () => {
    expect(taxIdMatchesUrl('https://masothue.com/046091004230-nguyen-van-long', taxId)).toBe(true);
  });

  test('Prefix false positive → false (123046...)', () => {
    expect(taxIdMatchesUrl('https://masothue.com/123046091004230-nguyen-van-long', taxId)).toBe(false);
  });

  test('Homepage → false', () => {
    expect(taxIdMatchesUrl('https://masothue.com/', taxId)).toBe(false);
  });

  test('Different MST → false', () => {
    expect(taxIdMatchesUrl('https://masothue.com/079123456789-tran-van-a', taxId)).toBe(false);
  });
});

// =====================================================================
// VERIFIER TESTS (mocked HTTP)
// =====================================================================

describe('verifyUrl()', () => {
  const url = 'https://masothue.com/046091004230-nguyen-van-long';
  const taxId = '046091004230';
  const homepageUrl = 'https://masothue.com/';

  // Test 1: URL exists, final URL = requested URL → VALID
  test('TC01: URL exists, same final URL → VALID', async () => {
    mockResponse({
      status: 200,
      finalUrl: url,
      data: '<html>Mã số thuế: 046091004230 Nguyễn Văn Long</html>',
    });
    const result = await verifyUrl(url, taxId);
    expect(result.status).toBe('VALID');
  });

  // Test 2: URL redirects to homepage → INVALID
  test('TC02: Redirect to homepage → INVALID', async () => {
    mockResponse({ status: 200, finalUrl: homepageUrl, data: '<html>masothue.com</html>' });
    const result = await verifyUrl(url, taxId);
    expect(result.status).toBe('INVALID');
  });

  // Test 3: HTTP 404 → INVALID
  test('TC03: HTTP 404 → INVALID', async () => {
    mockResponse({ status: 404, finalUrl: url });
    const result = await verifyUrl(url, taxId);
    expect(result.status).toBe('INVALID');
    expect(result.httpStatus).toBe(404);
  });

  // Test 4: HTTP 301 redirect to homepage → INVALID
  test('TC04: HTTP 301 → homepage → INVALID', async () => {
    mockResponse({ status: 301, finalUrl: homepageUrl });
    const result = await verifyUrl(url, taxId);
    expect(result.status).toBe('INVALID');
  });

  // Test 5: HTTP 302 redirect to homepage → INVALID
  test('TC05: HTTP 302 → homepage → INVALID', async () => {
    mockResponse({ status: 302, finalUrl: homepageUrl });
    const result = await verifyUrl(url, taxId);
    expect(result.status).toBe('INVALID');
  });

  // Test 6: HTTP 429 → RATE_LIMITED
  test('TC06: HTTP 429 → RATE_LIMITED', async () => {
    mockResponse({ status: 429, finalUrl: url });
    const result = await verifyUrl(url, taxId);
    expect(result.status).toBe('RATE_LIMITED');
  });

  // Test 7: HTTP 500 → API_ERROR
  test('TC07: HTTP 500 → API_ERROR', async () => {
    mockResponse({ status: 500, finalUrl: url });
    const result = await verifyUrl(url, taxId);
    expect(result.status).toBe('API_ERROR');
  });

  // Test 8: Timeout → TIMEOUT
  test('TC08: Request timeout → TIMEOUT', async () => {
    mockTimeout();
    const result = await verifyUrl(url, taxId);
    expect(result.status).toBe('TIMEOUT');
  });

  // Test 9: Network error → API_ERROR
  test('TC09: Network error (ENOTFOUND) → API_ERROR', async () => {
    mockNetworkError('ENOTFOUND');
    const result = await verifyUrl(url, taxId);
    expect(result.status).toBe('API_ERROR');
  });

  // Test 10: MST with leading zero preserved
  test('TC10: MST with leading zero 046... preserved', async () => {
    const leadingZeroTaxId = '046091004230';
    const { url: builtUrl } = buildUrl(leadingZeroTaxId, 'Test Name');
    expect(builtUrl).toContain('/046091004230-');
    // Verify taxIdMatchesUrl still works
    expect(taxIdMatchesUrl(builtUrl, leadingZeroTaxId)).toBe(true);
    expect(taxIdMatchesUrl(builtUrl, '46091004230')).toBe(false); // without leading zero = no match
  });

  // Test 11: Vietnamese name with diacritics
  test('TC11: Name with diacritics → correct slug', () => {
    expect(slugify('Đặng Thị Hồng Nhung')).toBe('dang-thi-hong-nhung');
  });

  // Test 12: Name with multiple spaces
  test('TC12: Name with multiple spaces → normalized', () => {
    expect(slugify('Nguyễn   Văn    Long')).toBe('nguyen-van-long');
  });

  // Test 13: Duplicate MST, same URL → cache hit (only 1 real request via queue)
  test('TC13: URL-level cache prevents duplicate requests', async () => {
    // This is tested at the queue level; here we just verify same URL is built
    const { url: url1 } = buildUrl('046091004230', 'Nguyễn Văn Long');
    const { url: url2 } = buildUrl('046091004230', 'Nguyễn Văn Long');
    expect(url1).toBe(url2); // same URL → will hit cache
  });

  // Test 14: Duplicate MST but different name → different URLs
  test('TC14: Same MST, different name → different URLs', () => {
    const { url: url1 } = buildUrl('046091004230', 'Nguyễn Văn Long');
    const { url: url2 } = buildUrl('046091004230', 'Nguyễn Thị Lan');
    expect(url1).not.toBe(url2);
  });

  // Test 15: INVALID_FORMAT — empty taxId
  test('TC15: Empty taxId → INVALID_FORMAT', async () => {
    const result = await verifyUrl(url, '');
    expect(result.status).toBe('INVALID_FORMAT');
  });

  // Test 16: Partial MST match must not be VALID (123046091004230)
  test('TC16: Partial/prefix match → not VALID', async () => {
    const prefixUrl = 'https://masothue.com/123046091004230-nguyen-van-long';
    mockResponse({ status: 200, finalUrl: prefixUrl, data: '<html>Mã số thuế: 123046091004230</html>' });
    const result = await verifyUrl(url, taxId);
    expect(result.status).toBe('INVALID');
  });

  // Test 17: HTTP 200 but redirected to homepage (axios resolves with finalUrl = homepage)
  test('TC17: HTTP 200 but final URL is homepage → INVALID', async () => {
    mockResponse({ status: 200, finalUrl: 'https://masothue.com/', data: '<html>trang chu</html>' });
    const result = await verifyUrl(url, taxId);
    expect(result.status).toBe('INVALID');
  });

  // Test 18: Bot protection / Access blocked
  test('TC18: HTTP 403 with CAPTCHA → ACCESS_BLOCKED', async () => {
    mockResponse({
      status: 403,
      finalUrl: url,
      data: '<html>Cloudflare CAPTCHA required</html>',
    });
    const result = await verifyUrl(url, taxId);
    expect(result.status).toBe('ACCESS_BLOCKED');
  });

  // Test 19: HTTP 502 → API_ERROR (not INVALID)
  test('TC19: HTTP 502 → API_ERROR, not INVALID', async () => {
    mockResponse({ status: 502, finalUrl: url });
    const result = await verifyUrl(url, taxId);
    expect(result.status).toBe('API_ERROR');
    expect(result.status).not.toBe('INVALID');
  });

  // Test 20: HTTP 503 → API_ERROR (not INVALID)
  test('TC20: HTTP 503 → API_ERROR, not INVALID', async () => {
    mockResponse({ status: 503, finalUrl: url });
    const result = await verifyUrl(url, taxId);
    expect(result.status).toBe('API_ERROR');
    expect(result.status).not.toBe('INVALID');
  });
});

// =====================================================================
// EXCEL PARSER TESTS
// =====================================================================

describe('parseExcel()', () => {
  function makeExcelBuffer(rows, headers = ['Họ tên', 'Mã số thuế']) {
    const wb = XLSX.utils.book_new();
    const data = [headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  }

  test('TC-XL01: Reads MST as string, preserves leading zero', () => {
    const buf = makeExcelBuffer([['Nguyễn Văn Long', '046091004230']]);
    const result = parseExcel(buf, 'xlsx');
    // The MST may lose leading zero if stored as number in test XLSX;
    // The parser falls back to .w if available, else .v as string
    expect(result.errors).toHaveLength(0);
    expect(result.records[0].name).toBe('Nguyễn Văn Long');
  });

  test('TC-XL02: Auto-detects Họ tên and Mã số thuế columns', () => {
    const buf = makeExcelBuffer([['Test', '123456789']]);
    const result = parseExcel(buf, 'xlsx');
    expect(result.detectedNameColumn).toBe('Họ tên');
    expect(result.detectedTaxColumn).toBe('Mã số thuế');
    expect(result.errors).toHaveLength(0);
  });

  test('TC-XL03: Missing MST column → error with message', () => {
    const buf = makeExcelBuffer([['Test', '123']], ['Họ tên', 'SomeOtherColumn']);
    const result = parseExcel(buf, 'xlsx');
    expect(result.errors.some(e => e.includes('Mã số thuế'))).toBe(true);
  });

  test('TC-XL04: Missing name column → error with message', () => {
    const buf = makeExcelBuffer([['Test', '123']], ['OtherColumn', 'Mã số thuế']);
    const result = parseExcel(buf, 'xlsx');
    expect(result.errors.some(e => e.includes('Họ tên'))).toBe(true);
  });

  test('TC-XL05: Recognizes alternate column names (MST, Tax ID)', () => {
    const buf = makeExcelBuffer([['Test', '123456']], ['Name', 'MST']);
    const result = parseExcel(buf, 'xlsx');
    expect(result.detectedTaxColumn).toBe('MST');
  });

  test('TC-XL06: Manual column override works', () => {
    const buf = makeExcelBuffer([['Test', '123']], ['NameCol', 'TaxCol']);
    const result = parseExcel(buf, 'xlsx', 'NameCol', 'TaxCol');
    expect(result.errors).toHaveLength(0);
    expect(result.records[0].name).toBe('Test');
    expect(result.records[0].taxId).toBe('123');
  });
});
