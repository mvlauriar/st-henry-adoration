import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabase';
import { parishInstant, parishParts } from '../../../lib/closing';
import { CAMPAIGN, allSlots, isOpenSlot, slotKey } from '../../../lib/openHours';

export const dynamic = 'force-dynamic';

// Best-effort per-instance rate limit (serverless: resets per cold start).
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  arr.push(now); hits.set(ip, arr);
  return arr.length > 5;
}

// Local-only design mock (never on Vercel): HOURS_MOCK=1 npm run dev; ?mock=none shows the all-taken state.
const MOCK = process.env.HOURS_MOCK === '1' && !process.env.VERCEL;

// GET — public: open slot keys only (no names/contacts).
export async function GET(req) {
  const slots = allSlots();
  if (MOCK) return NextResponse.json({ open: new URL(req.url).searchParams.get('mock') === 'none' ? [] : slots.map((s) => s.key) });
  const taken = new Set();
  try {
    const first = parishInstant(slots[0].date, 0).toISOString();
    const { data, error } = await supabaseAdmin().from('hour_signups').select('slot_start').eq('campaign', CAMPAIGN).gte('slot_start', first);
    if (error) throw error;
    for (const r of data || []) {
      const p = parishParts(new Date(r.slot_start));
      taken.add(slotKey(p.date, p.hour));
    }
  } catch (e) {
    return NextResponse.json({ open: slots.map((s) => s.key), warning: 'availability unavailable' });
  }
  return NextResponse.json({ open: slots.filter((s) => !taken.has(s.key)).map((s) => s.key) });
}

export async function POST(req) {
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
  let b; try { b = await req.json(); } catch { return bad('Invalid request.'); }
  if (b?.website) return NextResponse.json({ ok: true }); // honeypot: pretend success
  if (limited(ip)) return bad('Too many tries. Please wait a few minutes.', 429);

  const first_name = String(b.first_name || '').trim().slice(0, 60);
  const raw = String(b.contact || '').trim().slice(0, 120);
  const language = b.language === 'es' ? 'es' : 'en';
  if (!first_name) return bad('Please enter your first name.');
  let contact, contact_type;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) { contact = raw.toLowerCase(); contact_type = 'email'; }
  else {
    const d = raw.replace(/\D/g, '');
    if (d.length < 10 || d.length > 11) return bad('Please enter a phone number or email.');
    contact = d.length === 11 && d[0] === '1' ? d.slice(1) : d; contact_type = 'phone';
  }
  const picks = Array.isArray(b.slots) ? b.slots.slice(0, 20) : [];
  const now = new Date();
  const rows = [];
  for (const k of picks) {
    const m = /^(\d{4}-\d{2}-\d{2})T(\d{2})$/.exec(String(k)); if (!m) continue;
    const date = m[1], hour = Number(m[2]);
    if (!isOpenSlot(date, hour)) continue;
    const end = parishInstant(date, hour + 1);
    if (end <= now) continue;
    rows.push({ key: k, campaign: CAMPAIGN, slot_start: parishInstant(date, hour).toISOString(), slot_end: end.toISOString() });
  }
  const alertsOnly = !!b.alerts_only;
  if (!rows.length && !alertsOnly) return bad('Please pick at least one hour that has not passed.');

  if (MOCK) return NextResponse.json({ ok: true, saved: rows.map((r) => r.key), taken: [] });
  const sb = supabaseAdmin();
  const { data: existing } = await sb.from('volunteers').select('id, wants_alerts, wants_regular').eq('contact_type', contact_type).eq('contact', contact).maybeSingle();
  let volunteerId = existing?.id;
  const fields = {
    first_name, language,
    wants_alerts: !!b.wants_alerts || !!existing?.wants_alerts, // never silently opt someone out
    wants_regular: !!b.wants_regular || !!existing?.wants_regular,
    updated_at: now.toISOString(),
  };
  if (volunteerId) {
    const { error } = await sb.from('volunteers').update(fields).eq('id', volunteerId);
    if (error) return fail();
  } else {
    const { data, error } = await sb.from('volunteers').insert({ ...fields, contact, contact_type, source: String(b.source || 'hours-link').slice(0, 40) }).select('id').single();
    if (error) return fail();
    volunteerId = data.id;
  }
  // Insert one at a time; the unique index on slot_start makes the database the referee.
  const saved = [], taken = [];
  for (const { key, ...r } of rows) {
    const { error } = await sb.from('hour_signups').insert({ ...r, volunteer_id: volunteerId });
    if (!error) saved.push(key);
    else if (error.code === '23505') taken.push(key);
    else return fail();
  }
  return NextResponse.json({ ok: true, saved, taken });
}

function bad(error, status = 400) { return NextResponse.json({ error }, { status }); }
function fail() { return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 }); }
