import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';
import { currentAdorationHour, formatHourRange } from '../../../../lib/dates';
import { sendAlert } from '../../../../lib/alerts';

export const dynamic = 'force-dynamic';

function authorized(req) {
  const auth = req.headers.get('authorization') || '';
  const secret = process.env.CRON_SECRET;
  if (secret && auth === `Bearer ${secret}`) return true;
  if (req.headers.get('x-vercel-cron')) return true;
  return false;
}

// Called every 15 minutes. We only act when we're in the :00–:14 window of an Adoration hour
// AND no one has checked in yet.
export async function GET(req) {
  if (process.env.CRON_SECRET && !authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { date, current, minute } = currentAdorationHour();
  if (current === null) {
    return NextResponse.json({ skipped: true, reason: 'outside adoration hours' });
  }
  // Only fire in the first 15 minutes of the hour (5..14 ideally, but we tolerate a wider window)
  if (minute < 5 || minute >= 15) {
    return NextResponse.json({ skipped: true, reason: 'outside alert window', minute });
  }

  const supabase = supabaseAdmin();

  // Have we already sent an alert for this hour?
  const { data: existing } = await supabase
    .from('alerts_sent')
    .select('id')
    .eq('slot_date', date)
    .eq('slot_hour', current)
    .eq('alert_type', 'uncovered_hour')
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ skipped: true, reason: 'already alerted for this hour' });
  }

  // Anyone checked in for current hour?
  const { count: checkedIn } = await supabase
    .from('signups')
    .select('id', { count: 'exact', head: true })
    .eq('slot_date', date)
    .eq('slot_hour', current)
    .not('checked_in_at', 'is', null);
  if ((checkedIn ?? 0) > 0) {
    return NextResponse.json({ ok: true, sent: 0, reason: 'someone is checked in' });
  }

  // Who was supposed to be there?
  const { data: scheduled } = await supabase
    .from('signups')
    .select('name, phone')
    .eq('slot_date', date)
    .eq('slot_hour', current);

  const scheduledList = (scheduled || [])
    .map((s) => `${s.name}${s.phone ? ` (${s.phone})` : ''}`)
    .join(', ');

  // Coordinators
  const { data: coordinators } = await supabase
    .from('coordinators')
    .select('id, name, phone, email')
    .eq('active', true);

  const subject = `St. Henry: ${formatHourRange(current)} chapel uncovered`;
  const message = scheduledList
    ? `St. Henry chapel: no one has checked in for ${formatHourRange(current)}. Scheduled: ${scheduledList}.`
    : `St. Henry chapel: no one has checked in for ${formatHourRange(current)}, and no one was scheduled. The Blessed Sacrament is currently unattended.`;

  const result = await sendAlert({ subject, message, coordinators: coordinators || [] });

  // Record that we sent the alert (so we don't send again this hour)
  await supabase.from('alerts_sent').insert({
    slot_date: date, slot_hour: current, alert_type: 'uncovered_hour',
  });

  return NextResponse.json({ ok: true, ...result, hour: current });
}
