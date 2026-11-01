// Open-hours sign-up campaign config. Next week = edit WEEK_LABEL + OPEN_HOURS only.
// Times are parish local (America/New_York); hour = start hour, 24h. Each slot is 1 hour.
export const CAMPAIGN = 'week-2026-11-01';
export const WEEK_LABEL = { en: 'Nov 1 – 7', es: '1 – 7 de noviembre' };
export const OPEN_HOURS = {
  '2026-11-01': [9, 13],
  '2026-11-02': [10],
  '2026-11-03': [11, 13, 15, 16, 19],
  '2026-11-04': [12, 13, 16, 17],
  '2026-11-05': [8, 11, 12, 16],
  '2026-11-06': [8, 12, 17],
  '2026-11-07': [10, 11, 13, 14, 16],
};
export function slotKey(date, hour) { return `${date}T${String(hour).padStart(2, '0')}`; }
export function allSlots() {
  const out = [];
  for (const [date, hours] of Object.entries(OPEN_HOURS)) for (const hour of hours) out.push({ date, hour, key: slotKey(date, hour) });
  return out;
}
export function isOpenSlot(date, hour) { return (OPEN_HOURS[date] || []).includes(hour); }
