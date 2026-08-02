/**
 * Phase 1 — discover: find each college's funding page(s).
 *
 *   node scripts/discover-funding-pages.mjs            # all 31
 *   node scripts/discover-funding-pages.mjs trinity chu # named slugs
 *
 * Writes data/discovery.json — a ranked candidate list per college. It does
 * NOT write lib/colleges.ts; a human promotes a candidate to fundingIndexUrl,
 * because a wrong funding URL sends the crawler somewhere plausible and
 * silently wrong, which is worse than no hint at all.
 *
 * ── The false positive that defines this stage ──────────────────────────
 * On a Cambridge college website the word "funding" points in two opposite
 * directions. Students look for money coming TO them (travel grants, hardship
 * funds). Colleges publish far more about money coming FROM you — alumni
 * giving, development campaigns, legacies, "support the College". Those pages
 * outrank the student ones on almost every naive keyword match, because
 * fundraising teams write more copy and buy better site placement.
 *
 * So scoring is two-sided: DONOR_TERMS actively subtract. Without that, this
 * script confidently returns 31 donation pages.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { politeFetch, robotsFor } from './lib/polite-fetch.mjs';
import { sitemapUrls, secondLevelUrls } from './lib/deep-discover.mjs';
import {
  CONTENT_SIGNALS,
  isNoisePath,
  score,
  scoreCandidate,
  textOf,
  extractLinks,
} from './lib/score.mjs';

/**
 * Below this score the homepage pass has not really found anything — the top
 * hit at Selwyn (18) and Wolfson (13) was a news article about someone winning
 * an award. Those trigger the sitemap / second-level fallback.
 */
const WEAK_SCORE = 30;

const ROOT = new URL('..', import.meta.url);

// Signals and scoring live in ./lib/score.mjs so they can be unit-tested.

/**
 * Seed source. Defaults to the colleges; --seeds points it at another file of
 * the same shape (lib/departments.ts) so the department pilot reuses this
 * stage rather than forking it. --out keeps the two result files apart, since
 * merging departments into data/discovery.json would make "31 colleges on
 * file" quietly untrue.
 */
const seedsArg = process.argv.indexOf('--seeds');
const seedsFile = seedsArg > -1 ? process.argv[seedsArg + 1] : 'lib/colleges.ts';
const outArg = process.argv.indexOf('--out');
const outFile = outArg > -1 ? process.argv[outArg + 1] : 'data/discovery.json';

const src = readFileSync(new URL(seedsFile, ROOT), 'utf8');
const seeds = [...src.matchAll(/slug:\s*'([^']+)',\s*name:\s*(["'])(.+?)\2,\s*url:\s*'([^']+)'/g)].map(
  (m) => ({ slug: m[1], name: m[3], url: m[4] }),
);

// Strip flags AND their values, so --seeds lib/departments.ts is not read as
// two provider slugs.
const flagValues = new Set([seedsFile, outFile]);
const only = process.argv
  .slice(2)
  .filter((a) => !a.startsWith("--") && !flagValues.has(a));
const targets = only.length ? seeds.filter((s) => only.includes(s.slug)) : seeds;
if (!targets.length) {
  console.error(`No colleges matched: ${only.join(', ')}`);
  process.exit(1);
}

const results = [];

for (const college of targets) {
  const origin = new URL(college.url).origin;
  const robots = await robotsFor(origin);
  const row = {
    slug: college.slug,
    name: college.name,
    url: college.url,
    robots: {
      crawlDelayMs: robots.delayMs,
      namesUsExplicitly: robots.matchedNamedGroup,
      disallowRules: robots.rules.filter((r) => !r.allow).length,
    },
    candidates: [],
    fallback: null,
    note: null,
  };

  const home = await politeFetch(college.url);
  if (home.blocked) {
    row.note = 'robots.txt disallows the homepage';
    results.push(row);
    console.log(`BLOCKED ${college.name}`);
    continue;
  }
  if (!home.ok) {
    row.note = `homepage HTTP ${home.status}${home.error ? ` (${home.error})` : ''}`;
    results.push(row);
    console.log(`FAIL    ${college.name}  ${row.note}`);
    continue;
  }

  const host = new URL(home.url).host;
  const seen = new Set();
  let pool = extractLinks(home.body, home.url)
    .filter((l) => l.host === host)
    .filter((l) => (seen.has(l.url) ? false : (seen.add(l.url), true)))
    .map((l) => ({ ...l, linkScore: scoreCandidate(l) }));

  let best = Math.max(0, ...pool.map((l) => l.linkScore));

  // Fallback for the colleges that simply do not put funding in their top-level
  // navigation. This is a crawl-depth gap, not a scoring one, so the answer is
  // more URLs rather than looser keywords — loosening them here would just
  // promote the donation pages the scoring exists to reject.
  if (best < WEAK_SCORE) {
    const origin = new URL(home.url).origin;
    let extra = await sitemapUrls(origin);
    row.fallback = extra.length ? 'sitemap' : null;

    // A sitemap that only lists news (Wolfson's is 487 bytes and post-heavy)
    // is not a useful answer, so fall through to the nav crawl as well.
    const bestOf = (urls) =>
      Math.max(0, ...urls.map((u) => {
        try {
          const p = new URL(u).pathname.toLowerCase();
          return scoreCandidate({ url: u, host, path: p, text: '' });
        } catch {
          return 0;
        }
      }));

    if (!extra.length || bestOf(extra) < WEAK_SCORE) {
      const nav = await secondLevelUrls(origin, home.body);
      if (nav.length) {
        extra = extra.concat(nav);
        row.fallback = row.fallback ? 'sitemap+second-level' : 'second-level';
      } else if (!extra.length) {
        row.fallback = 'none';
      }
    }

    for (const url of extra) {
      if (seen.has(url)) continue;
      seen.add(url);
      let u;
      try {
        u = new URL(url);
      } catch {
        continue;
      }
      if (u.host !== host) continue;
      // No anchor text from a sitemap, so the path carries the whole signal.
      const link = { url: u.href, host: u.host, path: u.pathname.toLowerCase(), text: '' };
      pool.push({ ...link, linkScore: scoreCandidate(link) });
    }
    best = Math.max(0, ...pool.map((l) => l.linkScore));
  }

  // Count what we drop rather than dropping it quietly — a silent filter
  // reads as "this college has no funding page" when it may mean the opposite.
  const noisy = pool.filter((l) => isNoisePath(l) && l.linkScore > 0).length;
  row.droppedNoisePaths = noisy;

  const ranked = pool
    .filter((l) => !isNoisePath(l))
    .filter((l) => l.linkScore > 0)
    .sort((a, b) => b.linkScore - a.linkScore)
    .slice(0, 6);

  // Confirm the top few by reading them. A link can look right and land on
  // a page with no awards on it at all.
  for (const cand of ranked.slice(0, 4)) {
    const page = await politeFetch(cand.url);
    let contentScore = 0;
    let title = null;
    if (page.ok && page.body) {
      const body = textOf(page.body);
      contentScore = score(body, CONTENT_SIGNALS) + Math.min(6, (body.match(/£\s?[\d,]+/g) ?? []).length);
      title = (page.body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').trim().slice(0, 120) || null;
    }
    cand.contentScore = contentScore;
    cand.total = cand.linkScore + contentScore;
    cand.title = title;
    cand.httpStatus = page.status;
    cand.blocked = page.blocked;
  }

  row.candidates = ranked
    .map((c) => ({
      url: c.url,
      text: c.text.slice(0, 80),
      title: c.title ?? null,
      linkScore: c.linkScore,
      contentScore: c.contentScore ?? null,
      total: c.total ?? c.linkScore,
      httpStatus: c.httpStatus ?? null,
      blocked: c.blocked ?? false,
    }))
    .sort((a, b) => b.total - a.total);

  results.push(row);
  const top = row.candidates[0];
  console.log(
    `ok      ${college.name.padEnd(28)} ${row.candidates.length} cand` +
      (row.fallback ? ` [${row.fallback}]` : '') +
      (top ? `  best(${top.total}) ${top.url}` : '  — none'),
  );
}

mkdirSync(new URL('data', ROOT), { recursive: true });
const outPath = new URL(outFile, ROOT);

// Merge rather than overwrite. Running the script for two named colleges used
// to replace the whole file with those two, so a targeted re-run silently
// deleted the other twenty-nine — and the result still looked like a valid
// discovery file. Re-running one college must never shrink the record.
let previous = [];
try {
  previous = JSON.parse(readFileSync(outPath, 'utf8')).colleges ?? [];
} catch {
  /* first run */
}

const bySlug = new Map(previous.map((c) => [c.slug, c]));
for (const r of results) bySlug.set(r.slug, r);

const order = new Map(seeds.map((s, i) => [s.slug, i]));
const merged = [...bySlug.values()].sort(
  (a, b) => (order.get(a.slug) ?? 999) - (order.get(b.slug) ?? 999),
);

writeFileSync(
  outPath,
  JSON.stringify(
    {
      $comment:
        'Phase 1 discover output. Ranked candidates only — a human promotes one to fundingIndexUrl in lib/colleges.ts.',
      generated_at: new Date().toISOString(),
      colleges: merged,
    },
    null,
    2,
  ) + '\n',
);

const withCandidates = results.filter((r) => r.candidates.length > 0).length;
console.log(`\n${withCandidates}/${results.length} colleges produced at least one candidate`);
console.log(
  `→ ${outFile} (${merged.length} colleges on file${
    merged.length > results.length ? `, ${merged.length - results.length} kept from a previous run` : ''
  })`,
);
