/**
 * state.js
 * OMRON Blood Pressure Dashboard — Application State & Utility Helpers
 *
 * Centralises all mutable state variables and the pure utility functions
 * that operate on them. No DOM interaction lives here.
 */

'use strict';

/* ── Application State ──────────────────────────────────────────────────── */

/** @type {import('./csv-parser.js').BPReading[]} All loaded readings */
let RAW = [];

/** @type {string} Active time-filter period key */
let currentPeriod = '7d';

/**
 * The month currently displayed in the calendar widget.
 * Initialised to March 2026 (matching the demo CSV date range).
 *
 * @type {Date}
 */
let calViewDate = new Date(2026, 2, 1);

/** @type {Chart|null} The active Chart.js instance on the main canvas */
let mainChart = null;

/** @type {'range'|'line'} Active chart view mode */
let currentChartView = 'range';

/** @type {string} Name of the currently loaded CSV file */
let currentFileName = '';

/** @type {number} Number of rows per page in the readings table (0 = all) */
let PAGE_SIZE = 10;

/** @type {number} Current page index (1-based) in the readings table */
let currentPage = 1;

/** @type {import('./csv-parser.js').BPReading[]} Sorted readings for current view */
let currentReadings = [];

/** @type {string} Active category filter key ('all' or a CATS label) */
let catFilter = 'all';

/* ── Utility Helpers ────────────────────────────────────────────────────── */

/**
 * Returns the "current" date for the dashboard.
 *
 * When data is loaded the most-recent reading timestamp is used as "today",
 * so that time-period filters (7 days, this week, etc.) are relative to
 * the data rather than the wall-clock date.
 *
 * @returns {Date}
 */
function getToday() {
  return RAW.length
    ? new Date(Math.max(...RAW.map(r => r.ts)))
    : new Date();
}

/**
 * Computes a {start, end} Date pair for a named time period.
 *
 * @param  {'7d'|'week'|'month'|'year'|'all'|'custom'} period
 * @returns {{ start: Date, end: Date }|null}
 *   null is returned only for 'custom' when the date inputs are incomplete.
 */
function getDateRange(period) {
  const now = getToday();
  let start;
  let end = new Date(now);
  end.setHours(23, 59, 59, 999);

  switch (period) {
    case '7d':
      start = new Date(now);
      start.setDate(now.getDate() - 6);
      start.setHours(0, 0, 0, 0);
      break;

    case 'week':
      start = new Date(now);
      start.setDate(now.getDate() - now.getDay()); // Sunday
      start.setHours(0, 0, 0, 0);
      break;

    case 'month':
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      break;

    case 'year':
      start = new Date(now.getFullYear(), 0, 1);
      break;

    case 'all':
      start = new Date(0);
      end   = new Date(8640000000000000);
      break;

    case 'custom': {
      const s = document.getElementById('range-start').value;
      const e = document.getElementById('range-end').value;
      if (!s || !e) return null;
      start = new Date(s + 'T00:00:00');
      end   = new Date(e + 'T23:59:59');
      break;
    }

    default:
      return null;
  }

  return { start, end };
}

/**
 * Filters RAW readings to those that fall within the given period.
 *
 * @param  {'7d'|'week'|'month'|'year'|'all'|'custom'} period
 * @returns {import('./csv-parser.js').BPReading[]}
 */
function filterData(period) {
  const range = getDateRange(period);
  if (!range) return RAW;
  const { start, end } = range;
  return RAW.filter(d => d.ts >= start.getTime() && d.ts <= end.getTime());
}

/**
 * Computes the arithmetic mean of an array of numbers, rounded to the
 * nearest integer.
 *
 * @param  {number[]} arr
 * @returns {number|null} null when the array is empty
 */
function avg(arr) {
  return arr.length
    ? Math.round(arr.reduce((x, y) => x + y, 0) / arr.length)
    : null;
}

/**
 * Formats a timestamp as a short day/month string (e.g. "17/3").
 *
 * @param  {number} ts - Unix timestamp (ms)
 * @returns {string}
 */
function fd(ts) {
  const d = new Date(ts);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

/**
 * Formats a timestamp as a date + time string (e.g. "17 Mar 14:30").
 *
 * @param  {number} ts - Unix timestamp (ms)
 * @returns {string}
 */
function fdt(ts) {
  const d = new Date(ts);
  return (
    d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) +
    ' ' +
    d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })
  );
}

/**
 * Formats a timestamp as a time string only (e.g. "14:30").
 *
 * @param  {number} ts - Unix timestamp (ms)
 * @returns {string}
 */
function fmtTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Groups an array of readings by calendar day.
 *
 * @param  {import('./csv-parser.js').BPReading[]} data
 * @returns {Array<{ k:string, ts:number, readings: import('./csv-parser.js').BPReading[] }>}
 *   Sorted ascending by day timestamp.
 */
function groupByDay(data) {
  const map = {};

  data.forEach(r => {
    const d = new Date(r.ts);
    const key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

    if (!map[key]) {
      map[key] = {
        k        : key,
        ts       : new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(),
        readings : []
      };
    }

    map[key].readings.push(r);
  });

  return Object.values(map).sort((a, b) => a.ts - b.ts);
}
