/**
 * export.js - Triggers Excel export for the completed results
 */

document.addEventListener('DOMContentLoaded', () => {
  const btnExport = document.getElementById('btnExportExcel');
  if (!btnExport) return;

  btnExport.addEventListener('click', async () => {
    const checkedRows = App.allResults.filter(r => r && r.status);
    if (checkedRows.length === 0) {
      showToast('Không có dữ liệu để xuất', 'error');
      return;
    }

    btnExport.disabled = true;
    const origText = btnExport.innerHTML;
    btnExport.textContent = 'Đang xuất file...';

    try {
      const payload = App.allResults.map((r, idx) => {
        const base = App.records[idx] || {};
        return {
          index: idx,
          name: r?.name || base.name || '',
          taxId: r?.taxId || base.taxId || '',
          url: r?.url || base.url || '',
          finalUrl: r?.finalUrl || null,
          httpStatus: r?.httpStatus || null,
          status: r?.status || 'PENDING',
          message: r?.message || 'Chưa kiểm tra',
          checkedAt: r?.checkedAt || new Date().toISOString(),
        };
      });

      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ results: payload }),
      });

      if (!res.ok) {
        throw new Error(`Mã lỗi máy chủ: ${res.status}`);
      }

      const blob = await res.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');

      const dateStr = new Date().toISOString().slice(0, 10);
      link.href = downloadUrl;
      link.download = `ket-qua-xac-minh-mst-${dateStr}.xlsx`;
      document.body.appendChild(link);
      link.click();

      setTimeout(() => {
        URL.revokeObjectURL(downloadUrl);
        document.body.removeChild(link);
      }, 1000);

      showToast(`Đã xuất thành công ${checkedRows.length.toLocaleString('vi-VN')} bản ghi`, 'success');
    } catch (err) {
      showToast(`Lỗi xuất Excel: ${err.message}`, 'error');
    } finally {
      btnExport.disabled = false;
      btnExport.innerHTML = origText;
    }
  });
});
