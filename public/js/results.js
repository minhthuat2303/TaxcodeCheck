/**
 * results.js - Renders final results table with filtering, search, and pagination
 */

function renderFullResultsView(summary = null) {
  const allChecked = App.allResults.filter(r => r && r.status);

  // Compute counts
  const validCount   = allChecked.filter(r => r.status === 'VALID').length;
  const invalidCount = allChecked.filter(r => r.status === 'INVALID').length;
  const timeoutCount = allChecked.filter(r => r.status === 'TIMEOUT').length;
  const rateCount    = allChecked.filter(r => r.status === 'RATE_LIMITED').length;
  const errorCount   = allChecked.filter(r => r.status === 'API_ERROR' || r.status === 'ACCESS_BLOCKED' || r.status === 'INVALID_FORMAT').length;

  document.getElementById('resSummaryValid').textContent   = (summary?.VALID   ?? validCount).toLocaleString('vi-VN');
  document.getElementById('resSummaryInvalid').textContent = (summary?.INVALID ?? invalidCount).toLocaleString('vi-VN');
  document.getElementById('resSummaryTimeout').textContent = (summary?.TIMEOUT ?? timeoutCount).toLocaleString('vi-VN');
  document.getElementById('resSummaryRate').textContent    = (summary?.RATE_LIMITED ?? rateCount).toLocaleString('vi-VN');
  document.getElementById('resSummaryError').textContent   = (summary ? (summary.API_ERROR || 0) + (summary.ACCESS_BLOCKED || 0) : errorCount).toLocaleString('vi-VN');

  document.getElementById('cntAll').textContent     = allChecked.length.toLocaleString('vi-VN');
  document.getElementById('cntValid').textContent   = validCount.toLocaleString('vi-VN');
  document.getElementById('cntInvalid').textContent = invalidCount.toLocaleString('vi-VN');
  document.getElementById('cntTimeout').textContent = timeoutCount.toLocaleString('vi-VN');
  document.getElementById('cntRate').textContent    = rateCount.toLocaleString('vi-VN');
  document.getElementById('cntError').textContent   = errorCount.toLocaleString('vi-VN');

  // Check if there are retryable errors (429, timeout, api error, blocked)
  const retryableRows = App.allResults.filter(r => 
    r && (r.status === 'RATE_LIMITED' || r.status === 'TIMEOUT' || r.status === 'API_ERROR' || r.status === 'ACCESS_BLOCKED')
  );

  const btnRetry = document.getElementById('btnRetryErrors');
  const btnRetryText = document.getElementById('btnRetryErrorsText');

  if (retryableRows.length > 0) {
    btnRetryText.textContent = `Kiểm tra lại ${retryableRows.length} dòng lỗi/giới hạn`;
    btnRetry.classList.remove('hidden');
  } else {
    btnRetry.classList.add('hidden');
  }

  App.currentPage = 1;
  renderTableRows();
}

function renderTableRows() {
  const allChecked = App.allResults.filter(r => r && r.status);

  // Apply active filter and search
  App.filteredResults = allChecked.filter(r => {
    if (!matchesStatusFilter(r)) return false;
    if (!matchesSearchQuery(r)) return false;
    return true;
  });

  const tbody = document.getElementById('resultsTableBody');
  const paginationText = document.getElementById('paginationText');
  const paginationBtns = document.getElementById('paginationBtns');

  if (App.filteredResults.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding: 32px; color: var(--text-light);">Không tìm thấy kết quả phù hợp</td></tr>`;
    paginationText.textContent = 'Hiển thị 0 kết quả';
    paginationBtns.innerHTML = '';
    return;
  }

  const total = App.filteredResults.length;
  const pageSize = App.pageSize;
  const maxPage = Math.ceil(total / pageSize);

  if (App.currentPage > maxPage) App.currentPage = maxPage;
  if (App.currentPage < 1) App.currentPage = 1;

  const startIdx = (App.currentPage - 1) * pageSize;
  const endIdx = Math.min(startIdx + pageSize, total);
  const pageRows = App.filteredResults.slice(startIdx, endIdx);

  tbody.innerHTML = pageRows.map((r, i) => {
    const stt = startIdx + i + 1;
    const lookupPath = formatUrlPath(r.url);
    const finalPath  = formatUrlPath(r.finalUrl);

    return `
      <tr>
        <td>${stt}</td>
        <td class="td-name">${escHtml(r.name || '—')}</td>
        <td class="td-mst">${escHtml(r.taxId || '—')}</td>
        <td class="td-url">
          <a href="${escHtml(r.url)}" target="_blank" rel="noopener noreferrer" title="${escHtml(r.url)}">
            ${escHtml(lookupPath)}
          </a>
        </td>
        <td class="td-url">
          ${r.finalUrl
            ? `<a href="${escHtml(r.finalUrl)}" target="_blank" rel="noopener noreferrer" title="${escHtml(r.finalUrl)}">${escHtml(finalPath)}</a>`
            : '—'}
        </td>
        <td>${r.httpStatus || '—'}</td>
        <td>${renderStatusPill(r.status)}</td>
        <td style="font-size: 12px; color: var(--text-light);">${escHtml(r.message || '')}</td>
      </tr>
    `;
  }).join('');

  paginationText.textContent = `Hiển thị ${startIdx + 1}–${endIdx} trong ${total.toLocaleString('vi-VN')} kết quả`;
  renderPaginationControls(maxPage, App.currentPage);
}

function renderPaginationControls(maxPage, current) {
  const container = document.getElementById('paginationBtns');
  if (!container || maxPage <= 1) {
    if (container) container.innerHTML = '';
    return;
  }

  const btns = [];
  btns.push(`<button class="page-num-btn" ${current === 1 ? 'disabled' : ''} data-page="${current - 1}">‹</button>`);

  for (let p = 1; p <= maxPage; p++) {
    if (p === 1 || p === maxPage || (p >= current - 2 && p <= current + 2)) {
      btns.push(`<button class="page-num-btn ${p === current ? 'active' : ''}" data-page="${p}">${p}</button>`);
    } else if (p === current - 3 || p === current + 3) {
      btns.push(`<span style="padding: 0 4px; color: var(--text-light);">…</span>`);
    }
  }

  btns.push(`<button class="page-num-btn" ${current === maxPage ? 'disabled' : ''} data-page="${current + 1}">›</button>`);
  container.innerHTML = btns.join('');

  container.querySelectorAll('.page-num-btn[data-page]').forEach(btn => {
    btn.addEventListener('click', () => {
      const pageNum = parseInt(btn.dataset.page, 10);
      if (pageNum >= 1 && pageNum <= maxPage) {
        App.currentPage = pageNum;
        renderTableRows();
      }
    });
  });
}

function matchesStatusFilter(record) {
  const f = App.currentFilter;
  if (f === 'ALL') return true;
  if (f === 'API_ERROR') {
    return record.status === 'API_ERROR' || record.status === 'ACCESS_BLOCKED' || record.status === 'INVALID_FORMAT';
  }
  return record.status === f;
}

function matchesSearchQuery(record) {
  const q = (App.searchQuery || '').trim().toLowerCase();
  if (!q) return true;
  const nameMatch = (record.name || '').toLowerCase().includes(q);
  const taxMatch  = (record.taxId || '').toLowerCase().includes(q);
  return nameMatch || taxMatch;
}

function formatUrlPath(url) {
  if (!url) return '—';
  try {
    const parsed = new URL(url);
    return parsed.pathname || '/';
  } catch {
    return url.replace('https://masothue.com', '');
  }
}

// Bind filter & search events
document.addEventListener('DOMContentLoaded', () => {
  const filterBtns = document.querySelectorAll('#resultFilterGroup .filter-btn');
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      App.currentFilter = btn.dataset.filter || 'ALL';
      App.currentPage = 1;
      renderTableRows();
    });
  });

  const searchInput = document.getElementById('searchInput');
  let debounceTimer;
  searchInput?.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      App.searchQuery = searchInput.value;
      App.currentPage = 1;
      renderTableRows();
    }, 200);
  });

  // Retry Unverified Rows
  document.getElementById('btnRetryErrors')?.addEventListener('click', async () => {
    const retryIndices = [];
    const retryRecords = [];

    App.allResults.forEach((r, idx) => {
      if (r && (r.status === 'RATE_LIMITED' || r.status === 'TIMEOUT' || r.status === 'API_ERROR' || r.status === 'ACCESS_BLOCKED')) {
        retryIndices.push(idx);
        retryRecords.push({
          index: idx,
          name: r.name,
          taxId: r.taxId,
          url: r.url,
        });
      }
    });

    if (retryRecords.length === 0) {
      showToast('Không có dòng lỗi nào cần kiểm tra lại', 'info');
      return;
    }

    showToast(`Bắt đầu kiểm tra lại ${retryRecords.length} dòng...`, 'info');

    // Switch to progress view for this retry batch
    switchView('viewProgress');
    initProgressView(retryRecords.length);

    try {
      const res = await fetch('/api/verify/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records: retryRecords }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Lỗi khởi tạo phiên kiểm tra');
      }

      App.sessionId = data.sessionId;
      connectVerificationSSE(data.sessionId);
    } catch (err) {
      showToast(`Lỗi: ${err.message}`, 'error');
      switchView('viewResults');
    }
  });
});
