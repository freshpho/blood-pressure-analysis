/**
 * ui.js
 * OMRON Blood Pressure Dashboard — UI Rendering Module
 *
 * Handles all DOM manipulation:
 *   • Summary stat cards
 *   • Calendar widget
 *   • Day-detail modal
 *   • Readings list with pagination & filtering
 *   • BP category reference table
 *   • Period segment control
 *   • Toast notifications
 *   • Welcome screen / dashboard visibility toggle
 *
 * Dependencies (must be loaded before this file):
 *   - state.js       (all state vars + utility helpers)
 *   - categories.js  (CATS, getCategory)
 */

'use strict';

/* ── Summary stat cards ─────────────────────────────────────────────────── */

/**
 * Renders the four summary stat cards (Systolic, Diastolic, Pulse, Readings)
 * into the #stat-grid element.
 *
 * @param {import('./csv-parser.js').BPReading[]} data - Filtered readings
 */
function renderStats(data) {
  const el = document.getElementById('stat-grid');

  if (!data.length) {
    el.innerHTML = `
      <div class="ios-card" style="grid-column:1/-1;padding:20px">
        <div class="empty-state">
          <div class="empty-state-icon">🩺</div>
          <div class="empty-state-text">No readings in this period</div>
        </div>
      </div>`;
    return;
  }

  const sysList   = data.map(r => r.sys);
  const diaList   = data.map(r => r.dia);
  const pulseList = data.map(r => r.pulse);

  const as = avg(sysList);
  const ad = avg(diaList);
  const ap = avg(pulseList);

  const sMin = Math.min(...sysList);
  const sMax = Math.max(...sysList);
  const dMin = Math.min(...diaList);
  const dMax = Math.max(...diaList);
  const pMin = Math.min(...pulseList);
  const pMax = Math.max(...pulseList);

  const cat  = getCategory(as, ad);
  const ihb  = data.filter(r => r.ihb).length;
  const days = groupByDay(data).length;

  el.innerHTML = `
    <div class="stat-card">
      <div class="stat-label">Systolic</div>
      <div class="stat-val" style="color:${cat.color}">${as}</div>
      <div class="stat-sub">
        <span class="ios-pill" style="background:${cat.bg};color:${cat.text}">${cat.label}</span>
      </div>
      <div class="stat-minmax">
        <span><span class="minmax-label">Min</span> ${sMin}</span>
        <span style="color:var(--ios-label4)">·</span>
        <span><span class="minmax-label">Max</span> ${sMax}</span>
      </div>
    </div>

    <div class="stat-card">
      <div class="stat-label">Diastolic</div>
      <div class="stat-val">${ad}</div>
      <div class="stat-sub" style="color:var(--ios-label2)">mmHg avg</div>
      <div class="stat-minmax">
        <span><span class="minmax-label">Min</span> ${dMin}</span>
        <span style="color:var(--ios-label4)">·</span>
        <span><span class="minmax-label">Max</span> ${dMax}</span>
      </div>
    </div>

    <div class="stat-card">
      <div class="stat-label">Pulse</div>
      <div class="stat-val" style="color:var(--ios-blue)">${ap}</div>
      <div class="stat-sub" style="color:var(--ios-label2)">bpm avg</div>
      <div class="stat-minmax">
        <span><span class="minmax-label">Min</span> ${pMin}</span>
        <span style="color:var(--ios-label4)">·</span>
        <span><span class="minmax-label">Max</span> ${pMax}</span>
      </div>
    </div>

    <div class="stat-card">
      <div class="stat-label">Readings</div>
      <div class="stat-val">${data.length}</div>
      <div class="stat-sub" style="color:${ihb ? 'var(--ios-orange)' : 'var(--ios-label2)'}">
        ${days}d · ${ihb} IHB
      </div>
    </div>`;
}

/* ── Calendar widget ────────────────────────────────────────────────────── */

/** Navigate the calendar one month back */
function calPrev() {
  calViewDate = new Date(calViewDate.getFullYear(), calViewDate.getMonth() - 1, 1);
  renderCalendar(filterData(currentPeriod));
}

/** Navigate the calendar one month forward */
function calNext() {
  calViewDate = new Date(calViewDate.getFullYear(), calViewDate.getMonth() + 1, 1);
  renderCalendar(filterData(currentPeriod));
}

/**
 * Renders the month-grid calendar for the month held in `calViewDate`.
 * Each day cell is colour-coded by its average BP category.
 * Tapping a day with data opens the day-detail modal.
 *
 * @param {import('./csv-parser.js').BPReading[]} data - Filtered readings
 */
function renderCalendar(data) {
  const yr = calViewDate.getFullYear();
  const mo = calViewDate.getMonth();

  // Update the month/year heading
  document.getElementById('cal-month-label').textContent =
    calViewDate.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });

  const grid = document.getElementById('cal-grid');

  // Day-of-week headers
  const dayNames = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  let html = dayNames.map(d => `<div class="cal-hdr">${d}</div>`).join('');

  // Blank cells before the 1st of the month
  const firstWeekday = new Date(yr, mo, 1).getDay();
  for (let i = 0; i < firstWeekday; i++) {
    html += '<div></div>';
  }

  // Index the data by day-of-month for quick lookup
  const byDay = {};
  data.forEach(r => {
    const d = new Date(r.ts);
    if (d.getFullYear() === yr && d.getMonth() === mo) {
      const key = d.getDate();
      if (!byDay[key]) byDay[key] = [];
      byDay[key].push(r);
    }
  });

  // Render each day cell
  const daysInMonth = new Date(yr, mo + 1, 0).getDate();

  for (let day = 1; day <= daysInMonth; day++) {
    const readings = byDay[day];

    if (!readings || !readings.length) {
      html += `<div class="cal-day"><span class="cal-empty">${day}</span></div>`;
      continue;
    }

    const as  = avg(readings.map(r => r.sys));
    const ad  = avg(readings.map(r => r.dia));
    const cat = getCategory(as, ad);
    const ihb = readings.some(r => r.ihb);

    // Diastolic-tier colour for the lower half of the split-circle
    const diaColour = ad >= 90 ? '#ff3b30' : ad >= 80 ? '#ff6b35' : '#34c759';

    const dateKey = `${yr}-${mo + 1}-${day}`;
    const title   = `${as}/${ad} — ${cat.label}${ihb ? ' · IHB' : ''}`;

    html += `
      <div class="cal-day has-data"
           onclick="openDayModal('${dateKey}')"
           title="${title}">
        <div class="cal-inner"
             style="background:${cat.bg};border:1.5px solid ${cat.color}40">
          <svg width="100%" height="100%" viewBox="0 0 30 30"
               style="position:absolute;top:0;left:0;pointer-events:none">
            <path d="M15,15 m-12,0 a12,12 0 0,1 24,0 Z"
                  fill="${cat.color}" opacity="0.55"/>
            <path d="M15,15 m-12,0 a12,12 0 0,0 24,0 Z"
                  fill="${diaColour}" opacity="0.4"/>
          </svg>
          ${ihb ? '<div class="cal-ihb"></div>' : ''}
          <span class="cal-num" style="color:${cat.text}">${day}</span>
        </div>
      </div>`;
  }

  grid.innerHTML = html;

  // Render the colour-key legend below the grid
  document.getElementById('cal-legend').innerHTML = CATS.map(c => `
    <span>
      <span style="width:8px;height:8px;border-radius:50%;background:${c.bg};
                   border:1.5px solid ${c.color}50;display:inline-block"></span>
      ${c.label}
    </span>`).join('');
}

/* ── Day-detail modal ───────────────────────────────────────────────────── */

/**
 * Opens the day-detail modal sheet for the specified date.
 * Reads from the global RAW array (all readings, not just the filtered set)
 * so that tapping a calendar cell always shows full day data.
 *
 * @param {string} dateKey - Format "YYYY-M-D" (month/day are 1-based)
 */
function openDayModal(dateKey) {
  const [yr, mo, day] = dateKey.split('-').map(Number);
  const dayStart = new Date(yr, mo - 1, day).getTime();
  const dayEnd   = dayStart + 86400000 - 1;

  const readings = RAW.filter(r => r.ts >= dayStart && r.ts <= dayEnd);
  if (!readings.length) return;

  const date      = new Date(yr, mo - 1, day);
  const as        = avg(readings.map(r => r.sys));
  const ad        = avg(readings.map(r => r.dia));
  const ap        = avg(readings.map(r => r.pulse));
  const cat       = getCategory(as, ad);

  // Header
  document.getElementById('modal-title').textContent =
    date.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' });

  document.getElementById('modal-subtitle').innerHTML =
    `${readings.length} reading${readings.length !== 1 ? 's' : ''} · ` +
    `<span class="ios-pill" style="background:${cat.bg};color:${cat.text}">${cat.label}</span>`;

  // Average stat tiles
  document.getElementById('modal-stats').innerHTML = `
    <div class="modal-stat">
      <div class="modal-stat-label">Systolic</div>
      <div class="modal-stat-val" style="color:${cat.color}">${as}</div>
      <div class="modal-stat-unit">mmHg avg</div>
    </div>
    <div class="modal-stat">
      <div class="modal-stat-label">Diastolic</div>
      <div class="modal-stat-val">${ad}</div>
      <div class="modal-stat-unit">mmHg avg</div>
    </div>
    <div class="modal-stat">
      <div class="modal-stat-label">Pulse</div>
      <div class="modal-stat-val" style="color:var(--ios-blue)">${ap}</div>
      <div class="modal-stat-unit">bpm avg</div>
    </div>`;

  // Individual reading rows
  document.getElementById('modal-readings').innerHTML = readings.map((r, i) => {
    const rc = getCategory(r.sys, r.dia);
    return `
      <div class="modal-reading">
        <div class="modal-reading-num">${i + 1}</div>
        <div>
          <div class="modal-reading-bp" style="color:${rc.color}">${r.sys}/${r.dia}</div>
          <div class="modal-reading-meta">${fmtTime(r.ts)} · ${r.pulse} bpm</div>
        </div>
        <div class="modal-reading-right">
          <div class="modal-cat-pill"
               style="background:${rc.bg};color:${rc.text}">${rc.label}</div>
          ${r.ihb ? '<div class="ihb-badge">IHB</div>' : ''}
        </div>
      </div>`;
  }).join('');

  document.getElementById('modal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

/**
 * Closes the modal when the backdrop (outside the sheet) is clicked.
 *
 * @param {MouseEvent} e
 */
function closeModal(e) {
  if (e.target === document.getElementById('modal')) {
    closeModalDirect();
  }
}

/** Unconditionally closes the day-detail modal sheet. */
function closeModalDirect() {
  document.getElementById('modal').classList.remove('open');
  document.body.style.overflow = '';
}

// Close modal on Escape key
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModalDirect();
});

/* ── BP category reference table ────────────────────────────────────────── */

/**
 * Populates the static BP-category reference list (#cat-table).
 * Called once on initialisation.
 */
function renderCatTable() {
  document.getElementById('cat-table').innerHTML = CATS.map(c => `
    <div class="cat-item">
      <div class="cat-color-bar" style="background:${c.color}"></div>
      <div class="cat-info">
        <div class="cat-name" style="color:${c.color}">${c.label}</div>
        <div class="cat-range">
          SYS ${c.sys[0]}–${c.sys[1] === 999 ? '180+' : c.sys[1]} /
          DIA ${c.dia[0]}–${c.dia[1] === 999 ? '120+' : c.dia[1]} mmHg
        </div>
      </div>
    </div>`).join('');
}

/* ── Readings list (paginated) ──────────────────────────────────────────── */

/**
 * Loads new readings data into the list, resets to page 1, and renders.
 *
 * @param {import('./csv-parser.js').BPReading[]} data - Filtered readings
 */
function renderReadings(data) {
  currentReadings = [...data].sort((a, b) => b.ts - a.ts); // newest first
  currentPage     = 1;
  renderReadingsPage();
}

/**
 * Sets the active category filter pill and re-renders the page.
 *
 * @param {string} cat - Category label, or 'all' to clear the filter
 */
function setCatFilter(cat) {
  catFilter   = cat;
  currentPage = 1;

  // Sync active pill highlight
  document.querySelectorAll('.filter-pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.cat === cat);
  });

  renderReadingsPage();
}

/**
 * Sets the page size and re-renders the current page.
 * 0 means show all rows.
 *
 * @param {number} size
 */
function setPageSize(size) {
  PAGE_SIZE   = size;
  currentPage = 1;

  // Sync active segment button
  ['ps-10', 'ps-25', 'ps-50', 'ps-0'].forEach(id => {
    document.getElementById(id)?.classList.remove('active');
  });
  document.getElementById(`ps-${size === 0 ? '0' : size}`)?.classList.add('active');

  renderReadingsPage();
}

/**
 * Renders the current page of the readings list, applying the active
 * category filter.  Also updates the pagination controls.
 */
function renderReadingsPage() {
  const listEl  = document.getElementById('reading-list');
  const pageEl  = document.getElementById('pagination');
  const countEl = document.getElementById('readings-count');

  // Apply category filter
  const filtered = catFilter === 'all'
    ? currentReadings
    : currentReadings.filter(r => getCategory(r.sys, r.dia).label === catFilter);

  const total    = filtered.length;
  const allTotal = currentReadings.length;

  if (!total) {
    const label = catFilter === 'all' ? 'readings' : `${catFilter} readings`;
    listEl.innerHTML = `
      <div class="empty-state" style="padding:30px">
        <div class="empty-state-icon">🔍</div>
        <div class="empty-state-text">No ${label} in this period</div>
      </div>`;
    pageEl.innerHTML = '';
    countEl.textContent = catFilter !== 'all' ? `${total} of ${allTotal}` : '';
    return;
  }

  const pageSize   = PAGE_SIZE === 0 ? total : PAGE_SIZE;
  const totalPages = Math.ceil(total / pageSize);
  const start      = (currentPage - 1) * pageSize;
  const end        = Math.min(start + pageSize, total);
  const pageData   = filtered.slice(start, end);

  countEl.textContent = catFilter !== 'all'
    ? `${total} of ${allTotal} total`
    : `${allTotal} total`;

  listEl.innerHTML = pageData.map(r => {
    const cat = getCategory(r.sys, r.dia);
    return `
      <div class="reading-item">
        <span class="reading-date">${fdt(r.ts)}</span>
        <span class="reading-val" style="color:${cat.color}">${r.sys}/${r.dia}</span>
        <span>
          <span class="ios-pill"
                style="background:${cat.bg};color:${cat.text}">${cat.label}</span>
        </span>
        ${r.ihb ? '<span class="ihb-badge">IHB</span>' : ''}
        <span class="reading-pulse">${r.pulse} bpm</span>
      </div>`;
  }).join('');

  // Pagination controls (hidden when showing all or only one page)
  if (PAGE_SIZE === 0 || totalPages <= 1) {
    pageEl.innerHTML = '';
    return;
  }

  pageEl.innerHTML = `
    <span class="page-info">
      Page ${currentPage} of ${totalPages} &middot; ${start + 1}&ndash;${end} of ${total}
    </span>
    <div class="page-btns">
      <button class="page-btn"
              onclick="goPage(${currentPage - 1})"
              ${currentPage === 1 ? 'disabled' : ''}>Previous</button>
      <button class="page-btn"
              onclick="goPage(${currentPage + 1})"
              ${currentPage === totalPages ? 'disabled' : ''}>Next</button>
    </div>`;
}

/**
 * Navigates to a specific page in the readings list.
 *
 * @param {number} page - 1-based target page number
 */
function goPage(page) {
  currentPage = page;
  renderReadingsPage();

  // Scroll the readings card into view smoothly
  document.querySelector('.ios-card:last-child').scrollIntoView({
    behavior : 'smooth',
    block    : 'start'
  });
}

/* ── Period segment control ─────────────────────────────────────────────── */

/**
 * Activates a time-filter period, updates the UI, and re-renders all
 * dashboard sections.
 *
 * @param {'7d'|'week'|'month'|'year'|'all'|'custom'} period
 */
function setPeriod(period) {
  currentPeriod = period;

  // Sync active segment button
  ['7d', 'week', 'month', 'year', 'all', 'custom'].forEach(id => {
    const btn = document.getElementById(`btn-${id}`);
    if (btn) btn.classList.toggle('active', id === period);
  });

  // Show / hide the custom date-range inputs
  const customRange = document.getElementById('custom-range');
  customRange.style.display = period === 'custom' ? 'flex' : 'none';

  if (period !== 'custom') {
    document.getElementById('range-start').value = '';
    document.getElementById('range-end').value   = '';
  }

  const data = filterData(period);
  renderStats(data);
  renderChart(data);
  renderReadings(data);

  // Set the calendar to the month of the most-recent reading in this period
  if (data.length) {
    const last = new Date(Math.max(...data.map(r => r.ts)));
    calViewDate = new Date(last.getFullYear(), last.getMonth(), 1);
  } else {
    calViewDate = new Date(getToday().getFullYear(), getToday().getMonth(), 1);
  }

  renderCalendar(data);
}

/* ── Toast notification ─────────────────────────────────────────────────── */

/**
 * Displays a short toast message at the bottom of the screen,
 * then auto-dismisses after ~2.8 seconds.
 *
 * @param {string} msg - Message text (can include emoji)
 */
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('show'), 2800);
}

/* ── Welcome screen / dashboard visibility ──────────────────────────────── */

/**
 * Shows the welcome screen when no data is loaded; shows the dashboard
 * when data is available.  Called after every CSV load and on init.
 */
function updateDataState() {
  const hasData = RAW.length > 0;
  document.getElementById('welcome-screen').style.display = hasData ? 'none'  : 'flex';
  document.getElementById('dashboard').style.display      = hasData ? 'block' : 'none';
  document.getElementById('navbar-actions').style.display = hasData ? 'flex'  : 'none';
  if (hasData) setPeriod(currentPeriod);
}
