import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';
import { sendAlert } from '../../../../lib/alerts';
import { currentAdorationHour, formatHourRange } from '../../../../lib/dates';

export const dynamic = 'force-dynamic';

function checkAuth(req) {
  const header = req.headers.get('authorization') || '';
  const expected = `Bearer ${process.env.CRON_SECRET || ''}`;
  return process.env.CRON_SECRET && header === expected;
}

export async function GET(req) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Feature flag: only fire uncovered-hour alerts when check-in is actually possible.
  // Set CHECKIN_ENABLED=true in Vercel once the iPad is deployed at the chapel.
  if (process.env.CHECKIN_ENABLED !== 'true') {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: 'CHECKIN_ENABLED is not "true" — uncovered-hour alerts are paused.',
    });
  }

  const { date, current, minute } = currentAdorationHour();
  if (current === null) return NextResponse.json({ ok: true, skipped: 'outside hours' });

  // Only alert if we're at least 5 minutes into the hour
  if (minute < 5) return NextResponse.json({ ok: true, skipped: 'too early' });

  const supabase = supabaseAdmin();

  // Dedup: have we already alerted for this hour today?
  const alertKey = `${date}-${current}`;
  const { data: existingAlert } = await supabase
    .from('alerts_sent')
    .select('id')
    .eq('alert_key', alertKey)
    .maybeSingle();
  if (existingAlert) return NextResponse.json({ ok: true, skipped: 'already alerted' });

  // Check if anyone is actively present for the current hour
  const { data: signups } = await supabase
    .from('signups')
    .select('id, checked_in_at, checked_out_at')
    .eq('slot_date', date)
    .eq('slot_hour', current);

  const activelyPresent = (signups || []).filter((s) => s.checked_in_at && !s.checked_out_at).length;
  if (activelyPresent > 0) return NextResponse.json({ ok: true, skipped: 'hour covered' });

  // Hour is uncovered — alert coordinators
  const { data: coordinators } = await supabase
    .from('coordinators')
    .select('name, phone, email')
    .eq('active', true);

  let sent = 0;
  for (const c of coordinators || []) {
    await sendAlert({
      to: { email: c.email, phone: c.phone },
      subject: 'Adoration chapel uncovered',
      message: `The chapel is uncovered for the ${formatHourRange(current)} hour. No one has checked in. Please find a substitute.`,
    });
    sent++;
  }

  // Record alert so we don't re-fire this hour
  await supabase.from('alerts_sent').insert({ alert_key: alertKey });

  return NextResponse.json({ ok: true, alerted: sent });
}
