import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';

export const dynamic = 'force-dynamic';

// POST (admin password) — roster + open-hour sign-ups. Contacts never leave the server without auth.
export async function POST(req) {
  const expected = process.env.ADMIN_PASSWORD || '';
  if (!expected || req.headers.get('x-admin-password') !== expected) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sb = supabaseAdmin();
  const [v, s] = await Promise.all([
    sb.from('volunteers').select('id, first_name, contact, contact_type, language, wants_alerts, wants_regular, source, created_at').order('created_at', { ascending: false }),
    sb.from('hour_signups').select('id, volunteer_id, campaign, slot_start, slot_end, created_at').order('slot_start'),
  ]);
  if (v.error || s.error) return NextResponse.json({ error: 'Roster tables not available yet (migration 2026-10-26 not applied?)' }, { status: 500 });
  return NextResponse.json({ volunteers: v.data, signups: s.data });
}
