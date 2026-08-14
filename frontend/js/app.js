/**
 * app.js - Global state and screen switching
 */

window.App = {
  // Navigation: 'viewUpload' | 'viewReady' | 'viewProgress' | 'viewResults'
  currentView: 'viewUpload',

  // Uploaded file & records
  uploadData: null,
  records: [],
  lastFile: null,

  // Verification session
  sessionId: null,
  sseSource: null,

  // Verification results
  allResults: [],
  filteredResults: [],
  currentFilter: 'ALL',
  searchQuery: '',
  currentPage: 1,
  pageSize: 50,
};

function switchView(viewId) {
  document.querySelectorAll('.page').forEach(el => el.classList.remove('active'));
  const target = document.getElementById(viewId);
  if (target) target.classList.add('active');
  App.currentView = viewId;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showToast(message, type = 'info', duration = 3500) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const icon = type === 'error' ? '⚠️' : type === 'success' ? '✓' : 'ℹ';
  toast.innerHTML = `<span style="font-weight:700">${icon}</span> <span>${escHtml(message)}</span>`;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.2s ease';
    setTimeout(() => toast.remove(), 200);
  }, duration);
}

function renderStatusPill(status) {
  const labelMap = {
    VALID: 'HỢP LỆ',
    INVALID: 'KHÔNG HỢP LỆ',
    TIMEOUT: 'TIMEOUT',
    RATE_LIMITED: 'GIỚI HẠN',
    API_ERROR: 'LỖI HỆ THỐNG',
    ACCESS_BLOCKED: 'BỊ CHẶN',
    INVALID_FORMAT: 'SAI ĐỊNH DẠNG',
  };

  const label = labelMap[status] || status;
  return `<span class="status-pill ${status}"><span class="status-pill-dot"></span>${label}</span>`;
}

function formatFileSize(bytes) {
  if (!bytes || isNaN(bytes)) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function resetToUpload() {
  if (App.sseSource) {
    App.sseSource.close();
    App.sseSource = null;
  }
  App.uploadData = null;
  App.records = [];
  App.sessionId = null;
  App.allResults = [];
  App.filteredResults = [];
  App.currentFilter = 'ALL';
  App.searchQuery = '';
  App.currentPage = 1;

  const fileInput = document.getElementById('fileInput');
  if (fileInput) fileInput.value = '';

  const err = document.getElementById('uploadError');
  if (err) err.classList.add('hidden');

  switchView('viewUpload');
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btnCancelFile')?.addEventListener('click', resetToUpload);
  document.getElementById('btnNewCheck')?.addEventListener('click', resetToUpload);
  document.getElementById('btnNewCheckTop')?.addEventListener('click', resetToUpload);
});
