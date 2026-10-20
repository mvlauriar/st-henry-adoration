// Run: node tests/closing.unit.mjs
import assert from 'node:assert/strict';
import { parishInstant, planAutoCheckout, expiryOf, effectiveRow, isActive } from '../lib/closing.js';
let n = 0; const t = (name, fn) => { fn(); n++; console.log('PASS', name); };
t('8 PM EDT = 00:00Z next day', () => assert.equal(parishInstant('2026-10-20').toISOString(), '2026-10-21T00:00:00.000Z'));
t('8 PM EST = 01:00Z next day', () => assert.equal(parishInstant('2026-12-01').toISOString(), '2026-12-02T01:00:00.000Z'));
t('DST change day (Nov 1 2026) 8 PM EST', () => assert.equal(parishInstant('2026-11-01').toISOString(), '2026-11-02T01:00:00.000Z'));
const rows = [
  { id: 'a', checked_in_at: '2026-10-20T16:00:00Z', checked_out_at: null },      // today 12 PM ET
  { id: 'b', checked_in_at: '2026-10-19T21:47:00Z', checked_out_at: null },      // yesterday 5:47 PM ET
  { id: 'c', checked_in_at: '2026-10-19T12:00:00Z', checked_out_at: '2026-10-19T13:00:00Z' }, // already closed
];
t('expired rows closed at check-in + 1h with reason shift', () => {
  const p = planAutoCheckout(rows, new Date('2026-10-20T23:05:00Z'));
  assert.deepEqual(p.map((x) => [x.id, x.at, x.reason]), [['a', '2026-10-20T17:00:00.000Z', 'shift'], ['b', '2026-10-19T22:47:00.000Z', 'shift']]);
});
t('8 PM caps a 7:30 PM check-in (closes at 8:00, reason closing)', () => {
  const p = planAutoCheckout([{ id: 'e', checked_in_at: '2026-10-20T23:30:00Z' }], new Date('2026-10-21T00:05:00Z'));
  assert.deepEqual(p.map((x) => [x.at, x.reason]), [['2026-10-21T00:00:00.000Z', 'closing']]);
});
t('check-in after 8 PM keeps its own time (never before check-in)', () => {
  const p = planAutoCheckout([{ id: 'd', checked_in_at: '2026-10-21T00:30:00Z' }], new Date('2026-10-21T01:05:00Z'));
  assert.equal(p[0].at, '2026-10-21T00:30:00.000Z');
});
t('within the hour: an open check-in is not touched', () => {
  assert.equal(planAutoCheckout([rows[0]], new Date('2026-10-20T16:30:00Z')).length, 0);
});
t('expiryOf: min(in+60m, 8 PM)', () => {
  assert.equal(expiryOf('2026-10-20T16:00:00Z').at.toISOString(), '2026-10-20T17:00:00.000Z');
  assert.equal(expiryOf('2026-10-20T23:30:00Z').at.toISOString(), '2026-10-21T00:00:00.000Z');
  assert.equal(expiryOf('2026-12-01T00:40:00Z').at.toISOString(), '2026-12-01T01:00:00.000Z'); // 7:40 PM EST
});
t('effectiveRow / isActive', () => {
  const r = { id: 'x', checked_in_at: '2026-10-20T16:00:00Z', checked_out_at: null };
  assert.equal(isActive(r, new Date('2026-10-20T16:59:00Z')), true);
  assert.equal(isActive(r, new Date('2026-10-20T17:00:00Z')), false);
  const e = effectiveRow(r, new Date('2026-10-20T18:00:00Z'));
  assert.equal(e.checked_out_at, '2026-10-20T17:00:00.000Z'); assert.equal(e.auto_expired, true);
  assert.equal(r.checked_out_at, null); // not mutated
  assert.equal(effectiveRow(rows[2]).checked_out_at, rows[2].checked_out_at);
});
console.log(`\n${n}/${n} passed`);
