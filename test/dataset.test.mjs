/**
 * The dataset validator replaces the CHECK constraints that lived in the
 * Postgres schema. Dropping the database must not drop the invariants — these
 * are the ones that stop a half-extracted record rendering as an award a
 * student could act on, which §11 ranks as the highest-severity failure.
 *
 * This runs in CI, so a malformed scraper commit fails its own pull request.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateDataset } from '../lib/dataset.ts';

const committed = JSON.parse(
  readFileSync(new URL('../data/funding.json', import.meta.url), 'utf8'),
);

const validItem = () => ({
  id: 'x1',
  provider_id: 'trinity',
  provider_name: 'Trinity College',
  title: 'Travelling Studentship',
  type: 'travel',
  description: 'Supports vacation travel.',
  eligibility_text: null,
  eligibility_tags: ['Travel'],
  amount_text: 'up to £1,200',
  deadline_type: 'fixed',
  deadline_date: '2026-08-15',
  application_method: null,
  source_url: 'https://www.trin.cam.ac.uk',
  evidence_quote: 'Applications close on 15 August.',
  last_scraped_at: '2026-07-26T00:00:00Z',
  last_verified_at: '2026-07-26T00:00:00Z',
});

const withItem = (over) => ({
  status: 'live',
  generated_at: '2026-07-26T00:00:00Z',
  items: [{ ...validItem(), ...over }],
});

test('the committed dataset is valid', () => {
  assert.deepEqual(validateDataset(committed), []);
});

test('the committed dataset holds no unreviewed records', () => {
  // Only approved records reach this file — the review gate is the file's
  // contents, not a query filter.
  for (const item of committed.items) {
    assert.ok(item.status === undefined || item.status === 'approved');
  }
});

test('a valid live dataset passes', () => {
  assert.deepEqual(validateDataset(withItem({})), []);
});

test('a fixed deadline with no date is rejected', () => {
  const errors = validateDataset(withItem({ deadline_date: null }));
  assert.equal(errors.length, 1);
  assert.match(errors[0], /deadline_date is missing/);
});

test('a fixed deadline with no evidence quote is rejected', () => {
  // The extractor must record `unknown` rather than guess (§4.4).
  const errors = validateDataset(withItem({ evidence_quote: null }));
  assert.equal(errors.length, 1);
  assert.match(errors[0], /evidence_quote is missing/);
});

test('rolling and unknown deadlines need neither date nor quote', () => {
  for (const deadline_type of ['rolling', 'annual_recurring', 'unknown']) {
    const errors = validateDataset(
      withItem({ deadline_type, deadline_date: null, evidence_quote: null }),
    );
    assert.deepEqual(errors, [], `${deadline_type} should be valid without a date`);
  }
});

test('a malformed deadline date is rejected', () => {
  const errors = validateDataset(withItem({ deadline_date: '15/08/2026' }));
  assert.match(errors.join(), /not YYYY-MM-DD/);
});

test('a non-approved record is rejected', () => {
  const errors = validateDataset(withItem({ status: 'pending' }));
  assert.match(errors.join(), /only approved records belong in this file/);
});

test('a relative source_url is rejected', () => {
  // The source link is the trust mechanism on every card; a relative URL
  // would resolve against our own domain and quietly 404.
  const errors = validateDataset(withItem({ source_url: '/funding' }));
  assert.match(errors.join(), /absolute http/);
});

test('duplicate ids are rejected', () => {
  const data = { status: 'live', generated_at: null, items: [validItem(), validItem()] };
  assert.match(validateDataset(data).join(), /duplicate id/);
});

test('an unknown funding or deadline type is rejected', () => {
  assert.match(validateDataset(withItem({ type: 'stipend' })).join(), /not a known funding type/);
  assert.match(
    validateDataset(withItem({ deadline_type: 'termly' })).join(),
    /not a known deadline type/,
  );
});

test('status must be placeholder or live', () => {
  const errors = validateDataset({ status: 'draft', generated_at: null, items: [] });
  assert.match(errors.join(), /must be "placeholder" or "live"/);
});

test('required identity fields are enforced', () => {
  for (const field of ['id', 'provider_id', 'provider_name', 'title', 'source_url']) {
    const errors = validateDataset(withItem({ [field]: '' }));
    assert.match(errors.join(), new RegExp(`${field} is required`), `${field} not enforced`);
  }
});
