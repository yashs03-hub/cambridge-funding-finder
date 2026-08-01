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
  long_tail: true,
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
  // `annual_recurring` used to be in this list. The first real crawl removed
  // it: a recurrence is a claim about when a student can apply, so it now
  // carries the same evidence burden as a fixed date. See the recurrence
  // tests at the end of this file.
  for (const deadline_type of ['rolling', 'unknown']) {
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

// ── Recurrence, added after the first real crawl ────────────────────────
// The enum says "annual_recurring" and the real data almost never is: of the
// ten recurring awards at the first three colleges, three were termly and
// four ran from 1 January. A generic "Recurs annually" label was wrong for
// seven of ten, so the record must now state its cycle in the source's words.

test('annual_recurring must state how it recurs', () => {
  const errs = validateDataset(
    withItem({
      deadline_type: 'annual_recurring',
      deadline_date: null,
      deadline_recurrence: null,
      evidence_quote: 'Applications are considered each term.',
    }),
  );
  assert.ok(
    errs.some((e) => /deadline_recurrence is missing/.test(e)),
    `expected a missing-recurrence error, got ${JSON.stringify(errs)}`,
  );
});

test('a recurrence claim needs an evidence quote, like any deadline claim', () => {
  const errs = validateDataset(
    withItem({
      deadline_type: 'annual_recurring',
      deadline_date: null,
      deadline_recurrence: 'Termly',
      evidence_quote: null,
    }),
  );
  assert.ok(
    errs.some((e) => /evidence_quote is missing/.test(e)),
    `expected a missing-evidence error, got ${JSON.stringify(errs)}`,
  );
});

test('recurrence text on a non-recurring award is a contradiction', () => {
  const errs = validateDataset(withItem({ deadline_recurrence: 'Termly' }));
  assert.ok(
    errs.some((e) => /deadline_recurrence is set but deadline_type/.test(e)),
    `expected a contradiction error, got ${JSON.stringify(errs)}`,
  );
});

test('a well-formed recurring award passes', () => {
  assert.deepEqual(
    validateDataset(
      withItem({
        deadline_type: 'annual_recurring',
        deadline_date: null,
        deadline_recurrence: 'Applications must arrive by 1 June each year',
        evidence_quote: 'Applications should reach her by 1 June each year.',
      }),
    ),
    [],
  );
});

test('no college lists the same award twice under different titles', () => {
  // Exact-id deduplication was not enough. Girton was extracted twice — once
  // by hand, once by an agent — and three awards landed twice because the
  // titles differed just enough to produce different ids ("Harry Barkley Fund
  // for the Year 5 Elective" vs "Harry Barkley for Year 5 Elective"). A
  // student asking about a medical elective got the same fund as both #1 and
  // #2 on the live site, spending two of five shortlist slots on one award.
  //
  // Exact normalised equality only — deliberately not substring matching,
  // which flagged "Dinah James Award for Year 5 Elective" against "Dinah
  // James Scholarship". Those are genuinely different awards, and a test that
  // cries wolf gets deleted.
  const normTitle = (t) =>
    t
      .toLowerCase()
      .replace(
        /\b(the|fund|funds|award|awards|grant|grants|scholarship|scholarships|bursary|bursaries|studentship|studentships|for|of|in|a|an)\b/g,
        ' ',
      )
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();

  const seen = new Map();
  const dupes = [];
  for (const item of committed.items) {
    const key = `${item.provider_id}::${normTitle(item.title)}`;
    if (!normTitle(item.title)) continue;
    if (seen.has(key)) dupes.push(`${item.provider_name}: "${seen.get(key)}" / "${item.title}"`);
    else seen.set(key, item.title);
  }

  assert.deepEqual(dupes, [], `duplicate awards:\n  ${dupes.join('\n  ')}`);
});
