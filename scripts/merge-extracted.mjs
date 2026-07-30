/**
 * Merge per-college subagent output into the single candidate file that
 * scripts/promote-extracted.mjs consumes.
 *
 *   node scripts/merge-extracted.mjs
 *
 * One subagent per college writes data/extracted/<slug>.json. This flattens
 * those into data/extracted.json, adding the provenance fields the dataset
 * requires and a deterministic id.
 *
 * The `long_tail` flag each agent sets is preserved but NOT used to filter
 * here. Whether large named scholarships belong in a product built for the
 * uncatalogued long tail is a product decision, and burying it inside a merge
 * script is how a product decision becomes an accident.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url);
const DIR = new URL('data/extracted/', ROOT);

if (!existsSync(DIR)) {
  console.error('data/extracted/ not found — run the extraction agents first');
  process.exit(1);
}

const slugify = (s) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);

const NOW = new Date().toISOString();
const files = readdirSync(DIR).filter((f) => f.endsWith('.json'));
const items = [];
const perCollege = [];
let dupes = 0;
const seen = new Set();

for (const f of files) {
  const c = JSON.parse(readFileSync(new URL(f, DIR), 'utf8'));
  let kept = 0;
  for (const a of c.awards ?? []) {
    const id = `${c.slug}-${slugify(a.title)}`;
    if (seen.has(id)) {
      dupes++;
      continue;
    }
    seen.add(id);
    items.push({
      id,
      provider_id: c.slug,
      provider_name: c.provider_name,
      title: a.title,
      type: a.type,
      description: a.description,
      eligibility_text: a.eligibility_text ?? null,
      eligibility_tags: a.eligibility_tags ?? [],
      amount_text: a.amount_text ?? null,
      deadline_type: a.deadline_type,
      deadline_date: a.deadline_date ?? null,
      deadline_recurrence: a.deadline_recurrence ?? null,
      application_method: a.application_method ?? null,
      source_url: a.source_url,
      evidence_quote: a.evidence_quote,
      long_tail: a.long_tail !== false,
      status: 'approved',
      confidence: null,
      last_scraped_at: NOW,
      last_verified_at: NOW,
    });
    kept++;
  }
  perCollege.push({
    slug: c.slug,
    name: c.provider_name,
    awards: kept,
    longTail: (c.awards ?? []).filter((a) => a.long_tail !== false).length,
    honours_omitted: c.honours_omitted ?? 0,
    external_omitted: c.external_omitted ?? 0,
    pages_skipped: c.pages_skipped ?? 0,
  });
}

writeFileSync(
  new URL('data/extracted.json', ROOT),
  JSON.stringify(
    {
      $comment:
        'CANDIDATES merged from data/extracted/*.json. Not the dataset — run scripts/promote-extracted.mjs.',
      model: 'subagent-per-college',
      generated_at: NOW,
      status: 'live',
      items,
    },
    null,
    2,
  ) + '\n',
);

for (const c of perCollege) {
  console.log(
    `${c.name.padEnd(24)} ${String(c.awards).padStart(3)} awards ` +
      `(${c.longTail} long tail) · omitted ${c.honours_omitted} honours, ` +
      `${c.external_omitted} external, ${c.pages_skipped} pages`,
  );
}

const t = perCollege.reduce(
  (a, c) => ({
    awards: a.awards + c.awards,
    tail: a.tail + c.longTail,
    hon: a.hon + c.honours_omitted,
    ext: a.ext + c.external_omitted,
  }),
  { awards: 0, tail: 0, hon: 0, ext: 0 },
);
console.log(
  `\n${t.awards} candidates from ${perCollege.length} colleges · ${t.tail} long tail · ` +
    `omitted ${t.hon} honours, ${t.ext} external`,
);
if (dupes) console.log(`${dupes} duplicate id(s) dropped within the batch`);
console.log('→ data/extracted.json');
