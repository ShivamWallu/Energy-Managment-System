// ==========================================================================
// EMS Intelligence - Professional Industrial Chart Visualizations
// Color Palette: Healthy (#059669 / #00e676), Low-Load/Idle (#d97706 / #ffb703), Overload (#dc2626 / #ff3366), Grid (#0284c7 / #00d2ff)
// Adapts dynamically between Professional Executive Light Theme & Sleek Dark Mode
// ==========================================================================

const chartInstances = {};

function formatTime12h(str) {
  if (!str) return '';
  const s = String(str).trim();
  if (s.toUpperCase().includes('AM') || s.toUpperCase().includes('PM')) {
    const parts = s.split(' ');
    if (parts.length > 1 && parts[parts.length - 1].match(/^(AM|PM)$/i)) {
      return `${parts[parts.length - 2]} ${parts[parts.length - 1].toUpperCase()}`;
    }
    return s;
  }
  const parts = s.split(' ');
  const timePart = parts.length > 1 ? parts[1] : parts[0];
  const toks = timePart.split(':');
  if (toks.length >= 2) {
    const hr = parseInt(toks[0], 10);
    const min = toks[1];
    if (!isNaN(hr)) {
      const ampm = hr < 12 ? 'AM' : 'PM';
      const hr12 = (hr % 12 || 12).toString().padStart(2, '0');
      return `${hr12}:${min} ${ampm}`;
    }
  }
  return s;
}

function formatTimestamp12h(str) {
  if (!str) return '';
  const s = String(str).trim();
  const parts = s.split(' ');
  if (parts.length > 1) {
    const datePart = parts[0];
    const timePart = parts.slice(1).join(' ');
    return `${datePart} ${formatTime12h(timePart)}`;
  }
  return formatTime12h(s);
}

window.formatTime12h = formatTime12h;
window.formatTimestamp12h = formatTimestamp12h;

function destroyChart(id) {
  if (chartInstances[id]) {
    chartInstances[id].destroy();
    delete chartInstances[id];
  }
}

function getThemeConfig() {
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  return {
    isLight,
    legendColor: isLight ? '#0f172a' : '#f8fafc',
    tickColor: isLight ? '#0f172a' : '#f8fafc',
    tickColorSubtle: isLight ? '#475569' : '#cbd5e1',
    gridColor: isLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.09)',
    doughnutBorder: isLight ? '#ffffff' : '#0d1524',
    tooltipBg: isLight ? 'rgba(15, 23, 42, 0.95)' : 'rgba(7, 11, 18, 0.95)',
    tooltipTitle: '#ffffff',
    tooltipBody: '#e2e8f0',
    healthyBg: isLight ? '#10b981' : 'rgba(0, 230, 118, 0.88)',
    healthyBorder: isLight ? '#059669' : '#00e676',
    idleBg: isLight ? '#f59e0b' : 'rgba(255, 183, 3, 0.88)',
    idleBorder: isLight ? '#d97706' : '#ffb703',
    overloadBg: isLight ? '#ef4444' : 'rgba(255, 51, 102, 0.88)',
    overloadBorder: isLight ? '#dc2626' : '#ff3366',
    gridLine: isLight ? '#0284c7' : '#00d2ff',
    gridFill: isLight ? 'rgba(2, 132, 199, 0.08)' : 'rgba(0, 210, 255, 0.08)',
    expellerLine: isLight ? '#2563eb' : '#3a86ff',
    kohluLine: isLight ? '#d97706' : '#ffb703',
    utilitiesSlice: isLight ? '#7c3aed' : '#b5179e',
    stoppedSlice: isLight ? '#94a3b8' : '#475569'
  };
}

const charts = {
  // 1. Primary Graph: 15-Minute Motor Operating Health Timeline
  renderMotorHealthTimeline(canvasId, healthTimeline) {
    destroyChart(canvasId);
    const ctx = document.getElementById(canvasId)?.getContext('2d');
    if (!ctx) return;

    const tc = getThemeConfig();
    const rawLabels = healthTimeline.labels || [];
    const step = rawLabels.length > 48 ? 4 : 2;
    const displayLabels = rawLabels.map((lbl, idx) => {
      if (idx % step === 0) {
        return formatTime12h(lbl);
      }
      return '';
    });

    chartInstances[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: displayLabels,
        datasets: [
          {
            label: 'Healthy Load (50% – 80%)',
            data: healthTimeline.healthy || [],
            backgroundColor: tc.healthyBg,
            borderColor: tc.healthyBorder,
            borderWidth: 1,
            borderRadius: 3,
            stack: 'healthStack'
          },
          {
            label: 'Low Load / Idle (10% – 40%)',
            data: healthTimeline.idle || [],
            backgroundColor: tc.idleBg,
            borderColor: tc.idleBorder,
            borderWidth: 1,
            borderRadius: 3,
            stack: 'healthStack'
          },
          {
            label: 'Overload Risk (> 80%)',
            data: healthTimeline.overload || [],
            backgroundColor: tc.overloadBg,
            borderColor: tc.overloadBorder,
            borderWidth: 1,
            borderRadius: 3,
            stack: 'healthStack'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            position: 'top',
            labels: {
              color: tc.legendColor,
              font: { family: 'Outfit', size: 12, weight: 600 },
              usePointStyle: true,
              boxWidth: 8
            }
          },
          tooltip: {
            backgroundColor: tc.tooltipBg,
            borderColor: 'rgba(2, 132, 199, 0.3)',
            borderWidth: 1,
            titleColor: tc.tooltipTitle,
            bodyColor: tc.tooltipBody,
            callbacks: {
              title(items) {
                const idx = items[0].dataIndex;
                return `15-Min Slot: ${formatTimestamp12h(rawLabels[idx])}`;
              },
              label(context) {
                return ` ${context.dataset.label}: ${context.raw} motors`;
              }
            }
          }
        },
        scales: {
          x: {
            stacked: true,
            grid: { display: false },
            ticks: { color: tc.tickColor, font: { family: 'Inter', size: 11 } }
          },
          y: {
            stacked: true,
            grid: { color: tc.gridColor },
            ticks: {
              color: tc.tickColor,
              stepSize: 5,
              callback: (val) => `${val} motors`
            }
          }
        }
      }
    });
  },

  // 2. 15-Minute Power Consumption Curve (kW / kWh)
  renderTimeline(canvasId, timelineData) {
    destroyChart(canvasId);
    const ctx = document.getElementById(canvasId)?.getContext('2d');
    if (!ctx) return;

    const tc = getThemeConfig();
    const rawLabels = timelineData.labels || [];
    const step = rawLabels.length > 48 ? 4 : 2;
    const displayLabels = rawLabels.map((lbl, idx) => {
      if (idx % step === 0) {
        return formatTime12h(lbl);
      }
      return '';
    });

    chartInstances[canvasId] = new Chart(ctx, {
      type: 'line',
      data: {
        labels: displayLabels,
        datasets: [
          {
            label: 'Main Grid Incomer',
            data: timelineData.main_incomer || [],
            borderColor: tc.gridLine,
            backgroundColor: tc.gridFill,
            borderWidth: 2.5,
            fill: true,
            tension: 0.35,
            pointRadius: 2,
            pointHoverRadius: 6
          },
          {
            label: 'Expellers 1–5 MCCs',
            data: timelineData.expellers || [],
            borderColor: tc.expellerLine,
            backgroundColor: 'transparent',
            borderWidth: 2,
            tension: 0.35,
            pointRadius: 1,
            pointHoverRadius: 5
          },
          {
            label: 'Kohlus 1–2 MCCs',
            data: timelineData.kohlus || [],
            borderColor: tc.kohluLine,
            backgroundColor: 'transparent',
            borderWidth: 2,
            tension: 0.35,
            pointRadius: 1,
            pointHoverRadius: 5
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            position: 'top',
            labels: {
              color: tc.legendColor,
              font: { family: 'Outfit', size: 12, weight: 600 },
              usePointStyle: true,
              boxWidth: 8
            }
          },
          tooltip: {
            backgroundColor: tc.tooltipBg,
            borderColor: 'rgba(2, 132, 199, 0.3)',
            borderWidth: 1,
            callbacks: {
              title(items) {
                const idx = items[0].dataIndex;
                return `Time: ${formatTimestamp12h(rawLabels[idx])}`;
              },
              label(context) {
                return ` ${context.dataset.label}: ${Number(context.raw).toFixed(2)} kWh`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { color: tc.gridColor },
            ticks: { color: tc.tickColor, font: { family: 'Inter', size: 11 } }
          },
          y: {
            grid: { color: tc.gridColor },
            ticks: { color: tc.tickColor, callback: (val) => `${val} kWh` }
          }
        }
      }
    });
  },

  // 3. Motor Health Distribution Doughnut (Based on User's 3-Tier Benchmark)
  renderMotorHealthDoughnut(canvasId, healthSummary) {
    destroyChart(canvasId);
    const ctx = document.getElementById(canvasId)?.getContext('2d');
    if (!ctx) return;

    const tc = getThemeConfig();
    const healthy = healthSummary.healthy_count || 0;
    const idle = healthSummary.idle_count || 0;
    const overload = healthSummary.overload_count || 0;
    const stopped = healthSummary.stopped_count || 0;

    chartInstances[canvasId] = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: [
          'Healthy Load (50% – 80%)',
          'Low-Load / Idle (10% – 40%)',
          'Overload Risk (> 80%)',
          'Stopped / Off (< 10%)'
        ],
        datasets: [{
          data: [healthy, idle, overload, stopped],
          backgroundColor: [
            tc.healthyBg,
            tc.idleBg,
            tc.overloadBg,
            tc.stoppedSlice
          ],
          borderColor: tc.doughnutBorder,
          borderWidth: 3,
          hoverOffset: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: tc.legendColor,
              font: { family: 'Outfit', size: 11, weight: 600 },
              usePointStyle: true,
              padding: 10
            }
          },
          tooltip: {
            backgroundColor: tc.tooltipBg,
            borderColor: 'rgba(2, 132, 199, 0.3)',
            borderWidth: 1,
            callbacks: {
              label(context) {
                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                const pct = total > 0 ? ((context.raw / total) * 100).toFixed(1) : 0;
                return ` ${context.label}: ${context.raw} intervals (${pct}%)`;
              }
            }
          }
        },
        cutout: '72%'
      }
    });
  },

  // 4. Section Energy Share Doughnut
  renderSectionDoughnut(canvasId, kpis) {
    destroyChart(canvasId);
    const ctx = document.getElementById(canvasId)?.getContext('2d');
    if (!ctx) return;

    const tc = getThemeConfig();
    const expellerKwh = kpis.expeller_incomers_kwh || 0;
    const kohluKwh = kpis.kohlu_incomers_kwh || 0;
    const utilitiesKwh = Math.max(0, (kpis.main_incomer_kwh || 0) - expellerKwh - kohluKwh);

    chartInstances[canvasId] = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Expeller MCCs (1–5)', 'Kohlu MCCs (1–2)', 'Plant Utilities & Aux'],
        datasets: [{
          data: [expellerKwh, kohluKwh, utilitiesKwh],
          backgroundColor: [tc.gridLine, tc.kohluLine, tc.utilitiesSlice],
          borderColor: tc.doughnutBorder,
          borderWidth: 3,
          hoverOffset: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: tc.legendColor,
              font: { family: 'Outfit', size: 11, weight: 600 },
              usePointStyle: true,
              padding: 10
            }
          },
          tooltip: {
            backgroundColor: tc.tooltipBg,
            borderColor: 'rgba(2, 132, 199, 0.3)',
            borderWidth: 1,
            callbacks: {
              label(context) {
                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                const pct = total > 0 ? ((context.raw / total) * 100).toFixed(1) : 0;
                return ` ${context.label}: ${Number(context.raw).toLocaleString()} kWh (${pct}%)`;
              }
            }
          }
        },
        cutout: '72%'
      }
    });
  },

  // 5. Individual Motor 15-Minute Load Curve & WhatsApp Health Zones
  renderMotorLoadChart(canvasId, motor) {
    destroyChart(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const tc = getThemeConfig();
    const timeline = motor.timeline || {};
    const rawLabels = timeline.labels || [];
    const values = timeline.values || [];
    const loadPcts = timeline.load_pcts || [];
    const statuses = timeline.statuses || [];

    // Smart milestone time anchors for compact card view (Shift Start, 1/3 Shift, 2/3 Shift, Shift End)
    const totalSlots = rawLabels.length;
    const milestoneSet = new Set([
      0,
      Math.floor(totalSlots / 3),
      Math.floor((2 * totalSlots) / 3),
      totalSlots - 1
    ]);
    const displayLabels = rawLabels.map((lbl, idx) => (milestoneSet.has(idx) ? formatTime12h(lbl) : ''));

    // Dynamic color per bar: 100% synchronized with backend statuses and count pills
    const isKohlu = motor.panel_type === 'KOHLU' || (motor.code && motor.code.startsWith('K'));
    const overLimit = isKohlu ? 100.0 : 80.0;
    const overLineLabel = isKohlu ? `100% Full Load (${motor.overload_threshold_kwh} kWh)` : `80% Overload (${motor.overload_threshold_kwh} kWh)`;

    const barColors = loadPcts.map((pct, idx) => {
      const st = statuses[idx] || '';
      if (st === 'OVERLOAD') return tc.overloadBg;
      if (st === 'HEALTHY' || st === 'NORMAL') return tc.healthyBg;
      if (st === 'IDLE') return tc.idleBg;
      if (st === 'STOPPED') return tc.stoppedSlice;
      if (pct > overLimit) return tc.overloadBg;
      if (pct >= 40.0) return tc.healthyBg;
      if (pct >= 10.0) return tc.idleBg;
      return tc.stoppedSlice; // < 10%
    });

    const borderColors = loadPcts.map((pct, idx) => {
      const st = statuses[idx] || '';
      if (st === 'OVERLOAD') return tc.overloadBorder;
      if (st === 'HEALTHY' || st === 'NORMAL') return tc.healthyBorder;
      if (st === 'IDLE') return tc.idleBorder;
      if (st === 'STOPPED') return tc.stoppedSlice;
      if (pct > overLimit) return tc.overloadBorder;
      if (pct >= 40.0) return tc.healthyBorder;
      if (pct >= 10.0) return tc.idleBorder;
      return tc.stoppedSlice;
    });

    // Reference lines for Overload/Full Load, Healthy Target (50%), and Low-Load Threshold (40%)
    const overloadLine = Array(values.length).fill(motor.overload_threshold_kwh || 0);
    const healthyMinLine = Array(values.length).fill(motor.healthy_min_kwh || 0);
    const idleMaxLine = Array(values.length).fill(motor.idle_max_kwh || 0);

    const maxVal = Math.max(...values, 0);
    const maxBound = Math.max(maxVal * 1.25, (motor.rated_15m_kwh || 10) * 1.25);

    chartInstances[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: displayLabels,
        datasets: [
          {
            type: 'line',
            label: overLineLabel,
            data: overloadLine,
            borderColor: tc.overloadBorder,
            borderWidth: 1.5,
            borderDash: [4, 4],
            pointRadius: 0,
            fill: false,
            tension: 0
          },
          {
            type: 'line',
            label: `50% Healthy (${motor.healthy_min_kwh} kWh)`,
            data: healthyMinLine,
            borderColor: tc.healthyBorder,
            borderWidth: 1.5,
            borderDash: [3, 3],
            pointRadius: 0,
            fill: false,
            tension: 0
          },
          {
            type: 'line',
            label: `40% Low (${motor.idle_max_kwh} kWh)`,
            data: idleMaxLine,
            borderColor: tc.idleBorder,
            borderWidth: 1.5,
            borderDash: [3, 4],
            pointRadius: 0,
            fill: false,
            tension: 0
          },
          {
            type: 'bar',
            label: '15-Min Energy (kWh)',
            data: values,
            backgroundColor: barColors,
            borderColor: borderColors,
            borderWidth: 1,
            borderRadius: 2
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            filter: function(item) {
              // Hide repetitive benchmark threshold lines from hover tooltip for a clean, concise card
              return item.dataset.type !== 'line';
            },
            backgroundColor: tc.isLight ? 'rgba(15, 23, 42, 0.95)' : 'rgba(7, 14, 32, 0.95)',
            borderColor: tc.isLight ? '#38bdf8' : '#00d2ff',
            borderWidth: 1.5,
            padding: 12,
            boxPadding: 6,
            usePointStyle: true,
            titleFont: { family: 'Outfit', size: 14, weight: 'bold' },
            bodyFont: { family: 'Outfit', size: 13, weight: '600' },
            callbacks: {
              title(items) {
                const idx = items[0].dataIndex;
                return `Slot #${idx + 1} • ${formatTime12h(rawLabels[idx])}`;
              },
              label(context) {
                const idx = context.dataIndex;
                const val = values[idx];
                const pct = loadPcts[idx];
                
                let desc = '';
                const overThreshold = isKohlu ? 100.0 : 80.0;
                if (pct > overThreshold) {
                  desc = isKohlu ? '🚨 Overload (>100%)' : '🚨 Overload Risk (>80%)';
                } else if (pct >= 50.0) {
                  desc = isKohlu ? '🟢 Optimal (50%–100%)' : '🟢 Optimal (50%–80%)';
                } else if (pct >= 40.0) {
                  desc = '🔵 Normal (40%–50%)';
                } else if (pct >= 10.0) {
                  desc = '🟡 Low Load (10%–40%)';
                } else {
                  desc = '⏹️ Offline / 0 kWh';
                }

                return [
                  ` Load: ${pct}% (${desc})`,
                  ` Consumed: ${val} kWh / ${motor.rated_15m_kwh} kWh max`
                ];
              }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              color: tc.isLight ? '#0f172a' : '#f1f5f9',
              font: { family: 'JetBrains Mono', size: 9, weight: 700 },
              maxRotation: 0,
              minRotation: 0,
              autoSkip: false,
              callback: function(val, idx) {
                return milestoneSet.has(idx) ? formatTime12h(rawLabels[idx]) : '';
              }
            }
          },
          y: {
            grid: { color: tc.gridColor },
            ticks: {
              color: tc.isLight ? '#0f172a' : '#f1f5f9',
              font: { family: 'JetBrains Mono', size: 10, weight: 700 },
              maxTicksLimit: 5,
              callback: (v) => `${v}`
            },
            suggestedMax: maxBound,
            beginAtZero: true
          }
        }
      }
    });
  },

  // 6. Enlarged Single Motor Deep-Dive Chart with Detailed 15-Min Slots
  // Features:
  // - Y-Axis in Percentage (% Load: 0% to 100%+) with secondary kWh axis
  // - Exact Percentage Label written on top of every bar ("building")
  // - WhatsApp Benchmark Lines: Red (80% Overload), Green (50% Healthy Target), Amber (40% Low-Load Ceiling)
  // - Accurate color rendering: Green (Healthy), Amber (Khaali), Red (Overload), Grey (Bandh/Offline)
  renderEnlargedMotorChart(canvasId, motor) {
    destroyChart(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const tc = getThemeConfig();
    const timeline = motor.timeline || {};
    const rawLabels = timeline.labels || [];
    const values = timeline.values || [];
    const loadPcts = timeline.load_pcts || [];
    const statuses = timeline.statuses || [];

    const isKohlu = motor.panel_type === 'KOHLU' || (motor.code && motor.code.startsWith('K'));
    const overLimit = isKohlu ? 100.0 : 80.0;
    const overLabel = isKohlu ? `100% Full Load Rated Limit (${motor.overload_threshold_kwh} kWh)` : `80% Overload Danger Limit (${motor.overload_threshold_kwh} kWh)`;

    // Color mapping synchronized 1:1 with interval statuses & summary counts
    const barColors = loadPcts.map((pct, idx) => {
      const st = statuses[idx] || '';
      if (st === 'OVERLOAD') return tc.overloadBg;
      if (st === 'HEALTHY' || st === 'NORMAL') return tc.healthyBg;
      if (st === 'IDLE') return tc.idleBg;
      if (st === 'STOPPED') return tc.stoppedSlice;
      if (pct > overLimit) return tc.overloadBg;
      if (pct >= 40.0) return tc.healthyBg;
      if (pct >= 10.0) return tc.idleBg;
      return tc.stoppedSlice;
    });

    const borderColors = loadPcts.map((pct, idx) => {
      const st = statuses[idx] || '';
      if (st === 'OVERLOAD') return tc.overloadBorder;
      if (st === 'HEALTHY' || st === 'NORMAL') return tc.healthyBorder;
      if (st === 'IDLE') return tc.idleBorder;
      if (st === 'STOPPED') return tc.stoppedSlice;
      if (pct > overLimit) return tc.overloadBorder;
      if (pct >= 40.0) return tc.healthyBorder;
      if (pct >= 10.0) return tc.idleBorder;
      return tc.stoppedSlice;
    });

    // Horizontal benchmark percentage lines
    const overloadLine = Array(loadPcts.length).fill(isKohlu ? 100 : 80);
    const healthyMinLine = Array(loadPcts.length).fill(50);
    const idleMaxLine = Array(loadPcts.length).fill(40);

    const maxPct = Math.max(...loadPcts, 0);
    const suggestedMaxPct = Math.max(105, Math.ceil(maxPct * 1.15));

    // High-visibility, professional industrial colors for benchmark lines
    const colorOverload = tc.isLight ? '#dc2626' : '#ff2a55';
    const colorHealthy = tc.isLight ? '#059669' : '#00f59b';
    const colorLowLoad = tc.isLight ? '#d97706' : '#ffb703';

    chartInstances[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: rawLabels.map(lbl => formatTime12h(lbl)),
        datasets: [
          {
            type: 'line',
            label: overLabel,
            data: overloadLine,
            borderColor: colorOverload,
            backgroundColor: colorOverload,
            borderWidth: 2.5,
            borderDash: [8, 5],
            pointRadius: 0,
            pointStyle: 'line',
            fill: false,
            order: 2,
            yAxisID: 'y'
          },
          {
            type: 'line',
            label: `50% Healthy Target Line (${motor.healthy_min_kwh} kWh)`,
            data: healthyMinLine,
            borderColor: colorHealthy,
            backgroundColor: colorHealthy,
            borderWidth: 2.5,
            borderDash: [8, 5],
            pointRadius: 0,
            pointStyle: 'line',
            fill: false,
            order: 2,
            yAxisID: 'y'
          },
          {
            type: 'line',
            label: `40% Low-Load Threshold (${motor.idle_max_kwh} kWh)`,
            data: idleMaxLine,
            borderColor: colorLowLoad,
            backgroundColor: colorLowLoad,
            borderWidth: 2.2,
            borderDash: [6, 4],
            pointRadius: 0,
            pointStyle: 'line',
            fill: false,
            order: 2,
            yAxisID: 'y'
          },
          {
            type: 'bar',
            label: 'Actual Operating Load (% of Motor Capacity)',
            data: loadPcts,
            backgroundColor: barColors,
            borderColor: borderColors,
            borderWidth: 1.5,
            borderRadius: 3,
            pointStyle: 'rectRounded',
            order: 1,
            yAxisID: 'y'
          }
        ]
      },
      plugins: [
        {
          id: 'barPercentageLabels',
          afterDatasetsDraw(chart) {
            const chartCtx = chart.ctx;
            // Find the bar dataset index
            const barMeta = chart.getDatasetMeta(3);
            if (!barMeta || !barMeta.data) return;

            barMeta.data.forEach((bar, index) => {
              const pct = loadPcts[index];
              if (pct === undefined || pct === null) return;

              let labelColor = tc.legendColor;
              let labelText = '';

              if (pct > overLimit) {
                labelColor = tc.isLight ? '#dc2626' : '#ff2a55';
                labelText = `${Math.round(pct)}%`;
              } else if (pct >= 50.0) {
                labelColor = tc.isLight ? '#059669' : '#00f59b';
                labelText = `${Math.round(pct)}%`;
              } else if (pct >= 10.0 && pct < 50.0) {
                labelColor = tc.isLight ? '#d97706' : '#ffb703';
                labelText = `${Math.round(pct)}%`;
              } else {
                labelColor = tc.isLight ? '#475569' : '#94a3b8';
                labelText = 'OFF';
              }

              chartCtx.save();
              chartCtx.font = 'bold 11px "JetBrains Mono", monospace';
              chartCtx.textAlign = 'center';
              chartCtx.textBaseline = 'middle';

              const textW = chartCtx.measureText(labelText).width;
              const pillW = Math.max(textW + 8, 30);
              const pillH = 17;
              const yPos = Math.max(bar.y - 12, 14);

              // 1st Preference: Draw solid opaque background pill so benchmark lines NEVER slice through percentage numbers
              chartCtx.fillStyle = tc.isLight ? '#ffffff' : '#070e20';
              chartCtx.strokeStyle = labelColor;
              chartCtx.lineWidth = 1.2;

              chartCtx.beginPath();
              if (chartCtx.roundRect) {
                chartCtx.roundRect(bar.x - (pillW / 2), yPos - (pillH / 2), pillW, pillH, 4);
              } else {
                chartCtx.rect(bar.x - (pillW / 2), yPos - (pillH / 2), pillW, pillH);
              }
              chartCtx.fill();
              chartCtx.stroke();

              // Draw the sharp percentage text inside the pill
              chartCtx.fillStyle = labelColor;
              chartCtx.fillText(labelText, bar.x, yPos);
              chartCtx.restore();
            });
          }
        }
      ],
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: {
            position: 'top',
            labels: {
              color: tc.legendColor,
              font: { family: 'Outfit', size: 12, weight: 600 },
              usePointStyle: true,
              pointStyleWidth: 20,
              boxWidth: 20,
              padding: 16,
              generateLabels(chart) {
                const defaultLabels = Chart.defaults.plugins.legend.labels.generateLabels(chart);
                defaultLabels.forEach(lbl => {
                  if (lbl.datasetIndex === 3) {
                    lbl.fillStyle = tc.isLight ? '#0284c7' : '#00d2ff';
                    lbl.strokeStyle = tc.isLight ? '#0284c7' : '#00d2ff';
                    lbl.pointStyle = 'rectRounded';
                  } else {
                    lbl.pointStyle = 'line';
                  }
                });
                return defaultLabels;
              }
            }
          },
          tooltip: {
            filter: function(item) {
              // Hide repetitive benchmark threshold lines from hover tooltip for a clean, concise card
              return item.dataset.type !== 'line';
            },
            backgroundColor: tc.isLight ? 'rgba(15, 23, 42, 0.95)' : 'rgba(7, 14, 32, 0.95)',
            borderColor: tc.isLight ? '#38bdf8' : '#00d2ff',
            borderWidth: 1.5,
            padding: 12,
            boxPadding: 6,
            usePointStyle: true,
            titleFont: { family: 'Outfit', size: 14, weight: 'bold' },
            bodyFont: { family: 'Outfit', size: 13, weight: '600' },
            callbacks: {
              title(items) {
                const idx = items[0].dataIndex;
                return `Slot #${idx + 1} • ${formatTime12h(rawLabels[idx])}`;
              },
              label(context) {
                const idx = context.dataIndex;
                const val = values[idx];
                const pct = loadPcts[idx];

                let desc = '';
                if (pct > overLimit) {
                  desc = isKohlu ? '🚨 Overload (>100%)' : '🚨 Overload (>80%)';
                } else if (pct >= 50.0) {
                  desc = isKohlu ? '🟢 Optimal (50%–100%)' : '🟢 Optimal (50%–80%)';
                } else if (pct >= 40.0 && pct < 50.0) {
                  desc = '🔵 Normal (40%–50%)';
                } else if (pct >= 10.0 && pct < 40.0) {
                  desc = '🟡 Low Load (10%–40%)';
                } else {
                  desc = '⏹️ Offline / 0 kWh';
                }

                return [
                  ` Load: ${pct}% (${desc})`,
                  ` Consumed: ${val} kWh / ${motor.rated_15m_kwh} kWh max`
                ];
              }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              color: tc.isLight ? '#0f172a' : '#f8fafc',
              font: { family: 'JetBrains Mono', size: 12, weight: 700 },
              maxRotation: 45,
              minRotation: 35,
              autoSkip: true,
              maxTicksLimit: 24
            }
          },
          y: {
            position: 'left',
            grid: { color: tc.gridColor },
            ticks: {
              color: tc.isLight ? '#0f172a' : '#f8fafc',
              font: { family: 'JetBrains Mono', size: 13, weight: 700 },
              callback: (v) => `${v}%`
            },
            title: {
              display: true,
              text: 'Operating Load Percentage (% of Rated HP)',
              color: tc.isLight ? '#0f172a' : '#00d2ff',
              font: { family: 'Outfit', size: 13, weight: 800 }
            },
            suggestedMax: suggestedMaxPct,
            beginAtZero: true
          },
          y1: {
            position: 'right',
            grid: { display: false },
            ticks: {
              color: tc.isLight ? '#334155' : '#cbd5e1',
              font: { family: 'JetBrains Mono', size: 12, weight: 600 },
              callback: (v) => {
                const kwh = (v * (motor.rated_15m_kwh || 10) / 100).toFixed(1);
                return `${kwh} kWh`;
              }
            },
            title: {
              display: true,
              text: '15-Minute Energy (kWh)',
              color: tc.isLight ? '#0f172a' : '#38bdf8',
              font: { family: 'Outfit', size: 12, weight: 700 }
            },
            suggestedMax: suggestedMaxPct,
            beginAtZero: true
          }
        }
      }
    });
  },

  // 7. Dedicated High-Contrast Synchronous Chart Renderers for Executive PDF Audit Sheets
  // Generates pure white-background, razor-sharp slate/dark labels (#0f172a) for maximum legibility in print & PDF
  createAuditCardChart(motor, width = 480, height = 240) {
    if (!motor || !motor.timeline) return '';
    try {
      const offCanvas = document.createElement('canvas');
      offCanvas.width = width;
      offCanvas.height = height;
      const ctx = offCanvas.getContext('2d');
      if (!ctx) return '';
      
      // Solid opaque white background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);

      const timeline = motor.timeline || {};
      const rawLabels = timeline.labels || [];
      const values = timeline.values || [];
      const loadPcts = timeline.load_pcts || [];
      const statuses = timeline.statuses || [];

      const totalSlots = rawLabels.length;
      const milestoneSet = new Set([
        0,
        Math.floor(totalSlots / 3),
        Math.floor((2 * totalSlots) / 3),
        Math.max(0, totalSlots - 1)
      ]);
      const displayLabels = rawLabels.map((lbl, idx) => (milestoneSet.has(idx) ? formatTime12h(lbl) : ''));

      const isKohlu = motor.panel_type === 'KOHLU' || (motor.code && motor.code.startsWith('K'));
      const overLimit = isKohlu ? 100.0 : 80.0;

      const barColors = loadPcts.map((pct, idx) => {
        const st = statuses[idx] || '';
        if (st === 'OVERLOAD' || pct > overLimit) return '#ef4444';
        if (st === 'HEALTHY' || st === 'NORMAL' || pct >= 40.0) return '#10b981';
        if (st === 'IDLE' || pct >= 10.0) return '#f59e0b';
        return '#cbd5e1';
      });

      const borderColors = loadPcts.map((pct, idx) => {
        const st = statuses[idx] || '';
        if (st === 'OVERLOAD' || pct > overLimit) return '#dc2626';
        if (st === 'HEALTHY' || st === 'NORMAL' || pct >= 40.0) return '#059669';
        if (st === 'IDLE' || pct >= 10.0) return '#d97706';
        return '#94a3b8';
      });

      const overloadLine = Array(values.length).fill(motor.overload_threshold_kwh || 0);
      const healthyMinLine = Array(values.length).fill(motor.healthy_min_kwh || 0);
      const idleMaxLine = Array(values.length).fill(motor.idle_max_kwh || 0);

      const maxVal = Math.max(...values, 0);
      const maxBound = Math.max(maxVal * 1.25, (motor.rated_15m_kwh || 10) * 1.25);

      const chart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: displayLabels,
          datasets: [
            {
              type: 'line',
              label: 'Overload Limit',
              data: overloadLine,
              borderColor: '#dc2626',
              borderWidth: 2,
              borderDash: [5, 4],
              pointRadius: 0,
              fill: false,
              tension: 0
            },
            {
              type: 'line',
              label: 'Target Limit',
              data: healthyMinLine,
              borderColor: '#059669',
              borderWidth: 2,
              borderDash: [4, 3],
              pointRadius: 0,
              fill: false,
              tension: 0
            },
            {
              type: 'line',
              label: 'Low Load',
              data: idleMaxLine,
              borderColor: '#d97706',
              borderWidth: 1.8,
              borderDash: [4, 4],
              pointRadius: 0,
              fill: false,
              tension: 0
            },
            {
              type: 'bar',
              label: 'kWh',
              data: values,
              backgroundColor: barColors,
              borderColor: borderColors,
              borderWidth: 1.5,
              borderRadius: 2
            }
          ]
        },
        options: {
          animation: false,
          responsive: false,
          plugins: { legend: { display: false }, tooltip: { enabled: false } },
          scales: {
            x: {
              grid: { display: false },
              ticks: {
                color: '#0f172a',
                font: { family: 'JetBrains Mono', size: 10, weight: 800 },
                maxRotation: 0,
                minRotation: 0,
                autoSkip: false,
                callback: function(val, idx) {
                  return milestoneSet.has(idx) ? formatTime12h(rawLabels[idx]) : '';
                }
              }
            },
            y: {
              grid: { color: '#e2e8f0', lineWidth: 1 },
              ticks: {
                color: '#0f172a',
                font: { family: 'JetBrains Mono', size: 11, weight: 800 },
                maxTicksLimit: 5,
                callback: (v) => `${v}`
              },
              suggestedMax: maxBound,
              beginAtZero: true
            }
          }
        }
      });

      const dataUrl = offCanvas.toDataURL('image/png');
      chart.destroy();
      return dataUrl;
    } catch (e) {
      console.warn('createAuditCardChart error:', e);
      return '';
    }
  },

  createAuditFocusChart(motor, width = 1080, height = 340) {
    if (!motor || !motor.timeline) return '';
    try {
      const offCanvas = document.createElement('canvas');
      offCanvas.width = width;
      offCanvas.height = height;
      const ctx = offCanvas.getContext('2d');
      if (!ctx) return '';
      
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);

      const timeline = motor.timeline || {};
      const rawLabels = timeline.labels || [];
      const values = timeline.values || [];
      const loadPcts = timeline.load_pcts || [];
      const statuses = timeline.statuses || [];

      const isKohlu = motor.panel_type === 'KOHLU' || (motor.code && motor.code.startsWith('K'));
      const overLimit = isKohlu ? 100.0 : 80.0;
      const overLabel = isKohlu ? `100% Full Load Rated Limit (${motor.overload_threshold_kwh} kWh)` : `80% Overload Danger Limit (${motor.overload_threshold_kwh} kWh)`;

      const barColors = loadPcts.map((pct, idx) => {
        const st = statuses[idx] || '';
        if (st === 'OVERLOAD' || pct > overLimit) return '#ef4444';
        if (st === 'HEALTHY' || st === 'NORMAL' || pct >= 40.0) return '#10b981';
        if (st === 'IDLE' || pct >= 10.0) return '#f59e0b';
        return '#94a3b8';
      });

      const borderColors = loadPcts.map((pct, idx) => {
        const st = statuses[idx] || '';
        if (st === 'OVERLOAD' || pct > overLimit) return '#dc2626';
        if (st === 'HEALTHY' || st === 'NORMAL' || pct >= 40.0) return '#059669';
        if (st === 'IDLE' || pct >= 10.0) return '#d97706';
        return '#64748b';
      });

      const overloadLine = Array(loadPcts.length).fill(isKohlu ? 100 : 80);
      const healthyMinLine = Array(loadPcts.length).fill(50);
      const idleMaxLine = Array(loadPcts.length).fill(40);

      const maxPct = Math.max(...loadPcts, 0);
      const suggestedMaxPct = Math.max(105, Math.ceil(maxPct * 1.15));

      const chart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: rawLabels.map(lbl => formatTime12h(lbl)),
          datasets: [
            {
              type: 'line',
              label: overLabel,
              data: overloadLine,
              borderColor: '#dc2626',
              backgroundColor: '#dc2626',
              borderWidth: 2.5,
              borderDash: [8, 5],
              pointRadius: 0,
              fill: false,
              order: 2,
              yAxisID: 'y'
            },
            {
              type: 'line',
              label: `50% Healthy Target (${motor.healthy_min_kwh} kWh)`,
              data: healthyMinLine,
              borderColor: '#059669',
              backgroundColor: '#059669',
              borderWidth: 2.5,
              borderDash: [8, 5],
              pointRadius: 0,
              fill: false,
              order: 2,
              yAxisID: 'y'
            },
            {
              type: 'line',
              label: `40% Low-Load Floor (${motor.idle_max_kwh} kWh)`,
              data: idleMaxLine,
              borderColor: '#d97706',
              backgroundColor: '#d97706',
              borderWidth: 2.2,
              borderDash: [6, 4],
              pointRadius: 0,
              fill: false,
              order: 2,
              yAxisID: 'y'
            },
            {
              type: 'bar',
              label: 'Actual Operating Load (% of Rated Capacity)',
              data: loadPcts,
              backgroundColor: barColors,
              borderColor: borderColors,
              borderWidth: 1.5,
              borderRadius: 3,
              order: 1,
              yAxisID: 'y'
            }
          ]
        },
        plugins: [
          {
            id: 'barLabelsAudit',
            afterDatasetsDraw(chartInstance) {
              const chartCtx = chartInstance.ctx;
              const barMeta = chartInstance.getDatasetMeta(3);
              if (!barMeta || !barMeta.data) return;

              barMeta.data.forEach((bar, index) => {
                const pct = loadPcts[index];
                if (pct === undefined || pct === null) return;

                let labelColor = '#0f172a';
                let labelText = '';

                if (pct > overLimit) {
                  labelColor = '#dc2626';
                  labelText = `${Math.round(pct)}%`;
                } else if (pct >= 50.0) {
                  labelColor = '#059669';
                  labelText = `${Math.round(pct)}%`;
                } else if (pct >= 10.0 && pct < 50.0) {
                  labelColor = '#d97706';
                  labelText = `${Math.round(pct)}%`;
                } else {
                  labelColor = '#475569';
                  labelText = 'OFF';
                }

                chartCtx.save();
                chartCtx.font = 'bold 11px "JetBrains Mono", monospace';
                chartCtx.textAlign = 'center';
                chartCtx.textBaseline = 'middle';

                const textW = chartCtx.measureText(labelText).width;
                const pillW = Math.max(textW + 8, 30);
                const pillH = 17;
                const yPos = Math.max(bar.y - 12, 14);

                chartCtx.fillStyle = '#ffffff';
                chartCtx.strokeStyle = labelColor;
                chartCtx.lineWidth = 1.3;

                chartCtx.beginPath();
                if (chartCtx.roundRect) {
                  chartCtx.roundRect(bar.x - (pillW / 2), yPos - (pillH / 2), pillW, pillH, 4);
                } else {
                  chartCtx.rect(bar.x - (pillW / 2), yPos - (pillH / 2), pillW, pillH);
                }
                chartCtx.fill();
                chartCtx.stroke();

                chartCtx.fillStyle = labelColor;
                chartCtx.fillText(labelText, bar.x, yPos);
                chartCtx.restore();
              });
            }
          }
        ],
        options: {
          animation: false,
          responsive: false,
          plugins: {
            legend: {
              position: 'top',
              labels: {
                color: '#0f172a',
                font: { family: 'Outfit', size: 12, weight: 700 },
                usePointStyle: true,
                padding: 14
              }
            },
            tooltip: { enabled: false }
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: {
                color: '#0f172a',
                font: { family: 'JetBrains Mono', size: 11, weight: 700 },
                maxRotation: 45,
                minRotation: 35,
                autoSkip: true,
                maxTicksLimit: 24
              }
            },
            y: {
              position: 'left',
              grid: { color: '#e2e8f0' },
              ticks: {
                color: '#0f172a',
                font: { family: 'JetBrains Mono', size: 12, weight: 800 },
                callback: (v) => `${v}%`
              },
              title: {
                display: true,
                text: 'Operating Load Percentage (% of Rated HP)',
                color: '#0284c7',
                font: { family: 'Outfit', size: 12, weight: 800 }
              },
              suggestedMax: suggestedMaxPct,
              beginAtZero: true
            },
            y1: {
              position: 'right',
              grid: { display: false },
              ticks: {
                color: '#0f172a',
                font: { family: 'JetBrains Mono', size: 11, weight: 700 },
                callback: (v) => {
                  const kwh = (v * (motor.rated_15m_kwh || 10) / 100).toFixed(1);
                  return `${kwh} kWh`;
                }
              },
              title: {
                display: true,
                text: '15-Minute Energy (kWh)',
                color: '#0284c7',
                font: { family: 'Outfit', size: 12, weight: 700 }
              },
              suggestedMax: suggestedMaxPct,
              beginAtZero: true
            }
          }
        }
      });

      const dataUrl = offCanvas.toDataURL('image/png');
      chart.destroy();
      return dataUrl;
    } catch (e) {
      console.warn('createAuditFocusChart error:', e);
      return '';
    }
  }
};
