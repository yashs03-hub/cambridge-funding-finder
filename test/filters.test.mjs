import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEADLINE_FILTERS,
  EMPTY_FILTERS,
  TYPE_FILTERS,
  countLabel,
  matches,
  toggle,
} from '../lib/filters.ts';

const item = (over = {}) => ({
  type: 'travel',
  providerId: 'trinity',
  deadlineState: 'fixed',
  ...over,
});

test('no filters means show everything, not show nothing', () => {
  assert.equal(matches(item(), EMPTY_FILTERS), true);
  assert.equal(matches(item({ type: 'prize', deadlineState: 'closed' }), EMPTY_FILTERS), true);
});

test('type buckets fold bursary and scholarship into Grant', () => {
  const f = { ...EMPTY_FILTERS, types: ['grant'] };
  assert.equal(matches(item({ type: 'grant' }), f), true);
  assert.equal(matches(item({ type: 'bursary' }), f), true);
  assert.equal(matches(item({ type: 'scholarship' }), f), true);
  assert.equal(matches(item({ type: 'travel' }), f), false);
});

test('every schema type is reachable by some pill', () => {
  // A type with no pill is a record a student can filter into invisibility.
  const covered = new Set(TYPE_FILTERS.flatMap((t) => t.types));
  for (const t of ['travel', 'hardship', 'grant', 'prize', 'bursary', 'scholarship']) {
    assert.ok(covered.has(t), `no filter reaches type "${t}"`);
  }
});

test('Open excludes closed and unknown', () => {
  const f = { ...EMPTY_FILTERS, deadlines: ['open'] };
  assert.equal(matches(item({ deadlineState: 'fixed' }), f), true);
  assert.equal(matches(item({ deadlineState: 'urgent' }), f), true);
  assert.equal(matches(item({ deadlineState: 'closed' }), f), false);
  assert.equal(matches(item({ deadlineState: 'unknown' }), f), false);
});

test('Unknown is its own bucket, never folded into Open', () => {
  // A student who wants awards they can definitely still apply for and one
  // willing to chase an unstated deadline are asking different questions.
  const open = DEADLINE_FILTERS.find((d) => d.key === 'open');
  assert.ok(!open.states.includes('unknown'));
});

test('closed is in no bucket', () => {
  const all = new Set(DEADLINE_FILTERS.flatMap((d) => d.states));
  assert.ok(!all.has('closed'), 'a passed deadline is never something to filter toward');
});

test('filters within a group are OR, across groups are AND', () => {
  const f = { types: ['travel', 'prize'], deadlines: ['open'], providers: [] };
  assert.equal(matches(item({ type: 'prize', deadlineState: 'urgent' }), f), true);
  assert.equal(matches(item({ type: 'hardship', deadlineState: 'urgent' }), f), false);
  assert.equal(matches(item({ type: 'prize', deadlineState: 'rolling' }), f), false);
});

test('provider filter narrows to the chosen colleges', () => {
  const f = { ...EMPTY_FILTERS, providers: ['trinity', 'downing'] };
  assert.equal(matches(item({ providerId: 'downing' }), f), true);
  assert.equal(matches(item({ providerId: 'kings' }), f), false);
});

test('toggle adds then removes', () => {
  assert.deepEqual(toggle([], 'a'), ['a']);
  assert.deepEqual(toggle(['a', 'b'], 'a'), ['b']);
});

test('the count never implies hidden records when none are hidden', () => {
  assert.equal(countLabel(9, 9), '9 awards');
  assert.equal(countLabel(3, 9), '3 of 9 awards shown');
  assert.equal(countLabel(1, 1), '1 award');
});
