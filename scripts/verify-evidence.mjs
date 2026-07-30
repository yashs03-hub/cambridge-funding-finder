/**
 * Verify every evidence_quote actually appears on its source page.
 *
 *   node scripts/verify-evidence.mjs
 *
 * The evidence quote is the whole trust mechanism (§4.4): it turns "do I
 * believe this extraction?" — unanswerable — into "does this sentence say what
 * the record says?", answerable in seconds. That only holds if the sentence is
 * really there. A quote that has drifted, been paraphrased, or been invented
 * outright is worse than no quote at all, because it looks like verification.
 *
 * This re-fetches each distinct source_url and checks. It is deliberately NOT
 * part of `npm test`: it makes live requests to 31 colleges' servers, and a
 * college editing its own page is not a reason to fail someone's build. Run it
 * when adding records, and on a schedule alongside the scraper.
 *
 * Matching normalises whitespace and quote characters only. Stripping HTML
 * leaves artefacts — a superscript "th" becomes "15 th May" — so those are
 * normalised too, but nothing else: the point is to catch drift, not to be
 * lenient enough that drift passes.
 */
import { readFileSync } from 'node:fs';
import { politeFetch } from './lib/polite-fetch.mjs';
import { textOf } from './lib/score.mjs';

const ROOT = new URL('..', import.meta.url);
const data = JSON.parse(readFileSync(new URL('data/funding.json', ROOT), 'utf8'));

const norm = (s) =>
  s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&pound;/g, '£')
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-―]/g, '-')
    // "15 th May" -> "15th May": an artefact of stripping <sup> tags.
    .replace(/(\d)\s+(st|nd|rd|th)\b/gi, '$1$2')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const withQuotes = data.items.filter((i) => i.evidence_quote);
const byUrl = new Map();
for (const item of withQuotes) {
  if (!byUrl.has(item.source_url)) byUrl.set(item.source_url, []);
  byUrl.get(item.source_url).push(item);
}

console.log(
  `${withQuotes.length} of ${data.items.length} records carry an evidence quote, across ${byUrl.size} pages\n`,
);

const failures = [];
let checked = 0;

for (const [url, items] of byUrl) {
  const res = await politeFetch(url);
  if (!res.ok || !res.body) {
    for (const it of items) failures.push({ id: it.id, why: `source unreachable (HTTP ${res.status})` });
    console.log(`FAIL  ${url}  HTTP ${res.status}`);
    continue;
  }

  const page = norm(textOf(res.body));
  let ok = 0;
  for (const it of items) {
    checked++;
    if (page.includes(norm(it.evidence_quote))) ok++;
    else failures.push({ id: it.id, why: 'quote not found on page', url });
  }
  console.log(`${ok === items.length ? 'ok  ' : 'FAIL'}  ${ok}/${items.length}  ${url}`);
}

console.log(`\n${checked - failures.length}/${checked} evidence quotes verified against live pages`);

if (failures.length) {
  console.error('\nFailures:');
  for (const f of failures) console.error(`  · ${f.id}: ${f.why}`);
  process.exit(1);
}
