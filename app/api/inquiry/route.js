import { NextResponse } from 'next/server';
import { createInquiry } from '../../../lib/kioskStore';

export const dynamic = 'force-dynamic';

// Kiosk "New here?" lead capture. Write-only from the kiosk: it returns only an id.
export async function POST(req) {
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400 }); }
  try {
    const r = await createInquiry({ fullName: body.fullName, phone: body.phone, consent: body.consent });
    if (r.error) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
    return NextResponse.json({ ok: true, id: r.id }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('inquiry failed', e);
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
  }
}
