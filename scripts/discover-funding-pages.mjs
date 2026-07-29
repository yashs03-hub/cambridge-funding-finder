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

const ROOT = new URL('..', import.meta.url);

// ── Signals ────────────────────────────────────────────────────────────
// Weighted: a path segment is a stronger signal than a word in link text,
// and "hardship"/"travel grant" are far more specific than bare "funding".
const STUDENT_TERMS = [
  [/\bhardship\b/, 10],
  [/\btravel\s*grant/, 10],
  [/\bbursar(y|ies)\b/, 8],
  [/\bstudentship/, 7],
  [/\bscholarship/, 6],
  [/\bfinancial\s+(support|assistance|aid)\b/, 8],
  [/\bstudent\s+(funding|finance|support)\b/, 9],
  [/\bfees?\s+and\s+funding\b/, 8],
  [/\bgrants?\b/, 5],
  [/\bprize/, 4],
  [/\bfunding\b/, 4],
  [/\bawards?\b/, 3],
  [/\bfinance\b/, 2],
];

// Subtracted. These are the fundraising side of the same vocabulary.
const DONOR_TERMS = [
  [/\bdonat/, 12],
  [/\bgiving\b/, 12],
  [/\blegac(y|ies)\b/, 10],
  [/\bbequest/, 10],
  [/\bdevelopment\s+(office|team)\b/, 10],
  [/\balumni\b/, 6],
  [/\bsupport\s+(us|the\s+college)\b/, 10],
  [/\bfundrais/, 12],
  [/\bmake\s+a\s+gift\b/, 12],
  [/\bcampaign\b/, 5],
  [/\bbenefact/, 8],
  [/\bendowment\b/, 4],
  [/\bvacanc(y|ies)\b/, 8], // staff pay pages match "salary"/"grant" surprisingly often
];

// Content-level confirmation: does the page actually describe money a
// student can apply for? A real funding page nearly always has an amount
// and an application verb.
const CONTENT_SIGNALS = [
  [/£\s?[\d,]+/, 6],
  [/\bapply\b/i, 4],
  [/\bapplication\b/i, 4],
  [/\bdeadline\b/i, 8],
  [/\beligib/i, 5],
  [/\bclosing\s+date\b/i, 8],
  [/\bper\s+(term|year|annum)\b/i, 3],
];

function score(text, terms) {
  let s = 0;
  for (const [re, w] of terms) if (re.test(text)) s += w;
  return s;
}

/** Strip tags/scripts so content scoring sees prose, not markup. */
function textOf(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ');
}

function extractLinks(html, baseUrl) {
  const out = [];
  const re = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const [, href, inner] = m;
    if (/^(mailto:|tel:|javascript:|#)/i.test(href)) continue;
    let abs;
    try {
      abs = new URL(href, baseUrl);
    } catch {
      continue;
    }
    if (!/^https?:$/.test(abs.protocol)) continue;
    abs.hash = '';
    out.push({ url: abs.href, host: abs.host, path: abs.pathname.toLowerCase(), text: textOf(inner).trim().toLowerCase() });
  }
  return out;
}

function scoreCandidate(link) {
  // The path counts double — /student-funding/ in a URL is a deliberate
  // information-architecture decision; the same words in link text may just
  // be a sentence.
  const pathScore = score(link.path.replace(/[-_/]+/g, ' '), STUDENT_TERMS) * 2;
  const textScore = score(link.text, STUDENT_TERMS);
  const donor =
    score(link.path.replace(/[-_/]+/g, ' '), DONOR_TERMS) * 2 + score(link.text, DONOR_TERMS);
  return pathScore + textScore - donor;
}

const src = readFileSync(new URL('lib/colleges.ts', ROOT), 'utf8');
const seeds = [...src.matchAll(/slug:\s*'([^']+)',\s*name:\s*(["'])(.+?)\2,\s*url:\s*'([^']+)'/g)].map(
  (m) => ({ slug: m[1], name: m[3], url: m[4] }),
);

const only = process.argv.slice(2);
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
  const ranked = extractLinks(home.body, home.url)
    .filter((l) => l.host === host)
    .filter((l) => (seen.has(l.url) ? false : (seen.add(l.url), true)))
    .map((l) => ({ ...l, linkScore: scoreCandidate(l) }))
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
      (top ? `  best(${top.total}) ${top.url}` : '  — none'),
  );
}

mkdirSync(new URL('data', ROOT), { recursive: true });
writeFileSync(
  new URL('data/discovery.json', ROOT),
  JSON.stringify(
    {
      $comment:
        'Phase 1 discover output. Ranked candidates only — a human promotes one to fundingIndexUrl in lib/colleges.ts.',
      generated_at: new Date().toISOString(),
      colleges: results,
    },
    null,
    2,
  ) + '\n',
);

const withCandidates = results.filter((r) => r.candidates.length > 0).length;
console.log(`\n${withCandidates}/${results.length} colleges produced at least one candidate`);
console.log('→ data/discovery.json');
