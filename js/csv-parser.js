/**
 * csv-parser.js
 * OMRON Blood Pressure Dashboard — CSV Parsing Module
 *
 * Parses the CSV export produced by the OMRON Connect app.
 * The expected column headers (case-insensitive) are:
 *
 *   "Measurement Date"  — ISO-style date-time string
 *   "SYS(mmHg)"         — Systolic blood pressure
 *   "DIA(mmHg)"         — Diastolic blood pressure
 *   "Pulse(bpm)"        — Heart rate
 *   "Irregular heartbeat detected" — "Detected" | ""
 *
 * Returns an array of reading objects, or null on a fatal parse error.
 */

'use strict';

/**
 * @typedef {Object} BPReading
 * @property {string}  d     - Raw date string from the CSV
 * @property {number}  sys   - Systolic pressure (mmHg)
 * @property {number}  dia   - Diastolic pressure (mmHg)
 * @property {number}  pulse - Heart rate (bpm); 0 if missing
 * @property {boolean} ihb   - True when irregular heartbeat was detected
 * @property {number}  ts    - Unix timestamp (ms) parsed from `d`
 */

/**
 * The header row text used as the "empty / demo" default state.
 * Loaded into the app so the UI renders correctly before a real
 * CSV is supplied.
 *
 * @type {string}
 */
const DEFAULT_CSV = [
  '"Measurement Date","Timezone","SYS(mmHg)","DIA(mmHg)","Pulse(bpm)",',
  '"Irregular heartbeat detected","IHB detection counts(times)",',
  '"Body Movement","Cuff wrap guide","Positioning Indicator",',
  '"room temperature(°C)","Measurement Mode","Device"'
].join('');

/**
 * Splits a single CSV line into fields, correctly handling
 * double-quoted fields that may contain commas.
 *
 * @param  {string} line - A single CSV row
 * @returns {string[]}   - Array of raw (unquoted) field strings
 */
function splitCSVLine(line) {
  const fields = [];
  let inQuote = false;
  let current = '';

  for (const ch of line) {
    if (ch === '"') {
      inQuote = !inQuote;
    } else if (ch === ',' && !inQuote) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }

  fields.push(current.trim());
  return fields;
}

/**
 * Parses a multi-line CSV string into an array of BPReading objects.
 *
 * Rows with missing or non-numeric SYS/DIA values are silently skipped.
 * Rows where the date cannot be parsed into a valid timestamp are skipped.
 *
 * @param  {string} text - Full text content of the CSV file
 * @returns {BPReading[]|null} - Parsed readings, or null if the header
 *                               cannot be located (unrecognised format).
 */
function parseCSV(text) {
  // Split into non-empty lines and strip any BOM on the first line
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];

  // Parse and normalise header names
  const headers = lines[0]
    .replace(/^\uFEFF/, '')   // strip UTF-8 BOM
    .split(',')
    .map(h => h.replace(/"/g, '').trim());

  // Locate required column indices by keyword (flexible header matching)
  const iDate    = headers.findIndex(h => h.toLowerCase().includes('measurement date'));
  const iSys     = headers.findIndex(h => h.toLowerCase().includes('sys'));
  const iDia     = headers.findIndex(h => h.toLowerCase().includes('dia'));
  const iPulse   = headers.findIndex(h => h.toLowerCase().includes('pulse'));
  const iIHB     = headers.findIndex(h => h.toLowerCase().includes('irregular'));

  // Date, SYS and DIA are mandatory; bail if any are absent
  if (iDate < 0 || iSys < 0 || iDia < 0) {
    alert('CSV format not recognised. Please use an OMRON Connect export.');
    return null;
  }

  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = splitCSVLine(line);

    // Strip quotes from each field and parse values
    const dateStr = cols[iDate]  ?.replace(/"/g, '').trim() ?? '';
    const sys     = parseInt(cols[iSys]   ?.replace(/"/g, ''));
    const dia     = parseInt(cols[iDia]   ?.replace(/"/g, ''));
    const pulse   = parseInt(cols[iPulse] ?.replace(/"/g, ''));
    const ihbRaw  = iIHB >= 0 ? (cols[iIHB]?.replace(/"/g, '').trim().toLowerCase() ?? '') : '';
    const ihb     = ihbRaw === 'detected';

    // Skip rows with missing mandatory values
    if (!dateStr || isNaN(sys) || isNaN(dia)) continue;

    // Normalise the date string: replace slashes and the space before time
    const normalised = dateStr.replace(/\//g, '-').replace(' ', 'T');
    const ts = new Date(normalised).getTime();
    if (isNaN(ts)) continue;

    rows.push({
      d     : dateStr,
      sys,
      dia,
      pulse : isNaN(pulse) ? 0 : pulse,
      ihb,
      ts
    });
  }

  return rows;
}
