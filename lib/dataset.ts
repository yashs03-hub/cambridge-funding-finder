import type { FundingItem } from './types';

/**
 * The dataset is a committed JSON file, not a database.
 *
 * Why: the refresh semantics in spec §4.6 — unchanged bumps a timestamp,
 * changed goes back to `pending` WITH A DIFF, disappeared is marked stale and
 * never deleted — describe git. And the §4.5 review queue (approve, edit or
 * reject) is a pull request. Running this on Postgres means building a review
 * UI, an auth layer for it, and a diff renderer to reproduce what code review
 * already does.
 *
 * It also removes every secret from the project: there is no anon key to leak,
 * and the review gate stops being an RLS policy someone must remember to apply
 * and becomes a property of the deployed artifact — unapproved records are not
 * in the file at all.
 */

/**
 * `placeholder` — no scrape has run. The site serves invented sample awards
 *   behind the sample-data banner so the design is reviewable.
 * `live` — the scraper has produced real reviewed records. Sample data is
 *   NEVER served in this state, even if `items` is empty.
 *
 * That asymmetry is the point. A scraper bug that empties the dataset must
 * produce an honest empty listing, not a silent reversion to fabricated
 * awards. An explicit field makes the two states impossible to conflate;
 * deriving the mode from `items.length` would not.
 */
export type DatasetStatus = 'placeholder' | 'live';

export interface Dataset {
  status: DatasetStatus;
  /** ISO timestamp of the scrape run that produced this file. */
  generated_at: string | null;
  /** Approved records only. Pending and rejected never reach this file. */
  items: FundingItem[];
}

export const DEADLINE_TYPES = ['fixed', 'rolling', 'annual_recurring', 'unknown'] as const;
export const FUNDING_TYPES = ['travel', 'hardship', 'grant', 'prize', 'bursary', 'scholarship'] as const;

/**
 * Validate a dataset, returning a list of human-readable problems.
 *
 * These were CHECK constraints in the Postgres schema. Dropping the database
 * must not drop the invariants — they are the ones that keep a half-extracted
 * record from rendering as an award a student could act on, which §11 ranks as
 * the highest-severity failure. Enforced in CI so a bad scraper commit fails
 * the PR instead of shipping.
 */
export function validateDataset(data: unknown): string[] {
  const errors: string[] = [];
  const push = (msg: string) => errors.push(msg);

  if (typeof data !== 'object' || data === null) return ['dataset is not an object'];
  const d = data as Record<string, unknown>;

  if (d.status !== 'placeholder' && d.status !== 'live') {
    push(`status must be "placeholder" or "live", got ${JSON.stringify(d.status)}`);
  }
  if (d.generated_at !== null && typeof d.generated_at !== 'string') {
    push('generated_at must be an ISO string or null');
  }
  if (!Array.isArray(d.items)) return [...errors, 'items must be an array'];

  const seenIds = new Set<string>();

  d.items.forEach((raw, i) => {
    const at = (msg: string) => push(`items[${i}]: ${msg}`);
    if (typeof raw !== 'object' || raw === null) return at('not an object');
    const it = raw as Record<string, unknown>;

    for (const field of ['id', 'provider_id', 'provider_name', 'title', 'source_url']) {
      if (typeof it[field] !== 'string' || !(it[field] as string).trim()) at(`${field} is required`);
    }

    if (typeof it.id === 'string') {
      if (seenIds.has(it.id)) at(`duplicate id "${it.id}"`);
      seenIds.add(it.id);
    }

    if (!FUNDING_TYPES.includes(it.type as never)) at(`type ${JSON.stringify(it.type)} is not a known funding type`);
    if (!DEADLINE_TYPES.includes(it.deadline_type as never)) {
      at(`deadline_type ${JSON.stringify(it.deadline_type)} is not a known deadline type`);
    }
    if (!Array.isArray(it.eligibility_tags)) at('eligibility_tags must be an array');

    // Was: constraint fixed_deadline_has_date.
    // A `fixed` type with no date renders as an open award with a blank date.
    if (it.deadline_type === 'fixed' && !it.deadline_date) {
      at('deadline_type is "fixed" but deadline_date is missing');
    }
    // Was: constraint dated_deadline_has_evidence.
    // An extraction that cannot quote a source sentence for its deadline must
    // record `unknown` rather than guess (§4.4).
    if (it.deadline_type === 'fixed' && !it.evidence_quote) {
      at('deadline_type is "fixed" but evidence_quote is missing — record "unknown" instead of guessing');
    }
    if (it.deadline_date != null && !/^\d{4}-\d{2}-\d{2}$/.test(String(it.deadline_date))) {
      at(`deadline_date ${JSON.stringify(it.deadline_date)} is not YYYY-MM-DD`);
    }

    // Third invariant, added after the first real crawl. `annual_recurring`
    // must say how it recurs, in the source's words. The enum name promises
    // "annual" and the data almost never is: of the ten recurring awards
    // found at the first three colleges, three were termly and four ran from
    // 1 January. A record that cannot state its cycle has not established one.
    if (it.deadline_type === 'annual_recurring') {
      if (typeof it.deadline_recurrence !== 'string' || !it.deadline_recurrence.trim()) {
        at('deadline_type is "annual_recurring" but deadline_recurrence is missing — quote the cycle or record "unknown"');
      }
      if (!it.evidence_quote) {
        at('deadline_type is "annual_recurring" but evidence_quote is missing — a recurrence claim is a deadline claim');
      }
    } else if (it.deadline_recurrence != null) {
      at(`deadline_recurrence is set but deadline_type is ${JSON.stringify(it.deadline_type)}`);
    }

    // The file holds the public listing, so anything in it is already approved.
    if (it.status !== undefined && it.status !== 'approved') {
      at(`status is ${JSON.stringify(it.status)} — only approved records belong in this file`);
    }

    for (const field of ['last_scraped_at', 'last_verified_at']) {
      if (typeof it[field] !== 'string') at(`${field} is required`);
    }

    if (typeof it.source_url === 'string' && !/^https?:\/\//.test(it.source_url)) {
      at('source_url must be an absolute http(s) URL — it is the trust link on every card');
    }
  });

  return errors;
}
