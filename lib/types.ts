/**
 * Domain types — the data model from spec §5.
 *
 * These are the source of truth. `lib/dataset.ts` validates the committed
 * dataset against them at build time; `docs/reference-schema.sql` is the
 * unapplied relational form, kept only in case the project ever moves back
 * to a database (see docs/data-pipeline.md).
 */

export type ProviderKind = 'college' | 'department';

export interface Provider {
  id: string;
  name: string;
  kind: ProviderKind;
  url: string;
  funding_index_url: string | null;
}

export type FundingType = 'travel' | 'hardship' | 'grant' | 'prize' | 'bursary' | 'scholarship';

/**
 * `unknown` is a first-class value, NOT a null that renders blank (§5).
 * "We don't know when this closes" and "this has no deadline" are different
 * facts and must never look the same to a student.
 */
export type DeadlineType = 'fixed' | 'rolling' | 'annual_recurring' | 'unknown';

export type ItemStatus = 'pending' | 'approved' | 'rejected' | 'stale';

export interface FundingItem {
  id: string;
  provider_id: string;
  provider_name: string;
  title: string;
  type: FundingType;
  description: string;
  eligibility_text: string | null;
  eligibility_tags: string[];
  amount_text: string | null;
  deadline_type: DeadlineType;
  /** ISO date. Non-null only when deadline_type === 'fixed'. */
  deadline_date: string | null;
  /**
   * How a recurring award recurs, in the source's own words. Required when
   * deadline_type === 'annual_recurring', null otherwise.
   *
   * The enum says "annual", but real college funding mostly is not. The first
   * three colleges crawled produced termly book grants, termly equipment
   * grants, sizarships running from 1 January, and a fund closing on 1 June
   * each year — four different cycles, all of which a bare "Recurs annually"
   * label would have described wrongly. Rather than widen the enum (and lose
   * the specific date on the ones that state one), the record carries the
   * source's phrasing and the UI shows that instead of a generic string.
   */
  deadline_recurrence: string | null;
  application_method: string | null;
  source_url: string;
  /**
   * The verbatim source sentence backing the deadline and amount. The
   * highest-leverage field in the schema: it turns "do I trust this model?"
   * — unanswerable — into "does this sentence say what the record says?",
   * answerable in two seconds. An extraction that cannot produce one for a
   * deadline must set deadline_type = 'unknown' rather than guess (§4.4).
   */
  evidence_quote: string | null;
  status: ItemStatus;
  confidence: number | null;
  last_scraped_at: string;
  /**
   * Distinct from last_scraped_at. Scraped means we fetched it; verified
   * means a human, or an unchanged re-scrape, confirmed it (§5).
   */
  last_verified_at: string;
}

/** What the assistant returns per recommendation (§6). */
export interface Recommendation {
  item: FundingItem;
  rank: number;
  /** Why this matches the student's stated need. */
  why: string;
  /**
   * Required, never optional. Eligibility at Cambridge is narrow and
   * college-bound; a shortlist that only argues FOR each item is actively
   * misleading (§6 guardrails).
   */
  caveat: string;
}

/**
 * Every read carries its own provenance. `isSample` is a property of the
 * data SOURCE, not a flag in JSX someone can delete — the banner is driven
 * from here, so sample awards can never render as if they were real.
 */
export interface FundingData {
  items: FundingItem[];
  providerCount: number;
  lastRefreshedAt: string | null;
  isSample: boolean;
}
