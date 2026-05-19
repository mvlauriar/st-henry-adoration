import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';
import { todayInParish, slotHasEnded } from '../../../../lib/dates';
import { sendAlert } from '../../../../lib/alerts';

export const dynamic = 'force-dynamic';

function authorized(req) {
  const auth = req.headers.get('authorization') || '';
  const secret = process.env.CRON_SECRET;
  if (secret && auth === `Bearer ${secret}`) return true;
  if (req.headers.get('x-vercel-cron')) return true;
  return false;
}

// Runs once daily (e.g. 5 AM parish time). Marks past-and-unattended signups as no-shows,
// pauses their recurring chains, and sends each affected volunteer an alert email.
export async function GET(req) {
  if (process.env.CRON_SECRET && !authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const today = todayInParish();
  const supabase = supabaseAdmin();

  // Look back up to 2 days (catches anything not yet swept)
  const lookback = new Date();
  lookback.setUTCDate(lookback.getUTCDate() - 2);
  const lookbackDate = lookback.toISOString().slice(0, 10);

  // Pull signups that have ended, were not checked in, and not yet marked no-show
  const { data: candidates, error } = await supabase
    .from('signups')
    .select('id, name, phone, email, slot_date, slot_hour, recurring, recurring_group_id, walk_in')
    .gte('slot_date', lookbackDate)
    .lte('slot_date', today)
    .is('checked_in_at', null)
    .eq('no_show', false)
    .eq('walk_in', false); // walk-ins are always checked in, but extra safety
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let marked = 0;
  let pausedGroups = new Set();
  let notified = 0;

  for (const s of candidates || []) {
    if (!slotHasEnded(s.slot_date, s.slot_hour)) continue;

    // Mark this signup as no-show
    await supabase.from('signups').update({ no_show: true }).eq('id', s.id);
    marked++;

    // Pause any future recurring slots in the same group
    if (s.recurring && s.recurring_group_id && !pausedGroups.has(s.recurring_group_id)) {
      await supabase
        .from('signups')
        .update({ recurring_paused: true })
        .eq('recurring_group_id', s.recurring_group_id)
        .gte('slot_date', today)
        .is('checked_in_at', null);
      pausedGroups.add(s.recurring_group_id);

      // Notify the volunteer via email if we have one
      if (s.email && s.email.includes('@')) {
        const subject = 'St. Henry Adoration — recurring sign-ups paused';
        const message = [
          `Dear ${s.name},`,
          ``,
          `We didn't see you check in for your scheduled Adoration hour on ${s.slot_date}.`,
          ``,
          `Because you are part of our recurring sign-up list, we have paused your future weekly slots to make sure another volunteer can cover them.`,
          ``,
          `If this was a mistake or you would like to resume, please contact the parish office and we will restore your weekly slot.`,
          ``,
          `May the Lord bless you,`,
          `St. Henry Adoration`,
        ].join('\n');
        await sendAlert({ subject, message, coordinators: [{ email: s.email, name: s.name }] });
        notified++;
      }
    }
  }

  return NextResponse.json({ ok: true, marked, pausedGroups: pausedGroups.size, notified });
}
