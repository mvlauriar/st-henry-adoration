// All date math is done in the parish timezone so that midnight rollover
// matches the church's local day, not UTC.

export const PARISH_TZ = process.env.PARISH_TIMEZONE || 'America/New_York';
export const HOURS = Array.from({ length: 12 }, (_, i) => i + 8); // 8..19
export const SLOTS_PER_HOUR = 4;
export const WALK_IN_UNLOCK_MINUTES = 5; // substitute prompt unlocks after this many minutes

// Returns YYYY-MM-DD for "today" in the parish timezone.
export function todayInParish() {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: PARISH_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(now);
}

// Returns { date, hour, minute } for the parish's current local time.
export function nowInParish() {
  const now = new Date();
  const fmtDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: PARISH_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const fmtHour = new Intl.DateTimeFormat('en-US', { timeZone: PARISH_TZ, hour: 'numeric', hour12: false });
  const fmtMin  = new Intl.DateTimeFormat('en-US', { timeZone: PARISH_TZ, minute: '2-digit' });
  return {
    date: fmtDate.format(now),
    hour: parseInt(fmtHour.format(now), 10),
    minute: parseInt(fmtMin.format(now), 10),
  };
}

// Returns the current adoration hour (8..19) if we're inside operating hours, else null.
export function currentAdorationHour() {
  const { date, hour, minute } = nowInParish();
  if (hour < 8 || hour >= 20) return { date, current: null, next: null, minute };
  const current = hour;
  const next = hour < 19 ? hour + 1 : null;
  return { date, current, next, minute };
}

// Has the given slot already ENDED (the next hour has started)?
// This is what the signup page uses — an hour stays available until it fully ends.
export function slotHasEnded(ymd, hour) {
  const { date, hour: nowHour } = nowInParish();
  if (ymd < date) return true;
  if (ymd > date) return false;
  return hour < nowHour;
}

// Returns array of YYYY-MM-DD strings for the next `count` days starting today.
export function upcomingDates(count = 7) {
  const start = todayInParish();
  const [y, m, d] = start.split('-').map(Number);
  const dates = [];
  for (let i = 0; i < count; i++) {
    const dt = new Date(Date.UTC(y, m - 1, d + i, 12));
    const yy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(dt.getUTCDate()).padStart(2, '0');
    dates.push(`${yy}-${mm}-${dd}`);
  }
  return dates;
}

// Returns { date, hours: [hours that haven't fully ended yet] } for next 7 days.
// An in-progress hour (started but not ended) stays available.
export function upcomingSlots(count = 7) {
  const dates = upcomingDates(count);
  const result = [];
  for (const date of dates) {
    const remaining = HOURS.filter((h) => !slotHasEnded(date, h));
    if (remaining.length > 0) {
      result.push({ date, hours: remaining });
    }
  }
  return result;
}

// "Mon, Apr 28"
export function formatDateLabel(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
  }).format(dt);
}

// "Domingo, 28 de Abril"
export function formatDateLabelEs(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  return new Intl.DateTimeFormat('es-ES', {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
  }).format(dt);
}

// Full date label for big iPad display: "Sunday, May 17"
export function formatDateLabelFull(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC',
  }).format(dt);
}

// "8:00 AM"
export function formatHourLabel(hour) {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  const ampm = hour < 12 ? 'AM' : 'PM';
  return `${h12}:00 ${ampm}`;
}

// "8 – 9 AM"
export function formatHourRange(hour) {
  const start = formatHourLabel(hour);
  const end = formatHourLabel(hour + 1);
  const startAmPm = start.endsWith('AM') ? 'AM' : 'PM';
  const endAmPm = end.endsWith('AM') ? 'AM' : 'PM';
  const sNum = start.replace(':00 AM', '').replace(':00 PM', '');
  const eNum = end.replace(':00 AM', '').replace(':00 PM', '');
  if (startAmPm === endAmPm) return `${sNum} – ${eNum} ${endAmPm}`;
  return `${sNum} ${startAmPm} – ${eNum} ${endAmPm}`;
}

// "3:02 PM" — for check-in timestamps (admin-only)
export function formatTimestamp(iso) {
  const d = new Date(iso);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: PARISH_TZ, hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(d);
}

// Compute how late someone was relative to their scheduled slot start.
export function computeLateness(checkInIso, slotDate, slotHour) {
  if (!checkInIso) return null;
  const checkIn = new Date(checkInIso);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: PARISH_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(checkIn);
  const map = {};
  for (const p of parts) if (p.type !== 'literal') map[p.type] = p.value;
  const checkInDate = `${map.year}-${map.month}-${map.day}`;
  let checkInHour = parseInt(map.hour, 10);
  if (checkInHour === 24) checkInHour = 0;
  const checkInMin = parseInt(map.minute, 10);

  const [sy, sm, sd] = slotDate.split('-').map(Number);
  const [cy, cm, cd] = checkInDate.split('-').map(Number);
  const slotMs = Date.UTC(sy, sm - 1, sd);
  const checkInMs = Date.UTC(cy, cm - 1, cd);
  const dayDiffMinutes = Math.round((checkInMs - slotMs) / 60000);
  const minutesLate = dayDiffMinutes + (checkInHour - slotHour) * 60 + checkInMin;

  let category;
  if (minutesLate < 0) category = 'early';
  else if (minutesLate <= 5) category = 'onTime';
  else if (minutesLate <= 15) category = 'late';
  else category = 'veryLate';

  let label;
  if (minutesLate < 0) label = `${Math.abs(minutesLate)}m early`;
  else if (minutesLate === 0) label = 'on time';
  else label = `${minutesLate}m late`;

  return { minutesLate, category, label };
}

// Privacy helper: turn "Maria Lopez" into "Maria L." for the public iPad
export function abbreviateName(fullName) {
  if (!fullName) return '';
  const trimmed = fullName.trim();
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0];
  const first = parts[0];
  const lastInitial = parts[parts.length - 1].charAt(0).toUpperCase();
  return `${first} ${lastInitial}.`;
}

// Build a slot key for query-param-driven autoOpen on signup page
export function makeSlotKey(date, hour) {
  return `${date}-${String(hour).padStart(2, '0')}`;
}
export function parseSlotKey(key) {
  if (!key || typeof key !== 'string') return null;
  const m = key.match(/^(\d{4}-\d{2}-\d{2})-(\d{2})$/);
  if (!m) return null;
  return { date: m[1], hour: parseInt(m[2], 10) };
}
