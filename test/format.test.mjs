/**
 * Deadline rendering is the one thing the product is trusted for (§3), so it
 * is the one thing tested hardest. "Wrong deadline costs a student an
 * application" is the highest-severity risk in §11.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeDeadline, verifiedAgo, amountLabel, daysBetween, URGENT_WITHIN_DAYS } from '../lib/format.ts';

const NOW = new Date('2026-07-29T12:00:00Z');
const day = (n) => new Date(NOW.getTime() + n * 86_400_000).toISOString().slice(0, 10);

test('a passed fixed deadline never renders as open', () => {
  const v = describeDeadline('fixed', day(-1), NOW);
  assert.equal(v.state, 'closed');
  assert.match(v.text, /^Closed /);
});

test('urgent applies within the threshold and not beyond it', () => {
  assert.equal(describeDeadline('fixed', day(URGENT_WITHIN_DAYS), NOW).state, 'urgent');
  assert.equal(describeDeadline('fixed', day(URGENT_WITHIN_DAYS + 1), NOW).state, 'fixed');
});

test('closing today is urgent, not closed', () => {
  const v = describeDeadline('fixed', day(0), NOW);
  assert.equal(v.state, 'urgent');
  assert.match(v.text, /today/);
});

test('unknown states so explicitly and is never blank', () => {
  const v = describeDeadline('unknown', null, NOW);
  assert.equal(v.state, 'unknown');
  assert.ok(v.text.trim().length > 0);
  assert.match(v.text, /not stated/i);
});

test('rolling and unknown are worded differently', () => {
  // "There is no deadline" and "we do not know the deadline" are different
  // facts and must never look the same to a student (§5).
  const rolling = describeDeadline('rolling', null, NOW);
  const unknown = describeDeadline('unknown', null, NOW);
  assert.notEqual(rolling.text, unknown.text);
  assert.notEqual(rolling.state, unknown.state);
});

test('a fixed deadline with no date degrades to unknown, not to open', () => {
  // Half-extracted record. It must not become something a student acts on.
  const v = describeDeadline('fixed', null, NOW);
  assert.equal(v.state, 'unknown');
});

test('no deadline state ever produces empty text', () => {
  for (const t of ['fixed', 'rolling', 'annual_recurring', 'unknown']) {
    for (const d of [day(5), day(-5), null]) {
      const v = describeDeadline(t, d, NOW);
      assert.ok(v.text.trim().length > 0, `${t}/${d} produced empty text`);
    }
  }
});

test('verifiedAgo reads naturally at the boundaries', () => {
  assert.equal(verifiedAgo(NOW.toISOString(), NOW), 'Verified today');
  assert.equal(verifiedAgo(day(-1) + 'T12:00:00Z', NOW), 'Verified yesterday');
  assert.equal(verifiedAgo(day(-3) + 'T12:00:00Z', NOW), 'Verified 3 days ago');
});

test('a missing amount is stated, not blank', () => {
  assert.equal(amountLabel(null), 'Not stated');
  assert.equal(amountLabel('   '), 'Not stated');
  assert.equal(amountLabel('up to £800'), 'up to £800');
});

test('daysBetween ignores time of day', () => {
  // Deadlines are dates, not instants. An award closing "today" must not flip
  // to closed because the server clock is an hour ahead of the student's.
  assert.equal(daysBetween(new Date('2026-07-29T23:00:00Z'), new Date('2026-07-30T01:00:00Z')), 1);
  assert.equal(daysBetween(new Date('2026-07-29T01:00:00Z'), new Date('2026-07-29T23:00:00Z')), 0);
});
