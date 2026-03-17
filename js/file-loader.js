/**
 * file-loader.js
 * OMRON Blood Pressure Dashboard — File Loading Module
 *
 * Handles all mechanisms by which a CSV file enters the application:
 *   1. Native <input type="file"> via the "Upload" button / welcome CTA.
 *   2. Drag-and-drop anywhere on the page.
 *
 * Both paths converge on `loadCSV(text, filename)`, which parses the
 * content and updates application state.
 *
 * Dependencies:
 *   - csv-parser.js  (parseCSV)
 *   - state.js       (RAW, currentPeriod, currentFileName)
 *   - ui.js          (showToast, updateDataState)
 */

'use strict';

/* ── CSV ingest ─────────────────────────────────────────────────────────── */

/**
 * Parses CSV text, stores readings in the global RAW array, and
 * triggers a full dashboard re-render.
 *
 * @param {string} text     - Raw CSV file content
 * @param {string} filename - Original filename (shown in the navbar)
 */
function loadCSV(text, filename) {
  const parsed = parseCSV(text);

  if (!parsed || !parsed.length) {
    showToast('No valid readings found');
    return;
  }

  RAW             = parsed;
  currentFileName = filename;

  document.getElementById('file-label').textContent =
    `${filename} · ${parsed.length} readings`;

  showToast(`✓ Loaded ${parsed.length} readings`);

  // Default to "7 days" view, falling back to "all" if the latest
  // reading is older than 7 days (i.e. nothing would show)
  const latest = new Date(Math.max(...RAW.map(r => r.ts)));
  const cutoff = new Date(latest);
  cutoff.setDate(latest.getDate() - 6);

  currentPeriod = RAW.filter(r => r.ts >= cutoff.getTime()).length > 0
    ? '7d'
    : 'all';

  updateDataState();
}

/* ── File input (<input type="file">) ───────────────────────────────────── */

document.getElementById('csv-input').addEventListener('change', function (e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader    = new FileReader();
  reader.onload   = ev => loadCSV(ev.target.result, file.name);
  reader.readAsText(file);

  // Reset so the same file can be re-selected
  e.target.value = '';
});

/* ── Drag-and-drop ──────────────────────────────────────────────────────── */

const dropOverlay = document.getElementById('drop-overlay');

/**
 * Counter used to track nested dragenter/dragleave events.
 * The overlay should only hide when the drag actually leaves the window.
 *
 * @type {number}
 */
let dragCounter = 0;

document.addEventListener('dragenter', e => {
  if (e.dataTransfer.types.includes('Files')) {
    dragCounter++;
    dropOverlay.classList.add('active');
  }
});

document.addEventListener('dragleave', () => {
  if (--dragCounter <= 0) {
    dragCounter = 0;
    dropOverlay.classList.remove('active');
  }
});

// Prevent the default browser behaviour (open file in tab)
document.addEventListener('dragover', e => e.preventDefault());

document.addEventListener('drop', e => {
  e.preventDefault();
  dragCounter = 0;
  dropOverlay.classList.remove('active');

  const file = e.dataTransfer.files[0];

  if (!file || !file.name.toLowerCase().endsWith('.csv')) {
    showToast('Please drop a .csv file');
    return;
  }

  const reader  = new FileReader();
  reader.onload = ev => loadCSV(ev.target.result, file.name);
  reader.readAsText(file);
});
