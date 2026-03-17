/**
 * charts.js
 * OMRON Blood Pressure Dashboard — Chart Rendering Module
 *
 * Builds and manages the two Chart.js chart types:
 *
 *   • Range bars  — daily min/max systolic + diastolic with connecting bar,
 *                   pulse average as a dashed line overlay (custom plugin).
 *   • Line chart  — individual readings plotted chronologically with
 *                   separate y-axes for BP (mmHg) and pulse (bpm).
 *
 * Both chart builders accept an HTMLCanvasElement and the filtered data
 * array; they return the new Chart instance so the caller can destroy it
 * before the next render.
 *
 * Dependencies (must be loaded before this file):
 *   - Chart.js  (global `Chart`)
 *   - state.js  (avg, fd, fdt, groupByDay, getCategory)
 *   - categories.js (CATS, getCategory)
 */

'use strict';

/* ── Chart theme helpers ────────────────────────────────────────────────── */

/**
 * Returns chart colour tokens appropriate for the current colour scheme.
 *
 * @returns {{ gridColor: string, tickColor: string, isDark: boolean }}
 */
function getChartTheme() {
  const isDark = matchMedia('(prefers-color-scheme: dark)').matches;
  return {
    isDark,
    gridColor : isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.04)',
    tickColor : isDark ? 'rgba(235,235,245,0.4)'  : 'rgba(60,60,67,0.4)'
  };
}

/* ── Range-bar chart ────────────────────────────────────────────────────── */

/**
 * Custom Chart.js plugin that draws the range bars, dots, IHB indicators
 * and horizontal threshold lines on top of the standard chart render.
 *
 * @param {object[]} dayData   - Output of groupByDay()
 * @param {number[]} sysMax    - Daily max systolic per day
 * @param {number[]} sysMin    - Daily min systolic per day
 * @param {number[]} diaMax    - Daily max diastolic per day
 * @param {number[]} diaMin    - Daily min diastolic per day
 * @param {boolean[]} ihbs     - Whether any IHB occurred per day
 * @param {boolean}  isDark
 * @returns {object} Chart.js plugin object
 */
function createRangeBarPlugin(dayData, sysMax, sysMin, diaMax, diaMin, ihbs, isDark) {
  return {
    id: 'rangeBar',

    afterDatasetsDraw(chart) {
      const { ctx, scales: { x, y } } = chart;
      const n = dayData.length;

      // Bar width scales with available horizontal space, clamped between 5–16 px
      const slotWidth = (x.right - x.left) / Math.max(n, 1);
      const barWidth  = Math.min(16, Math.max(5, slotWidth * 0.42));

      ctx.save();

      /* ── Per-day bars and dots ── */
      for (let i = 0; i < n; i++) {
        const cx = x.getPixelForValue(i);

        // Pixel positions for the four range extremes
        const ySysMax = y.getPixelForValue(sysMax[i]);
        const ySysMin = y.getPixelForValue(sysMin[i]);
        const yDiaMax = y.getPixelForValue(diaMax[i]);
        const yDiaMin = y.getPixelForValue(diaMin[i]);

        // Background fill spanning SYS max → DIA min
        ctx.fillStyle = isDark
          ? 'rgba(120,160,210,0.28)'
          : 'rgba(100,150,210,0.22)';
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(cx - barWidth / 2, ySysMax, barWidth, yDiaMin - ySysMax, 2);
        } else {
          ctx.rect(cx - barWidth / 2, ySysMax, barWidth, yDiaMin - ySysMax);
        }
        ctx.fill();

        // SYS max dot (solid blue)
        ctx.fillStyle = '#007aff';
        ctx.beginPath();
        ctx.arc(cx, ySysMax, 4, 0, Math.PI * 2);
        ctx.fill();

        // SYS min dot (translucent blue) — only when min ≠ max
        if (sysMin[i] !== sysMax[i]) {
          ctx.fillStyle = 'rgba(0,122,255,0.35)';
          ctx.beginPath();
          ctx.arc(cx, ySysMin, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }

        // DIA min dot (solid red)
        ctx.fillStyle = '#ff3b30';
        ctx.beginPath();
        ctx.arc(cx, yDiaMin, 4, 0, Math.PI * 2);
        ctx.fill();

        // DIA max dot (translucent red) — only when min ≠ max
        if (diaMin[i] !== diaMax[i]) {
          ctx.fillStyle = 'rgba(255,59,48,0.35)';
          ctx.beginPath();
          ctx.arc(cx, yDiaMax, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }

        // IHB indicator — small orange "!" above the SYS dot
        if (ihbs[i]) {
          ctx.fillStyle = '#ff9500';
          ctx.font      = 'bold 9px -apple-system,sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('!', cx, ySysMax - 6);
        }
      }

      /* ── Threshold reference lines (135 / 85 mmHg) ── */
      [[135, '#ff3b30'], [85, '#ff3b30']].forEach(([value, colour]) => {
        const py = y.getPixelForValue(value);
        ctx.strokeStyle  = colour;
        ctx.lineWidth    = 1;
        ctx.globalAlpha  = 0.3;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(x.left,  py);
        ctx.lineTo(x.right, py);
        ctx.stroke();

        ctx.globalAlpha = 1;
        ctx.fillStyle   = colour;
        ctx.font        = '500 9px -apple-system,sans-serif';
        ctx.textAlign   = 'left';
        ctx.fillText(value, x.left + 2, py - 3);
      });

      ctx.restore();
    }
  };
}

/**
 * Builds (and returns) a Chart.js range-bar chart on the given canvas.
 *
 * @param  {HTMLCanvasElement} canvas
 * @param  {import('./csv-parser.js').BPReading[]} data - Filtered readings
 * @returns {Chart}
 */
function buildRangeChart(canvas, data) {
  const { isDark, gridColor, tickColor } = getChartTheme();
  const days   = groupByDay(data);
  const labels = days.map(d => fd(d.ts));

  // Pre-compute per-day aggregates
  const sysMax = days.map(d => Math.max(...d.readings.map(r => r.sys)));
  const sysMin = days.map(d => Math.min(...d.readings.map(r => r.sys)));
  const diaMax = days.map(d => Math.max(...d.readings.map(r => r.dia)));
  const diaMin = days.map(d => Math.min(...d.readings.map(r => r.dia)));
  const pAvg   = days.map(d => avg(d.readings.map(r => r.pulse)));
  const ihbs   = days.map(d => d.readings.some(r => r.ihb));

  const plugin = createRangeBarPlugin(days, sysMax, sysMin, diaMax, diaMin, ihbs, isDark);

  return new Chart(canvas, {
    type    : 'line',
    plugins : [plugin],

    data: {
      labels,
      datasets: [{
        label              : 'Pulse',
        data               : pAvg,
        borderColor        : '#007aff',
        backgroundColor    : 'transparent',
        pointBackgroundColor: '#007aff',
        pointRadius        : 2.5,
        pointHoverRadius   : 5,
        borderWidth        : 1.5,
        borderDash         : [4, 3],
        tension            : 0.35
      }]
    },

    options: {
      responsive          : true,
      maintainAspectRatio : false,
      animation           : false,
      interaction         : { mode: 'index', intersect: false },

      plugins: {
        legend : { display: false },

        tooltip: {
          backgroundColor : isDark ? 'rgba(44,44,46,0.95)' : 'rgba(30,30,32,0.9)',
          titleColor      : '#fff',
          bodyColor       : 'rgba(255,255,255,0.7)',
          padding         : 10,
          cornerRadius    : 10,

          callbacks: {
            title: items => fd(days[items[0].dataIndex].ts),

            afterBody: items => {
              const i   = items[0].dataIndex;
              const day = days[i];
              const cat = getCategory(
                avg(day.readings.map(r => r.sys)),
                avg(day.readings.map(r => r.dia))
              );

              const lines = [
                `SYS: ${sysMin[i] === sysMax[i] ? sysMax[i] : sysMin[i] + '–' + sysMax[i]} mmHg`,
                `DIA: ${diaMin[i] === diaMax[i] ? diaMin[i] : diaMin[i] + '–' + diaMax[i]} mmHg`,
                `Pulse: ${pAvg[i]} bpm`,
                `Category: ${cat.label}`,
                `Readings: ${day.readings.length}`
              ];

              if (ihbs[i]) lines.push('⚠ IHB detected');
              return lines;
            },

            // Suppress the default dataset label line
            label: () => null
          }
        }
      },

      scales: {
        x: {
          ticks  : { color: tickColor, font: { size: 10, family: '-apple-system,sans-serif' }, maxRotation: 45, autoSkip: true, maxTicksLimit: 20 },
          grid   : { color: gridColor },
          border : { color: 'transparent' }
        },
        y: {
          min    : 60,
          max    : 180,
          ticks  : { color: tickColor, font: { size: 10, family: '-apple-system,sans-serif' }, stepSize: 20 },
          grid   : { color: gridColor },
          border : { color: 'transparent' }
        }
      }
    }
  });
}

/* ── Line chart (individual readings) ──────────────────────────────────── */

/**
 * Builds (and returns) a Chart.js line chart plotting each individual
 * reading chronologically, with separate y-axes for BP and pulse.
 *
 * @param  {HTMLCanvasElement} canvas
 * @param  {import('./csv-parser.js').BPReading[]} data - Filtered readings
 * @returns {Chart}
 */
function buildLineChart(canvas, data) {
  const { isDark, gridColor, tickColor } = getChartTheme();
  const sorted = [...data].sort((a, b) => a.ts - b.ts);

  const labels = sorted.map(r => {
    const d = new Date(r.ts);
    return (
      d.toLocaleDateString('en-AU', { day: 'numeric', month: 'numeric' }) +
      ' ' +
      d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })
    );
  });

  return new Chart(canvas, {
    type : 'line',

    data: {
      labels,
      datasets: [
        {
          label               : 'Systolic',
          data                : sorted.map(r => r.sys),
          borderColor         : '#007aff',
          backgroundColor     : 'rgba(0,122,255,0.06)',
          pointBackgroundColor: sorted.map(r => getCategory(r.sys, r.dia).color),
          pointRadius         : 4,
          pointHoverRadius    : 6,
          borderWidth         : 2,
          tension             : 0.3,
          fill                : false,
          yAxisID             : 'y'
        },
        {
          label               : 'Diastolic',
          data                : sorted.map(r => r.dia),
          borderColor         : '#34c759',
          backgroundColor     : 'rgba(52,199,89,0.06)',
          pointBackgroundColor: '#34c759',
          pointRadius         : 3,
          pointHoverRadius    : 5,
          borderWidth         : 1.5,
          tension             : 0.3,
          fill                : false,
          yAxisID             : 'y'
        },
        {
          label               : 'Pulse',
          data                : sorted.map(r => r.pulse),
          borderColor         : '#ff9500',
          backgroundColor     : 'rgba(255,149,0,0.06)',
          pointBackgroundColor: '#ff9500',
          pointRadius         : 3,
          pointHoverRadius    : 5,
          borderWidth         : 1.5,
          borderDash          : [4, 3],
          tension             : 0.3,
          fill                : false,
          yAxisID             : 'y2'
        }
      ]
    },

    options: {
      responsive          : true,
      maintainAspectRatio : false,
      animation           : false,
      interaction         : { mode: 'index', intersect: false },

      plugins: {
        legend : { display: false },

        tooltip: {
          backgroundColor : isDark ? 'rgba(44,44,46,0.95)' : 'rgba(30,30,32,0.9)',
          titleColor      : '#fff',
          bodyColor       : 'rgba(255,255,255,0.7)',
          padding         : 10,
          cornerRadius    : 10,

          callbacks: {
            title: items => {
              const r   = sorted[items[0].dataIndex];
              const cat = getCategory(r.sys, r.dia);
              return `${labels[items[0].dataIndex]} · ${cat.label}`;
            }
          }
        }
      },

      scales: {
        x: {
          ticks  : { color: tickColor, font: { size: 9, family: '-apple-system,sans-serif' }, maxRotation: 45, autoSkip: true, maxTicksLimit: 18 },
          grid   : { color: gridColor },
          border : { color: 'transparent' }
        },
        y: {
          min      : 60,
          max      : 180,
          position : 'left',
          ticks    : { color: tickColor, font: { size: 10, family: '-apple-system,sans-serif' }, stepSize: 20 },
          grid     : { color: gridColor },
          border   : { color: 'transparent' },
          title    : { display: true, text: 'mmHg', color: tickColor, font: { size: 10 } }
        },
        y2: {
          min      : 40,
          max      : 120,
          position : 'right',
          ticks    : { color: '#ff9500', font: { size: 10, family: '-apple-system,sans-serif' }, stepSize: 20 },
          grid     : { drawOnChartArea: false },
          border   : { color: 'transparent' },
          title    : { display: true, text: 'bpm', color: '#ff9500', font: { size: 10 } }
        }
      }
    }
  });
}

/* ── Public render entrypoint ───────────────────────────────────────────── */

/**
 * Re-renders the main chart according to the current chart-view mode.
 * Destroys any existing Chart instance first to prevent canvas leaks.
 *
 * @param  {import('./csv-parser.js').BPReading[]} data - Filtered readings
 */
function renderChart(data) {
  const wrap  = document.getElementById('chart-wrap');
  const empty = document.getElementById('chart-empty');

  // Destroy previous instance
  if (mainChart) {
    mainChart.destroy();
    mainChart = null;
  }

  // Show empty state when there is no data
  if (!data.length) {
    wrap.style.display  = 'none';
    empty.style.display = 'flex';
    return;
  }

  wrap.style.display  = 'block';
  empty.style.display = 'none';

  const canvas = document.getElementById('mainChart');
  mainChart = currentChartView === 'line'
    ? buildLineChart(canvas, data)
    : buildRangeChart(canvas, data);
}

/**
 * Switches between 'range' and 'line' views and re-renders the chart.
 *
 * @param {'range'|'line'} view
 */
function setChartView(view) {
  currentChartView = view;

  // Toggle active state on the segment buttons
  document.getElementById('cv-range').classList.toggle('active', view === 'range');
  document.getElementById('cv-line').classList.toggle('active',  view === 'line');

  // Swap legend HTML to match the selected view
  const leg = document.getElementById('chart-legend');
  if (view === 'line') {
    leg.innerHTML = `
      <span><span class="ld" style="background:#007aff"></span>Systolic</span>
      <span><span class="ld" style="background:#34c759"></span>Diastolic</span>
      <span><span style="width:14px;height:2px;background:#ff9500;display:inline-block;border-radius:1px"></span>Pulse</span>`;
  } else {
    leg.innerHTML = `
      <span><span class="ld" style="background:#007aff"></span>Systolic</span>
      <span><span class="ld" style="background:#ff3b30"></span>Diastolic</span>
      <span><span class="ld-dash"></span>Pulse</span>
      <span style="color:var(--ios-label3);gap:4px">
        <span style="width:12px;height:1px;background:#ff3b30;display:inline-block;opacity:.5"></span>85/135
      </span>`;
  }

  renderChart(filterData(currentPeriod));
}
