/**
 * e2e-test-runner.js
 * Comprehensive end-to-end test against the running Express server at http://localhost:3000
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');

const BASE_URL = 'http://localhost:3000';

async function runE2ETest() {
  console.log('🚀 Starting End-to-End Verification Test against', BASE_URL);

  // 1. Health Check
  console.log('\n[1/5] Testing Health Check endpoint (/api/health)...');
  const healthRes = await axios.get(`${BASE_URL}/api/health`);
  console.log('✅ Health status:', healthRes.data);

  // 2. Upload Excel Test File
  console.log('\n[2/5] Testing File Upload (/api/upload)...');
  const filePath = path.join(__dirname, '..', 'test-data.xlsx');
  const form = new FormData();
  form.append('file', fs.createReadStream(filePath));

  const uploadRes = await axios.post(`${BASE_URL}/api/upload`, form, {
    headers: form.getHeaders(),
  });

  console.log('✅ Upload response:');
  console.log(`   - Filename: ${uploadRes.data.filename}`);
  console.log(`   - Total rows: ${uploadRes.data.totalRows}`);
  console.log(`   - Detected Name Column: ${uploadRes.data.detectedNameColumn}`);
  console.log(`   - Detected Tax Column: ${uploadRes.data.detectedTaxColumn}`);
  console.log(`   - Preview sample 1:`, uploadRes.data.preview[0]);
  console.log(`   - Preview sample 2:`, uploadRes.data.preview[1]);

  if (uploadRes.data.preview[0].taxId !== '046091004230') {
    throw new Error(`Leading zero lost! Got: ${uploadRes.data.preview[0].taxId}`);
  }
  console.log('✅ Leading zero verified in MST:', uploadRes.data.preview[0].taxId);

  // 3. Start Verification
  console.log('\n[3/5] Starting Verification Session (/api/verify/start)...');
  const startRes = await axios.post(`${BASE_URL}/api/verify/start`, {
    records: uploadRes.data.records,
  });
  const sessionId = startRes.data.sessionId;
  console.log(`✅ Session created: ${sessionId}, Total items: ${startRes.data.total}`);

  // 4. Poll / Stream for results
  console.log('\n[4/5] Monitoring progress & fetching results (/api/verify/result/:sessionId)...');
  let isDone = false;
  let attempts = 0;
  let finalResultData = null;

  while (!isDone && attempts < 40) {
    attempts++;
    await new Promise((r) => setTimeout(r, 1500));
    const resultRes = await axios.get(`${BASE_URL}/api/verify/result/${sessionId}`);
    finalResultData = resultRes.data;
    console.log(`   [Attempt ${attempts}] Status: ${finalResultData.status}, Completed: ${finalResultData.completedCount}/${finalResultData.total}`);
    
    if (finalResultData.status === 'done' || finalResultData.completedCount === finalResultData.total) {
      isDone = true;
    }
  }

  console.log('\n📊 Final Verification Summary:');
  console.log(JSON.stringify(finalResultData.summary, null, 2));

  console.log('\n📋 Sample Row Results:');
  finalResultData.results.slice(0, 5).forEach((r, idx) => {
    console.log(`   [#${idx + 1}] Name: ${r.name.padEnd(20)} | MST: ${r.taxId.padEnd(14)} | Status: ${r.status.padEnd(14)} | HTTP: ${String(r.httpStatus).padEnd(4)} | FinalUrl: ${r.finalUrl || 'N/A'}`);
  });

  // 5. Test Export Excel
  console.log('\n[5/5] Testing Export Excel (/api/export)...');
  const exportRes = await axios.post(
    `${BASE_URL}/api/export`,
    { results: finalResultData.results },
    { responseType: 'arraybuffer' }
  );

  console.log(`✅ Export success! Received Excel buffer of size: ${exportRes.data.length} bytes`);
  const exportPath = path.join(__dirname, 'exported-test-result.xlsx');
  fs.writeFileSync(exportPath, Buffer.from(exportRes.data));
  console.log(`✅ Exported file written to disk: ${exportPath}`);

  console.log('\n🎉 ALL END-TO-END WORKFLOW CHECKS PASSED!');
}

runE2ETest().catch((err) => {
  console.error('❌ E2E Test Failed:', err.response?.data || err.message);
  process.exit(1);
});
