import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { COLLEGES, EXPECTED_COLLEGE_COUNT, toProviders } from '../lib/colleges.ts';

test('all 31 colleges are seeded — scope is locked at 31 for v1', () => {
  assert.equal(COLLEGES.length, EXPECTED_COLLEGE_COUNT);
});

test('slugs and names are unique', () => {
  assert.equal(new Set(COLLEGES.map((c) => c.slug)).size, COLLEGES.length);
  assert.equal(new Set(COLLEGES.map((c) => c.name)).size, COLLEGES.length);
});

test('every root URL is https and inside cam.ac.uk', () => {
  for (const c of COLLEGES) {
    assert.match(c.url, /^https:\/\//, `${c.name} is not https`);
    assert.match(c.url, /\.cam\.ac\.uk$/, `${c.name} is outside cam.ac.uk`);
    assert.ok(!c.url.endsWith('/'), `${c.name} has a trailing slash`);
  }
});

test('funding index URLs are discovered, never guessed', () => {
  // A wrong funding URL sends the crawler somewhere plausible and silently
  // wrong, which is worse than no hint at all (§4.1).
  for (const c of COLLEGES) {
    assert.equal(c.fundingIndexUrl, null, `${c.name} has a hand-guessed funding URL`);
  }
});

test('generated seed SQL is in step with the source list', () => {
  // seed_providers.sql is generated from lib/colleges.ts. If someone edits
  // the TS and forgets to regenerate, the database seeds the old set.
  const sql = readFileSync(new URL('../supabase/seed_providers.sql', import.meta.url), 'utf8');
  const rows = [...sql.matchAll(/^\s*\('([a-z-]+)',/gm)].map((m) => m[1]);
  assert.deepEqual(rows, COLLEGES.map((c) => c.slug), 'run: node scripts/gen-seed-sql.mjs');
});

test('toProviders yields well-formed college providers', () => {
  const providers = toProviders();
  assert.equal(providers.length, EXPECTED_COLLEGE_COUNT);
  assert.ok(providers.every((p) => p.kind === 'college'));
  assert.ok(providers.every((p) => p.id && p.name && p.url));
});
