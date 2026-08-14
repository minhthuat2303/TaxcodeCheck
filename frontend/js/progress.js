/**
 * progress.js - Real-time progress handling via SSE
 */

function initProgressView(total) {
  document.getElementById('progTotal').textContent = total.toLocaleString('vi-VN');
  document.getElementById('progDone').textContent  = '0';
  document.getElementById('progPercent').textContent = '0%';
  document.getElementById('progressBarFill').style.width = '0%';
  document.getElementById('progressStatusLabel').textContent = 'Đang tiến hành xác minh...';

  // Reset stat boxes
  ['Valid', 'Invalid', 'Timeout', 'Rate', 'Error'].forEach(k => {
    const el = document.getElementById(`stat${k}`);
    if (el) el.textContent = '0';
  });

  const btnStop = document.getElementById('btnStopVerify');
  if (btnStop) btnStop.disabled = false;
}

function connectVerificationSSE(sessionId) {
  if (App.sseSource) {
    App.sseSource.close();
    App.sseSource = null;
  }

  const url = `/api/verify/stream/${sessionId}`;
  const source = new EventSource(url);
  App.sseSource = source;

  source.addEventListener('progress', (e) => {
    const data = JSON.parse(e.data);
    onProgressTick(data);
  });

  source.addEventListener('complete', (e) => {
    const data = JSON.parse(e.data);
    onVerificationComplete(data);
    source.close();
    App.sseSource = null;
  });

  source.addEventListener('cancelled', () => {
    onVerificationCancelled();
    source.close();
    App.sseSource = null;
  });

  source.addEventListener('error', () => {
    // If SSE closes unexpectedly, fallback to polling
    if (source.readyState === EventSource.CLOSED) {
      pollVerificationFallback(sessionId);
    }
  });

  // Stop button handler
  document.getElementById('btnStopVerify')?.addEventListener('click', async () => {
    if (!App.sessionId) return;
    try {
      await fetch(`/api/verify/cancel/${App.sessionId}`, { method: 'POST' });
    } catch { /* ignore */ }
    source.close();
    App.sseSource = null;
    onVerificationCancelled();
  });
}

function onProgressTick(data) {
  const { index, completed, total, summary } = data;

  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  document.getElementById('progDone').textContent = completed.toLocaleString('vi-VN');
  document.getElementById('progPercent').textContent = `${pct}%`;
  document.getElementById('progressBarFill').style.width = `${pct}%`;

  if (summary) {
    updateProgressStatBoxes(summary);
  }

  if (index !== undefined && App.allResults[index]) {
    App.allResults[index] = {
      ...App.allResults[index],
      status:     data.status,
      finalUrl:   data.finalUrl,
      httpStatus: data.httpStatus,
      message:    data.message,
      checkedAt:  new Date().toISOString(),
    };
  }
}

function onVerificationComplete(summary) {
  showToast('Đã hoàn tất xác minh toàn bộ danh sách!', 'success');

  // Switch to Results View now that verification is complete
  setTimeout(() => {
    renderFullResultsView(summary);
    switchView('viewResults');
  }, 400);
}

function onVerificationCancelled() {
  showToast('Đã dừng tiến trình kiểm tra.', 'info');

  setTimeout(() => {
    renderFullResultsView();
    switchView('viewResults');
  }, 400);
}

function updateProgressStatBoxes(summary) {
  const map = {
    statValid:   summary.VALID || 0,
    statInvalid: summary.INVALID || 0,
    statTimeout: summary.TIMEOUT || 0,
    statRate:    summary.RATE_LIMITED || 0,
    statError:   (summary.API_ERROR || 0) + (summary.ACCESS_BLOCKED || 0) + (summary.INVALID_FORMAT || 0),
  };

  Object.entries(map).forEach(([elId, val]) => {
    const el = document.getElementById(elId);
    if (el) el.textContent = val.toLocaleString('vi-VN');
  });
}

async function pollVerificationFallback(sessionId) {
  try {
    const res = await fetch(`/api/verify/result/${sessionId}`);
    if (!res.ok) return;
    const data = await res.json();

    if (data.results) {
      data.results.forEach((r, idx) => {
        if (r && App.allResults[idx]) {
          App.allResults[idx] = { ...App.allResults[idx], ...r, checkedAt: new Date().toISOString() };
        }
      });
    }

    if (data.summary) {
      updateProgressStatBoxes(data.summary);
    }

    if (data.status === 'done') {
      onVerificationComplete(data.summary);
    } else if (data.status === 'running') {
      setTimeout(() => pollVerificationFallback(sessionId), 2000);
    }
  } catch (err) {
    console.error('[Polling error]', err);
  }
}
