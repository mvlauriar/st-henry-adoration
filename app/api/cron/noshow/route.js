import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';
import { sendAlert } from '../../../../lib/alerts';

export const dynamic = 'force-dynamic';

function checkAuth(req) {
  const header = req.headers.get('authorization') || '';
  const expected = `Bearer ${process.env.CRON_SECRET || ''}`;
  return process.env.CRON_SECRET && header === expected;
}

export async function GET(req) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Feature flag: only run the no-show sweep when check-in is live.
  // Set CHECKIN_ENABLED=true in Vercel once the iPad is deployed at the chapel.
  if (process.env.CHECKIN_ENABLED !== 'true') {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: 'CHECKIN_ENABLED is not "true" — no-show tracking is paused.',
    });
  }

  const supabase = supabaseAdmin();

  // Yesterday in parish timezone
  const tz = process.env.PARISH_TIMEZONE || 'America/New_York';
  const now = new Date();
  const yfmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const today = yfmt.format(now);
  const [ty, tm, td] = today.split('-').map(Number);
  const yesterday = new Date(Date.UTC(ty, tm - 1, td - 1, 12));
  const yy = yesterday.getUTCFullYear();
  const ym = String(yesterday.getUTCMonth() + 1).padStart(2, '0');
  const yd = String(yesterday.getUTCDate()).padStart(2, '0');
  const ymd = `${yy}-${ym}-${yd}`;

  // Find yesterday's signups with no check-in
  const { data: missed, error } = await supabase
    .from('signups')
    .select('id, name, email, phone, recurring, recurring_group_id, slot_date, slot_hour')
    .eq('slot_date', ymd)
    .is('checked_in_at', null)
    .eq('no_show', false);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let marked = 0;
  const pausedGroups = new Set();

  for (const row of missed || []) {
    // Mark as no-show
    await supabase.from('signups').update({ no_show: true }).eq('id', row.id);
    marked++;

    // If recurring, pause the whole chain so future weeks don't auto-fire
    if (row.recurring && row.recurring_group_id && !pausedGroups.has(row.recurring_group_id)) {
      await supabase
        .from('signups')
        .update({ recurring_paused: true })
        .eq('recurring_group_id', row.recurring_group_id);
      pausedGroups.add(row.recurring_group_id);

      // Notify volunteer
      if (row.email || row.phone) {
        await sendAlert({
          to: { email: row.email, phone: row.phone },
          subject: 'Your recurring Adoration signup is paused',
          message: `Hello ${row.name}, we noticed you missed your recent Adoration hour. Your recurring signup has been paused. If you'd like to resume, please contact the parish office or sign up again.`,
        });
      }
    }
  }

  return NextResponse.json({ ok: true, marked, pausedGroups: pausedGroups.size });
}
