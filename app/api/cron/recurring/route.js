import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';
import { upcomingDates, SLOTS_PER_HOUR } from '../../../../lib/dates';

export const dynamic = 'force-dynamic';

function authorized(req) {
  const auth = req.headers.get('authorization') || '';
  const secret = process.env.CRON_SECRET;
  if (secret && auth === `Bearer ${secret}`) return true;
  if (req.headers.get('x-vercel-cron')) return true;
  return false;
}

// Each day this finds people who selected "recurring" and ensures they have a signup
// for the same hour 4 weeks out (keeping the rolling window populated).
export async function GET(req) {
  if (process.env.CRON_SECRET && !authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = supabaseAdmin();

  // Get all recurring signups whose date is in the past or today — for each unique
  // (group_id, hour), make sure there's a signup at the latest_date + 7 days.
  const today = upcomingDates(1)[0];
  const { data: recurring, error } = await supabase
    .from('signups')
    .select('id, name, phone, email, slot_date, slot_hour, recurring_group_id')
    .eq('recurring', true)
    .not('recurring_group_id', 'is', null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Group by group_id
  const groups = {};
  for (const r of recurring || []) {
    if (!groups[r.recurring_group_id]) groups[r.recurring_group_id] = [];
    groups[r.recurring_group_id].push(r);
  }

  let extended = 0;
  for (const [, rows] of Object.entries(groups)) {
    // Most recent signup in this recurring group
    const latest = rows.reduce((a, b) => (a.slot_date > b.slot_date ? a : b));
    // Only extend if the latest one is within 7 days from today (otherwise the user
    // probably stopped — we don't keep extending forever).
    if (latest.slot_date < today) continue;

    const nextDate = addWeeks(latest.slot_date, 1);
    // Already extended?
    const exists = rows.some((r) => r.slot_date === nextDate && r.slot_hour === latest.slot_hour);
    if (exists) continue;

    // Capacity check
    const { count } = await supabase
      .from('signups')
      .select('id', { count: 'exact', head: true })
      .eq('slot_date', nextDate)
      .eq('slot_hour', latest.slot_hour);
    if ((count ?? 0) >= SLOTS_PER_HOUR) continue;

    await supabase.from('signups').insert({
      slot_date: nextDate,
      slot_hour: latest.slot_hour,
      name: latest.name,
      phone: latest.phone,
      email: latest.email,
      recurring: true,
      recurring_group_id: latest.recurring_group_id,
    });
    extended++;
  }

  return NextResponse.json({ ok: true, extended });
}

function addWeeks(ymd, weeks) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + weeks * 7, 12));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}
