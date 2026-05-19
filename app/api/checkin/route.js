import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabase';
import {
  currentAdorationHour,
  WALK_IN_UNLOCK_MINUTES,
  formatTimestamp,
  SLOTS_PER_HOUR,
} from '../../../lib/dates';

export const dynamic = 'force-dynamic';

// GET — return the current state for the iPad to render
export async function GET() {
  const { date, current, next, minute } = currentAdorationHour();

  if (current === null) {
    return NextResponse.json({
      outsideHours: true,
      date,
      message: 'The chapel is outside Adoration hours (8 AM – 8 PM).',
    });
  }

  const supabase = supabaseAdmin();

  // Get all signups for the current hour AND the next hour (for early arrivals)
  const hoursToFetch = next ? [current, next] : [current];
  const { data: signups, error } = await supabase
    .from('signups')
    .select('id, slot_date, slot_hour, name, phone, checked_in_at, walk_in')
    .eq('slot_date', date)
    .in('slot_hour', hoursToFetch)
    .order('checked_in_at', { ascending: true, nullsFirst: false })
    .order('name', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const currentHourSignups = (signups || []).filter((s) => s.slot_hour === current);
  const nextHourSignups = (signups || []).filter((s) => s.slot_hour === next);

  const checkedInCount = currentHourSignups.filter((s) => s.checked_in_at).length;
  const walkInUnlocked = minute >= WALK_IN_UNLOCK_MINUTES && checkedInCount === 0;
  const isUncovered = walkInUnlocked; // same condition triggers the alert banner

  return NextResponse.json({
    outsideHours: false,
    date,
    currentHour: current,
    nextHour: next,
    minute,
    walkInUnlocked,
    isUncovered,
    walkInUnlockMinutes: WALK_IN_UNLOCK_MINUTES,
    currentHourSignups: currentHourSignups.map((s) => ({
      id: s.id,
      name: s.name,
      phone: maskPhone(s.phone),
      checkedInAt: s.checked_in_at,
      checkedInAtFormatted: s.checked_in_at ? formatTimestamp(s.checked_in_at) : null,
      walkIn: s.walk_in,
    })),
    nextHourSignups: nextHourSignups.map((s) => ({
      id: s.id,
      name: s.name,
      phone: maskPhone(s.phone),
      checkedInAt: s.checked_in_at,
      checkedInAtFormatted: s.checked_in_at ? formatTimestamp(s.checked_in_at) : null,
    })),
  });
}

// POST — check someone in (scheduled or walk-in)
export async function POST(req) {
  let body;
  try { body = await req.json(); } catch { return bad('Invalid request.'); }

  const { date, current, next, minute } = currentAdorationHour();
  if (current === null) return bad('The chapel is outside Adoration hours.');

  const supabase = supabaseAdmin();

  // Mode 1: check in an existing signup by id
  if (body.signupId) {
    // Verify the signup is for the current or next hour (no backdating past hours)
    const { data: existing, error: fetchErr } = await supabase
      .from('signups')
      .select('id, slot_date, slot_hour, checked_in_at')
      .eq('id', body.signupId)
      .single();
    if (fetchErr || !existing) return bad('Signup not found.');
    if (existing.slot_date !== date) return bad('Cannot check in for a different day.');
    if (existing.slot_hour !== current && existing.slot_hour !== next) {
      return bad('Cannot check in for that hour.');
    }
    if (existing.checked_in_at) {
      return NextResponse.json({ ok: true, alreadyCheckedIn: true });
    }
    const { error: updErr } = await supabase
      .from('signups')
      .update({ checked_in_at: new Date().toISOString() })
      .eq('id', body.signupId);
    if (updErr) return fail(updErr.message);
    return NextResponse.json({ ok: true });
  }

  // Mode 2: walk-in (creates a new signup AND checks in)
  if (body.walkIn) {
    const { name, phone } = body;
    if (!name || !name.trim()) return bad('Name is required for walk-in.');
    if (!phone || phone.replace(/\D/g, '').length < 10) {
      return bad('Valid phone number is required for walk-in.');
    }

    // Walk-in only allowed if conditions are met
    if (minute < WALK_IN_UNLOCK_MINUTES) {
      return bad(`Walk-in unlocks ${WALK_IN_UNLOCK_MINUTES} minutes into the hour.`);
    }

    // Check that no scheduled volunteer has checked in
    const { count: checkedIn, error: countErr } = await supabase
      .from('signups')
      .select('id', { count: 'exact', head: true })
      .eq('slot_date', date)
      .eq('slot_hour', current)
      .not('checked_in_at', 'is', null);
    if (countErr) return fail(countErr.message);
    if ((checkedIn ?? 0) > 0) {
      return bad('A scheduled volunteer has already checked in for this hour.');
    }

    // Check capacity (still cap at SLOTS_PER_HOUR total)
    const { count: total } = await supabase
      .from('signups')
      .select('id', { count: 'exact', head: true })
      .eq('slot_date', date)
      .eq('slot_hour', current);
    if ((total ?? 0) >= SLOTS_PER_HOUR) {
      return bad('This hour is full.');
    }

    const { error: insErr } = await supabase.from('signups').insert({
      slot_date: date,
      slot_hour: current,
      name: name.trim(),
      phone: phone.trim(),
      walk_in: true,
      checked_in_at: new Date().toISOString(),
    });
    if (insErr) return fail(insErr.message);

    return NextResponse.json({ ok: true, walkIn: true });
  }

  return bad('No action specified.');
}

// Show only last 4 digits of phone on the iPad to protect privacy
function maskPhone(p) {
  if (!p) return '';
  const digits = p.replace(/\D/g, '');
  if (digits.length < 4) return '';
  return `••• ${digits.slice(-4)}`;
}

function bad(msg) { return NextResponse.json({ error: msg }, { status: 400 }); }
function fail(msg) { return NextResponse.json({ error: msg }, { status: 500 }); }
