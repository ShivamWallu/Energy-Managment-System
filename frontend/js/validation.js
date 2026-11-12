// ==========================================================================
// EMS Intelligence - Validation Findings & Raw Data Audit
// ==========================================================================

let rawReadingsPage = 1;
const rawReadingsPageSize = 48;

const validation = {
  currentLogsSubTab: 'activity',
  activitySearchTimer: null,
  activityState: {
    page: 1,
    limit: 10,
    search: '',
    activityType: 'ALL',
    status: 'ALL',
    sortOrder: 'desc',
    total: 0,
    totalPages: 1,
    items: []
  },

  switchLogsSubTab(tabName) {
    this.currentLogsSubTab = tabName;
    ['activity', 'backups'].forEach(t => {
      const btn = document.getElementById(`btn-subtab-${t}`);
      const sec = document.getElementById(`logs-section-${t}`);
      if (btn) {
        if (t === tabName) btn.classList.add('active');
        else btn.classList.remove('active');
      }
      if (sec) {
        sec.style.display = (t === tabName) ? 'block' : 'none';
      }
    });

    if (tabName === 'activity') {
      this.loadActivityLogs();
    } else if (tabName === 'backups') {
      if (typeof loadBackupsTable === 'function') loadBackupsTable();
    }
  },

  async loadActivityLogs() {
    const tbody = document.getElementById('activity-logs-tbody');
    const tableWrap = document.querySelector('#logs-section-activity .table-responsive');
    const toolbar = document.querySelector('#logs-section-activity .table-toolbar');
    const footer = document.querySelector('#logs-section-activity .pagination-footer');
    const restrictedNotice = document.getElementById('activity-restricted-notice');

    const currentUser = api.getUser();
    if (!currentUser || currentUser.role !== 'admin') {
      if (tableWrap) tableWrap.style.display = 'none';
      if (toolbar) toolbar.style.display = 'none';
      if (footer) footer.style.display = 'none';
      if (restrictedNotice) restrictedNotice.style.display = 'block';
      return;
    }

    if (tableWrap) tableWrap.style.display = 'block';
    if (toolbar) toolbar.style.display = 'flex';
    if (footer) footer.style.display = 'flex';
    if (restrictedNotice) restrictedNotice.style.display = 'none';

    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:2rem; color:var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Loading activity logs...</td></tr>`;
    }

    try {
      const data = await api.getActivityLogs({
        page: this.activityState.page,
        limit: this.activityState.limit,
        search: this.activityState.search,
        activity_type: this.activityState.activityType,
        status: this.activityState.status,
        sort_by: 'timestamp',
        sort_order: this.activityState.sortOrder
      });

      this.activityState.total = data.total;
      this.activityState.totalPages = data.total_pages;
      this.activityState.items = data.items || [];

      this.renderActivityLogsTable(data.items || []);
      this.renderActivityPagination(data);
    } catch (err) {
      console.error('Failed to load activity logs:', err);
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:1.5rem; color:var(--accent-red);"><i class="fa-solid fa-circle-exclamation"></i> ${err.message}</td></tr>`;
      }
      showToast(err.message, 'error');
    }
  },

  renderActivityLogsTable(items) {
    const tbody = document.getElementById('activity-logs-tbody');
    if (!tbody) return;

    if (!items || items.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:2.5rem; color:var(--text-muted);"><i class="fa-solid fa-inbox" style="font-size:1.8rem; margin-bottom:0.5rem; display:block; opacity:0.6;"></i>No user activities match the current filter.</td></tr>`;
      return;
    }

    let rowsHtml = '';
    for (const item of items) {
      // Activity Type Badge
      let typeBadge = `<span class="badge badge-info">${item.activity_type_label}</span>`;
      if (item.activity_type === 'USER_LOGIN') {
        typeBadge = `<span class="badge badge-activity-login"><i class="fa-solid fa-right-to-bracket"></i> User Login</span>`;
      } else if (item.activity_type === 'USER_LOGOUT') {
        typeBadge = `<span class="badge badge-activity-logout"><i class="fa-solid fa-right-from-bracket"></i> User Logout</span>`;
      } else if (item.activity_type === 'NEW_REGISTRATION') {
        typeBadge = `<span class="badge badge-activity-register"><i class="fa-solid fa-user-plus"></i> New Registration</span>`;
      } else if (item.activity_type === 'EXCEL_UPLOAD') {
        typeBadge = `<span class="badge badge-activity-upload"><i class="fa-solid fa-file-excel"></i> Excel Upload</span>`;
      } else if (item.activity_type === 'INVALID_EXCEL_UPLOAD') {
        typeBadge = `<span class="badge badge-activity-invalid"><i class="fa-solid fa-triangle-exclamation"></i> Invalid Excel Upload</span>`;
      }

      // Status Badge
      let statusBadge = `<span class="badge badge-success"><i class="fa-solid fa-check"></i> SUCCESS</span>`;
      if (item.status === 'FAILED') {
        statusBadge = `<span class="badge badge-critical"><i class="fa-solid fa-xmark"></i> FAILED</span>`;
      } else if (item.status === 'WARNING') {
        statusBadge = `<span class="badge badge-warning"><i class="fa-solid fa-triangle-exclamation"></i> WARNING</span>`;
      }

      rowsHtml += `
        <tr>
          <td>
            <div style="display:flex; align-items:center; gap:0.5rem;">
              <div style="width:28px; height:28px; border-radius:50%; background:rgba(0,210,255,0.12); display:flex; align-items:center; justify-content:center; color:var(--accent-cyan); font-weight:700; font-size:0.75rem;">
                ${(item.user_name || 'U').charAt(0).toUpperCase()}
              </div>
              <div>
                <div style="font-weight:700; color:var(--text-primary); font-size:0.84rem;">${item.user_name}</div>
              </div>
            </div>
          </td>
          <td>
            <a href="mailto:${item.email}" style="color:var(--text-secondary); font-family:var(--font-mono); font-size:0.78rem; text-decoration:none;" title="${item.email}">
              <i class="fa-regular fa-envelope" style="margin-right:0.25rem; opacity:0.7;"></i>${item.email}
            </a>
          </td>
          <td>${typeBadge}</td>
          <td>
            <div style="font-size:0.8rem; line-height:1.45; color:var(--text-primary); max-width:420px;">
              ${item.description}
            </div>
          </td>
          <td style="font-family:var(--font-mono); font-size:0.78rem; color:var(--text-secondary); white-space:nowrap;">
            <i class="fa-regular fa-clock" style="margin-right:0.3rem; opacity:0.7;"></i>${item.date_time}
          </td>
          <td style="text-align:center;">${statusBadge}</td>
        </tr>
      `;
    }

    tbody.innerHTML = rowsHtml;
  },

  renderActivityPagination(data) {
    const total = data.total || 0;
    const page = data.page || 1;
    const limit = data.limit || 10;
    const totalPages = data.total_pages || 1;

    const start = total === 0 ? 0 : (page - 1) * limit + 1;
    const end = Math.min(page * limit, total);

    const startEl = document.getElementById('activity-showing-start');
    const endEl = document.getElementById('activity-showing-end');
    const totalEl = document.getElementById('activity-total-records');
    if (startEl) startEl.textContent = start;
    if (endEl) endEl.textContent = end;
    if (totalEl) totalEl.textContent = total;

    const prevBtn = document.getElementById('btn-activity-prev');
    const nextBtn = document.getElementById('btn-activity-next');
    if (prevBtn) prevBtn.disabled = (page <= 1);
    if (nextBtn) nextBtn.disabled = (page >= totalPages);

    const pagesContainer = document.getElementById('activity-page-numbers');
    if (pagesContainer) {
      let pagesHtml = '';
      const maxPagesToShow = 5;
      let startP = Math.max(1, page - 2);
      let endP = Math.min(totalPages, startP + maxPagesToShow - 1);
      if (endP - startP < maxPagesToShow - 1) {
        startP = Math.max(1, endP - maxPagesToShow + 1);
      }

      for (let p = startP; p <= endP; p++) {
        pagesHtml += `<button class="page-btn ${p === page ? 'active' : ''}" onclick="validation.gotoActivityPage(${p})">${p}</button>`;
      }
      pagesContainer.innerHTML = pagesHtml;
    }
  },

  onActivitySearch(val) {
    clearTimeout(this.activitySearchTimer);
    this.activitySearchTimer = setTimeout(() => {
      this.activityState.search = val.trim();
      this.activityState.page = 1;
      this.loadActivityLogs();
    }, 300);
  },

  onActivityTypeFilter(val) {
    this.activityState.activityType = val;
    this.activityState.page = 1;
    this.loadActivityLogs();
  },

  onActivityStatusFilter(val) {
    this.activityState.status = val;
    this.activityState.page = 1;
    this.loadActivityLogs();
  },

  onActivitySort(order) {
    this.activityState.sortOrder = order;
    this.activityState.page = 1;
    this.loadActivityLogs();
  },

  onActivityLimitChange(limitVal) {
    this.activityState.limit = parseInt(limitVal, 10) || 10;
    this.activityState.page = 1;
    this.loadActivityLogs();
  },

  changeActivityPage(delta) {
    const newPage = this.activityState.page + delta;
    if (newPage >= 1 && newPage <= this.activityState.totalPages) {
      this.activityState.page = newPage;
      this.loadActivityLogs();
    }
  },

  gotoActivityPage(page) {
    if (page >= 1 && page <= this.activityState.totalPages) {
      this.activityState.page = page;
      this.loadActivityLogs();
    }
  },

  exportActivityCsv() {
    const items = this.activityState.items || [];
    if (!items.length) {
      showToast('No activity records available to export.', 'warning');
      return;
    }

    const headers = ['User Name', 'Email', 'Activity Type', 'Description', 'Date & Time', 'Status', 'IP Address'];
    const rows = items.map(item => [
      `"${(item.user_name || '').replace(/"/g, '""')}"`,
      `"${(item.email || '').replace(/"/g, '""')}"`,
      `"${(item.activity_type_label || item.activity_type).replace(/"/g, '""')}"`,
      `"${(item.description || '').replace(/"/g, '""')}"`,
      `"${(item.date_time || '').replace(/"/g, '""')}"`,
      `"${(item.status || '').replace(/"/g, '""')}"`,
      `"${(item.ip_address || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `EMS_Activity_Logs_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Activity logs exported to CSV successfully.', 'success');
  },

  // Raw Readings Inspection Table
  async loadRawReadings(reportId, colIndex = null, page = 1) {
    try {
      const data = await api.getRawReadings(reportId, colIndex, null, page, rawReadingsPageSize);
      this.renderRawTable(data);
    } catch (err) {
      console.error('Failed to load raw readings:', err);
      showToast(err.message, 'error');
    }
  },

  renderRawTable(data) {
    const tbody = document.getElementById('raw-table-body');
    if (!tbody) return;

    const readings = data.readings || [];
    if (readings.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:2rem; color:var(--text-muted);">No raw records found.</td></tr>`;
      return;
    }

    let rowsHtml = '';
    for (const r of readings) {
      let styleTag = '<span style="color:var(--text-muted); font-size:0.75rem;">Standard</span>';
      let cellClass = '';
      
      if (r.cell_style === 'green') {
        styleTag = '<span class="badge badge-success"><i class="fa-solid fa-leaf"></i> Operator Highlight (Green)</span>';
        cellClass = 'cell-green';
      } else if (r.cell_style === 'soft_red') {
        styleTag = '<span class="badge badge-critical"><i class="fa-solid fa-wrench"></i> Downtime / Red Tint</span>';
        cellClass = 'cell-soft-red';
      }

      const dupTag = r.is_duplicate_col ? '<span class="badge badge-warning" style="margin-left:0.35rem;">Duplicate Col</span>' : '';

      rowsHtml += `
        <tr>
          <td style="font-family:var(--font-mono); font-size:0.8rem; color:var(--text-muted);">${r.interval_index + 1}</td>
          <td style="font-family:var(--font-mono); font-size:0.82rem; font-weight:600; color:var(--text-primary);">${r.timestamp_str}</td>
          <td style="font-family:var(--font-mono); font-size:0.8rem; color:var(--text-muted);">Col #${r.col_index}</td>
          <td>
            <div style="font-weight:600; color:var(--text-primary);">${r.source_name} ${dupTag}</div>
            <div style="font-size:0.72rem; color:var(--text-muted);">${r.location || ''}</div>
          </td>
          <td class="${cellClass}" style="font-family:var(--font-mono); font-weight:700; font-size:0.95rem;">
            ${r.raw_value_str !== "" ? r.raw_value_str : '<span style="color:var(--text-muted); font-style:italic; font-weight:normal;">[BLANK]</span>'}
          </td>
          <td style="font-family:var(--font-mono); color:var(--text-secondary);">${r.numeric_value !== null ? `${r.numeric_value} kWh` : '—'}</td>
          <td>${styleTag}</td>
        </tr>
      `;
    }

    tbody.innerHTML = rowsHtml;

    // Pagination info
    const totalPages = Math.ceil((data.total_count || 1) / rawReadingsPageSize);
    const pageLabel = document.getElementById('raw-page-label');
    if (pageLabel) pageLabel.textContent = `Page ${data.page} of ${totalPages} (${data.total_count} records)`;
  },

  // Upload Management
  currentUploadMode: 'SINGLE',
  dualFile1: null,
  dualFile2: null,

  setUploadMode(mode) {
    this.currentUploadMode = mode;
    const optSingle = document.getElementById('opt-mode-single');
    const optDual = document.getElementById('opt-mode-dual');
    const secSingle = document.getElementById('single-upload-section');
    const secDual = document.getElementById('dual-upload-section');

    if (mode === 'SINGLE') {
      optSingle?.classList.add('active');
      optDual?.classList.remove('active');
      if (secSingle) secSingle.style.display = 'block';
      if (secDual) secDual.style.display = 'none';
    } else {
      optDual?.classList.add('active');
      optSingle?.classList.remove('active');
      if (secSingle) secSingle.style.display = 'none';
      if (secDual) secDual.style.display = 'block';
      this.checkDualSubmitReady();
    }
  },

  resetUploadModal() {
    this.dualFile1 = null;
    this.dualFile2 = null;
    this.renderDualFileSlot(1);
    this.renderDualFileSlot(2);
    this.checkDualSubmitReady();

    const inpSingle = document.getElementById('file-upload-input');
    const inp1 = document.getElementById('file-dual-input-1');
    const inp2 = document.getElementById('file-dual-input-2');
    if (inpSingle) inpSingle.value = '';
    if (inp1) inp1.value = '';
    if (inp2) inp2.value = '';

    const progressWrap = document.getElementById('upload-progress-wrap');
    if (progressWrap) progressWrap.style.display = 'none';

    const errCallout = document.getElementById('upload-error-callout');
    if (errCallout) errCallout.style.display = 'none';
  },

  initUploadHandler() {
    const dropzone = document.getElementById('upload-dropzone');
    const fileInput = document.getElementById('file-upload-input');

    if (dropzone && fileInput) {
      // Clear value on click so re-selecting same file fires change event
      fileInput.addEventListener('click', (e) => { e.target.value = null; });

      // Clicking anywhere in the single dropzone box opens file dialog
      dropzone.addEventListener('click', (e) => {
        if (e.target.tagName !== 'BUTTON') {
          fileInput.click();
        }
      });

      ['dragenter', 'dragover'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
          e.preventDefault();
          dropzone.classList.add('dragover');
        });
      });

      ['dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
          e.preventDefault();
          dropzone.classList.remove('dragover');
        });
      });

      dropzone.addEventListener('drop', (e) => {
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
          fileInput.files = e.dataTransfer.files;
          this.handleUpload(fileInput.files[0]);
        }
      });

      fileInput.addEventListener('change', () => {
        if (fileInput.files && fileInput.files.length) {
          this.handleUpload(fileInput.files[0]);
        }
      });
    }

    // Dual Upload Setup
    const input1 = document.getElementById('file-dual-input-1');
    const input2 = document.getElementById('file-dual-input-2');
    const dropzone1 = document.getElementById('dual-dropzone-1');
    const dropzone2 = document.getElementById('dual-dropzone-2');
    const btnSubmitDual = document.getElementById('btn-submit-dual-upload');

    // Clear value on click so choosing same file again fires change event
    input1?.addEventListener('click', (e) => { e.target.value = null; });
    input2?.addEventListener('click', (e) => { e.target.value = null; });

    // Clicking anywhere in Day Shift box opens its file dialog
    dropzone1?.addEventListener('click', (e) => {
      if (!e.target.closest('.btn-remove-chip') && e.target.tagName !== 'BUTTON') {
        input1?.click();
      }
    });

    // Clicking anywhere in Night Shift box opens its file dialog
    dropzone2?.addEventListener('click', (e) => {
      if (!e.target.closest('.btn-remove-chip') && e.target.tagName !== 'BUTTON') {
        input2?.click();
      }
    });

    // Drag & Drop for Day Shift box
    if (dropzone1 && input1) {
      ['dragenter', 'dragover'].forEach(name => {
        dropzone1.addEventListener(name, (e) => { e.preventDefault(); dropzone1.classList.add('dragover'); });
      });
      ['dragleave', 'drop'].forEach(name => {
        dropzone1.addEventListener(name, (e) => { e.preventDefault(); dropzone1.classList.remove('dragover'); });
      });
      dropzone1.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone1.classList.remove('dragover');
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
          this.dualFile1 = e.dataTransfer.files[0];
          this.renderDualFileSlot(1);
          this.checkDualSubmitReady();
        }
      });
    }

    // Drag & Drop for Night Shift box
    if (dropzone2 && input2) {
      ['dragenter', 'dragover'].forEach(name => {
        dropzone2.addEventListener(name, (e) => { e.preventDefault(); dropzone2.classList.add('dragover'); });
      });
      ['dragleave', 'drop'].forEach(name => {
        dropzone2.addEventListener(name, (e) => { e.preventDefault(); dropzone2.classList.remove('dragover'); });
      });
      dropzone2.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone2.classList.remove('dragover');
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
          this.dualFile2 = e.dataTransfer.files[0];
          this.renderDualFileSlot(2);
          this.checkDualSubmitReady();
        }
      });
    }

    input1?.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length) {
        this.dualFile1 = e.target.files[0];
        this.renderDualFileSlot(1);
        this.checkDualSubmitReady();
      }
    });

    input2?.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length) {
        this.dualFile2 = e.target.files[0];
        this.renderDualFileSlot(2);
        this.checkDualSubmitReady();
      }
    });

    btnSubmitDual?.addEventListener('click', async () => {
      if (!this.dualFile1 && !this.dualFile2) {
        showToast('Please select at least one shift file to upload.', 'warning');
        return;
      }
      btnSubmitDual.disabled = true;
      btnSubmitDual.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Processing &amp; Validating Telemetry...`;
      try {
        await this.handleDualUpload();
      } catch (err) {
        console.error('Dual upload invocation error:', err);
      } finally {
        this.checkDualSubmitReady();
      }
    });
  },

  renderDualFileSlot(slotNum) {
    const isSlot1 = (slotNum === 1);
    const file = isSlot1 ? this.dualFile1 : this.dualFile2;
    const nameEl = document.getElementById(`dual-file-${slotNum}-name`);
    const actionWrap = document.getElementById(`dual-action-wrap-${slotNum}`);
    const dropzone = document.getElementById(`dual-dropzone-${slotNum}`);

    if (file) {
      if (nameEl) {
        nameEl.innerHTML = `
          <div class="selected-file-chip" title="${escapeHtml(file.name)}">
            <i class="fa-solid fa-file-excel text-emerald" style="font-size:1.05rem;"></i>
            <span class="selected-file-name">${escapeHtml(file.name)}</span>
          </div>
        `;
      }
      if (actionWrap) {
        actionWrap.innerHTML = `
          <button type="button" class="btn-remove-chip" onclick="event.stopPropagation(); validation.removeDualFile(${slotNum})" title="Remove this file and choose another">
            <i class="fa-solid fa-trash-can" style="font-size:0.75rem;"></i> Remove File
          </button>
        `;
      }
      if (dropzone) {
        dropzone.style.borderColor = 'var(--accent-cyan)';
        dropzone.style.background = 'rgba(0, 210, 255, 0.04)';
      }
    } else {
      if (nameEl) {
        nameEl.innerHTML = `<span style="font-size:0.76rem; color:var(--text-muted);">No file selected</span>`;
      }
      if (actionWrap) {
        const shiftTitle = isSlot1 ? 'Day Shift' : 'Night Shift';
        actionWrap.innerHTML = `
          <button type="button" class="btn btn-secondary btn-sm" id="btn-choose-dual-${slotNum}" onclick="document.getElementById('file-dual-input-${slotNum}').click()">Choose ${shiftTitle} File</button>
        `;
      }
      if (dropzone) {
        dropzone.style.borderColor = '';
        dropzone.style.background = '';
      }
    }
  },

  removeDualFile(slotNum) {
    if (slotNum === 1) {
      this.dualFile1 = null;
      const inp = document.getElementById('file-dual-input-1');
      if (inp) inp.value = '';
      this.renderDualFileSlot(1);
    } else {
      this.dualFile2 = null;
      const inp = document.getElementById('file-dual-input-2');
      if (inp) inp.value = '';
      this.renderDualFileSlot(2);
    }
    this.checkDualSubmitReady();
  },

  checkDualSubmitReady() {
    const btn = document.getElementById('btn-submit-dual-upload');
    if (btn) {
      const has1 = !!this.dualFile1;
      const has2 = !!this.dualFile2;
      const hasAny = has1 || has2;

      btn.disabled = !hasAny;

      if (has1 && has2) {
        btn.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i> Upload Both Shifts (Day &amp; Night)`;
        btn.classList.add('btn-ready-glow');
        btn.style.cursor = 'pointer';
        btn.style.opacity = '1';
      } else if (has1) {
        btn.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i> Upload Day Shift Report (${escapeHtml(this.dualFile1.name)})`;
        btn.classList.add('btn-ready-glow');
        btn.style.cursor = 'pointer';
        btn.style.opacity = '1';
      } else if (has2) {
        btn.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i> Upload Night Shift Report (${escapeHtml(this.dualFile2.name)})`;
        btn.classList.add('btn-ready-glow');
        btn.style.cursor = 'pointer';
        btn.style.opacity = '1';
      } else {
        btn.innerHTML = `<i class="fa-solid fa-lock" style="font-size:0.8rem; margin-right:4px;"></i> Select Shift File to Proceed`;
        btn.classList.remove('btn-ready-glow');
        btn.style.cursor = 'not-allowed';
        btn.style.opacity = '0.6';
      }
    }
  },

  async handleUpload(file) {
    const statusText = document.getElementById('upload-status-text');
    const pctText = document.getElementById('upload-pct-text');
    const stageDesc = document.getElementById('upload-stage-desc');
    const progressBar = document.getElementById('upload-progress-bar');
    const progressWrap = document.getElementById('upload-progress-wrap');
    const errCallout = document.getElementById('upload-error-callout');
    const errText = document.getElementById('upload-error-callout-text');

    if (errCallout) errCallout.style.display = 'none';
    if (progressWrap) progressWrap.style.display = 'block';

    const setProgress = (pct, title, desc, color) => {
      if (progressBar) {
        progressBar.style.width = `${pct}%`;
        if (color) progressBar.style.background = color;
      }
      if (pctText) pctText.textContent = `${pct}%`;
      if (statusText) statusText.innerHTML = title;
      if (stageDesc) stageDesc.textContent = desc;
    };

    // Stage 1: File reading & header validation
    setProgress(25, `<i class="fa-solid fa-spinner fa-spin text-cyan"></i> Validating Excel headers...`, `Inspecting column layout & sequence for "${file.name}"`, 'linear-gradient(90deg, #00d2ff, #38bdf8)');

    // Stage 2: Telemetry Interval parsing simulation step
    const stage2Timer = setTimeout(() => {
      setProgress(55, `<i class="fa-solid fa-spinner fa-spin text-cyan"></i> Parsing 48 telemetry intervals...`, `Extracting 15-minute slot kWh readings & timestamps...`);
    }, 400);

    // Stage 3: Mathematical energy calculations
    const stage3Timer = setTimeout(() => {
      setProgress(85, `<i class="fa-solid fa-calculator text-cyan"></i> Executing motor analytics...`, `Verifying 10%-40% low-load & >80% overload health benchmarks...`);
    }, 850);

    try {
      const res = await api.uploadReport(file);
      clearTimeout(stage2Timer);
      clearTimeout(stage3Timer);

      setProgress(100, `<i class="fa-solid fa-circle-check text-emerald"></i> Ingestion &amp; Calculations Complete!`, `Shift "${res.report_name || file.name}" processed successfully. Status: ${res.validation_status}`, 'linear-gradient(90deg, #10b981, #00e676)');

      showToast(res.message, 'success');
      
      setTimeout(async () => {
        const modal = document.getElementById('upload-modal');
        if (modal) modal.classList.remove('active');
        if (progressWrap) progressWrap.style.display = 'none';
        
        await window.appRefreshReports();
        if (typeof dashboard !== 'undefined' && dashboard.loadTelemetryMatrixAndLogs) {
          dashboard.loadTelemetryMatrixAndLogs();
        }
      }, 1000);

    } catch (err) {
      clearTimeout(stage2Timer);
      clearTimeout(stage3Timer);
      setProgress(100, `<i class="fa-solid fa-circle-xmark text-red"></i> Upload / Validation Failed`, err.message, '#ef4444');
      if (errCallout && errText) {
        errText.innerHTML = `<strong>Validation Error:</strong> ${err.message}`;
        errCallout.style.display = 'block';
      }
      showToast(err.message, 'error');
      const singleInput = document.getElementById('file-upload-input');
      if (singleInput) singleInput.value = '';
    }
  },

  async handleDualUpload() {
    if (!this.dualFile1 && !this.dualFile2) {
      showToast('Please select at least one shift file to upload.', 'warning');
      return;
    }

    const isBoth = !!(this.dualFile1 && this.dualFile2);
    const targetFile = this.dualFile1 || this.dualFile2;

    const statusText = document.getElementById('upload-status-text');
    const pctText = document.getElementById('upload-pct-text');
    const stageDesc = document.getElementById('upload-stage-desc');
    const progressBar = document.getElementById('upload-progress-bar');
    const progressWrap = document.getElementById('upload-progress-wrap');
    const errCallout = document.getElementById('upload-error-callout');
    const errText = document.getElementById('upload-error-callout-text');

    if (errCallout) errCallout.style.display = 'none';
    if (progressWrap) progressWrap.style.display = 'block';

    const setProgress = (pct, title, desc, color) => {
      if (progressBar) {
        progressBar.style.width = `${pct}%`;
        if (color) progressBar.style.background = color;
      }
      if (pctText) pctText.textContent = `${pct}%`;
      if (statusText) statusText.innerHTML = title;
      if (stageDesc) stageDesc.textContent = desc;
    };

    if (isBoth) {
      setProgress(20, `<i class="fa-solid fa-spinner fa-spin text-cyan"></i> Ingesting Shift 1 &amp; Shift 2 files...`, `Validating Day & Night shift report formats...`, 'linear-gradient(90deg, #00d2ff, #a855f7)');
    } else {
      const shiftName = this.dualFile1 ? 'Day Shift' : 'Night Shift';
      setProgress(25, `<i class="fa-solid fa-spinner fa-spin text-cyan"></i> Ingesting ${shiftName} ("${targetFile.name}")...`, `Validating Excel headers and SCADA column layout...`, 'linear-gradient(90deg, #00d2ff, #38bdf8)');
    }

    const timer1 = setTimeout(() => {
      setProgress(50, `<i class="fa-solid fa-spinner fa-spin text-purple"></i> Cross-validating telemetry timestamps...`, isBoth ? `Processing 96 intervals (Day 48 + Night 48) across 59 SCADA columns...` : `Extracting 15-minute slot kWh readings & timestamps...`);
    }, 450);

    const timer2 = setTimeout(() => {
      setProgress(80, `<i class="fa-solid fa-calculator text-amber"></i> Calculating Energy Balances &amp; Health...`, `Verifying Incomer vs 10 Expellers &amp; Kohlu motor loads...`);
    }, 900);

    try {
      let res;
      if (isBoth) {
        res = await api.uploadMultiReports([this.dualFile1, this.dualFile2]);
      } else {
        res = await api.uploadReport(targetFile);
      }
      clearTimeout(timer1);
      clearTimeout(timer2);

      const successTitle = isBoth ? 'Both Shifts Successfully Ingested!' : 'Shift Report Successfully Ingested!';
      setProgress(100, `<i class="fa-solid fa-circle-check text-emerald"></i> ${successTitle}`, res.message, 'linear-gradient(90deg, #10b981, #00e676)');
      showToast(res.message, 'success');

      setTimeout(async () => {
        const modal = document.getElementById('upload-modal');
        if (modal) modal.classList.remove('active');
        if (progressWrap) progressWrap.style.display = 'none';
        
        // Reset dual state
        this.dualFile1 = null;
        this.dualFile2 = null;
        this.renderDualFileSlot(1);
        this.renderDualFileSlot(2);
        this.checkDualSubmitReady();
        
        await window.appRefreshReports();
        if (typeof dashboard !== 'undefined' && dashboard.loadTelemetryMatrixAndLogs) {
          dashboard.loadTelemetryMatrixAndLogs();
        }
      }, 1100);

    } catch (err) {
      clearTimeout(timer1);
      clearTimeout(timer2);
      setProgress(100, `<i class="fa-solid fa-circle-xmark text-red"></i> Ingestion Failed`, err.message, '#ef4444');
      if (errCallout && errText) {
        errText.innerHTML = `<strong>Validation Error:</strong> ${err.message}`;
        errCallout.style.display = 'block';
      }
      showToast(err.message, 'error');
    }
  }
};
