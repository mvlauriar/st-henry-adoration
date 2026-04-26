import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabase';
import { upcomingDates, HOURS, SLOTS_PER_HOUR } from '../../../lib/dates';

export const dynamic = 'force-dynamic';

function checkAuth(req) {
  const header = req.headers.get('x-admin-password') || '';
  const expected = process.env.ADMIN_PASSWORD || '';
  if (!expected) return false;
  return header === expected;
}

export async function POST(req) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const dates = upcomingDates(7);
  const supabase = supabaseAdmin();

  const { data, error } = await supabase
    .from('signups')
    .select('id, slot_date, slot_hour, name, phone, email, recurring')
    .gte('slot_date', dates[0])
    .lte('slot_date', dates[dates.length - 1])
    .order('slot_date', { ascending: true })
    .order('slot_hour', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Build per-slot fill counts and identify completely empty hours
  const grid = {}; // grid[date][hour] = filled count
  for (const d of dates) { grid[d] = {}; for (const h of HOURS) grid[d][h] = 0; }
  for (const row of data || []) {
    if (grid[row.slot_date] && grid[row.slot_date][row.slot_hour] !== undefined) {
      grid[row.slot_date][row.slot_hour]++;
    }
  }

  const empty = [];
  for (const d of dates) {
    for (const h of HOURS) {
      if (grid[d][h] === 0) empty.push({ date: d, hour: h });
    }
  }

  return NextResponse.json({
    ok: true,
    dates,
    hours: HOURS,
    slotsPerHour: SLOTS_PER_HOUR,
    grid,
    signups: data || [],
    empty,
  });
}

export async function DELETE(req) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  const supabase = supabaseAdmin();
  const { error } = await supabase.from('signups').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
