import { NextResponse } from 'next/server';
import { getActivePublic, getDirectory, checkIn, checkOut, IS_MOCK, resetMock } from '../../../lib/kioskStore';
import { nowInParish, formatDateLabelFull, formatTimestamp } from '../../../lib/dates';

export const dynamic = 'force-dynamic';

// Kiosk API (server-side only). Responses never include phone numbers or emails.
// GET                 -> { now, active: [{ id, displayName, since }] }
// GET ?directory=1    -> { directory: [{ key, displayName, search, scheduledNow, hint? }] }
// POST { action:'checkin', key | manualName | inquiryId }
// POST { action:'checkout', id }
export async function GET(req) {
  try {
    const url = new URL(req.url);
    if (url.searchParams.get('directory')) {
      return json({ ok: true, directory: await getDirectory() });
    }
    const { date } = nowInParish();
    return json({
      ok: true,
      now: { date, dateLabel: formatDateLabelFull(date), time: formatTimestamp(new Date().toISOString()) },
      active: await getActivePublic(),
    });
  } catch (e) {
    console.error('kiosk GET failed', e);
    return json({ ok: false, error: 'server_error' }, 500);
  }
}

export async function POST(req) {
  let body;
  try { body = await req.json(); } catch { return json({ ok: false, error: 'bad_request' }, 400); }
  try {
    if (body.action === 'mockReset' && IS_MOCK) { resetMock(); return json({ ok: true }); }
    if (body.action === 'checkout') {
      if (!body.id) return json({ ok: false, error: 'bad_request' }, 400);
      const r = await checkOut(String(body.id));
      return json(r.error ? { ok: false, ...r } : r, r.error ? 404 : 200);
    }
    if (body.action === 'checkin') {
      const target = body.key ? { key: String(body.key) }
        : body.inquiryId ? { inquiryId: String(body.inquiryId) }
        : { manualName: body.manualName };
      const r = await checkIn(target);
      return json(r.error ? { ok: false, ...r } : r, r.error ? 400 : 200);
    }
    return json({ ok: false, error: 'bad_request' }, 400);
  } catch (e) {
    console.error('kiosk POST failed', e);
    return json({ ok: false, error: 'server_error' }, 500);
  }
}

function json(data, status = 200) {
  return NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}
