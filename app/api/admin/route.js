import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabase';
import {
  upcomingDates,
  HOURS,
  SLOTS_PER_HOUR,
  currentAdorationHour,
  formatTimestamp,
  computeLateness,
} from '../../../lib/dates';

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

  const { data: signups, error } = await supabase
    .from('signups')
    .select('id, slot_date, slot_hour, name, phone, email, recurring, recurring_paused, checked_in_at, checked_out_at, no_show, walk_in')
    .gte('slot_date', dates[0])
    .lte('slot_date', dates[dates.length - 1])
    .order('slot_date', { ascending: true })
    .order('slot_hour', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Per-phone history (no-shows, late arrivals)
  const { data: allHistory } = await supabase
    .from('signups')
    .select('phone, checked_in_at, slot_date, slot_hour, no_show')
    .not('phone', 'is', null);

  const historyByPhone = {};
  for (const h of allHistory || []) {
    if (!h.phone) continue;
    if (!historyByPhone[h.phone]) {
      historyByPhone[h.phone] = { count: 0, attended: 0, lateCount: 0, veryLateCount: 0 };
    }
    const entry = historyByPhone[h.phone];
    if (h.no_show) entry.count++;
    else if (h.checked_in_at) {
      entry.attended++;
      const l = computeLateness(h.checked_in_at, h.slot_date, h.slot_hour);
      if (l) {
        if (l.category === 'late') entry.lateCount++;
        else if (l.category === 'veryLate') entry.veryLateCount++;
      }
    }
  }

  const grid = {};
  for (const d of dates) { grid[d] = {}; for (const h of HOURS) grid[d][h] = 0; }
  for (const row of signups || []) {
    if (grid[row.slot_date] && grid[row.slot_date][row.slot_hour] !== undefined) {
      grid[row.slot_date][row.slot_hour]++;
    }
  }
  const empty = [];
  for (const d of dates) for (const h of HOURS) if (grid[d][h] === 0) empty.push({ date: d, hour: h });

  const { date: nowDate, current } = currentAdorationHour();
  let currentHourLive = null;
  if (current !== null) {
    const currentList = (signups || []).filter((s) => s.slot_date === nowDate && s.slot_hour === current);
    currentHourLive = {
      date: nowDate,
      hour: current,
      scheduled: currentList.map((s) => ({
        id: s.id,
        name: s.name,
        phone: s.phone,
        checkedInAt: s.checked_in_at,
        checkedInAtFormatted: s.checked_in_at ? formatTimestamp(s.checked_in_at) : null,
        checkedOutAt: s.checked_out_at,
        checkedOutAtFormatted: s.checked_out_at ? formatTimestamp(s.checked_out_at) : null,
        isActivelyPresent: !!s.checked_in_at && !s.checked_out_at,
      })),
      activelyPresentCount: currentList.filter((s) => s.checked_in_at && !s.checked_out_at).length,
    };
  }

  const { data: coordinators } = await supabase
    .from('coordinators')
    .select('id, name, phone, email, active')
    .order('name');

  const decorated = (signups || []).map((s) => {
    const h = s.phone ? historyByPhone[s.phone] : null;
    const lateness = s.checked_in_at ? computeLateness(s.checked_in_at, s.slot_date, s.slot_hour) : null;
    return {
      ...s,
      checkedInAtFormatted: s.checked_in_at ? formatTimestamp(s.checked_in_at) : null,
      checkedOutAtFormatted: s.checked_out_at ? formatTimestamp(s.checked_out_at) : null,
      lateness,
      noShowHistory: h ? { count: h.count, attended: h.attended, lateCount: h.lateCount, veryLateCount: h.veryLateCount } : null,
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

// PUT — multi-purpose: add coordinator (legacy) OR add manual signup
export async function PUT(req) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const supabase = supabaseAdmin();

  // Manual signup add
  if (body.kind === 'signup') {
    const { name, phone, email, slot_date, slot_hour, mark_present } = body;
    if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 });
    if (!phone?.trim()) return NextResponse.json({ error: 'Phone required' }, { status: 400 });
    if (!slot_date || !/^\d{4}-\d{2}-\d{2}$/.test(slot_date)) return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
    const hour = parseInt(slot_hour, 10);
    if (!Number.isInteger(hour) || !HOURS.includes(hour)) return NextResponse.json({ error: 'Invalid hour' }, { status: 400 });

    // Capacity check
    const { count } = await supabase
      .from('signups')
      .select('id', { count: 'exact', head: true })
      .eq('slot_date', slot_date)
      .eq('slot_hour', hour);
    if ((count ?? 0) >= SLOTS_PER_HOUR) return NextResponse.json({ error: 'That hour is full.' }, { status: 400 });

    const row = {
      slot_date,
      slot_hour: hour,
      name: name.trim(),
      phone: phone.trim(),
      email: email?.trim() || null,
      recurring: false,
    };
    if (mark_present) row.checked_in_at = new Date().toISOString();

    const { error } = await supabase.from('signups').insert(row);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // Add coordinator
  const { name, phone, email } = body;
  if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 });
  if (!phone?.trim() && !email?.trim()) return NextResponse.json({ error: 'Phone or email required' }, { status: 400 });
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
  if (!coordinatorId) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  const supabase = supabaseAdmin();
  if (action === 'remove') {
    await supabase.from('coordinators').delete().eq('id', coordinatorId);
  } else if (action === 'toggle') {
    const { data: existing } = await supabase.from('coordinators').select('active').eq('id', coordinatorId).single();
    if (existing) await supabase.from('coordinators').update({ active: !existing.active }).eq('id', coordinatorId);
  } else if (action === 'resumeRecurring') {
    const { data: sig } = await supabase.from('signups').select('recurring_group_id').eq('id', coordinatorId).single();
    if (sig?.recurring_group_id) {
      await supabase.from('signups').update({ recurring_paused: false }).eq('recurring_group_id', sig.recurring_group_id);
    }
  } else if (action === 'checkin') {
    await supabase.from('signups').update({ checked_in_at: new Date().toISOString(), checked_out_at: null }).eq('id', coordinatorId);
  } else if (action === 'checkout') {
    await supabase.from('signups').update({ checked_out_at: new Date().toISOString() }).eq('id', coordinatorId);
  } else if (action === 'undoCheckin') {
    await supabase.from('signups').update({ checked_in_at: null, checked_out_at: null }).eq('id', coordinatorId);
  }
  return NextResponse.json({ ok: true });
}
