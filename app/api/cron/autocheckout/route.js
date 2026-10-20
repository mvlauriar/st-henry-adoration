import { NextResponse } from 'next/server';
import { autoCheckout, IS_MOCK, mockAudit } from '../../../../lib/kioskStore';

export const dynamic = 'force-dynamic';

// Vercel Cron (00:05 and 01:05 UTC = 8:05 PM ET in EDT / EST). Requires
// Authorization: Bearer $CRON_SECRET (Vercel sends this automatically when CRON_SECRET is set).
// Closes every open check-in from earlier days, and today's once it is >= 8 PM parish time.
// Idempotent: safe to call manually at any time.
export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret || (req.headers.get('authorization') || '') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const url = new URL(req.url);
    const now = IS_MOCK && url.searchParams.get('now') ? new Date(url.searchParams.get('now')) : new Date();
    const r = await autoCheckout(now);
    return NextResponse.json(IS_MOCK ? { ...r, audit: mockAudit() } : r, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('autocheckout failed', e);
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
  }
}
