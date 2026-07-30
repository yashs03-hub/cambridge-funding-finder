/**
 * Phase 3 — extract: turn cached page text into candidate funding records.
 *
 *   node scripts/extract-awards.mjs                 # every cached college
 *   node scripts/extract-awards.mjs girton pembroke # named slugs
 *   EXTRACT_MODEL=gpt-5.4 node scripts/extract-awards.mjs
 *
 * Writes data/extracted.json — CANDIDATES, not the dataset. Nothing here is
 * trusted: scripts/verify-evidence.mjs re-fetches each source page and rejects
 * any record whose evidence_quote is not genuinely on it, and only what
 * survives is promoted into data/funding.json.
 *
 * That ordering is the whole design. A model that invents a deadline usually
 * cannot invent a matching sentence on a page it does not control, so the
 * check is cheap and the failure mode it catches — a plausible fabricated
 * award a student acts on — is the worst one this product has (§11).
 *
 * The prompt below is mostly a list of mistakes already made by hand. Each
 * rule corresponds to a wrong record that was caught in review:
 *   · a University fund recorded as a college's own
 *   · a Governing Body honour listed as something to apply for
 *   · a source typo silently tidied inside a "verbatim" quote
 *   · a fixed deadline asserted from a page that never gave a date
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { generateJSON, providerFor } from './lib/llm.mjs';

const ROOT = new URL('..', import.meta.url);
const CACHE = new URL('.cache/pages/', ROOT);
// Default is a flash tier deliberately: on this account the Gemini pro models
// report limit 0, and per-page extraction makes model strength matter less
// than the promotion gate does.
const MODEL = process.env.EXTRACT_MODEL || 'gemini-3-flash-preview';

/** Per-PAGE input cap. Counted and reported, never silently applied. */
const MAX_CHARS = 30_000;

const SYSTEM = `You extract student funding awards from the text of Cambridge college web pages.

You are building a public listing that students rely on to decide where to apply. A plausible but wrong record is far worse than a missing one: it costs a student an application they cannot get back. When in doubt, omit the award or record less about it.

RULES

1. EVIDENCE QUOTES ARE VERBATIM.
   Copy the supporting sentence character for character from the supplied text, including any typos, doubled spaces or missing spaces. Do not tidy, paraphrase, correct or join sentences. If you cannot copy an exact sentence, you may not make the claim it would support.

2. ONLY THIS COLLEGE'S OWN FUNDING.
   These pages routinely list University-wide funds, NHS bursaries, government support and external charities alongside the college's own awards. Record ONLY awards the college itself offers. If a fund is described as University-wide, external, national, or is administered by another college, omit it entirely. Recording someone else's fund under this college tells students elsewhere they cannot apply, which is false.

3. OMIT THE CENTRAL SCHEMES.
   The Cambridge Bursary Scheme, student loans, Disabled Students' Allowance and NHS bursaries are already indexed centrally. Skip them.

4. ONLY AWARDS A STUDENT CAN APPLY FOR.
   Many colleges list prizes "awarded by the Governing Body" where "applications are not required". These are honours, not opportunities. Omit them, and count them in honours_omitted.

5. DEADLINES ARE CLAIMS AND NEED EVIDENCE.
   deadline_type must be one of:
   · "fixed" — ONLY if the text gives an explicit calendar date including the year. Put it in deadline_date as YYYY-MM-DD and quote the sentence containing it.
   · "annual_recurring" — the award recurs on a stated cycle without a full date, e.g. "each term", "by 1 June each year", "from 1 January". Put the cycle in deadline_recurrence, in the source's own words, and quote the sentence stating it.
   · "rolling" — the text explicitly says applications are accepted at any time.
   · "unknown" — anything else, INCLUDING when a deadline obviously exists but the page does not state it. This is a normal, correct answer. Never guess a date.

6. DO NOT INVENT AMOUNTS.
   amount_text must be a faithful short rendering of what the page says, or null. Never estimate.

7. TITLES ARE THE PAGE'S OWN NAMES.
   Use the award's name as written. Do not invent a tidy generic title.

8. SOME PAGES CONTAIN NO AWARDS AT ALL. RETURNING ZERO IS CORRECT.
   Pages that list past recipients, student trip reports, news stories, staff
   profiles or archives use exactly the same vocabulary as funding pages, and
   quoting from them produces records that look verifiable and are worthless.
   "Ahrandeep Aujla - Medical elective in Japan, Summer 2016" is a student who
   once received a grant, not a grant.

   Before extracting anything, decide what the page IS. If it is a report,
   recipient list, news item, archive or profile, return an empty awards array
   and set not_an_award_page to true. Do not extract "just in case".

   An award is something a current student could apply for or be considered
   for in future. If a heading names a person or a past year, that is a record
   of an outcome, not an opportunity.`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['awards', 'honours_omitted', 'external_omitted', 'not_an_award_page'],
  properties: {
    awards: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'title',
          'type',
          'description',
          'eligibility_text',
          'eligibility_tags',
          'amount_text',
          'deadline_type',
          'deadline_date',
          'deadline_recurrence',
          'application_method',
          'evidence_quote',
        ],
        properties: {
          title: { type: 'string' },
          type: {
            type: 'string',
            enum: ['travel', 'hardship', 'grant', 'prize', 'bursary', 'scholarship'],
          },
          description: { type: 'string' },
          eligibility_text: { type: ['string', 'null'] },
          eligibility_tags: { type: 'array', items: { type: 'string' } },
          amount_text: { type: ['string', 'null'] },
          deadline_type: {
            type: 'string',
            enum: ['fixed', 'annual_recurring', 'rolling', 'unknown'],
          },
          deadline_date: { type: ['string', 'null'] },
          deadline_recurrence: { type: ['string', 'null'] },
          application_method: { type: ['string', 'null'] },
          evidence_quote: { type: 'string' },
        },
      },
    },
    honours_omitted: { type: 'integer' },
    external_omitted: { type: 'integer' },
    not_an_award_page: { type: 'boolean' },
  },
};

const slugify = (s) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);

const manifest = JSON.parse(readFileSync(new URL('manifest.json', CACHE), 'utf8'));
const only = process.argv.slice(2);
const targets = only.length
  ? manifest.colleges.filter((c) => only.includes(c.slug))
  : manifest.colleges;

if (!targets.length) {
  console.error(`No cached colleges matched: ${only.join(', ')}`);
  process.exit(1);
}

console.log(`model: ${MODEL} (${providerFor(MODEL)})\n`);

const out = [];
const stats = { honours: 0, external: 0, truncated: 0, nonAwardPages: 0, failed: [], inTok: 0, outTok: 0 };

for (const college of targets) {
  if (!college.pages?.length) {
    console.log(`skip    ${college.name} — no cached pages`);
    continue;
  }

  const dir = new URL(`${college.slug}/`, CACHE);
  const files = readdirSync(dir).filter((f) => f.endsWith('.txt'));

  let collegeAwards = 0;
  let skippedPages = 0;

  // One request per page. A whole college at once was 70-82k characters and
  // blew the request timeout while producing nothing; a page is ~12k and
  // returns in well under a minute. Failures also stay isolated to one page.
  for (const f of files) {
    const raw = readFileSync(new URL(f, dir), 'utf8');
    const [urlLine, ...rest] = raw.split('\n');
    const url = urlLine.trim();
    let text = rest.join('\n').trim();
    if (text.length > MAX_CHARS) {
      text = text.slice(0, MAX_CHARS);
      stats.truncated++;
    }
    if (text.length < 200) continue;

    const user = `College: ${college.name}
Page URL: ${url}

${text}`;

    let result;
    try {
      const { data, usage } = await generateJSON({
        model: MODEL,
        system: SYSTEM,
        user,
        schema: SCHEMA,
      });
      result = data;
      stats.inTok += usage.promptTokenCount ?? usage.prompt_tokens ?? 0;
      stats.outTok += usage.candidatesTokenCount ?? usage.completion_tokens ?? 0;
    } catch (err) {
      stats.failed.push(`${college.slug}/${f}: ${err.message}`);
      continue;
    }

    stats.honours += result.honours_omitted ?? 0;
    stats.external += result.external_omitted ?? 0;

    if (result.not_an_award_page) {
      skippedPages++;
      stats.nonAwardPages++;
      continue;
    }

    for (const a of result.awards ?? []) {
      out.push({
        id: `${college.slug}-${slugify(a.title)}`,
        provider_id: college.slug,
        provider_name: college.name,
        ...a,
        source_url: url,
        status: 'approved',
        confidence: null,
        last_scraped_at: manifest.generated_at,
        last_verified_at: manifest.generated_at,
      });
      collegeAwards++;
    }
  }

  console.log(
    `ok      ${college.name.padEnd(26)} ${String(collegeAwards).padStart(3)} awards from ` +
      `${files.length} pages` +
      (skippedPages ? `  (${skippedPages} not award pages)` : ''),
  );
}

writeFileSync(
  new URL('data/extracted.json', ROOT),
  JSON.stringify(
    {
      $comment:
        'CANDIDATE records from scripts/extract-awards.mjs. Not the dataset. Run scripts/verify-evidence.mjs --file data/extracted.json --prune, then promote what survives into data/funding.json.',
      model: MODEL,
      generated_at: new Date().toISOString(),
      status: 'live',
      items: out,
    },
    null,
    2,
  ) + '\n',
);

console.log(`\n${out.length} candidate awards from ${targets.length} colleges`);
console.log(
  `omitted: ${stats.honours} non-applicable honours, ${stats.external} external/University funds, ` +
    `${stats.nonAwardPages} pages that contained no awards`,
);
if (stats.truncated) console.log(`input truncated for ${stats.truncated} college(s) at ${MAX_CHARS} chars`);
if (stats.failed.length) console.log(`failed: ${stats.failed.length}\n  ` + stats.failed.join('\n  '));
console.log(`tokens: ${stats.inTok} in, ${stats.outTok} out`);
console.log('→ data/extracted.json  (candidates — verify before promoting)');
