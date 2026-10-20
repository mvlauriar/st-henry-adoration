// Closing-time helpers for automatic check-out (pure, no I/O; unit-tested).
export const PARISH_TZ = process.env.PARISH_TIMEZONE || 'America/New_York';
export const CLOSING_HOUR = Number(process.env.CLOSING_HOUR || 20); // 8 PM parish time

function parts(d, tz = PARISH_TZ) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), minute: Number(p.minute) };
}
export const parishParts = parts;

// UTC instant of HH:00 parish time on a YYYY-MM-DD parish date (DST-aware).
export function parishInstant(date, hour = CLOSING_HOUR, tz = PARISH_TZ) {
  const [y, m, d] = date.split('-').map(Number);
  let guess = Date.UTC(y, m - 1, d, hour);
  for (let i = 0; i < 2; i++) {
    const p = parts(new Date(guess), tz);
    const [py, pm, pd] = p.date.split('-').map(Number);
    const diff = Date.UTC(py, pm - 1, pd, p.hour, p.minute) - Date.UTC(y, m - 1, d, hour);
    guess -= diff;
  }
  return new Date(guess);
}

// Decide which open rows to close at `now`. A row is closed when its parish check-in
// date is before today, or it is today and now is at/after closing time.
// checked_out_at = closing time of the check-in day (or check-in time if later), never after now.
export function planAutoCheckout(rows, now = new Date()) {
  const today = parts(now);
  const afterClose = today.hour >= CLOSING_HOUR;
  const out = [];
  for (const r of rows) {
    if (!r.checked_in_at || r.checked_out_at) continue;
    const inAt = new Date(r.checked_in_at);
    const inDate = parts(inAt).date;
    if (inDate > today.date || (inDate === today.date && !afterClose)) continue;
    let at = parishInstant(inDate);
    if (inAt > at) at = inAt;
    if (at > now) at = now;
    out.push({ id: r.id, at: at.toISOString(), stale: inDate < today.date });
  }
  return out;
}
