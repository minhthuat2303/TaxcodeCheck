/**
 * upload.js - Handles file upload, mode switching, and single tax ID lookup
 */

document.addEventListener('DOMContentLoaded', () => {
  const dropZone    = document.getElementById('dropZone');
  const fileInput   = document.getElementById('fileInput');
  const uploadError = document.getElementById('uploadError');

  // Mode Tabs Switching
  const tabModeExcel  = document.getElementById('tabModeExcel');
  const tabModeSingle = document.getElementById('tabModeSingle');
  const modeExcelWrap = document.getElementById('modeExcelWrap');
  const modeSingleWrap = document.getElementById('modeSingleWrap');

  tabModeExcel?.addEventListener('click', () => {
    tabModeExcel.classList.add('active');
    tabModeSingle.classList.remove('active');
    modeExcelWrap.classList.remove('hidden');
    modeSingleWrap.classList.add('hidden');
  });

  tabModeSingle?.addEventListener('click', () => {
    tabModeSingle.classList.add('active');
    tabModeExcel.classList.remove('active');
    modeSingleWrap.classList.remove('hidden');
    modeExcelWrap.classList.add('hidden');
    document.getElementById('inputSingleTaxId')?.focus();
  });

  // Single Tax ID Verification Form
  const singleVerifyForm = document.getElementById('singleVerifyForm');
  const btnSingleSubmit  = document.getElementById('btnSingleSubmit');
  const singleResultCard = document.getElementById('singleResultCard');

  singleVerifyForm?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const taxIdInput = document.getElementById('inputSingleTaxId');
    const nameInput  = document.getElementById('inputSingleName');

    const taxId = taxIdInput.value.trim();
    const name  = nameInput.value.trim();

    if (!taxId) {
      showToast('Vui lòng nhập mã số thuế', 'error');
      taxIdInput.focus();
      return;
    }

    btnSingleSubmit.disabled = true;
    const origBtnText = btnSingleSubmit.textContent;
    btnSingleSubmit.textContent = 'Đang kiểm tra...';

    try {
      const res = await fetch('/api/verify/single', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taxId, name }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      // Render single result
      renderSingleResult(data);
      singleResultCard.classList.remove('hidden');
      singleResultCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    } catch (err) {
      showToast(`Lỗi: ${err.message}`, 'error');
    } finally {
      btnSingleSubmit.disabled = false;
      btnSingleSubmit.textContent = origBtnText;
    }
  });

  document.getElementById('btnSingleClear')?.addEventListener('click', () => {
    document.getElementById('inputSingleTaxId').value = '';
    document.getElementById('inputSingleName').value = '';
    singleResultCard.classList.add('hidden');
    document.getElementById('inputSingleTaxId').focus();
  });

  function renderSingleResult(data) {
    document.getElementById('singleResultPill').innerHTML = renderStatusPill(data.status);
    document.getElementById('resSingleTaxId').textContent = data.taxId || '—';
    document.getElementById('resSingleName').textContent  = data.name || '(Không nhập tên)';

    const lookupPath = data.url ? (new URL(data.url).pathname || data.url) : '—';
    document.getElementById('resSingleLookupUrl').innerHTML = `
      <a href="${escHtml(data.url)}" target="_blank" rel="noopener noreferrer" title="${escHtml(data.url)}">
        ${escHtml(lookupPath)}
      </a>
    `;

    if (data.finalUrl) {
      const finalPath = new URL(data.finalUrl).pathname || data.finalUrl;
      document.getElementById('resSingleFinalUrl').innerHTML = `
        <a href="${escHtml(data.finalUrl)}" target="_blank" rel="noopener noreferrer" title="${escHtml(data.finalUrl)}">
          ${escHtml(finalPath)}
        </a>
      `;
    } else {
      document.getElementById('resSingleFinalUrl').textContent = '—';
    }

    document.getElementById('resSingleHttp').textContent = data.httpStatus || '—';
    document.getElementById('resSingleMessage').textContent = data.message || '—';

    const timeStr = data.checkedAt ? new Date(data.checkedAt).toLocaleTimeString('vi-VN') : '';
    document.getElementById('resSingleCheckedAt').textContent = `Thời gian tra cứu: ${timeStr}`;
  }

  // Drag & drop triggers for Excel mode
  dropZone?.addEventListener('click', () => fileInput.click());

  dropZone?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInput.click();
    }
  });

  dropZone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragging');
  });

  dropZone?.addEventListener('dragleave', (e) => {
    if (!dropZone.contains(e.relatedTarget)) {
      dropZone.classList.remove('dragging');
    }
  });

  dropZone?.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragging');
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  });

  fileInput?.addEventListener('change', () => {
    if (fileInput.files[0]) handleFileUpload(fileInput.files[0]);
  });

  // Apply manual column mapping if required
  document.getElementById('btnApplyMapping')?.addEventListener('click', async () => {
    const nameCol = document.getElementById('selectNameCol').value;
    const taxCol  = document.getElementById('selectTaxCol').value;

    if (!nameCol || !taxCol) {
      showToast('Vui lòng chọn đủ cả 2 cột', 'error');
      return;
    }

    if (nameCol === taxCol) {
      showToast('Cột Họ tên và Mã số thuế không được trùng nhau', 'error');
      return;
    }

    if (!App.lastFile) {
      showToast('Không tìm thấy file, vui lòng tải lại file', 'error');
      return;
    }

    await handleFileUpload(App.lastFile, nameCol, taxCol);
  });

  // Start verification
  document.getElementById('btnStartVerify')?.addEventListener('click', startVerificationProcess);

  async function handleFileUpload(file, nameColumn = null, taxColumn = null) {
    App.lastFile = file;
    setUploadError('');

    const ext = file.name.split('.').pop().toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(ext)) {
      setUploadError(`Định dạng không được hỗ trợ (.${ext}). Vui lòng tải lên file .xlsx, .xls hoặc .csv.`);
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      setUploadError('Kích thước file vượt quá giới hạn 20MB.');
      return;
    }

    try {
      const formData = new FormData();
      formData.append('file', file);
      if (nameColumn) formData.append('nameColumn', nameColumn);
      if (taxColumn) formData.append('taxColumn', taxColumn);

      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();

      if (!res.ok) {
        setUploadError(data.error || 'Có lỗi xảy ra khi đọc file.');
        return;
      }

      App.uploadData = data;
      App.records = data.records || [];

      // Render file confirmation screen without listing rows
      renderFileReadyScreen(data, file);
      switchView('viewReady');

    } catch (err) {
      setUploadError(`Lỗi kết nối máy chủ: ${err.message}`);
    }
  }

  function setUploadError(msg) {
    if (!uploadError) return;
    if (!msg) {
      uploadError.classList.add('hidden');
      uploadError.textContent = '';
    } else {
      uploadError.textContent = msg;
      uploadError.classList.remove('hidden');
    }
  }

  function renderFileReadyScreen(data, file) {
    document.getElementById('metaFilename').textContent = file.name;
    document.getElementById('metaSize').textContent = formatFileSize(file.size);
    document.getElementById('metaTotalRows').textContent = `${data.totalRows.toLocaleString('vi-VN')} dòng`;

    const nameColEl = document.getElementById('metaNameCol');
    const taxColEl  = document.getElementById('metaTaxCol');

    if (data.detectedNameColumn) {
      nameColEl.innerHTML = `<span class="col-tag">✓ ${escHtml(data.detectedNameColumn)}</span>`;
    } else {
      nameColEl.innerHTML = `<span class="col-tag missing">✗ Chưa xác định</span>`;
    }

    if (data.detectedTaxColumn) {
      taxColEl.innerHTML = `<span class="col-tag">✓ ${escHtml(data.detectedTaxColumn)}</span>`;
    } else {
      taxColEl.innerHTML = `<span class="col-tag missing">✗ Chưa xác định</span>`;
    }

    // Populate mapping dropdowns
    const headers = data.headers || [];
    populateSelect('selectNameCol', headers, data.detectedNameColumn);
    populateSelect('selectTaxCol',  headers, data.detectedTaxColumn);

    const mappingSection = document.getElementById('mappingSection');
    const btnStart = document.getElementById('btnStartVerify');

    if (data.needsMapping) {
      mappingSection.classList.remove('hidden');
      btnStart.disabled = true;
    } else {
      mappingSection.classList.add('hidden');
      btnStart.disabled = false;
    }
  }

  function populateSelect(selectId, headers, selected) {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    sel.innerHTML = '<option value="">-- Chọn cột dữ liệu --</option>';
    headers.forEach(h => {
      const opt = document.createElement('option');
      opt.value = h;
      opt.textContent = h;
      if (h === selected) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  async function startVerificationProcess() {
    if (!App.records || App.records.length === 0) {
      showToast('Không có dữ liệu để xác minh', 'error');
      return;
    }

    const btn = document.getElementById('btnStartVerify');
    btn.disabled = true;
    btn.textContent = 'Đang khởi tạo...';

    try {
      const res = await fetch('/api/verify/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records: App.records }),
      });

      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Không thể bắt đầu phiên kiểm tra', 'error');
        btn.disabled = false;
        btn.textContent = 'Bắt đầu xác minh';
        return;
      }

      App.sessionId = data.sessionId;

      App.allResults = new Array(App.records.length).fill(null).map((_, idx) => ({
        index: idx,
        name: App.records[idx].name,
        taxId: App.records[idx].taxId,
        url: App.records[idx].url,
        status: null,
        finalUrl: null,
        httpStatus: null,
        message: null,
        checkedAt: null,
      }));

      // Switch to progress view
      switchView('viewProgress');
      initProgressView(data.total);

      // Start SSE stream
      connectVerificationSSE(data.sessionId);

    } catch (err) {
      showToast(`Lỗi: ${err.message}`, 'error');
      btn.disabled = false;
      btn.textContent = 'Bắt đầu xác minh';
    }
  }
});
