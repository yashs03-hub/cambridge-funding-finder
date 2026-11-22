import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { retrieve, tokenise } from '../lib/retrieval.ts';

/**
 * Retrieval runs against the REAL dataset, not fixtures.
 *
 * A fixture would prove the scoring arithmetic works; these assertions prove
 * a student's actual question surfaces the award a person would pick. That is
 * the only property worth defending, and it can only be tested against the
 * corpus the site actually serves.
 */

const dataset = JSON.parse(readFileSync(new URL('../data/funding.json', import.meta.url), 'utf8'));
const items = dataset.items;
const NOW = new Date('2026-07-31T00:00:00Z');

const titles = (q, n = 8) =>
  retrieve(items, q, n, NOW).map((s) => `${s.item.provider_name}: ${s.item.title}`);

test('the dataset is large enough for these assertions to mean anything', () => {
  assert.ok(items.length > 400, `expected 400+ records, got ${items.length}`);
});

test('stopwords and short words are dropped', () => {
  assert.deepEqual(tokenise('I need help with my rent'), ['rent']);
  assert.deepEqual(tokenise('funding for a conference in Berlin'), ['conference', 'berlin']);
});

test('an empty or stopword-only query retrieves nothing', () => {
  // Better to return nothing than to rank the whole corpus by noise.
  assert.equal(retrieve(items, '', 10, NOW).length, 0);
  assert.equal(retrieve(items, 'I need some funding please thanks', 10, NOW).length, 0);
});

test('a hardship need surfaces hardship funds', () => {
  const top = retrieve(items, 'I am struggling to afford rent this term', 10, NOW);
  assert.ok(top.length > 0, 'expected some results');
  assert.ok(
    top.slice(0, 5).some((s) => s.item.type === 'hardship'),
    `no hardship fund in top 5: ${top.slice(0, 5).map((s) => s.item.title).join(' | ')}`,
  );
});

test('a conference trip surfaces travel funding', () => {
  const top = retrieve(items, 'money to present at a conference abroad', 10, NOW);
  assert.ok(
    top.slice(0, 5).some((s) => s.item.type === 'travel'),
    `no travel award in top 5: ${top.slice(0, 5).map((s) => s.item.title).join(' | ')}`,
  );
});

test('naming a college pulls that college up', () => {
  const top = retrieve(items, 'Newnham travel grant for research', 8, NOW);
  assert.equal(top[0].item.provider_name, 'Newnham College', `got ${titles('Newnham travel grant for research')[0]}`);
});

test('a book grant query finds book grants', () => {
  const top = retrieve(items, 'help buying books for my course', 10, NOW);
  assert.ok(
    top.slice(0, 6).some((s) => /book/i.test(s.item.title) || /book/i.test(s.item.description)),
    `no book grant found: ${top.slice(0, 6).map((s) => s.item.title).join(' | ')}`,
  );
});

test('closed awards are never retrieved', () => {
  // The listing shows them; a five-slot shortlist must not spend one on an
  // award nobody can apply for.
  const all = retrieve(items, 'travel grant research conference music book hardship', 200, NOW);
  for (const s of all) {
    if (s.item.deadline_type === 'fixed' && s.item.deadline_date) {
      assert.ok(
        new Date(s.item.deadline_date) >= NOW,
        `retrieved a closed award: ${s.item.title} (${s.item.deadline_date})`,
      );
    }
  }
});

test('every retrieved record carries a reason', () => {
  // If a result cannot say why it matched, the ranking is not inspectable and
  // a wrong first result is unexplainable — the failure embeddings would have
  // introduced, avoided deliberately.
  for (const s of retrieve(items, 'music lessons funding', 20, NOW)) {
    assert.ok(s.reasons.length > 0, `${s.item.title} matched with no reason`);
    assert.ok(s.score > 0);
  }
});

test('results are ordered by score', () => {
  const top = retrieve(items, 'travel grant for fieldwork', 20, NOW);
  for (let i = 1; i < top.length; i++) {
    assert.ok(top[i - 1].score >= top[i].score, 'results not sorted by score');
  }
});

test('the limit is respected', () => {
  assert.ok(retrieve(items, 'grant', 5, NOW).length <= 5);
  assert.ok(retrieve(items, 'grant', 40, NOW).length <= 40);
});

test('common corpus words are demoted automatically, not by hand', () => {
  // "support" appears in 136 of 449 records and "year" in 139. A hand-written
  // stopword list cannot keep up with a corpus that changes weekly, so rarity
  // is derived from the data. A query of only-common words must not rank a
  // third of the dataset.
  const common = retrieve(items, 'support available year term', 50, NOW);
  const rare = retrieve(items, 'stethoscope', 50, NOW);
  assert.ok(
    common.length < items.length / 4,
    `common-word query matched ${common.length} of ${items.length}`,
  );
  if (rare.length) {
    assert.ok(rare[0].score > 0, 'a rare, specific word should score');
  }
});

test('a word absent from the corpus does not silently match everything', () => {
  const r = retrieve(items, 'quidditch', 20, NOW);
  assert.equal(r.length, 0, `"quidditch" matched ${r.length} records`);
});


test('type hints match at word starts only, not inside other words', () => {
  // "rent" sits inside "different" and "parent", "sing" inside "using" and
  // "single". An unanchored alternation used to imply hardship and music
  // types for those words.
  const implied = (q) =>
    retrieve(items, q, 200, NOW).flatMap((s) => s.reasons.filter((r) => r.endsWith('implied')));
  assert.deepEqual(implied('different approach using parent method'), []);
  assert.ok(implied('struggling to afford rent').length > 0);
});
