// ==========================================================================
// EMS Intelligence - Dashboard & Motor Health Coordinator
// ==========================================================================

let currentReportId = null;
let currentMachinesData = [];
let currentHealthFilter = 'ALL';
let currentExpellerNum = 1;
let currentKohluNum = 1;
let currentPanelType = 'EXPELLER';
let currentRatingFilter = 'all';

const dashboard = {
  async load(reportId = null) {
    currentReportId = reportId;
    try {
      // 2X Faster Parallel Fetch: Launch metadata and motor cards telemetry simultaneously
      const expellerTask = (currentExpellerNum === 'all') 
        ? this.loadAllExpellersDetail() 
        : this.loadExpellerDetail(currentExpellerNum || 1);

      const [data] = await Promise.all([
        api.getDashboardData(reportId),
        expellerTask
      ]);
      
      // If user has not uploaded any reports yet, render clean professional empty state
      if (!data || data.is_empty || !data.reports_list || data.reports_list.length === 0) {
        this.renderEmptyState();
        return;
      }

      // Hide onboarding banner if reports exist
      const banner = document.getElementById('onboarding-empty-state-banner');
      if (banner) banner.style.display = 'none';
      const uploadBtn = document.getElementById('btn-open-upload');
      if (uploadBtn) uploadBtn.classList.remove('btn-pulse-attention');

      // 1. Render Anomaly Badge & KPIs
      this.renderKPIs(data.kpis);
      this.renderHierarchy(data);

      // 2. Render Priority Graphs (Health Timeline if present)
      if (data.health_timeline && data.health_timeline.labels && document.getElementById('chart-health-timeline')) {
        charts.renderMotorHealthTimeline('chart-health-timeline', data.health_timeline);
      }

      // 3. Lazy-load Machine Table in background (non-blocking for 2X faster initial view)
      const repIdForMachines = reportId || (data.reports_list && data.reports_list[0] ? data.reports_list[0].id : 1);
      setTimeout(() => {
        this.loadMachines(repIdForMachines).catch(e => console.warn('Background machines load:', e));
      }, 50);

    } catch (err) {
      if (err.message && (err.message.includes('blocked') || err.message.includes('revoked'))) {
        return;
      }
      console.error('Failed to load dashboard:', err);
      // Guarantee fallback so the view is NEVER blank white
      const grid = document.getElementById('expeller-motors-grid');
      if (!grid || !grid.children || grid.children.length === 0) {
        this.renderEmptyState();
      }
      showToast(err.message || 'Error loading dashboard telemetry', 'error');
    }
  },

  renderEmptyState() {
    // 1. Show prominent onboarding banner
    const banner = document.getElementById('onboarding-empty-state-banner');
    if (banner) banner.style.display = 'flex';

    // 2. Pulse Upload EMS Report button
    const uploadBtn = document.getElementById('btn-open-upload');
    if (uploadBtn) {
      uploadBtn.classList.add('btn-pulse-attention');
      uploadBtn.setAttribute('title', 'Click to upload your first SCADA shift report!');
    }

    // 3. Reset Dropdown
    const select = document.getElementById('shift-filter-select');
    if (select) {
      select.innerHTML = '<option value="">No Reports Uploaded (Upload to Begin)</option>';
    }

    // 4. Hide shift switcher buttons
    const radioContainer = document.getElementById('shift-radio-container');
    if (radioContainer) radioContainer.style.display = 'none';

    // 5. Render 5 Clean Empty Expeller Motor Cards
    const grid = document.getElementById('expeller-motors-grid');
    if (grid) {
      const emptyMotors = [
        { code: 'P1', hp: 75, name: 'Main Worm Crushing Drive' },
        { code: 'P2', hp: 60, name: 'Secondary Squeezer Drive' },
        { code: 'P3', hp: 60, name: 'Deep Press Extraction Drive' },
        { code: 'P4', hp: 50, name: 'Seed Feeder & Hopper Drive' },
        { code: 'P5', hp: 50, name: 'Cake Discharge Drive' }
      ];

      let html = '';
      for (const m of emptyMotors) {
        html += `
          <div class="motor-card empty-motor-card" style="opacity:0.9;">
            <div class="motor-card-header">
              <div class="motor-card-head-left">
                <div class="motor-card-title-row">
                  <i class="fa-solid fa-bolt text-cyan"></i>
                  <span class="motor-code">${m.code}</span>
                  <span class="motor-hp-badge badge-hp-75">${m.hp} HP</span>
                </div>
                <div class="motor-col-tag">${m.name}</div>
              </div>
              <div class="motor-card-head-right">
                <span class="badge badge-secondary" style="font-size:0.7rem; padding:0.18rem 0.45rem;">
                  <i class="fa-regular fa-clock"></i> Awaiting Shift Report
                </span>
              </div>
            </div>

            <!-- Statistical Metrics (Clean Dashes) -->
            <div class="motor-metrics-row" style="margin-bottom:0.4rem;">
              <div class="motor-metric-mini">
                <span class="motor-metric-mini-label">MIN</span>
                <span class="motor-metric-mini-val" style="color:var(--text-muted);">-- <span style="font-size:0.65rem; font-weight:normal;">kWh</span></span>
              </div>
              <div class="motor-metric-mini">
                <span class="motor-metric-mini-label">MAX</span>
                <span class="motor-metric-mini-val" style="color:var(--text-muted);">-- <span style="font-size:0.65rem; font-weight:normal;">kWh</span></span>
              </div>
              <div class="motor-metric-mini">
                <span class="motor-metric-mini-label">AVG</span>
                <span class="motor-metric-mini-val" style="color:var(--text-muted);">-- <span style="font-size:0.65rem; font-weight:normal;">kWh</span></span>
              </div>
              <div class="motor-metric-mini">
                <span class="motor-metric-mini-label">SUM</span>
                <span class="motor-metric-mini-val" style="color:var(--text-muted);">-- <span style="font-size:0.65rem; font-weight:normal;">kWh</span></span>
              </div>
            </div>

            <!-- Empty Load Status Bar -->
            <div style="margin:0.5rem 0; padding:0.45rem 0.6rem; background:var(--bg-secondary); border-radius:var(--radius-sm); border:1px solid var(--border-subtle); font-size:0.75rem; color:var(--text-muted); display:flex; justify-content:space-between; align-items:center;">
              <span><i class="fa-solid fa-gauge-simple"></i> Load Status:</span>
              <strong style="color:var(--text-secondary);">Awaiting Upload (0%)</strong>
            </div>

            <!-- Empty Graph Placeholder (No fake lines or charts rendered) -->
            <div class="motor-canvas-wrap" style="height:120px; display:flex; flex-direction:column; align-items:center; justify-content:center; background:rgba(0,0,0,0.18); border-radius:6px; border:1px dashed var(--border-subtle); color:var(--text-muted); font-size:0.78rem; gap:0.45rem;">
              <i class="fa-solid fa-chart-line" style="font-size:1.4rem; opacity:0.35;"></i>
              <span>Telemetry graph will plot upon report ingestion</span>
            </div>

            <div class="motor-audit-box audit-box-stopped" style="margin-top:0.6rem;">
              <i class="fa-solid fa-circle-info text-cyan" style="margin-right:0.35rem;"></i>
              <strong>Manager Note:</strong> Initial Setup: Upload an Excel shift report to activate live SCADA telemetry.
            </div>

            <button class="btn-view-details" onclick="document.getElementById('btn-open-upload').click()" style="margin-top:0.6rem;">
              <i class="fa-solid fa-cloud-arrow-up text-cyan"></i> Upload Report to Activate
            </button>
          </div>
        `;
      }
      grid.innerHTML = html;
    }

    // 6. Clean Power Flow / Hierarchy cards
    const hierarchyContainer = document.getElementById('hierarchy-levels');
    if (hierarchyContainer) {
      hierarchyContainer.innerHTML = `
        <div class="flow-step-card" style="opacity:0.8;">
          <div class="flow-step-header">
            <span class="flow-step-tag">Tier 1 • Main Intake</span>
            <i class="fa-solid fa-tower-broadcast text-cyan"></i>
          </div>
          <div class="flow-step-name">Main Incomer 4 F1</div>
          <div class="flow-step-value" style="color:var(--text-muted);">-- <span style="font-size:0.8rem; font-weight:normal;">kWh</span></div>
          <div class="flow-step-detail">Awaiting shift report ingestion.</div>
        </div>
        <div class="flow-step-card" style="opacity:0.8;">
          <div class="flow-step-header">
            <span class="flow-step-tag">Tier 2 • Distribution Bus</span>
            <i class="fa-solid fa-network-wired text-purple"></i>
          </div>
          <div class="flow-step-name">Outgoing Feeders Sum</div>
          <div class="flow-step-value" style="color:var(--text-muted);">-- <span style="font-size:0.8rem; font-weight:normal;">kWh</span></div>
          <div class="flow-step-detail">Awaiting shift report ingestion.</div>
        </div>
        <div class="flow-step-card" style="opacity:0.8;">
          <div class="flow-step-header">
            <span class="flow-step-tag">Tier 3 • Production Units</span>
            <i class="fa-solid fa-industry text-amber"></i>
          </div>
          <div class="flow-step-name">Expellers + Kohlus Inflow</div>
          <div class="flow-step-value" style="color:var(--text-muted);">-- <span style="font-size:0.8rem; font-weight:normal;">kWh</span></div>
          <div class="flow-step-detail">Awaiting shift report ingestion.</div>
        </div>
        <div class="flow-step-card" style="opacity:0.8;">
          <div class="flow-step-header">
            <span class="flow-step-tag">Tier 4 • Machine End-Use</span>
            <i class="fa-solid fa-gears text-emerald"></i>
          </div>
          <div class="flow-step-name">Validated Sub-Motors Sum</div>
          <div class="flow-step-value" style="color:var(--text-muted);">-- <span style="font-size:0.8rem; font-weight:normal;">kWh</span></div>
          <div class="flow-step-detail">Awaiting shift report ingestion.</div>
        </div>
      `;
    }
  },

  renderKPIs(kpis) {
    if (!kpis) return;
  },

  renderHierarchy(data) {
    const container = document.getElementById('hierarchy-levels');
    if (!container) return;

    const kpis = data.kpis || {};
    let html = `
      <div class="flow-step-card">
        <div class="flow-step-header">
          <span class="flow-step-tag">Tier 1 • Main Intake</span>
          <i class="fa-solid fa-tower-broadcast text-cyan"></i>
        </div>
        <div class="flow-step-name">Main Incomer 4 F1</div>
        <div class="flow-step-value">${Number(kpis.main_incomer_kwh || 0).toLocaleString()} <span style="font-size:0.8rem; font-weight:normal;">kWh</span></div>
        <div class="flow-step-detail">Power House PCC Panel 415V Bus. Primary metering point for the plant.</div>
      </div>

      <div class="flow-step-card">
        <div class="flow-step-header">
          <span class="flow-step-tag">Tier 2 • Distribution Bus</span>
          <i class="fa-solid fa-network-wired text-purple"></i>
        </div>
        <div class="flow-step-name">Outgoing Feeders Sum</div>
        <div class="flow-step-value">${Number(kpis.pcc_feeders_total_kwh || 0).toLocaleString()} <span style="font-size:0.8rem; font-weight:normal;">kWh</span></div>
        <div class="flow-step-detail">PCC feeders supplying Expeller MCCs, Kohlu MCCs, and plant auxiliary loads.</div>
      </div>

      <div class="flow-step-card">
        <div class="flow-step-header">
          <span class="flow-step-tag">Tier 3 • Production Units</span>
          <i class="fa-solid fa-industry text-amber"></i>
        </div>
        <div class="flow-step-name">Expellers + Kohlus Inflow</div>
        <div class="flow-step-value">${Number((kpis.expeller_incomers_kwh || 0) + (kpis.kohlu_incomers_kwh || 0)).toLocaleString()} <span style="font-size:0.8rem; font-weight:normal;">kWh</span></div>
        <div class="flow-step-detail">Expellers 1–5 (${Number(kpis.expeller_incomers_kwh || 0).toLocaleString()} kWh) + Kohlus 1–2 (${Number(kpis.kohlu_incomers_kwh || 0).toLocaleString()} kWh).</div>
      </div>

      <div class="flow-step-card">
        <div class="flow-step-header">
          <span class="flow-step-tag">Tier 4 • Machine End-Use</span>
          <i class="fa-solid fa-gears text-emerald"></i>
        </div>
        <div class="flow-step-name">Validated Sub-Motors Sum</div>
        <div class="flow-step-value">${Number((kpis.expeller_motors_deduped_kwh || 0) + (kpis.kohlu_motors_cleaned_kwh || 0)).toLocaleString()} <span style="font-size:0.8rem; font-weight:normal;">kWh</span></div>
        <div class="flow-step-detail">Duplicate motor columns are counted once; readings above the telemetry-spike limit are excluded from this adjusted total, with raw readings retained.</div>
      </div>
    `;

    container.innerHTML = html;
  },

  async loadMachines(reportId, section = null) {
    try {
      const data = await api.getMachines(reportId, section);
      currentMachinesData = data;
      this.renderMachinesTable(data);
    } catch (err) {
      console.error('Failed to load machines:', err);
      showToast(err.message, 'error');
    }
  },

  renderMachinesTable(machines) {
    const tbody = document.getElementById('machines-table-body');
    if (!tbody) return;

    if (!machines || machines.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:2rem; color:var(--text-muted);">No machines found matching filter.</td></tr>`;
      return;
    }

    let rowsHtml = '';
    for (const m of machines) {
      // Benchmark calculation text
      let benchmarkStr = '—';
      if (m.motor_hp && m.rated_15m_kwh) {
        const kw = (m.motor_hp * 0.744).toFixed(1);
        benchmarkStr = `<span style="color:var(--text-primary); font-weight:600;">${m.rated_15m_kwh.toFixed(2)} units</span> <span style="font-size:0.75rem; color:var(--text-muted);">(${kw} kW)</span>`;
      }

      // WhatsApp Health Operating Range Badge:
      // 10% - 40%: Low-load / Idle
      // 50% - 80%: Healthy Operating Load
      // > 80%: Overload Risk
      let healthBadge = '<span class="badge" style="background:rgba(255,255,255,0.06); color:var(--text-muted);">Feeder / Bus</span>';
      if (m.motor_hp !== null) {
        const load = m.avg_load_pct;
        if (load === null || load < 10.0) {
          healthBadge = `<span class="badge" style="background:rgba(100,116,139,0.15); color:#94a3b8;"><i class="fa-solid fa-power-off"></i> Stopped (<10%)</span>`;
        } else if (load > 80.0) {
          healthBadge = `<span class="badge badge-critical"><i class="fa-solid fa-triangle-exclamation"></i> OVERLOAD (>80%) • ${load}%</span>`;
        } else if (load >= 50.0 && load <= 80.0) {
          healthBadge = `<span class="badge badge-success"><i class="fa-solid fa-circle-check"></i> HEALTHY (50–80%) • ${load}%</span>`;
        } else if (load >= 10.0 && load < 40.0) {
          healthBadge = `<span class="badge badge-warning"><i class="fa-solid fa-gauge-simple-low"></i> LOW-LOAD (10–40%) • ${load}%</span>`;
        } else { // 40% to 50%
          healthBadge = `<span class="badge badge-info"><i class="fa-solid fa-check"></i> Normal • ${load}%</span>`;
        }
      }

      // Sum Verification
      const verBadge = m.sum_verified
        ? `<span class="badge badge-success" title="Calculated sum perfectly matches Excel summary"><i class="fa-solid fa-check-double"></i> Verified</span>`
        : `<span class="badge badge-warning" title="Discrepancy: ${m.verification_diff} kWh"><i class="fa-solid fa-exclamation"></i> Diff: ${m.verification_diff}</span>`;

      rowsHtml += `
        <tr>
          <td><span style="font-family:var(--font-mono); font-size:0.8rem; color:var(--text-muted);">#${m.col_index}</span></td>
          <td>
            <div style="font-weight:600; color:var(--text-primary);">${m.source_name}</div>
            <div style="font-size:0.75rem; color:var(--text-muted);">${m.location || 'Power Distribution'}</div>
          </td>
          <td>${m.motor_hp ? `<span class="badge badge-info" style="font-weight:700;">${m.motor_hp} HP</span>` : '<span style="color:var(--text-muted); font-size:0.8rem;">Panel Feeder</span>'}</td>
          <td style="font-family:var(--font-mono);">${benchmarkStr}</td>
          <td style="font-family:var(--font-mono); font-weight:700; color:var(--accent-cyan);">${Number(m.calc_sum || 0).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 })}</td>
          <td style="font-family:var(--font-mono); color:var(--text-secondary);">${m.excel_sum || '—'}</td>
          <td>${healthBadge}</td>
          <td style="text-align:center;">
            ${m.count_idle > 0 ? `<span class="badge badge-warning">${m.count_idle}</span>` : '0'}
          </td>
          <td>${verBadge}</td>
        </tr>
      `;
    }

    tbody.innerHTML = rowsHtml;
  },

  filterMachines() {
    const searchVal = document.getElementById('machine-search-input')?.value.toLowerCase().trim() || '';
    const sectionVal = document.getElementById('machine-section-filter')?.value || 'ALL';
    const healthVal = currentHealthFilter;

    const filtered = currentMachinesData.filter(m => {
      const matchSearch = m.source_name.toLowerCase().includes(searchVal) || (m.location && m.location.toLowerCase().includes(searchVal));
      if (!matchSearch) return false;

      // Section Filter
      if (sectionVal === 'EXPELLER' && !m.source_name.toUpperCase().includes('EXPELLER')) return false;
      if (sectionVal === 'KOHLU' && !m.source_name.toUpperCase().includes('KOHLU')) return false;
      if (sectionVal === 'PCC' && !(m.location.toUpperCase().includes('POWER HOUSE') || m.source_name.toUpperCase().includes('INC') || m.source_name.toUpperCase().includes('PANEL'))) return false;

      // Health Filter
      const healthyMaxPct = 80.0;
      const overloadPct = 80.0;
      if (healthVal === 'HEALTHY') return m.motor_hp && m.avg_load_pct >= 50.0 && m.avg_load_pct <= healthyMaxPct;
      if (healthVal === 'IDLE') return m.motor_hp && m.avg_load_pct >= 10.0 && m.avg_load_pct < 40.0;
      if (healthVal === 'OVERLOAD') return m.motor_hp && m.avg_load_pct > overloadPct;

      return true;
    });

    this.renderMachinesTable(filtered);
  },

  setHealthFilter(filterType) {
    currentHealthFilter = filterType;
    document.querySelectorAll('.health-filter-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-health-filter') === filterType);
    });
    this.filterMachines();
  },

  // Expeller Machine Deep-Dive Logic
  currentExpellerData: null,
  allExpellersData: null,
  currentKohluData: null,
  allKohlusData: null,
  currentRatingMotors: null,
  currentMatrixMaxCol: null,

  setRatingFilterStatus(filterDescription = '') {
    const container = document.getElementById('motor-rating-filter-container');
    const status = document.getElementById('rating-filter-status');
    const isFiltered = Boolean(filterDescription);
    if (container) container.classList.toggle('has-active-filter', isFiltered);
    if (!status) return;

    status.classList.toggle('is-filtered', isFiltered);
    status.replaceChildren();
    if (!isFiltered) {
      status.textContent = 'Showing: All Motors in Current Section';
      return;
    }

    const label = document.createElement('span');
    label.className = 'rating-filter-active-label';
    label.innerHTML = '<i class="fa-solid fa-filter-circle-dollar" aria-hidden="true"></i> Filter active';
    const description = document.createElement('strong');
    description.className = 'rating-filter-active-description';
    description.textContent = filterDescription;
    const clearButton = document.createElement('button');
    clearButton.type = 'button';
    clearButton.className = 'rating-filter-clear-btn';
    clearButton.setAttribute('aria-label', 'Remove motor rating filter');
    clearButton.title = 'Remove filter and show all motors';
    clearButton.innerHTML = '<i class="fa-solid fa-xmark" aria-hidden="true"></i> Clear';
    clearButton.addEventListener('click', () => this.filterByRating('all'));
    status.append(label, description, clearButton);
  },

  async loadExpellerDetail(expellerNum = 1) {
    if (expellerNum === 'all') {
      return await this.loadAllExpellersDetail();
    }
    const num = parseInt(expellerNum, 10) || 1;
    currentPanelType = 'EXPELLER';
    currentExpellerNum = num;
    
    // Highlight active expeller button
    document.querySelectorAll('.expeller-tab-btn').forEach(btn => {
      const isMatch = btn.getAttribute('data-expeller') === String(expellerNum);
      btn.classList.toggle('active', isMatch);
    });

    // Reset rating filter visual state
    this.resetRatingFilterUI();

    // Update section title & badge
    const mainTitle = document.getElementById('section-main-title');
    if (mainTitle) mainTitle.innerHTML = `<i class="fa-solid fa-industry text-cyan"></i> Expeller Machine Motors (P1 to P5)`;

    const mainBadge = document.getElementById('section-main-badge');
    if (mainBadge) {
      mainBadge.className = 'badge badge-info';
      mainBadge.innerHTML = `<i class="fa-solid fa-bolt"></i> Expeller Motors`;
    }

    // Configure sub-motor view buttons for Expeller (P1 to P5)
    const focusBtnsContainer = document.getElementById('sub-motor-focus-buttons');
    const viewModeBar = document.getElementById('expeller-view-mode-bar');
    if (viewModeBar) viewModeBar.style.display = 'flex';

    if (focusBtnsContainer) {
      focusBtnsContainer.innerHTML = `
        <span style="font-size:0.8rem; font-weight:600; color:var(--text-secondary); margin-right:0.25rem;">View Mode:</span>
        <button class="btn btn-secondary btn-sm motor-view-btn active" id="btn-view-all-motors" onclick="dashboard.showAllMotorsGrid()">
          <i class="fa-solid fa-table-cells-large"></i> All 5 Motors Grid
        </button>
        <button class="btn btn-secondary btn-sm motor-view-btn" data-motor-focus="P1" onclick="dashboard.focusSingleMotor('P1')">P1 (75 HP)</button>
        <button class="btn btn-secondary btn-sm motor-view-btn" data-motor-focus="P2" onclick="dashboard.focusSingleMotor('P2')">P2 (60 HP)</button>
        <button class="btn btn-secondary btn-sm motor-view-btn" data-motor-focus="P3" onclick="dashboard.focusSingleMotor('P3')">P3 (60 HP)</button>
        <button class="btn btn-secondary btn-sm motor-view-btn" data-motor-focus="P4" onclick="dashboard.focusSingleMotor('P4')">P4 (50 HP)</button>
        <button class="btn btn-secondary btn-sm motor-view-btn" data-motor-focus="P5" onclick="dashboard.focusSingleMotor('P5')">P5 (50 HP)</button>
      `;
    }

    try {
      this.expellerCache = this.expellerCache || {};
      const cacheKey = `${currentReportId}_exp_${expellerNum}`;
      let data = this.expellerCache[cacheKey];
      if (!data) {
        data = await api.getExpellerDetail(expellerNum, currentReportId);
        this.expellerCache[cacheKey] = data;
      }
      this.currentExpellerData = data;
      this.currentKohluData = null;
      this.renderExpellerDetail(data);
    } catch (err) {
      console.error('Failed to load expeller detail:', err);
      showToast(`Expeller ${expellerNum} detail error: ${err.message}`, 'error');
    }
  },

  async loadAllExpellersDetail() {
    currentPanelType = 'EXPELLER';
    currentExpellerNum = 'all';

    // Highlight 'all' tab button
    document.querySelectorAll('.expeller-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-expeller') === 'all');
    });

    this.resetRatingFilterUI();

    // Hide single expeller motor filter bar in all-panels view
    const viewModeBar = document.getElementById('expeller-view-mode-bar');
    if (viewModeBar) viewModeBar.style.display = 'none';

    const mainTitle = document.getElementById('section-main-title');
    if (mainTitle) mainTitle.innerHTML = `<i class="fa-solid fa-layer-group text-cyan"></i> All 5 Expeller MCC Panels (25 Motors Matrix)`;

    try {
      const dataList = await api.getAllExpellersDetail(currentReportId);
      this.allExpellersData = dataList;
      this.renderAllExpellersGrid(dataList);
    } catch (err) {
      console.error('Failed to load all expellers detail:', err);
      showToast(`All Panels load error: ${err.message}`, 'error');
    }
  },

  async loadKohluDetail(panelNum = 1) {
    currentPanelType = 'KOHLU';
    currentKohluNum = panelNum;

    // Highlight active kohlu button
    document.querySelectorAll('.expeller-tab-btn').forEach(btn => {
      const isMatch = btn.getAttribute('data-kohlu') === String(panelNum);
      btn.classList.toggle('active', isMatch);
    });

    this.resetRatingFilterUI();

    const mainTitle = document.getElementById('section-main-title');
    if (mainTitle) mainTitle.innerHTML = `<i class="fa-solid fa-oil-well text-emerald"></i> Kohlu Extraction Panel ${panelNum} (6 Cold Press Units)`;

    const mainBadge = document.getElementById('section-main-badge');
    if (mainBadge) {
      mainBadge.className = 'badge badge-success';
      mainBadge.innerHTML = `<i class="fa-solid fa-seedling"></i> Kohlu Panel ${panelNum}`;
    }

    // Configure sub-motor view buttons for Kohlu (K1-K6 or K7-K12)
    const focusBtnsContainer = document.getElementById('sub-motor-focus-buttons');
    const viewModeBar = document.getElementById('expeller-view-mode-bar');
    if (viewModeBar) viewModeBar.style.display = 'flex';

    if (focusBtnsContainer) {
      const kStart = (panelNum - 1) * 6 + 1;
      let btnsHtml = `
        <span style="font-size:0.8rem; font-weight:600; color:var(--text-secondary); margin-right:0.25rem;">View Mode:</span>
        <button class="btn btn-secondary btn-sm motor-view-btn active" id="btn-view-all-motors" onclick="dashboard.showAllMotorsGrid()">
          <i class="fa-solid fa-table-cells-large"></i> All 6 Units Grid
        </button>
      `;
      for (let i = 0; i < 6; i++) {
        const kCode = `K${kStart + i}`;
        btnsHtml += `
          <button class="btn btn-secondary btn-sm motor-view-btn" data-motor-focus="${kCode}" onclick="dashboard.focusSingleMotor('${kCode}', ${panelNum}, 'KOHLU')">${kCode}</button>
        `;
      }
      focusBtnsContainer.innerHTML = btnsHtml;
    }

    try {
      const data = await api.getKohluDetail(panelNum, currentReportId);
      this.currentKohluData = data;
      this.currentExpellerData = null;
      this.renderKohluDetail(data);
    } catch (err) {
      console.error('Failed to load kohlu detail:', err);
      showToast(`Kohlu Panel ${panelNum} detail error: ${err.message}`, 'error');
    }
  },

  async loadAllKohlusDetail() {
    currentPanelType = 'KOHLU';
    currentKohluNum = 'all';

    document.querySelectorAll('.expeller-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-kohlu') === 'all');
    });

    this.resetRatingFilterUI();

    const viewModeBar = document.getElementById('expeller-view-mode-bar');
    if (viewModeBar) viewModeBar.style.display = 'none';

    const mainTitle = document.getElementById('section-main-title');
    if (mainTitle) mainTitle.innerHTML = `<i class="fa-solid fa-oil-well text-emerald"></i> All Kohlu Extraction Panels (12 Units Matrix)`;

    const mainBadge = document.getElementById('section-main-badge');
    if (mainBadge) {
      mainBadge.className = 'badge badge-success';
      mainBadge.innerHTML = `<i class="fa-solid fa-seedling"></i> Both Kohlu Panels`;
    }

    try {
      const dataList = await api.getAllKohlusDetail(currentReportId);
      this.allKohlusData = dataList;
      this.renderAllKohlusGrid(dataList);
    } catch (err) {
      console.error('Failed to load all kohlus detail:', err);
      showToast(`All Kohlus load error: ${err.message}`, 'error');
    }
  },

  getMotorCardHeaderHtml(m, panelPrefix = '', isKohlu = false) {
    const badgeHtml = this.getMotorStatusBadge(m);
    const iconClass = isKohlu ? 'fa-seedling text-emerald' : 'fa-bolt text-cyan';

    return `
      <div class="motor-card-header">
        <div class="motor-card-head-left">
          <div class="motor-card-title-row">
            <i class="fa-solid ${iconClass}"></i>
            <span class="motor-code-tag">${m.code}</span>
            <span class="motor-hp-tag">${m.hp} HP</span>
          </div>
          <div class="motor-card-sub-row">
            <span class="motor-col-tag">Col #${m.col_index}</span>
            ${panelPrefix ? `<span class="motor-panel-mini-tag">${panelPrefix}</span>` : ''}
          </div>
        </div>
        <div class="motor-card-head-right">
          ${badgeHtml}
        </div>
      </div>
    `;
  },

  getMotorStatusBadge(m) {
    const isKohlu = m.panel_type === 'KOHLU' || (m.code && m.code.startsWith('K'));
    const load = Number((m.avg_load_pct || 0).toFixed(1));
    const sum = m.sum_kwh || m.total_kwh || 0;
    const st = m.current_status;

    if (st === 'NO_DATA' || (m.missing_count >= 48 && !sum)) {
      return `<span class="motor-status-pill pill-offline"><i class="fa-solid fa-circle-question"></i> No Data</span>`;
    }
    if (m.has_spike || st === 'ANOMALY') {
      return `<span class="motor-status-pill pill-high"><i class="fa-solid fa-triangle-exclamation"></i> Meter Anomaly</span>`;
    }
    
    if (sum === 0 || m.stopped_count === 48 || st === 'STOPPED') {
      return `<span class="motor-status-pill pill-offline"><i class="fa-solid fa-power-off"></i> Offline</span>`;
    }
    if (st === 'OVERLOAD' || load > 80.0) {
      return `<span class="motor-status-pill pill-high"><i class="fa-solid fa-triangle-exclamation"></i> Overload (${load}%)</span>`;
    }
    if (st === 'HEALTHY' || load >= 50.0) {
      return `<span class="motor-status-pill pill-optimal"><i class="fa-solid fa-circle-check"></i> Optimal (${load}%)</span>`;
    }
    if (st === 'NORMAL' || load >= 40.0) {
      return `<span class="motor-status-pill pill-normal"><i class="fa-solid fa-circle"></i> Normal (${load}%)</span>`;
    }
    return `<span class="motor-status-pill pill-low"><i class="fa-solid fa-gauge-simple-low"></i> Low Load (${load}%)</span>`;
  },

  getMotorSlotBreakdownHtml(m) {
    const isKohlu = m.panel_type === 'KOHLU' || (m.code && m.code.startsWith('K'));
    const overLimit = 80.0;
    const overLabel = '80%';
    const targetLabel = '50%–80%';
    const loadPct = Number((m.avg_load_pct || 0).toFixed(1));
    const good = m.healthy_count || 0;
    const normal = m.normal_count || 0;
    const low = m.idle_count || 0;
    const high = m.overload_count || 0;
    const off = m.stopped_count || 0;
    const isNoData = m.current_status === 'NO_DATA' || (m.missing_count >= 48 && !(m.sum_kwh || m.total_kwh));
    const isOffline = !isNoData && ((m.sum_kwh || m.total_kwh || 0) === 0 || off === 48 || m.current_status === 'STOPPED');

    let zoneClass = 'zone-healthy';
    let fillClass = 'fill-healthy';
    let zoneText = `🟢 Optimal (${targetLabel})`;

    if (isNoData) {
      zoneClass = 'zone-stopped';
      fillClass = 'fill-stopped';
      zoneText = 'No SCADA readings';
    } else if (isOffline) {
      zoneClass = 'zone-stopped';
      fillClass = 'fill-stopped';
      zoneText = '⏹️ Offline (0 kWh)';
    } else if (m.current_status === 'OVERLOAD' || loadPct > overLimit) {
      zoneClass = 'zone-overload';
      fillClass = 'fill-overload';
      zoneText = `🚨 Over ${overLabel} Red Line`;
    } else if (m.current_status === 'HEALTHY' || loadPct >= 50.0) {
      zoneClass = 'zone-healthy';
      fillClass = 'fill-healthy';
      zoneText = `🟢 Target (${targetLabel})`;
    } else if (loadPct >= 40.0) {
      zoneClass = 'zone-normal';
      fillClass = 'fill-normal';
      zoneText = '🔵 Normal (40%–50%)';
    } else {
      zoneClass = 'zone-idle';
      fillClass = 'fill-idle';
      zoneText = '🟡 Low Load (<40%)';
    }

    const fillWidth = Math.min(Math.max(loadPct, 0), 100);

    return `
      <div class="motor-load-meter-box">
        <div class="motor-load-meter-header">
          <span class="load-pill-text">
            Avg Load: <strong style="font-family:var(--font-mono); font-size:0.92rem;">${loadPct}%</strong> <span class="load-total-base">/ 100%</span>
          </span>
          <span class="load-zone-tag ${zoneClass}">${zoneText}</span>
        </div>

        <div class="load-gauge-track" title="Average Load: ${loadPct}% | ${overLabel} Overload Red Line | 50% Healthy Target">
          <div class="load-gauge-fill ${fillClass}" style="width: ${fillWidth}%;"></div>
          <div class="load-gauge-marker marker-40" title="40% Low-Load Limit"></div>
          <div class="load-gauge-marker marker-50" title="50% Healthy Target Minimum"></div>
          <div class="load-gauge-marker marker-80" title="${overLabel} Overload Red Danger Line"></div>
        </div>
        <div class="load-gauge-ticks">
          <span>0%</span>
          <span class="tick-amber">40% Low</span>
          <span class="tick-green">50% Target</span>
          <span class="tick-red">${overLabel} Red Line</span>
          <span>100%</span>
        </div>

        <div class="motor-slots-counts">
          <span class="slot-count-tag count-good" title="${good} intervals in optimal zone (${targetLabel})"><i class="fa-solid fa-circle"></i> ${good} Good</span>
          <span class="slot-count-tag count-normal" title="${normal} intervals in the 40%-50% normal zone"><i class="fa-solid fa-circle"></i> ${normal} Normal</span>
          <span class="slot-count-tag count-low" title="${low} intervals in low-load zone (10%–40%)"><i class="fa-solid fa-circle"></i> ${low} Low</span>
          <span class="slot-count-tag count-high" title="${high} intervals in high-load zone (>${overLabel})"><i class="fa-solid fa-circle"></i> ${high} High</span>
          <span class="slot-count-tag count-off" title="${off} intervals stopped (0 kWh)"><i class="fa-solid fa-circle"></i> ${off} Off</span>
        </div>
      </div>
    `;
  },

  getMotorBenchmarkLegendHtml(m) {
    const isKohlu = m.panel_type === 'KOHLU' || (m.code && m.code.startsWith('K'));
    const overPctLabel = '80%';
    const overVal = m.overload_threshold_kwh ? `${Number(m.overload_threshold_kwh).toFixed(1)}k` : overPctLabel;
    const healVal = m.healthy_min_kwh ? `${Number(m.healthy_min_kwh).toFixed(1)}k` : '50%';
    const idleVal = m.idle_max_kwh ? `${Number(m.idle_max_kwh).toFixed(1)}k` : '40%';
    return `
      <div class="motor-chart-benchmarks">
        <div class="bm-col bm-col-red" title="${overPctLabel} Overload Danger Limit: ${m.overload_threshold_kwh} kWh">
          <span class="bm-dash bm-dash-red"></span>
          <span class="bm-pct">${overPctLabel}</span> ${overVal}
        </div>
        <div class="bm-col bm-col-green" title="50% Healthy Target: ${m.healthy_min_kwh} kWh">
          <span class="bm-dash bm-dash-green"></span>
          <span class="bm-pct">50%</span> ${healVal}
        </div>
        <div class="bm-col bm-col-amber" title="40% Low-Load Threshold: ${m.idle_max_kwh} kWh">
          <span class="bm-dash bm-dash-amber"></span>
          <span class="bm-pct">40%</span> ${idleVal}
        </div>
      </div>
    `;
  },

  renderAllExpellersGrid(dataList) {
    if (!dataList || !dataList.length) return;

    // Reset view
    this.showAllMotorsGrid();

    // Render all 5 panels into grid with clean section dividers
    const grid = document.getElementById('expeller-motors-grid');
    if (!grid) return;

    let html = '';
    const chartsToRender = [];

    for (const exp of dataList) {
      // Panel section header
      html += `
        <div style="grid-column: 1 / -1; margin-top: 1rem; margin-bottom: 0.25rem; padding: 0.65rem 1.25rem; background: rgba(0, 210, 255, 0.06); border-left: 4px solid var(--accent-cyan); border-radius: var(--radius-sm); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem;">
          <div style="display:flex; align-items:center; gap:0.6rem;">
            <i class="fa-solid fa-server text-cyan" style="font-size:1.1rem;"></i>
            <span style="font-weight:800; font-size:1rem; color:var(--text-primary);">${exp.panel_name}</span>
            <span class="badge badge-info" style="font-size:0.75rem;">${exp.incomer_name}</span>
          </div>
          <div style="display:flex; gap:1.25rem; font-size:0.82rem; font-family:var(--font-mono);">
            <span>Incomer: <strong>${exp.incomer_total_kwh} kWh</strong></span>
            <span>Motors Sum: <strong>${exp.motors_total_kwh} kWh</strong></span>
            <span style="color:${exp.health_score_pct >= 70 ? 'var(--accent-emerald)' : 'var(--accent-amber)'}; font-weight:700;">Health: ${exp.health_score_pct}%</span>
          </div>
        </div>
      `;

      for (const m of (exp.motors || [])) {
        const headerHtml = this.getMotorCardHeaderHtml(m, `${exp.panel_name.split(' ')[0]} ${exp.panel_name.split(' ')[1]}`, false);
        const slotsBreakdownHtml = this.getMotorSlotBreakdownHtml(m);

        let auditClass = 'audit-box-healthy';
        if (m.current_status === 'OVERLOAD' || m.avg_load_pct > 80) auditClass = 'audit-box-overload';
        else if (m.current_status === 'IDLE' || m.avg_load_pct < 40) auditClass = 'audit-box-idle';
        else if (m.current_status === 'STOPPED' || (m.sum_kwh || 0) === 0) auditClass = 'audit-box-stopped';

        const canvasId = `canvas-motor-exp${exp.expeller_num}-${m.code}`;
        chartsToRender.push({ canvasId, motor: m });

        html += `
          <div class="motor-card">
            ${headerHtml}

            <div class="motor-metrics-row" style="margin-bottom:0.4rem;">
              <div class="motor-metric-mini" title="Minimum energy recorded when running">
                <span class="motor-metric-mini-label">MIN</span>
                <span class="motor-metric-mini-val">${m.active_min_kwh || m.min_kwh} <span style="font-size:0.65rem; font-weight:normal;">kWh</span></span>
              </div>
              <div class="motor-metric-mini" title="Peak maximum energy in a 15-min interval">
                <span class="motor-metric-mini-label">MAX</span>
                <span class="motor-metric-mini-val text-red">${m.max_kwh} <span style="font-size:0.65rem; font-weight:normal;">kWh</span></span>
              </div>
              <div class="motor-metric-mini" title="Average energy consumption per interval">
                <span class="motor-metric-mini-label">AVG</span>
                <span class="motor-metric-mini-val text-emerald">${m.avg_kwh} <span style="font-size:0.65rem; font-weight:normal;">kWh</span></span>
              </div>
              <div class="motor-metric-mini" title="Total energy sum for this motor">
                <span class="motor-metric-mini-label">SUM</span>
                <span class="motor-metric-mini-val text-cyan">${m.sum_kwh || m.total_kwh} <span style="font-size:0.65rem; font-weight:normal;">kWh</span></span>
              </div>
            </div>

            ${slotsBreakdownHtml}
            ${this.getMotorBenchmarkLegendHtml(m)}

            <div class="motor-canvas-wrap">
              <canvas id="${canvasId}"></canvas>
            </div>

            <div class="motor-audit-box ${auditClass}">
              <i class="fa-solid fa-clipboard-check text-cyan" style="margin-right:0.35rem;"></i>
              <strong>Manager Note:</strong> ${m.supervisory_alert}
            </div>

            <button class="btn-view-details" onclick="dashboard.focusSingleMotor('${m.code}', ${exp.expeller_num})">
              <i class="fa-solid fa-chart-line text-cyan"></i> View Details
            </button>
          </div>
        `;
      }
    }

    grid.innerHTML = html;

    // Render charts
    for (const item of chartsToRender) {
      charts.renderMotorLoadChart(item.canvasId, item.motor);
    }
  },

  renderExpellerDetail(data) {
    if (!data) return;
    if (data.is_empty) {
      this.renderEmptyState();
      return;
    }
    this.currentExpellerData = data;

    // Reset view to grid mode
    this.showAllMotorsGrid();

    // Render 5 Motor Cards Grid
    const grid = document.getElementById('expeller-motors-grid');
    if (!grid) return;

    const motors = data.motors || [];
    let cardsHtml = '';

    for (const m of motors) {
      const headerHtml = this.getMotorCardHeaderHtml(m, '', false);
      const slotsBreakdownHtml = this.getMotorSlotBreakdownHtml(m);

      let auditClass = 'audit-box-healthy';
      if (m.current_status === 'OVERLOAD' || m.avg_load_pct > 80) auditClass = 'audit-box-overload';
      else if (m.current_status === 'IDLE' || m.avg_load_pct < 40) auditClass = 'audit-box-idle';
      else if (m.current_status === 'STOPPED' || (m.sum_kwh || 0) === 0) auditClass = 'audit-box-stopped';

      cardsHtml += `
        <div class="motor-card">
          ${headerHtml}

          <!-- Statistical Metrics: Min, Max, Avg, Sum -->
          <div class="motor-metrics-row" style="margin-bottom:0.4rem;">
            <div class="motor-metric-mini" title="Minimum energy recorded when running">
              <span class="motor-metric-mini-label">MIN</span>
              <span class="motor-metric-mini-val">${m.active_min_kwh || m.min_kwh} <span style="font-size:0.65rem; font-weight:normal;">kWh</span></span>
            </div>
            <div class="motor-metric-mini" title="Peak maximum energy in a 15-min interval">
              <span class="motor-metric-mini-label">MAX</span>
              <span class="motor-metric-mini-val text-red">${m.max_kwh} <span style="font-size:0.65rem; font-weight:normal;">kWh</span></span>
            </div>
            <div class="motor-metric-mini" title="Average energy consumption per interval">
              <span class="motor-metric-mini-label">AVG</span>
              <span class="motor-metric-mini-val text-emerald">${m.avg_kwh} <span style="font-size:0.65rem; font-weight:normal;">kWh</span></span>
            </div>
            <div class="motor-metric-mini" title="Total energy sum for this motor">
              <span class="motor-metric-mini-label">SUM</span>
              <span class="motor-metric-mini-val text-cyan">${m.sum_kwh || m.total_kwh} <span style="font-size:0.65rem; font-weight:normal;">kWh</span></span>
            </div>
          </div>

          ${slotsBreakdownHtml}
          ${this.getMotorBenchmarkLegendHtml(m)}

          <!-- 15-Minute Load Curve Chart Canvas -->
          <div class="motor-canvas-wrap">
            <canvas id="canvas-motor-${m.code}"></canvas>
          </div>

          <!-- Supervisory Audit Notice for Plant Manager -->
          <div class="motor-audit-box ${auditClass}">
            <i class="fa-solid fa-clipboard-check text-cyan" style="margin-right:0.35rem;"></i>
            <strong>Manager Note:</strong> ${m.supervisory_alert}
          </div>

          <!-- Enlarge Button -->
          <button class="btn-view-details" onclick="dashboard.focusSingleMotor('${m.code}', ${data.expeller_num})">
            <i class="fa-solid fa-chart-line text-cyan"></i> View Details
          </button>
        </div>
      `;
    }

    grid.innerHTML = cardsHtml;

    // Render individual charts
    for (const m of motors) {
      charts.renderMotorLoadChart(`canvas-motor-${m.code}`, m);
    }
  },

  renderKohluDetail(data) {
    if (!data) return;
    if (data.is_empty) {
      this.renderEmptyState();
      return;
    }
    this.currentKohluData = data;

    this.showAllMotorsGrid();

    // 2. Render 6 Kohlu Cards Grid
    const grid = document.getElementById('expeller-motors-grid');
    if (!grid) return;

    const motors = data.motors || [];
    let cardsHtml = '';

    for (const m of motors) {
      const headerHtml = this.getMotorCardHeaderHtml(m, '', true);
      const slotBreakdownHtml = this.getMotorSlotBreakdownHtml(m);

      let auditClass = 'audit-box-healthy';
      if (m.current_status === 'OVERLOAD') auditClass = 'audit-box-overload';
      else if (m.current_status === 'IDLE') auditClass = 'audit-box-idle';
      else if (m.current_status === 'STOPPED') auditClass = 'audit-box-stopped';

      cardsHtml += `
        <div class="motor-card">
          ${headerHtml}

          <div class="motor-metrics-row" style="margin-bottom:0.4rem;">
            <div class="motor-metric-mini" title="Minimum energy recorded when running">
              <span class="motor-metric-mini-label">MIN</span>
              <span class="motor-metric-mini-val">${m.active_min_kwh || m.min_kwh} <span style="font-size:0.65rem; font-weight:normal;">kWh</span></span>
            </div>
            <div class="motor-metric-mini" title="Peak maximum energy in a 15-min interval">
              <span class="motor-metric-mini-label">MAX</span>
              <span class="motor-metric-mini-val text-red">${m.max_kwh} <span style="font-size:0.65rem; font-weight:normal;">kWh</span></span>
            </div>
            <div class="motor-metric-mini" title="Average energy consumption per interval">
              <span class="motor-metric-mini-label">AVG</span>
              <span class="motor-metric-mini-val text-emerald">${m.avg_kwh} <span style="font-size:0.65rem; font-weight:normal;">kWh</span></span>
            </div>
            <div class="motor-metric-mini" title="Total energy sum for this unit">
              <span class="motor-metric-mini-label">SUM</span>
              <span class="motor-metric-mini-val text-cyan">${m.sum_kwh || m.total_kwh} <span style="font-size:0.65rem; font-weight:normal;">kWh</span></span>
            </div>
          </div>

          ${slotBreakdownHtml}
          ${this.getMotorBenchmarkLegendHtml(m)}

          <div class="motor-canvas-wrap">
            <canvas id="canvas-kohlu-${m.code}"></canvas>
          </div>

          <div class="motor-audit-box ${auditClass}">
            <i class="fa-solid fa-clipboard-question" style="margin-right:0.35rem;"></i>
            <strong>Manager Note:</strong> ${m.supervisory_alert}
          </div>

          <button class="btn-view-details" onclick="dashboard.focusSingleMotor('${m.code}', ${data.panel_num}, 'KOHLU')">
            <i class="fa-solid fa-chart-line text-emerald"></i> View Details
          </button>
        </div>
      `;
    }

    grid.innerHTML = cardsHtml;

    for (const m of motors) {
      charts.renderMotorLoadChart(`canvas-kohlu-${m.code}`, m);
    }
  },

  renderAllKohlusGrid(dataList) {
    if (!dataList || !dataList.length) return;

    this.showAllMotorsGrid();

    const grid = document.getElementById('expeller-motors-grid');
    if (!grid) return;

    let html = '';
    const chartsToRender = [];

    for (const panel of dataList) {
      html += `
        <div style="grid-column: 1 / -1; margin-top: 1rem; margin-bottom: 0.25rem; padding: 0.65rem 1.25rem; background: rgba(16, 185, 129, 0.08); border-left: 4px solid var(--accent-emerald); border-radius: var(--radius-sm); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem;">
          <div style="display:flex; align-items:center; gap:0.6rem;">
            <i class="fa-solid fa-oil-well text-emerald" style="font-size:1.1rem;"></i>
            <span style="font-weight:800; font-size:1rem; color:var(--text-primary);">${panel.panel_name}</span>
            <span class="badge badge-success" style="font-size:0.75rem;">Incomer: ${panel.incomer_name}</span>
          </div>
          <div style="display:flex; gap:1.25rem; font-size:0.82rem; font-family:var(--font-mono);">
            <span>Incomer Total: <strong>${panel.incomer_total_kwh} kWh</strong></span>
            <span>Cleaned 6 Kohlus Sum: <strong>${panel.motors_total_kwh} kWh</strong></span>
            <span style="color:${panel.health_score_pct >= 70 ? 'var(--accent-emerald)' : 'var(--accent-amber)'}; font-weight:700;">Health: ${panel.health_score_pct}%</span>
          </div>
        </div>
      `;

      for (const m of (panel.motors || [])) {
        const headerHtml = this.getMotorCardHeaderHtml(m, `Panel ${panel.panel_num}`, true);
        const slotBreakdownHtml = this.getMotorSlotBreakdownHtml(m);

        let auditClass = 'audit-box-healthy';
        if (m.current_status === 'OVERLOAD') auditClass = 'audit-box-overload';
        else if (m.current_status === 'IDLE') auditClass = 'audit-box-idle';
        else if (m.current_status === 'STOPPED') auditClass = 'audit-box-stopped';

        const canvasId = `canvas-kohlu-p${panel.panel_num}-${m.code}`;
        chartsToRender.push({ canvasId, motor: m });

        html += `
          <div class="motor-card">
            ${headerHtml}

            <div class="motor-metrics-row" style="margin-bottom:0.4rem;">
              <div class="motor-metric-mini" title="Minimum energy recorded when running">
                <span class="motor-metric-mini-label">MIN</span>
                <span class="motor-metric-mini-val">${m.active_min_kwh || m.min_kwh} <span style="font-size:0.65rem; font-weight:normal;">kWh</span></span>
              </div>
              <div class="motor-metric-mini" title="Peak maximum energy in a 15-min interval">
                <span class="motor-metric-mini-label">MAX</span>
                <span class="motor-metric-mini-val text-red">${m.max_kwh} <span style="font-size:0.65rem; font-weight:normal;">kWh</span></span>
              </div>
              <div class="motor-metric-mini" title="Average energy consumption per interval">
                <span class="motor-metric-mini-label">AVG</span>
                <span class="motor-metric-mini-val text-emerald">${m.avg_kwh} <span style="font-size:0.65rem; font-weight:normal;">kWh</span></span>
              </div>
              <div class="motor-metric-mini" title="Total energy sum for this unit">
                <span class="motor-metric-mini-label">SUM</span>
                <span class="motor-metric-mini-val text-cyan">${m.sum_kwh || m.total_kwh} <span style="font-size:0.65rem; font-weight:normal;">kWh</span></span>
              </div>
            </div>

            ${slotBreakdownHtml}
            ${this.getMotorBenchmarkLegendHtml(m)}

            <div class="motor-canvas-wrap">
              <canvas id="${canvasId}"></canvas>
            </div>

            <div class="motor-audit-box ${auditClass}">
              <i class="fa-solid fa-clipboard-question" style="margin-right:0.35rem;"></i>
              <strong>Manager Note:</strong> ${m.supervisory_alert}
            </div>

            <button class="btn-view-details" onclick="dashboard.focusSingleMotor('${m.code}', ${panel.panel_num}, 'KOHLU')">
              <i class="fa-solid fa-chart-line text-emerald"></i> View Details
            </button>
          </div>
        `;
      }
    }

    grid.innerHTML = html;

    for (const item of chartsToRender) {
      charts.renderMotorLoadChart(item.canvasId, item.motor);
    }
  },

  resetRatingFilterUI() {
    currentRatingFilter = 'all';
    document.querySelectorAll('.rating-filter-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-rating-filter') === 'all');
    });
    this.setRatingFilterStatus();
    this.currentRatingMotors = null;
  },

  async filterByRating(filterKey) {
    currentRatingFilter = filterKey;

    document.querySelectorAll('.rating-filter-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-rating-filter') === String(filterKey));
    });

    if (filterKey === 'all') {
      this.resetRatingFilterUI();
      if (currentPanelType === 'KOHLU') {
        if (currentKohluNum === 'all') this.loadAllKohlusDetail();
        else this.loadKohluDetail(currentKohluNum);
      } else {
        if (currentExpellerNum === 'all') this.loadAllExpellersDetail();
        else this.loadExpellerDetail(currentExpellerNum);
      }
      return;
    }

    const viewModeBar = document.getElementById('expeller-view-mode-bar');
    if (viewModeBar) viewModeBar.style.display = 'none';

    let filterDesc = `${filterKey} Motors`;
    const keyUpper = String(filterKey).trim().toUpperCase();
    if (keyUpper === 'P1' || keyUpper === '75') {
      filterDesc = 'P1 Motors (75 HP Main Worm Drive • Expellers 1 to 5)';
    } else if (keyUpper === 'P2') {
      filterDesc = 'P2 Motors (60 HP Secondary Squeezer Drive • Expellers 1 to 5)';
    } else if (keyUpper === 'P3') {
      filterDesc = 'P3 Motors (60 HP Deep Press Extraction Drive • Expellers 1 to 5)';
    } else if (keyUpper === 'P4') {
      filterDesc = 'P4 Motors (50 HP Seed Feeder & Hopper Drive • Expellers 1 to 5)';
    } else if (keyUpper === 'P5') {
      filterDesc = 'P5 Motors (50 HP Cake Discharge Drive • Expellers 1 to 5)';
    } else if (keyUpper === '60') {
      filterDesc = '60 HP Motors (P2 & P3 across Expellers 1 to 5)';
    } else if (keyUpper === '50') {
      filterDesc = '50 HP Motors (P4 & P5 across Expellers 1 to 5)';
    } else if (keyUpper === 'KOHLU' || keyUpper === '40') {
      filterDesc = '40 HP Kohlu Units (K1 to K12 across Panels 1 & 2)';
    }

    this.setRatingFilterStatus(filterDesc);

    try {
      const data = await api.getMotorsByRating(filterKey, currentReportId);
      const motors = data.motors || [];
      this.currentRatingMotors = motors;

      const totalKwh = motors.reduce((acc, m) => acc + (m.sum_kwh || m.total_kwh || 0), 0);
      const avgLoad = motors.length ? Math.round(motors.reduce((acc, m) => acc + (m.avg_load_pct || 0), 0) / motors.length) : 0;

      this.showAllMotorsGrid();
      const grid = document.getElementById('expeller-motors-grid');
      if (!grid) return;

      let html = `
        <div style="grid-column: 1 / -1; padding: 0.65rem 1.25rem; background: rgba(0, 210, 255, 0.08); border-left: 4px solid var(--accent-cyan); border-radius: var(--radius-sm); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem; margin-bottom:0.5rem;">
          <div style="display:flex; align-items:center; gap:0.6rem;">
            <i class="fa-solid fa-bolt text-cyan" style="font-size:1.1rem;"></i>
            <span style="font-weight:800; font-size:1rem; color:var(--text-primary);">${filterDesc}</span>
            <span class="badge badge-info">${motors.length} Total Units</span>
          </div>
          <div style="font-size:0.82rem; font-family:var(--font-mono); color:var(--text-secondary);">
            Total Energy: <strong style="color:var(--accent-cyan);">${Number(totalKwh.toFixed(1)).toLocaleString()} kWh</strong> | Avg Load: <strong>${avgLoad}%</strong>
          </div>
        </div>
      `;

      const chartsToRender = [];

      for (const m of motors) {
        const headerHtml = this.getMotorCardHeaderHtml(m, m.panel_name, m.panel_type === 'KOHLU');
        const slotBreakdownHtml = this.getMotorSlotBreakdownHtml(m);

        let auditClass = 'audit-box-healthy';
        if (m.current_status === 'OVERLOAD') auditClass = 'audit-box-overload';
        else if (m.current_status === 'IDLE') auditClass = 'audit-box-idle';
        else if (m.current_status === 'STOPPED') auditClass = 'audit-box-stopped';

        const canvasId = `canvas-rating-${filterKey}-${m.panel_type}-${m.panel_num}-${m.code}`;
        chartsToRender.push({ canvasId, motor: m });

        html += `
          <div class="motor-card">
            ${headerHtml}

            <div class="motor-metrics-row" style="margin-bottom:0.4rem;">
              <div class="motor-metric-mini" title="Minimum energy recorded when running">
                <span class="motor-metric-mini-label">MIN</span>
                <span class="motor-metric-mini-val">${m.active_min_kwh || m.min_kwh} <span style="font-size:0.65rem; font-weight:normal;">kWh</span></span>
              </div>
              <div class="motor-metric-mini" title="Peak maximum energy in a 15-min interval">
                <span class="motor-metric-mini-label">MAX</span>
                <span class="motor-metric-mini-val text-red">${m.max_kwh} <span style="font-size:0.65rem; font-weight:normal;">kWh</span></span>
              </div>
              <div class="motor-metric-mini" title="Average energy consumption per interval">
                <span class="motor-metric-mini-label">AVG</span>
                <span class="motor-metric-mini-val text-emerald">${m.avg_kwh} <span style="font-size:0.65rem; font-weight:normal;">kWh</span></span>
              </div>
              <div class="motor-metric-mini" title="Total energy sum for this motor">
                <span class="motor-metric-mini-label">SUM</span>
                <span class="motor-metric-mini-val text-cyan">${m.sum_kwh || m.total_kwh} <span style="font-size:0.65rem; font-weight:normal;">kWh</span></span>
              </div>
            </div>

            ${slotBreakdownHtml}
            ${this.getMotorBenchmarkLegendHtml(m)}

            <div class="motor-canvas-wrap">
              <canvas id="${canvasId}"></canvas>
            </div>

            <div class="motor-audit-box ${auditClass}">
              <i class="fa-solid fa-clipboard-question" style="margin-right:0.35rem;"></i>
              <strong>Manager Note:</strong> ${m.supervisory_alert}
            </div>

            <button class="btn-view-details" onclick="dashboard.focusSingleMotor('${m.code}', ${m.panel_num}, '${m.panel_type}')">
              <i class="fa-solid fa-chart-line ${m.panel_type === 'KOHLU' ? 'text-emerald' : 'text-cyan'}"></i> View Details
            </button>
          </div>
        `;
      }

      grid.innerHTML = html;

      for (const item of chartsToRender) {
        charts.renderMotorLoadChart(item.canvasId, item.motor);
      }
    } catch (err) {
      console.error('Failed to filter motors by rating:', err);
      showToast(`Filter error: ${err.message}`, 'error');
    }
  },

  // Focus on a Single Motor (Bada View)
  focusSingleMotor(motorCode, panelNum = null, panelType = 'EXPELLER') {
    let motor = null;
    let expellerName = '';

    // Check in rating motors list if currently filtered
    if (this.currentRatingMotors && this.currentRatingMotors.length) {
      motor = this.currentRatingMotors.find(m => m.code === motorCode && (!panelNum || m.panel_num === panelNum));
      if (motor) expellerName = `${motor.panel_name} • `;
    }

    if (!motor && (panelType === 'KOHLU' || (motorCode && motorCode.startsWith('K')))) {
      if (panelNum && this.allKohlusData) {
        const pan = this.allKohlusData.find(p => p.panel_num === panelNum);
        if (pan && pan.motors) {
          motor = pan.motors.find(m => m.code === motorCode);
          expellerName = `${pan.panel_name} • `;
        }
      }
      if (!motor && this.currentKohluData && this.currentKohluData.motors) {
        motor = this.currentKohluData.motors.find(m => m.code === motorCode);
        expellerName = `${this.currentKohluData.panel_name} • `;
      }
    }

    if (!motor) {
      if (panelNum && this.allExpellersData) {
        const exp = this.allExpellersData.find(e => e.expeller_num === panelNum);
        if (exp && exp.motors) {
          motor = exp.motors.find(m => m.code === motorCode);
          expellerName = `${exp.panel_name} • `;
        }
      }
      if (!motor && this.currentExpellerData && this.currentExpellerData.motors) {
        motor = this.currentExpellerData.motors.find(m => m.code === motorCode);
        expellerName = `${this.currentExpellerData.panel_name} • `;
      }
    }

    if (!motor) return;
    this.currentFocusedMotor = {
      ...motor,
      panel_type: motor.panel_type || panelType,
      panel_name: motor.panel_name || expellerName.replace(/\s*[•·]\s*$/, '')
    };

    // Switch view containers
    const grid = document.getElementById('expeller-motors-grid');
    const focusView = document.getElementById('expeller-single-motor-focus');
    if (grid) grid.style.display = 'none';
    if (focusView) {
      focusView.style.display = 'flex';
      focusView.offsetHeight; // Force synchronous reflow so canvas dimensions are correctly computed
    }

    // Update buttons
    document.querySelectorAll('.motor-view-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-motor-focus') === motorCode);
    });

    // Populate Headers
    const title = document.getElementById('focus-motor-title');
    if (title) title.innerHTML = `<i class="fa-solid fa-bolt text-cyan"></i> ${expellerName}${motor.name} • ${motor.role}`;

    const subtitle = document.getElementById('focus-motor-subtitle');
    if (subtitle) subtitle.innerHTML = `Column #${motor.col_index} in SCADA • Rated 15-Min: <strong>${motor.rated_15m_kwh} kWh</strong> (${motor.kw} kW) • Avg Operating Load: <strong>${motor.avg_load_pct}%</strong>`;

    const badge = document.getElementById('focus-motor-badge');
    if (badge) {
      if (motor.current_status === 'HEALTHY') {
        badge.className = 'motor-status-pill pill-optimal';
        badge.innerHTML = `<i class="fa-solid fa-circle-check"></i> Optimal Operating Zone (${motor.avg_load_pct}%)`;
      } else if (motor.current_status === 'NORMAL') {
        badge.className = 'motor-status-pill pill-normal';
        badge.innerHTML = `<i class="fa-solid fa-check"></i> Normal Operation (${motor.avg_load_pct}%)`;
      } else if (motor.current_status === 'IDLE') {
        badge.className = 'motor-status-pill pill-low';
        badge.innerHTML = `<i class="fa-solid fa-gauge-simple-low"></i> Low-Load Operation (${motor.avg_load_pct}%)`;
      } else if (motor.current_status === 'OVERLOAD') {
        badge.className = 'motor-status-pill pill-high';
        badge.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Overload Risk (${motor.avg_load_pct}%)`;
      } else {
        badge.className = 'motor-status-pill pill-offline';
        badge.innerHTML = `<i class="fa-solid fa-power-off"></i> Offline / Standby (0 kWh)`;
      }
    }

    // Populate Min, Max, Avg, Sum in focus view
    const elMin = document.getElementById('focus-stat-min');
    if (elMin) elMin.textContent = `${motor.active_min_kwh || motor.min_kwh || 0.0} kWh`;

    const elMax = document.getElementById('focus-stat-max');
    if (elMax) elMax.textContent = `${motor.max_kwh || 0.0} kWh`;

    const elAvg = document.getElementById('focus-stat-avg');
    if (elAvg) elAvg.textContent = `${motor.avg_kwh || 0.0} kWh (${motor.avg_load_pct || 0}%)`;

    const elSum = document.getElementById('focus-stat-sum');
    if (elSum) elSum.textContent = `${motor.sum_kwh || motor.total_kwh || 0.0} kWh`;

    const alertBox = document.getElementById('focus-motor-audit-box');
    const alertText = document.getElementById('focus-motor-alert-text');
    if (alertBox && alertText) {
      alertText.textContent = motor.supervisory_alert;
      alertBox.className = `motor-audit-box audit-box-${motor.current_status.toLowerCase()}`;
    }

    // Render Enlarged Chart with % Y-Axis and % on each bar (Double-frame RAF guarantees clean dimensions)
    requestAnimationFrame(() => {
      charts.renderEnlargedMotorChart('chart-single-motor-focus', motor);
      setTimeout(() => {
        const inst = window.chartInstances && window.chartInstances['chart-single-motor-focus'];
        if (inst && typeof inst.resize === 'function') {
          inst.resize();
        }
      }, 50);
    });

    // Populate 48-Interval Forensic Table
    const tbody = document.getElementById('focus-motor-intervals-tbody');
    if (tbody && motor.timeline) {
      const labels = motor.timeline.labels || [];
      const values = motor.timeline.values || [];
      const pcts = motor.timeline.load_pcts || [];
      const statuses = motor.timeline.statuses || [];

      let rowsHtml = '';
      for (let i = 0; i < labels.length; i++) {
        const val = values[i];
        const pct = pcts[i];
        const st = statuses[i];

        const isKohlu = motor.panel_type === 'KOHLU' || (motor.code && motor.code.startsWith('K'));
        const isTelemetryAnomaly = st === 'ANOMALY';
        const isOver = st === 'OVERLOAD' || (!isTelemetryAnomaly && pct > 80.0);

        let stBadge = '<span class="badge" style="background:rgba(100,116,139,0.15); color:#94a3b8;">⏹️ Stopped (0 kWh)</span>';
        if (isTelemetryAnomaly) stBadge = '<span class="badge badge-critical">Telemetry anomaly - verify meter</span>';
        else if (st === 'NO_DATA') stBadge = '<span class="badge" style="background:rgba(100,116,139,0.15);color:#64748b;">No SCADA reading</span>';
        else if (isOver) stBadge = `<span class="badge badge-critical">🚨 >80% Overload</span>`;
        else if (st === 'HEALTHY' || pct >= 50.0) stBadge = `<span class="badge badge-success">🟢 50%–80% Optimal</span>`;
        else if (st === 'NORMAL' || pct >= 40.0) stBadge = '<span class="badge badge-info">🔵 40%–50% Normal</span>';
        else if (pct >= 10.0) stBadge = '<span class="badge badge-warning">🟡 10%–40% Low Load</span>';

        rowsHtml += `
          <tr>
            <td style="font-family:var(--font-mono); font-weight:600;">#${i + 1}</td>
            <td style="font-family:var(--font-mono); font-weight:700; color:var(--text-primary);">${window.formatTime12h ? window.formatTime12h(labels[i]) : labels[i]}</td>
            <td style="font-family:var(--font-mono); font-weight:700; color:var(--accent-cyan);">${val === null || val === undefined ? 'No data' : `${val} kWh`}</td>
            <td style="font-family:var(--font-mono); color:var(--text-muted);">${motor.rated_15m_kwh} kWh</td>
            <td style="font-family:var(--font-mono); font-weight:700; color:${isOver ? 'var(--accent-red)' : (pct >= 50 ? 'var(--accent-emerald)' : (pct >= 10 ? 'var(--accent-amber)' : 'var(--text-muted)'))};">${pct === null || pct === undefined ? '?' : `${pct}%`}</td>
            <td>${stBadge}</td>
          </tr>
        `;
      }
      tbody.innerHTML = rowsHtml;
    }
  },

  showAllMotorsGrid() {
    const grid = document.getElementById('expeller-motors-grid');
    const focusView = document.getElementById('expeller-single-motor-focus');
    this.currentFocusedMotor = null;
    if (grid) grid.style.display = 'grid';
    if (focusView) focusView.style.display = 'none';

    document.querySelectorAll('.motor-view-btn').forEach(btn => {
      btn.classList.toggle('active', btn.id === 'btn-view-all-motors');
    });
  },

  // Telemetry Matrix & Upload Logs (Tab 2)
  filterOnlyMyUploads: false,

  toggleUploadLogsFilter(showOnlyMy) {
    this.filterOnlyMyUploads = showOnlyMy;
    const btnMy = document.getElementById('btn-filter-my-uploads');
    const btnAll = document.getElementById('btn-filter-all-uploads');
    if (btnMy && btnAll) {
      if (showOnlyMy) {
        btnMy.classList.add('active');
        btnMy.style.background = 'var(--accent-cyan)';
        btnMy.style.color = '#060b18';
        btnMy.style.fontWeight = '700';

        btnAll.classList.remove('active');
        btnAll.style.background = 'transparent';
        btnAll.style.color = 'var(--text-secondary)';
        btnAll.style.fontWeight = '600';
      } else {
        btnAll.classList.add('active');
        btnAll.style.background = 'var(--accent-cyan)';
        btnAll.style.color = '#060b18';
        btnAll.style.fontWeight = '700';

        btnMy.classList.remove('active');
        btnMy.style.background = 'transparent';
        btnMy.style.color = 'var(--text-secondary)';
        btnMy.style.fontWeight = '600';
      }
    }
    this.loadTelemetryMatrixAndLogs();
  },

  async loadTelemetryMatrixAndLogs() {
    try {
      const currentUser = api.getUser();
      const badge = document.getElementById('upload-logs-user-filter-badge');
      if (badge && currentUser) {
        badge.innerHTML = `<i class="fa-solid fa-user-check"></i> ${currentUser.full_name || currentUser.username}`;
      }

      // 1. Fetch & Render Upload Logs
      const reports = await api.getReportsList(this.filterOnlyMyUploads);
      this.renderUploadLogsTable(reports);

      // 2. Fetch & Render Telemetry Matrix Table
      const repId = currentReportId || (reports && reports[0] ? reports[0].id : 1);
      const matrixData = await api.getTelemetryMatrix(repId, this.currentMatrixMaxCol);
      this.renderTelemetryMatrixTable(matrixData);

      // 3. Attach keyboard arrow navigation
      this.attachMatrixKeyboardNavigation();
    } catch (err) {
      console.error('Failed to load telemetry matrix & logs:', err);
      showToast(err.message, 'error');
    }
  },

  renderUploadLogsTable(reports) {
    const tbody = document.getElementById('upload-logs-table-body');
    if (!tbody) return;

    if (!reports || reports.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:1.25rem; color:var(--text-muted);"><i class="fa-solid fa-folder-open"></i> No reports found for current filter.</td></tr>`;
      return;
    }

    let rowsHtml = '';
    for (const r of reports) {
      const isSelected = r.id === currentReportId;
      const statusBadge = isSelected
        ? `<span class="badge badge-success" style="font-size:0.72rem; padding:0.18rem 0.5rem;"><i class="fa-solid fa-circle-dot"></i> Active</span>`
        : `<span class="badge badge-secondary" style="font-size:0.72rem; padding:0.18rem 0.5rem;"><i class="fa-regular fa-circle"></i> Archived</span>`;

      const uploader = r.uploaded_by_name || r.uploaded_by_username || 'System Administrator';
      const uploaderBadge = `<span class="badge badge-info" style="font-size:0.72rem; padding:0.15rem 0.45rem;"><i class="fa-solid fa-user"></i> ${uploader}</span>`;

      // Shift Date Badge
      const shiftDateText = r.shift_date_display || r.shift_date || '—';
      const shiftDateBadge = `<span class="badge badge-info" style="font-size:0.72rem; padding:0.18rem 0.5rem; white-space:nowrap;"><i class="fa-regular fa-calendar-days"></i> ${shiftDateText}</span>`;

      // Shift indicator: Day, Night, or Both
      let shiftPill = `<span class="badge badge-warning" style="font-size:0.72rem; padding:0.18rem 0.55rem; white-space:nowrap;"><i class="fa-solid fa-sun text-amber"></i> Day Shift</span>`;
      if (r.shift_type === 'NIGHT') {
        shiftPill = `<span class="badge badge-night" style="font-size:0.72rem; padding:0.18rem 0.55rem; white-space:nowrap;"><i class="fa-solid fa-moon"></i> Night Shift</span>`;
      } else if (r.shift_type === 'BOTH' || r.shift_mode === 'DUAL') {
        shiftPill = `<span class="badge badge-info" style="font-size:0.72rem; padding:0.18rem 0.55rem; white-space:nowrap;"><i class="fa-solid fa-rotate"></i> Both Shifts</span>`;
      }

      // Date formatted strictly as DD/MM/YYYY, hh:mm A
      const dateDisplay = r.upload_timestamp || '—';

      rowsHtml += `
        <tr style="cursor:pointer; ${isSelected ? 'background:rgba(0,210,255,0.06);' : ''}" onclick="dashboard.selectReportForMatrix(${r.id})">
          <td style="padding:0.35rem 0.6rem; vertical-align:middle; white-space:nowrap;">${statusBadge}</td>
          <td style="padding:0.35rem 0.6rem; vertical-align:middle; white-space:nowrap;">${shiftDateBadge}</td>
          <td style="padding:0.35rem 0.6rem; vertical-align:middle; white-space:nowrap;">${shiftPill}</td>
          <td style="padding:0.35rem 0.6rem; font-family:var(--font-mono); font-size:0.76rem; color:var(--text-primary); word-break:break-all; white-space:normal; line-height:1.3; max-width:320px; vertical-align:middle;">${r.filename}</td>
          <td style="padding:0.35rem 0.6rem; font-family:var(--font-mono); font-size:0.76rem; color:var(--text-secondary); white-space:nowrap; vertical-align:middle;">${dateDisplay}</td>
          <td style="padding:0.35rem 0.6rem; vertical-align:middle; white-space:nowrap;">${uploaderBadge}</td>
          <td style="padding:0.35rem 0.6rem; text-align:center; vertical-align:middle; white-space:nowrap;">
            <button class="btn ${isSelected ? 'btn-primary' : 'btn-secondary'} btn-sm" style="padding:0.18rem 0.5rem; font-size:0.72rem;" onclick="event.stopPropagation(); dashboard.selectReportForMatrix(${r.id})">
              <i class="fa-solid fa-table-cells"></i> ${isSelected ? 'Current' : 'Select'}
            </button>
          </td>
        </tr>
      `;
    }
    tbody.innerHTML = rowsHtml;
  },

  async selectReportForMatrix(reportId) {
    currentReportId = reportId;
    window.activeReportId = reportId;
    const select = document.getElementById('shift-filter-select');
    if (select) select.value = reportId;
    if (window.syncShiftRadioButtons) {
      window.syncShiftRadioButtons();
    }
    await this.load(reportId);
    await this.loadTelemetryMatrixAndLogs();
    showToast(`Switched active view to Report ID #${reportId}`, 'info');
  },

  renderTelemetryMatrixTable(matrixData) {
    const thead = document.getElementById('matrix-thead');
    const tbody = document.getElementById('matrix-tbody');
    if (!thead || !tbody || !matrixData) return;

    const cols = matrixData.columns || [];
    const rows = matrixData.rows || [];

    // 1. Build Thead (2 rows: Row 1 = Letters & Col #, Row 2 = Equipment Name & Rating)
    let tr1 = `<tr>
      <th class="sticky-col-0" rowspan="2" style="z-index:4;">Slot</th>
      <th class="sticky-col-1" rowspan="2" style="z-index:4;">Time</th>
    `;
    let tr2 = `<tr>`;

    for (const c of cols) {
      tr1 += `<th>${c.excel_letter} <span style="font-size:0.7rem; font-weight:normal; opacity:0.75;">(#${c.col_index})</span></th>`;
      const hpStr = c.motor_hp ? ` (${c.motor_hp} HP)` : '';
      tr2 += `<th style="font-size:0.72rem; max-width:140px; text-overflow:ellipsis; overflow:hidden;" title="${c.source_name}">${c.source_name}${hpStr}</th>`;
    }
    tr1 += `</tr>`;
    tr2 += `</tr>`;

    thead.innerHTML = tr1 + tr2;

    // 2. Build Tbody (48 interval rows)
    let bodyHtml = '';
    for (const r of rows) {
      bodyHtml += `<tr>
        <td class="sticky-col-0">#${r.interval_index}</td>
        <td class="sticky-col-1">${window.formatTime12h ? window.formatTime12h(r.time_str) : r.time_str}</td>
      `;

      for (const c of cols) {
        const cell = r.readings ? r.readings[String(c.col_index)] : null;
        if (!cell || cell.val === null) {
          bodyHtml += `<td>—</td>`;
          continue;
        }

        let cellClass = '';
        if (cell.status === 'HEALTHY') cellClass = 'cell-healthy';
        else if (cell.status === 'IDLE') cellClass = 'cell-idle';
        else if (cell.status === 'OVERLOAD') cellClass = 'cell-overload';
        else if (cell.status === 'STOPPED') cellClass = 'cell-stopped';

        const loadTitle = cell.load_pct !== null ? `Load: ${cell.load_pct}% of ${c.rated_15m_kwh} kWh limit (${cell.status})` : `Reading: ${cell.val} kWh`;
        bodyHtml += `<td class="${cellClass}" title="${loadTitle}">${cell.val}</td>`;
      }

      bodyHtml += `</tr>`;
    }

    tbody.innerHTML = bodyHtml;
  },

  scrollMatrix(px) {
    const container = document.getElementById('matrix-scroll-container');
    if (container) {
      container.scrollBy({ left: px, behavior: 'smooth' });
    }
  },

  async setMatrixColumnFilter(maxCol) {
    this.currentMatrixMaxCol = maxCol;
    const btnCore = document.getElementById('btn-matrix-core');
    const btnAll = document.getElementById('btn-matrix-all');

    if (maxCol === 46) {
      btnCore?.classList.add('active');
      btnAll?.classList.remove('active');
    } else {
      btnAll?.classList.add('active');
      btnCore?.classList.remove('active');
    }

    const matrixData = await api.getTelemetryMatrix(currentReportId, maxCol);
    this.renderTelemetryMatrixTable(matrixData);
  },

  attachMatrixKeyboardNavigation() {
    const container = document.getElementById('matrix-scroll-container');
    if (!container || container.getAttribute('data-keys-attached')) return;

    container.setAttribute('data-keys-attached', 'true');
    container.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        this.scrollMatrix(-300);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        this.scrollMatrix(300);
      }
    });

    window.addEventListener('keydown', (e) => {
      const activeTab = document.querySelector('.tab-pane.active');
      if (activeTab && activeTab.id === 'tab-machines') {
        if (e.key === 'ArrowLeft' && !['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) {
          e.preventDefault();
          this.scrollMatrix(-300);
        } else if (e.key === 'ArrowRight' && !['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) {
          e.preventDefault();
          this.scrollMatrix(300);
        }
      }
    });
  },

  async openLegacyPDFPreviewModal() {
    try {
      showToast('Preparing audit PDF preview...', 'info');

      // 1. Report Metadata
      const sel = document.getElementById('shift-filter-select') || document.getElementById('report-selector');
      const reportText = sel ? (sel.options[sel.selectedIndex]?.text || 'Active Plant Shift') : 'Active Plant Shift';
      const activeShift = document.querySelector('.shift-radio-label.active-day')
        ? 'Day Shift (07:00 AM – 07:00 PM)'
        : (document.querySelector('.shift-radio-label.active-night')
            ? 'Night Shift (07:00 PM – 07:00 AM)'
            : 'Shift 1');

      const sectionTitle = document.getElementById('section-main-title')?.innerText?.trim() || 'Production Machine Motors Telemetry';
      const sectionSub = document.getElementById('section-main-subtitle')?.innerText?.trim() || '';

      const currentUser = (typeof api !== 'undefined' && api.getUser) ? api.getUser() : null;
      const auditorName = currentUser?.full_name || currentUser?.username || 'System Administrator';
      const auditorRole = (currentUser?.role || 'ADMIN').toUpperCase();

      // Check if Single Motor Focus view is active
      const singleFocusEl = document.getElementById('expeller-single-motor-focus');
      const isSingleFocus = singleFocusEl && singleFocusEl.style.display !== 'none';

      // Current raw dataset motors
      const currentMotors = (this.currentExpellerData && this.currentExpellerData.motors) 
        ? this.currentExpellerData.motors 
        : ((this.currentKohluData && this.currentKohluData.motors) ? this.currentKohluData.motors : []);

      // Extract Motor Data & Synchronous High-Definition Audit Charts
      let motorItems = [];
      let focusSubtitle = '';

      if (isSingleFocus) {
        const title = document.getElementById('focus-motor-title')?.innerText?.trim() || 'Focused Motor';
        const badge = document.getElementById('focus-motor-badge')?.innerText?.trim() || 'HEALTHY';
        focusSubtitle = document.getElementById('focus-motor-subtitle')?.innerText?.trim() || '';
        const minVal = document.getElementById('focus-stat-min')?.innerText?.trim() || '0.0 kWh';
        const maxVal = document.getElementById('focus-stat-max')?.innerText?.trim() || '0.0 kWh';
        const avgVal = document.getElementById('focus-stat-avg')?.innerText?.trim() || '0.0 kWh';
        const sumVal = document.getElementById('focus-stat-sum')?.innerText?.trim() || '0.0 kWh';
        const alertNote = document.getElementById('focus-motor-alert-text')?.innerText?.trim() || 'Normal telemetry operations within calibrated range.';

        let focusMotorObj = this.currentFocusedMotor;
        if (!focusMotorObj && this.activeFocusMotorCode) {
          focusMotorObj = currentMotors.find(m => m.code === this.activeFocusMotorCode);
        }
        if (!focusMotorObj && currentMotors.length > 0) {
          focusMotorObj = currentMotors[0];
        }

        let chartImg = '';
        if (typeof charts !== 'undefined' && charts.createAuditFocusChart && focusMotorObj) {
          chartImg = charts.createAuditFocusChart(focusMotorObj, 1100, 340);
        }
        if (!chartImg) {
          const focusCanvas = document.getElementById('chart-single-motor-focus');
          if (focusCanvas) {
            try { chartImg = focusCanvas.toDataURL('image/png'); } catch (e) {}
          }
        }

        motorItems.push({
          title, badge, minVal, maxVal, avgVal, sumVal,
          chartImg,
          note: alertNote
        });
      } else {
        const motorCards = document.querySelectorAll('#expeller-motors-grid .motor-card');
        motorCards.forEach((card, idx) => {
          if (card.style.display === 'none') return; // Skip filtered out cards
          const title = card.querySelector('.motor-title')?.innerText?.trim() || 'Motor';
          const hpTag = card.querySelector('.motor-hp-tag')?.innerText?.trim() || '';
          const colTag = card.querySelector('.motor-col-tag')?.innerText?.trim() || '';
          const statusBadge = card.querySelector('.motor-status-pill')?.innerText?.trim() || 'NORMAL';
          const badgeClass = card.querySelector('.motor-status-pill')?.className || '';

          const metrics = card.querySelectorAll('.motor-metric-mini-val');
          const minVal = metrics[0]?.innerText?.trim() || '0.0 kWh';
          const maxVal = metrics[1]?.innerText?.trim() || '0.0 kWh';
          const avgVal = metrics[2]?.innerText?.trim() || '0.0 kWh';
          const sumVal = metrics[3]?.innerText?.trim() || '0.0 kWh';

          const note = card.querySelector('.motor-audit-box')?.innerText?.replace('Manager Note:', '')?.trim() || 'Operational status nominal.';

          const rawMotor = currentMotors[idx] || currentMotors.find(m => card.innerHTML.includes(m.code));

          let chartImg = '';
          if (typeof charts !== 'undefined' && charts.createAuditCardChart && rawMotor) {
            chartImg = charts.createAuditCardChart(rawMotor, 480, 240);
          }
          if (!chartImg) {
            const canvas = card.querySelector('canvas');
            if (canvas) {
              try { chartImg = canvas.toDataURL('image/png'); } catch (e) {}
            }
          }

          motorItems.push({
            title: `${title} ${hpTag} ${colTag}`.trim(),
            badge: statusBadge,
            badgeClass,
            minVal, maxVal, avgVal, sumVal,
            chartImg,
            note
          });
        });
      }

      // Status pill color helper
      const getPillStyle = (status) => {
        const s = (status || '').toUpperCase();
        if (s.includes('HEALTHY') || s.includes('OPTIMAL') || s.includes('TARGET') || s.includes('GOOD')) {
          return 'background:#d1fae5; color:#065f46; border:1px solid #a7f3d0;';
        }
        if (s.includes('LOW') || s.includes('IDLE')) {
          return 'background:#fef3c7; color:#92400e; border:1px solid #fde68a;';
        }
        if (s.includes('OVERLOAD') || s.includes('HIGH') || s.includes('CRITICAL')) {
          return 'background:#fee2e2; color:#991b1b; border:1px solid #fca5a5;';
        }
        return 'background:#f1f5f9; color:#475569; border:1px solid #cbd5e1;';
      };

      // Main Showcase Layout (Single Focus View vs 5-Motors Grid)
      let mainContentHtml = '';

      if (isSingleFocus && motorItems.length > 0) {
        // ENLARGED SINGLE-MOTOR AUDIT VIEW
        const m = motorItems[0];
        mainContentHtml = `
          <div style="border: 1px solid #cbd5e1; border-radius: 8px; background: #ffffff; padding: 14px 18px; margin-bottom: 12px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 10px; border-bottom: 2px solid #0284c7; padding-bottom: 8px;">
              <div>
                <span style="font-size: 1.08rem; font-weight: 800; color: #0f172a;">${m.title}</span>
                <span style="font-size: 0.78rem; color: #64748b; margin-left: 8px;">${focusSubtitle}</span>
              </div>
              <span style="font-size: 0.76rem; font-weight: 800; padding: 4px 12px; border-radius: 999px; ${getPillStyle(m.badge)}">${m.badge}</span>
            </div>

            <!-- 4-Stat Metric Strip -->
            <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap: 10px; font-size: 0.74rem; margin-bottom: 12px;">
              <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:8px 12px;">
                <span style="color:#64748b; font-size:0.68rem; display:block; font-weight:700;">MIN INTERVAL LOAD</span>
                <strong style="font-size:1.05rem; color:#0f172a;">${m.minVal}</strong>
              </div>
              <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:8px 12px;">
                <span style="color:#64748b; font-size:0.68rem; display:block; font-weight:700;">PEAK INTERVAL (MAX)</span>
                <strong style="font-size:1.05rem; color:#dc2626;">${m.maxVal}</strong>
              </div>
              <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:8px 12px;">
                <span style="color:#64748b; font-size:0.68rem; display:block; font-weight:700;">AVG OPERATING LOAD</span>
                <strong style="font-size:1.05rem; color:#059669;">${m.avgVal}</strong>
              </div>
              <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:8px 12px;">
                <span style="color:#64748b; font-size:0.68rem; display:block; font-weight:700;">TOTAL SHIFT CONSUMPTION</span>
                <strong style="font-size:1.05rem; color:#0284c7;">${m.sumVal}</strong>
              </div>
            </div>

            <!-- Expansive High-Definition 48-Interval Telemetry Graph with Bold Numbers & Times -->
            ${m.chartImg ? `
              <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:6px; padding:8px 12px; text-align:center; margin-bottom:10px;">
                <img src="${m.chartImg}" style="width: 100%; height: 290px; max-height: 300px; object-fit: contain; display: block;" alt="Focused 48-Interval Telemetry Chart">
              </div>
            ` : ''}

            <!-- Supervisory Audit Finding Note -->
            <div style="font-size: 0.78rem; color: #334155; background: #f8fafc; border-left: 3.5px solid #0284c7; border-radius: 4px; padding: 8px 12px; line-height: 1.4;">
              <strong>Plant Supervisory Finding:</strong> ${m.note}
            </div>
          </div>
        `;
      } else if (motorItems.length > 0) {
        // 5-MOTORS EXPANSIVE GRID VIEW (Top KPI strip & bottom table permanently removed per requirements)
        const cols = Math.min(motorItems.length, 5);
        mainContentHtml = `
          <!-- 5 Motor Cards Side-by-Side with Clear, Visible Graphs -->
          <div style="display:grid; grid-template-columns: repeat(${cols}, 1fr); gap: 10px; margin-bottom: 12px;">
            ${motorItems.map(m => `
              <div style="border: 1px solid #cbd5e1; border-radius: 8px; background: #f8fafc; padding: 10px 10px; display:flex; flex-direction:column; justify-content:space-between;">
                <div>
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 6px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;">
                    <strong style="font-size: 0.82rem; color:#0f172a;">${m.title}</strong>
                    <span style="font-size: 0.65rem; font-weight:700; padding: 2px 6px; border-radius: 4px; ${getPillStyle(m.badge)}">${m.badge}</span>
                  </div>

                  <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 4px; font-size: 0.68rem; margin-bottom: 6px;">
                    <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:3px; padding:2px 5px;">
                      <span style="color:#64748b; display:block; font-size:0.58rem; font-weight:700;">MIN:</span>
                      <strong style="color:#0f172a;">${m.minVal}</strong>
                    </div>
                    <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:3px; padding:2px 5px;">
                      <span style="color:#64748b; display:block; font-size:0.58rem; font-weight:700;">MAX:</span>
                      <strong style="color:#dc2626;">${m.maxVal}</strong>
                    </div>
                    <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:3px; padding:2px 5px;">
                      <span style="color:#64748b; display:block; font-size:0.58rem; font-weight:700;">AVG:</span>
                      <strong style="color:#059669;">${m.avgVal}</strong>
                    </div>
                    <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:3px; padding:2px 5px;">
                      <span style="color:#64748b; display:block; font-size:0.58rem; font-weight:700;">SUM:</span>
                      <strong style="color:#0284c7;">${m.sumVal}</strong>
                    </div>
                  </div>
                </div>

                ${m.chartImg ? `
                  <div style="margin: 6px 0; background:#ffffff; border:1px solid #cbd5e1; border-radius:6px; padding:4px 3px; text-align:center;">
                    <img src="${m.chartImg}" style="width: 100%; height: 165px; object-fit: contain; display: block;" alt="Load Curve">
                  </div>
                ` : ''}

                <div style="font-size: 0.64rem; color: #334155; background: #ffffff; border: 1px dashed #cbd5e1; border-radius: 4px; padding: 4px 6px; margin-top: 4px; line-height: 1.3;">
                  <strong>Note:</strong> ${m.note}
                </div>
              </div>
            `).join('')}
          </div>
        `;
      }

      // Formatted IST generation date
      const now = new Date();
      const istDateStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth()+1).padStart(2, '0')}/${now.getFullYear()}`;
      let istHours = now.getHours();
      const istMins = String(now.getMinutes()).padStart(2, '0');
      const istAmpm = istHours >= 12 ? 'PM' : 'AM';
      istHours = istHours % 12 || 12;
      const istTimeStr = `${String(istHours).padStart(2, '0')}:${istMins} ${istAmpm}`;

      const container = document.getElementById('pdf-preview-document-container');
      if (!container) return;

      container.innerHTML = `
        <!-- Header Banner (Clean, Professional SCADA Title with Official Mashal Emblem) -->
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom: 2px solid #0284c7; padding-bottom: 10px; margin-bottom: 12px;">
          <div style="display:flex; align-items:center; gap: 12px;">
            <div style="display:flex; align-items:center; gap:6px; flex:0 0 auto;">
              <img src="/img/3d_logo1.webp?v=20261112_logo_fast_v1" style="height:42px; width:88px; padding:2px; object-fit:contain; border:1px solid #f4b400; border-radius:6px; background:#fff;" alt="KOGM — Khandelia Oil &amp; General Mills">
              <img src="/img/3d_logo2.webp?v=20261112_logo_fast_v1" style="height:42px; width:88px; padding:2px; object-fit:contain; border:1px solid #f4b400; border-radius:6px; background:#fff;" alt="Mashal Kachi Ghani Mustard Oil">
            </div>
            <div>
              <div style="font-size: 1.15rem; font-weight: 800; color: #0f172a; letter-spacing: 0.3px;">MASHAL MUSTARD OIL PLANT • SCADA 415V BUS</div>
              <div style="font-size: 0.80rem; font-weight: 700; color: #0284c7; text-transform: uppercase; letter-spacing: 0.8px; margin-top: 1px;">EXECUTIVE ENERGY AUDIT &amp; MOTOR TELEMETRY REPORT</div>
              <div style="font-size: 0.70rem; color: #64748b; margin-top: 2px;">${sectionTitle} — 15-Minute Interval Load Diagnostics</div>
            </div>
          </div>

          <div style="text-align:right; font-size: 0.72rem; line-height: 1.45; border-left: 1px solid #e2e8f0; padding-left: 16px;">
            <div><span style="color:#64748b;">Report:</span> <strong style="color:#0f172a;">${reportText}</strong></div>
            <div><span style="color:#64748b;">Shift:</span> <strong style="color:#0284c7;">${activeShift}</strong></div>
            <div><span style="color:#64748b;">Generated On:</span> <strong style="color:#0f172a;">${istDateStr} at ${istTimeStr} IST</strong></div>
            <div><span style="color:#64748b;">Auditor:</span> <strong style="color:#0f172a;">${auditorName} (${auditorRole})</strong></div>
          </div>
        </div>

        <!-- Section Title Bar -->
        <div style="background:#0f172a; color:#ffffff; padding: 6px 12px; border-radius: 4px; font-size: 0.78rem; font-weight: 700; margin-bottom: 12px; display:flex; justify-content:space-between; align-items:center;">
          <span>${sectionTitle}</span>
          <span style="font-size:0.68rem; font-weight:normal; color:#94a3b8;">48 Intervals (15-Minute SCADA Telemetry)</span>
        </div>

        <!-- Main Showcase (Responsive to Focus vs All 5 Motors Grid) -->
        ${mainContentHtml}

        <!-- Footer Sign-off & Audit Seal (Guaranteed 1-Page Landscape Fit with Zero Bottom Clipping) -->
        <div style="display:flex; justify-content:space-between; align-items:flex-end; border-top: 1.5px solid #cbd5e1; padding-top: 14px; margin-top: 16px; padding-bottom: 8px; font-size: 0.72rem; color: #475569; overflow: visible;">
          <div style="line-height: 1.5;">
            <div style="font-weight:800; color:#0f172a; font-size:0.78rem; letter-spacing:0.2px;">Certified Industrial Energy Audit Telemetry</div>
            <div style="color:#334155; font-size:0.70rem;">Generated by Mashal EMS Intelligence SCADA Engine • ems.khandelia.online</div>
            <div style="color:#0284c7; font-weight:700; font-size:0.70rem; margin-top:2px;">ISO 50001 Energy Management Telemetry System Compliant</div>
          </div>

          <div style="display:flex; gap: 48px; text-align:center;">
            <div>
              <div style="width: 155px; border-bottom: 1.5px solid #334155; margin-bottom: 6px; height: 28px;"></div>
              <span style="font-weight:700; color:#0f172a; font-size:0.75rem;">Plant Electrical Engineer</span>
            </div>
            <div>
              <div style="width: 155px; border-bottom: 1.5px solid #334155; margin-bottom: 6px; height: 28px;"></div>
              <span style="font-weight:700; color:#0f172a; font-size:0.75rem;">Operations Manager</span>
            </div>
          </div>
        </div>
      `;

      // Open Modal
      const modal = document.getElementById('pdf-preview-modal');
      if (modal) {
        modal.style.display = 'flex';
        modal.classList.add('active');
      }
      showToast('Audit report preview loaded. Click "Download PDF" to save file.', 'success');
    } catch (err) {
      console.error('PDF Preview Error:', err);
      showToast(`PDF Preview error: ${err.message}`, 'error');
    }
  },

  currentFocusedMotor: null,

  async openPDFPreviewModal() {
    try {
      const grid = document.getElementById('expeller-motors-grid');
      const focusView = document.getElementById('expeller-single-motor-focus');
      const isSingleFocus = Boolean(focusView && getComputedStyle(focusView).display !== 'none');
      const sectionTitle = document.getElementById('section-main-title')?.innerText?.trim() || 'Motor Telemetry';
      const selector = document.getElementById('shift-filter-select') || document.getElementById('report-selector');
      const reportText = selector ? (selector.options[selector.selectedIndex]?.text || 'Selected Report') : 'Selected Report';
      const activeShift = document.querySelector('.shift-radio-label.active-day')
        ? 'Day Shift (07:00–19:00)'
        : (document.querySelector('.shift-radio-label.active-night') ? 'Night Shift (19:00–07:00)' : 'Selected Shift');
      const user = (typeof api !== 'undefined' && api.getUser) ? api.getUser() : {};
      const now = new Date();
      const generatedAt = new Intl.DateTimeFormat('en-IN', {
        dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata'
      }).format(now);
      const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      })[char]);

      const models = [];
      const addPanel = (panel, panelType) => {
        if (!panel?.motors) return;
        for (const motor of panel.motors) {
          models.push({
            ...motor,
            panel_type: panelType,
            panel_num: motor.panel_num || panel.expeller_num || panel.panel_num,
            panel_name: panel.panel_name || motor.panel_name || ''
          });
        }
      };

      if (this.currentRatingMotors?.length) {
        models.push(...this.currentRatingMotors);
      } else if (currentPanelType === 'EXPELLER') {
        if (currentExpellerNum === 'all') {
          (this.allExpellersData || []).forEach(panel => addPanel(panel, 'EXPELLER'));
        } else {
          addPanel(this.currentExpellerData, 'EXPELLER');
        }
      } else if (currentPanelType === 'KOHLU') {
        if (currentKohluNum === 'all') {
          (this.allKohlusData || []).forEach(panel => addPanel(panel, 'KOHLU'));
        } else {
          addPanel(this.currentKohluData, 'KOHLU');
        }
      } else {
        addPanel(this.currentExpellerData, 'EXPELLER');
        addPanel(this.currentKohluData, 'KOHLU');
      }

      const dedupedModels = [...new Map(models.map(m => [`${m.panel_type}:${m.panel_num}:${m.code}`, m])).values()];
      let visibleMotors = [];
      if (isSingleFocus && this.currentFocusedMotor) {
        visibleMotors = [this.currentFocusedMotor];
      } else if (grid) {
        const visibleCards = [...grid.querySelectorAll('.motor-card')].filter(card => {
          const style = getComputedStyle(card);
          return style.display !== 'none' && style.visibility !== 'hidden';
        });
        visibleMotors = visibleCards.map(card => {
          const code = card.querySelector('.motor-code-tag')?.innerText?.trim();
          const panelLabel = card.querySelector('.motor-panel-mini-tag')?.innerText?.trim() || '';
          const panelNum = Number(panelLabel.match(/\d+/)?.[0]) || null;
          const candidates = dedupedModels.filter(m => m.code === code);
          return (panelNum && candidates.find(m => Number(m.panel_num) === panelNum)) || candidates[0];
        }).filter(Boolean);
      }

      if (!visibleMotors.length) {
        throw new Error('Current view has no visible motor graphs to export.');
      }

      const toKwh = (value) => `${Number(value || 0).toFixed(2)} kWh`;
      const makeItem = (motor) => {
        // Always generate full-resolution focus chart with all 48-interval percentages, benchmark lines, and time labels
        const chartImg = (typeof charts !== 'undefined' && charts.createAuditFocusChart)
          ? charts.createAuditFocusChart(motor, 1800, 520)
          : '';
        return {
          title: `${motor.panel_name ? `${motor.panel_name} · ` : ''}${motor.name || `${motor.code} (${motor.hp} HP)`}${motor.role ? ` · ${motor.role}` : ''}`,
          status: `${motor.current_status || 'UNKNOWN'} · ${Number(motor.avg_load_pct || 0).toFixed(1)}% average load`,
          min: toKwh(motor.active_min_kwh ?? motor.min_kwh),
          max: toKwh(motor.max_kwh),
          avg: toKwh(motor.avg_kwh),
          sum: toKwh(motor.sum_kwh ?? motor.total_kwh),
          rating: `${motor.hp || '—'} HP · ${Number(motor.rated_15m_kwh || 0).toFixed(2)} kWh / 15 min`,
          threshold: '80% overload risk',
          note: motor.supervisory_alert || 'No additional operating note.',
          chartImg
        };
      };
      const items = visibleMotors.map(makeItem);
      // Display 1 full-size motor graph per page (ekk ekk karke proper full size)
      const pageSize = 1;
      const pages = [];
      for (let i = 0; i < items.length; i += pageSize) pages.push(items.slice(i, i + pageSize));

      const reportSafe = reportText.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '') || 'Report';

      const container = document.getElementById('pdf-preview-document-container');
      if (!container) throw new Error('PDF preview container not found.');
      container.innerHTML = pages.map((pageItems, pageIndex) => `
        <section class="pdf-current-page" style="width:100%; box-sizing:border-box; padding:16px 20px 18px; background:#fff; color:#0f172a; margin-bottom:24px; border-radius:8px; box-shadow:0 4px 18px rgba(0,0,0,0.06); border:1px solid #e2e8f0;">
          <header style="display:flex; justify-content:space-between; align-items:center; gap:12px; border-bottom:2px solid #0284c7; padding-bottom:8px; margin-bottom:10px;">
            <div style="display:flex; align-items:center; gap:10px; min-width:0;">
              <div style="display:flex; align-items:center; gap:5px; flex:0 0 auto;">
                <img src="/img/3d_logo1.webp?v=20261112_logo_fast_v1" alt="KOGM" style="height:32px; width:65px; padding:2px; object-fit:contain; border:1px solid #f4b400; border-radius:5px; background:#fff;">
                <img src="/img/3d_logo2.webp?v=20261112_logo_fast_v1" alt="Mashal" style="height:32px; width:65px; padding:2px; object-fit:contain; border:1px solid #f4b400; border-radius:5px; background:#fff;">
              </div>
              <div style="min-width:0;">
                <div style="font-size:15px; font-weight:800; line-height:1.2; color:#0f172a;">${escapeHtml(sectionTitle)}</div>
                <div style="font-size:10px; color:#475569; margin-top:2px; white-space:nowrap;">${escapeHtml(reportText)} · ${escapeHtml(activeShift)} · Generated ${escapeHtml(generatedAt)} IST</div>
              </div>
            </div>
            <div style="text-align:right; font-size:9px; color:#475569; flex:0 0 auto;">
              <div>${escapeHtml(user.full_name || user.username || 'EMS User')}</div>
              <div style="font-weight:700; color:#0284c7; margin-top:2px;">Page ${pageIndex + 1} of ${pages.length}</div>
            </div>
          </header>
          <div style="display:block;">
            ${pageItems.map(item => `
              <article style="border:1px solid #cbd5e1; border-radius:8px; padding:10px 14px; background:#fff; break-inside:avoid; page-break-inside:avoid;">
                <div style="display:flex; justify-content:space-between; gap:12px; align-items:center; border-bottom:1px solid #e2e8f0; padding-bottom:6px; margin-bottom:8px;">
                  <div>
                    <div style="font-size:15px; font-weight:800; color:#0f172a;">${escapeHtml(item.title)}</div>
                    <div style="font-size:11px; color:#475569; margin-top:2px;">${escapeHtml(item.rating)} · ${escapeHtml(item.threshold)}</div>
                  </div>
                  <span style="font-size:11px; font-weight:700; color:#075985; background:#e0f2fe; padding:4px 10px; border-radius:6px; white-space:nowrap;">${escapeHtml(item.status)}</span>
                </div>
                <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin-bottom:8px;">
                  ${[['MIN', item.min], ['MAX', item.max], ['AVG', item.avg], ['SHIFT SUM', item.sum]].map(([label, value]) => `
                    <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:6px 10px;">
                      <div style="font-size:9px; font-weight:700; color:#64748b; letter-spacing:0.5px;">${label}</div>
                      <div style="font-size:12px; font-weight:800; color:#0f172a; margin-top:2px;">${escapeHtml(value)}</div>
                    </div>`).join('')}
                </div>
                ${item.chartImg ? `<img src="${item.chartImg}" alt="48 interval motor load graph" style="width:100%; height:410px; object-fit:contain; display:block; background:#fff;">` : '<div style="padding:24px;text-align:center;color:#64748b;">Graph could not be rendered.</div>'}
                <div style="font-size:10px; line-height:1.4; color:#334155; border-left:3px solid #0284c7; background:#f8fafc; padding:6px 10px; margin-top:8px; border-radius:0 4px 4px 0;">${escapeHtml(item.note)}</div>
              </article>`).join('')}
          </div>
          <footer style="border-top:1px solid #cbd5e1; margin-top:8px; padding-top:6px; font-size:9px; color:#64748b; display:flex; justify-content:space-between;">
            <span>SCADA readings shown for the selected report · 15-minute intervals</span>
            <span>Mashal EMS Intelligence</span>
          </footer>
        </section>`).join('');

      const modal = document.getElementById('pdf-preview-modal');
      if (modal) {
        modal.style.display = 'flex';
        modal.classList.add('active');
      }
      showToast(`PDF preview ready: ${visibleMotors.length} visible motor graph(s).`, 'success');
    } catch (err) {
      console.error('PDF Preview Error:', err);
      showToast(`PDF Preview error: ${err.message}`, 'error');
    }
  },

  async printPreviewPDF() {
    const element = document.getElementById('pdf-preview-document-container');
    if (element) {
      await Promise.all([...element.querySelectorAll('img')].map(img => {
        if (img.complete && img.naturalWidth > 0) return Promise.resolve();
        return img.decode().catch(() => undefined);
      }));
    }
    window.print();
  },

  closePDFPreview() {
    const modal = document.getElementById('pdf-preview-modal');
    if (modal) {
      modal.style.display = 'none';
      modal.classList.remove('active');
    }
  },

  initExpellerTabs() {
    document.querySelectorAll('.expeller-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        // Reset active state across all panel tabs
        document.querySelectorAll('.expeller-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Check if this is a Kohlu button
        if (btn.hasAttribute('data-kohlu')) {
          const target = btn.getAttribute('data-kohlu');
          if (target === 'all') {
            this.loadAllKohlusDetail();
          } else {
            const num = parseInt(target, 10);
            if (num) {
              this.loadKohluDetail(num);
            }
          }
        } else if (btn.hasAttribute('data-expeller')) {
          const target = btn.getAttribute('data-expeller');
          if (target === 'all') {
            this.loadAllExpellersDetail();
          } else {
            const num = parseInt(target, 10);
            if (num) {
              this.loadExpellerDetail(num);
            }
          }
        }
      });
    });
  }
};
