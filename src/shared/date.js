// Dates are handled as local "YYYY-MM-DD" strings everywhere.

export function parseDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
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
  // whole days from a to b
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
  return str.slice(0, 8) + '01';
}

export function daysInMonth(str) {
  const d = parseDate(str);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

export function dateRange(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
