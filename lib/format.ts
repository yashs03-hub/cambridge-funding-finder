import type { DeadlineType, FundingItem } from './types';

/**
 * Deadline rendering. This module is the single place a deadline becomes
 * words, because it is the one thing the whole product is trusted for (§3).
 *
 * Two rules it exists to enforce:
 *   1. `unknown` says so explicitly — never an empty cell.
 *   2. A fixed date in the past renders CLOSED, never as an open award.
 *      The mockup had only hardcoded future dates and so never faced this;
 *      real scraped data goes stale between weekly refreshes, and "wrong
 *      deadline costs a student an application" is the highest-severity
 *      risk in §11.
 */

/** Visual state, mapped to the `.deadline.*` classes in globals.css. */
export type DeadlineState = 'fixed' | 'urgent' | 'rolling' | 'recurring' | 'unknown' | 'closed';

/** A fixed deadline this close is rendered in the loud accent. */
export const URGENT_WITHIN_DAYS = 21;

const MS_PER_DAY = 86_400_000;

/** Whole days from `from` to `to`, both floored to UTC midnight. */
export function daysBetween(from: Date, to: Date): number {
  const a = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const b = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.round((b - a) / MS_PER_DAY);
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
  });
}

export interface DeadlineView {
  state: DeadlineState;
  text: string;
}

export function describeDeadline(
  deadlineType: DeadlineType,
  deadlineDate: string | null,
  now: Date = new Date(),
  // Appended rather than inserted before `now` so that every existing call
  // site keeps its meaning; `now` is the parameter callers actually override.
  recurrence: string | null = null,
): DeadlineView {
  switch (deadlineType) {
    case 'rolling':
      return { state: 'rolling', text: 'Rolling — apply any time' };

    case 'annual_recurring': {
      // The source's own wording, because "annual" is usually a lie: the
      // first three colleges crawled recur termly, from 1 January, and on
      // 1 June respectively. A record that cannot say how it recurs has not
      // established that it recurs, so it degrades to `unknown` — the same
      // rule as a `fixed` deadline with no date, one field along.
      if (!recurrence) return { state: 'unknown', text: 'Deadline not stated on source page' };
      return { state: 'recurring', text: recurrence };
    }

    case 'unknown':
      // Explicit sentence, not a blank. See §5.
      return { state: 'unknown', text: 'Deadline not stated on source page' };

    case 'fixed': {
      // A fixed type with no date is a data fault, not an open award. Degrade
      // to `unknown` rather than render something a student could act on.
      if (!deadlineDate) return { state: 'unknown', text: 'Deadline not stated on source page' };

      const days = daysBetween(now, new Date(deadlineDate));
      if (days < 0) return { state: 'closed', text: `Closed ${formatDate(deadlineDate)}` };
      if (days === 0) return { state: 'urgent', text: `Closes today · ${formatDate(deadlineDate)}` };
      if (days <= URGENT_WITHIN_DAYS) {
        return {
          state: 'urgent',
          text: `Closes ${formatDate(deadlineDate)} · ${days} day${days === 1 ? '' : 's'}`,
        };
      }
      return { state: 'fixed', text: `Closes ${formatDate(deadlineDate)}` };
    }
  }
}

/** "Verified 3 days ago" — the trust mechanism on every card (§7). */
export function verifiedAgo(lastVerifiedAt: string, now: Date = new Date()): string {
  const days = daysBetween(new Date(lastVerifiedAt), now);
  if (days <= 0) return 'Verified today';
  if (days === 1) return 'Verified yesterday';
  return `Verified ${days} days ago`;
}

/** Category dot colour. Prizes are green; everything else is the college purple. */
export function dotClass(type: FundingItem['type']): 'prize' | 'college' {
  return type === 'prize' ? 'prize' : 'college';
}

export function amountLabel(amountText: string | null): string {
  // Absent is stated, never blank — same principle as `unknown` deadlines.
  return amountText?.trim() ? amountText : 'Not stated';
}
