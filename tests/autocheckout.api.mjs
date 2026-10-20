// API checks against local `KIOSK_MOCK=1 CRON_SECRET=testsecret ADMIN_PASSWORD=testpw next start`.
// Run: BASE=http://localhost:3100 node tests/autocheckout.api.mjs
import assert from 'node:assert/strict';
const BASE = process.env.BASE || 'http://localhost:3100';
const post = (u, b, h = {}) => fetch(BASE + u, { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(b) }).then((r) => r.json());
const cron = (now, auth = 'Bearer testsecret') => fetch(BASE + '/api/cron/autocheckout' + (now ? '?now=' + now : ''), { headers: auth ? { authorization: auth } : {} });
const active = async () => (await (await fetch(BASE + '/api/checkin')).json()).active;
let n = 0; const t = async (name, fn) => { await fn(); n++; console.log('PASS', name); };

await post('/api/checkin', { action: 'mockReset' });
const today = await post('/api/checkin', { action: 'checkin', manualName: 'Today Person' });
const old = await post('/api/checkin', { action: 'checkin', manualName: 'Stale Person' });
await fetch(BASE + '/api/admin', { method: 'PATCH', headers: { 'x-admin-password': 'testpw', 'Content-Type': 'application/json' },
  body: JSON.stringify({ action: 'correction', id: old.id, note: 'test backdate', checked_in_at: new Date(Date.now() - 2 * 864e5).toISOString() }) });

await t('rejects missing/wrong secret', async () => {
  assert.equal((await cron(null, null)).status, 401);
  assert.equal((await cron(null, 'Bearer nope')).status, 401);
});
await t('daytime run closes only stale earlier-day check-in', async () => {
  const noon = new Date(); // simulate noon ET today
  const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(noon);
  const r = await (await cron(encodeURIComponent(d + 'T12:00:00-04:00'))).json();
  // if test runs after 8 PM ET today, "noon" sim still keeps today's open
  assert.equal(r.closed, 1); assert.equal(r.stale, 1);
  const ids = (await active()).map((a) => a.id);
  assert.ok(ids.includes(today.id) && !ids.includes(old.id));
  assert.ok(r.audit.some((a) => a.signup_id === old.id && a.action === 'checkout' && a.source === 'auto' && /automatic/.test(a.note)));
});
await t('run after closing closes today\'s too; audit says automatic', async () => {
  const r = await (await cron(encodeURIComponent(new Date(Date.now() + 864e5).toISOString()))).json();
  assert.ok(r.closed >= 1);
  assert.equal((await active()).length, 0);
  assert.ok(r.audit.some((a) => a.signup_id === today.id && a.source === 'auto' && a.action === 'checkout'));
});
await t('idempotent: second run closes nothing', async () => {
  const r = await (await cron(encodeURIComponent(new Date(Date.now() + 864e5).toISOString()))).json();
  assert.equal(r.closed, 0);
});
console.log(`\n${n}/${n} passed`);

// Re-check-in: staying longer = check in again -> fresh check-in, never blocked as duplicate
await post('/api/checkin', { action: 'mockReset' });
const first = await post('/api/checkin', { action: 'checkin', manualName: 'Long Stayer' });
await t('re-check-in while still active creates a fresh check-in (old one closed)', async () => {
  const again = await post('/api/checkin', { action: 'checkin', manualName: 'Long Stayer' });
  assert.equal(again.ok, true); assert.ok(!again.already); assert.equal(again.renewed, true);
  assert.notEqual(again.id, first.id);
  const ids = (await active()).map((a) => a.id);
  assert.deepEqual(ids, [again.id]);
});
await t('re-check-in after previous check-in expired (auto-closed) creates a fresh one', async () => {
  await cron(encodeURIComponent(new Date(Date.now() + 864e5).toISOString()));
  assert.equal((await active()).length, 0);
  const third = await post('/api/checkin', { action: 'checkin', manualName: 'Long Stayer' });
  assert.equal(third.ok, true); assert.ok(!third.already); assert.equal(third.renewed, false);
  assert.deepEqual((await active()).map((a) => a.id), [third.id]);
});
console.log(`\n${n}/${n} passed (incl. re-check-in)`);
