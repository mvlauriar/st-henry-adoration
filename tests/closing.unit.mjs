// Run: node tests/closing.unit.mjs
import assert from 'node:assert/strict';
import { parishInstant, planAutoCheckout } from '../lib/closing.js';
let n = 0; const t = (name, fn) => { fn(); n++; console.log('PASS', name); };
t('8 PM EDT = 00:00Z next day', () => assert.equal(parishInstant('2026-10-20').toISOString(), '2026-10-21T00:00:00.000Z'));
t('8 PM EST = 01:00Z next day', () => assert.equal(parishInstant('2026-12-01').toISOString(), '2026-12-02T01:00:00.000Z'));
t('DST change day (Nov 1 2026) 8 PM EST', () => assert.equal(parishInstant('2026-11-01').toISOString(), '2026-11-02T01:00:00.000Z'));
const rows = [
  { id: 'a', checked_in_at: '2026-10-20T16:00:00Z', checked_out_at: null },      // today 12 PM ET
  { id: 'b', checked_in_at: '2026-10-19T21:47:00Z', checked_out_at: null },      // yesterday 5:47 PM ET
  { id: 'c', checked_in_at: '2026-10-19T12:00:00Z', checked_out_at: '2026-10-19T13:00:00Z' }, // already closed
];
t('before 8 PM: only earlier-day rows closed, at that day\'s 8 PM', () => {
  const p = planAutoCheckout(rows, new Date('2026-10-20T23:05:00Z')); // 7:05 PM EDT
  assert.deepEqual(p, [{ id: 'b', at: '2026-10-20T00:00:00.000Z', stale: true }]);
});
t('after 8 PM: today closed too, at 8 PM', () => {
  const p = planAutoCheckout(rows, new Date('2026-10-21T00:05:00Z'));
  assert.deepEqual(p.map((x) => [x.id, x.at]), [['a', '2026-10-21T00:00:00.000Z'], ['b', '2026-10-20T00:00:00.000Z']]);
});
t('check-in after 8 PM keeps its own time (never before check-in)', () => {
  const p = planAutoCheckout([{ id: 'd', checked_in_at: '2026-10-21T00:30:00Z' }], new Date('2026-10-21T01:05:00Z'));
  assert.equal(p[0].at, '2026-10-21T00:30:00.000Z');
});
t('morning run: nothing open today is touched', () => {
  assert.equal(planAutoCheckout([rows[0]], new Date('2026-10-20T17:00:00Z')).length, 0);
});
console.log(`\n${n}/${n} passed`);
