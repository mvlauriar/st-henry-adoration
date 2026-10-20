// Data layer for the chapel kiosk + attendance admin.
// One interface, two implementations:
//   - Supabase (production / preview): reuses the existing `signups` table for
//     attendance (checked_in_at / checked_out_at / walk_in) and the new
//     `volunteer_inquiries` + `attendance_audit` tables.
//   - In-memory mock (local tests only, KIOSK_MOCK=1, refused on Vercel).
// Nothing returned by the kiosk-facing functions ever contains a phone or email.

import crypto from 'crypto';
import { supabaseAdmin } from './supabase';
import { planAutoCheckout, effectiveRow, isActive, expiryOf } from './closing';
import {
  nowInParish, abbreviateName, formatTimestamp, formatDateLabel, formatHourLabel, HOURS,
} from './dates';

export const IS_MOCK = process.env.KIOSK_MOCK === '1' && !process.env.VERCEL;
export const LONG_CHECKIN_HOURS = Number(process.env.LONG_CHECKIN_HOURS || 4);

const digits = (p) => String(p || '').replace(/\D/g, '');
const normName = (n) => String(n || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
const personKey = (phone) => crypto.createHash('sha256').update('sh:' + digits(phone)).digest('hex').slice(0, 16);

// Attendance rows must fit the existing slot_hour 8..19 constraint.
function attendanceSlot() {
  const { date, hour } = nowInParish();
  const h = Math.min(Math.max(hour, HOURS[0]), HOURS[HOURS.length - 1]);
  return { date, hour: h };
}

// ---------- shared pure helpers ----------
const titleName = (n) => String(n || '').trim().replace(/\s+/g, ' ');
function buildDirectory(rows) {
  const { date, hour } = nowInParish();
  const byKey = new Map();
  for (const r of rows) {
    if (!digits(r.phone)) continue;
    const key = personKey(r.phone);
    const e = byKey.get(key) || { key, name: r.name, latest: null, scheduledNow: false };
    if (!e.latest || r.slot_date > e.latest.slot_date) { e.latest = r; e.name = r.name; }
    if (r.slot_date === date && (r.slot_hour === hour || r.slot_hour === hour + 1)) e.scheduledNow = true;
    byKey.set(key, e);
  }
  const list = [...byKey.values()].map((e) => ({
    key: e.key,
    displayName: abbreviateName(e.name),
    fullName: e.name,
    search: normName(e.name),
    scheduledNow: e.scheduledNow,
    hintDate: e.latest?.slot_date, hintHour: e.latest?.slot_hour,
  }));
  // Disambiguate: if two people abbreviate the same, show full names; if still identical,
  // add their usual day/hour (never phone).
  const abbr = {};
  for (const e of list) abbr[e.displayName] = (abbr[e.displayName] || 0) + 1;
  for (const e of list) if (abbr[e.displayName] > 1) e.displayName = titleName(e.fullName);
  const counts = {};
  for (const e of list) counts[e.displayName] = (counts[e.displayName] || 0) + 1;
  for (const e of list) {
    if (counts[e.displayName] > 1 && e.hintDate) {
      const wd = new Date(e.hintDate + 'T12:00:00Z').getUTCDay();
      e.hint = { weekday: wd, hourLabel: formatHourLabel(e.hintHour) };
    }
    delete e.hintDate; delete e.hintHour; delete e.fullName;
  }
  list.sort((a, b) => (b.scheduledNow - a.scheduledNow) || a.displayName.localeCompare(b.displayName));
  return list;
}

function publicActive(r) {
  return { id: r.id, displayName: abbreviateName(r.name), since: formatTimestamp(r.checked_in_at) };
}

// ---------- in-memory mock ----------
function mockState() {
  if (!globalThis.__kioskMock) resetMock();
  return globalThis.__kioskMock;
}
export function resetMock() {
  const { date, hour } = attendanceSlot();
  const id = () => crypto.randomUUID();
  const mk = (name, phone, slot_date, slot_hour, extra = {}) => ({
    id: id(), name, phone, email: null, slot_date, slot_hour, walk_in: false,
    checked_in_at: null, checked_out_at: null, recurring: false, created_at: new Date().toISOString(), ...extra,
  });
  globalThis.__kioskMock = {
    signups: [
      mk('Maria Lopez', '9545550101', date, hour),
      mk('Maria Lima', '9545550102', '2026-10-13', 9),
      mk('Maria Lopez', '9545550103', '2026-10-14', 15),
      mk('José Hernández', '9545550104', date, Math.min(hour + 1, 19)),
      mk('Robert Miller', '9545550105', '2026-10-12', 10),
      mk('Ana Gómez', '9545550106', '2026-10-15', 11),
      mk('Thomas Quinn', '9545550107', '2026-10-16', 18),
    ],
    inquiries: [],
    audit: [],
  };
}

// ---------- public API ----------
export async function getDirectory() {
  if (IS_MOCK) return buildDirectory(mockState().signups);
  const { data, error } = await supabaseAdmin()
    .from('signups').select('name, phone, slot_date, slot_hour')
    .not('phone', 'is', null).order('slot_date', { ascending: false }).limit(5000);
  if (error) throw new Error(error.message);
  return buildDirectory(data || []);
}

// Open rows (checked_out_at null), including ones already expired by the 1-hour rule.
async function openRows() {
  if (IS_MOCK) return mockState().signups.filter((s) => s.checked_in_at && !s.checked_out_at);
  const { data, error } = await supabaseAdmin()
    .from('signups').select('id, name, phone, slot_date, slot_hour, walk_in, checked_in_at, checked_out_at')
    .not('checked_in_at', 'is', null).is('checked_out_at', null).order('checked_in_at', { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}
// Truly active: open and not expired (1-hour shift / 8 PM cap).
async function activeRows(now = new Date()) {
  return (await openRows()).filter((r) => isActive(r, now));
}

export async function getActivePublic() {
  const list = (await activeRows()).map((r) => ({ ...publicActive(r), _full: titleName(r.name) }));
  const c = {}; for (const a of list) c[a.displayName] = (c[a.displayName] || 0) + 1;
  return list.map(({ _full, ...a }) => (c[a.displayName] > 1 ? { ...a, displayName: _full } : a));
}

async function audit(entry) {
  const row = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...entry };
  if (IS_MOCK) { mockState().audit.unshift(row); return; }
  const { error } = await supabaseAdmin().from('attendance_audit').insert({
    signup_id: entry.signup_id || null, action: entry.action, source: entry.source,
    old_value: entry.old_value || null, new_value: entry.new_value || null, note: entry.note || null,
  });
  if (error) console.error('audit insert failed:', error.message); // never block a check-in on audit
}

// target: { key } | { manualName } | { inquiryId }
export async function checkIn(target) {
  const now = new Date().toISOString();
  const { date, hour } = nowInParish();
  const slot = attendanceSlot();
  let name, phone = null;

  if (target.key) {
    const dir = IS_MOCK ? mockState().signups : (await supabaseAdmin().from('signups')
      .select('name, phone, slot_date').not('phone', 'is', null).order('slot_date', { ascending: false }).limit(5000)).data || [];
    const hit = dir.find((r) => digits(r.phone) && personKey(r.phone) === target.key);
    if (!hit) return { error: 'not_found' };
    name = hit.name; phone = hit.phone;
  } else if (target.inquiryId) {
    const inq = IS_MOCK ? mockState().inquiries.find((i) => i.id === target.inquiryId)
      : (await supabaseAdmin().from('volunteer_inquiries').select('full_name, phone').eq('id', target.inquiryId).maybeSingle()).data;
    if (!inq) return { error: 'not_found' };
    name = inq.full_name; phone = inq.phone;
  } else {
    name = String(target.manualName || '').trim().replace(/\s+/g, ' ').slice(0, 80);
    if (name.length < 2) return { error: 'name_required' };
  }

  await autoCheckout(); // persist any expired check-ins (so a re-check-in after expiry starts fresh)
  // Duplicate guard: same verified person (by phone) or same manual name already active.
  const active = await activeRows();
  const dup = active.find((r) => (phone ? digits(r.phone) === digits(phone) : (!r.phone && normName(r.name) === normName(name))));
  // Re-check-in (someone staying longer): close the previous open check-in and start a fresh one.
  let renewed = false;
  if (dup) {
    await checkOut(dup.id, { source: 'kiosk', at: now, note: 'renewed by re-check-in' });
    renewed = true;
  }

  // Prefer an existing scheduled row for this hour/next hour; otherwise create a walk-in row.
  let scheduled = null;
  if (phone) {
    const cands = IS_MOCK ? mockState().signups : (await supabaseAdmin().from('signups')
      .select('id, phone, slot_date, slot_hour, checked_in_at').eq('slot_date', date).in('slot_hour', [hour, hour + 1])
      .is('checked_in_at', null)).data || [];
    scheduled = cands.find((r) => r.slot_date === date && (r.slot_hour === hour || r.slot_hour === hour + 1)
      && !r.checked_in_at && digits(r.phone) === digits(phone));
  }

  let id;
  if (scheduled) {
    id = scheduled.id;
    if (IS_MOCK) Object.assign(scheduled, { checked_in_at: now, checked_out_at: null });
    else {
      const { error } = await supabaseAdmin().from('signups').update({ checked_in_at: now, checked_out_at: null }).eq('id', id).is('checked_in_at', null);
      if (error) throw new Error(error.message);
    }
  } else {
    const row = { slot_date: slot.date, slot_hour: slot.hour, name, phone, email: null, recurring: false, walk_in: true, checked_in_at: now };
    if (IS_MOCK) { id = crypto.randomUUID(); mockState().signups.push({ id, checked_out_at: null, ...row }); }
    else {
      const { data, error } = await supabaseAdmin().from('signups').insert(row).select('id').single();
      if (error) {
        // unique active-check-in index (migration) can reject a racing duplicate
        if (/duplicate|unique/i.test(error.message)) return { ok: true, already: true, displayName: abbreviateName(name) };
        throw new Error(error.message);
      }
      id = data.id;
    }
  }
  await audit({ signup_id: id, action: 'checkin', source: 'kiosk', new_value: now, note: (scheduled ? 'scheduled' : 'walk-in') + (renewed ? ' (re-check-in)' : '') });
  return { ok: true, id, displayName: abbreviateName(name), walkIn: !scheduled, renewed };
}

export async function checkOut(id, { source = 'kiosk', at, note } = {}) {
  let when = at || new Date().toISOString();
  let row;
  if (IS_MOCK) row = mockState().signups.find((s) => s.id === id);
  else row = (await supabaseAdmin().from('signups').select('checked_in_at, checked_out_at').eq('id', id).maybeSingle()).data;
  if (!at && row && row.checked_in_at && !row.checked_out_at) {
    const e = expiryOf(row.checked_in_at);
    if (e.at < new Date(when)) { when = e.at.toISOString(); note = note || (e.reason === 'closing' ? 'automatic check-out at closing' : 'automatic check-out after 1 hour'); source = 'auto'; }
  }
  if (IS_MOCK) {
    const r = row;
    if (!r || !r.checked_in_at) return { error: 'not_found' };
    if (r.checked_out_at) return { ok: true, already: true };
    r.checked_out_at = when;
  } else {
    const { data, error } = await supabaseAdmin().from('signups').update({ checked_out_at: when })
      .eq('id', id).not('checked_in_at', 'is', null).is('checked_out_at', null).select('id');
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) return { ok: true, already: true };
  }
  await audit({ signup_id: id, action: 'checkout', source, new_value: when, note });
  return { ok: true };
}

export async function createInquiry({ fullName, phone, consent }) {
  const full_name = String(fullName || '').trim().replace(/\s+/g, ' ').slice(0, 100);
  const ph = String(phone || '').trim().slice(0, 30);
  if (full_name.length < 2) return { error: 'name_required' };
  if (digits(ph).length < 10) return { error: 'phone_invalid' };
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  if (IS_MOCK) {
    const s = mockState();
    const dup = s.inquiries.find((i) => digits(i.phone) === digits(ph) && i.created_at > since);
    if (dup) return { ok: true, id: dup.id, duplicate: true };
    const row = { id: crypto.randomUUID(), full_name, phone: ph, consent: !!consent, status: 'new', created_at: new Date().toISOString(), source: 'kiosk' };
    s.inquiries.unshift(row);
    return { ok: true, id: row.id };
  }
  const sb = supabaseAdmin();
  const { data: recent } = await sb.from('volunteer_inquiries').select('id, phone').gte('created_at', since);
  const dup = (recent || []).find((i) => digits(i.phone) === digits(ph));
  if (dup) return { ok: true, id: dup.id, duplicate: true };
  const { data, error } = await sb.from('volunteer_inquiries')
    .insert({ full_name, phone: ph, consent: !!consent, status: 'new', source: 'kiosk' }).select('id').single();
  if (error) throw new Error(error.message);
  return { ok: true, id: data.id };
}

// ---------- admin-only ----------
export async function adminAttendance() {
  const since = new Date(Date.now() - 7 * 864e5).toISOString();
  let rows, inquiries, auditRows;
  if (IS_MOCK) {
    const s = mockState();
    rows = s.signups.filter((r) => r.checked_in_at && r.checked_in_at >= since);
    inquiries = s.inquiries; auditRows = s.audit.slice(0, 100);
  } else {
    const sb = supabaseAdmin();
    const a = await sb.from('signups').select('id, name, phone, slot_date, slot_hour, walk_in, checked_in_at, checked_out_at')
      .or(`checked_in_at.gte.${since},and(checked_in_at.not.is.null,checked_out_at.is.null)`).order('checked_in_at', { ascending: false });
    if (a.error) throw new Error(a.error.message);
    rows = a.data || [];
    const i = await sb.from('volunteer_inquiries').select('*').order('created_at', { ascending: false }).limit(200);
    inquiries = i.error ? null : i.data; // null => table missing (migration not run)
    const au = await sb.from('attendance_audit').select('*').order('created_at', { ascending: false }).limit(100);
    auditRows = au.error ? null : au.data;
  }
  const nowMs = Date.now();
  rows = rows.map((r) => effectiveRow(r, new Date(nowMs)));
  const decorate = (r) => {
    const hrs = ((r.checked_out_at ? Date.parse(r.checked_out_at) : nowMs) - Date.parse(r.checked_in_at)) / 36e5;
    return {
      id: r.id, name: r.name, phone: r.phone, walkIn: !!r.walk_in,
      slot: `${formatDateLabel(r.slot_date)} · ${formatHourLabel(r.slot_hour)}`,
      checkedInAt: r.checked_in_at, checkedOutAt: r.checked_out_at,
      inLabel: `${formatDateLabel(dateInTz(r.checked_in_at))} ${formatTimestamp(r.checked_in_at)}`,
      outLabel: r.checked_out_at ? formatTimestamp(r.checked_out_at) + (r.auto_expired ? ' (auto)' : '') : null,
      autoExpired: !!r.auto_expired,
      hours: Math.round(hrs * 10) / 10,
      longFlag: !r.checked_out_at && hrs > LONG_CHECKIN_HOURS,
    };
  };
  const active = rows.filter((r) => !r.checked_out_at).map(decorate);
  const history = rows.filter((r) => r.checked_out_at).map(decorate).slice(0, 100);
  return { active, history, inquiries, audit: auditRows, longHours: LONG_CHECKIN_HOURS };
}

function dateInTz(iso) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: process.env.PARISH_TIMEZONE || 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}

// Manual correction with audit trail. fields: { checked_in_at?, checked_out_at? (ISO or null) }
export async function correctAttendance(id, fields, note) {
  const allowed = {};
  if ('checked_in_at' in fields) allowed.checked_in_at = fields.checked_in_at;
  if ('checked_out_at' in fields) allowed.checked_out_at = fields.checked_out_at;
  let before;
  if (IS_MOCK) {
    const r = mockState().signups.find((s) => s.id === id);
    if (!r) return { error: 'not_found' };
    before = { checked_in_at: r.checked_in_at, checked_out_at: r.checked_out_at };
    Object.assign(r, allowed);
  } else {
    const sb = supabaseAdmin();
    const { data: r } = await sb.from('signups').select('checked_in_at, checked_out_at').eq('id', id).maybeSingle();
    if (!r) return { error: 'not_found' };
    before = r;
    const { error } = await sb.from('signups').update(allowed).eq('id', id);
    if (error) throw new Error(error.message);
  }
  await audit({ signup_id: id, action: 'correction', source: 'admin', old_value: JSON.stringify(before), new_value: JSON.stringify(allowed), note: note || null });
  return { ok: true };
}

export async function setInquiryStatus(id, status) {
  if (!['new', 'contacted', 'resolved'].includes(status)) return { error: 'bad_status' };
  if (IS_MOCK) {
    const r = mockState().inquiries.find((i) => i.id === id);
    if (r) { r.status = status; r.status_updated_at = new Date().toISOString(); }
    return { ok: true };
  }
  const { error } = await supabaseAdmin().from('volunteer_inquiries').update({ status, status_updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(error.message);
  return { ok: true };
}

// Automatic check-out at closing (8 PM parish time) and for stale check-ins from earlier days.
// Safe to run any time; idempotent (checkOut only touches rows still open).
export async function autoCheckout(now = new Date()) {
  const plan = planAutoCheckout(await openRows(), now);
  const closed = [];
  for (const p of plan) {
    const r = await checkOut(p.id, { source: 'auto', at: p.at, note: p.reason === 'shift' ? 'automatic check-out after 1 hour' : p.stale ? 'automatic check-out (stale, earlier day)' : 'automatic check-out at closing' });
    if (r.ok && !r.already) closed.push(p);
  }
  return { ok: true, closed: closed.length, stale: closed.filter((c) => c.stale).length };
}
export function mockAudit() { return IS_MOCK ? mockState().audit : []; }

export async function logAudit(entry) { return audit(entry); }
