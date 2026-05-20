import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabase';
import { upcomingDates, HOURS, SLOTS_PER_HOUR, slotHasEnded } from '../../../lib/dates';

export const dynamic = 'force-dynamic';

// GET — return current slot counts so the page can refresh after signup
export async function GET() {
  const dates = upcomingDates(7);
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from('slot_counts')
    .select('slot_date, slot_hour, filled')
    .gte('slot_date', dates[0])
    .lte('slot_date', dates[dates.length - 1]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const counts = {};
  for (const r of data || []) {
    if (!counts[r.slot_date]) counts[r.slot_date] = {};
    counts[r.slot_date][r.slot_hour] = r.filled;
  }
  return NextResponse.json({ counts });
}

// POST — create a signup (and up to 3 future copies if recurring)
export async function POST(req) {
  let body;
  try { body = await req.json(); } catch { return bad('Invalid request.'); }

  const { name, phone, email, recurring, slot_date, slot_hour } = body || {};

  if (!name || typeof name !== 'string' || name.trim().length < 1) return bad('Name is required.');
  if (!slot_date || !/^\d{4}-\d{2}-\d{2}$/.test(slot_date)) return bad('Invalid date.');
  const hour = parseInt(slot_hour, 10);
  if (!Number.isInteger(hour) || !HOURS.includes(hour)) return bad('Invalid hour.');
  // Allow signups for the current in-progress hour; reject only fully-ended hours
  if (slotHasEnded(slot_date, hour)) return bad('That time has already passed.');

  const supabase = supabaseAdmin();

  // Check capacity for the primary slot
  const { count: existing, error: countErr } = await supabase
    .from('signups')
    .select('id', { count: 'exact', head: true })
    .eq('slot_date', slot_date)
    .eq('slot_hour', hour);

  if (countErr) return fail(countErr.message);
  if ((existing ?? 0) >= SLOTS_PER_HOUR) return bad('That hour is now full. Please choose another.');

  // Build rows to insert. Recurring = 3 more weekly copies.
  const groupId = recurring ? cryptoRandom() : null;
  const rows = [{
    slot_date,
    slot_hour: hour,
    name: name.trim(),
    phone: phone?.trim() || null,
    email: email?.trim() || null,
    recurring: !!recurring,
    recurring_group_id: groupId,
  }];

  if (recurring) {
    for (let w = 1; w <= 3; w++) {
      const future = addWeeks(slot_date, w);
      const room = await hasRoom(supabase, future, hour);
      if (room) {
        rows.push({
          slot_date: future,
          slot_hour: hour,
          name: name.trim(),
          phone: phone?.trim() || null,
          email: email?.trim() || null,
          recurring: true,
          recurring_group_id: groupId,
        });
      }
    }
  }

  const { error: insertErr } = await supabase.from('signups').insert(rows);
  if (insertErr) return fail(insertErr.message);

  return NextResponse.json({ ok: true, count: rows.length });
}

async function hasRoom(supabase, date, hour) {
  const { count, error } = await supabase
    .from('signups')
    .select('id', { count: 'exact', head: true })
    .eq('slot_date', date)
    .eq('slot_hour', hour);
  if (error) return false;
  return (count ?? 0) < SLOTS_PER_HOUR;
}

function addWeeks(ymd, weeks) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + weeks * 7, 12));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function cryptoRandom() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
}

function bad(msg) { return NextResponse.json({ error: msg }, { status: 400 }); }
function fail(msg) { return NextResponse.json({ error: msg }, { status: 500 }); }
