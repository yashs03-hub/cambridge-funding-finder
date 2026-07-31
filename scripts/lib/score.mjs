/**
 * Scoring for the discover stage — extracted so it can be tested.
 *
 * It lives apart from discover-funding-pages.mjs for one concrete reason: the
 * signals below are regex literals, and a regex that silently matches nothing
 * looks identical to a regex that works. During development a shell heredoc
 * ate the word-boundary escapes, turning the news filter into a pattern
 * containing literal backspace characters. Everything still ran, no error was
 * raised, and the filter simply never fired. A test would have failed loudly;
 * reading the source did not.
 */

// Weighted: a path segment is a stronger signal than a word in link text, and
// "hardship"/"travel grant" are far more specific than a bare "funding".
export const STUDENT_TERMS = [
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

/**
 * Subtracted. The fundraising half of the same vocabulary.
 *
 * On a college website "funding" points in two opposite directions: money to
 * a student, and money from a donor. Colleges publish far more of the latter,
 * and it outranks the student pages on any naive keyword match. Without this
 * list the stage confidently returns 31 donation pages.
 */
export const DONOR_TERMS = [
  [/\bdonat/, 12],
  // "donors" is not matched by /\bdonat/ — different stem. Fitzwilliam
  // serves /north-west-bursaries-donors, which scored identically to the
  // real bursary FAQ and got crawled.
  [/\bdonors?\b/, 12],
  [/\bgiving\b/, 12],
  [/\blegac(y|ies)\b/, 10],
  [/\bbequest/, 10],
  [/\bdevelopment\s+(office|team)\b/, 10],
  [/\balumni\b/, 6],
  [/\bsupport\s+(us|the\s+college)\b/, 10],
  [/\bfundrais/, 12],
  // Was /\bmake\s+a\s+gift\b/, which misses "making-gift-support-...".
  // A college page with "gift" in its URL is asking for money, not offering it.
  [/\bgifts?\b/, 12],
  [/\bmaking\s+a?\s*gift/, 12],
  [/\bcampaign\b/, 5],
  [/\bbenefact/, 8],
  [/\bendowment\b/, 4],
  [/\bvacanc(y|ies)\b/, 8],
];

/**
 * Section noise, applied to the URL path only, and used as a HARD exclusion
 * rather than a penalty.
 *
 * A penalty does not survive content scoring. Wolfson's news story about
 * travel grants genuinely lists amounts, eligibility and how to apply, so it
 * earned those points honestly and climbed back to the top of the ranking
 * even after its path was penalised. The page is disqualified by what it is —
 * an article — not by how it reads.
 */
export const NOISE_PATH_TERMS = [
  [/\bnews\b/, 14],
  [/\bblog\b/, 14],
  // Pembroke publishes /travel-grant-reports/ — past recipients trip writeups.
  // Extraction mined it for 29 "awards" that were student names and
  // destinations, every quote verbatim and therefore passing the evidence
  // check. Right vocabulary, wrong kind of page.
  [/\breports?\b/, 12],
  // NOT excluded here: /articles/ and similar. Jesus files a genuine £500
  // essay prize under /articles/ alongside "Professor wins award for
  // mathematical software". A path-level rule cannot separate those, and
  // losing a real award to filter one news item is the worse trade. The
  // extractor decides content type by READING the page, which is the right
  // tool for this — see rule 8 in scripts/extract-awards.mjs.
  [/\brecipients?\b/, 12],
  [/\bevents?\b/, 10],
  [/\bpeople\b/, 10], // /people/tom-grant is a person, not a grant
  [/\bfellows?\b/, 8],
  [/\b(19|20)\d{2}\b/, 4], // dated URLs are archives, not indexes
];

/** Does the page describe money a student can actually apply for? */
export const CONTENT_SIGNALS = [
  [/£\s?[\d,]+/, 6],
  [/\bapply\b/i, 4],
  [/\bapplication\b/i, 4],
  [/\bdeadline\b/i, 8],
  [/\beligib/i, 5],
  [/\bclosing\s+date\b/i, 8],
  [/\bper\s+(term|year|annum)\b/i, 3],
];

export const NOISE_THRESHOLD = 10;

export function score(text, terms) {
  let s = 0;
  for (const [re, w] of terms) if (re.test(text)) s += w;
  return s;
}

const flatten = (path) => path.replace(/[-_/]+/g, ' ');

export function isNoisePath(link) {
  return score(flatten(link.path), NOISE_PATH_TERMS) >= NOISE_THRESHOLD;
}

export function scoreCandidate(link) {
  // The path counts double — /student-funding/ in a URL is a deliberate
  // information-architecture decision; the same words in link text may just
  // be a passing sentence.
  const flat = flatten(link.path);
  const pathScore = score(flat, STUDENT_TERMS) * 2;
  const textScore = score(link.text ?? '', STUDENT_TERMS);
  const donor = score(flat, DONOR_TERMS) * 2 + score(link.text ?? '', DONOR_TERMS);
  return pathScore + textScore - donor;
}


/**
 * Decode HTML entities before any text comparison.
 *
 * This was a silent record-killer. The fetch stage decoded `&#8217;` to a
 * curly apostrophe when writing the cache, so extraction agents read "Tutors'
 * Fund" and quoted it faithfully. The verifier used textOf(), which decoded
 * only `&nbsp;`, so it compared against the literal string "Tutors&#8217;
 * Fund" and found no match — rejecting fourteen perfectly good records as
 * unverifiable.
 *
 * Two code paths reading the same page and disagreeing about what it says is
 * the failure mode; the fix is that they now share one decoder.
 */
export function decodeEntities(text) {
  const named = {
    amp: '&', nbsp: ' ', pound: '£', quot: '"', apos: "'",
    lt: '<', gt: '>', rsquo: '\u2019', lsquo: '\u2018',
    rdquo: '\u201d', ldquo: '\u201c', ndash: '\u2013', mdash: '\u2014',
    hellip: '\u2026', eacute: '\u00e9', deg: '\u00b0',
  };
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => named[n.toLowerCase()] ?? m);
}

/** Strip tags and scripts so content scoring sees prose, not markup. */
export function textOf(html) {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  ).replace(/\s+/g, ' ');
}

/** Absolute, same-protocol links with their anchor text, fragments stripped. */
export function extractLinks(html, baseUrl) {
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
    out.push({
      url: abs.href,
      host: abs.host,
      path: abs.pathname.toLowerCase(),
      text: textOf(inner).trim().toLowerCase(),
    });
  }
  return out;
}
