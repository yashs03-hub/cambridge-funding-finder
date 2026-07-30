/**
 * Promote extracted candidates into the dataset — but only what checks out.
 *
 *   node scripts/promote-extracted.mjs              # report only, writes nothing
 *   node scripts/promote-extracted.mjs --write      # merge survivors into funding.json
 *
 * This is the gate between "a model said so" and "the site says so".
 *
 * Every candidate must clear three checks, in increasing order of cost:
 *
 *   1. Schema — the same validateDataset() the build already runs.
 *   2. Duplicate — an id already in funding.json is left alone. Hand-written
 *      records win, because they have been read by a person.
 *   3. Evidence — the source page is re-fetched and the evidence_quote must
 *      genuinely appear on it.
 *
 * The third is the one that matters. A model that invents a deadline cannot
 * usually invent a matching sentence on a page it does not control, so this
 * converts "do I trust the extractor?" into "is this sentence on that page?".
 * Anything that fails is written to data/rejected.json rather than dropped,
 * because a silently discarded record teaches nobody anything — the rejects
 * are the evidence for whether the prompt needs fixing.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { politeFetch } from './lib/polite-fetch.mjs';
import { textOf } from './lib/score.mjs';
import { validateDataset } from '../lib/dataset.ts';

const ROOT = new URL('..', import.meta.url);
const WRITE = process.argv.includes('--write');

const extractedPath = new URL('data/extracted.json', ROOT);
if (!existsSync(extractedPath)) {
  console.error('data/extracted.json not found — run scripts/extract-awards.mjs first');
  process.exit(1);
}

const extracted = JSON.parse(readFileSync(extractedPath, 'utf8'));
const dataset = JSON.parse(readFileSync(new URL('data/funding.json', ROOT), 'utf8'));
const existingIds = new Set(dataset.items.map((i) => i.id));

const norm = (s) =>
  s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&pound;/g, '£')
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-―]/g, '-')
    .replace(/(\d)\s+(st|nd|rd|th)\b/gi, '$1$2')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const kept = [];
const rejected = [];

// ── 1 & 2: cheap checks first, so we only fetch pages worth fetching ──
const worthFetching = [];
for (const item of extracted.items) {
  if (existingIds.has(item.id)) {
    rejected.push({ id: item.id, reason: 'duplicate of an existing record' });
    continue;
  }
  const errs = validateDataset({ status: 'live', generated_at: null, items: [item] });
  if (errs.length) {
    rejected.push({ id: item.id, reason: `schema: ${errs.join('; ')}` });
    continue;
  }
  if (!item.evidence_quote) {
    rejected.push({ id: item.id, reason: 'no evidence quote' });
    continue;
  }
  worthFetching.push(item);
}

// ── 3: evidence, grouped by page so each URL is fetched once ────────────
const byUrl = new Map();
for (const item of worthFetching) {
  if (!byUrl.has(item.source_url)) byUrl.set(item.source_url, []);
  byUrl.get(item.source_url).push(item);
}

console.log(
  `${extracted.items.length} candidates · ${worthFetching.length} to verify across ${byUrl.size} pages\n`,
);

for (const [url, items] of byUrl) {
  const res = await politeFetch(url);
  if (!res.ok || !res.body) {
    for (const it of items) rejected.push({ id: it.id, reason: `source unreachable (HTTP ${res.status})` });
    console.log(`FAIL  ${url} — HTTP ${res.status}`);
    continue;
  }
  const page = norm(textOf(res.body));
  let ok = 0;
  for (const it of items) {
    if (page.includes(norm(it.evidence_quote))) {
      kept.push(it);
      ok++;
    } else {
      rejected.push({ id: it.id, reason: 'evidence quote not found on source page', quote: it.evidence_quote });
    }
  }
  console.log(`${ok === items.length ? 'ok  ' : 'part'}  ${ok}/${items.length}  ${url}`);
}

console.log(`\nverified ${kept.length} · rejected ${rejected.length}`);

const byReason = {};
for (const r of rejected) {
  const k = r.reason.split(':')[0];
  byReason[k] = (byReason[k] ?? 0) + 1;
}
for (const [reason, n] of Object.entries(byReason).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(3)}  ${reason}`);
}

writeFileSync(
  new URL('data/rejected.json', ROOT),
  JSON.stringify(
    {
      $comment:
        'Candidates that failed promotion. Kept rather than dropped: these are the evidence for whether the extraction prompt needs fixing.',
      model: extracted.model,
      generated_at: new Date().toISOString(),
      rejected,
    },
    null,
    2,
  ) + '\n',
);
console.log('→ data/rejected.json');

if (!WRITE) {
  console.log('\n(report only — pass --write to merge the verified records into data/funding.json)');
  process.exit(0);
}

dataset.items.push(...kept);
const errs = validateDataset(dataset);
if (errs.length) {
  console.error(`\nREFUSING TO WRITE — merged dataset is invalid:\n  ${errs.join('\n  ')}`);
  process.exit(1);
}
writeFileSync(new URL('data/funding.json', ROOT), JSON.stringify(dataset, null, 2) + '\n');
console.log(`\nmerged ${kept.length} records → data/funding.json (${dataset.items.length} total)`);
