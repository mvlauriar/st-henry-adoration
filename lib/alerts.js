import { Resend } from 'resend';

// Send an alert message to all active coordinators.
// Uses Twilio SMS if TWILIO_* env vars are set; otherwise falls back to Resend email.
// Returns { sent: number, channel: 'sms' | 'email' | 'none' }.
export async function sendAlert({ subject, message, coordinators }) {
  if (!coordinators || coordinators.length === 0) {
    return { sent: 0, channel: 'none', reason: 'no coordinators configured' };
  }

  const twilioConfigured = !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_FROM_NUMBER
  );

  if (twilioConfigured) {
    return await sendSms(coordinators, message);
  }

  return await sendEmailFallback(coordinators, subject, message);
}

async function sendSms(coordinators, message) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const auth = Buffer.from(`${sid}:${token}`).toString('base64');

  let sent = 0;
  for (const c of coordinators) {
    if (!c.phone) continue;
    try {
      const body = new URLSearchParams({ To: c.phone, From: from, Body: message });
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      });
      if (res.ok) sent++;
      else console.error('Twilio error:', await res.text());
    } catch (e) {
      console.error('Twilio send failed:', e);
    }
  }
  return { sent, channel: 'sms' };
}

async function sendEmailFallback(coordinators, subject, message) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: 0, channel: 'none', reason: 'no email configured' };

  const resend = new Resend(apiKey);
  const from = process.env.FROM_EMAIL || 'onboarding@resend.dev';
  let sent = 0;

  for (const c of coordinators) {
    if (!c.email) continue;
    try {
      await resend.emails.send({
        from,
        to: c.email,
        subject,
        text: message,
        html: `<div style="font-family:Georgia,serif;max-width:540px;padding:20px;color:#1f1a12;">
          <h2 style="color:#5a1818;margin:0 0 12px;">${escapeHtml(subject)}</h2>
          <pre style="font-family:Georgia,serif;white-space:pre-wrap;font-size:15px;line-height:1.5;margin:0;">${escapeHtml(message)}</pre>
        </div>`,
      });
      sent++;
    } catch (e) {
      console.error('Resend send failed:', e);
    }
  }
  return { sent, channel: 'email' };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}
