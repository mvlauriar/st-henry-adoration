// All date math is done in the parish timezone so that midnight rollover
// matches the church's local day, not UTC.

export const PARISH_TZ = process.env.PARISH_TIMEZONE || 'America/New_York';
export const HOURS = Array.from({ length: 12 }, (_, i) => i + 8); // 8..19 (8am..7pm slot starts)
export const SLOTS_PER_HOUR = 4;

// Returns YYYY-MM-DD for "today" in the parish timezone.
export function todayInParish() {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: PARISH_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(now); // en-CA gives YYYY-MM-DD
}

// Returns array of YYYY-MM-DD strings for the next `count` days starting today.
export function upcomingDates(count = 7) {
  const start = todayInParish();
  const [y, m, d] = start.split('-').map(Number);
  const dates = [];
  for (let i = 0; i < count; i++) {
    // Build a date at noon UTC to avoid DST edge cases when adding days
    const dt = new Date(Date.UTC(y, m - 1, d + i, 12));
    const yy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(dt.getUTCDate()).padStart(2, '0');
    dates.push(`${yy}-${mm}-${dd}`);
  }
  return dates;
}

// "Mon, Apr 28"
export function formatDateLabel(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC', // we built it in UTC, so display in UTC
  }).format(dt);
}

// "8:00 AM"
export function formatHourLabel(hour) {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  const ampm = hour < 12 ? 'AM' : 'PM';
  return `${h12}:00 ${ampm}`;
}

// "8 - 9 AM"
export function formatHourRange(hour) {
  const start = formatHourLabel(hour);
  const end = formatHourLabel(hour + 1);
  // Collapse "8:00 AM - 9:00 AM" → "8 – 9 AM" if same period
  const startAmPm = start.endsWith('AM') ? 'AM' : 'PM';
  const endAmPm = end.endsWith('AM') ? 'AM' : 'PM';
  const sNum = start.replace(':00 AM', '').replace(':00 PM', '');
  const eNum = end.replace(':00 AM', '').replace(':00 PM', '');
  if (startAmPm === endAmPm) return `${sNum} – ${eNum} ${endAmPm}`;
  return `${sNum} ${startAmPm} – ${eNum} ${endAmPm}`;
}

// Has the given slot already started (in parish time)?
export function slotIsPast(ymd, hour) {
  const nowInTz = new Date().toLocaleString('en-US', { timeZone: PARISH_TZ });
  const now = new Date(nowInTz);
  const [y, m, d] = ymd.split('-').map(Number);
  const slotStart = new Date(y, m - 1, d, hour, 0, 0);
  return slotStart.getTime() <= now.getTime();
}
