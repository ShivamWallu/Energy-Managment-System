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

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Initialize Auth and await session
  await auth.init();

  // 2. Theme Toggle Setup
  initThemeToggle();

  // 3. Navigation Tab Switching
  initTabs();

  // 4. File Upload Modal Setup
  validation.initUploadHandler();

  // 5. Initial Report List & Dashboard Load
  await window.appRefreshReports();

  // 6. Bind Filters & Search Inputs
  bindGlobalEvents();
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
          reports: []
        });
      }
      groupMap.get(gKey).reports.push(r);
    }

    // Build <optgroup> for each upload batch group
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
        // Clean option label without repeating hours or duplicate upload timestamp
        opt.textContent = `${icon} ${group.shift_date_display} • ${shiftTitle}${fname}`;
        optGroup.appendChild(opt);
      }
      select.appendChild(optGroup);
    });

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
    } else {
      activeReportId = null;
      window.activeReportId = null;
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
    if (typeof validation !== 'undefined' && validation.setUploadMode) {
      validation.setUploadMode('SINGLE');
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

