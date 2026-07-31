/**
 * Phase 2 — fetch: pull the readable text of each college's funding pages.
 *
 *   node scripts/fetch-funding-pages.mjs           # every college in discovery.json
 *   node scripts/fetch-funding-pages.mjs jesus     # named slugs
 *
 * Reads data/discovery.json, takes each college's top-ranked candidate, follows
 * its funding-shaped child links one level, and writes plain text per page to
 * .cache/pages/<slug>/. Nothing here calls a model: this is the deterministic
 * half of extraction, so it can be re-run freely and diffed, and the expensive
 * half only ever sees text that a human can also read.
 *
 * Output is gitignored. It is a cache of someone else's website, not our data —
 * the record of what we believe lives in data/funding.json, backed by an
 * evidence_quote that can be checked against the source URL directly.
 *
 * PDFs are recorded but not parsed. A college that publishes its travel grant
 * rules only as a PDF is a real case (Churchill disallows two such files in
 * robots.txt), and silently dropping them would leave no trace that the page
 * was ever seen. They are listed in the manifest with a note instead.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { politeFetch } from './lib/polite-fetch.mjs';
import { extractLinks, isNoisePath, scoreCandidate, textOf } from './lib/score.mjs';

const ROOT = new URL('..', import.meta.url);
const OUT = new URL('.cache/pages/', ROOT);

/** How many child pages to follow from a college's funding index. */
const MAX_CHILDREN = 8;

/**
 * --deep: start from EVERY ranked candidate, not just the top one.
 *
 * The default takes candidates[0] and follows its children, which is right
 * when a college has one real funding index. It is wrong when the index is a
 * signpost: Fitzwilliam's top page says "bursaries, book grants and travel
 * awards… click here" and nothing else, so a single-page fetch produced one
 * page of prose and extraction correctly returned zero awards. The funding was
 * one hop away the whole time.
 *
 * Zero-yield colleges are therefore re-fetched with --deep before anyone
 * concludes the college offers nothing. "We did not look hard enough" and
 * "there is nothing there" must not look the same.
 */
const DEEP = process.argv.includes('--deep');
const MAX_ROOTS = DEEP ? 5 : 1;
/** A child link must still look like funding to be worth a request. */
const CHILD_MIN_SCORE = 4;

/** Readable text, with block elements becoming newlines so lists survive. */
function readable(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(li|p|h[1-6]|div|br|tr|dt|dd)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&pound;/g, '£')
    .replace(/&#0?39;|&rsquo;|&#8217;/g, '’')
    .replace(/&quot;|&#8220;|&#8221;/g, '"')
    .replace(/&#8211;|&ndash;/g, '–')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

/**
 * Strip the navigation that dominates a college page.
 *
 * Newnham's grants page is 33k characters, of which the first 8k are a site-wide
 * menu listing every subject and building. Left in, it drowns the awards in
 * boilerplate and makes every page look similar to every other. The breadcrumb
 * is a reliable seam on these CMSs; failing that, fall back to the whole text
 * rather than guess and silently truncate real content.
 */
function trimNav(text) {
  const seams = [/\bBreadcrumb\b/i, /\bYou are here\b/i, /\bSkip to main content\b/i];
  for (const seam of seams) {
    const m = text.match(seam);
    if (m && m.index != null && text.length - m.index > 400) {
      return text.slice(m.index + m[0].length).trim();
    }
  }
  return text;
}

const discovery = JSON.parse(readFileSync(new URL('data/discovery.json', ROOT), 'utf8'));
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const targets = only.length
  ? discovery.colleges.filter((c) => only.includes(c.slug))
  : discovery.colleges;

if (!targets.length) {
  console.error(`No colleges matched: ${only.join(', ')}`);
  process.exit(1);
}

const manifest = [];

for (const college of targets) {
  const roots = college.candidates.slice(0, MAX_ROOTS);
  const top = roots[0];
  if (!top) {
    console.log(`skip    ${college.name} — no candidate`);
    manifest.push({ slug: college.slug, name: college.name, pages: [], note: 'no candidate' });
    continue;
  }

  const dir = new URL(`${college.slug}/`, OUT);
  mkdirSync(dir, { recursive: true });

  const pages = [];
  const pdfs = [];
  const queue = roots.map((r) => r.url);
  const seen = new Set(queue);

  const index = await politeFetch(top.url);
  if (!index.ok) {
    console.log(`FAIL    ${college.name} — index HTTP ${index.status}`);
    manifest.push({
      slug: college.slug,
      name: college.name,
      pages: [],
      note: `index HTTP ${index.status}`,
    });
    continue;
  }

  // Children of the index page, ranked, so a college that splits every award
  // onto its own page is followed rather than reduced to a table of contents.
  const host = new URL(index.url).host;
  const children = extractLinks(index.body, index.url)
    .filter((l) => l.host === host)
    .filter((l) => !seen.has(l.url))
    .filter((l) => !isNoisePath(l))
    .map((l) => ({ ...l, s: scoreCandidate(l) }))
    .filter((l) => l.s >= CHILD_MIN_SCORE)
    .sort((a, b) => b.s - a.s);

  for (const c of children) {
    if (seen.has(c.url) || queue.length > MAX_CHILDREN) continue;
    seen.add(c.url);
    queue.push(c.url);
  }

  for (const [i, url] of queue.entries()) {
    const res = i === 0 ? index : await politeFetch(url);
    if (res.contentType.includes('pdf') || /\.pdf($|\?)/i.test(url)) {
      pdfs.push(url);
      continue;
    }
    if (!res.ok || !res.body) continue;

    const text = trimNav(readable(res.body));
    if (text.length < 200) continue;

    const name = `${String(i).padStart(2, '0')}-${
      new URL(url).pathname.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(-60) || 'index'
    }.txt`;
    writeFileSync(new URL(name, dir), `${url}\n\n${text}\n`);

    const money = (text.match(/£\s?[\d,]+/g) ?? []).length;
    pages.push({ url, file: `${college.slug}/${name}`, chars: text.length, moneyMentions: money });
  }

  manifest.push({ slug: college.slug, name: college.name, indexUrl: top.url, pages, pdfs });
  const totalMoney = pages.reduce((s, p) => s + p.moneyMentions, 0);
  console.log(
    `ok      ${college.name.padEnd(26)} ${String(pages.length).padStart(2)} pages, ` +
      `${String(totalMoney).padStart(3)} money mentions` +
      (pdfs.length ? `, ${pdfs.length} PDF${pdfs.length === 1 ? '' : 's'} not parsed` : ''),
  );
}

mkdirSync(OUT, { recursive: true });
writeFileSync(
  new URL('manifest.json', OUT),
  JSON.stringify({ generated_at: new Date().toISOString(), colleges: manifest }, null, 2) + '\n',
);

const totals = manifest.reduce(
  (a, c) => ({
    pages: a.pages + (c.pages?.length ?? 0),
    money: a.money + (c.pages ?? []).reduce((s, p) => s + p.moneyMentions, 0),
    pdfs: a.pdfs + (c.pdfs?.length ?? 0),
  }),
  { pages: 0, money: 0, pdfs: 0 },
);
console.log(
  `\n${manifest.length} colleges · ${totals.pages} pages · ${totals.money} money mentions · ${totals.pdfs} PDFs recorded but not parsed`,
);
console.log('→ .cache/pages/ (gitignored)');
