import type { FundingItem } from './types';
import { describeDeadline } from './format.ts';

/**
 * Retrieval for the assistant (§6, stage 1).
 *
 * Deterministic text matching over the committed dataset. No embeddings, no
 * vector store, no second vendor.
 *
 * That is a considered choice, not a shortcut. The spec's §5 specified
 * pgvector, but the corpus is ~450 records that live in memory as a JSON
 * import; an exhaustive scan costs microseconds. Embeddings would buy fuzzy
 * synonym matching in exchange for a second API key, a second provider
 * outage surface, an index to rebuild on every scrape, and a class of failure
 * where a wrong answer is unexplainable. Here, if the wrong award ranks first,
 * the reason is inspectable and fixable.
 *
 * Revisit if departments land and the corpus grows an order of magnitude.
 */

/**
 * Words that are semantically empty REGARDLESS of the corpus.
 *
 * This list and the IDF weighting below do different jobs, and both are
 * needed. IDF demotes words that are uninformative *here* — "support" appears
 * in 136 of 449 records, "year" in 139 — and self-corrects as the data grows.
 * But "please" appears in only 8 records, so IDF rates it highly rare and
 * therefore highly meaningful. It is not. Politeness and filler have to be
 * named explicitly; frequency cannot detect them.
 */
const STOPWORDS = new Set([
  'a', 'an', 'and', 'any', 'am', 'are', 'as', 'at', 'be', 'been', 'but', 'by',
  'can', 'could', 'do', 'does', 'for', 'from', 'get', 'go', 'going', 'have',
  'help', 'how', 'i', 'if', 'in', 'is', 'it', 'me', 'my', 'need', 'of', 'on',
  'or', 'so', 'some', 'that', 'the', 'their', 'there', 'this', 'to', 'want',
  'was', 'what', 'when', 'where', 'which', 'who', 'will', 'with', 'would',
  'you', 'your', 'college', 'cambridge', 'university', 'student', 'students',
  // Politeness and filler: rare enough that IDF would rank them as signal.
  'please', 'thanks', 'thank', 'kindly', 'hello', 'just', 'also', 'really',
  'maybe', 'perhaps', 'anyone', 'anything', 'something', 'bit', 'lot',
  'funding', 'fund', 'funds', 'money', 'apply', 'application', 'looking',
]);

/**
 * Query words that imply a funding type. Matching one boosts records of that
 * type, because "I need help with rent" should surface hardship funds even
 * though no record contains the word "rent".
 */
const TYPE_HINTS: Array<[RegExp, FundingItem['type'][]]> = [
  [/\b(?:travel|abroad|overseas|flight|fieldwork|conference|elective|trip|vacation)/, ['travel']],
  [/\b(?:hardship|emergency|rent|struggling|crisis|debt|afford|poverty|broke|urgent)/, ['hardship']],
  [/\b(?:book|equipment|laptop|software|material|stethoscope|instrument)/, ['grant']],
  [/\b(?:prize|essay|competition|award for|achievement)/, ['prize']],
  [/\b(?:scholarship|studentship|phd|masters|mphil|doctoral)/, ['scholarship', 'bursary']],
  [/\b(?:music|choral|organ|instrumental|sing)/, ['grant', 'prize']],
  [/\b(?:sport|rowing|rugby|football|athletics|blues)/, ['grant']],
  [/\b(?:language|culp|translation)/, ['grant']],
];

export interface Scored {
  item: FundingItem;
  score: number;
  /** Why it matched — surfaced in dev and useful when a result looks wrong. */
  reasons: string[];
}

export function tokenise(text: string): string[] {
  return [
    ...new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 2 && !STOPWORDS.has(w)),
    ),
  ];
}

/**
 * How rare each query word is in the corpus.
 *
 * A hand-written stopword list cannot keep up with the data. "please" appears
 * in 8 of 449 records, but "support" appears in 136 and "year" in 139 — a
 * student typing "I need support this year" would otherwise match a third of
 * the corpus on words carrying no information. Weighting by inverse document
 * frequency makes that self-correcting: a word common in THIS corpus stops
 * counting, whatever it is, and the weights re-derive when the data changes.
 *
 * Cached per item-array, which in practice means computed once at boot: the
 * dataset is a static JSON import.
 */
const idfCache = new WeakMap<object, Map<string, number>>();

function idfFor(items: FundingItem[]): Map<string, number> {
  const hit = idfCache.get(items);
  if (hit) return hit;

  const df = new Map<string, number>();
  for (const item of items) {
    const words = new Set(
      `${item.title} ${item.description} ${item.eligibility_text ?? ''} ${item.eligibility_tags.join(' ')}`
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 2),
    );
    for (const w of words) df.set(w, (df.get(w) ?? 0) + 1);
  }

  const n = Math.max(1, items.length);
  const idf = new Map<string, number>();
  for (const [w, count] of df) {
    // Normalised to roughly 0..1: a word in every record scores 0, a word in
    // one record scores ~1.
    idf.set(w, Math.max(0, Math.log(n / count) / Math.log(n)));
  }
  idfCache.set(items, idf);
  return idf;
}

/** Summed rarity of the query words present in a field. */
function weightedHits(haystack: string, words: string[], idf: Map<string, number>): number {
  const h = haystack.toLowerCase();
  let total = 0;
  for (const w of words) {
    if (!h.includes(w)) continue;
    // A word absent from the corpus is maximally rare, not free: a student
    // naming something we do not have should not silently match everything.
    total += idf.get(w) ?? 1;
  }
  return total;
}

/**
 * Rank the dataset against a free-text need.
 *
 * Closed awards are excluded outright. The listing shows them — a student
 * seeing "Closed 15 Mar" learns something real — but a shortlist has five
 * slots and spending one on an award nobody can apply for is the single most
 * useless thing this product could do.
 */
export function retrieve(items: FundingItem[], query: string, limit = 40, now = new Date()): Scored[] {
  const words = tokenise(query);
  if (words.length === 0) return [];

  const hintedTypes = new Set<FundingItem['type']>();
  for (const [re, types] of TYPE_HINTS) {
    if (re.test(query.toLowerCase())) for (const t of types) hintedTypes.add(t);
  }

  const idf = idfFor(items);
  const scored: Scored[] = [];

  for (const item of items) {
    if (describeDeadline(item.deadline_type, item.deadline_date, now, item.deadline_recurrence).state === 'closed') {
      continue;
    }

    let score = 0;
    const reasons: string[] = [];

    const titleHits = weightedHits(item.title, words, idf);
    if (titleHits) {
      score += titleHits * 6;
      reasons.push(`title ${titleHits.toFixed(2)}`);
    }

    const tagHits = weightedHits(item.eligibility_tags.join(' '), words, idf);
    if (tagHits) {
      score += tagHits * 4;
      reasons.push(`tags ${tagHits.toFixed(2)}`);
    }

    const descHits = weightedHits(item.description, words, idf);
    if (descHits) {
      score += descHits * 2;
      reasons.push(`description ${descHits.toFixed(2)}`);
    }

    const eligHits = weightedHits(item.eligibility_text ?? '', words, idf);
    if (eligHits) {
      score += eligHits * 2;
      reasons.push(`eligibility ${eligHits.toFixed(2)}`);
    }

    // A student who names their college means it.
    if (weightedHits(item.provider_name, words, idf)) {
      score += 10;
      reasons.push('college named');
    }

    if (hintedTypes.has(item.type)) {
      score += 5;
      reasons.push(`type ${item.type} implied`);
    }

    // Fractional now, so require more than noise. A record matching only on
    // corpus-common words scores near zero and is correctly dropped.
    if (score < 0.5) continue;

    // The product's premise: the long tail is what cannot be found elsewhere.
    // A small nudge, not a thumb on the scale — a large scholarship that
    // genuinely matches should still outrank a marginal small one.
    if (item.long_tail) {
      score += 2;
      reasons.push('long tail');
    }

    // An award whose deadline we can state is more actionable than one we
    // cannot, all else equal.
    if (item.deadline_type !== 'unknown') {
      score += 1;
      reasons.push('deadline known');
    }

    scored.push({ item, score, reasons });
  }

  return scored
    .sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title))
    .slice(0, limit);
}
