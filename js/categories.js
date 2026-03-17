/**
 * categories.js
 * OMRON Blood Pressure Dashboard — BP Category Definitions
 *
 * Defines the American Heart Association blood-pressure classification
 * thresholds and provides a helper function to classify a reading.
 *
 * Each category object has the shape:
 *   {
 *     label : string   — Human-readable name
 *     sys   : [min, max]  — Systolic range  (inclusive lower, exclusive upper)
 *     dia   : [min, max]  — Diastolic range (inclusive lower, exclusive upper)
 *     color : string   — Primary hex colour for the category
 *     bg    : string   — Translucent background fill (rgba)
 *     text  : string   — Text colour (accessible on --ios-surface)
 *   }
 *
 * Source: American Heart Association
 * https://www.heart.org/en/health-topics/high-blood-pressure/understanding-blood-pressure-readings
 */

'use strict';

/**
 * Ordered from most severe to least — checked top-down in getCategory().
 * The sentinel value 999 indicates "no upper bound".
 *
 * @type {Array<{label:string, sys:number[], dia:number[], color:string, bg:string, text:string}>}
 */
const CATS = [
  {
    label : 'Normal',
    sys   : [0,   120],
    dia   : [0,    80],
    color : '#34c759',
    bg    : 'rgba(52,  199, 89,  0.13)',
    text  : '#1a7a30'
  },
  {
    label : 'Elevated',
    sys   : [120, 130],
    dia   : [0,    80],
    color : '#ff9500',
    bg    : 'rgba(255, 149,  0,  0.13)',
    text  : '#8a5200'
  },
  {
    label : 'High Stage 1',
    sys   : [130, 140],
    dia   : [80,   90],
    color : '#ff6b35',
    bg    : 'rgba(255, 107, 53, 0.13)',
    text  : '#b03000'
  },
  {
    label : 'High Stage 2',
    sys   : [140, 180],
    dia   : [90,  120],
    color : '#ff3b30',
    bg    : 'rgba(255,  59, 48, 0.13)',
    text  : '#c0001a'
  },
  {
    label : 'Crisis',
    sys   : [180, 999],
    dia   : [120, 999],
    color : '#8b0000',
    bg    : 'rgba(139,   0,  0, 0.15)',
    text  : '#5c0000'
  }
];

/**
 * Classifies a blood-pressure reading into one of the AHA categories.
 *
 * The most-severe applicable threshold wins (Crisis checked first).
 *
 * @param  {number} sys - Systolic value in mmHg
 * @param  {number} dia - Diastolic value in mmHg
 * @returns {{ label:string, color:string, bg:string, text:string, sys:number[], dia:number[] }}
 */
function getCategory(sys, dia) {
  if (sys >= 180 || dia >= 120) return CATS[4]; // Crisis
  if (sys >= 140 || dia >= 90)  return CATS[3]; // High Stage 2
  if (sys >= 130 && dia < 90)   return CATS[2]; // High Stage 1
  if (sys >= 120 && dia < 80)   return CATS[1]; // Elevated
  return CATS[0];                               // Normal
}
