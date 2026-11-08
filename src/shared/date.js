// Dates are handled as local "YYYY-MM-DD" strings everywhere.
// The app's valid range is 2000-01-01..2100-12-31, but every helper stays finite for any input:
// unparsable strings give an Invalid Date (formatted as '') and loops are bounded.

// Local midnight of y-m-d. Years 0–99 stay as written (new Date(y, …) would map them to 1900+).
function makeDate(y, m, d) {
  const date = new Date(2000, 0, 1);
  date.setFullYear(y, m, d);
  return date;
}

export function parseDate(str) {
  const [y, m, d] = String(str ?? '').split('-').map(Number);
  return makeDate(y, m - 1, d);
}

export function formatDate(date) {
  const y = date.getFullYear();
  if (!Number.isFinite(y)) return '';
  const year = y < 0 ? `-${String(-y).padStart(4, '0')}` : String(y).padStart(4, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

export function todayStr(now = new Date()) {
  return formatDate(now);
}

export function addDays(str, n) {
  const d = parseDate(str);
  d.setDate(d.getDate() + n);
  return formatDate(d);
}

export function diffDays(a, b) {
  // whole days from a to b (NaN when either date is invalid)
  return Math.round((parseDate(b) - parseDate(a)) / 86400000);
}

export function weekday(str) {
  return parseDate(str).getDay(); // 0 = Sunday
}

// Monday of the week containing `str`
export function startOfWeek(str) {
  const wd = weekday(str);
  return addDays(str, wd === 0 ? -6 : 1 - wd);
}

export function startOfMonth(str) {
  return String(str ?? '').slice(0, 8) + '01';
}

export function daysInMonth(str) {
  const d = parseDate(str);
  return makeDate(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

// Longest range dateRange builds (about 400 years); anything longer is clipped.
const MAX_RANGE_DAYS = 146100;

// Every date from `from` to `to` inclusive ([] when either is invalid or `to` is before `from`).
export function dateRange(from, to) {
  const n = diffDays(from, to);
  if (!Number.isFinite(n) || n < 0) return [];
  const out = [];
  const d = parseDate(from);
  for (let i = 0; i <= Math.min(n, MAX_RANGE_DAYS); i++) {
    out.push(formatDate(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

export const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

// "26.11.01 (일)"
export function formatLogDate(str) {
  return `${str.slice(2, 4)}.${str.slice(5, 7)}.${str.slice(8, 10)} (${WEEKDAY_LABELS[weekday(str)] ?? ''})`;
}
