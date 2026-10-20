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
    const e = expiryOf(inAt);
    const closeOk = inDate < today.date || (inDate === today.date && afterClose);
    if (e.at > now && !closeOk) continue;
    // 8 PM / earlier-day rule: closing time of that day (or check-in if later); shift expiry if sooner.
    let at = parishInstant(inDate); if (inAt > at) at = inAt;
    let reason = 'closing';
    if (e.at <= at || !closeOk) { at = e.at; reason = e.reason; }
    if (at > now) at = now;
    out.push({ id: r.id, at: at.toISOString(), stale: inDate < today.date, reason });
  }
  return out;
}

// ---------- 1-hour shift expiry ----------
export const SHIFT_MINUTES = Number(process.env.SHIFT_MINUTES || 60);

// When an open check-in ends on its own: min(checked_in_at + SHIFT_MINUTES, 8 PM ET of that day).
// (If the check-in itself was after 8 PM, only the shift length applies.)
export function expiryOf(checkedInAt, shiftMinutes = SHIFT_MINUTES) {
  const inAt = new Date(checkedInAt);
  const shiftEnd = new Date(inAt.getTime() + shiftMinutes * 60000);
  const close = parishInstant(parts(inAt).date);
  if (close > inAt && close < shiftEnd) return { at: close, reason: 'closing' };
  return { at: shiftEnd, reason: 'shift' };
}

// Returns the row as it should be seen at `now`: an expired open row gets a virtual
// checked_out_at and auto_expired=true. Stored rows are not modified.
export function effectiveRow(r, now = new Date()) {
  if (!r || !r.checked_in_at || r.checked_out_at) return r;
  const e = expiryOf(r.checked_in_at);
  return e.at <= now ? { ...r, checked_out_at: e.at.toISOString(), auto_expired: true, auto_reason: e.reason } : r;
}
export const isActive = (r, now = new Date()) => !!r.checked_in_at && !effectiveRow(r, now).checked_out_at;
