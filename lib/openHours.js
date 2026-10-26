// Open-hours sign-up campaign config. Next week = edit WEEK_LABEL + OPEN_HOURS only.
// Times are parish local (America/New_York); hour = start hour, 24h. Each slot is 1 hour.
export const CAMPAIGN = 'week-2026-10-26';
export const WEEK_LABEL = { en: 'Oct 26 – 31', es: '26 – 31 de octubre' };
export const OPEN_HOURS = {
  '2026-10-26': [19],
  '2026-10-27': [11, 14, 15, 16],
  '2026-10-28': [16, 17],
  '2026-10-29': [9, 11, 13, 14, 16],
  '2026-10-30': [11, 12, 16],
  '2026-10-31': [8, 10, 11, 12, 16, 19],
};
export function slotKey(date, hour) { return `${date}T${String(hour).padStart(2, '0')}`; }
export function allSlots() {
  const out = [];
  for (const [date, hours] of Object.entries(OPEN_HOURS)) for (const hour of hours) out.push({ date, hour, key: slotKey(date, hour) });
  return out;
}
export function isOpenSlot(date, hour) { return (OPEN_HOURS[date] || []).includes(hour); }
