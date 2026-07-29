import 'server-only';

import fundingData from '@/data/funding.json';
import { validateDataset, type Dataset } from './dataset';
import { sampleData } from './sample-data';
import { amountLabel, describeDeadline, dotClass, verifiedAgo, type DeadlineView } from './format';
import type { FundingData, FundingItem } from './types';

/**
 * The view model handed to client components.
 *
 * Deadline text and "verified N days ago" are resolved HERE, on the server,
 * rather than in the client component that renders them. Both depend on the
 * current time, so computing them during client render would let the server
 * HTML and the first client render disagree across a midnight boundary and
 * produce a hydration mismatch. One clock, one answer.
 */
export interface FundingItemView {
  item: FundingItem;
  deadline: DeadlineView;
  verified: string;
  amount: string;
  dot: 'college' | 'prize';
}

export interface ListingView {
  items: FundingItemView[];
  providerCount: number;
  lastRefreshed: string | null;
  isSample: boolean;
}

function toView(item: FundingItem, now: Date): FundingItemView {
  return {
    item,
    deadline: describeDeadline(item.deadline_type, item.deadline_date, now, item.deadline_recurrence),
    verified: verifiedAgo(item.last_verified_at, now),
    amount: amountLabel(item.amount_text),
    dot: dotClass(item.type),
  };
}

/**
 * The dataset is imported, so it is validated once at module load rather than
 * per request. A malformed file fails the build — which, since the file only
 * ever changes via the scraper's pull request, means it fails CI on the PR
 * that introduced it rather than in front of a student.
 */
const dataset = fundingData as unknown as Dataset;

const datasetErrors = validateDataset(dataset);
if (datasetErrors.length > 0) {
  throw new Error(
    `data/funding.json is invalid:\n${datasetErrors.map((e) => `  · ${e}`).join('\n')}`,
  );
}

/**
 * True when the site is serving invented awards.
 *
 * Read from the dataset's own `status` field, not derived from whether it
 * happens to be empty. A live dataset that a scraper bug emptied must render
 * an honest empty listing, never revert to fabricated awards.
 */
export function isSampleMode(): boolean {
  return dataset.status === 'placeholder';
}

export async function getListing(now: Date = new Date()): Promise<ListingView> {
  return present(isSampleMode() ? sampleData(now) : liveData(), now);
}

function liveData(): FundingData {
  const items = dataset.items;
  const lastVerified = items.reduce<string | null>(
    (max, i) => (!max || i.last_verified_at > max ? i.last_verified_at : max),
    null,
  );

  return {
    items,
    providerCount: new Set(items.map((i) => i.provider_id)).size,
    lastRefreshedAt: dataset.generated_at ?? lastVerified,
    isSample: false,
  };
}

function present(data: FundingData, now: Date): ListingView {
  return {
    items: data.items.map((i) => toView(i, now)),
    providerCount: data.providerCount,
    lastRefreshed: data.lastRefreshedAt
      ? verifiedAgo(data.lastRefreshedAt, now).replace(/^Verified /, '')
      : null,
    isSample: data.isSample,
  };
}
