// ==========================================================================
// EMS Intelligence - Master Application Coordinator
// ==========================================================================

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
window.escapeHtml = escapeHtml;

let activeReportId = null;
let currentTab = 'tab-overview';
let appInitialized = false;

async function initializeAuthenticatedApp() {
  if (appInitialized) {
    if (window.appRefreshReports) await window.appRefreshReports();
    return;
  }
  appInitialized = true;

  // 1. Navigation Tab Switching
  initTabs();

  // 2. File Upload Modal Setup
  if (window.validation && validation.initUploadHandler) {
    validation.initUploadHandler();
  }

  // 3. Bind Filters & Search Inputs
  bindGlobalEvents();

  // 4. Initial Report List & Dashboard Load
  await window.appRefreshReports();
}

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Theme Toggle Setup
  initThemeToggle();

  // 2. Listen for login success to bootstrap dashboard cleanly
  window.addEventListener('auth:login_success', async () => {
    await initializeAuthenticatedApp();
  });

  // 3. Listen for logout to reset state
  window.addEventListener('auth:logout', () => {
    appInitialized = false;
  });

  // 4. Initialize Auth and check session validity
  const isAuthenticated = await auth.init();

  // If user is validly authenticated, load dashboard immediately
  if (isAuthenticated) {
    await initializeAuthenticatedApp();
  }
});

function setCookie(name, value, days = 365) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

function getCookie(name) {
  const match = document.cookie.match(new RegExp('(^|;\\s*)(' + name + ')=([^;]*)'));
  return match ? decodeURIComponent(match[3]) : null;
}

function initThemeToggle() {
  const toggleBtn = document.getElementById('theme-toggle-btn');
  // White Theme (light) is default across the site
  let storedTheme = getCookie('ems_theme') || localStorage.getItem('ems_theme') || 'light';
  if (!localStorage.getItem('ems_theme_user_set')) {
    storedTheme = 'light';
    setCookie('ems_theme', 'light', 365);
    localStorage.setItem('ems_theme', 'light');
  }
  document.documentElement.setAttribute('data-theme', storedTheme);

  if (toggleBtn) {
    toggleBtn.innerHTML = storedTheme === 'light' ? '<i class="fa-solid fa-moon"></i>' : '<i class="fa-solid fa-sun"></i>';
    toggleBtn.setAttribute('title', storedTheme === 'light' ? 'Switch to Dark Theme' : 'Switch to White Theme');

    toggleBtn.addEventListener('click', async () => {
      const current = document.documentElement.getAttribute('data-theme');
      const nextTheme = (current === 'dark') ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', nextTheme);

      // Save user selected theme in secure cookies and localStorage
      setCookie('ems_theme', nextTheme, 365);
      localStorage.setItem('ems_theme', nextTheme);
      localStorage.setItem('ems_theme_user_set', 'true');

      toggleBtn.innerHTML = nextTheme === 'light' ? '<i class="fa-solid fa-moon"></i>' : '<i class="fa-solid fa-sun"></i>';
      toggleBtn.setAttribute('title', nextTheme === 'light' ? 'Switch to Dark Theme' : 'Switch to White Theme');
      
      // Instantly re-render charts with the new theme colors & borders
      if (typeof dashboard !== 'undefined' && dashboard.load) {
        await dashboard.load(activeReportId);
      }
    });
  }
}

function initTabs() {
  const tabButtons = document.querySelectorAll('.tab-btn');
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const targetId = btn.getAttribute('data-tab');
      currentTab = targetId;
      const targetPane = document.getElementById(targetId);
      if (targetPane) targetPane.classList.add('active');

      // Instantly reset scroll to top so tables/cards sit right at the top without unwanted space
      window.scrollTo({ top: 0, behavior: 'instant' });

      // Trigger sub-view lazy loading
      if (targetId === 'tab-machines') {
        dashboard.loadTelemetryMatrixAndLogs();
      } else if (targetId === 'tab-validation') {
        validation.switchLogsSubTab(validation.currentLogsSubTab || 'activity');
      } else if (targetId === 'tab-accounts') {
        if (window.accounts) accounts.loadAccounts();
      }
    });
  });
}

window.appRefreshReports = async function() {
  const select = document.getElementById('shift-filter-select');
  const radioContainer = document.getElementById('shift-radio-container');
  const lblDay = document.getElementById('lbl-shift-day');
  const lblNight = document.getElementById('lbl-shift-night');
  const rdoDay = lblDay ? lblDay.querySelector('input') : null;
  const rdoNight = lblNight ? lblNight.querySelector('input') : null;
  const uploadBtn = document.getElementById('btn-open-upload');
  const onboardingBanner = document.getElementById('onboarding-empty-state-banner');

  try {
    let reports = null;
    try {
      reports = await api.getReportsList();
    } catch (fetchErr) {
      console.warn('Initial getReportsList attempt failed, retrying once:', fetchErr);
      await new Promise(r => setTimeout(r, 250));
      reports = await api.getReportsList().catch(() => []);
    }
    window.allPlantReports = reports || [];

    if (!select) return;
    select.innerHTML = '';

    if (!reports || reports.length === 0) {
      select.innerHTML = '<option value="">No Reports Uploaded (Upload to Begin)</option>';
      const triggerLabel = document.getElementById('custom-report-trigger-label');
      const triggerIcon = document.getElementById('custom-report-trigger-icon');
      const menu = document.getElementById('custom-report-menu');
      if (triggerLabel) triggerLabel.textContent = 'No Reports Uploaded (Upload to Begin)';
      if (triggerIcon) triggerIcon.textContent = '📁';
      if (menu) menu.innerHTML = '<div style="padding:0.75rem; text-align:center; color:var(--text-muted); font-size:0.8rem;">No shift reports available</div>';
      if (radioContainer) radioContainer.style.display = 'none';
      if (uploadBtn) {
        uploadBtn.classList.add('btn-pulse-attention');
        uploadBtn.setAttribute('title', 'Click to upload your first SCADA shift report!');
      }
      if (onboardingBanner) {
        onboardingBanner.style.display = 'flex';
      }
      activeReportId = null;
      window.activeReportId = null;
      if (typeof dashboard !== 'undefined' && dashboard.renderEmptyState) {
        dashboard.renderEmptyState();
      }
      return;
    } else {
      if (uploadBtn) {
        uploadBtn.classList.remove('btn-pulse-attention');
        uploadBtn.removeAttribute('title');
      }
      if (onboardingBanner) {
        onboardingBanner.style.display = 'none';
      }
    }

    // Helper: synchronize all website pages and tabs for active report
    const reloadAllPagesForReport = async (repId) => {
      activeReportId = repId;
      window.activeReportId = repId;
      if (select) select.value = repId;
      syncRadioButtons();
      if (typeof syncCustomReportUI === 'function') {
        syncCustomReportUI(repId);
      }

      // 1. Reload Executive Overview / Dashboard
      await dashboard.load(activeReportId);

      // 2. Reload Table View if machine tab is active
      if (currentTab === 'tab-machines') {
        await dashboard.loadTelemetryMatrixAndLogs();
      } else if (currentTab === 'tab-validation') {
        if (validation.currentLogsSubTab === 'activity') validation.loadActivityLogs();
        else if (validation.currentLogsSubTab === 'backups') loadBackupsTable();
        if (typeof validation.loadRawReadings === 'function') {
          validation.loadRawReadings(activeReportId, null, 1);
        }
      }
    };

    // Helper: Synchronize quick switcher Day / Night radio buttons and dynamic visibility
    const syncRadioButtons = () => {
      const curReport = reports.find(r => r.id === activeReportId);
      if (!curReport) return;

      // Group sibling reports in the same upload batch session (or same shift date & upload timestamp)
      const curBatch = curReport.batch_id;
      const siblingReports = reports.filter(r => 
        (curBatch && r.batch_id === curBatch) || 
        (r.shift_date === curReport.shift_date && r.upload_date === curReport.upload_date && r.upload_time === curReport.upload_time)
      );

      const dayExists = siblingReports.some(r => r.shift_type === 'DAY' || (r.shift_label && r.shift_label.includes('Day')));
      const nightExists = siblingReports.some(r => r.shift_type === 'NIGHT' || (r.shift_label && r.shift_label.includes('Night')));

      // Strictly show only the button(s) uploaded for THIS BATCH / SESSION
      // If only Day shift was uploaded in this batch, show only Day button.
      // If only Night shift was uploaded, show only Night button.
      // If both shifts were uploaded, show both buttons.
      if (lblDay) {
        lblDay.style.display = dayExists ? 'inline-flex' : 'none';
      }
      if (lblNight) {
        lblNight.style.display = nightExists ? 'inline-flex' : 'none';
      }
      if (radioContainer) {
        radioContainer.style.display = (dayExists || nightExists) ? 'inline-flex' : 'none';
      }

      const isCurNight = (curReport.shift_type === 'NIGHT') || (curReport.shift_label && curReport.shift_label.includes('Night'));

      if (lblDay && lblNight) {
        if (isCurNight) {
          lblNight.classList.add('active-night');
          lblDay.classList.remove('active-day');
          if (rdoNight) rdoNight.checked = true;
        } else {
          lblDay.classList.add('active-day');
          lblNight.classList.remove('active-night');
          if (rdoDay) rdoDay.checked = true;
        }
      }
    };
    window.syncShiftRadioButtons = syncRadioButtons;

    // Group reports by upload session / batch and shift date
    const groupMap = new Map();
    for (const r of reports) {
      // Normalize upload timestamp to Indian Standard Time (IST) / local time
      if (r.upload_timestamp_iso) {
        try {
          const iso = r.upload_timestamp_iso.endsWith('Z') || r.upload_timestamp_iso.includes('+')
            ? r.upload_timestamp_iso 
            : r.upload_timestamp_iso + 'Z';
          const dt = new Date(iso);
          if (!isNaN(dt.getTime())) {
            const day = String(dt.getDate()).padStart(2, '0');
            const month = String(dt.getMonth() + 1).padStart(2, '0');
            const year = dt.getFullYear();
            let hours = dt.getHours();
            const mins = String(dt.getMinutes()).padStart(2, '0');
            const ampm = hours >= 12 ? 'PM' : 'AM';
            hours = hours % 12 || 12;
            const strH = String(hours).padStart(2, '0');
            r.upload_date = `${day}/${month}/${year}`;
            r.upload_time = `${strH}:${mins} ${ampm}`;
            r.upload_timestamp = `${day}/${month}/${year}, ${strH}:${mins} ${ampm}`;
          }
        } catch (e) {}
      }

      // Each distinct upload batch (or date+time) gets its own distinct group
      const gKey = r.batch_id 
        ? `batch_${r.batch_id}` 
        : `${r.shift_date}_${r.upload_date}_${r.upload_time}`;

      if (!groupMap.has(gKey)) {
        groupMap.set(gKey, {
          batch_id: r.batch_id,
          shift_date: r.shift_date,
          shift_date_display: r.shift_date_display || r.shift_date || 'Plant Shift',
          upload_date: r.upload_date || '',
          upload_time: r.upload_time || '',
          upload_timestamp: r.upload_timestamp || '',
          uploaded_by_name: r.uploaded_by_name || r.uploaded_by_username || '',
          uploaded_by_username: r.uploaded_by_username || '',
          reports: []
        });
      }
      groupMap.get(gKey).reports.push(r);
    }

    // Build <optgroup> for native hidden select
    groupMap.forEach((group) => {
      const hasDay = group.reports.some(r => r.shift_type === 'DAY' || (r.shift_label && r.shift_label.includes('Day')));
      const hasNight = group.reports.some(r => r.shift_type === 'NIGHT' || (r.shift_label && r.shift_label.includes('Night')));
      const hasBoth = hasDay && hasNight;

      const optGroup = document.createElement('optgroup');
      const availabilityTag = hasBoth 
        ? 'Dual Shifts: Day & Night' 
        : (hasDay ? 'Day Shift Only' : 'Night Shift Only');
      
      const timeTag = group.upload_time ? ` at ${group.upload_time}` : '';
      const dateTag = group.upload_date ? ` • Uploaded: ${group.upload_date}${timeTag}` : '';
      
      optGroup.label = `📅 ${group.shift_date_display} (${availabilityTag}${dateTag})`;

      for (const r of group.reports) {
        const isNight = (r.shift_type === 'NIGHT') || (r.shift_label && r.shift_label.includes('Night'));
        const icon = isNight ? '🌙' : '☀️';
        const shiftTitle = isNight ? 'Night Shift' : 'Day Shift';
        const fname = r.filename ? ` • ${r.filename}` : '';

        const opt = document.createElement('option');
        opt.value = r.id;
        opt.textContent = `${icon} ${group.shift_date_display} • ${shiftTitle}${fname}`;
        optGroup.appendChild(opt);
      }
      select.appendChild(optGroup);
    });

    // Helper: Synchronize Custom Dropdown UI (Metadata tagging, account attribution & admin deletion)
    const syncCustomReportUI = (selectedRepId) => {
      const trigger = document.getElementById('custom-report-trigger');
      const triggerIcon = document.getElementById('custom-report-trigger-icon');
      const triggerLabel = document.getElementById('custom-report-trigger-label');
      const menu = document.getElementById('custom-report-menu');
      if (!trigger || !menu) return;

      const currentUser = (typeof api !== 'undefined' && api.getUser) ? api.getUser() : null;
      const isAdmin = !!(currentUser && currentUser.role === 'admin');

      const activeRep = reports.find(r => r.id === selectedRepId);
      if (activeRep) {
        const isNight = (activeRep.shift_type === 'NIGHT') || (activeRep.shift_label && activeRep.shift_label.includes('Night'));
        if (triggerIcon) triggerIcon.textContent = isNight ? '🌙' : '☀️';
        const shiftTitle = isNight ? 'Night Shift' : 'Day Shift';
        const fname = activeRep.filename ? ` • ${activeRep.filename}` : '';
        const dateDisp = activeRep.shift_date_display || activeRep.shift_date || 'Plant Shift';
        const uploader = activeRep.uploaded_by_name || activeRep.uploaded_by_username || '';
        const upMeta = uploader ? ` | Uploaded by: ${uploader}` : '';
        if (triggerLabel) {
          triggerLabel.textContent = `${dateDisp} • ${shiftTitle}${fname}`;
          triggerLabel.title = `${dateDisp} • ${shiftTitle}${fname}${upMeta} (${activeRep.upload_timestamp || ''})`;
        }
      } else {
        if (triggerLabel) triggerLabel.textContent = 'No Report Selected';
      }

      // Build menu HTML grouped by date & upload session
      let menuHtml = '';
      groupMap.forEach((group) => {
        const hasDay = group.reports.some(r => r.shift_type === 'DAY' || (r.shift_label && r.shift_label.includes('Day')));
        const hasNight = group.reports.some(r => r.shift_type === 'NIGHT' || (r.shift_label && r.shift_label.includes('Night')));
        const hasBoth = hasDay && hasNight;
        const availabilityTag = hasBoth ? 'Dual Shifts: Day & Night' : (hasDay ? 'Day Shift Only' : 'Night Shift Only');
        const timeTag = group.upload_time ? ` at ${group.upload_time}` : '';
        const groupUploader = group.uploaded_by_name || (group.reports[0] && (group.reports[0].uploaded_by_name || group.reports[0].uploaded_by_username)) || '';

        menuHtml += `
          <div class="custom-report-group-header">
            <div class="custom-report-group-title">
              <i class="fa-regular fa-calendar-days text-cyan"></i>
              <span class="custom-report-group-date">${escapeHtml(group.shift_date_display)}</span>
              <span class="custom-report-group-pill ${hasBoth ? 'pill-dual' : 'pill-single'}">${availabilityTag}</span>
            </div>
            <div class="custom-report-group-meta">
              <span title="Batch Uploaded on ${group.upload_date}${timeTag}"><i class="fa-regular fa-clock"></i> ${group.upload_date}${timeTag}</span>
              ${groupUploader ? `<span class="group-user-tag" title="Uploaded by ${escapeHtml(groupUploader)}"><i class="fa-solid fa-user-circle"></i> ${escapeHtml(groupUploader)}</span>` : ''}
              ${isAdmin && group.batch_id ? `
                <button type="button" class="btn-report-batch-delete" title="Admin: Delete entire upload batch" onclick="event.stopPropagation(); window.promptDeleteBatch('${group.batch_id}', '${escapeHtml(group.shift_date_display)}', ${group.reports.length})">
                  <i class="fa-solid fa-trash-can"></i> Batch
                </button>
              ` : ''}
            </div>
          </div>
        `;

        for (const r of group.reports) {
          const isNight = (r.shift_type === 'NIGHT') || (r.shift_label && r.shift_label.includes('Night'));
          const icon = isNight ? '🌙' : '☀️';
          const shiftTitle = isNight ? 'Night Shift' : 'Day Shift';
          const fname = r.filename ? escapeHtml(r.filename) : '';
          const isCur = r.id === selectedRepId;
          const uploaderName = r.uploaded_by_name || r.uploaded_by_username || 'Plant User';
          const unameTag = (r.uploaded_by_username && r.uploaded_by_username !== r.uploaded_by_name) ? ` (@${escapeHtml(r.uploaded_by_username)})` : '';
          const kwhVal = (r.total_kwh != null && r.total_kwh > 0) ? `${Number(r.total_kwh).toLocaleString(undefined, {maximumFractionDigits:1})} kWh` : '48 intervals';

          menuHtml += `
            <div class="custom-report-item ${isCur ? 'active' : ''}" data-report-id="${r.id}" onclick="window.onSelectCustomReport(${r.id})">
              <div class="custom-report-item-icon-box">
                <span class="custom-report-item-icon">${icon}</span>
              </div>
              <div class="custom-report-item-body">
                <div class="custom-report-item-top">
                  <span class="custom-report-item-date">${escapeHtml(group.shift_date_display)}</span>
                  <span class="custom-report-shift-badge ${isNight ? 'badge-night' : 'badge-day'}">
                    ${icon} ${shiftTitle}
                  </span>
                  ${fname ? `<span class="custom-report-item-file" title="${fname}"><i class="fa-solid fa-file-excel text-emerald"></i> ${fname}</span>` : ''}
                </div>
                <div class="custom-report-item-bottom">
                  <span class="custom-report-meta-item uploader" title="Uploaded by ${escapeHtml(uploaderName)}${unameTag}">
                    <i class="fa-solid fa-user-circle"></i>
                    <strong>${escapeHtml(uploaderName)}</strong>${unameTag ? `<span class="meta-uname">${unameTag}</span>` : ''}
                  </span>
                  <span class="custom-report-meta-bullet">•</span>
                  <span class="custom-report-meta-item time" title="Upload Date &amp; Time: ${r.upload_date} ${r.upload_time}">
                    <i class="fa-regular fa-clock"></i> ${r.upload_date}${r.upload_time ? ` at ${r.upload_time}` : ''}
                  </span>
                  <span class="custom-report-meta-bullet">•</span>
                  <span class="custom-report-meta-item kwh" title="Total Incomer Energy">
                    <i class="fa-solid fa-bolt text-amber"></i> ${kwhVal}
                  </span>
                </div>
              </div>
              <div class="custom-report-item-end">
                ${isCur ? '<span class="custom-report-status-pill active-pill"><i class="fa-solid fa-check"></i> Active</span>' : ''}
                ${isAdmin ? `
                  <button type="button" class="btn-report-delete" title="Admin: Delete this report &amp; SCADA data" onclick="event.stopPropagation(); window.promptDeleteReport(${r.id}, '${escapeHtml(r.filename || shiftTitle)}', '${escapeHtml(group.shift_date_display)}', '${shiftTitle}', '${escapeHtml(uploaderName)}')">
                    <i class="fa-regular fa-trash-can"></i>
                  </button>
                ` : ''}
              </div>
            </div>
          `;
        }
      });

      menu.innerHTML = menuHtml;
    };
    window.syncCustomReportUI = syncCustomReportUI;

    window.onSelectCustomReport = async (repId) => {
      const dropdown = document.getElementById('custom-report-dropdown');
      if (dropdown) dropdown.classList.remove('open');
      if (activeReportId !== repId) {
        await reloadAllPagesForReport(repId);
        const rep = reports.find(r => r.id === repId);
        if (rep) {
          showToast(`Loaded ${rep.shift_label || 'Report'} (${rep.shift_date_display || rep.shift_date})`, 'info');
        }
      }
    };

    // Admin Report & Batch Deletion Handlers (GitHub-Style Safety Verification)
    let currentDeleteTarget = '';
    let currentDeleteAction = null;

    const setupDeleteVerification = (expectedName, actionFn, buttonLabel = 'Permanently Delete Report') => {
      currentDeleteTarget = (expectedName || '').trim();
      currentDeleteAction = actionFn;

      const expectedEl = document.getElementById('del-modal-expected-match');
      const inputEl = document.getElementById('del-modal-confirm-input');
      const statusIcon = document.getElementById('del-modal-match-status');
      const hintEl = document.getElementById('del-modal-hint');
      const btnConfirm = document.getElementById('btn-confirm-delete-report');
      const copyBtn = document.getElementById('btn-copy-del-match');
      const copyText = document.getElementById('btn-copy-del-text');

      if (expectedEl) expectedEl.textContent = currentDeleteTarget;
      if (inputEl) {
        inputEl.value = '';
        inputEl.style.borderColor = 'var(--border-subtle)';
        inputEl.style.boxShadow = 'none';
      }
      if (statusIcon) statusIcon.style.display = 'none';
      if (hintEl) {
        hintEl.innerHTML = `<i class="fa-solid fa-lock" style="font-size:0.7rem;"></i> <span>Button locked until typed name matches exactly.</span>`;
        hintEl.style.color = 'var(--text-muted)';
      }

      if (btnConfirm) {
        btnConfirm.disabled = true;
        btnConfirm.style.opacity = '0.45';
        btnConfirm.style.cursor = 'not-allowed';
        btnConfirm.style.boxShadow = 'none';
        btnConfirm.innerHTML = `<i class="fa-solid fa-trash-can"></i> ${buttonLabel}`;
        btnConfirm.onclick = async () => {
          if (btnConfirm.disabled) return;
          btnConfirm.disabled = true;
          btnConfirm.style.opacity = '0.7';
          btnConfirm.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Processing Deletion...`;
          try {
            await currentDeleteAction();
          } catch (err) {
            btnConfirm.disabled = false;
            btnConfirm.style.opacity = '1';
            btnConfirm.innerHTML = `<i class="fa-solid fa-trash-can"></i> ${buttonLabel}`;
          }
        };
      }

      if (copyBtn) {
        copyBtn.onclick = () => {
          if (!currentDeleteTarget) return;
          navigator.clipboard.writeText(currentDeleteTarget).then(() => {
            if (copyText) copyText.textContent = 'Copied!';
            if (copyBtn) copyBtn.style.borderColor = '#10b981';
            setTimeout(() => {
              if (copyText) copyText.textContent = 'Copy';
              if (copyBtn) copyBtn.style.borderColor = 'var(--border-subtle)';
            }, 1800);
          }).catch(() => {
            if (inputEl) {
              inputEl.value = currentDeleteTarget;
              inputEl.dispatchEvent(new Event('input'));
            }
          });
        };
      }

      if (inputEl) {
        inputEl.oninput = () => {
          const val = inputEl.value.trim();
          const target = currentDeleteTarget.trim();
          const isMatch = (val.toLowerCase() === target.toLowerCase()) && (val.length > 0);

          if (isMatch) {
            btnConfirm.disabled = false;
            btnConfirm.style.opacity = '1';
            btnConfirm.style.cursor = 'pointer';
            btnConfirm.style.boxShadow = '0 0 15px rgba(220, 38, 38, 0.45)';
            inputEl.style.borderColor = '#10b981';
            inputEl.style.boxShadow = '0 0 8px rgba(16, 185, 129, 0.25)';
            if (statusIcon) statusIcon.style.display = 'block';
            if (hintEl) {
              hintEl.innerHTML = `<i class="fa-solid fa-check" style="font-size:0.7rem; color:#10b981;"></i> <strong style="color:#10b981;">Name matched!</strong> Press Enter or click button to delete.`;
              hintEl.style.color = '#10b981';
            }
          } else {
            btnConfirm.disabled = true;
            btnConfirm.style.opacity = '0.45';
            btnConfirm.style.cursor = 'not-allowed';
            btnConfirm.style.boxShadow = 'none';
            if (val.length > 0) {
              inputEl.style.borderColor = '#ef4444';
              inputEl.style.boxShadow = '0 0 6px rgba(239, 68, 68, 0.2)';
              if (hintEl) {
                hintEl.innerHTML = `<i class="fa-solid fa-xmark" style="font-size:0.7rem; color:#ef4444;"></i> <span style="color:#f87171;">Name does not match yet.</span>`;
                hintEl.style.color = '#f87171';
              }
            } else {
              inputEl.style.borderColor = 'var(--border-subtle)';
              inputEl.style.boxShadow = 'none';
              if (hintEl) {
                hintEl.innerHTML = `<i class="fa-solid fa-lock" style="font-size:0.7rem;"></i> <span>Button locked until typed name matches exactly.</span>`;
                hintEl.style.color = 'var(--text-muted)';
              }
            }
            if (statusIcon) statusIcon.style.display = 'none';
          }
        };

        inputEl.onkeydown = (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (!btnConfirm.disabled) {
              btnConfirm.click();
            }
          }
        };
      }
    };

    window.promptDeleteReport = (reportId, filename, shiftDate, shiftTitle, uploaderName) => {
      const modal = document.getElementById('delete-report-modal');
      const titleEl = document.getElementById('del-modal-title');
      const fnEl = document.getElementById('del-modal-filename');
      const dsEl = document.getElementById('del-modal-date-shift');
      const upEl = document.getElementById('del-modal-uploader');
      const inputEl = document.getElementById('del-modal-confirm-input');

      if (!modal) return;
      if (titleEl) titleEl.textContent = 'Delete SCADA Report';
      const displayName = filename || `${shiftDate} ${shiftTitle}`;
      if (fnEl) fnEl.textContent = displayName;
      if (dsEl) dsEl.textContent = `${shiftDate} • ${shiftTitle}`;
      if (upEl) upEl.textContent = uploaderName || 'System User';

      setupDeleteVerification(displayName, async () => {
        try {
          const res = await api.deleteReport(reportId);
          showToast(res.message || 'Report deleted successfully', 'success');
          window.closeDeleteReportModal();
          await window.appRefreshReports();
        } catch (err) {
          showToast(err.message || 'Failed to delete report', 'error');
          throw err;
        }
      }, 'Permanently Delete Report');

      modal.classList.add('active');
      setTimeout(() => { if (inputEl) inputEl.focus(); }, 150);
    };

    window.promptDeleteBatch = (batchId, shiftDate, reportCount) => {
      const modal = document.getElementById('delete-report-modal');
      const titleEl = document.getElementById('del-modal-title');
      const fnEl = document.getElementById('del-modal-filename');
      const dsEl = document.getElementById('del-modal-date-shift');
      const upEl = document.getElementById('del-modal-uploader');
      const inputEl = document.getElementById('del-modal-confirm-input');

      if (!modal) return;
      if (titleEl) titleEl.textContent = 'Delete Shift Reports Batch';
      const batchTarget = `${shiftDate} Batch`;
      if (fnEl) fnEl.textContent = `Entire Upload Batch (${reportCount} shift reports)`;
      if (dsEl) dsEl.textContent = `${shiftDate} • All Batch Reports`;
      if (upEl) upEl.textContent = 'Batch Upload';

      setupDeleteVerification(batchTarget, async () => {
        try {
          const res = await api.deleteReportBatch(batchId);
          showToast(res.message || 'Batch deleted successfully', 'success');
          window.closeDeleteReportModal();
          await window.appRefreshReports();
        } catch (err) {
          showToast(err.message || 'Failed to delete batch', 'error');
          throw err;
        }
      }, 'Permanently Delete Entire Batch');

      modal.classList.add('active');
      setTimeout(() => { if (inputEl) inputEl.focus(); }, 150);
    };

    window.closeDeleteReportModal = () => {
      const modal = document.getElementById('delete-report-modal');
      if (modal) modal.classList.remove('active');
      const inputEl = document.getElementById('del-modal-confirm-input');
      if (inputEl) inputEl.value = '';
    };

    // Toggle dropdown open/close
    const dropdownWrap = document.getElementById('custom-report-dropdown');
    const triggerBtn = document.getElementById('custom-report-trigger');
    if (triggerBtn && !triggerBtn.dataset.bound) {
      triggerBtn.dataset.bound = 'true';
      triggerBtn.onclick = (e) => {
        e.stopPropagation();
        dropdownWrap?.classList.toggle('open');
      };
    }

    if (!window.customReportDropdownGlobalBound) {
      window.customReportDropdownGlobalBound = true;
      document.addEventListener('click', (e) => {
        const dd = document.getElementById('custom-report-dropdown');
        if (dd && !dd.contains(e.target)) {
          dd.classList.remove('open');
        }
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          const dd = document.getElementById('custom-report-dropdown');
          if (dd) dd.classList.remove('open');
          window.closeDeleteReportModal?.();
        }
      });
    }

    // Determine initial active report (preserve existing active report if still valid; else default to latest Day Shift)
    let chosenReport = null;
    if (activeReportId) {
      chosenReport = reports.find(r => r.id === activeReportId);
    }
    if (!chosenReport) {
      // Find first Day Shift
      chosenReport = reports.find(r => r.shift_type === 'DAY' || (r.shift_label && r.shift_label.includes('Day'))) || reports[0];
    }

    if (chosenReport) {
      activeReportId = chosenReport.id;
      window.activeReportId = chosenReport.id;
      select.value = chosenReport.id;
      syncCustomReportUI(chosenReport.id);
    } else {
      activeReportId = null;
      window.activeReportId = null;
      syncCustomReportUI(null);
    }

    // 1-Click Day Shift Radio Button handler
    if (lblDay) {
      lblDay.onclick = async (e) => {
        const curReport = reports.find(r => r.id === activeReportId);
        const curBatch = curReport ? curReport.batch_id : null;
        const curDate = curReport ? curReport.shift_date : null;

        // 1. Try finding Day Shift within the same upload batch first
        let targetDayReport = reports.find(r => 
          curBatch && r.batch_id === curBatch && 
          (r.shift_type === 'DAY' || (r.shift_label && r.shift_label.includes('Day')))
        );

        // 2. If not found in batch, search by same shift date
        if (!targetDayReport) {
          targetDayReport = reports.find(r => 
            r.shift_date === curDate && 
            (r.shift_type === 'DAY' || (r.shift_label && r.shift_label.includes('Day')))
          );
        }

        // 3. Fall back to any latest Day report
        if (!targetDayReport) {
          targetDayReport = reports.find(r => r.shift_type === 'DAY' || (r.shift_label && r.shift_label.includes('Day')));
        }

        if (targetDayReport) {
          if (activeReportId !== targetDayReport.id) {
            await reloadAllPagesForReport(targetDayReport.id);
            showToast(`Switched to ☀️ Day Shift (${targetDayReport.shift_date_display || targetDayReport.shift_date})`, 'info');
          }
        } else {
          showToast(`No Day Shift report uploaded${curReport ? ' for ' + curReport.shift_date_display : ''}`, 'warning');
          syncRadioButtons();
        }
      };
    }

    // 1-Click Night Shift Radio Button handler
    if (lblNight) {
      lblNight.onclick = async (e) => {
        const curReport = reports.find(r => r.id === activeReportId);
        const curBatch = curReport ? curReport.batch_id : null;
        const curDate = curReport ? curReport.shift_date : null;

        // 1. Try finding Night Shift within the same upload batch first
        let targetNightReport = reports.find(r => 
          curBatch && r.batch_id === curBatch && 
          (r.shift_type === 'NIGHT' || (r.shift_label && r.shift_label.includes('Night')))
        );

        // 2. If not found in batch, search by same shift date
        if (!targetNightReport) {
          targetNightReport = reports.find(r => 
            r.shift_date === curDate && 
            (r.shift_type === 'NIGHT' || (r.shift_label && r.shift_label.includes('Night')))
          );
        }

        // 3. Fall back to any latest Night report
        if (!targetNightReport) {
          targetNightReport = reports.find(r => r.shift_type === 'NIGHT' || (r.shift_label && r.shift_label.includes('Night')));
        }

        if (targetNightReport) {
          if (activeReportId !== targetNightReport.id) {
            await reloadAllPagesForReport(targetNightReport.id);
            showToast(`Switched to 🌙 Night Shift (${targetNightReport.shift_date_display || targetNightReport.shift_date})`, 'info');
          }
        } else {
          showToast(`No Night Shift report uploaded${curReport ? ' for ' + curReport.shift_date_display : ''}`, 'warning');
          syncRadioButtons();
        }
      };
    }

    syncRadioButtons();

    // Bind Dropdown Change Listener
    select.onchange = async (e) => {
      const newId = e.target.value ? parseInt(e.target.value, 10) : null;
      if (newId) {
        await reloadAllPagesForReport(newId);
        const rep = reports.find(r => r.id === newId);
        if (rep) {
          showToast(`Loaded ${rep.shift_label || 'Report'} (${rep.shift_date_display || rep.shift_date})`, 'info');
        }
      }
    };

    // Load initial dashboard
    if (activeReportId) {
      await dashboard.load(activeReportId);
    }
  } catch (err) {
    console.error('Failed to refresh reports:', err);
  }
};

function bindGlobalEvents() {
  // Machine filters
  document.getElementById('machine-search-input')?.addEventListener('input', () => dashboard.filterMachines());
  document.getElementById('machine-section-filter')?.addEventListener('change', () => dashboard.filterMachines());

  // Expeller Deep-Dive Tabs
  if (typeof dashboard !== 'undefined' && dashboard.initExpellerTabs) {
    dashboard.initExpellerTabs();
  }

  // Raw inspector pagination
  document.getElementById('btn-raw-prev')?.addEventListener('click', () => {
    if (rawReadingsPage > 1) {
      rawReadingsPage--;
      validation.loadRawReadings(activeReportId || 1, null, rawReadingsPage);
    }
  });
  document.getElementById('btn-raw-next')?.addEventListener('click', () => {
    rawReadingsPage++;
    validation.loadRawReadings(activeReportId || 1, null, rawReadingsPage);
  });

  // Modal toggles
  document.getElementById('btn-open-upload')?.addEventListener('click', () => {
    if (typeof validation !== 'undefined') {
      if (validation.resetUploadModal) {
        validation.resetUploadModal();
      }
      if (validation.setUploadMode) {
        validation.setUploadMode('SINGLE');
      }
    }
    document.getElementById('upload-modal')?.classList.add('active');
  });
  document.getElementById('btn-close-upload')?.addEventListener('click', () => {
    document.getElementById('upload-modal')?.classList.remove('active');
  });

  // CSV Export Button
  document.getElementById('btn-export-csv')?.addEventListener('click', () => {
    const repId = activeReportId || 1;
    window.open(`/api/export/csv?report_id=${repId}`, '_blank');
  });

  // Refresh Backups Button
  document.getElementById('btn-refresh-backups')?.addEventListener('click', () => {
    loadBackupsTable();
  });
}

async function loadBackupsTable() {
  const tbody = document.getElementById('backups-table-body');
  if (!tbody) return;

  try {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:2rem; color:var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Loading secure backups...</td></tr>`;
    const backups = await api.getBackupsList();
    if (!backups || backups.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:2.5rem; color:var(--text-muted); font-size:0.88rem;"><i class="fa-solid fa-box-open" style="font-size:1.5rem; margin-bottom:0.5rem; display:block; opacity:0.6;"></i>No archived report backups found in vault.</td></tr>`;
      return;
    }

    let rowsHtml = '';
    for (const b of backups) {
      let badgeClass = 'badge-info';
      let icon = 'fa-file-shield';
      if (b.status_tag === 'Latest Upload') {
        badgeClass = 'badge-success';
        icon = 'fa-circle-check';
      } else if (b.status_tag === 'Previous Upload') {
        badgeClass = 'badge-warning';
        icon = 'fa-clock-rotate-left';
      }

      rowsHtml += `
        <tr>
          <td><span class="badge ${badgeClass}"><i class="fa-solid ${icon}"></i> ${b.status_tag}</span></td>
          <td style="font-weight:600; color:var(--text-primary); font-family:var(--font-mono); font-size:0.78rem; word-break:break-all; white-space:normal; line-height:1.35; max-width:280px;">${b.original_filename}</td>
          <td style="font-family:var(--font-mono); font-size:0.76rem; color:var(--text-muted); word-break:break-all; white-space:normal; line-height:1.35; max-width:280px;">${b.backup_filename}</td>
          <td style="font-family:var(--font-mono); font-size:0.8rem; color:var(--text-secondary); white-space:nowrap;">${b.timestamp}</td>
          <td style="font-family:var(--font-mono); font-size:0.82rem; text-align:right; font-weight:700; color:var(--accent-cyan);">${b.size_kb} KB</td>
          <td style="text-align:center;">
            <a href="/api/reports/backups/download/${encodeURIComponent(b.backup_filename)}" class="btn btn-secondary btn-sm" style="font-size:0.74rem; padding:0.25rem 0.6rem; text-decoration:none;" download>
              <i class="fa-solid fa-download text-emerald"></i> Download
            </a>
          </td>
        </tr>
      `;
    }
    tbody.innerHTML = rowsHtml;
  } catch (err) {
    console.error('Failed to load backups:', err);
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:2rem; color:var(--accent-red);"><i class="fa-solid fa-circle-exclamation"></i> Failed to load backups: ${err.message}</td></tr>`;
  }
}

