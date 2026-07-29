import 'server-only';

import { getSupabase } from './supabase';
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
    deadline: describeDeadline(item.deadline_type, item.deadline_date, now),
    verified: verifiedAgo(item.last_verified_at, now),
    amount: amountLabel(item.amount_text),
    dot: dotClass(item.type),
  };
}

/**
 * Read approved funding items.
 *
 * The `status = 'approved'` filter is the review gate from §4.5 and is not
 * optional: pending and rejected extractions are unreviewed LLM output, and
 * the product's entire value is that a student can trust the deadline.
 * `stale` items are excluded from the public listing but never deleted.
 */
export async function getListing(now: Date = new Date()): Promise<ListingView> {
  const supabase = getSupabase();

  if (!supabase) {
    const data = sampleData(now);
    return present(data, now);
  }

  const { data, error } = await supabase
    .from('funding_items')
    .select('*, providers(name)')
    .eq('status', 'approved')
    .order('deadline_date', { ascending: true, nullsFirst: false });

  if (error) {
    // Fail loudly in the log, but do not fall back to sample data — silently
    // substituting invented awards for a failed query would present fiction
    // as fact. An empty listing is honest; fake data is not.
    console.error('[camfund] funding_items query failed:', error.message);
    return { items: [], providerCount: 0, lastRefreshed: null, isSample: false };
  }

  const items = (data ?? []).map((row: Record<string, unknown>) => {
    const providers = row.providers as { name?: string } | null;
    return { ...row, provider_name: providers?.name ?? 'Unknown provider' } as FundingItem;
  });

  const lastRefreshed = items.reduce<string | null>(
    (max, i) => (!max || i.last_verified_at > max ? i.last_verified_at : max),
    null,
  );

  return present(
    {
      items,
      providerCount: new Set(items.map((i) => i.provider_id)).size,
      lastRefreshedAt: lastRefreshed,
      isSample: false,
    },
    now,
  );
}

function present(data: FundingData, now: Date): ListingView {
  return {
    items: data.items.map((i) => toView(i, now)),
    providerCount: data.providerCount,
    lastRefreshed: data.lastRefreshedAt ? verifiedAgo(data.lastRefreshedAt, now).replace(/^Verified /, '') : null,
    isSample: data.isSample,
  };
}
