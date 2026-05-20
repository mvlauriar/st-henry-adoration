import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabase';
import {
  currentAdorationHour,
  WALK_IN_UNLOCK_MINUTES,
  abbreviateName,
  SLOTS_PER_HOUR,
} from '../../../lib/dates';

export const dynamic = 'force-dynamic';

// GET — return current state for the iPad (NO phone numbers, NO exact timestamps in public response)
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
  const hoursToFetch = next ? [current, next] : [current];

  const { data: signups, error } = await supabase
    .from('signups')
    .select('id, slot_date, slot_hour, name, checked_in_at, checked_out_at')
    .eq('slot_date', date)
    .in('slot_hour', hoursToFetch)
    .order('name', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const currentList = (signups || []).filter((s) => s.slot_hour === current);
  const nextList = (signups || []).filter((s) => s.slot_hour === next);

  // Someone is "actively here" if they're checked in AND not checked out
  const activelyPresent = currentList.filter((s) => s.checked_in_at && !s.checked_out_at).length;
  const isUncovered = activelyPresent === 0;

  // Substitute prompt unlocks if uncovered AND we're past the unlock minute threshold
  const substituteUnlocked = isUncovered && minute >= WALK_IN_UNLOCK_MINUTES;

  function publicTile(s) {
    return {
      id: s.id,
      displayName: abbreviateName(s.name),
      // No phone, no checked_in_at timestamp, no exact times shown publicly
      isCheckedIn: !!s.checked_in_at && !s.checked_out_at,
      hasCheckedOut: !!s.checked_out_at,
    };
  }

  return NextResponse.json({
    outsideHours: false,
    date,
    currentHour: current,
    nextHour: next,
    minute,
    isUncovered,
    substituteUnlocked,
    walkInUnlockMinutes: WALK_IN_UNLOCK_MINUTES,
    currentHourSignups: currentList.map(publicTile),
    nextHourSignups: nextList.map(publicTile),
    hourIsCovered: !isUncovered,
  });
}

// POST — check in or check out
export async function POST(req) {
  let body;
  try { body = await req.json(); } catch { return bad('Invalid request.'); }

  const { date, current, next } = currentAdorationHour();
  if (current === null) return bad('The chapel is outside Adoration hours.');

  const supabase = supabaseAdmin();

  if (!body.signupId) return bad('Missing signup id.');

  // Verify slot
  const { data: existing, error: fetchErr } = await supabase
    .from('signups')
    .select('id, slot_date, slot_hour, checked_in_at, checked_out_at')
    .eq('id', body.signupId)
    .single();
  if (fetchErr || !existing) return bad('Signup not found.');
  if (existing.slot_date !== date) return bad('Cannot check in for a different day.');
  if (existing.slot_hour !== current && existing.slot_hour !== next) {
    return bad('Cannot check in for that hour.');
  }

  const action = body.action || 'checkin';

  if (action === 'checkout') {
    if (!existing.checked_in_at) return bad('Cannot check out before checking in.');
    if (existing.checked_out_at) return NextResponse.json({ ok: true, alreadyCheckedOut: true });
    const { error: updErr } = await supabase
      .from('signups')
      .update({ checked_out_at: new Date().toISOString() })
      .eq('id', body.signupId);
    if (updErr) return fail(updErr.message);
    return NextResponse.json({ ok: true });
  }

  // Default: check-in. If they previously checked out, re-checking in clears the checkout.
  if (existing.checked_in_at && !existing.checked_out_at) {
    return NextResponse.json({ ok: true, alreadyCheckedIn: true });
  }
  const update = existing.checked_in_at
    ? { checked_out_at: null } // re-check-in: clear the previous checkout
    : { checked_in_at: new Date().toISOString() };

  const { error: updErr } = await supabase.from('signups').update(update).eq('id', body.signupId);
  if (updErr) return fail(updErr.message);
  return NextResponse.json({ ok: true });
}

function bad(msg) { return NextResponse.json({ error: msg }, { status: 400 }); }
function fail(msg) { return NextResponse.json({ error: msg }, { status: 500 }); }
