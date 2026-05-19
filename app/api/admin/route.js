import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabase';
import { upcomingDates, HOURS, SLOTS_PER_HOUR, currentAdorationHour, formatTimestamp } from '../../../lib/dates';

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

  // 1. All upcoming signups + no-show stats
  const { data: signups, error } = await supabase
    .from('signups')
    .select('id, slot_date, slot_hour, name, phone, email, recurring, recurring_paused, checked_in_at, no_show, walk_in')
    .gte('slot_date', dates[0])
    .lte('slot_date', dates[dates.length - 1])
    .order('slot_date', { ascending: true })
    .order('slot_hour', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 2. No-show history by phone
  const { data: history } = await supabase.from('no_show_history').select('*');
  const historyByPhone = {};
  for (const h of history || []) historyByPhone[h.phone] = h;

  // 3. Coverage grid
  const grid = {};
  for (const d of dates) { grid[d] = {}; for (const h of HOURS) grid[d][h] = 0; }
  for (const row of signups || []) {
    if (grid[row.slot_date] && grid[row.slot_date][row.slot_hour] !== undefined) {
      grid[row.slot_date][row.slot_hour]++;
    }
  }
  const empty = [];
  for (const d of dates) for (const h of HOURS) if (grid[d][h] === 0) empty.push({ date: d, hour: h });

  // 4. Current-hour live state
  const { date: nowDate, current } = currentAdorationHour();
  let currentHourLive = null;
  if (current !== null) {
    const currentList = (signups || []).filter((s) => s.slot_date === nowDate && s.slot_hour === current);
    currentHourLive = {
      date: nowDate,
      hour: current,
      scheduled: currentList,
      checkedInCount: currentList.filter((s) => s.checked_in_at).length,
    };
  }

  // 5. Coordinators
  const { data: coordinators } = await supabase
    .from('coordinators')
    .select('id, name, phone, email, active')
    .order('name');

  // 6. Decorate signups with no-show counts
  const decorated = (signups || []).map((s) => {
    const h = s.phone ? historyByPhone[s.phone] : null;
    return {
      ...s,
      checkedInAtFormatted: s.checked_in_at ? formatTimestamp(s.checked_in_at) : null,
      noShowHistory: h ? { count: h.no_show_count, attended: h.attended_count } : null,
    };
  });

  return NextResponse.json({
    ok: true,
    dates,
    hours: HOURS,
    slotsPerHour: SLOTS_PER_HOUR,
    grid,
    signups: decorated,
    empty,
    currentHourLive,
    coordinators: coordinators || [],
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

// Coordinator management — PUT to add, PATCH to toggle/remove
export async function PUT(req) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { name, phone, email } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 });
  if (!phone?.trim() && !email?.trim()) {
    return NextResponse.json({ error: 'Phone or email required' }, { status: 400 });
  }
  const supabase = supabaseAdmin();
  const { error } = await supabase.from('coordinators').insert({
    name: name.trim(),
    phone: phone?.trim() || null,
    email: email?.trim() || null,
    active: true,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { coordinatorId, action } = await req.json();
  if (!coordinatorId) return NextResponse.json({ error: 'Missing coordinatorId' }, { status: 400 });
  const supabase = supabaseAdmin();
  if (action === 'remove') {
    await supabase.from('coordinators').delete().eq('id', coordinatorId);
  } else if (action === 'toggle') {
    const { data: existing } = await supabase.from('coordinators').select('active').eq('id', coordinatorId).single();
    if (existing) {
      await supabase.from('coordinators').update({ active: !existing.active }).eq('id', coordinatorId);
    }
  } else if (action === 'resumeRecurring') {
    // The 'coordinatorId' here is actually a signup id — resume their paused recurring
    const { data: sig } = await supabase.from('signups').select('recurring_group_id').eq('id', coordinatorId).single();
    if (sig?.recurring_group_id) {
      await supabase.from('signups').update({ recurring_paused: false }).eq('recurring_group_id', sig.recurring_group_id);
    }
  }
  return NextResponse.json({ ok: true });
}
