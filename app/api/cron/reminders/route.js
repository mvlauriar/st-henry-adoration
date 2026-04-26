import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { supabaseAdmin } from '../../../../lib/supabase';
import { PARISH_TZ, formatDateLabel, formatHourRange } from '../../../../lib/dates';

export const dynamic = 'force-dynamic';

// Vercel Cron protects this endpoint with a header in production; we also accept
// a manual call with the right secret for testing.
function authorized(req) {
  // Vercel Cron sends Authorization: Bearer <CRON_SECRET>
  const auth = req.headers.get('authorization') || '';
  const secret = process.env.CRON_SECRET;
  if (secret && auth === `Bearer ${secret}`) return true;
  // Vercel also sets a special header on cron invocations
  if (req.headers.get('x-vercel-cron')) return true;
  return false;
}

export async function GET(req) {
  // Allow without auth in local dev (no CRON_SECRET set)
  if (process.env.CRON_SECRET && !authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'RESEND_API_KEY not set' }, { status: 500 });

  const supabase = supabaseAdmin();

  // What's the current time in parish TZ? We want to remind anyone whose slot starts
  // between 45 and 75 minutes from now (a 30-min window catches every slot exactly once
  // since the cron runs every 15 minutes).
  const now = new Date();
  const target = new Date(now.getTime() + 60 * 60 * 1000); // 60 minutes ahead

  // Convert target to parish-local date and hour
  const fmtDate = new Intl.DateTimeFormat('en-CA', { timeZone: PARISH_TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
  const fmtHour = new Intl.DateTimeFormat('en-US', { timeZone: PARISH_TZ, hour: 'numeric', hour12: false });
  const fmtMin  = new Intl.DateTimeFormat('en-US', { timeZone: PARISH_TZ, minute: '2-digit' });

  const targetDate = fmtDate.format(target);
  const targetHour = parseInt(fmtHour.format(target), 10);
  const targetMinute = parseInt(fmtMin.format(target), 10);

  // Only fire when we're within the first 15 minutes of the target hour
  // (i.e. the slot starts within ~45-75 minutes from now). Skip otherwise — keeps it idempotent.
  if (targetMinute >= 15) {
    return NextResponse.json({ skipped: true, reason: 'outside reminder window', targetMinute });
  }

  const { data: signups, error } = await supabase
    .from('signups')
    .select('id, name, email, slot_date, slot_hour')
    .eq('slot_date', targetDate)
    .eq('slot_hour', targetHour)
    .eq('reminder_sent', false)
    .not('email', 'is', null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!signups || signups.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, target: `${targetDate} ${targetHour}:00` });
  }

  const resend = new Resend(apiKey);
  const fromEmail = process.env.FROM_EMAIL || 'onboarding@resend.dev';
  let sent = 0;
  const sentIds = [];

  for (const s of signups) {
    if (!s.email || !s.email.includes('@')) continue;
    try {
      await resend.emails.send({
        from: fromEmail,
        to: s.email,
        subject: `Reminder: Adoration in 1 hour (${formatHourRange(s.slot_hour)})`,
        html: reminderHtml(s),
        text: reminderText(s),
      });
      sentIds.push(s.id);
      sent++;
    } catch (err) {
      console.error('Send failed for', s.email, err);
    }
  }

  if (sentIds.length > 0) {
    await supabase.from('signups').update({ reminder_sent: true }).in('id', sentIds);
  }

  return NextResponse.json({ ok: true, sent, total: signups.length });
}

function reminderHtml(s) {
  return `
    <div style="font-family: Georgia, serif; max-width: 540px; margin: 0 auto; color: #2b2419; padding: 24px;">
      <div style="text-align:center; color:#a07a2c; letter-spacing:0.4em; font-size:18px;">✦ ✦ ✦</div>
      <h1 style="font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 500; text-align:center; font-size:26px; margin:12px 0 4px;">
        A gentle reminder
      </h1>
      <p style="text-align:center; color:#5a4f3e; font-style:italic; margin:0 0 24px;">
        from St. Henry Adoration
      </p>
      <p>Dear ${escapeHtml(s.name)},</p>
      <p>This is a reminder that you are signed up for Adoration in approximately <strong>one hour</strong>:</p>
      <p style="text-align:center; font-family:'Cormorant Garamond', Georgia, serif; font-size:22px; color:#6b1d1d; margin:18px 0;">
        ${formatDateLabel(s.slot_date)}<br/>
        ${formatHourRange(s.slot_hour)}
      </p>
      <p>If you are unable to come, please arrange for a substitute or notify the parish office.</p>
      <p style="font-style:italic; color:#5a4f3e; border-left:3px solid #c9a55a; padding-left:14px; margin-top:24px;">
        May your time before the Blessed Sacrament be filled with grace.
      </p>
    </div>
  `;
}

function reminderText(s) {
  return [
    `Dear ${s.name},`,
    ``,
    `This is a reminder that you are signed up for Adoration in approximately one hour:`,
    ``,
    `  ${formatDateLabel(s.slot_date)}`,
    `  ${formatHourRange(s.slot_hour)}`,
    ``,
    `If you are unable to come, please arrange for a substitute or notify the parish office.`,
    ``,
    `— St. Henry Adoration`,
  ].join('\n');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
